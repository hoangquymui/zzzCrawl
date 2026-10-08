import { Injectable, Logger, Inject, forwardRef, BadRequestException, OnModuleInit } from '@nestjs/common';
import { chromium, Browser, BrowserContext, Page, Response } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import {
  ScannedPostItem,
  ProfileScanConfig,
  ProfileScannerProgress,
  ProfileScannerState,
} from './interfaces/profile-scanner.interface';
import { VideosGateway } from '../videos/videos.gateway';
import { ScraperService } from '../scraper/scraper.service';
import { DatabaseService } from '../database/database.service';
import { CookieService, ParsedCookieItem } from '../cookies/cookie.service';
import { checkCaptionViolation } from '../vocabulary/utils/profanity-checker';
import { isBoilerplateCaption } from '../scraper/utils/text-normalizer';
import { ProfileBrowserManager } from './services/profile-browser-manager';
import { ProfileDomParser, ExtractedGraphQLStory } from './services/profile-dom-parser';
import { ProfileTimelineScroller } from './services/profile-timeline-scroller';

@Injectable()
export class ProfileScannerService implements OnModuleInit {
  private readonly logger = new Logger(ProfileScannerService.name);
  private readonly cookieFilePath = path.join(process.cwd(), 'backend', 'cookies.json');
  private readonly fallbackCookiePath = path.join(process.cwd(), 'cookies.json');

  private state: ProfileScannerState = {
    status: 'IDLE',
    logs: ['[HỆ THỐNG] Sẵn sàng. Nhập thông tin Profile và bấm "Bắt đầu quét".'],
    postsCount: 0,
    videosCount: 0,
    matchedCount: 0,
    foundPosts: [],
    progress: null,
  };

  private currentCancelFlag = false;
  private isScanning = false;

