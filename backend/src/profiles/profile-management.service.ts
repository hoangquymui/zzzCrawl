import { Injectable, Logger, Inject, forwardRef, OnModuleInit, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../database/database.service';
import {
  UserProfileItem,
  ProfileCrawlProgress,
  ProfileManagementState,
} from './interfaces/profile-management.interface';
import { VideosGateway } from './videos.gateway';
import { CookieService } from './cookie.service';
import { normalizeFacebookUrl } from './utils/url-cleaner';

@Injectable()
export class ProfileManagementService implements OnModuleInit {
  private readonly logger = new Logger(ProfileManagementService.name);
  private readonly storageFilePath = path.join(process.cwd(), 'backend', 'profiles_data.json');
  private readonly fallbackStoragePath = path.join(process.cwd(), 'profiles_data.json');

  private readonly cookieFilePath = path.join(process.cwd(), 'backend', 'cookies.json');
  private readonly fallbackCookiePath = path.join(process.cwd(), 'cookies.json');
  private readonly testUserCookiePath = path.join(
    process.cwd(),
    '..',
    'test_video_from_user',
    'cookies.json'
  );

  private profiles: UserProfileItem[] = [];
  private state: ProfileManagementState = {
    status: 'IDLE',
    logs: ['[HỆ THỐNG] Sẵn sàng quét thông tin Profile cá nhân.'],
    profilesCount: 0,
    profiles: [],
    progress: null,
  };

  private currentCancelFlag = false;
  private isScanning = false;

  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => VideosGateway))
    private readonly videosGateway: VideosGateway,
    private readonly cookieService: CookieService
  ) {
    this.loadFromDatabase();
  }

  public onModuleInit(): void {
    this.loadFromDatabase();
  }

  private getEffectiveStoragePath(): string {
    const baseDir = process.cwd().endsWith('backend')
      ? process.cwd()
      : fs.existsSync(path.join(process.cwd(), 'backend'))
      ? path.join(process.cwd(), 'backend')
      : process.cwd();

    const dataPath = path.join(baseDir, 'data', 'profiles_data.json');
    if (fs.existsSync(dataPath)) return dataPath;

    const legacyPath = path.join(baseDir, 'profiles_data.json');
    if (fs.existsSync(legacyPath)) return legacyPath;

    const dataDir = path.join(baseDir, 'data');
    if (!fs.existsSync(dataDir)) {
      try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
    }
    return dataPath;
  }

  private getEffectiveCookiePath(): string {
    if (this.cookieService) {
      return this.cookieService.getEffectiveCookiePath();
    }
    const baseDir = process.cwd().endsWith('backend')
      ? process.cwd()
      : fs.existsSync(path.join(process.cwd(), 'backend'))
      ? path.join(process.cwd(), 'backend')
      : process.cwd();

    const dataPath = path.join(baseDir, 'data', 'cookies.json');
    if (fs.existsSync(dataPath)) return dataPath;

    const legacyPath = path.join(baseDir, 'cookies.json');
    if (fs.existsSync(legacyPath)) return legacyPath;

    return dataPath;
  }

  private loadFromDatabase(): void {
    try {
      this.profiles = this.db.getAllProfiles();
      this.state.profiles = this.profiles;
      this.state.profilesCount = this.profiles.length;
      this.logger.log(`[Storage] Đã nạp ${this.profiles.length} profiles từ SQLite.`);
    } catch (err: any) {
      this.logger.error(`[Storage] Lỗi nạp profiles từ SQLite: ${err?.message}`);
      const p = this.getEffectiveStoragePath();
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf8').trim();
          if (raw) {
            this.profiles = JSON.parse(raw);
            this.state.profiles = this.profiles;
            this.state.profilesCount = this.profiles.length;
          }
        } catch {}
      }
    }
  }

  private saveToDatabase(): void {
    try {
      this.db.saveAllProfiles(this.profiles);
      // Ghi backup nhẹ vào profiles_data.json
      const p = this.getEffectiveStoragePath();
      try {
        fs.writeFileSync(p, JSON.stringify(this.profiles, null, 2), 'utf8');
      } catch {}
    } catch (err: any) {
      this.logger.error(`[Storage] Lỗi ghi profiles vào SQLite: ${err?.message}`);
    }
  }

  public loadCookies(): any[] {
    if (this.cookieService) {
      return this.cookieService.loadCookies();
    }
    const filePath = this.getEffectiveCookiePath();
    if (!fs.existsSync(filePath)) return [];

    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw || raw === '[]' || raw === '{}') return [];

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter((c) => c && c.name && c.value)
          .map((c) => {
            let domain = c.domain || '.facebook.com';
            if (!domain.includes('facebook.com')) {
              domain = '.facebook.com';
            }
            let sameSite: 'Strict' | 'Lax' | 'None' | undefined = undefined;
            if (c.sameSite) {
              const s = String(c.sameSite).toLowerCase();
              if (s === 'lax') sameSite = 'Lax';
              else if (s === 'strict') sameSite = 'Strict';
              else if (s === 'none' || s === 'no_restriction') sameSite = 'None';
            }
            const item: any = {
              name: String(c.name).trim(),
              value: String(c.value).trim(),
              domain,
              path: c.path || '/',
            };
            if (sameSite) {
              item.sameSite = sameSite;
            }
            if (typeof c.httpOnly === 'boolean') item.httpOnly = c.httpOnly;
            if (typeof c.secure === 'boolean') item.secure = c.secure;
            if (typeof c.expires === 'number' && c.expires > 0) {
              item.expires = Math.floor(c.expires);
            }
            return item;
          });
      }
    } catch {
      // Tiếp tục fallback sang chuỗi raw
    }

    return raw
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const eqIdx = p.indexOf('=');
        if (eqIdx === -1) return null;
        return {
          name: p.slice(0, eqIdx).trim(),
          value: p.slice(eqIdx + 1).trim(),
          domain: '.facebook.com',
          path: '/',
        };
      })
      .filter(Boolean);
  }

  public getEffectiveAvatarsDir(): string {
    const baseDir = process.cwd().endsWith('backend')
      ? process.cwd()
      : fs.existsSync(path.join(process.cwd(), 'backend'))
      ? path.join(process.cwd(), 'backend')
      : process.cwd();

    const dataAvatars = path.join(baseDir, 'data', 'avatars');
    const legacyAvatars = path.join(baseDir, 'avatars');
    let dir = fs.existsSync(dataAvatars) ? dataAvatars : fs.existsSync(legacyAvatars) ? legacyAvatars : dataAvatars;

    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }
    return dir;
  }

  public getCookieString(): string {
    if (this.cookieService) {
      return this.cookieService.getCookieString();
    }
    const cookies = this.loadCookies();
    if (!cookies || cookies.length === 0) return '';
    const essential = ['c_user', 'xs', 'datr', 'fr', 'sb'];
    return cookies
      .filter((c) => c && c.name && c.value && (essential.includes(c.name) || cookies.length <= 15))
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
  }

  public async downloadAvatar(url: string, uid: string, isCrawler = false): Promise<boolean> {
    const safeUid = String(uid).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeUid) return false;

    const avatarsDir = this.getEffectiveAvatarsDir();
    const dest = path.join(avatarsDir, `${safeUid}.jpg`);

    try {
      const headers: Record<string, string> = {};
      if (isCrawler) {
        headers['User-Agent'] = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
      } else {
        headers['User-Agent'] =
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      }

      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000), redirect: 'follow' });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.startsWith('image/')) {
        const buffer = Buffer.from(await res.arrayBuffer());
        // Bỏ qua ảnh placeholder gif (thường < 2500 bytes)
        if (contentType.includes('gif') && buffer.length < 2500) {
          return false;
        }
        if (buffer.length > 1200) {
          fs.writeFileSync(dest, buffer);
          return true;
        }
      }
    } catch (err: any) {
      this.logger.warn(`Lỗi download avatar cho UID ${safeUid}: ${err?.message}`);
    }
    return false;
  }

  public async getAvatarFilePath(uid: string, slug?: string): Promise<string | null> {
    const safeUid = String(uid).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeUid) return null;

    const avatarsDir = this.getEffectiveAvatarsDir();
    const dest = path.join(avatarsDir, `${safeUid}.jpg`);

    if (fs.existsSync(dest) && fs.statSync(dest).size > 1200) {
      return dest;
    }

    // 1. Thử tải từ Facebook Lookaside qua externalhit bot (nếu là ID số)
    if (/^\d+$/.test(safeUid)) {
      const lookasideUrl = `https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=${safeUid}`;
      const ok = await this.downloadAvatar(lookasideUrl, safeUid, true);
      if (ok && fs.existsSync(dest) && fs.statSync(dest).size > 1200) {
        return dest;
      }
    }

    // 2. Thử tải từ Graph API bằng UID (số)
    if (!isNaN(Number(safeUid))) {
      const graphUrl = `https://graph.facebook.com/${safeUid}/picture?type=large`;
      const okGraph = await this.downloadAvatar(graphUrl, safeUid, false);
      if (okGraph && fs.existsSync(dest) && fs.statSync(dest).size > 1200) {
        return dest;
      }
    }

    // 3. Thử tải từ Graph API bằng slug (tên chữ như anttchanmaylangco)
    if (slug && typeof slug === 'string' && slug.length > 2 && !/^\d+$/.test(slug)) {
      const cleanSlug = slug.replace(/[^a-zA-Z0-9._-]/g, '');
      const graphSlugUrl = `https://graph.facebook.com/${cleanSlug}/picture?type=large`;
      const okSlug = await this.downloadAvatar(graphSlugUrl, safeUid, false);
      if (okSlug && fs.existsSync(dest) && fs.statSync(dest).size > 1200) {
        return dest;
      }
    }

    // 4. Thử tải avatar từ TikTok nếu là profile TikTok
    if (!/^\d+$/.test(safeUid) && (slug?.includes('tiktok') || safeUid.length >= 3)) {
      try {
        const ttUrl = `https://www.tiktok.com/@${safeUid.replace(/^@/, '')}`;
        const ttRes = await fetch(ttUrl, {
          headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' },
          signal: AbortSignal.timeout(8000),
        });
        if (ttRes.ok) {
          const ttHtml = await ttRes.text();
          const mOg = ttHtml.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i);
          if (mOg && mOg[1]) {
            const okTt = await this.downloadAvatar(this.unescapeHtml(mOg[1]), safeUid, false);
            if (okTt && fs.existsSync(dest) && fs.statSync(dest).size > 1200) {
              return dest;
            }
          }
        }
      } catch {}
    }

    return null;
  }

  public getState(): ProfileManagementState {
    return {
      ...this.state,
      profilesCount: this.profiles.length,
      profiles: this.profiles,
    };
  }

  public listProfiles(): UserProfileItem[] {
    return this.profiles;
  }

  public deleteProfile(id: string): boolean {
    const idx = this.profiles.findIndex((p) => p.id === id);
    if (idx !== -1) {
      this.profiles.splice(idx, 1);
      this.db.deleteProfile(id);
      this.saveToDatabase();
      this.state.profiles = this.profiles;
      this.state.profilesCount = this.profiles.length;
      this.emitLog(`[XÓA] Đã xóa profile ID: ${id}`);
      return true;
    }
    return false;
  }

  public clearProfiles(): boolean {
    this.profiles = [];
    this.db.saveAllProfiles([]);
    this.saveToDatabase();
    this.state.profiles = [];
    this.state.profilesCount = 0;
    this.emitLog(`[XÓA TẤT CẢ] Đã làm trống danh sách profile.`);
    return true;
  }

  public stopCrawl(): void {
    if (this.isScanning) {
      this.currentCancelFlag = true;
      this.emitLog(`[HỆ THỐNG] Nhận yêu cầu dừng quét profile từ người dùng...`);
      this.state.status = 'STOPPED';
      this.videosGateway.emitProfileMgmtStatus('STOPPED');
    }
  }

  private emitLog(message: string): void {
    this.logger.log(message);
    this.state.logs.push(message);
    if (this.state.logs.length > 500) {
      this.state.logs = this.state.logs.slice(-500);
    }
    this.videosGateway.emitProfileMgmtLog(message);
  }

  private emitProgress(prog: ProfileCrawlProgress): void {
    this.state.progress = prog;
    this.videosGateway.emitProfileMgmtProgress(prog);
  }

  private extractNumericIdFromUrl(rawUrl: string): string | undefined {
    try {
      const u = new URL(rawUrl);
      const idParam = u.searchParams.get('id');
      if (idParam && /^\d+$/.test(idParam)) return idParam;

      // Hỗ trợ link dạng: /people/<Tên-Trang>/<ID_SỐ>/
      const mPeople = u.pathname.match(/\/people\/[^/]+\/(\d+)/i);
      if (mPeople) return mPeople[1];

      // Hỗ trợ link dạng: /p/<Tên-Trang>-<ID_SỐ>/
      const mP = u.pathname.match(/\/p\/[^-]+-(\d+)/i);
      if (mP) return mP[1];

      const pathParts = u.pathname.split('/').filter(Boolean);
      for (const part of pathParts) {
        if (/^\d{5,}$/.test(part)) {
          return part;
        }
      }
      if (pathParts.length > 0 && /^\d+$/.test(pathParts[0])) {
        return pathParts[0];
      }
    } catch {
      // url parse error
    }
    return undefined;
  }

  private extractSlugFromUrl(rawUrl: string): string | undefined {
    try {
      const u = new URL(rawUrl);
      const mSlug = u.pathname.match(/^\/([a-zA-Z0-9._-]+)(?:\/|$)/);
      if (mSlug) {
        const slug = mSlug[1];
        const ignored = [
          'watch', 'reel', 'reels', 'videos', 'story', 'share', 'groups',
          'people', 'profile.php', 'p', 'permalink.php', 'home.php', 'login', 'checkpoint'
        ];
        if (!ignored.includes(slug.toLowerCase()) && !/^\d+$/.test(slug)) {
          return slug;
        }
      }
    } catch {}
    return undefined;
  }

  private isInvalidName(name?: string | null): boolean {
    if (!name) return true;
    const s = name.trim();
    if (s.length < 2 || /^Facebook$/i.test(s)) return true;
    const patterns = [
      /this browser is not supported/i,
      /trình duyệt (này )?không được hỗ trợ/i,
      /browser (is )?not supported/i,
      /unsupported browser/i,
      /facebook is better on the app/i,
      /use facebook app/i,
      /tap to use a supported browser/i,
      /log in/i,
      /đăng nhập/i,
      /notifications/i,
      /thông báo/i,
      /friend requests/i,
      /lời mời kết bạn/i,
      /page not found/i,
      /trang không tìm thấy/i,
      /nội dung này hiện không khả dụng/i,
      /this content isn't available/i,
      /something went wrong/i,
      /đã có lỗi xảy ra/i,
      /không thể truy cập/i,
      /người dùng facebook/i,
      /security check/i,
      /kiểm tra bảo mật/i,
      /checkpoint/i,
    ];
    return patterns.some((p) => p.test(s));
  }

  public async startCrawl(urls: string[]): Promise<{ started: boolean; count: number }> {
    if (this.isScanning) {
      return { started: false, count: 0 };
    }

    const cleanUrls = Array.from(
      new Set(
        urls
          .map((u) => normalizeFacebookUrl(u || '').trim())
          .filter((u) => u.startsWith('http://') || u.startsWith('https://'))
      )
    );

    if (cleanUrls.length === 0) {
      this.emitLog(`[CẢNH BÁO] Không có link profile Facebook hợp lệ để quét.`);
      return { started: false, count: 0 };
    }

    try {
      await this.cookieService.validateCookieForCrawl();
    } catch (err: any) {
      this.emitLog(`[LỖI] Cookie hết hạn! Vui lòng cập nhật cookie mới.`);
      throw new BadRequestException('Cookie hết hạn');
    }

    this.isScanning = true;
    this.currentCancelFlag = false;
    this.state.status = 'SCANNING';
    this.videosGateway.emitProfileMgmtStatus('SCANNING');

    // Chạy ngầm trong background
    this.executeCrawl(cleanUrls).catch((err) => {
      this.logger.error(`Lỗi trong tiến trình quét profile: ${err?.message}`);
      this.emitLog(`[LỖI TIẾN TRÌNH] ${err?.message}`);
      this.state.status = 'ERROR';
      this.videosGateway.emitProfileMgmtStatus('ERROR');
      this.isScanning = false;
    });

    return { started: true, count: cleanUrls.length };
  }

  private unescapeHtml(str?: string | null): string {
    if (!str) return '';
    return str
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');
  }

  private cleanProfileName(raw?: string | null): string {
    if (!raw) return '';
    let s = this.unescapeHtml(raw).trim();
    if (s.includes('(@')) {
      s = s.split('(@')[0];
    }
    if (s.includes('•')) {
      s = s.split('•')[0];
    }
    s = s.replace(/\s*\|.*$/, '').trim();
    s = s.replace(/\s*-\s*(thành phố|tỉnh|tp\.?|huyện|thị xã|tt\.?|xã|quận).*$/i, '').trim();
    s = s.replace(/^Trang cá nhân của\s+/i, '').trim();
    return s;
  }

  private async crawlSingleProfileHttp(profileUrl: string): Promise<UserProfileItem> {
    profileUrl = normalizeFacebookUrl(profileUrl);
    const urlNumericId = this.extractNumericIdFromUrl(profileUrl);
    const urlSlug = this.extractSlugFromUrl(profileUrl);
    let uid = urlNumericId;

    const cookieStr = this.getCookieString();
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
    };
    if (cookieStr) {
      headers['Cookie'] = cookieStr;
    }

    let html = '';
    try {
      const res = await fetch(profileUrl, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
      html = await res.text();
      
      // Update profileUrl to Canonical URL if available to resolve numeric IDs to vanity URLs
      const mCanonical = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
      if (mCanonical && mCanonical[1]) {
         const cleanCanonical = this.unescapeHtml(mCanonical[1]).trim();
         if (cleanCanonical.includes('facebook.com')) {
             profileUrl = normalizeFacebookUrl(cleanCanonical);
         }
      } else {
         const mOgUrl = html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i);
         if (mOgUrl && mOgUrl[1]) {
             const cleanCanonical = this.unescapeHtml(mOgUrl[1]).trim();
             if (cleanCanonical.includes('facebook.com')) {
                 profileUrl = normalizeFacebookUrl(cleanCanonical);
             }
         }
      }
    } catch (fetchErr: any) {
      this.logger.warn(`Fetch HTTP không thành công cho ${profileUrl}: ${fetchErr?.message}`);
    }

    // 1. Trích xuất UID thật từ HTML (nếu chưa có uid số từ URL)
    if (html && (!uid || isNaN(Number(uid)))) {
      const mAndroid = html.match(/fb:\/\/profile\/(\d+)/i);
      if (mAndroid) uid = mAndroid[1];
      if (!uid || isNaN(Number(uid))) {
        const mEntity = html.match(/"entity_id":"(\d+)"/i);
        if (mEntity) uid = mEntity[1];
      }
      if (!uid || isNaN(Number(uid))) {
        const mUser = html.match(/"userID":"(\d+)"/i);
        if (mUser) uid = mUser[1];
      }
      if (!uid || isNaN(Number(uid))) {
        const mAuthor = html.match(/"author_id":"(\d+)"/i);
        if (mAuthor) uid = mAuthor[1];
      }
      if (!uid || isNaN(Number(uid))) {
        const mActor = html.match(/"actor_id":"(\d+)"/i);
        if (mActor) uid = mActor[1];
      }
    }

    // 2. Trích xuất Tên (Name)
    let name = '';
    if (html) {
      const mOgTitle =
        html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i) ||
        html.match(/<meta[^>]*name=["']title["'][^>]*content=["']([^"']*)["']/i);
      if (mOgTitle && mOgTitle[1]) {
        const candidate = this.cleanProfileName(mOgTitle[1]);
        if (!this.isInvalidName(candidate)) {
          name = candidate;
        }
      }

      if (!name) {
        const mTitle = html.match(/<title>([^<]*)<\/title>/i);
        if (mTitle && mTitle[1]) {
          const candidate = this.cleanProfileName(mTitle[1]);
          if (!this.isInvalidName(candidate)) {
            name = candidate;
          }
        }
      }
    }

    // BẮT BUỘC: Profile Facebook hợp lệ phải có Tên thật và UID số từ Facebook
    if (!name || this.isInvalidName(name) || !uid) {
      throw new Error('Trang cá nhân không tồn tại hoặc link không hợp lệ');
    }

    // 3. Trích xuất Avatar thật (Dùng Lookaside / Graph API / Direct CDN)
    let avatarUrl = '';
    let hasAvatar = false;
    const effectiveSlug = urlSlug || this.extractSlugFromUrl(profileUrl);

    // Thử tải bằng danh sách candidate IDs (urlNumericId trước, sau đó uid)
    const candidateIds = Array.from(new Set([urlNumericId, uid])).filter(Boolean) as string[];
    for (const candId of candidateIds) {
      if (!hasAvatar) {
        const dest = await this.getAvatarFilePath(candId, effectiveSlug);
        if (dest) {
          hasAvatar = true;
          avatarUrl = `/api/profile-management/avatar/${candId}`;
          uid = candId;
          break;
        }
      }
    }

    if (!hasAvatar && effectiveSlug) {
      const dest = await this.getAvatarFilePath(effectiveSlug, effectiveSlug);
      if (dest) {
        hasAvatar = true;
        avatarUrl = `/api/profile-management/avatar/${effectiveSlug}`;
      }
    }

    // Fallback: Tìm link CDN trực tiếp trong og:image nếu Lookaside/Graph chưa có
    if (!hasAvatar && html) {
      const mOgImage =
        html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i) ||
        html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']*)["']/i);
      const ogImageUrl = mOgImage ? this.unescapeHtml(mOgImage[1]).trim() : '';
      if (ogImageUrl && ogImageUrl.includes('fbcdn.net')) {
        const ok = await this.downloadAvatar(ogImageUrl, uid || 'avatar', false);
        if (ok) {
          hasAvatar = true;
          avatarUrl = `/api/profile-management/avatar/${uid || 'avatar'}`;
        }
      }
    }

    // 4. Bio (Mô tả) nếu có
    let bio: string | undefined = undefined;
    if (html) {
      const mDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i);
      if (mDesc && mDesc[1]) {
        const d = this.unescapeHtml(mDesc[1]).trim();
        if (d && !d.includes('Tham gia Facebook để kết nối') && !d.includes('Facebook trao cho mọi người quyền')) {
          bio = d;
        }
      }
    }

    const itemId = 'prof_' + (uid || Date.now()) + '_' + Math.random().toString(36).substring(2, 6);

    return {
      id: itemId,
      profileUrl,
      uid: uid || undefined,
      name,
      avatarUrl: avatarUrl || undefined,
      bio,
      status: 'SUCCESS',
      crawledAt: new Date().toISOString(),
    };
  }

  private async executeCrawl(urls: string[]): Promise<void> {
    const total = urls.length;
    let successCount = 0;
    let skippedCount = 0;

    // Số luồng song song (4-8), chỉnh bằng biến môi trường PROFILE_CRAWL_CONCURRENCY
    const concurrency = Math.max(
      1,
      Math.min(8, Number(process.env.PROFILE_CRAWL_CONCURRENCY) || 6)
    );

    this.emitLog(`========================================`);
    this.emitLog(
      `Bắt đầu cào dữ liệu ${total} Profile Facebook (HTTPS Request, ${Math.min(concurrency, total)} luồng song song)`
    );
    this.emitLog(`========================================`);

    try {
      let processedCount = 0;
      const queue = [...urls];

      const processProfile = async (profileUrl: string) => {
        processedCount++;
        const currentIdx = processedCount;

        this.emitProgress({
          current: currentIdx,
          total,
          currentUrl: profileUrl,
          status: 'RUNNING',
          message: `Đang quét profile [${currentIdx}/${total}]: ${profileUrl}`,
        });

        this.emitLog(`>>> [Profile ${currentIdx}/${total}] Gửi HTTPS Request: ${profileUrl}`);

        try {
          const profileItem = await this.crawlSingleProfileHttp(profileUrl);

          // Cập nhật hoặc thêm vào danh sách
          const existIdx = this.profiles.findIndex(
            (p) => p.profileUrl === profileItem.profileUrl || (profileItem.uid && p.uid === profileItem.uid)
          );

          if (existIdx !== -1) {
            this.profiles[existIdx] = profileItem;
          } else {
            this.profiles.unshift(profileItem);
          }

          this.db.upsertProfile(profileItem);
          this.saveToDatabase();
          this.state.profiles = this.profiles;
          this.state.profilesCount = this.profiles.length;

          this.videosGateway.emitProfileMgmtItem(profileItem);
          successCount++;

          this.emitLog(
            `✔ Quét thành công: "${profileItem.name}" | UID: ${profileItem.uid || 'Chưa rõ'} | Avatar: ${profileItem.avatarUrl ? 'Có' : 'Không'}`
          );
        } catch (err: any) {
          skippedCount++;
          this.emitLog(`✖ [BỎ QUA] ${profileUrl}: ${err?.message || 'Trang cá nhân không tồn tại'} (Không thêm vào danh sách)`);

          // Nếu URL này đã từng tồn tại trong danh sách từ trước, đánh dấu ERROR
          const existIdx = this.profiles.findIndex((p) => p.profileUrl === profileUrl);
          if (existIdx !== -1) {
            this.profiles[existIdx].status = 'ERROR';
            this.profiles[existIdx].errorMsg = err?.message || 'Không tìm thấy profile';
            this.db.upsertProfile(this.profiles[existIdx]);
            this.saveToDatabase();
            this.state.profiles = this.profiles;
            this.state.profilesCount = this.profiles.length;
            this.videosGateway.emitProfileMgmtItem(this.profiles[existIdx]);
          }
        }
      };

      const worker = async () => {
        while (queue.length > 0 && !this.currentCancelFlag) {
          const profileUrl = queue.shift();
          if (!profileUrl) break;
          // Jitter nhẹ để các request không dồn đúng một thời điểm
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 150));
          await processProfile(profileUrl);
        }
      };

      await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));

      if (this.currentCancelFlag) {
        this.emitLog(`[HỆ THỐNG] Đã hủy quét theo yêu cầu của người dùng.`);
        this.state.status = 'STOPPED';
        this.videosGateway.emitProfileMgmtStatus('STOPPED');
      }

      if (!this.currentCancelFlag) {
        this.emitLog(`========================================`);
        this.emitLog(`Hoàn thành quét: ${successCount} thành công, ${skippedCount} link không hợp lệ bị bỏ qua.`);
        this.emitLog(`========================================`);
        this.state.status = 'DONE';
        this.videosGateway.emitProfileMgmtStatus('DONE');
        this.emitProgress({
          current: total,
          total,
          currentUrl: '',
          status: 'DONE',
          message: `Đã hoàn thành quét ${total} profiles.`,
        });
      }
    } catch (fatalErr: any) {
      this.logger.error(`Lỗi hệ thống quét profile: ${fatalErr?.message}`);
      this.emitLog(`[LỖI TIẾN TRÌNH] ${fatalErr?.message}`);
      this.state.status = 'ERROR';
      this.videosGateway.emitProfileMgmtStatus('ERROR');
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Chuẩn hóa tên để đối chiếu so sánh thông minh
   */
  public normalizeAuthorName(name: string): string {
    if (!name) return '';
    let s = name.normalize('NFC').toLowerCase().trim();
    // Loại bỏ phần đuôi pipe | ...
    s = s.replace(/\s*\|.*$/, '').trim();
    // Loại bỏ phần gạch ngang kèm địa danh hành chính
    s = s.replace(/\s*-\s*(thành phố|tỉnh|tp\.?|huyện|thị xã|tt\.?|xã|quận).*$/i, '').trim();
    // Loại bỏ hậu tố on reels / trên reels
    s = s.replace(/\s+(on|trên)\s+reels.*$/i, '').trim();
    // Chuẩn hóa viết tắt thường gặp
    s = s.replace(/\bantt\b/g, 'an ninh trật tự');
    s = s.replace(/\bca\b/g, 'công an');
    s = s.replace(/[,.:\-–—_]/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  /**
   * Tự động thêm profile của người đăng vào database nếu chưa có id trong database
   */
  public async ensureProfileForAuthor(authorData: {
    nguoiDang?: string;
    authorUid?: string;
    authorUrl?: string;
    link?: string;
  }): Promise<UserProfileItem | null> {
    const rawName = (authorData.nguoiDang || '').trim();
    // Bỏ qua nếu không có tên hoặc tên là placeholder
    if (!rawName || rawName === 'N/A' || rawName === 'Không có tiêu đề' || /^Facebook$/i.test(rawName)) {
      return null;
    }

    // Luôn nạp lại danh sách mới nhất từ SQLite
    this.loadFromDatabase();

    const normAuthor = this.normalizeAuthorName(rawName);

    // 1. Kiểm tra xem người đăng đã có trong database chưa
    const existing = this.profiles.find((p) => {
      // 1a. So khớp theo UID
      if (authorData.authorUid && p.uid && String(p.uid).trim() === String(authorData.authorUid).trim()) {
        return true;
      }
      // 1b. So khớp theo profileUrl / authorUrl
      if (authorData.authorUrl && p.profileUrl) {
        const cleanP = p.profileUrl.replace(/\/+$/, '').toLowerCase();
        const cleanA = authorData.authorUrl.replace(/\/+$/, '').toLowerCase();
        if (cleanP === cleanA) return true;
      }
      // 1c. So khớp nếu link hoặc authorUrl chứa UID của profile
      if (p.uid && p.uid.length >= 5) {
        if (authorData.link && authorData.link.includes(p.uid)) return true;
        if (authorData.authorUrl && authorData.authorUrl.includes(p.uid)) return true;
      }
      // 1d. So khớp theo Tên người đăng (chuẩn hóa)
      if (p.name) {
        const normPName = this.normalizeAuthorName(p.name);
        if (normAuthor && normPName && normAuthor === normPName) {
          return true;
        }
      }
      return false;
    });

    if (existing) {
      // Đã có trong database -> không cần tạo mới
      return existing;
    }

    // 2. Chưa có trong database -> Tự động xác định thông tin profile và thêm vào
    let uid = authorData.authorUid?.trim();
    let profileUrl = normalizeFacebookUrl((authorData.authorUrl || '').trim());
    const link = (authorData.link || '').trim();

    // Trích xuất UID nếu chưa có
    if (!uid) {
      const mUrlUid = profileUrl.match(/facebook\.com\/(\d{5,})/i) || profileUrl.match(/[?&]id=(\d{5,})/i);
      if (mUrlUid) {
        uid = mUrlUid[1];
      } else {
        const mLinkUid = link.match(/facebook\.com\/(\d{5,})/i) || link.match(/[?&]id=(\d{5,})/i);
        if (mLinkUid) uid = mLinkUid[1];
      }
    }

    // Trích xuất profileUrl nếu chưa có hoặc nếu profileUrl đang là số mà link bài viết có tên chữ đẹp
    const isNumericUrl = !profileUrl || /facebook\.com\/\d{5,}\/?$/i.test(profileUrl) || /facebook\.com\/profile\.php\?id=\d+/i.test(profileUrl);
    if (isNumericUrl && link.includes('facebook.com')) {
      const mSlug = link.match(/facebook\.com\/([a-zA-Z0-9._-]+)\/(?:posts|videos|reel)/i);
      if (
        mSlug &&
        !['watch', 'reel', 'reels', 'videos', 'story', 'share', 'groups', 'people', 'p', 'permalink.php'].includes(
          mSlug[1].toLowerCase()
        ) &&
        !/^\d+$/.test(mSlug[1])
      ) {
        profileUrl = `https://www.facebook.com/${mSlug[1]}`;
      }
    }

    if (!profileUrl) {
      if (uid && /^\d+$/.test(uid)) {
        profileUrl = `https://www.facebook.com/${uid}`;
      } else if (link.includes('tiktok.com/@')) {
        const mTT = link.match(/tiktok\.com\/@([^/?#]+)/i);
        const ttUser = mTT ? mTT[1] : (uid || 'user');
        profileUrl = `https://www.tiktok.com/@${ttUser}`;
        if (!uid) uid = ttUser;
      } else {
        profileUrl = link;
      }
    }

    profileUrl = normalizeFacebookUrl(profileUrl);

    // 3. Thử cào thông tin chi tiết (Avatar, Bio, UID chuẩn) nếu là Facebook profile URL
    let newProfile: UserProfileItem | null = null;
    if (profileUrl && profileUrl.includes('facebook.com')) {
      try {
        newProfile = await this.crawlSingleProfileHttp(profileUrl);
      } catch (crawlErr: any) {
        this.logger.debug(`Không thể cào trực tiếp profile ${profileUrl}: ${crawlErr?.message}`);
      }
    }

    // Nếu không cào được qua HTTP bot, tạo profile trực tiếp từ dữ liệu hiện có
    if (!newProfile) {
      const itemId = 'prof_' + (uid || Date.now()) + '_' + Math.random().toString(36).substring(2, 6);
      newProfile = {
        id: itemId,
        profileUrl: normalizeFacebookUrl(profileUrl || `https://www.facebook.com/${uid || Date.now()}`),
        uid: uid || undefined,
        name: this.cleanProfileName(rawName) || rawName,
        avatarUrl: undefined,
        crawledAt: new Date().toISOString(),
        status: 'SUCCESS',
      };

      // Thử tìm avatar nếu có UID hoặc slug
      const urlId = this.extractNumericIdFromUrl(newProfile.profileUrl);
      const slug = this.extractSlugFromUrl(newProfile.profileUrl);
      const targetId = uid || urlId || slug;
      if (targetId) {
        try {
          const avatarDest = await this.getAvatarFilePath(targetId, slug);
          if (avatarDest) {
            newProfile.avatarUrl = `/api/profile-management/avatar/${targetId}`;
          }
        } catch {}
      }
    }

    // Kiểm tra xem profileUrl hoặc id có trùng trong danh sách hiện tại không
    const existIdx = this.profiles.findIndex(
      (p) => p.profileUrl === newProfile!.profileUrl || (newProfile!.uid && p.uid === newProfile!.uid)
    );

    if (existIdx !== -1) {
      newProfile.id = this.profiles[existIdx].id;
      this.profiles[existIdx] = newProfile;
    } else {
      this.profiles.unshift(newProfile);
    }

    this.db.upsertProfile(newProfile);
    this.saveToDatabase();
    this.state.profiles = this.profiles;
    this.state.profilesCount = this.profiles.length;

    this.videosGateway.emitProfileMgmtItem(newProfile);
    this.emitLog(`✔ [TỰ ĐỘNG THÊM PROFILE] Đã tự động thêm người đăng: "${newProfile.name}" (UID: ${newProfile.uid || 'Chưa rõ'}) vào cơ sở dữ liệu.`);

    return newProfile;
  }

  /**
   * Quét UID đối chiếu với UID trong dữ liệu video/bài viết:
   * Nếu chưa có thì thêm profile, có rồi thì thôi.
   */
  public async syncProfilesFromVideos(): Promise<{
    success: boolean;
    addedCount: number;
    totalVideos: number;
    message: string;
  }> {
    this.loadFromDatabase();
    const videos = this.db.getAllVideos();
    let addedCount = 0;

    for (const v of videos) {
      const rawName = (v.nguoiDang || '').trim();
      if (!rawName || rawName === 'N/A' || rawName === 'Không có tiêu đề' || /^Facebook$/i.test(rawName)) {
        continue;
      }

      // Trích xuất UID mục tiêu từ video
      let targetUid = v.authorUid?.trim();
      let targetUrl = (v.authorUrl || '').trim();
      const link = (v.link || '').trim();

      if (!targetUid) {
        const mUrlUid = targetUrl.match(/facebook\.com\/(\d{5,})/i) || targetUrl.match(/[?&]id=(\d{5,})/i);
        if (mUrlUid) {
          targetUid = mUrlUid[1];
        } else {
          const mLinkUid = link.match(/facebook\.com\/(\d{5,})/i) || link.match(/[?&]id=(\d{5,})/i);
          if (mLinkUid) targetUid = mLinkUid[1];
        }
      }

      // 1. Kiểm tra đối chiếu xem UID hoặc tác giả đã có trong profiles chưa
      const normAuthor = this.normalizeAuthorName(rawName);
      const isAlreadyInProfiles = this.profiles.find((p) => {
        // So khớp UID
        if (targetUid && p.uid && String(p.uid).trim() === String(targetUid).trim()) {
          return true;
        }
        // So khớp Profile URL
        if (targetUrl && p.profileUrl) {
          const cleanP = p.profileUrl.replace(/\/+$/, '').toLowerCase();
          const cleanA = targetUrl.replace(/\/+$/, '').toLowerCase();
          if (cleanP === cleanA) return true;
        }
        // So khớp UID có trong link bài viết
        if (p.uid && p.uid.length >= 5) {
          if (link && link.includes(p.uid)) return true;
          if (targetUrl && targetUrl.includes(p.uid)) return true;
        }
        // So khớp theo tên chuẩn hóa
        if (p.name) {
          const normP = this.normalizeAuthorName(p.name);
          if (normAuthor && normP && normAuthor === normP) {
            return true;
          }
        }
        return false;
      });

      if (isAlreadyInProfiles) {
        const existingProf = isAlreadyInProfiles;
        // TỰ ĐỘNG CẬP NHẬT / SỬA LỖI CHO PROFILE ĐÃ TỒN TẠI
        let modified = false;

        // a. Đổi link ID số (như /122093907776942463) sang link tên chữ chuẩn (như /anttchanmaylangco) nếu bài viết có slug đẹp
        const isNumericUrl = /facebook\.com\/\d{5,}\/?$/i.test(existingProf.profileUrl) || /facebook\.com\/profile\.php\?id=\d+/i.test(existingProf.profileUrl);
        if (isNumericUrl && link.includes('facebook.com')) {
          const mSlug = link.match(/facebook\.com\/([a-zA-Z0-9._-]+)\/(?:posts|videos|reel)/i);
          if (
            mSlug &&
            !['watch', 'reel', 'reels', 'videos', 'story', 'share', 'groups', 'people', 'p', 'permalink.php'].includes(
              mSlug[1].toLowerCase()
            ) &&
            !/^\d+$/.test(mSlug[1])
          ) {
            existingProf.profileUrl = `https://www.facebook.com/${mSlug[1]}`;
            modified = true;
          }
        }

        // b. Chuẩn hóa UID nếu URL có dạng /people/.../{ID}/
        const urlId = this.extractNumericIdFromUrl(existingProf.profileUrl);
        if (urlId && urlId !== existingProf.uid && /^\d+$/.test(urlId)) {
          existingProf.uid = urlId;
          modified = true;
        }

        // c. Bù đắp Avatar nếu còn thiếu hoặc file avatar bị lỗi / placeholder (< 1200 bytes)
        const currentAvatarValid = existingProf.avatarUrl && existingProf.uid && (await this.getAvatarFilePath(existingProf.uid, this.extractSlugFromUrl(existingProf.profileUrl)));
        if (!currentAvatarValid) {
          const slug = this.extractSlugFromUrl(existingProf.profileUrl);
          const candidateIds = Array.from(new Set([existingProf.uid, urlId, targetUid, slug])).filter(Boolean) as string[];
          for (const cand of candidateIds) {
            const avatarPath = await this.getAvatarFilePath(cand, slug);
            if (avatarPath) {
              existingProf.avatarUrl = `/api/profile-management/avatar/${cand}`;
              existingProf.status = 'SUCCESS';
              modified = true;
              break;
            }
          }
        }

        if (modified) {
          this.db.upsertProfile(existingProf);
          this.videosGateway.emitProfileMgmtItem(existingProf);
          this.emitLog(`✔ [TỰ ĐỘNG CẬP NHẬT] "${existingProf.name}" | URL: ${existingProf.profileUrl} | Avatar: ${existingProf.avatarUrl ? 'Có' : 'Chưa có'}`);
        }

        continue;
      }

      // 2. Chưa có thì thêm profile
      try {
        const newProf = await this.ensureProfileForAuthor({
          nguoiDang: v.nguoiDang,
          authorUid: targetUid || v.authorUid,
          authorUrl: targetUrl || v.authorUrl,
          link: v.link,
        });

        if (newProf) {
          addedCount++;
          // Cập nhật lại authorUid / authorUrl vào video nếu video chưa có
          if ((!v.authorUid && newProf.uid) || (!v.authorUrl && newProf.profileUrl)) {
            if (!v.authorUid && newProf.uid) v.authorUid = newProf.uid;
            if (!v.authorUrl && newProf.profileUrl) v.authorUrl = newProf.profileUrl;
            this.db.upsertVideo(v);
          }
        }
      } catch (err: any) {
        this.logger.warn(`Lỗi khi đồng bộ profile từ video ${v.link}: ${err?.message}`);
      }
    }

    this.saveToDatabase();
    this.state.profiles = this.profiles;
    this.state.profilesCount = this.profiles.length;

    const message =
      addedCount > 0
        ? `Đã quét ${videos.length} bài viết và thêm mới thành công ${addedCount} profile vào danh sách.`
        : `Đã quét ${videos.length} bài viết. Đã đồng bộ và cập nhật avatar cho toàn bộ danh sách profile.`;

    this.emitLog(`[QUÉT DỰA TRÊN DỮ LIỆU] ${message}`);

    return {
      success: true,
      addedCount,
      totalVideos: videos.length,
      message,
    };
  }
}
