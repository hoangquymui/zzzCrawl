import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import {
  ScannedPostItem,
  ProfileScanConfig,
  ProfileScannerProgress,
  ProfileScannerState,
} from './interfaces/profile-scanner.interface';
import { VideosGateway } from './videos.gateway';
import { ScraperService } from './scraper.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ProfileScannerService {
  private readonly logger = new Logger(ProfileScannerService.name);
  private readonly cookieFilePath = path.join(process.cwd(), 'backend', 'cookies.json');
  private readonly fallbackCookiePath = path.join(process.cwd(), 'cookies.json');
  private readonly testUserCookiePath = path.join(
    process.cwd(),
    '..',
    'test_video_from_user',
    'cookies.json'
  );

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
    private readonly scraperService: ScraperService,
    private readonly db: DatabaseService
  ) {}

  private getEffectiveCookiePath(): string {
    if (fs.existsSync(this.cookieFilePath)) return this.cookieFilePath;
    if (fs.existsSync(this.fallbackCookiePath)) return this.fallbackCookiePath;
    if (fs.existsSync(this.testUserCookiePath)) return this.testUserCookiePath;
    return this.cookieFilePath;
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
      .filter(Boolean);
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
      } catch (err: any) {
        this.addLog(`[LỖI QUÉT] ${err?.message || String(err)}`);
        this.state.status = 'ERROR';
        this.videosGateway.emitProfileScannerStatus('ERROR');
      } finally {
        this.isScanning = false;
        if (this.state.status === 'RUNNING') {
          this.state.status = 'DONE';
          this.videosGateway.emitProfileScannerStatus('DONE');
        }
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

    const cookies = this.loadCookies();
    if (cookies.length > 0) {
      this.addLog(`Áp dụng Cookie: ĐÃ NẠP (${cookies.length} cookies hợp lệ)`);
    } else {
      this.addLog('Áp dụng Cookie: CHƯA CÓ (vui lòng dán Cookie nếu Facebook yêu cầu đăng nhập)');
    }

    this.addLog('Khởi chạy trình duyệt Playwright Chromium...');
    const browser: Browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-notifications',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const seenPostIds = new Set<string>(this.state.foundPosts.map((p) => p.id));
    const globalViewsMap: Record<string, string> = {};
    const globalReelDetailsMap: Record<
      string,
      { likesCount: string; commentsCount: string; sharesCount: string }
    > = {};

    try {
      const context: BrowserContext = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
        locale: 'vi-VN',
      });

      if (cookies.length > 0) {
        try {
          await context.addCookies(cookies);
        } catch (cookieErr: any) {
          this.addLog(`[CẢNH BÁO] Lỗi khi thêm cookie: ${cookieErr?.message || String(cookieErr)}`);
        }
      }

      // Giai đoạn 1: Đọc trước số lượt xem từ tab Reels của các profile
      this.addLog('');
      this.addLog('Đang đọc số lượt xem từ tab Reels của các profile...');
      const profileReelsMap: Record<
        string,
        Array<{ videoId: string; reelUrl: string; viewsCount: string }>
      > = {};

      for (let i = 0; i < urls.length; i++) {
        if (this.currentCancelFlag) break;
        const profUrl = urls[i];
        const reelsPage: Page = await context.newPage();
        try {
          const { viewsMap, reels } = await this.fetchProfileReelsViews(reelsPage, profUrl);
          profileReelsMap[profUrl] = reels;
          const count = Object.keys(viewsMap).length;
          if (count > 0) {
            Object.assign(globalViewsMap, viewsMap);
            this.addLog(
              `  [Profile ${i + 1}/${urls.length}] Đã tìm thấy ${count} video Reels có lượt xem.`
            );
          }
        } catch {
          // Bỏ qua lỗi reels tab
        } finally {
          await reelsPage.close();
        }
      }

      // Giai đoạn 2: Quét tuần tự từng profile
      for (let pIdx = 0; pIdx < urls.length; pIdx++) {
        if (this.currentCancelFlag) {
          this.addLog('\n[HỆ THỐNG] Người dùng đã yêu cầu dừng quét.');
          this.state.status = 'CANCELLED';
          break;
        }

        const profileUrl = urls[pIdx];
        const timelineUrl = this.getTimelineUrl(profileUrl);
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
        let res: any;

        const capturedGraphQLStories: Array<{
          permalink_url: string;
          msg: string;
          author: string;
          authorId: string;
          isShared: boolean;
          attachedReelUrl: string;
          attachedVideoId: string;
          attachedAuthor: string;
          creation_time: number;
          reaction_count: number;
          comment_count: number;
          share_count: number;
        }> = [];

        page.on('response', async (response) => {
          const u = response.url();
          if (u.includes('/api/graphql/') || u.includes('graphql')) {
            try {
              const text = await response.text();
              const list = this.parseGraphQLStories(text);
              for (const s of list) {
                capturedGraphQLStories.push(s);
              }
            } catch {}
          }
        });

        const matchedVideoIds = new Set<string>();
        this.state.foundPosts.forEach((p) => {
          if (p.videoId) matchedVideoIds.add(p.videoId);
        });
        const timelineAllPosts: ScannedPostItem[] = [];
        const reelsTabList = profileReelsMap[profileUrl] || [];
        let consecutiveOldPostsCount = 0;

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

          const isBlocked = await this.checkIfBlocked(page, res);
          if (isBlocked) {
            this.addLog(`[CẢNH BÁO] Facebook chặn hoặc checkpoint đối với profile ${profileUrl}. Bỏ qua...`);
            await page.close();
            continue;
          }

          const isLoginReq = await this.checkIfLoginRequired(page);
          if (isLoginReq) {
            await this.dismissLoginModalIfPossible(page);
            const stillReq = await this.checkIfLoginRequired(page);
            if (stillReq) {
              this.addLog(
                `[CẢNH BÁO] Profile ${profileUrl} bị Facebook ẩn dòng thời gian (yêu cầu đăng nhập hoặc Cookie hiện tại đã hết hạn).`
              );
              this.addLog(
                `  -> Vui lòng cập nhật Cookie mới tại tab Cookie để quét được đầy đủ bài viết!`
              );
            }
          } else {
            await this.dismissLoginModalIfPossible(page);
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
          } catch (e: any) {
            this.logger.warn(`Lỗi tra cứu profile trong SQLite: ${e?.message}`);
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

          // Vòng lặp cuộn trang
          for (let scroll = 0; scroll <= maxScrolls; scroll++) {
            if (this.currentCancelFlag) break;

            // Đọc thêm stories từ các script JSON trên trang
            try {
              const html = await page.content();
              const scriptStories = this.parseStoriesFromHtml(html);
              for (const s of scriptStories) {
                capturedGraphQLStories.push(s);
              }
            } catch {}

            const posts: ScannedPostItem[] = await this.extractPosts(
              page,
              profileOwnerName
            );

            // Chuẩn hóa ngày và nguồn profile cho các bài viết lấy từ DOM
            for (const p of posts) {
              if (!p.profileSource) {
                p.profileSource = profileUrl;
              }
              if (profileOwnerName && (!p.author || p.author === 'Người dùng Facebook')) {
                p.author = profileOwnerName;
              }
              if (p.date && (!p.timestamp || p.timestamp === 0)) {
                const parsed = this.parseFacebookDate(p.date);
                if (parsed.timestamp > 0) {
                  p.timestamp = parsed.timestamp;
                  p.date = parsed.formatted;
                }
              }
            }

            // Làm giàu thông tin cho các bài viết DOM từ capturedGraphQLStories (chưa thêm mới ở bước này để tránh trùng lặp 0 tương tác)
            for (const s of capturedGraphQLStories) {
              if (s.permalink_url) {
                const sMsgClean = this.cleanTextForMatching(s.msg);
                const sId = this.extractPostIdFromUrl(s.permalink_url);

                const matchPost = (p: ScannedPostItem) => {
                  if (p.postUrl && p.postUrl !== 'N/A') {
                    if (p.postUrl === s.permalink_url) return true;
                    if (sId) {
                      const pId = this.extractPostIdFromUrl(p.postUrl);
                      if (pId && pId === sId) return true;
                    }
                  }
                  if (s.attachedVideoId && p.videoId && p.videoId === s.attachedVideoId) {
                    return true;
                  }
                  if (sMsgClean && sMsgClean.length >= 10 && p.textPreview) {
                    const pClean = this.cleanTextForMatching(p.textPreview);
                    if (pClean && (sMsgClean.includes(pClean.slice(0, 30)) || pClean.includes(sMsgClean.slice(0, 30)))) {
                      return true;
                    }
                  }
                  return false;
                };

                const existingPost = posts.find(matchPost) || timelineAllPosts.find(matchPost);

                if (existingPost) {
                  // Cập nhật link chuẩn từ permalink nếu bài viết từ DOM chỉ có link ảnh
                  if ((!existingPost.postUrl || existingPost.postUrl === 'N/A' || existingPost.postUrl.includes('/photo/')) && s.permalink_url) {
                    existingPost.postUrl = this.scraperService.sanitizeUrl(s.permalink_url);
                  }
                  // Cập nhật tương tác nếu bài viết chưa có mà GraphQL có
                  if ((!existingPost.likesCount || existingPost.likesCount === '0') && s.reaction_count > 0) {
                    existingPost.likesCount = String(s.reaction_count);
                  }
                  if ((!existingPost.commentsCount || existingPost.commentsCount === '0') && s.comment_count > 0) {
                    existingPost.commentsCount = String(s.comment_count);
                  }
                  if ((!existingPost.sharesCount || existingPost.sharesCount === '0') && s.share_count > 0) {
                    existingPost.sharesCount = String(s.share_count);
                  }
                }
              }
            }

            for (let post of posts) {
              post = this.sanitizeScannedPost(post);
              // Thử gán thông tin tác giả và link bài viết từ capturedGraphQLStories
              if (capturedGraphQLStories.length > 0) {
                // 1. Khớp theo postUrl hoặc cùng ID bài viết trong link
                let matchedStory = capturedGraphQLStories.find((s) => {
                  if (!s.permalink_url) return false;
                  if (post.postUrl && post.postUrl !== 'N/A') {
                    if (post.postUrl === s.permalink_url) return true;
                    const id1 = post.postUrl.match(/(?:posts|videos|reel|fbid=|\/)\/?(\d{9,})/)?.[1];
                    const id2 = s.permalink_url.match(/(?:posts|videos|reel|fbid=|\/)\/?(\d{9,})/)?.[1];
                    if (id1 && id2 && id1 === id2) return true;
                  }
                  if (post.videoId && s.attachedVideoId && post.videoId === s.attachedVideoId) {
                    return true;
                  }
                  return false;
                });

                // 2. Khớp theo videoId nếu có
                if (!matchedStory && post.videoId) {
                  matchedStory = capturedGraphQLStories.find(
                    (s) => s.attachedVideoId && s.attachedVideoId === post.videoId
                  );
                }

                // 3. Khớp theo text snippet
                if (!matchedStory && post.textPreview) {
                  const cleanP = post.textPreview.slice(0, 50).trim().toLowerCase();
                  if (cleanP.length >= 8) {
                    matchedStory = capturedGraphQLStories.find((s) => {
                      if (!s.msg) return false;
                      const sLow = s.msg.toLowerCase();
                      return sLow.includes(cleanP) || cleanP.includes(sLow.slice(0, 30));
                    });
                  }
                }

                if (matchedStory) {
                  if (matchedStory.permalink_url && (!post.postUrl || post.postUrl === 'N/A')) {
                    post.postUrl = this.scraperService.sanitizeUrl(matchedStory.permalink_url);
                    post.id = `${post.isShared ? 'share' : 'orig'}_${post.postUrl}`;
                  }
                  if (matchedStory.author && (!post.author || post.author === 'Người dùng Facebook')) {
                    post.author = matchedStory.author;
                  }
                  if (matchedStory.creation_time && (!post.timestamp || post.timestamp === 0)) {
                    const dateInfo = this.parseFacebookDate(matchedStory.creation_time);
                    post.date = dateInfo.formatted;
                    post.timestamp = dateInfo.timestamp;
                  }
                  // Cập nhật lượt tương tác từ GraphQL nếu DOM trả về '0'
                  if ((!post.likesCount || post.likesCount === '0') && matchedStory.reaction_count > 0) {
                    post.likesCount = String(matchedStory.reaction_count);
                  }
                  if ((!post.commentsCount || post.commentsCount === '0') && matchedStory.comment_count > 0) {
                    post.commentsCount = String(matchedStory.comment_count);
                  }
                  if ((!post.sharesCount || post.sharesCount === '0') && matchedStory.share_count > 0) {
                    post.sharesCount = String(matchedStory.share_count);
                  }
                }
              }

              timelineAllPosts.push(post);

              // Gán lượt xem từ map Reels nếu feed card không có (cả bài gốc và bài chia sẻ đều lấy lượt xem của Reel)
              if (
                (!post.viewsCount || post.viewsCount === '-') &&
                post.videoId &&
                globalViewsMap[post.videoId]
              ) {
                post.viewsCount = globalViewsMap[post.videoId];
              }

              if (!seenPostIds.has(post.id)) {
                seenPostIds.add(post.id);
                this.state.postsCount++;

                if (post.hasVideo) {
                  this.state.videosCount++;
                }

                // Chế độ lấy hết: mọi bài viết đều vào kết quả (Bài viết/Video/Hình ảnh/Chia sẻ), chỉ lọc theo khoảng ngày
                const inRange = this.isDateInRange(post.timestamp, startTimestamp, endTimestamp);
                if (inRange) {
                  consecutiveOldPostsCount = 0;
                  this.state.matchedCount++;
                  post.profileSource = profileUrl;
                  post = this.sanitizeScannedPost(post);
                  this.state.foundPosts.push(post);
                  this.videosGateway.emitProfileScannerFound(post);

                  this.addLog('');
                  this.addLog(`[FOUND trên Profile ${pIdx + 1}] [${post.loai || post.postType}] ${post.author} | Ngày: ${post.date}`);
                  this.addLog(`Tương tác: 👍 ${post.likesCount} Like | 💬 ${post.commentsCount} Cmt | ↗ ${post.sharesCount} Share | 👁 ${post.viewsCount} View`);
                  this.addLog(`Nội dung: ${post.textPreview.slice(0, 70)}...`);
                  this.addLog(`Link: ${post.postUrl !== 'N/A' ? post.postUrl : (post.reelUrl || post.videoUrl)}`);
                } else {
                  if (startTimestamp && post.timestamp && post.timestamp < startTimestamp) {
                    consecutiveOldPostsCount++;
                  }
                  this.addLog(`  [BỎ QUA DO KHOẢNG THỜI GIAN] Bài viết (${post.date}) nằm ngoài khoảng ngày [${startDate || '...'} -> ${endDate || '...'}].`);
                }
              }
            }

            // Cơ chế Early Stop: Nếu đã thiết lập startDate và gặp nhiều bài viết cũ hơn startDate
            // (cần >=3 để tránh dừng oan khi profile ghim 1-2 bài cũ lên đầu timeline)
            if (consecutiveOldPostsCount >= 3) {
              this.addLog(
                `  [DỪNG CUỘN SỚM] Đã quét đến các bài viết cũ hơn ngày bắt đầu (${startDate}) trên profile ${pIdx + 1}.`
              );
              break;
            }

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

            if (scroll < maxScrolls) {
              const prevHeight = await page.evaluate(() => document.body.scrollHeight);
              await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
              // Chờ nội dung mới thực sự được nạp (chiều cao tăng) thay vì chờ cứng, tối đa 2.5s
              await page
                .waitForFunction((h: number) => document.body.scrollHeight > h, prevHeight, {
                  timeout: 2500,
                })
                .catch(() => {});

              const scrollBlocked = await this.checkIfLoginRequired(page);
              if (scrollBlocked) {
                await this.dismissLoginModalIfPossible(page);
              }
            }
          }

          // Sau khi hoàn tất cuộn timeline, chỉ bổ sung story từ capturedGraphQLStories nếu HOÀN TOÀN chưa có trên DOM
          for (const s of capturedGraphQLStories) {
            if (!s.permalink_url) continue;
            const sMsgClean = this.cleanTextForMatching(s.msg);
            const sId = this.extractPostIdFromUrl(s.permalink_url);

            const alreadyInTimeline = timelineAllPosts.some((p) => {
              if (p.postUrl && p.postUrl !== 'N/A') {
                if (p.postUrl === s.permalink_url) return true;
                if (sId) {
                  const pId = this.extractPostIdFromUrl(p.postUrl);
                  if (pId && pId === sId) return true;
                }
              }
              if (s.attachedVideoId && p.videoId && p.videoId === s.attachedVideoId) return true;
              if (sMsgClean && sMsgClean.length >= 10 && p.textPreview) {
                const pClean = this.cleanTextForMatching(p.textPreview);
                if (pClean && (sMsgClean.includes(pClean.slice(0, 30)) || pClean.includes(sMsgClean.slice(0, 30)))) return true;
              }
              return false;
            });

            if (!alreadyInTimeline && !seenPostIds.has(`post_${s.permalink_url}`) && !seenPostIds.has(`share_${s.permalink_url}`)) {
              const dateInfo = s.creation_time
                ? this.parseFacebookDate(s.creation_time)
                : { formatted: 'Gần đây', timestamp: 0 };

              const isSharedPost = Boolean(s.isShared);
              const hasVid = Boolean(s.attachedReelUrl || s.attachedVideoId);
              const item: ScannedPostItem = this.sanitizeScannedPost({
                id: `${isSharedPost ? 'share' : 'post'}_${s.permalink_url}`,
                videoId: s.attachedVideoId || '',
                isShared: isSharedPost,
                hasVideo: hasVid,
                loai: isSharedPost ? 'Chia sẻ' : hasVid ? 'Video' : 'Bài viết',
                postUrl: s.permalink_url,
                videoUrl: s.attachedReelUrl || 'N/A',
                reelUrl: s.attachedReelUrl || 'N/A',
                videoPoster: '',
                author: profileOwnerName || s.author || 'Người dùng Facebook',
                attachedAuthor: s.attachedAuthor || undefined,
                postType: isSharedPost ? 'Chia sẻ' : 'Bài viết',
                date: dateInfo.formatted,
                timestamp: dateInfo.timestamp,
                textPreview: s.msg || (isSharedPost ? '(Bài chia sẻ)' : '(Không có nội dung văn bản)'),
                viewsCount: '-',
                likesCount: s.reaction_count > 0 ? String(s.reaction_count) : '0',
                commentsCount: s.comment_count > 0 ? String(s.comment_count) : '0',
                sharesCount: s.share_count > 0 ? String(s.share_count) : '0',
                profileSource: profileUrl,
              });

              seenPostIds.add(item.id);
              timelineAllPosts.push(item);
              this.state.postsCount++;
              if (item.hasVideo) this.state.videosCount++;
              const inRange = this.isDateInRange(item.timestamp, startTimestamp, endTimestamp);
              if (inRange) {
                this.state.matchedCount++;
                this.state.foundPosts.push(item);
                this.videosGateway.emitProfileScannerFound(item);
              }
            }
          }

          // 2. Thu thập Reels trực tiếp từ tab /reels/ nếu có
          if (reelsTabList.length > 0) {
            this.addLog(`Đang trích xuất thông tin chi tiết cho ${reelsTabList.length} Reels từ tab Reels...`);
            for (const r of reelsTabList) {
              if (this.currentCancelFlag) break;
              if (r.reelUrl && r.reelUrl !== 'N/A') {
                try {
                  // Ưu tiên HTTPS Request (nhanh ~0.8s), chỉ mở trình duyệt khi HTTP không đủ dữ liệu
                  let reelItem =
                    (await this.buildReelItemFromHttp(
                      r.reelUrl,
                      r.videoId,
                      r.viewsCount,
                      profileOwnerName
                    )) ||
                    (await this.extractReelDetails(
                      page,
                      r.reelUrl,
                      r.videoId,
                      r.viewsCount,
                      profileOwnerName
                    ));
                  if (reelItem && !seenPostIds.has(reelItem.id)) {
                    seenPostIds.add(reelItem.id);
                    if (reelItem.videoId) {
                      globalReelDetailsMap[reelItem.videoId] = {
                        likesCount: reelItem.likesCount,
                        commentsCount: reelItem.commentsCount,
                        sharesCount: reelItem.sharesCount,
                      };
                    }
                    this.state.postsCount++;
                    if (reelItem.hasVideo) {
                      this.state.videosCount++;
                    }
                    // Chuẩn hóa ngày cho reelItem
                    if (reelItem.date && (!reelItem.timestamp || reelItem.timestamp === 0)) {
                      const parsed = this.parseFacebookDate(reelItem.date);
                      if (parsed.timestamp > 0) {
                        reelItem.timestamp = parsed.timestamp;
                        reelItem.date = parsed.formatted;
                      }
                    }

                    if (reelItem.hasVideo) {
                      if (reelItem.videoId) matchedVideoIds.add(reelItem.videoId);

                      const inRange = this.isDateInRange(reelItem.timestamp, startTimestamp, endTimestamp);
                      if (inRange) {
                        this.state.matchedCount++;
                        reelItem = this.sanitizeScannedPost(reelItem);
                        reelItem.profileSource = profileUrl;
                        this.state.foundPosts.push(reelItem);
                        this.videosGateway.emitProfileScannerFound(reelItem);

                        this.addLog('');
                        this.addLog(`[FOUND Reel trên Profile ${pIdx + 1}] ${reelItem.author} | Ngày: ${reelItem.date}`);
                        this.addLog(
                          `Tương tác: 👍 ${reelItem.likesCount} Like | 💬 ${reelItem.commentsCount} Cmt | ↗ ${reelItem.sharesCount} Share | 👁 ${reelItem.viewsCount} View`
                        );
                        this.addLog(`Nội dung: ${reelItem.textPreview.slice(0, 70)}...`);
                        this.addLog(`Link: ${reelItem.reelUrl}`);
                      } else {
                        this.addLog(`  [BỎ QUA DO KHOẢNG THỜI GIAN] Reel (${reelItem.date}) nằm ngoài khoảng ngày [${startDate || '...'} -> ${endDate || '...'}].`);
                      }
                    }

                    this.state.progress = {
                      profileIndex: pIdx + 1,
                      totalProfiles: urls.length,
                      currentScroll: maxScrolls,
                      maxScrolls,
                      currentUrl: profileUrl,
                      postsCount: this.state.postsCount,
                      videosCount: this.state.videosCount,
                      matchedCount: this.state.matchedCount,
                    };
                    this.videosGateway.emitProfileScannerProgress(this.state.progress);
                  }
                } catch (rErr: any) {
                  this.addLog(
                    `  [Cảnh báo] Lỗi khi đọc Reel ${r.reelUrl}: ${rErr?.message || String(rErr)}`
                  );
                }
              }
            }
          }

          // Rà soát lại xem trên timeline có bài chia sẻ nào liên kết với các video vừa khớp không
          for (const p of timelineAllPosts) {
            if (
              p.isShared &&
              p.videoId &&
              matchedVideoIds.has(p.videoId) &&
              !seenPostIds.has(p.id)
            ) {
              seenPostIds.add(p.id);
              if ((!p.viewsCount || p.viewsCount === '-') && globalViewsMap[p.videoId]) {
                p.viewsCount = globalViewsMap[p.videoId];
              }

              // Đảm bảo postUrl và tương tác của bài chia sẻ nếu trước đó chưa gán
              if (capturedGraphQLStories.length > 0) {
                const mStory = capturedGraphQLStories.find(
                  (s) => (p.videoId && s.attachedVideoId === p.videoId) ||
                         (p.postUrl && p.postUrl !== 'N/A' && s.permalink_url === p.postUrl)
                );
                if (mStory) {
                  if ((!p.postUrl || p.postUrl === 'N/A') && mStory.permalink_url) {
                    p.postUrl = mStory.permalink_url;
                    p.id = `share_${p.postUrl}`;
                  }
                  if ((!p.likesCount || p.likesCount === '0') && mStory.reaction_count > 0) {
                    p.likesCount = String(mStory.reaction_count);
                  }
                  if ((!p.commentsCount || p.commentsCount === '0') && mStory.comment_count > 0) {
                    p.commentsCount = String(mStory.comment_count);
                  }
                  if ((!p.sharesCount || p.sharesCount === '0') && mStory.share_count > 0) {
                    p.sharesCount = String(mStory.share_count);
                  }
                }
              }

              // Dự phòng từ thông tin Reel gốc nếu có
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

              this.state.matchedCount++;
              const sanitizedP = this.sanitizeScannedPost(p);
              sanitizedP.profileSource = profileUrl;
              this.state.foundPosts.push(sanitizedP);
              this.videosGateway.emitProfileScannerFound(sanitizedP);

              this.addLog('');
              this.addLog(`[FOUND Bài chia sẻ khớp Reel trên Profile ${pIdx + 1}]`);
              this.addLog(`Tác giả: ${p.author} | Loại: ${p.postType}`);
              this.addLog(`Tương tác: 👍 ${p.likesCount} Like | 💬 ${p.commentsCount} Cmt | ↗ ${p.sharesCount} Share | 👁 ${p.viewsCount} View`);
              this.addLog(`Nội dung: ${p.textPreview.slice(0, 70)}...`);
              this.addLog(`Link: ${p.postUrl !== 'N/A' ? p.postUrl : (p.reelUrl || p.videoUrl)}`);
            }
          }
        } catch (profErr: any) {
          this.addLog(`[LỖI PROFILE] ${profileUrl}: ${profErr?.message || String(profErr)}`);
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
      await browser.close();
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

  private async checkIfBlocked(page: Page, response: any): Promise<boolean> {
    if (response && (response.status() === 403 || response.status() === 429)) {
      return true;
    }
    const url = page.url().toLowerCase();
    if (url.includes('/checkpoint/') || url.includes('/security/') || url.includes('blocked')) {
      return true;
    }
    const title = (await page.title()).toLowerCase();
    if (
      title.includes('temporarily blocked') ||
      title.includes('bị chặn') ||
      title.includes('security check')
    ) {
      return true;
    }
    return false;
  }

  private async checkIfLoginRequired(page: Page): Promise<boolean> {
    const url = page.url().toLowerCase();
    if (url.includes('/login') || url.includes('login.php')) return true;
    const title = (await page.title()).toLowerCase();
    if (title.startsWith('đăng nhập') || title.startsWith('log in')) return true;
    try {
      const isLoginPrompt = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        return (
          text.includes('Hãy đăng nhập hoặc đăng ký Facebook') ||
          text.includes('Đăng nhập để xem thêm') ||
          text.includes('Dùng trang cá nhân khác') ||
          Boolean(document.querySelector('form[action*="login"]'))
        );
      });
      if (isLoginPrompt) return true;
    } catch {
      // Bỏ qua lỗi context
    }
    return false;
  }

  private getTimelineUrl(profileUrl: string): string {
    let cleanUrl = profileUrl.trim().replace(/\/+$/, '');
    if (cleanUrl.includes('facebook.com/l.php?')) {
      try {
        const u = new URL(cleanUrl);
        const target = u.searchParams.get('u');
        if (target) cleanUrl = decodeURIComponent(target);
      } catch {}
    }
    if (cleanUrl.includes('sk=timeline')) {
      return cleanUrl;
    }
    if (cleanUrl.includes('profile.php')) {
      try {
        const u = new URL(cleanUrl);
        const id = u.searchParams.get('id');
        if (id) {
          return `${u.origin}/profile.php?id=${id}&sk=timeline`;
        }
      } catch {}
      return cleanUrl.includes('?') ? `${cleanUrl}&sk=timeline` : `${cleanUrl}?sk=timeline`;
    }

    // Với trang cá nhân / fanpage thông thường, cắt bỏ query params rác (mibextid, ref, rdid)
    try {
      const u = new URL(cleanUrl);
      return `${u.origin}${u.pathname.replace(/\/+$/, '')}/?sk=timeline`;
    } catch {
      return `${cleanUrl}/?sk=timeline`;
    }
  }

  private async dismissLoginModalIfPossible(page: Page): Promise<void> {
    try {
      const closeSelector =
        '[aria-label="Đóng"], [aria-label="Close"], div[role="button"][aria-label="Đóng"], div[role="button"][aria-label="Close"]';
      const closeBtn = await page.$(closeSelector);
      if (closeBtn) {
        await closeBtn.click();
        await page.waitForTimeout(1000);
      } else {
        await page.keyboard.press('Escape');
      }
    } catch {
      // Bỏ qua
    }
  }

  private async fetchProfileReelsViews(
    page: Page,
    profileUrl: string
  ): Promise<{
    viewsMap: Record<string, string>;
    reels: Array<{ videoId: string; reelUrl: string; viewsCount: string }>;
  }> {
    let reelsUrl = profileUrl.trim().replace(/\/+$/, '');
    if (reelsUrl.includes('profile.php')) {
      try {
        const u = new URL(reelsUrl);
        const id = u.searchParams.get('id');
        if (id) {
          reelsUrl = `${u.origin}/profile.php?id=${id}&sk=reels_tab`;
        } else {
          reelsUrl = `${reelsUrl}&sk=reels_tab`;
        }
      } catch {
        reelsUrl = `${reelsUrl}&sk=reels_tab`;
      }
    } else {
      try {
        const u = new URL(reelsUrl);
        reelsUrl = `${u.origin}${u.pathname.replace(/\/+$/, '')}/reels`;
      } catch {
        reelsUrl = `${reelsUrl}/reels`;
      }
    }

    try {
      await page.goto(reelsUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      // Chờ link Reel xuất hiện thay vì chờ cứng, tối đa 5s
      await page.waitForSelector('a[href*="/reel/"]', { timeout: 5000 }).catch(() => null);
      await page.waitForTimeout(400);

      return await page.evaluate(() => {
        const viewsMap: Record<string, string> = {};
        const reels: Array<{ videoId: string; reelUrl: string; viewsCount: string }> = [];
        const links = Array.from(document.querySelectorAll('a[href*="/reel/"]'));
        const seenVids = new Set<string>();

        for (const a of links) {
          const href = (a as HTMLAnchorElement).href || '';
          const m = href.match(/reel\/(\d+)/);
          if (!m) continue;
          const videoId = m[1];
          if (seenVids.has(videoId)) continue;
          seenVids.add(videoId);

          let countText = (a as HTMLElement).innerText.trim();
          if (!countText && a.parentElement) {
            countText = a.parentElement.innerText.trim();
          }
          let viewsCount = '-';
          const mCount = countText.match(/(\d+([,.]\d+)?\s*[kmb]?)/i);
          if (mCount) {
            viewsCount = mCount[1].toUpperCase();
          } else if (countText && countText !== 'Reels') {
            viewsCount = countText;
          }
          viewsMap[videoId] = viewsCount;
          reels.push({
            videoId,
            reelUrl: `https://www.facebook.com/reel/${videoId}/`,
            viewsCount,
          });
        }
        return { viewsMap, reels };
      });
    } catch {
      return { viewsMap: {}, reels: [] };
    }
  }

  /**
   * Đường nhanh: lấy chi tiết Reel qua HTTPS Request thay vì mở trang bằng trình duyệt.
   * Trả về null nếu HTTP không đủ dữ liệu (bị chặn/đăng nhập tường) để caller fallback qua Playwright.
   */
  private async buildReelItemFromHttp(
    reelUrl: string,
    videoId: string,
    viewsCount: string,
    profileAuthorDefault?: string
  ): Promise<ScannedPostItem | null> {
    try {
      const http = await this.scraperService.scrapeFacebookHttp(reelUrl, 1);
      if (!(http.caption || http.LuotXem > 0 || http.LuotLike > 0)) return null;

      return {
        id: `reel_${videoId}`,
        videoId,
        isShared: false,
        hasVideo: true,
        loai: 'Video',
        postUrl: reelUrl,
        videoUrl: reelUrl,
        reelUrl,
        videoPoster: '',
        author: http.nguoiDang || profileAuthorDefault || 'Người dùng Facebook',
        postType: 'FB Reel',
        date: http.ngayDang || 'Gần đây',
        timestamp: 0,
        textPreview: (http.caption || '(FB Reel)').replace(/\s+\d+\s*$/, '').trim(),
        viewsCount:
          viewsCount && viewsCount !== '-'
            ? viewsCount
            : http.LuotXem > 0
              ? String(http.LuotXem)
              : '-',
        likesCount: http.LuotLike > 0 ? String(http.LuotLike) : '0',
        commentsCount: http.LuotComment > 0 ? String(http.LuotComment) : '0',
        sharesCount: http.SoLuongNguoiShare > 0 ? String(http.SoLuongNguoiShare) : '0',
      };
    } catch {
      return null;
    }
  }

  private async extractReelDetails(
    page: Page,
    reelUrl: string,
    videoId: string,
    viewsCount: string,
    profileAuthorDefault?: string
  ): Promise<ScannedPostItem | null> {
    try {
      await page.goto(reelUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      // Chờ nội dung reel render thay vì chờ cứng, tối đa 5s
      await page.waitForSelector('div[role="article"]', { timeout: 5000 }).catch(() => null);
      await page.waitForTimeout(400);

      return await page.evaluate(
        (args: {
          videoId: string;
          reelUrl: string;
          viewsCount: string;
          profileAuthorDefault?: string;
        }) => {
          const {
            videoId,
            reelUrl,
            viewsCount,
            profileAuthorDefault,
          } = args;

          function norm(str: string) {
            if (!str) return '';
            return str.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
          }

          const mainContainer = document.querySelector('[role="main"]') || document.body;
          const fullText = (mainContainer as HTMLElement).innerText || document.body.innerText || '';

          // 1. Author
          let author = (profileAuthorDefault || '').trim();
          if (!author) {
            const authorLink = Array.from(document.querySelectorAll('a[href]')).find((a) => {
              const h = (a as HTMLAnchorElement).href || '';
              const clone = (a as HTMLElement).cloneNode(true) as HTMLElement;
              clone.querySelectorAll('img, svg, i, [aria-hidden="true"]').forEach((x) => x.remove());
              const t = (clone.innerText || clone.textContent || '').trim();
              return (
                (h.includes('sk=reels_tab') ||
                  h.includes('/people/') ||
                  (h.includes('/profile.php') && !h.includes('login'))) &&
                t.length >= 2 &&
                t.length <= 120 &&
                !/đăng nhập|login|facebook|reels|bình luận|chia sẻ/i.test(t)
              );
            });
            if (authorLink) {
              const clone = (authorLink as HTMLElement).cloneNode(true) as HTMLElement;
              clone.querySelectorAll('img, svg, i, [aria-hidden="true"]').forEach((x) => x.remove());
              author = (clone.innerText || clone.textContent || '').trim();
            }
          }
          if (!author || /đăng nhập|login|facebook/i.test(author)) {
            author = profileAuthorDefault || 'Người dùng Facebook';
          }

          // 2. Caption / Text preview
          function isNoiseLine(str: string) {
            const s = str.trim();
            const low = s.toLowerCase();
            if (/^\d+([,.]\d+)?\s*[kmb]?$/i.test(low)) return true;
            if (/^\d+:\d+(\s*\/\s*\d+:\d+)?$/.test(low)) return true;
            if (/^(công khai|public|bạn bè|friends|chỉ mình tôi|only me|theo dõi|follow|đã theo dõi|following)$/i.test(low)) return true;
            if (/^(thích|like|bình luận|comment|chia sẻ|share|gửi|send)$/i.test(low)) return true;
            if (/^\d+\s*(giây|phút|giờ|ngày|tuần|tháng|năm|s|m|h|d|w|y)(\s*·)?$/i.test(low)) return true;
            if (/^·$/.test(low)) return true;
            // Loại bỏ chuỗi giao diện / thông báo hệ thống Facebook
            if (/^(find friends|tìm bạn bè|number of unread notifications|thông báo|notifications|messenger|tin nhắn|hộp thư|trang chủ|home|watch|marketplace|groups|nhóm|gaming|facebook|meta)$/i.test(low)) return true;
            if (/^(xem thêm|see more|thu gọn|see less|bài viết|posts?|chọn ngôn ngữ|language|tùy chọn tài khoản|cài đặt|quyền riêng tư|privacy|settings|help|trợ giúp)$/i.test(low)) return true;
            return false;
          }

          let metaDesc = '';
          const metaEl = document.querySelector('meta[property="og:description"], meta[name="description"]');
          if (metaEl) {
            metaDesc = (metaEl.getAttribute('content') || '').trim();
          }

          const lines = fullText
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);

          let textPreview = '';
          if (
            metaDesc &&
            metaDesc.length > 3 &&
            !/^(đăng nhập|login|facebook|bạn có thích video này|xem thêm)$/i.test(metaDesc.toLowerCase()) &&
            !metaDesc.toLowerCase().includes('number of unread notifications') &&
            !metaDesc.toLowerCase().includes('find friends')
          ) {
            textPreview = metaDesc;
          } else {
            const captionParts: string[] = [];
            for (const line of lines) {
              const low = line.toLowerCase();
              if (/^(đăng nhập|login|bạn quên tài khoản|quên mật khẩu|tạo tài khoản)/i.test(low)) {
                continue;
              }
              if (
                (author && low === author.toLowerCase()) ||
                isNoiseLine(line) ||
                /^(công khai|reels?|xem thêm|email|mật khẩu|tất cả cảm xúc)/i.test(low)
              ) {
                if (captionParts.length > 0) {
                  break;
                }
                continue;
              }
              captionParts.push(line);
              if (captionParts.length >= 3) break;
            }

            textPreview = captionParts.join(' ').trim() || '(FB Reel)';
          }
          textPreview = textPreview.replace(/\s+\d+\s*$/, '').trim();

          // 4. Interactions
          let likes = '0';
          let comments = '0';
          let shares = '0';

          const authorIdx = lines.findIndex((l) => l.toLowerCase() === author.toLowerCase());
          if (authorIdx !== -1) {
            const remaining = lines.slice(authorIdx + 1);
            const nums = remaining.filter((l) => /^\d+([,.]\d+)?\s*[kmb]?$/i.test(l));
            if (nums.length >= 1) likes = nums[0];
            if (nums.length >= 2) comments = nums[1];
            if (nums.length >= 3) shares = nums[2];
          }

          const ariaEls = Array.from(document.querySelectorAll('[aria-label]'));
          for (const el of ariaEls) {
            const label = el.getAttribute('aria-label') || '';
            if (/thích|like|react|cảm xúc/i.test(label)) {
              const m = label.match(/(\d+([,.]\d+)?\s*[kmb]?)/i);
              if (m && likes === '0') likes = m[1];
            }
            if (/bình luận|comment/i.test(label)) {
              const m = label.match(/(\d+([,.]\d+)?\s*[kmb]?)/i);
              if (m && comments === '0') comments = m[1];
            }
            if (/chia sẻ|share/i.test(label)) {
              const m = label.match(/(\d+([,.]\d+)?\s*[kmb]?)/i);
              if (m && shares === '0') shares = m[1];
            }
          }

          // Kiểm tra thêm các role="button" trên giao diện Reel
          const allButtons = Array.from(document.querySelectorAll('[role="button"]'));
          for (const btn of allButtons) {
            const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
            const btnText = (btn.textContent || '').trim();
            const mNum = btnText.match(/^(\d+([,.]\d+)?\s*[kmb]?)$/i);
            const num = mNum ? mNum[1] : '';
            if (num) {
              if (likes === '0' && /thích|like|react|cảm xúc/i.test(aria)) {
                likes = num;
              } else if (comments === '0' && /bình luận|comment/i.test(aria)) {
                comments = num;
              } else if (shares === '0' && /chia sẻ|share/i.test(aria)) {
                shares = num;
              }
            }
          }

          // Regex tìm trực tiếp trong fullText
          if (comments === '0') {
            const mC = fullText.match(/(\d+([,.]\d+)?\s*([kKmM]|nghìn|triệu)?)\s*(bình luận|comments?)/i);
            if (mC) comments = mC[1].trim();
          }
          if (shares === '0') {
            const mS = fullText.match(/(\d+([,.]\d+)?\s*([kKmM]|nghìn|triệu)?)\s*(lượt chia sẻ|chia sẻ|shares?)/i);
            if (mS) shares = mS[1].trim();
          }

          let date = 'Gần đây';
          let timestamp = 0;
          const abbr = document.querySelector('abbr');
          if (abbr) {
            const utime = abbr.getAttribute('data-utime');
            if (utime) timestamp = parseInt(utime, 10) * 1000;
            const title = abbr.getAttribute('title');
            if (title) date = title.trim();
          }
          if (!date || date === 'Gần đây') {
            const links = Array.from(document.querySelectorAll('a[role="link"], a[href*="/reel/"]'));
            for (const l of links) {
              const aria = l.getAttribute('aria-label') || '';
              if (
                aria &&
                /\d|vừa|just/i.test(aria) &&
                !aria.toLowerCase().includes('like') &&
                !aria.toLowerCase().includes('thích') &&
                !aria.toLowerCase().includes('comment')
              ) {
                date = aria.trim();
                break;
              }
              const t = (l as HTMLElement).innerText?.trim() || '';
              if (t && t.length <= 30 && /\d|vừa|just/i.test(t)) {
                date = t.replace(/\n+/g, ' ');
                break;
              }
            }
          }

          return {
            id: `reel_${videoId}`,
            videoId,
            isShared: false,
            hasVideo: true,
            loai: 'Video',
            postUrl: reelUrl,
            videoUrl: reelUrl,
            reelUrl,
            videoPoster: '',
            author,
            postType: 'FB Reel',
            date,
            timestamp,
            textPreview,
            likesCount: likes,
            commentsCount: comments,
            sharesCount: shares,
            viewsCount: viewsCount || '-',
          };
        },
        {
          videoId,
          reelUrl,
          viewsCount,
          profileAuthorDefault,
        }
      );
    } catch {
      return null;
    }
  }

  private async extractPosts(
    page: Page,
    profileOwnerName?: string
  ): Promise<ScannedPostItem[]> {
    return await page.evaluate(
      (args: {
        profileOwnerName?: string;
      }) => {
        const { profileOwnerName } = args;
        function norm(str: string) {
          if (!str) return '';
          return str.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
        }

        function getCleanElementText(element: Element | null): string {
          if (!element) return '';
          try {
            const clone = element.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('img, svg, i, [aria-hidden="true"], [role="img"]').forEach((x) => x.remove());
            return (clone.innerText || clone.textContent || '')
              .replace(/[\n\r\t]+/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
          } catch {
            return (element.textContent || '').trim();
          }
        }

        function isValidAuthorName(t: string): boolean {
          if (!t || t.length < 2 || t.length > 120) return false;

          const low = t.toLowerCase();

          // 1. Blocklist exact or prefixes
          const blocked = [
            'featured',
            'đáng chú ý',
            'bài viết đáng chú ý',
            'gợi ý cho bạn',
            'gợi ý',
            'suggested',
            'suggested for you',
            'quản lý bài viết',
            'quản lý',
            'được tài trợ',
            'sponsored',
            'tin nổi bật',
            'bài viết ghim',
            'ghim',
            'pinned post',
            'may be an image',
            'có thể là hình ảnh',
            'hình ảnh có thể có',
            'người dùng facebook',
            'facebook user',
            'facebook',
            'meta',
            'thích',
            'like',
            'bình luận',
            'comment',
            'chia sẻ',
            'share',
            'gửi',
            'send',
            'công khai',
            'public',
            'chỉ mình tôi',
            'only me',
            'bạn bè',
            'friends',
            'theo dõi',
            'follow',
            'đã theo dõi',
            'following',
            'tham gia',
            'join',
            'xem thêm',
            'see more',
            'xem tất cả',
            'see all',
            'chỉnh sửa',
            'edit',
            'xóa',
            'delete',
            'báo cáo',
            'report',
            'lưu bài viết',
            'save post',
            'ẩn bài viết',
            'hide post',
            'thông báo',
            'notifications',
            'cài đặt',
            'settings',
            'trang chủ',
            'home',
            'video',
            'videos',
            'reels',
            'thước phim',
            'bài viết',
            'posts',
            'ảnh',
            'photos',
            'hình ảnh',
            'album',
          ];

          for (const b of blocked) {
            if (low === b || low.startsWith(b + ' ') || low.startsWith(b + ':') || low.endsWith(' ' + b)) {
              return false;
            }
            if (b.includes('image') || b.includes('hình ảnh')) {
              if (low.includes(b)) return false;
            }
          }

          // 2. Relative time / numbers
          if (/^\d+\s*(giây|phút|giờ|ngày|tuần|tháng|năm|s|m|h|d|w|y)(\s*·)?$/i.test(low)) return false;
          if (/^(vừa xong|just now|hôm qua|yesterday|today|hôm nay)/i.test(low)) return false;
          if (/^\d{1,2}\s+tháng\s+\d{1,2}/i.test(low)) return false;
          if (/^\d{1,2}:\d{2}/.test(low)) return false;

          // 3. Tags & urls
          if (low.startsWith('#') || low.startsWith('http://') || low.startsWith('https://')) return false;

          // 4. Must contain at least one unicode letter
          if (!/[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/.test(t)) return false;

          return true;
        }

        function isComment(el: Element | null) {
          if (!el) return false;
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          if (
            aria.includes('comment by') ||
            aria.includes('bình luận của') ||
            aria.includes('reply by') ||
            aria.includes('reply to')
          )
            return true;
          // Chỉ coi là comment nếu chính thẻ article này là con trực tiếp của một article khác
          // (comment nằm bên trong bài viết cha). KHÔNG dùng querySelector tìm sâu vì
          // bài viết có bình luận mẫu hiển thị bên dưới cũng chứa a[href*="comment_id="]
          const parentArticle = el.parentElement?.closest('div[role="article"]');
          if (parentArticle && parentArticle !== el) return true;
          return false;
        }

        const mainContainer = document.querySelector('[role="main"]') || document.body;

        // 1. Thẻ bài viết timeline có aria-posinset (Facebook Comet Timeline Feed items)
        const posinsetCards = Array.from(mainContainer.querySelectorAll('[aria-posinset]')).filter((c) => {
          if (c.closest('[role="alert"], [aria-live], [aria-label*="Notifications" i], [aria-label*="Thông báo" i]')) return false;
          if (isComment(c)) return false;
          return ((c as HTMLElement).innerText || '').trim().length > 15;
        });

        // 2. Thẻ div[role="article"]
        const rawArticles = Array.from(
          mainContainer.querySelectorAll('div[role="article"]')
        ).filter((a) => {
          if (
            a.closest(
              '[role="alert"], [aria-live], [aria-label*="Notifications" i], [aria-label*="Thông báo" i]'
            )
          )
            return false;
          if (isComment(a)) return false;
          if (a.querySelector('[data-visualcompletion="loading-state"], [aria-label*="Loading" i]')) return false;
          return !a.parentElement?.closest('div[role="article"]');
        });

        const actionSelectors = [
          '[aria-label*="Like" i]',
          '[aria-label*="Thích" i]',
          '[aria-label*="Bày tỏ cảm xúc" i]',
          '[aria-label*="React" i]',
          '[aria-label*="Bình luận" i]',
          '[aria-label*="Comment" i]',
          '[aria-label*="Chia sẻ" i]',
          '[aria-label*="Share" i]',
        ].join(', ');

        const seenCards = new Set<Element>();
        const postElements: Element[] = [];

        // Ưu tiên thẻ aria-posinset vì đây là container chuẩn bao trọn header, content và action bar
        for (const card of posinsetCards) {
          if (!seenCards.has(card)) {
            seenCards.add(card);
            postElements.push(card);
          }
        }

        for (const art of rawArticles) {
          if (!seenCards.has(art) && !postElements.some((p) => p.contains(art) || art.contains(p))) {
            seenCards.add(art);
            postElements.push(art);
          }
        }

        // Bổ sung các thẻ bài viết gom nhóm theo messages (data-ad-preview="message")
        const messages = Array.from(
          mainContainer.querySelectorAll('div[data-ad-preview="message"]')
        );
        for (const msg of messages) {
          if (
            msg.closest(
              '[role="alert"], [aria-live], [aria-label*="Notifications" i], [aria-label*="Thông báo" i]'
            )
          )
            continue;
          if (isComment(msg)) continue;
          if (postElements.some((p) => p.contains(msg))) continue;

          let card: Element | null = msg;
          let steps = 0;
          let bestCandidate: Element | null = null;
          while (
            card &&
            card.parentElement &&
            card.parentElement !== document.body &&
            steps < 25
          ) {
            const hasActions = Boolean(card.querySelector(actionSelectors));
            const hasHeader = Boolean(card.querySelector('h2, h3, h4, [role="heading"], strong'));
            if (hasActions && hasHeader) {
              bestCandidate = card;
              break;
            }
            if (hasActions && !bestCandidate) {
              bestCandidate = card;
            }
            card = card.parentElement;
            steps++;
          }
          const finalCard = bestCandidate || card;
          if (finalCard && !seenCards.has(finalCard)) {
            seenCards.add(finalCard);
            postElements.push(finalCard);
          }
        }

        const actionButtons = Array.from(
          mainContainer.querySelectorAll(actionSelectors)
        );
        for (const btn of actionButtons) {
          if (
            btn.closest(
              '[role="alert"], [aria-live], [aria-label*="Notifications" i], [aria-label*="Thông báo" i]'
            )
          )
            continue;
          if (isComment(btn.closest('div[role="article"]'))) continue;
          const alreadyCovered = postElements.some((c) => c.contains(btn));
          if (!alreadyCovered) {
            let card: Element | null = btn;
            let steps = 0;
            let bestCandidate: Element | null = null;
            while (
              card &&
              card.parentElement &&
              card.parentElement !== document.body &&
              steps < 25
            ) {
              const hasHeader = Boolean(card.querySelector('h2, h3, h4, [role="heading"], strong'));
              const hasContent = Boolean(card.querySelector('div[data-ad-preview="message"], video, img, [role="img"]'));
              if (hasHeader && hasContent) {
                bestCandidate = card;
                break;
              }
              if (hasHeader || hasContent) {
                bestCandidate = card;
              }
              card = card.parentElement;
              steps++;
            }
            const finalCard = bestCandidate || card;
            if (finalCard && !seenCards.has(finalCard)) {
              seenCards.add(finalCard);
              postElements.push(finalCard);
            }
          }
        }

        // Trích xuất chính xác lượt Thích, Bình luận, Chia sẻ từ Facebook Comet DOM
        function extractInteractions(card: Element) {
          let likes = '0';
          let comments = '0';
          let shares = '0';

          const fullText = ((card as HTMLElement).innerText || '').trim();

          // A. Quét tất cả button / action bên trong card
          const buttons = Array.from(card.querySelectorAll('[role="button"], button'));
          for (const btn of buttons) {
            const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
            const text = ((btn as HTMLElement).innerText || '').trim();
            const mNum = text.match(/^(\d+([,.]\d+)?\s*[kmb]?)$/i);
            const num = mNum ? mNum[1] : '';

            // 1. LIKE / REACT
            if (/^(like|thích|react|bày tỏ)/i.test(aria) || /^(\d+.*(thích|like|người))/i.test(aria)) {
              if (num && likes === '0') likes = num;
              const mAriaNum = aria.match(/(\d+([,.]\d+)?\s*[kmb]?)/i);
              if (mAriaNum && likes === '0') likes = mAriaNum[1];
            }
            // 2. COMMENT
            else if (/comment|bình luận/i.test(aria)) {
              if (num && comments === '0') comments = num;
              const mAriaNum = aria.match(/(\d+([,.]\d+)?\s*[kmb]?)\s*(bình luận|comment)/i);
              if (mAriaNum && comments === '0') comments = mAriaNum[1];
            }
            // 3. SHARE
            else if (/share|chia sẻ|send this to friends|gửi nội dung này/i.test(aria)) {
              if (num && shares === '0') shares = num;
              const mAriaNum = aria.match(/(\d+([,.]\d+)?\s*[kmb]?)\s*(lượt chia sẻ|chia sẻ|share)/i);
              if (mAriaNum && shares === '0') shares = mAriaNum[1];
            }
          }

          // B. Nếu chưa có likes, kiểm tra các nút thống kê cảm xúc (Like: 18 people, Love: 2 people...)
          if (likes === '0') {
            let totalReactions = 0;
            let foundAny = false;
            for (const btn of buttons) {
              const aria = btn.getAttribute('aria-label') || '';
              const mReact = aria.match(/^(?:Like|Love|Care|Haha|Wow|Sad|Angry|Thích|Yêu thích|Thương thương|Haha|Wow|Buồn|Phẫn nộ):\s*(\d+([,.]\d+)?\s*[kmb]?)/i);
              if (mReact) {
                foundAny = true;
                let val = parseFloat(mReact[1].replace(',', '.'));
                if (/k/i.test(mReact[1])) val *= 1000;
                else if (/m/i.test(mReact[1])) val *= 1000000;
                totalReactions += val;
              }
            }
            if (foundAny && totalReactions > 0) {
              likes = String(Math.round(totalReactions));
            }
          }

          // C. Kiểm tra text patterns trong fullText ("N bình luận", "N lượt chia sẻ")
          if (comments === '0') {
            const mCmt = fullText.match(/(\d+([,.]\d+)?\s*([kKmM]|nghìn|triệu)?)\s*(bình luận|comments?)/i);
            if (mCmt) comments = mCmt[1].trim();
          }
          if (shares === '0') {
            const mShare = fullText.match(/(\d+([,.]\d+)?\s*([kKmM]|nghìn|triệu)?)\s*(lượt chia sẻ|chia sẻ|shares?)/i);
            if (mShare) shares = mShare[1].trim();
          }

          // D. Kiểm tra chuỗi các thẻ span chứa số ở vùng action bar
          if (likes === '0' || (comments === '0' && shares === '0')) {
            const numSpans = Array.from(card.querySelectorAll('span'))
              .map((s) => (s.innerText || '').trim())
              .filter((t) => /^\d+([,.]\d+)?\s*[kmb]?$/i.test(t));

            // Trên Facebook post cards, các con số ở thanh công cụ tương tác xuất hiện theo thứ tự: [likes, comments, shares]
            if (numSpans.length >= 1 && likes === '0') {
              likes = numSpans[0];
            }
            if (numSpans.length >= 2 && comments === '0') {
              comments = numSpans[1];
            }
            if (numSpans.length >= 3 && shares === '0') {
              shares = numSpans[2];
            }
          }

          return { likes, comments, shares };
        }

        const results: any[] = [];

        for (const el of postElements) {
          const fullText = (el as HTMLElement).innerText || '';
          const textNorm = norm(fullText);
          const allMsgs = Array.from(el.querySelectorAll('div[data-ad-preview="message"]'));
          const isShared =
            /(?:đã chia sẻ một (?:bài viết|video|thước phim|ảnh|liên kết)|đã chia sẻ bài viết của|đã chia sẻ video của|shared a (?:post|video|reel|link|photo)|shared post from)/i.test(
              fullText.slice(0, 500)
            ) ||
            (allMsgs.length > 1 &&
              Boolean(
                el.querySelector(
                  '[aria-label*="Được chia sẻ" i], [aria-label*="Shared with" i], div[style*="border"] h2, div[style*="border"] h3, div[style*="border"] h4'
                )
              ));

          let textPreview = '';
          if (allMsgs.length > 0) {
            textPreview = (allMsgs[0] as HTMLElement).innerText.trim();
          } else {
            const filteredLines = fullText
              .split('\n')
              .map((l) => l.trim())
              .filter((l) => {
                if (!l || l === 'Facebook') return false;
                const low = l.toLowerCase();
                if (/^(find friends|tìm bạn bè|number of unread notifications|thông báo|notifications|messenger|tin nhắn|hộp thư|trang chủ|home|watch|marketplace|groups|nhóm|gaming|facebook|meta)$/i.test(low)) return false;
                if (/^(thích|like|bình luận|comment|chia sẻ|share|gửi|send)$/i.test(low)) return false;
                if (/^(công khai|public|bạn bè|friends|chỉ mình tôi|only me|theo dõi|follow|đã theo dõi|following)$/i.test(low)) return false;
                if (/^\d+\s*(giây|phút|giờ|ngày|tuần|tháng|năm|s|m|h|d|w|y)(\s*·)?$/i.test(low)) return false;
                return true;
              });
            textPreview = filteredLines.slice(0, 3).join(' ');
          }

          let hasVideo = false;
          let videoUrl = '';
          let videoPoster = '';
          let videoId = '';

          const videoIdEl = el.querySelector('[data-video-id]');
          if (videoIdEl) {
            videoId = videoIdEl.getAttribute('data-video-id') || '';
          }

          const allLinks = Array.from(el.querySelectorAll('a[href]')) as HTMLAnchorElement[];
          if (!videoId) {
            const vLinks = allLinks.filter((a) => {
              const h = a.href.toLowerCase();
              return (
                (h.includes('/reel/') || h.includes('/videos/') || h.includes('/watch')) &&
                !h.includes('/hashtag/')
              );
            });
            for (const vl of vLinks) {
              const m = vl.href.match(/(?:reel\/|videos\/|\?v=)(\d+)/);
              if (m) {
                videoId = m[1];
                break;
              }
            }
          }

          if (videoId) {
            hasVideo = true;
            videoUrl = `https://www.facebook.com/reel/${videoId}/`;
          }

          const videoEl = el.querySelector('video');
          if (videoEl) {
            hasVideo = true;
            videoPoster = videoEl.getAttribute('poster') || '';
            if (!videoUrl) videoUrl = videoEl.src || videoPoster;
          }

          if (!hasVideo) {
            const hasPlay = el.querySelector(
              '[aria-label*="Play" i], [aria-label*="Phát" i], [aria-label*="Reel" i]'
            );
            if (hasPlay) hasVideo = true;
          }

          // Phát hiện hình ảnh trong bài (ảnh nội dung thật, loại trừ icon/avatar nhỏ)
          const bigImgs = Array.from(el.querySelectorAll('img')).filter((img) => {
            const src = img.getAttribute('src') || '';
            const w = img.width || img.naturalWidth || 0;
            return (src.includes('scontent') || src.includes('fbcdn')) && w >= 150;
          });
          const imgDivs = Array.from(el.querySelectorAll('div[role="img"]')).filter((d) => {
            const r = (d as HTMLElement).getBoundingClientRect();
            return r.width >= 150 && r.height >= 100;
          });
          const hasImage = bigImgs.length > 0 || imgDivs.length > 0;

          // Link bài viết
          let postUrl = '';

          // 1. Tìm các link permalink trực tiếp (/posts/, /permalink.php, story.php)
          const directPermalinks = allLinks.filter((a) => {
            const h = a.href || '';
            return (
              (h.includes('/posts/') ||
                h.includes('/permalink.php') ||
                h.includes('story.php')) &&
              !h.includes('/hashtag/') &&
              !h.includes('comment_id=')
            );
          });

          // 2. Tìm link ảnh (/photo/, photo.php, /photos/, set=pcb., fbid=)
          const photoPermalinks = allLinks.filter((a) => {
            const h = a.href || '';
            return (
              (h.includes('photo.php') ||
                h.includes('/photo/') ||
                h.includes('/photo?') ||
                h.includes('/photos/') ||
                h.includes('set=pcb.') ||
                h.includes('fbid=')) &&
              !h.includes('/hashtag/') &&
              !h.includes('comment_id=')
            );
          });

          // 3. Tìm link stories (/stories/<id>/<base64>)
          const storyPermalinks = allLinks.filter((a) => {
            const h = a.href || '';
            return h.includes('/stories/') && !h.includes('/hashtag/');
          });

          // 4. Tìm link video/reel (/reel/, /videos/, /watch)
          const videoPermalinks = allLinks.filter((a) => {
            const h = a.href || '';
            return (
              (h.includes('/reel/') || h.includes('/videos/') || h.includes('/watch')) &&
              !h.includes('/hashtag/')
            );
          });

          // 5. Thẻ link thời gian (thường chứa permalink chính xác của bài)
          const timeLink = allLinks.find((a) => {
            const h = a.href || '';
            const aria = a.getAttribute('aria-label') || '';
            const t = a.innerText.trim();
            const hasTimeMarker =
              /\d|vừa|just|hôm qua|yesterday/i.test(aria) ||
              (t.length <= 30 && /\d|vừa|just|hôm qua|yesterday/i.test(t));
            return (
              hasTimeMarker &&
              !h.includes('/hashtag/') &&
              !h.includes('comment_id=') &&
              !h.includes('profile.php?id=')
            );
          });

          if (directPermalinks.length > 0) {
            postUrl = directPermalinks[0].href;
          } else if (timeLink && !timeLink.href.includes('#?')) {
            postUrl = timeLink.href;
          } else if (photoPermalinks.length > 0) {
            postUrl = photoPermalinks[0].href;
          } else if (storyPermalinks.length > 0) {
            const sUrl = storyPermalinks[0].href;
            try {
              const mS = sUrl.match(/\/stories\/(?:\d+|[^\/]+)\/([A-Za-z0-9+/=]+)/);
              if (mS && mS[1]) {
                const dec = atob(mS[1]);
                const mDigits = dec.match(/:(\d{10,})/);
                if (mDigits) {
                  postUrl = `https://www.facebook.com/${mDigits[1]}`;
                } else {
                  postUrl = sUrl;
                }
              } else {
                postUrl = sUrl;
              }
            } catch {
              postUrl = sUrl;
            }
          } else if (videoId) {
            postUrl = `https://www.facebook.com/reel/${videoId}/`;
          } else if (videoPermalinks.length > 0) {
            postUrl = videoPermalinks[0].href;
          } else {
            // Tìm kiếm mở rộng thêm thẻ <a> có chứa fbid, post_id, story_fbid
            const cand = allLinks.find((a) => {
              const h = a.href || '';
              return (
                (h.includes('fbid=') ||
                  h.includes('post_id=') ||
                  h.includes('story_fbid=')) &&
                !h.includes('/hashtag/') &&
                !h.includes('comment_id=')
              );
            });
            postUrl = cand ? cand.href : 'N/A';
          }

          if (!postUrl) {
            postUrl = 'N/A';
          }

          // Chuẩn hóa permalink thành URL cố định (cắt bỏ tham số tracking __cft__, __tn__, sk=timeline,...)
          if (postUrl && postUrl !== 'N/A') {
            if (postUrl.includes('permalink.php') || postUrl.includes('story.php')) {
              try {
                const u = new URL(postUrl);
                const sf = u.searchParams.get('story_fbid') || u.searchParams.get('fbid');
                const id = u.searchParams.get('id');
                if (sf && id) {
                  postUrl = `https://www.facebook.com/permalink.php?story_fbid=${sf}&id=${id}`;
                }
              } catch {
                // Bỏ qua
              }
            } else if (postUrl.includes('/posts/')) {
              postUrl = postUrl.split('?')[0].split('#')[0];
            } else if (postUrl.includes('post_id=') || postUrl.includes('fbid=')) {
              // Chỉ giữ đúng ngữ cảnh bài viết/ảnh (id, post_id, fbid, set), bỏ tracking và sk=timeline
              try {
                const u = new URL(postUrl);
                const keep: string[] = [];
                const pid = u.searchParams.get('id');
                const postIdParam = u.searchParams.get('post_id');
                const fbid = u.searchParams.get('fbid');
                const setParam = u.searchParams.get('set');
                if (pid) keep.push(`id=${pid}`);
                if (postIdParam) keep.push(`post_id=${postIdParam}`);
                if (fbid) keep.push(`fbid=${fbid}`);
                if (setParam) keep.push(`set=${encodeURIComponent(setParam)}`);
                postUrl =
                  keep.length > 0 ? `${u.origin}${u.pathname}?${keep.join('&')}` : postUrl.split('?')[0];
              } catch {
                // Bỏ qua
              }
            }
          }

          const reelUrl = videoId ? `https://www.facebook.com/reel/${videoId}/` : videoUrl;

          // Tác giả
          let author = '';
          let attachedAuthor = '';

          // Tìm các đề cử tên tác giả từ phần đầu bài viết (h2, h3, h4, role="heading", strong, link tác giả)
          const headingCandidates: string[] = [];
          const headerEls = Array.from(
            el.querySelectorAll('h2, h3, h4, [role="heading"], strong')
          ) as HTMLElement[];

          for (const h of headerEls) {
            // Anchor link tác giả bên trong heading
            const aLinks = Array.from(h.querySelectorAll('a[role="link"], a[href]')) as HTMLElement[];
            for (const a of aLinks) {
              const text = getCleanElementText(a);
              if (isValidAuthorName(text)) {
                if (!headingCandidates.includes(text)) headingCandidates.push(text);
              }
            }
            // Nội dung chính của thẻ heading (bỏ phần " · Thêm", " · Đã theo dõi" nếu có)
            const hText = getCleanElementText(h);
            const firstPart = hText.split(/[·•▶>]/)[0].trim();
            if (isValidAuthorName(firstPart)) {
              if (!headingCandidates.includes(firstPart)) headingCandidates.push(firstPart);
            } else if (isValidAuthorName(hText)) {
              if (!headingCandidates.includes(hText)) headingCandidates.push(hText);
            }
          }

          // Kiểm tra nếu có tên nguồn bài viết chia sẻ (ví dụ: "Shared post from Cộng đồng 47" hoặc "đã chia sẻ bài viết của ...")
          const mSharedFrom = fullText.match(
            /(?:shared post from|chia sẻ bài viết của|chia sẻ video của|chia sẻ thước phim của|chia sẻ liên kết từ)\s+([^·\n\r]+)/i
          );
          if (mSharedFrom) {
            const rawShared = mSharedFrom[1].trim();
            if (isValidAuthorName(rawShared)) {
              attachedAuthor = rawShared;
            }
          }

          if (isShared && !attachedAuthor && headingCandidates.length > 1) {
            // Đề cử thứ 2 thường là tác giả bài gốc được chia sẻ
            const second = headingCandidates.find(
              (c) =>
                (!profileOwnerName || c.toLowerCase() !== profileOwnerName.toLowerCase()) &&
                isValidAuthorName(c)
            );
            if (second) attachedAuthor = second;
          }

          // Quyết định tác giả người đăng (author):
          // Khi đang duyệt timeline của một Profile/Fanpage:
          // Người đăng bài viết/chia sẻ trên timeline này chính là chủ profile đó!
          if (profileOwnerName && isValidAuthorName(profileOwnerName)) {
            author = profileOwnerName;
          } else {
            // Nếu chưa có tên profile mặc định, lấy từ ứng viên hợp lệ đầu tiên
            const firstValid = headingCandidates.find((c) => isValidAuthorName(c));
            if (firstValid) {
              author = firstValid;
            } else {
              const h1Text = getCleanElementText(document.querySelector('h1'));
              if (isValidAuthorName(h1Text)) {
                author = h1Text;
              } else {
                author = 'Người dùng Facebook';
              }
            }
          }

          const postType = isShared ? 'Chia sẻ' : 'FB Reel';
          const loai = isShared ? 'Chia sẻ' : hasVideo ? 'Video' : hasImage ? 'Hình ảnh' : 'Bài viết';

          // Tương tác (Thích, Bình luận, Chia sẻ)
          const interactions = extractInteractions(el);
          const likesCount = interactions.likes;
          const commentsCount = interactions.comments;
          const sharesCount = interactions.shares;

          let viewsCount = '-';
          const mViews = fullText.match(
            /(\d+([,.]\d+)?\s*(k|m|nghìn|triệu)?)\s*(lượt xem|views?|lượt phát|plays?)/i
          );
          if (mViews) viewsCount = mViews[1].replace(/\s+/g, '');

          let postDate = 'Gần đây';
          let postDateTimestamp = 0;

          // 1. Thẻ abbr (data-utime hoặc title)
          const abbrEl = el.querySelector('abbr');
          if (abbrEl) {
            const utime = abbrEl.getAttribute('data-utime');
            if (utime) {
              postDateTimestamp = parseInt(utime, 10) * 1000;
            }
            const title = abbrEl.getAttribute('title');
            if (title) {
              postDate = title.trim();
            }
          }

          // 2. Thẻ link chứa thời gian
          const timeLinks = allLinks.filter((a) => {
            const h = a.href.toLowerCase();
            return (
              h.includes('/posts/') ||
              h.includes('/videos/') ||
              h.includes('/reel/') ||
              h.includes('story.php') ||
              h.includes('permalink.php') ||
              h.includes('photo.php') ||
              h.includes('post_id=')
            );
          });
          for (const tl of timeLinks) {
            const aria = tl.getAttribute('aria-label') || '';
            if (
              aria &&
              /\d|vừa|just/i.test(aria) &&
              !aria.toLowerCase().includes('like') &&
              !aria.toLowerCase().includes('thích') &&
              !aria.toLowerCase().includes('comment')
            ) {
              postDate = aria.trim();
              break;
            }
            const t = tl.innerText.trim();
            if (t && t.length <= 30 && /\d|vừa|just/i.test(t)) {
              postDate = t.replace(/\n+/g, ' ');
              break;
            }
          }

          const cleanSnippet = textPreview
            .slice(0, 40)
            .replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '');

          // Ưu tiên postUrl duy nhất (chứa story_fbid hoặc permalink của bài viết) kèm postDate
          // để tránh nuốt mất bài viết thứ 2 nếu cùng chia sẻ 1 video hoặc cùng nội dung tiêu đề
          let postUniqueKey = '';
          if (postUrl && postUrl !== 'N/A' && !postUrl.includes('window.location')) {
            postUniqueKey = postUrl;
          } else {
            postUniqueKey = `${cleanSnippet}_${videoId || fullText.slice(0, 30)}`;
          }
          if (postDate && postDate !== 'Gần đây') {
            postUniqueKey += `_${postDate}`;
          }
          const id = `${isShared ? 'share' : 'orig'}_${postUniqueKey}`;

          results.push({
            id,
            videoId: videoId || '',
            isShared,
            hasVideo,
            loai,
            postUrl: postUrl || 'N/A',
            videoUrl: videoUrl || 'N/A',
            reelUrl: reelUrl || 'N/A',
            videoPoster: videoPoster || '',
            author,
            attachedAuthor: attachedAuthor || undefined,
            postType,
            date: postDate,
            timestamp: postDateTimestamp || 0,
            textPreview: textPreview || '(Không có nội dung văn bản)',
            viewsCount,
            likesCount,
            commentsCount,
            sharesCount,
          });
        }

        return results;
      },
      { profileOwnerName }
    );
  }

  private extractStoriesFromObject(obj: any, results: any[] = []): any[] {
    if (!obj || typeof obj !== 'object') return results;

    if (obj.permalink_url) {
      const pUrl = String(obj.permalink_url).replace(/\\\//g, '/');
      const msg =
        obj.message?.text ||
        obj.comet_sections?.content?.story?.message?.text ||
        '';
      const author = obj.actors?.[0]?.name || '';
      const authorId = obj.actors?.[0]?.id || '';

      let attachedReelUrl = '';
      let attachedVideoId = '';
      let attachedAuthor = '';
      const attached =
        obj.attached_story ||
        obj.comet_sections?.attached_story ||
        obj.comet_sections?.content?.story?.attached_story;
      if (attached) {
        if (attached.permalink_url) {
          attachedReelUrl = String(attached.permalink_url).replace(/\\\//g, '/');
          const mId = attachedReelUrl.match(/(?:reel\/|videos\/|\?v=)(\d+)/);
          if (mId) attachedVideoId = mId[1];
        }
        if (!attachedVideoId && attached.attachments) {
          const att = attached.attachments[0];
          const media = att?.media || att?.styles?.attachment?.media;
          if (media?.id) attachedVideoId = String(media.id);
          if (media?.url) attachedReelUrl = String(media.url).replace(/\\\//g, '/');
          else if (att?.url) attachedReelUrl = String(att.url).replace(/\\\//g, '/');
        }
        if (!attachedReelUrl && attachedVideoId) {
          attachedReelUrl = `https://www.facebook.com/reel/${attachedVideoId}/`;
        }
        attachedAuthor = attached.actors?.[0]?.name || '';
      }

      let creation_time =
        obj.creation_time ||
        attached?.creation_time ||
        obj.comet_sections?.content?.story?.creation_time ||
        0;
      if (typeof creation_time === 'string') {
        creation_time = parseInt(creation_time, 10) || 0;
      }

      // Extract interaction counts from GraphQL feedback object
      let reaction_count = 0;
      let comment_count = 0;
      let share_count = 0;

      // Try multiple paths where Facebook stores feedback data
      const feedbackPaths = [
        obj.feedback,
        obj.comet_sections?.feedback?.story?.story_ufi_container?.story?.feedback_context?.feedback_target_with_context?.ufi_renderer?.feedback,
        obj.comet_sections?.feedback?.story?.feedback_context?.feedback_target_with_context?.ufi_renderer?.feedback,
        obj.comet_sections?.feedback?.story?.comet_feed_ufi_container?.story?.feedback_context?.feedback_target_with_context?.ufi_renderer?.feedback,
        obj.comet_sections?.content?.story?.feedback,
        obj.story?.feedback_context?.feedback_target_with_context?.ufi_renderer?.feedback,
        obj.feedback_context?.feedback_target_with_context?.ufi_renderer?.feedback,
      ];

      for (const fb of feedbackPaths) {
        if (!fb || typeof fb !== 'object') continue;

        // Reactions (likes)
        if (!reaction_count) {
          reaction_count =
            fb.reaction_count?.count ||
            fb.unified_reactors?.count ||
            fb.top_reactions?.count ||
            fb.reactors?.count ||
            0;
          if (!reaction_count && fb.i18n_reaction_count) {
            const mR = String(fb.i18n_reaction_count).match(/(\d+([,.]\d+)?)\s*([kKmM]|nghìn|triệu)?/);
            if (mR) {
              let n = parseFloat(mR[1].replace(',', '.'));
              const unit = (mR[3] || '').toLowerCase();
              if (unit === 'k' || unit === 'nghìn') n *= 1000;
              else if (unit === 'm' || unit === 'triệu') n *= 1000000;
              reaction_count = Math.round(n);
            }
          }
        }

        // Comments
        if (!comment_count) {
          comment_count =
            fb.total_comment_count ||
            fb.comment_count?.total_count ||
            fb.comment_rendering_instance?.comments?.total_count ||
            fb.comments_count_summary_to_context?.count ||
            0;
          if (!comment_count && fb.i18n_comment_count) {
            const mC = String(fb.i18n_comment_count).match(/(\d+([,.]\d+)?)\s*([kKmM]|nghìn|triệu)?/);
            if (mC) {
              let n = parseFloat(mC[1].replace(',', '.'));
              const unit = (mC[3] || '').toLowerCase();
              if (unit === 'k' || unit === 'nghìn') n *= 1000;
              else if (unit === 'm' || unit === 'triệu') n *= 1000000;
              comment_count = Math.round(n);
            }
          }
        }

        // Shares
        if (!share_count) {
          share_count = fb.share_count?.count || 0;
          if (!share_count && fb.i18n_share_count) {
            const mS = String(fb.i18n_share_count).match(/(\d+([,.]\d+)?)\s*([kKmM]|nghìn|triệu)?/);
            if (mS) {
              let n = parseFloat(mS[1].replace(',', '.'));
              const unit = (mS[3] || '').toLowerCase();
              if (unit === 'k' || unit === 'nghìn') n *= 1000;
              else if (unit === 'm' || unit === 'triệu') n *= 1000000;
              share_count = Math.round(n);
            }
          }
        }

        if (reaction_count || comment_count || share_count) break;
      }

      results.push({
        permalink_url: pUrl,
        msg,
        author,
        authorId,
        isShared: Boolean(attached),
        attachedReelUrl,
        attachedVideoId,
        attachedAuthor,
        creation_time: Number(creation_time) || 0,
        reaction_count,
        comment_count,
        share_count,
      });
    }

    for (const k of Object.keys(obj)) {
      this.extractStoriesFromObject(obj[k], results);
    }
    return results;
  }

  private parseGraphQLStories(text: string): any[] {
    const stories: any[] = [];
    const lines = text.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        this.extractStoriesFromObject(parsed, stories);
      } catch {}
    }
    return stories;
  }

  private parseStoriesFromHtml(html: string): any[] {
    const list: any[] = [];
    const scriptRegex = /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = scriptRegex.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(m[1]);
        this.extractStoriesFromObject(parsed, list);
      } catch {}
    }
    return list;
  }

  public cleanTextForMatching(str: string): string {
    if (!str) return '';
    return str
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  public extractPostIdFromUrl(url: string): string | null {
    if (!url || url === 'N/A') return null;
    const m = url.match(/(?:posts|videos|reel|fbid=|story_fbid=|\/)\/?(pfbid[a-zA-Z0-9]+|\d{9,})/);
    return m ? m[1] : null;
  }

  public parseFacebookDate(raw: any): { dateObj: Date | null; timestamp: number; formatted: string } {
    if (!raw) return { dateObj: null, timestamp: 0, formatted: 'Gần đây' };

    // 1. Unix timestamp
    if (typeof raw === 'number' || /^\d{9,13}$/.test(String(raw).trim())) {
      let num = typeof raw === 'number' ? raw : parseInt(String(raw).trim(), 10);
      if (num > 100000000000) num = Math.floor(num / 1000);
      const d = new Date(num * 1000);
      if (!isNaN(d.getTime())) {
        return {
          dateObj: d,
          timestamp: d.getTime(),
          formatted: this.formatDate(d),
        };
      }
    }

    const str = String(raw).trim();
    const now = new Date();

    // 2. Relative dates
    if (/^(vừa xong|vừa|mới đây|gần đây|just now|today|hôm nay)$/i.test(str)) {
      return {
        dateObj: now,
        timestamp: now.getTime(),
        formatted: this.formatDate(now),
      };
    }

    const mMin = str.match(/(\d+)\s*(?:phút|mins?|m\b)/i);
    if (mMin) {
      const d = new Date(now.getTime() - parseInt(mMin[1], 10) * 60 * 1000);
      return { dateObj: d, timestamp: d.getTime(), formatted: `${this.formatDate(d)} (${str})` };
    }

    const mHour = str.match(/(\d+)\s*(?:giờ|hours?|h\b)/i);
    if (mHour) {
      const d = new Date(now.getTime() - parseInt(mHour[1], 10) * 3600 * 1000);
      return { dateObj: d, timestamp: d.getTime(), formatted: `${this.formatDate(d)} (${str})` };
    }

    const mYesterday = str.match(/(?:hôm qua|yesterday)(?:\s*(?:lúc|at)?\s*(\d{1,2}):(\d{2}))?/i);
    if (mYesterday) {
      const d = new Date(now.getTime() - 86400 * 1000);
      if (mYesterday[1] && mYesterday[2]) {
        d.setHours(parseInt(mYesterday[1], 10), parseInt(mYesterday[2], 10), 0, 0);
      }
      return { dateObj: d, timestamp: d.getTime(), formatted: `${this.formatDate(d)} (${str})` };
    }

    const mDay = str.match(/(\d+)\s*(?:ngày|days?|d\b)/i);
    if (mDay) {
      const d = new Date(now.getTime() - parseInt(mDay[1], 10) * 86400 * 1000);
      return { dateObj: d, timestamp: d.getTime(), formatted: `${this.formatDate(d)} (${str})` };
    }

    const mWeek = str.match(/(\d+)\s*(?:tuần|weeks?|w\b)/i);
    if (mWeek) {
      const d = new Date(now.getTime() - parseInt(mWeek[1], 10) * 7 * 86400 * 1000);
      return { dateObj: d, timestamp: d.getTime(), formatted: `${this.formatDate(d)} (${str})` };
    }

    const mMonth = str.match(/(\d+)\s*(?:tháng|months?)\s*(?:trước|ago)?$/i);
    if (mMonth && !str.includes('lúc')) {
      const d = new Date(now.getTime() - parseInt(mMonth[1], 10) * 30 * 86400 * 1000);
      return { dateObj: d, timestamp: d.getTime(), formatted: `${this.formatDate(d)} (${str})` };
    }

    const mYear = str.match(/(\d+)\s*(?:năm|years?)\s*(?:trước|ago)?$/i);
    if (mYear && !str.includes('lúc')) {
      const d = new Date(now.getTime() - parseInt(mYear[1], 10) * 365 * 86400 * 1000);
      return { dateObj: d, timestamp: d.getTime(), formatted: `${this.formatDate(d)} (${str})` };
    }

    // 3. Absolute Vietnamese date: "8 tháng 9, 2026 lúc 14:45" or "8 Tháng 9" or "8 tháng 9, 2026"
    const mVnDate = str.match(/(\d{1,2})\s+tháng\s+(\d{1,2})(?:[,\s]+(\d{4}))?(?:\s*(?:lúc|at)?\s*(\d{1,2}):(\d{2}))?/i);
    if (mVnDate) {
      const day = parseInt(mVnDate[1], 10);
      const month = parseInt(mVnDate[2], 10) - 1;
      let year = mVnDate[3] ? parseInt(mVnDate[3], 10) : now.getFullYear();
      if (!mVnDate[3] && month > now.getMonth()) {
        year -= 1;
      }
      const hasTime = Boolean(mVnDate[4]);
      const hour = hasTime ? parseInt(mVnDate[4], 10) : 0;
      const min = hasTime ? parseInt(mVnDate[5], 10) : 0;
      const d = new Date(year, month, day, hour, min, 0);
      return {
        dateObj: d,
        timestamp: d.getTime(),
        formatted: hasTime ? this.formatDate(d) : this.formatDate(d, false),
      };
    }

    // 4. Standard formats: YYYY-MM-DD (kèm giờ nếu có) or DD/MM/YYYY
    const mStd = str.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/);
    if (mStd) {
      const hasTime = Boolean(mStd[4]);
      const d = new Date(
        parseInt(mStd[1], 10),
        parseInt(mStd[2], 10) - 1,
        parseInt(mStd[3], 10),
        hasTime ? parseInt(mStd[4], 10) : 0,
        hasTime ? parseInt(mStd[5], 10) : 0,
        0
      );
      return { dateObj: d, timestamp: d.getTime(), formatted: hasTime ? this.formatDate(d) : this.formatDate(d, false) };
    }
    const mDmy = str.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T]+(\d{1,2}):(\d{2}))?/);
    if (mDmy) {
      const hasTime = Boolean(mDmy[4]);
      const d = new Date(
        parseInt(mDmy[3], 10),
        parseInt(mDmy[2], 10) - 1,
        parseInt(mDmy[1], 10),
        hasTime ? parseInt(mDmy[4], 10) : 0,
        hasTime ? parseInt(mDmy[5], 10) : 0,
        0
      );
      return { dateObj: d, timestamp: d.getTime(), formatted: hasTime ? this.formatDate(d) : this.formatDate(d, false) };
    }

    // 5. English Month date: "September 8, 2026"
    const enMonths: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const mEn = str.match(/([a-zA-Z]{3,9})\s+(\d{1,2})(?:[,\s]+(\d{4}))?/i);
    if (mEn) {
      const mStr = mEn[1].slice(0, 3).toLowerCase();
      if (enMonths[mStr] !== undefined) {
        const month = enMonths[mStr];
        const day = parseInt(mEn[2], 10);
        const year = mEn[3] ? parseInt(mEn[3], 10) : now.getFullYear();
        const d = new Date(year, month, day);
        return { dateObj: d, timestamp: d.getTime(), formatted: this.formatDate(d, false) };
      }
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return { dateObj: d, timestamp: d.getTime(), formatted: this.formatDate(d) };
    }

    return { dateObj: null, timestamp: 0, formatted: str };
  }

  private formatDate(d: Date, includeTime = true): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const YYYY = d.getFullYear();
    const MM = pad(d.getMonth() + 1);
    const DD = pad(d.getDate());
    if (!includeTime) return `${YYYY}-${MM}-${DD}`;
    const HH = pad(d.getHours());
    const mm = pad(d.getMinutes());
    return `${YYYY}-${MM}-${DD} ${HH}:${mm}`;
  }

  public isDateInRange(
    timestamp: number | undefined,
    startTimestamp: number | null,
    endTimestamp: number | null
  ): boolean {
    if (!startTimestamp && !endTimestamp) return true;
    if (!timestamp || timestamp === 0) return true; // Giữ lại nếu không rõ thời gian để tránh sót bài
    if (startTimestamp && timestamp < startTimestamp) return false;
    if (endTimestamp && timestamp > endTimestamp) return false;
    return true;
  }
}