  constructor(
    @Inject(forwardRef(() => VideosGateway))
    private readonly videosGateway: VideosGateway,
    @Inject(forwardRef(() => ScraperService))
    private readonly scraperService: ScraperService,
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => CookieService))
    private readonly cookieService: CookieService,
    private readonly browserManager: ProfileBrowserManager,
    private readonly domParser: ProfileDomParser,
    private readonly scroller: ProfileTimelineScroller
  ) {}

  public onModuleInit(): void {
    this.restoreStateFromDb();
  }

  private restoreStateFromDb(): void {
    try {
      const raw = this.db.getSetting('profile_scanner_state');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.foundPosts)) {
          this.state = {
            ...parsed,
            status: 'IDLE',
            progress: null,
          };
          this.logger.log(
            `[ProfileScanner] Đã phục hồi bền vững ${this.state.foundPosts.length} bài viết đã quét từ SQLite.`
          );
        }
      }
    } catch (err: unknown) {
      this.logger.warn(`[ProfileScanner] Lỗi phục hồi trạng thái từ SQLite: ${(err as Error)?.message}`);
    }
  }

  public persistState(): void {
    try {
      this.db.setSetting('profile_scanner_state', JSON.stringify(this.state));
    } catch (err: unknown) {
      this.logger.warn(`[ProfileScanner] Lỗi lưu trạng thái vào SQLite: ${(err as Error)?.message}`);
    }
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
    if (fs.existsSync(this.cookieFilePath)) return this.cookieFilePath;
    if (fs.existsSync(this.fallbackCookiePath)) return this.fallbackCookiePath;
    return dataPath;
  }

  public loadCookies(): ParsedCookieItem[] {
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
          .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object' && 'name' in c && 'value' in c))
          .map((c) => {
            let domain = (c.domain as string) || '.facebook.com';
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
            const item: ParsedCookieItem = {
              name: String(c.name).trim(),
              value: String(c.value).trim(),
              domain,
              path: (c.path as string) || '/',
            };
            if (sameSite) {
              item.sameSite = sameSite;
            }
            if (typeof c.httpOnly === 'boolean') item.httpOnly = c.httpOnly;
            if (typeof c.secure === 'boolean') {
              item.secure = c.secure;
            } else {
              item.secure = true;
            }
            if (typeof c.expires === 'number' && c.expires > 0) {
              item.expires = Math.floor(c.expires);
            } else if (typeof c.expirationDate === 'number' && c.expirationDate > 0) {
              item.expires = Math.floor(c.expirationDate);
            }
            return item;
          });
      }
    } catch {
      // Tiếp tục phân tích chuỗi raw
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
      .filter((c): c is ParsedCookieItem => c !== null);
  }

  public getConfig(): ProfileScanConfig {
    const cookies = this.loadCookies();
    const filePath = this.getEffectiveCookiePath();
    let rawCookie = '';
    if (fs.existsSync(filePath)) {
      rawCookie = fs.readFileSync(filePath, 'utf8').trim();
    }

    return {
      profileUrls: [],
      maxScrolls: 5,
      cookieCount: cookies.length,
      rawCookie,
    };
  }

  public saveCookie(content: string): { success: boolean; cookieCount: number } {
    const filePath = this.getEffectiveCookiePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content.trim(), 'utf8');
    const cookies = this.loadCookies();
    return { success: true, cookieCount: cookies.length };
  }

  public getState(): ProfileScannerState {
    return this.state;
  }

  public sanitizeScannedPost(post: ScannedPostItem): ScannedPostItem {
    if (post.postUrl && post.postUrl !== 'N/A') {
      post.postUrl = this.scraperService.sanitizeUrl(post.postUrl);
    }
    if (post.videoUrl && post.videoUrl !== 'N/A') {
      post.videoUrl = this.scraperService.sanitizeUrl(post.videoUrl);
    }
    if (post.reelUrl && post.reelUrl !== 'N/A') {
      post.reelUrl = this.scraperService.sanitizeUrl(post.reelUrl);
    }
    return post;
  }

  public clearState(): void {
    this.state.status = 'IDLE';
    this.state.logs = [];
    this.state.postsCount = 0;
    this.state.videosCount = 0;
    this.state.matchedCount = 0;
    this.state.foundPosts = [];
    this.state.progress = null;
    this.persistState();
    this.videosGateway.emitProfileScannerStatus('IDLE');
  }

  private addLog(msg: string): void {
    this.state.logs.push(msg);
    if (this.state.logs.length > 600) {
      this.state.logs.shift();
    }
    this.videosGateway.emitProfileScannerLog(msg);
  }

  public stopScan(): void {
    if (this.isScanning) {
      this.currentCancelFlag = true;
      this.addLog('[HỆ THỐNG] Nhận yêu cầu dừng quét từ người dùng...');
      this.state.status = 'CANCELLED';
      this.videosGateway.emitProfileScannerStatus('CANCELLED');
    }
  }

  public async startScan(options: {
    profileUrls?: string[];
    profileUrl?: string;
    maxScrolls?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<{ success: boolean; message: string }> {
    let urls: string[] = [];
    if (Array.isArray(options.profileUrls) && options.profileUrls.length > 0) {
      urls = options.profileUrls.map((u) => String(u).trim()).filter(Boolean);
    } else if (options.profileUrl) {
      urls = String(options.profileUrl)
        .split(/[\r\n,;]+/)
        .map((u) => u.trim())
        .filter(Boolean);
    }
    if (urls.length === 0) {
      urls = ['https://www.facebook.com/profile.php?id=61594031320050'];
    }

    const maxScrolls = Math.max(1, Math.min(15, Number(options.maxScrolls) || 5));
    const startDate = options.startDate ? options.startDate.trim() : undefined;
    const endDate = options.endDate ? options.endDate.trim() : undefined;

    if (this.isScanning) {
      this.currentCancelFlag = true;
      this.addLog('[HỆ THỐNG] Đang dừng tiến trình quét cũ trước khi khởi động phiên mới...');
      let waitCount = 0;
      while (this.isScanning && waitCount < 10) {
        await new Promise((r) => setTimeout(r, 600));
        waitCount++;
      }
    }

    // Tự động kiểm tra cookie trước khi crawl
    try {
      this.addLog('[HỆ THỐNG] Đang kiểm tra cookie trước khi quét...');
      await this.cookieService.validateCookieForCrawl(true);
      this.addLog('[HỆ THỐNG] Cookie hợp lệ, bắt đầu chuẩn bị phiên quét.');
    } catch (err: unknown) {
      this.addLog('[LỖI] Cookie hết hạn! Vui lòng cập nhật Cookie mới.');
      this.videosGateway.emitProfileScannerLog('[LỖI] Cookie hết hạn');
      this.state.status = 'ERROR';
      this.videosGateway.emitProfileScannerStatus('ERROR');
      throw new BadRequestException('Cookie hết hạn');
    }

    this.currentCancelFlag = false;
    this.isScanning = true;
    this.state.status = 'RUNNING';
    this.state.postsCount = 0;
    this.state.videosCount = 0;
    this.state.matchedCount = 0;
    this.state.foundPosts = [];
    this.state.progress = {
      profileIndex: 0,
      totalProfiles: urls.length,
      currentScroll: 0,
      maxScrolls,
      currentUrl: urls[0],
      postsCount: 0,
      videosCount: 0,
      matchedCount: 0,
    };
    this.videosGateway.emitProfileScannerStatus('RUNNING');
    this.videosGateway.emitProfileScannerProgress(this.state.progress);

    // Chạy ngầm không block request HTTP
    (async () => {
      try {
        await this.runScanProcess(urls, maxScrolls, startDate, endDate);
      } catch (err: unknown) {
        const errMsg = (err as Error)?.message || String(err);
        this.addLog(`[LỖI QUÉT] ${errMsg}`);
        this.state.status = 'ERROR';
        this.videosGateway.emitProfileScannerStatus('ERROR');
      } finally {
        this.isScanning = false;
        if (this.state.status === 'RUNNING') {
          this.state.status = 'DONE';
          this.videosGateway.emitProfileScannerStatus('DONE');
        }
        this.persistState();
      }
    })();

    return {
      success: true,
      message: `Đã khởi động quét cho ${urls.length} profile Facebook.`,
    };
  }

  private async runScanProcess(
    urls: string[],
    maxScrolls: number,
    startDate?: string,
    endDate?: string
  ): Promise<void> {
    this.addLog('========================================');
    this.addLog('Facebook Video Scanner (Multi-Profile)');
    this.addLog('========================================');
    this.addLog(`Số lượng profile cần quét: ${urls.length}`);
    urls.forEach((u, i) => this.addLog(`  [${i + 1}] ${u}`));
    this.addLog(`Số lần cuộn mỗi profile: ${maxScrolls}`);

    let startTimestamp: number | null = null;
    if (startDate) {
      const parts = startDate.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        startTimestamp = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime();
      }
    }

    let endTimestamp: number | null = null;
    if (endDate) {
      const parts = endDate.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        endTimestamp = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).getTime();
      }
    }

    if (startDate || endDate) {
      this.addLog(
        `Khoảng thời gian bài đăng: ${startDate || 'Từ trước đến nay'} -> ${endDate || 'Hiện tại'}`
      );
    }

    const cookies = this.cookieService ? this.cookieService.loadCookies() : this.loadCookies();
    if (cookies.length > 0) {
      this.addLog(`Áp dụng Cookie: ĐÃ NẠP (${cookies.length} cookies hợp lệ)`);
    } else {
      this.addLog('[LỖI] Cookie hết hạn! Vui lòng nạp Cookie trước khi quét.');
      this.videosGateway.emitProfileScannerLog('[LỖI] Cookie hết hạn');
      this.state.status = 'ERROR';
      this.videosGateway.emitProfileScannerStatus('ERROR');
      return;
    }

    this.addLog('Khởi chạy trình duyệt Playwright Chromium...');
    const browser: Browser = await this.browserManager.launchBrowser();

    const seenPostIds = new Set<string>(this.state.foundPosts.map((p) => p.id));
    const globalViewsMap: Record<string, string> = {};
    const globalReelDetailsMap: Record<
      string,
      { likesCount: string; commentsCount: string; sharesCount: string }
    > = {};

    try {
      const context: BrowserContext = await this.browserManager.createContext(browser, cookies);

      // Quét tuần tự từng profile
      for (let pIdx = 0; pIdx < urls.length; pIdx++) {
        if (this.currentCancelFlag) {
          this.addLog('\n[HỆ THỐNG] Người dùng đã yêu cầu dừng quét.');
          this.state.status = 'CANCELLED';
          break;
        }

        const profileUrl = urls[pIdx];
        const targetProfileId = this.domParser.extractProfileId(profileUrl);
        const timelineUrl = this.domParser.getTimelineUrl(profileUrl);
        this.addLog('');
        this.addLog('----------------------------------------');
        this.addLog(`[PROFILE ${pIdx + 1}/${urls.length}] Bắt đầu quét: ${profileUrl}`);
        this.addLog(`Truy cập dòng thời gian: ${timelineUrl}`);
        this.addLog('----------------------------------------');

        this.state.progress = {
          profileIndex: pIdx + 1,
          totalProfiles: urls.length,
          currentScroll: 0,
          maxScrolls,
          currentUrl: profileUrl,
          postsCount: this.state.postsCount,
          videosCount: this.state.videosCount,
          matchedCount: this.state.matchedCount,
        };
        this.videosGateway.emitProfileScannerProgress(this.state.progress);

        const page: Page = await context.newPage();
        let res: Response | null = null;

        const capturedGraphQLStories: ExtractedGraphQLStory[] = [];

        page.on('response', async (response) => {
          const u = response.url();
          if (
            u.includes('/api/graphql/') ||
            u.includes('graphql') ||
            u.includes('bulk-route-definitions') ||
            u.includes('profile.php')
          ) {
            try {
              const text = await response.text();
              const list = this.domParser.parseGraphQLStories(text);
               for (const s of list) {
                 // GraphQL responses can include recommendations and feed preloads.
                 // With an ID-based profile URL, only accept stories authored by it.
                 if (!targetProfileId || s.authorId === targetProfileId) {
                   capturedGraphQLStories.push(s);
                 }
               }
            } catch {}
          }
        });

        const reelsTabList: Array<{ reelUrl: string; views: string }> = [];

        try {
          res = await page.goto(timelineUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          // Chờ bài viết xuất hiện thay vì chờ cứng: có bài là đi tiếp ngay, tối đa 6s
          await page.waitForSelector('div[role="article"]', { timeout: 6000 }).catch(() => null);
          await page.waitForTimeout(400);

          if (this.currentCancelFlag) {
            await page.close();
            break;
          }

          const isBlocked = await this.browserManager.checkIfBlocked(page, res);
          if (isBlocked) {
            this.addLog(`[CẢNH BÁO] Facebook chặn hoặc checkpoint đối với profile ${profileUrl}. Bỏ qua...`);
            await page.close();
            continue;
          }

          const isLoginReq = await this.browserManager.checkIfLoginRequired(page);
          if (isLoginReq) {
            await this.browserManager.dismissLoginModalIfPossible(page);
            const stillReq = await this.browserManager.checkIfLoginRequired(page);
            if (stillReq) {
              this.addLog(
                `[CẢNH BÁO] Profile ${profileUrl} bị Facebook ẩn dòng thời gian (yêu cầu đăng nhập hoặc Cookie hiện tại đã hết hạn).`
              );
              this.addLog(
                `  -> Vui lòng cập nhật Cookie mới tại tab Cookie để quét được đầy đủ bài viết!`
              );
            }
          } else {
            await this.browserManager.dismissLoginModalIfPossible(page);
          }

          // Xác định chính xác Tên chủ Profile/Fanpage đang quét
          let profileOwnerName = '';
          try {
            const allProfiles = this.db.getAllProfiles();
            const targetNorm = profileUrl.toLowerCase();
            const matchedProf = allProfiles.find((p) => {
              if (!p) return false;
              const pUrlNorm = (p.profileUrl || '').toLowerCase();
              if (pUrlNorm && (pUrlNorm === targetNorm || targetNorm.includes(pUrlNorm) || pUrlNorm.includes(targetNorm))) return true;
              if (p.uid && targetNorm.includes(p.uid.toLowerCase())) return true;
              return false;
            });
            if (matchedProf && matchedProf.name && matchedProf.name.trim()) {
              profileOwnerName = matchedProf.name.trim();
            }
          } catch (e: unknown) {
            this.logger.warn(`Lỗi tra cứu profile trong SQLite: ${(e as Error)?.message}`);
          }

          if (!profileOwnerName) {
            try {
              profileOwnerName = await page.evaluate(() => {
                const metaOg = document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim();
                if (metaOg && metaOg.toLowerCase() !== 'facebook' && !/log in|đăng nhập/i.test(metaOg)) {
                  return metaOg.replace(/\s*[-|·]\s*Facebook.*$/i, '').trim();
                }
                const h1s = Array.from(document.querySelectorAll('h1'));
                for (const h of h1s) {
                  const clone = h.cloneNode(true) as HTMLElement;
                  clone.querySelectorAll('img, svg, i, [aria-hidden="true"]').forEach((x) => x.remove());
                  const t = (clone.innerText || clone.textContent || '').replace(/[\n\r]+/g, ' ').trim();
                  if (t && t.length >= 2 && t.length <= 120 && !/facebook|đăng nhập|login/i.test(t)) {
                    return t;
                  }
                }
                let dt = document.title || '';
                dt = dt.replace(/^\(\d+\)\s*/, '').replace(/\s*[-|·]\s*Facebook.*$/i, '').trim();
                if (dt && dt.length >= 2 && dt.length <= 120 && !/facebook|đăng nhập|login/i.test(dt)) {
                  return dt;
                }
                return '';
              });
            } catch {}
          }

          if (profileOwnerName) {
            this.addLog(`  -> Xác định tên Profile/Trang: "${profileOwnerName}"`);
          }

          // ========================================================
          // BƯỚC 1: LẤY LINK VÀ LOẠI CỦA TRANG CÁ NHÂN
          // ========================================================
          this.addLog(
            `[BƯỚC 1: THU THẬP LINK & LOẠI] Bắt đầu quét dòng thời gian Profile ${pIdx + 1}: ${profileUrl}...`
          );

          const discoveredItemsMap = new Map<
            string,
            { loai: string; hasImage: boolean; hasVideo: boolean; isShared: boolean }
          >();

          const addDiscoveredItem = (it: {
            url: string;
            loai: string;
            hasImage?: boolean;
            hasVideo?: boolean;
            isShared?: boolean;
          }) => {
            if (!it || !it.url || !this.domParser.isPostPermalink(it.url)) return;
            if (!discoveredItemsMap.has(it.url)) {
              discoveredItemsMap.set(it.url, {
                loai: it.loai,
                hasImage: Boolean(it.hasImage),
                hasVideo: Boolean(it.hasVideo),
                isShared: Boolean(it.isShared),
              });
            } else {
              const existing = discoveredItemsMap.get(it.url)!;
              if (it.hasImage) existing.hasImage = true;
              if (it.hasVideo) existing.hasVideo = true;
              if (it.isShared) existing.isShared = true;
            }
          };

          // Thu thập link ban đầu từ trang DOM
          const initialLinks = await this.domParser.extractTimelineLinksAndTypes(page);
          initialLinks.forEach((it) => addDiscoveredItem(it));

          // Cuộn dòng thời gian để bắt thêm link và loại
          for (let scroll = 1; scroll <= maxScrolls; scroll++) {
            if (this.currentCancelFlag) break;

            await this.scroller.scrollStep(page, 2500);

            const scrollLinks = await this.domParser.extractTimelineLinksAndTypes(page);
            scrollLinks.forEach((it) => addDiscoveredItem(it));

            // Bổ sung permalink từ stream GraphQL Comet
            for (const s of capturedGraphQLStories) {
              if (s.permalink_url) {
                let sUrl = this.scraperService.sanitizeUrl(s.permalink_url);
                let isPhoto = false;
                if (sUrl.includes('/photo/') || sUrl.includes('/photos/') || sUrl.includes('photo.php')) {
                  const mF = sUrl.match(/fbid=(\d+)/);
                  if (mF) {
                    sUrl = `https://www.facebook.com/permalink.php?story_fbid=${mF[1]}`;
                    isPhoto = true;
                  } else {
                    continue;
                  }
                }
                const isVid = Boolean(s.attachedReelUrl || s.attachedVideoId);
                addDiscoveredItem({
                  url: sUrl,
                  loai: s.isShared ? 'Chia sẻ' : isVid ? 'Video' : isPhoto ? 'Hình ảnh' : 'Bài viết',
                  hasVideo: isVid,
                  hasImage: isPhoto,
                  isShared: s.isShared,
                });
              }
              if (s.attachedReelUrl) {
                const rUrl = this.scraperService.sanitizeUrl(s.attachedReelUrl);
                addDiscoveredItem({
                  url: rUrl,
                  loai: 'Video',
                  hasVideo: true,
                  hasImage: false,
                });
              }
            }

            this.addLog(
              `  -> [Cuộn ${scroll}/${maxScrolls}] Đã tìm thấy ${discoveredItemsMap.size} bài viết/video.`
            );

            this.state.progress = {
              profileIndex: pIdx + 1,
              totalProfiles: urls.length,
              currentScroll: scroll,
              maxScrolls,
              currentUrl: profileUrl,
              postsCount: this.state.postsCount,
              videosCount: this.state.videosCount,
              matchedCount: this.state.matchedCount,
            };
            this.videosGateway.emitProfileScannerProgress(this.state.progress);

            const scrollBlocked = await this.browserManager.checkIfLoginRequired(page);
            if (scrollBlocked) {
              await this.browserManager.dismissLoginModalIfPossible(page);
            }
          }

          // Bổ sung các permalink từ capturedGraphQLStories
          for (const s of capturedGraphQLStories) {
            if (s.permalink_url) {
              let sUrl = this.scraperService.sanitizeUrl(s.permalink_url);
              let isPhoto = false;
              if (sUrl.includes('/photo/') || sUrl.includes('/photos/') || sUrl.includes('photo.php')) {
                const mF = sUrl.match(/fbid=(\d+)/);
                if (mF) {
                  sUrl = `https://www.facebook.com/permalink.php?story_fbid=${mF[1]}`;
                  isPhoto = true;
                } else {
                  continue;
                }
              }
              const isVid = Boolean(s.attachedReelUrl || s.attachedVideoId);
              addDiscoveredItem({
                url: sUrl,
                  loai: s.isShared ? 'Chia sẻ' : isVid ? 'Video' : isPhoto ? 'Hình ảnh' : 'Bài viết',
                hasVideo: isVid,
                hasImage: isPhoto,
                  isShared: s.isShared,
              });
            }
            if (s.attachedReelUrl) {
              const rUrl = this.scraperService.sanitizeUrl(s.attachedReelUrl);
              addDiscoveredItem({
                url: rUrl,
                loai: 'Video',
                hasVideo: true,
                hasImage: false,
              });
            }
          }

          // Bổ sung các link từ tab Reels nếu có
          for (const r of reelsTabList) {
            if (r.reelUrl && r.reelUrl !== 'N/A') {
              const rUrl = this.scraperService.sanitizeUrl(r.reelUrl);
              addDiscoveredItem({
                url: rUrl,
                loai: 'Video',
                hasVideo: true,
                hasImage: false,
              });
            }
          }

          // Đóng trang Playwright ngay khi kết thúc Bước 1 để giải phóng tài nguyên
          try {
            await page.close();
          } catch {}

          // Chuẩn hóa và lọc trùng lặp danh sách link thu được
          const uniqueItemList: Array<{
            url: string;
            loai: string;
            hasImage: boolean;
            hasVideo: boolean;
            isShared: boolean;
          }> = [];
          const seenIdSet = new Set<string>();

          for (const [rawUrl, meta] of discoveredItemsMap.entries()) {
            const cleanU = this.scraperService.sanitizeUrl(rawUrl);
            if (!this.domParser.isPostPermalink(cleanU)) continue;

            const pId = this.domParser.extractPostIdFromUrl(cleanU);
            if (pId) {
              if (!seenIdSet.has(pId)) {
                seenIdSet.add(pId);
                uniqueItemList.push({
                  url: cleanU,
                  loai: meta.loai,
                  hasImage: meta.hasImage,
                  hasVideo: meta.hasVideo,
                  isShared: meta.isShared,
                });
              }
            } else {
              if (!uniqueItemList.some((u) => u.url === cleanU)) {
                uniqueItemList.push({
                  url: cleanU,
                  loai: meta.loai,
                  hasImage: meta.hasImage,
                  hasVideo: meta.hasVideo,
                  isShared: meta.isShared,
                });
              }
            }
          }

          this.addLog('');
          this.addLog(
            `[BƯỚC 1 HOÀN TẤT] Thu thập được ${uniqueItemList.length} link bài viết/video duy nhất từ Profile ${pIdx + 1}.`
          );

          // ========================================================
          // BƯỚC 2: CRAWL CAPTION, TƯƠNG TÁC, NGÀY ĐĂNG BẰNG LOGIC CỦA TRANG DỮ LIỆU
          // ========================================================
          this.addLog('');
          this.addLog(
            `[BƯỚC 2: CRAWL DỮ LIỆU CHI TIẾT] Bắt đầu cào caption, tương tác, ngày đăng cho ${uniqueItemList.length} bài viết bằng logic của Trang Dữ liệu...`
          );

          const seenCanonicalUrls = new Set<string>();
          let consecutiveOldPosts = 0;
          let crawledCount = 0;

          for (const item of uniqueItemList) {
            if (this.currentCancelFlag) break;

            let crawlUrl = item.url;
            if (crawlUrl.includes('/photo/') || crawlUrl.includes('/photos/') || crawlUrl.includes('photo.php')) {
              const mF = crawlUrl.match(/fbid=(\d+)/);
              if (mF) {
                crawlUrl = `https://www.facebook.com/permalink.php?story_fbid=${mF[1]}`;
              } else {
                continue;
              }
            }

            crawledCount++;

            try {
              // Sử dụng chính logic crawl của trang dữ liệu (ScraperService.scrapeVideo)
              let scraped = await this.scraperService.scrapeVideo(crawlUrl);
              if (!scraped) continue;

              // HTTP often omits the attachment tree for Facebook posts. Verify
              // every non-video post on its own rendered permalink before deciding
              // between text-only, image, and shared post types.
              if (
                scraped.crawlSource !== 'playwright' &&
                !scraped.hasImage &&
                scraped.loai !== 'Facebook Reel' &&
                scraped.loai !== 'Facebook Video'
              ) {
                const rendered = await this.scraperService.scrapeWithBrowser(crawlUrl);
                scraped = {
                  ...scraped,
                  caption: (!scraped.caption || scraped.caption === 'Không có tiêu đề') ? (rendered.caption || scraped.caption) : scraped.caption,
                  hasImage: scraped.hasImage || rendered.hasImage === true,
                  isShared: scraped.isShared ? true : rendered.isShared === true,
                  LuotLike: rendered.LuotLike > 0 ? rendered.LuotLike : scraped.LuotLike,
                  LuotComment: rendered.LuotComment > 0 ? rendered.LuotComment : scraped.LuotComment,
                  SoLuongNguoiShare: rendered.SoLuongNguoiShare > 0 ? rendered.SoLuongNguoiShare : scraped.SoLuongNguoiShare,
                };
              }

              const finalUrl = scraped.link || crawlUrl;
              if (!this.domParser.isPostPermalink(finalUrl)) {
                continue;
              }
              if (seenCanonicalUrls.has(finalUrl)) continue;
              seenCanonicalUrls.add(finalUrl);

              // Xử lý ngày đăng & kiểm tra khoảng thời gian
              const dateInfo = scraped.ngayDang
                ? this.domParser.parseFacebookDate(scraped.ngayDang)
                : { formatted: 'Gần đây', timestamp: 0 };

              const inRange = this.domParser.isDateInRange(dateInfo.timestamp, startTimestamp, endTimestamp);
              if (!inRange) {
                if (startTimestamp && dateInfo.timestamp && dateInfo.timestamp < startTimestamp) {
                  consecutiveOldPosts++;
                }
                this.addLog(
                  `  [BỎ QUA DO KHOẢNG THỜI GIAN] [${scraped.loai || item.loai}] Ngày: ${dateInfo.formatted} nằm ngoài [${startDate || '...'} -> ${endDate || '...'}].`
                );
                // Nếu gặp nhiều bài cũ hơn ngày bắt đầu -> dừng sớm
                if (consecutiveOldPosts >= 5 && startTimestamp) {
                  this.addLog(`  [DỪNG CRAWL SỚM] Đã gặp các bài viết cũ hơn ngày bắt đầu (${startDate}).`);
                  break;
                }
                continue;
              }

              consecutiveOldPosts = 0;

              // Thứ tự ưu tiên chính xác: Bài viết chia sẻ > Video/Reel > Hình ảnh > Bài viết văn bản
              const isDirectVideoUrl =
                finalUrl.includes('/reel/') ||
                finalUrl.includes('/reels/') ||
                finalUrl.includes('/watch') ||
                finalUrl.includes('/videos/') ||
                scraped.loai === 'Facebook Reel' ||
                scraped.loai === 'Facebook Video' ||
                scraped.loai === 'TikTok Video' ||
                scraped.LuotXem > 0;

              const isVideo = isDirectVideoUrl || Boolean(item.hasVideo);
              const isShared = Boolean(scraped.isShared);

              let finalLoai: 'Chia sẻ' | 'Video' | 'Hình ảnh' | 'Bài viết';
              if (isShared) {
                finalLoai = 'Chia sẻ';
              } else if (isVideo) {
                finalLoai = 'Video';
              } else {
                const isPhotoUrl =
                  (finalUrl.includes('/photo/') || finalUrl.includes('/photo?') || finalUrl.includes('photo.php')) &&
                  !finalUrl.includes('permalink.php') &&
                  !finalUrl.includes('/posts/');

                const hasImage = isPhotoUrl || scraped.hasImage === true;

                if (hasImage) {
                  finalLoai = 'Hình ảnh';
                } else {
                  finalLoai = 'Bài viết';
                }
              }

              const caption = scraped.caption || '';
              const shouldCheckViolation =
                Boolean(caption) &&
                caption.trim() !== 'Không có tiêu đề' &&
                !isBoilerplateCaption(caption);
              const violation = shouldCheckViolation
                ? checkCaptionViolation(caption)
                : { isViolation: false, reason: '' };

              const postItem: ScannedPostItem = this.sanitizeScannedPost({
                id: `post_${finalUrl}`,
                videoId: scraped.postId || '',
                isShared,
                hasVideo: isVideo,
                loai: finalLoai,
                postUrl: finalUrl,
                videoUrl: isVideo ? finalUrl : 'N/A',
                reelUrl: finalUrl.includes('/reel/') ? finalUrl : 'N/A',
                videoPoster: '',
                author: scraped.nguoiDang || profileOwnerName || 'Người dùng Facebook',
                postType: scraped.loai || finalLoai,
                date: dateInfo.formatted,
                timestamp: dateInfo.timestamp,
                textPreview: caption || '(Không có nội dung văn bản)',
                viewsCount: scraped.LuotXem > 0 ? String(scraped.LuotXem) : '-',
                likesCount: String(scraped.LuotLike || 0),
                commentsCount: String(scraped.LuotComment || 0),
                sharesCount: String(scraped.SoLuongNguoiShare || 0),
                profileSource: profileUrl,
                isViolation: violation.isViolation,
                violationReason: violation.reason,
              });

              this.state.foundPosts.push(postItem);
              this.state.postsCount++;
              if (postItem.hasVideo) this.state.videosCount++;
              this.state.matchedCount++;

              // Bắn realtime Socket.IO lên giao diện
              this.videosGateway.emitProfileScannerFound(postItem);

              this.addLog('');
              this.addLog(
                `[FOUND Bài ${crawledCount}/${uniqueItemList.length}] [${postItem.loai}] ${postItem.author} | Ngày: ${postItem.date}`
              );
              this.addLog(
                `Tương tác: 👍 ${postItem.likesCount} Like | 💬 ${postItem.commentsCount} Cmt | ↗ ${postItem.sharesCount} Share | 👁 ${postItem.viewsCount} View`
              );
              this.addLog(`Nội dung: ${postItem.textPreview.slice(0, 70)}...`);
              this.addLog(`Link: ${postItem.postUrl}`);

              this.state.progress = {
                profileIndex: pIdx + 1,
                totalProfiles: urls.length,
                currentScroll: crawledCount,
                maxScrolls: uniqueItemList.length,
                currentUrl: profileUrl,
                postsCount: this.state.postsCount,
                videosCount: this.state.videosCount,
                matchedCount: this.state.matchedCount,
              };
              this.videosGateway.emitProfileScannerProgress(this.state.progress);
            } catch (crawlErr: unknown) {
              const errMsg = (crawlErr as Error)?.message || String(crawlErr);
              this.addLog(`  [Lỗi cào ${item.url}]: ${errMsg}`);
            }
          }
        } catch (profErr: unknown) {
          const errMsg = (profErr as Error)?.message || String(profErr);
          this.addLog(`[LỖI PROFILE] ${profileUrl}: ${errMsg}`);
        } finally {
          await page.close();
        }

        if (pIdx < urls.length - 1 && !this.currentCancelFlag) {
          this.addLog('Chờ 2 giây trước khi sang profile tiếp theo...');
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      // Giai đoạn 3: Rà soát lại lượt xem & tương tác cho toàn bộ foundPosts
      for (const p of this.state.foundPosts) {
        if ((!p.viewsCount || p.viewsCount === '-') && p.videoId && globalViewsMap[p.videoId]) {
          p.viewsCount = globalViewsMap[p.videoId];
          if (!p.isShared && p.viewsCount && p.viewsCount !== '-' && p.viewsCount !== '0') {
            p.loai = 'Video';
            p.hasVideo = true;
          }
        }
        if (p.videoId && globalReelDetailsMap[p.videoId]) {
          const rDet = globalReelDetailsMap[p.videoId];
          if ((!p.likesCount || p.likesCount === '0') && rDet.likesCount && rDet.likesCount !== '0') {
            p.likesCount = rDet.likesCount;
          }
          if ((!p.commentsCount || p.commentsCount === '0') && rDet.commentsCount && rDet.commentsCount !== '0') {
            p.commentsCount = rDet.commentsCount;
          }
          if ((!p.sharesCount || p.sharesCount === '0') && rDet.sharesCount && rDet.sharesCount !== '0') {
            p.sharesCount = rDet.sharesCount;
          }
        }
      }

      // Lọc trùng lặp bài viết trên foundPosts: nếu 2 bài có cùng nội dung/link, ưu tiên bài có tương tác thật
      const uniqueFound: ScannedPostItem[] = [];
      for (const p of this.state.foundPosts) {
        const pCleanText = this.cleanTextForMatching(p.textPreview);
        const pId = this.extractPostIdFromUrl(p.postUrl);

        const existingIdx = uniqueFound.findIndex((u) => {
          if (p.id && u.id && p.id === u.id) return true;
          if (p.postUrl && u.postUrl && p.postUrl !== 'N/A' && u.postUrl !== 'N/A' && p.postUrl === u.postUrl) return true;
          if (pId && u.postUrl) {
            const uId = this.extractPostIdFromUrl(u.postUrl);
            if (uId && uId === pId) return true;
          }
          if (p.videoId && u.videoId && p.videoId === u.videoId) return true;
          if (pCleanText && pCleanText.length >= 10 && u.textPreview) {
            const uCleanText = this.cleanTextForMatching(u.textPreview);
            if (uCleanText && (pCleanText.includes(uCleanText.slice(0, 30)) || uCleanText.includes(pCleanText.slice(0, 30)))) return true;
          }
          return false;
        });

        if (existingIdx === -1) {
          uniqueFound.push(p);
        } else {
          const ex = uniqueFound[existingIdx];
          const exHasStats = (ex.likesCount && ex.likesCount !== '0') || (ex.commentsCount && ex.commentsCount !== '0') || (ex.sharesCount && ex.sharesCount !== '0');
          const pHasStats = (p.likesCount && p.likesCount !== '0') || (p.commentsCount && p.commentsCount !== '0') || (p.sharesCount && p.sharesCount !== '0');

          if (!exHasStats && pHasStats) {
            uniqueFound[existingIdx] = p;
          } else {
            // Giữ bài cũ nhưng nếu bài mới có link permalink tốt hơn (không phải link photo), cập nhật link
            if ((!ex.postUrl || ex.postUrl === 'N/A' || ex.postUrl.includes('/photo/')) && p.postUrl && !p.postUrl.includes('/photo/')) {
              ex.postUrl = p.postUrl;
            }
          }
        }
      }
      this.state.foundPosts = uniqueFound;
      this.state.matchedCount = uniqueFound.length;

      this.state.progress = {
        profileIndex: urls.length,
        totalProfiles: urls.length,
        currentScroll: maxScrolls,
        maxScrolls,
        currentUrl: urls[urls.length - 1],
        postsCount: this.state.postsCount,
        videosCount: this.state.videosCount,
        matchedCount: this.state.matchedCount,
      };
      this.videosGateway.emitProfileScannerProgress(this.state.progress);

      await context.close();
    } finally {
      await this.browserManager.closeBrowser(browser);
    }

    this.addLog('');
    this.addLog('========================================');
    this.addLog('TỔNG KẾT QUÉT TẤT CẢ PROFILE');
    this.addLog('========================================');
    this.addLog(`Số profile đã duyệt: ${urls.length}`);
    this.addLog(`Tổng số bài viết phát hiện: ${this.state.postsCount}`);
    this.addLog(`Tổng số video phát hiện: ${this.state.videosCount}`);
    this.addLog(`Tổng số bài viết/video thu thập: ${this.state.matchedCount}`);
  }

  // ========================================================
  // SUB-SERVICE DELEGATIONS FOR BACKWARD COMPATIBILITY
  // ========================================================
  public extractTimelineLinksAndTypes(page: Page) {
    return this.domParser.extractTimelineLinksAndTypes(page);
  }

  public cleanTextForMatching(str: string): string {
    return this.domParser.cleanTextForMatching(str);
  }

  public extractPostIdFromUrl(url: string): string | null {
    return this.domParser.extractPostIdFromUrl(url);
  }

  public isPostPermalink(url: string): boolean {
    return this.domParser.isPostPermalink(url);
  }

  public parseFacebookDate(raw: unknown) {
    return this.domParser.parseFacebookDate(raw);
  }

  public isDateInRange(
    timestamp: number | undefined,
    startTimestamp: number | null,
    endTimestamp: number | null
  ): boolean {
    return this.domParser.isDateInRange(timestamp, startTimestamp, endTimestamp);
  }
}
