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
    if (process.cwd().endsWith('backend')) {
      return path.join(process.cwd(), 'profiles_data.json');
    }
    if (fs.existsSync(path.join(process.cwd(), 'backend'))) {
      return path.join(process.cwd(), 'backend', 'profiles_data.json');
    }
    return path.join(process.cwd(), 'profiles_data.json');
  }

  private getEffectiveCookiePath(): string {
    if (process.cwd().endsWith('backend')) {
      const local = path.join(process.cwd(), 'cookies.json');
      if (fs.existsSync(local)) return local;
    }
    if (fs.existsSync(this.cookieFilePath)) return this.cookieFilePath;
    if (fs.existsSync(this.fallbackCookiePath)) return this.fallbackCookiePath;
    if (fs.existsSync(this.testUserCookiePath)) return this.testUserCookiePath;
    return this.cookieFilePath;
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
    let dir: string;
    if (process.cwd().endsWith('backend')) {
      dir = path.join(process.cwd(), 'avatars');
    } else if (fs.existsSync(path.join(process.cwd(), 'backend'))) {
      dir = path.join(process.cwd(), 'backend', 'avatars');
    } else {
      dir = path.join(process.cwd(), 'avatars');
    }
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }
    return dir;
  }

  public getCookieString(): string {
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
        if (buffer.length > 500) {
          fs.writeFileSync(dest, buffer);
          return true;
        }
      }
    } catch (err: any) {
      this.logger.warn(`Lỗi download avatar cho UID ${safeUid}: ${err?.message}`);
    }
    return false;
  }

  public async getAvatarFilePath(uid: string): Promise<string | null> {
    const safeUid = String(uid).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeUid) return null;

    const avatarsDir = this.getEffectiveAvatarsDir();
    const dest = path.join(avatarsDir, `${safeUid}.jpg`);

    if (fs.existsSync(dest) && fs.statSync(dest).size > 500) {
      return dest;
    }

    // Thử tải từ Facebook Lookaside qua externalhit bot
    const lookasideUrl = `https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=${safeUid}`;
    const ok = await this.downloadAvatar(lookasideUrl, safeUid, true);
    if (ok && fs.existsSync(dest)) {
      return dest;
    }

    // Thử tải từ Graph API
    if (!isNaN(Number(safeUid))) {
      const graphUrl = `https://graph.facebook.com/${safeUid}/picture?type=large`;
      const okGraph = await this.downloadAvatar(graphUrl, safeUid, false);
      if (okGraph && fs.existsSync(dest)) {
        return dest;
      }
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
      const pathParts = u.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0 && /^\d+$/.test(pathParts[0])) {
        return pathParts[0];
      }
    } catch {
      // url parse error
    }
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
          .map((u) => (u || '').trim())
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
    let uid = this.extractNumericIdFromUrl(profileUrl);

    // Headers giả lập Facebook External Hit bot để máy chủ Facebook trả về đầy đủ Open Graph tags
    const headers: Record<string, string> = {
      'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
    };

    let html = '';
    try {
      const res = await fetch(profileUrl, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
      });
      html = await res.text();
    } catch (fetchErr: any) {
      this.logger.warn(`Fetch bot không thành công cho ${profileUrl}: ${fetchErr?.message}`);
    }

    // 1. Trích xuất UID thật từ HTML
    if (html) {
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
    // Nếu không có, đây chắc chắn là link chết/sai (ví dụ: hoangquymuibgg, 404, hoặc trang bị khóa)
    if (!name || this.isInvalidName(name) || !uid) {
      throw new Error('Trang cá nhân không tồn tại hoặc link không hợp lệ');
    }

    // 3. Trích xuất Avatar thật (Không bao giờ lấy huy hiệu học vấn hay icon mũ tốt nghiệp)
    let avatarUrl = '';
    let hasAvatar = false;
    const mOgImage =
      html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i) ||
      html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']*)["']/i);
    const ogImageUrl = mOgImage ? this.unescapeHtml(mOgImage[1]).trim() : '';

    // Ưu tiên 1: Tải ảnh đại diện gốc từ Facebook Lookaside bằng crawler bot
    if (uid && (ogImageUrl.includes('lookaside.fbsbx.com') || !ogImageUrl)) {
      const lookasideUrl = `https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=${uid}`;
      const ok = await this.downloadAvatar(lookasideUrl, uid, true);
      if (ok) {
        hasAvatar = true;
        avatarUrl = `/api/profile-management/avatar/${uid}`;
      }
    }

    // Ưu tiên 2: Link CDN trực tiếp trong og:image (nếu có)
    if (!hasAvatar && ogImageUrl && ogImageUrl.includes('fbcdn.net')) {
      const ok = await this.downloadAvatar(ogImageUrl, uid || 'avatar', false);
      if (ok) {
        hasAvatar = true;
        avatarUrl = `/api/profile-management/avatar/${uid || 'avatar'}`;
      } else {
        avatarUrl = ogImageUrl;
      }
    }

    // Ưu tiên 3: Nếu chưa có avatar và có Cookie, thử tải bằng cookie session
    if (!hasAvatar) {
      const cookieStr = this.getCookieString();
      if (cookieStr) {
        try {
          const cRes = await fetch(profileUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
              'Cookie': cookieStr,
            },
            signal: AbortSignal.timeout(10000),
          });
          const cHtml = await cRes.text();
          const mPic =
            cHtml.match(/"profilePicLarge":\{"uri":"([^"]+)"\}/) ||
            cHtml.match(/"profilePicMedium":\{"uri":"([^"]+)"\}/) ||
            cHtml.match(/"profile_picture":\{"uri":"([^"]+)"\}/);
          if (mPic && mPic[1]) {
            const picUri = this.unescapeHtml(mPic[1].replace(/\\\//g, '/'));
            const ok = await this.downloadAvatar(picUri, uid || 'avatar', false);
            if (ok) {
              hasAvatar = true;
              avatarUrl = `/api/profile-management/avatar/${uid || 'avatar'}`;
            }
          }
        } catch (cookieFetchErr: any) {
          this.logger.warn(`Cookie fetch thất bại cho ${profileUrl}: ${cookieFetchErr?.message}`);
        }
      }
    }

    // Ưu tiên 4: Fallback Facebook Graph API
    if (!hasAvatar && uid && !isNaN(Number(uid))) {
      const graphUrl = `https://graph.facebook.com/${uid}/picture?type=large`;
      const ok = await this.downloadAvatar(graphUrl, uid, false);
      if (ok) {
        hasAvatar = true;
        avatarUrl = `/api/profile-management/avatar/${uid}`;
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
}
