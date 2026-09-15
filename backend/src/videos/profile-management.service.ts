import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import {
  UserProfileItem,
  ProfileCrawlProgress,
  ProfileManagementState,
} from './interfaces/profile-management.interface';
import { VideosGateway } from './videos.gateway';

@Injectable()
export class ProfileManagementService {
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
    @Inject(forwardRef(() => VideosGateway))
    private readonly videosGateway: VideosGateway
  ) {
    this.loadFromDisk();
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

  private loadFromDisk(): void {
    const p = this.getEffectiveStoragePath();
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8').trim();
        if (raw) {
          this.profiles = JSON.parse(raw);
          this.state.profiles = this.profiles;
          this.state.profilesCount = this.profiles.length;
          this.logger.log(`[Storage] Đã nạp ${this.profiles.length} profiles từ đĩa.`);
        }
      } catch (err: any) {
        this.logger.error(`[Storage] Lỗi nạp profiles_data.json: ${err?.message}`);
      }
    }
  }

  private saveToDisk(): void {
    const p = this.getEffectiveStoragePath();
    try {
      fs.writeFileSync(p, JSON.stringify(this.profiles, null, 2), 'utf8');
    } catch (err: any) {
      this.logger.error(`[Storage] Lỗi ghi profiles_data.json: ${err?.message}`);
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
      this.saveToDisk();
      this.state.profiles = this.profiles;
      this.state.profilesCount = this.profiles.length;
      this.emitLog(`[XÓA] Đã xóa profile ID: ${id}`);
      return true;
    }
    return false;
  }

  public clearProfiles(): boolean {
    this.profiles = [];
    this.saveToDisk();
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

  private extractUidFromUrl(rawUrl: string): string | undefined {
    try {
      const u = new URL(rawUrl);
      const idParam = u.searchParams.get('id');
      if (idParam) return idParam;
      const pathParts = u.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0 && pathParts[0] !== 'profile.php') {
        return pathParts[0];
      }
    } catch {
      // url parse error
    }
    return undefined;
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

  private async executeCrawl(urls: string[]): Promise<void> {
    const total = urls.length;
    this.emitLog(`========================================`);
    this.emitLog(`Bắt đầu cào dữ liệu ${total} Profile Facebook`);
    this.emitLog(`========================================`);

    const cookies = this.loadCookies();
    this.emitLog(`Áp dụng Cookie: ${cookies.length > 0 ? `ĐÃ NẠP (${cookies.length} cookies)` : 'KHÔNG CÓ (Quét ở chế độ khách)'}`);

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    try {
      this.emitLog(`Khởi chạy trình duyệt Playwright Chromium...`);
      browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-infobars',
          '--window-size=1280,900',
        ],
      });

      context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        viewport: { width: 412, height: 915 },
        locale: 'vi-VN',
      });

      if (cookies.length > 0) {
        await context.addCookies(cookies);
      }

      const page = await context.newPage();
      page.setDefaultTimeout(30000);

      for (let i = 0; i < urls.length; i++) {
        if (this.currentCancelFlag) {
          this.emitLog(`[HỆ THỐNG] Đã hủy quét theo yêu cầu của người dùng.`);
          this.state.status = 'STOPPED';
          this.videosGateway.emitProfileMgmtStatus('STOPPED');
          break;
        }

        const profileUrl = urls[i];
        const currentIdx = i + 1;

        this.emitProgress({
          current: currentIdx,
          total,
          currentUrl: profileUrl,
          status: 'RUNNING',
          message: `Đang quét profile [${currentIdx}/${total}]: ${profileUrl}`,
        });

        this.emitLog(`>>> [Profile ${currentIdx}/${total}] Truy cập: ${profileUrl}`);

        try {
          const profileItem = await this.crawlSingleProfile(page, profileUrl);

          // Cập nhật hoặc thêm vào danh sách
          const existIdx = this.profiles.findIndex(
            (p) => p.profileUrl === profileItem.profileUrl || (profileItem.uid && p.uid === profileItem.uid)
          );

          if (existIdx !== -1) {
            this.profiles[existIdx] = profileItem;
          } else {
            this.profiles.unshift(profileItem);
          }

          this.saveToDisk();
          this.state.profiles = this.profiles;
          this.state.profilesCount = this.profiles.length;

          this.videosGateway.emitProfileMgmtItem(profileItem);

          this.emitLog(
            `✔ Quét thành công: "${profileItem.name}" | Ngày sinh: ${profileItem.birthday || 'Chưa rõ'} | Ở đâu: ${profileItem.location || profileItem.hometown || 'Chưa rõ'}`
          );
        } catch (err: any) {
          this.emitLog(`✖ Lỗi khi quét ${profileUrl}: ${err?.message}`);

          const errorItem: UserProfileItem = {
            id: 'prof_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            profileUrl,
            uid: this.extractUidFromUrl(profileUrl),
            name: 'Không thể truy cập',
            status: 'ERROR',
            errorMsg: err?.message || 'Không thể cào thông tin',
            crawledAt: new Date().toISOString(),
          };

          this.profiles.unshift(errorItem);
          this.saveToDisk();
          this.state.profiles = this.profiles;
          this.state.profilesCount = this.profiles.length;
          this.videosGateway.emitProfileMgmtItem(errorItem);
        }

        // Nghỉ nhẹ giữa các profile để hạn chế checkpoint Facebook
        if (i < urls.length - 1 && !this.currentCancelFlag) {
          await page.waitForTimeout(2000);
        }
      }

      if (!this.currentCancelFlag) {
        this.emitLog(`========================================`);
        this.emitLog(`Hoàn thành quét toàn bộ ${total} profiles!`);
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
      this.logger.error(`Lỗi hệ thống Playwright: ${fatalErr?.message}`);
      this.emitLog(`[LỖI TRÌNH DUYỆT] ${fatalErr?.message}`);
      this.state.status = 'ERROR';
      this.videosGateway.emitProfileMgmtStatus('ERROR');
    } finally {
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      this.isScanning = false;
    }
  }

  private async crawlSingleProfile(page: Page, profileUrl: string): Promise<UserProfileItem> {
    // 1. Chuyển đổi sang link m.facebook.com để nhận DOM máy chủ đầy đủ metadata
    let mobileUrl = profileUrl.trim();
    if (mobileUrl.includes('www.facebook.com')) {
      mobileUrl = mobileUrl.replace('www.facebook.com', 'm.facebook.com');
    } else if (!mobileUrl.includes('m.facebook.com') && mobileUrl.includes('facebook.com')) {
      mobileUrl = mobileUrl.replace('facebook.com', 'm.facebook.com');
    }

    await page.goto(mobileUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const html = await page.content().catch(() => '');

    // Thu thập dữ liệu từ trang chính
    const mainPageData = await page.evaluate(() => {
      // 1. Tìm tên
      let name = '';
      const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
      if (
        ogTitle &&
        ogTitle !== 'Facebook' &&
        !ogTitle.includes('Log In') &&
        !ogTitle.includes('Đăng nhập') &&
        !ogTitle.includes('Trình duyệt')
      ) {
        name = ogTitle.trim();
      }

      if (!name) {
        const h1Els = Array.from(document.querySelectorAll('h1'));
        for (const h of h1Els) {
          const t = (h.innerText || '').trim();
          if (
            t &&
            t !== 'Facebook' &&
            !t.includes('không được hỗ trợ') &&
            !t.includes('Notifications') &&
            !t.includes('Thông báo') &&
            !t.includes('Friend requests') &&
            !t.includes('Đăng nhập')
          ) {
            name = t;
            break;
          }
        }
      }

      if (!name) {
        const title = document.title || '';
        const cleaned = title
          .replace(/\s*\|\s*Facebook.*$/i, '')
          .replace(/^Trang cá nhân của\s+/i, '')
          .replace(/\s*\(@[a-zA-Z0-9._-]+\).*$/i, '')
          .trim();
        if (cleaned && cleaned !== 'Facebook') {
          name = cleaned;
        }
      }

      // 2. Tìm Avatar
      let avatarUrl = '';
      const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
      if (ogImage && ogImage.includes('fbcdn.net')) {
        avatarUrl = ogImage;
      }
      if (!avatarUrl) {
        const svgImg = document.querySelector('svg image');
        if (svgImg) {
          avatarUrl = svgImg.getAttribute('xlink:href') || svgImg.getAttribute('href') || '';
        }
      }
      if (!avatarUrl) {
        const imgs = Array.from(document.querySelectorAll('img[role="img"], div[role="main"] img, img'));
        for (const img of imgs) {
          const htmlImg = img as HTMLImageElement;
          const src = htmlImg.src || htmlImg.getAttribute('src') || '';
          if (src.includes('fbcdn.net') && (src.includes('/t1.') || src.includes('/t39.'))) {
            avatarUrl = src;
            break;
          }
        }
      }

      // 3. Tìm Bio (lọc bỏ các văn bản mặc định của Facebook như "đang ở trên Facebook", "Tham gia Facebook")
      let bio = '';
      const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
      if (ogDesc && ogDesc.length > 3) {
        const isBoilerplate =
          /đang ở trên Facebook|Tham gia Facebook|is on Facebook|Join Facebook|kết nối với|quyền chia sẻ và mở rộng|Facebook trao cho/i.test(
            ogDesc
          );
        if (!isBoilerplate) {
          bio = ogDesc.trim();
        }
      }

      // 4. Trích xuất Trú Quán (Location) & Quê Quán (Hometown) trực tiếp từ aria-label & text
      let directLocation = '';
      let directHometown = '';

      const ariaEls = Array.from(document.querySelectorAll('[aria-label]'));
      for (const el of ariaEls) {
        const al = (el.getAttribute('aria-label') || '').trim();
        if (!directLocation) {
          const mLoc = al.match(
            /^(?:Vị trí|Current city|Lives in|Sống tại|Nơi sinh sống|Tỉnh\/Thành phố hiện tại)[,\s:]+(.+)$/i
          );
          if (mLoc) {
            directLocation = mLoc[1].replace(/^[,\s]+/, '').trim();
          }
        }
        if (!directHometown) {
          const mHome = al.match(
            /^(?:Quê quán|Hometown|From|Đến từ|Quê ở|Nơi sinh)[,\s:]+(.+)$/i
          );
          if (mHome) {
            directHometown = mHome[1].replace(/^[,\s]+/, '').trim();
          }
        }
      }

      // Fallback tìm kiếm trong văn bản toàn trang
      const bodyText = document.body.innerText || '';
      if (!directLocation) {
        const matchLive = bodyText.match(/(?:Sống tại|Lives in|Vị trí)\s*:?\s*([^\n\r·]+)/i);
        if (matchLive && matchLive[1].trim().length < 60) {
          directLocation = matchLive[1].replace(/^[,\s]+/, '').trim();
        }
      }
      if (!directHometown) {
        const matchHome = bodyText.match(/(?:Đến từ|Quê quán|From|Quê ở)\s*:?\s*([^\n\r·]+)/i);
        if (matchHome && matchHome[1].trim().length < 60) {
          directHometown = matchHome[1].replace(/^[,\s]+/, '').trim();
        }
      }

      // 5. Lấy tất cả chuỗi văn bản từ main
      const candidateTexts: string[] = [];
      const mainEl = document.querySelector('div[role="main"]') || document.body;
      if (mainEl) {
        const walker = document.createTreeWalker(mainEl, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const val = node.nodeValue ? node.nodeValue.trim() : '';
          if (val && val.length > 1 && val.length < 250) {
            candidateTexts.push(val);
          }
        }
      }

      return {
        name,
        avatarUrl,
        bio,
        directLocation,
        directHometown,
        candidateTexts,
      };
    });

    let { name, avatarUrl, bio, directLocation, directHometown } = mainPageData;
    let candidateTexts = mainPageData.candidateTexts;

    // Tìm UID số thực tế từ mã nguồn trang
    let uid = '';
    const uidMatches = [
      ...html.matchAll(/"entity_id":\s*"(\d+)"/g),
      ...html.matchAll(/"userID":\s*"(\d+)"/g),
      ...html.matchAll(/"profile_id":\s*"?(\d+)"?/g),
      ...html.matchAll(/fb:\/\/profile\/(\d+)/g),
      ...html.matchAll(/\/profile\.php\?id=(\d+)/g),
    ];
    if (uidMatches.length > 0) {
      uid = uidMatches[0][1];
    }
    if (!uid) {
      uid = this.extractUidFromUrl(profileUrl) || '';
    }

    // Parse thông tin cơ bản ban đầu
    let parsed = this.parseProfileDetails(candidateTexts);
    if (!parsed.location && directLocation) parsed.location = directLocation;
    if (!parsed.hometown && directHometown) parsed.hometown = directHometown;

    // 2. Nếu thiếu Ngày sinh hoặc Trú quán / Quê quán, điều hướng đến mục About
    if (!parsed.location || !parsed.hometown || !parsed.birthday) {
      const aboutUrl = mobileUrl.includes('profile.php')
        ? `${mobileUrl}&v=info`
        : `${mobileUrl.replace(/\/$/, '')}/about`;

      try {
        await page.goto(aboutUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(2500);

        const aboutTexts = await page.evaluate(() => {
          const texts: string[] = [];
          const mainEl = document.querySelector('div[role="main"]');
          if (mainEl) {
            const walker = document.createTreeWalker(mainEl, NodeFilter.SHOW_TEXT);
            let node: Node | null;
            while ((node = walker.nextNode())) {
              const val = node.nodeValue ? node.nodeValue.trim() : '';
              if (val && val.length > 1 && val.length < 250) {
                texts.push(val);
              }
            }
          }
          return texts;
        });

        if (aboutTexts.length > 0) {
          candidateTexts = [...candidateTexts, ...aboutTexts];
          const aboutParsed = this.parseProfileDetails(aboutTexts);
          if (!parsed.birthday && aboutParsed.birthday) parsed.birthday = aboutParsed.birthday;
          if (!parsed.birthYear && aboutParsed.birthYear) parsed.birthYear = aboutParsed.birthYear;
          if (!parsed.location && aboutParsed.location) parsed.location = aboutParsed.location;
          if (!parsed.hometown && aboutParsed.hometown) parsed.hometown = aboutParsed.hometown;
          if (!parsed.gender && aboutParsed.gender) parsed.gender = aboutParsed.gender;
          if (!parsed.work && aboutParsed.work) parsed.work = aboutParsed.work;
          if (!parsed.education && aboutParsed.education) parsed.education = aboutParsed.education;
        }
      } catch {
        // bỏ qua lỗi tab about
      }
    }

    // 3. Nếu vẫn chưa có ngày sinh hoặc giới tính, thăm sub-tab contact and basic info
    if (!parsed.birthday || !parsed.gender) {
      const contactUrl = profileUrl.includes('profile.php')
        ? `${profileUrl}&sk=about_contact_and_basic_info`
        : `${profileUrl.replace(/\/$/, '')}/about_contact_and_basic_info`;

      try {
        await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(2500);

        const contactTexts = await page.evaluate(() => {
          const texts: string[] = [];
          const mainEl = document.querySelector('div[role="main"]');
          if (mainEl) {
            const walker = document.createTreeWalker(mainEl, NodeFilter.SHOW_TEXT);
            let node: Node | null;
            while ((node = walker.nextNode())) {
              const val = node.nodeValue ? node.nodeValue.trim() : '';
              if (val && val.length > 1 && val.length < 250) {
                texts.push(val);
              }
            }
          }
          return texts;
        });

        if (contactTexts.length > 0) {
          candidateTexts = [...candidateTexts, ...contactTexts];
          const contactParsed = this.parseProfileDetails(contactTexts);
          if (!parsed.birthday && contactParsed.birthday) parsed.birthday = contactParsed.birthday;
          if (!parsed.birthYear && contactParsed.birthYear) parsed.birthYear = contactParsed.birthYear;
          if (!parsed.gender && contactParsed.gender) parsed.gender = contactParsed.gender;
        }
      } catch {
        // bỏ qua
      }
    }

    // 4. Nếu vẫn chưa có nơi ở hiện tại / quê quán, thăm sub-tab places
    if (!parsed.location || !parsed.hometown) {
      const placesUrl = profileUrl.includes('profile.php')
        ? `${profileUrl}&sk=about_places`
        : `${profileUrl.replace(/\/$/, '')}/about_places`;

      try {
        await page.goto(placesUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(2000);

        const placesTexts = await page.evaluate(() => {
          const texts: string[] = [];
          const mainEl = document.querySelector('div[role="main"]');
          if (mainEl) {
            const walker = document.createTreeWalker(mainEl, NodeFilter.SHOW_TEXT);
            let node: Node | null;
            while ((node = walker.nextNode())) {
              const val = node.nodeValue ? node.nodeValue.trim() : '';
              if (val && val.length > 1 && val.length < 250) {
                texts.push(val);
              }
            }
          }
          return texts;
        });

        if (placesTexts.length > 0) {
          candidateTexts = [...candidateTexts, ...placesTexts];
          const placesParsed = this.parseProfileDetails(placesTexts);
          if (!parsed.location && placesParsed.location) parsed.location = placesParsed.location;
          if (!parsed.hometown && placesParsed.hometown) parsed.hometown = placesParsed.hometown;
        }
      } catch {
        // bỏ qua
      }
    }

    // Nếu tên vẫn chưa tìm thấy, thử trích xuất từ candidateTexts đầu trang
    if (!name || name === 'Facebook') {
      for (const t of candidateTexts.slice(0, 15)) {
        if (
          t &&
          t.length > 2 &&
          t.length < 40 &&
          !t.includes('Facebook') &&
          !t.includes('Share') &&
          !t.includes('Find') &&
          !t.includes('Add') &&
          !t.includes('More') &&
          !t.includes('Intro') &&
          !t.includes('About')
        ) {
          name = t;
          break;
        }
      }
    }

    const finalItem: UserProfileItem = {
      id: 'prof_' + (uid || Date.now().toString()) + '_' + Math.random().toString(36).substring(2, 6),
      profileUrl,
      uid,
      name: name || 'Người dùng Facebook',
      birthday: parsed.birthday,
      birthYear: parsed.birthYear,
      location: parsed.location,
      hometown: parsed.hometown,
      gender: parsed.gender,
      avatarUrl: avatarUrl || undefined,
      bio: bio || undefined,
      work: parsed.work,
      education: parsed.education,
      relationship: parsed.relationship,
      status: name ? 'SUCCESS' : 'PARTIAL',
      crawledAt: new Date().toISOString(),
    };

    return finalItem;
  }

  private parseProfileDetails(texts: string[]): {
    birthday?: string;
    birthYear?: string;
    location?: string;
    hometown?: string;
    gender?: string;
    work?: string;
    education?: string;
    relationship?: string;
  } {
    let birthday: string | undefined;
    let birthYear: string | undefined;
    let location: string | undefined;
    let hometown: string | undefined;
    let gender: string | undefined;
    let work: string | undefined;
    let education: string | undefined;
    let relationship: string | undefined;

    const cleanTexts = (texts || []).map((t) => (t || '').trim()).filter(Boolean);

    const enMonths =
      'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
    const birthdayFullRegex = new RegExp(
      `(?:Sinh ngày\\s+|Born on\\s+|Ngày sinh\\s*:?\\s*)?(\\d{1,2}\\s+(?:${enMonths}|tháng\\s+\\d{1,2})(?:(?:,\\s*|\\s+năm\\s+|\\s+)(\\d{4}))?)`,
      'i'
    );
    const pureDateRegex = new RegExp(
      `^(\\d{1,2}\\s+(?:${enMonths}|tháng\\s+\\d{1,2})(?:,\\s*\\d{4}|\\s+\\d{4})?)$`,
      'i'
    );
    const yearOnlyRegex = /(?:Năm sinh|Birth year)\s*:?\s*(\d{4})/i;

    for (let i = 0; i < cleanTexts.length; i++) {
      const text = cleanTexts[i];

      // Location: Lives in / Sống tại / Thành phố hiện tại / Vị trí / Nơi sinh sống / Current city
      if (!location) {
        const matchLive = text.match(
          /^(?:Lives in|Sống tại|Thành phố hiện tại|Vị trí|Nơi sinh sống|Tỉnh\/Thành phố hiện tại|Current city|Sống ở|Đang sống tại)[,\s:]+(.+)$/i
        );
        if (matchLive) {
          location = matchLive[1].replace(/^[,\s]+/, '').trim();
          continue;
        } else if (
          text === 'Lives in' ||
          text === 'Sống tại' ||
          text === 'Thành phố hiện tại' ||
          text === 'Vị trí'
        ) {
          const next = cleanTexts[i + 1];
          if (next && next.length < 60 && !next.includes('From') && !next.includes('Sống')) {
            location = next.replace(/^[,\s]+/, '').trim();
            continue;
          }
        }
      }

      // Hometown: From / Đến từ / Quê quán / Quê ở / Hometown / Nơi sinh
      if (!hometown) {
        const matchFrom = text.match(
          /^(?:From|Đến từ|Quê quán|Quê ở|Hometown|Nơi sinh)[,\s:]+(.+)$/i
        );
        if (matchFrom) {
          hometown = matchFrom[1].replace(/^[,\s]+/, '').trim();
          continue;
        } else if (
          text === 'From' ||
          text === 'Đến từ' ||
          text === 'Quê quán' ||
          text === 'Quê ở'
        ) {
          const next = cleanTexts[i + 1];
          if (next && next.length < 60 && !next.includes('Lives in') && !next.includes('Quê')) {
            hometown = next.replace(/^[,\s]+/, '').trim();
            continue;
          }
        }
      }

      // Birthday: Date of birth / Ngày sinh / 4 October 2003 / 14 May 1984
      if (!birthday) {
        if (pureDateRegex.test(text)) {
          birthday = text;
          const yMatch = text.match(/\b(19\d{2}|20\d{2})\b/);
          if (yMatch) birthYear = yMatch[1];
          continue;
        }
        const bMatch = text.match(birthdayFullRegex);
        if (
          bMatch &&
          (text.toLowerCase().includes('sinh') ||
            text.toLowerCase().includes('born') ||
            text.toLowerCase().includes('details') ||
            pureDateRegex.test(bMatch[1]))
        ) {
          birthday = bMatch[1].trim();
          if (bMatch[2]) birthYear = bMatch[2];
          continue;
        }
        if (text === 'Ngày sinh' || text === 'Date of birth' || text === 'Birthday') {
          const next = cleanTexts[i + 1];
          if (next && next.length < 35) {
            birthday = next;
            const yMatch = next.match(/\b(19\d{2}|20\d{2})\b/);
            if (yMatch) birthYear = yMatch[1];
            continue;
          }
        }
      }

      // Birth year
      if (!birthYear) {
        const yMatch = text.match(yearOnlyRegex);
        if (yMatch) {
          birthYear = yMatch[1];
          if (!birthday) birthday = yMatch[1];
          continue;
        }
        if (text === 'Năm sinh' || text === 'Birth year') {
          const next = cleanTexts[i + 1];
          if (next && /^(19\d{2}|20\d{2})$/.test(next)) {
            birthYear = next;
            if (!birthday) birthday = next;
            continue;
          }
        }
      }

      // Gender
      if (!gender) {
        const gMatch = text.match(/^(?:Giới tính|Gender)\s*:?\s*(Nam|Nữ|Male|Female|Khác|Other)/i);
        if (gMatch) {
          gender = gMatch[1];
          continue;
        } else if (text === 'Giới tính' || text === 'Gender') {
          const next = cleanTexts[i + 1];
          if (next && ['Nam', 'Nữ', 'Male', 'Female', 'Khác', 'Other'].includes(next)) {
            gender = next;
            continue;
          }
        }
      }

      // Work
      if (!work) {
        const matchWork = text.match(/^(?:Works at|Làm việc tại)\s+(.+)$/i);
        if (matchWork) work = matchWork[1].trim();
      }

      // Education
      if (!education) {
        const matchEdu = text.match(/^(?:Studied at|Học tại|Went to)\s+(.+)$/i);
        if (matchEdu) education = matchEdu[1].trim();
      }

      // Relationship
      if (!relationship) {
        if (
          text.includes('Độc thân') ||
          text.includes('Đã kết hôn') ||
          text.includes('Hẹn hò') ||
          text.includes('Single') ||
          text.includes('Married') ||
          text.includes('In a relationship')
        ) {
          relationship = text;
        }
      }
    }

    return {
      birthday,
      birthYear,
      location,
      hometown,
      gender,
      work,
      education,
      relationship,
    };
  }
}
