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
    private readonly videosGateway: VideosGateway
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
      targetTag: '',
      maxScrolls: 5,
      cookieCount: cookies.length,
      rawCookie,
    };
  }

  public saveCookie(content: string): { success: boolean; cookieCount: number } {
    const filePath = this.getEffectiveCookiePath();
    fs.writeFileSync(filePath, (content || '').trim(), 'utf8');
    const cookies = this.loadCookies();
    return { success: true, cookieCount: cookies.length };
  }

  public getState(): ProfileScannerState {
    return this.state;
  }

  public clearState(): void {
    this.state = {
      status: 'IDLE',
      logs: ['[HỆ THỐNG] Đã làm mới nhật ký và kết quả quét.'],
      postsCount: 0,
      videosCount: 0,
      matchedCount: 0,
      foundPosts: [],
      progress: null,
    };
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
    targetTag?: string;
    maxScrolls?: number;
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

    const targetTag = (options.targetTag || '').trim();
    const maxScrolls = Math.max(1, Math.min(15, Number(options.maxScrolls) || 5));

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
        await this.runScanProcess(urls, targetTag, maxScrolls);
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
    targetTag: string,
    maxScrolls: number
  ): Promise<void> {
    this.addLog('========================================');
    this.addLog('Facebook Video + Tag Scanner (Multi-Profile)');
    this.addLog('========================================');
    this.addLog(`Số lượng profile cần quét: ${urls.length}`);
    urls.forEach((u, i) => this.addLog(`  [${i + 1}] ${u}`));
    this.addLog(`Thẻ mục tiêu (Target Tag): ${targetTag}`);
    this.addLog(`Số lần cuộn mỗi profile: ${maxScrolls}`);

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
    const targetTagNorm = targetTag.toLowerCase().normalize('NFC').trim();
    const globalViewsMap: Record<string, string> = {};
    const globalReelDetailsMap: Record<
      string,
      { likesCount: string; commentsCount: string; sharesCount: string; taggedName: string }
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

        const matchedVideoIds = new Set<string>();
        this.state.foundPosts.forEach((p) => {
          if (p.videoId) matchedVideoIds.add(p.videoId);
        });
        const timelineAllPosts: ScannedPostItem[] = [];

        try {
          res = await page.goto(timelineUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          await page.waitForTimeout(4000);

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
            if (stillReq && cookies.length === 0) {
              this.addLog(`[CẢNH BÁO] Profile ${profileUrl} yêu cầu đăng nhập. Vui lòng cập nhật Cookie! Bỏ qua...`);
              await page.close();
              continue;
            }
          } else {
            await this.dismissLoginModalIfPossible(page);
          }

          // Vòng lặp cuộn trang
          for (let scroll = 0; scroll <= maxScrolls; scroll++) {
            if (this.currentCancelFlag) break;

            const posts: ScannedPostItem[] = await this.extractPosts(
              page,
              targetTagNorm,
              targetTag
            );

            for (const post of posts) {
              timelineAllPosts.push(post);

              // Gán lượt xem từ map Reels nếu feed card không có (cả bài gốc và bài chia sẻ đều lấy lượt xem của Reel)
              if (
                (!post.viewsCount || post.viewsCount === '-') &&
                post.videoId &&
                globalViewsMap[post.videoId]
              ) {
                post.viewsCount = globalViewsMap[post.videoId];
              }

              // Nếu bài viết chia sẻ một video đã khớp tag từ trước
              if (post.isShared && post.videoId && matchedVideoIds.has(post.videoId)) {
                post.hasTargetTag = true;
              }

              if (!seenPostIds.has(post.id)) {
                seenPostIds.add(post.id);
                this.state.postsCount++;

                if (post.hasVideo) {
                  this.state.videosCount++;
                }

                if (post.hasVideo && post.hasTargetTag) {
                  if (post.videoId) matchedVideoIds.add(post.videoId);
                  this.state.matchedCount++;
                  post.profileSource = profileUrl;
                  this.state.foundPosts.push(post);
                  this.videosGateway.emitProfileScannerFound(post);

                  this.addLog('');
                  this.addLog(`[FOUND trên Profile ${pIdx + 1}]`);
                  this.addLog(`Tác giả: ${post.author} | Loại: ${post.postType} | Tag: ${post.taggedName}`);
                  this.addLog(`Tương tác: 👍 ${post.likesCount} Like | 💬 ${post.commentsCount} Cmt | ↗ ${post.sharesCount} Share | 👁 ${post.viewsCount} View`);
                  this.addLog(`Nội dung: ${post.textPreview.slice(0, 70)}...`);
                  this.addLog(`Link: ${post.reelUrl || post.postUrl}`);
                }
              }
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
              await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
              await page.waitForTimeout(2000);

              const scrollBlocked = await this.checkIfLoginRequired(page);
              if (scrollBlocked) {
                await this.dismissLoginModalIfPossible(page);
              }
            }
          }

          // Rà soát các video từ tab Reels của profile này (đảm bảo không bỏ sót Reels nếu không hiện trên timeline)
          const profileReels = profileReelsMap[profileUrl] || [];
          if (profileReels.length > 0 && !this.currentCancelFlag) {
            this.addLog(`  Đang kiểm tra chi tiết ${profileReels.length} video từ tab Reels của profile...`);
            for (const r of profileReels) {
              if (this.currentCancelFlag) break;
              const hasOriginal = this.state.foundPosts.some(
                (p) => !p.isShared && p.videoId === r.videoId
              );
              if (!hasOriginal && !seenPostIds.has(`reel_${r.videoId}`)) {
                try {
                  const reelItem = await this.extractReelDetails(
                    page,
                    r.reelUrl,
                    r.videoId,
                    r.viewsCount,
                    targetTagNorm,
                    targetTag
                  );
                  if (reelItem && !seenPostIds.has(reelItem.id)) {
                    seenPostIds.add(reelItem.id);
                    if (reelItem.videoId) {
                      globalReelDetailsMap[reelItem.videoId] = {
                        likesCount: reelItem.likesCount,
                        commentsCount: reelItem.commentsCount,
                        sharesCount: reelItem.sharesCount,
                        taggedName: reelItem.taggedName,
                      };
                    }
                    this.state.postsCount++;
                    if (reelItem.hasVideo) {
                      this.state.videosCount++;
                    }
                    if (reelItem.hasVideo && reelItem.hasTargetTag) {
                      if (reelItem.videoId) matchedVideoIds.add(reelItem.videoId);
                      this.state.matchedCount++;
                      reelItem.profileSource = profileUrl;
                      this.state.foundPosts.push(reelItem);
                      this.videosGateway.emitProfileScannerFound(reelItem);

                      this.addLog('');
                      this.addLog(`[FOUND Reel trên Profile ${pIdx + 1}]`);
                      this.addLog(
                        `Tác giả: ${reelItem.author} | Loại: ${reelItem.postType} | Tag: ${reelItem.taggedName}`
                      );
                      this.addLog(
                        `Tương tác: 👍 ${reelItem.likesCount} Like | 💬 ${reelItem.commentsCount} Cmt | ↗ ${reelItem.sharesCount} Share | 👁 ${reelItem.viewsCount} View`
                      );
                      this.addLog(`Nội dung: ${reelItem.textPreview.slice(0, 70)}...`);
                      this.addLog(`Link: ${reelItem.reelUrl}`);
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
              (matchedVideoIds.has(p.videoId) || !targetTagNorm) &&
              !seenPostIds.has(p.id)
            ) {
              seenPostIds.add(p.id);
              p.hasTargetTag = true;
              if ((!p.viewsCount || p.viewsCount === '-') && globalViewsMap[p.videoId]) {
                p.viewsCount = globalViewsMap[p.videoId];
              }
              if (globalReelDetailsMap[p.videoId]) {
                const rInfo = globalReelDetailsMap[p.videoId];
                if (p.taggedName === '(Tất cả)' || !p.taggedName) {
                  p.taggedName = rInfo.taggedName;
                }
              }
              const mHash = (p.textPreview + ' ' + (p.postUrl || '')).match(/#[a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+/);
              if (mHash && (p.taggedName === '(Tất cả)' || !p.taggedName)) {
                p.taggedName = mHash[0];
              }
              this.state.matchedCount++;
              p.profileSource = profileUrl;
              this.state.foundPosts.push(p);
              this.videosGateway.emitProfileScannerFound(p);

              this.addLog('');
              this.addLog(`[FOUND Bài chia sẻ khớp Reel trên Profile ${pIdx + 1}]`);
              this.addLog(`Tác giả: ${p.author} | Loại: ${p.postType} | Tag: ${p.taggedName}`);
              this.addLog(`Tương tác: 👍 ${p.likesCount} Like | 💬 ${p.commentsCount} Cmt | ↗ ${p.sharesCount} Share | 👁 ${p.viewsCount} View`);
              this.addLog(`Nội dung: ${p.textPreview.slice(0, 70)}...`);
              this.addLog(`Link: ${p.reelUrl || p.postUrl}`);
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

      // Giai đoạn 3: Rà soát lại lượt xem và tag cho toàn bộ foundPosts
      for (const p of this.state.foundPosts) {
        if ((!p.viewsCount || p.viewsCount === '-') && p.videoId && globalViewsMap[p.videoId]) {
          p.viewsCount = globalViewsMap[p.videoId];
        }
        if (p.isShared && p.videoId && globalReelDetailsMap[p.videoId]) {
          const rInfo = globalReelDetailsMap[p.videoId];
          if (p.taggedName === '(Tất cả)' || !p.taggedName) {
            p.taggedName = rInfo.taggedName;
          }
        }
        if (p.taggedName === '(Tất cả)' || !p.taggedName) {
          const mHash = (p.textPreview + ' ' + (p.postUrl || '')).match(/#[a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+/);
          if (mHash) {
            p.taggedName = mHash[0];
          }
        }
      }

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
    this.addLog(`Tổng số video khớp tag: ${this.state.matchedCount}`);
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
    return false;
  }

  private getTimelineUrl(profileUrl: string): string {
    const cleanUrl = profileUrl.trim().replace(/\/+$/, '');
    if (cleanUrl.includes('sk=timeline')) {
      return cleanUrl;
    }
    if (cleanUrl.includes('profile.php')) {
      return cleanUrl.includes('?') ? `${cleanUrl}&sk=timeline` : `${cleanUrl}?sk=timeline`;
    }
    return cleanUrl.includes('?') ? `${cleanUrl}&sk=timeline` : `${cleanUrl}/?sk=timeline`;
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
    const reelsUrl = profileUrl.includes('?')
      ? `${profileUrl}&sk=reels_tab`
      : `${profileUrl.replace(/\/$/, '')}/reels`;

    try {
      await page.goto(reelsUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2500);

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

  private async extractReelDetails(
    page: Page,
    reelUrl: string,
    videoId: string,
    viewsCount: string,
    targetTagNormalized: string,
    targetTagRaw: string,
    profileAuthorDefault?: string
  ): Promise<ScannedPostItem | null> {
    try {
      await page.goto(reelUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2500);

      return await page.evaluate(
        (args: {
          videoId: string;
          reelUrl: string;
          viewsCount: string;
          targetTagNormalized: string;
          targetTagRaw: string;
          profileAuthorDefault?: string;
        }) => {
          const {
            videoId,
            reelUrl,
            viewsCount,
            targetTagNormalized,
            targetTagRaw,
            profileAuthorDefault,
          } = args;

          function norm(str: string) {
            if (!str) return '';
            return str.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
          }

          const fullText = document.body.innerText || '';

          // 1. Author
          let author = profileAuthorDefault || '';
          const authorLink = Array.from(document.querySelectorAll('a[href]')).find((a) => {
            const h = (a as HTMLAnchorElement).href || '';
            const t = ((a as HTMLElement).innerText || '').trim();
            return (
              (h.includes('sk=reels_tab') ||
                h.includes('/people/') ||
                (h.includes('/profile.php') && !h.includes('login'))) &&
              t.length >= 2 &&
              t.length <= 40 &&
              !/đăng nhập|login|facebook|reels/i.test(t)
            );
          });
          if (authorLink) {
            author = (authorLink as HTMLElement).innerText.trim();
          }
          if (!author || /đăng nhập|login|facebook/i.test(author)) {
            author = 'Người dùng Facebook';
          }

          // 2. Hashtags & Tag
          const hashLinks = Array.from(
            document.querySelectorAll('a[href*="hashtag"], a[href*="/hashtag/"]')
          );
          const hashtags = hashLinks.map((a) => (a as HTMLElement).innerText.trim()).filter(Boolean);
          const allHashesInText =
            fullText.match(/#[a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+/g) || [];
          const combinedHashes = Array.from(new Set([...hashtags, ...allHashesInText]));

          let hasTargetTag = false;
          let taggedName = 'N/A';
          const targetClean = targetTagNormalized.replace(/^#/, '');

          if (!targetClean) {
            hasTargetTag = true;
            taggedName = combinedHashes[0] || '(Tất cả)';
          } else {
            for (const h of combinedHashes) {
              if (norm(h).includes(targetClean)) {
                hasTargetTag = true;
                taggedName = h;
                break;
              }
            }
            if (!hasTargetTag && norm(fullText).includes(targetClean)) {
              hasTargetTag = true;
              taggedName = targetTagRaw.startsWith('#') ? targetTagRaw : '#' + targetTagRaw;
            }
          }

          // 3. Caption / Text preview
          function isNoiseLine(str: string) {
            const s = str.trim();
            const low = s.toLowerCase();
            if (/^\d+([,.]\d+)?\s*[kmb]?$/i.test(low)) return true;
            if (/^\d+:\d+(\s*\/\s*\d+:\d+)?$/.test(low)) return true;
            if (/^(công khai|public|bạn bè|friends|chỉ mình tôi|only me|theo dõi|follow|đã theo dõi|following)$/i.test(low)) return true;
            if (/^(thích|like|bình luận|comment|chia sẻ|share|gửi|send)$/i.test(low)) return true;
            if (/^\d+\s*(giây|phút|giờ|ngày|tuần|tháng|năm|s|m|h|d|w|y)(\s*·)?$/i.test(low)) return true;
            if (/^·$/.test(low)) return true;
            return false;
          }

          const lines = fullText
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);

          const captionParts: string[] = [];
          for (const line of lines) {
            const low = line.toLowerCase();
            if (/^(đăng nhập|login|bạn quên tài khoản|quên mật khẩu|tạo tài khoản)/i.test(low)) {
              continue;
            }
            if (
              (author && low === author.toLowerCase()) ||
              isNoiseLine(line) ||
              /^(công khai|reels|xem thêm|email|mật khẩu|tất cả cảm xúc)/i.test(low)
            ) {
              if (captionParts.length > 0) {
                break;
              }
              continue;
            }
            captionParts.push(line);
            if (captionParts.length >= 3) break;
          }

          let textPreview = captionParts.join(' ').trim() || '(FB Reel)';
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
              if (m) likes = m[1];
            }
            if (/bình luận|comment/i.test(label)) {
              const m = label.match(/(\d+([,.]\d+)?\s*[kmb]?)/i);
              if (m) comments = m[1];
            }
            if (/chia sẻ|share/i.test(label)) {
              const m = label.match(/(\d+([,.]\d+)?\s*[kmb]?)/i);
              if (m) shares = m[1];
            }
          }

          return {
            id: `reel_${videoId}`,
            videoId,
            isShared: false,
            hasVideo: true,
            hasTargetTag,
            postUrl: reelUrl,
            videoUrl: reelUrl,
            reelUrl,
            videoPoster: '',
            author,
            postType: 'FB Reel',
            date: 'Gần đây',
            taggedName,
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
          targetTagNormalized,
          targetTagRaw,
          profileAuthorDefault,
        }
      );
    } catch {
      return null;
    }
  }

  private async extractPosts(
    page: Page,
    targetTagNormalized: string,
    targetTagRaw: string
  ): Promise<ScannedPostItem[]> {
    return await page.evaluate(
      (args: { targetTagNormalized: string; targetTagRaw: string }) => {
        const { targetTagNormalized, targetTagRaw } = args;
        function norm(str: string) {
          if (!str) return '';
          return str.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
        }

        function isComment(el: Element | null) {
          if (!el) return false;
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          if (
            aria.includes('comment by') ||
            aria.includes('bình luận của') ||
            aria.includes('reply by')
          )
            return true;
          if (el.querySelector('a[href*="comment_id="]')) return true;
          return false;
        }

        const mainContainer = document.querySelector('[role="main"]') || document.body;
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

        let postElements: Element[] = [];

        if (rawArticles.length > 0) {
          postElements = rawArticles;
        } else {
          // Option B: Gom nhóm thẻ bài viết theo messages (data-ad-preview="message") và nút tương tác
          const messages = Array.from(
            mainContainer.querySelectorAll('div[data-ad-preview="message"]')
          );
          const seenCards = new Set();

          for (const msg of messages) {
            if (
              msg.closest(
                '[role="alert"], [aria-live], [aria-label*="Notifications" i], [aria-label*="Thông báo" i]'
              )
            )
              continue;
            if (isComment(msg)) continue;

            let card: Element | null = msg;
            let steps = 0;
            while (
              card &&
              card.parentElement &&
              card.parentElement !== document.body &&
              steps < 20
            ) {
              if (card.querySelector(actionSelectors)) {
                break;
              }
              card = card.parentElement;
              steps++;
            }
            if (card && !seenCards.has(card)) {
              seenCards.add(card);
              postElements.push(card);
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
              while (
                card &&
                card.parentElement &&
                card.parentElement !== document.body &&
                steps < 20
              ) {
                if (
                  card.parentElement.children.length > 1 &&
                  (card as HTMLElement).innerText &&
                  (card as HTMLElement).innerText.length > 30
                ) {
                  break;
                }
                card = card.parentElement;
                steps++;
              }
              if (card && !seenCards.has(card)) {
                seenCards.add(card);
                postElements.push(card);
              }
            }
          }
        }

        // Trích xuất chính xác lượt Thích, Bình luận, Chia sẻ theo logic crawler.js
        function extractInteractions(card: Element) {
          let likes = '0';
          let comments = '0';
          let shares = '0';

          const fullText = ((card as HTMLElement).innerText || '').trim();
          const ariaEls = Array.from(card.querySelectorAll('[aria-label]'));

          // 1. Reactions via aria-label
          for (const el of ariaEls) {
            const label = el.getAttribute('aria-label') || '';
            if (/thích:|like:|cảm xúc:|reactions?:/i.test(label) || /người thích|người bày tỏ/i.test(label)) {
              const m = label.match(/(\d+([,.]\d+)?\s*(k|m|nghìn|triệu)?)/i);
              if (m) {
                likes = m[1].trim();
                break;
              }
            }
          }

          // 2. Comments via aria-label
          for (const el of ariaEls) {
            const label = el.getAttribute('aria-label') || '';
            if (/bình luận|comment/i.test(label)) {
              const m = label.match(/(\d+([,.]\d+)?\s*(k|m|nghìn|triệu)?)\s*(bình luận|comment)/i);
              if (m) {
                comments = m[1].trim();
                break;
              }
            }
          }

          // 3. Shares via aria-label
          for (const el of ariaEls) {
            const label = el.getAttribute('aria-label') || '';
            if (/chia sẻ|share/i.test(label)) {
              const m = label.match(/(\d+([,.]\d+)?\s*(k|m|nghìn|triệu)?)\s*(lượt chia sẻ|chia sẻ|share)/i);
              if (m) {
                shares = m[1].trim();
                break;
              }
            }
          }

          // 3b. Role buttons with icon sprite for shares and comments (Facebook desktop feed)
          const allRoleButtons = Array.from(card.querySelectorAll('[role="button"]'));
          for (const btn of allRoleButtons) {
            const btnText = (btn.textContent || '').trim();
            const numMatch = btnText.match(/^(\d+([,.]\d+)?\s*[kmb]?)$/i);
            if (numMatch) {
              const num = numMatch[1];
              const icon = btn.querySelector('i[style*="background-position"]');
              if (icon) {
                const style = icon.getAttribute('style') || '';
                if (/-86\dpx|-87\dpx|-88\dpx/i.test(style) || /share/i.test(style)) {
                  shares = num;
                } else if (/-67\dpx|-68\dpx/i.test(style) || /comment/i.test(style)) {
                  comments = num;
                }
              }
            }
          }

          // 4. Text regex matching
          if (likes === '0') {
            const mLike = fullText.match(/tất cả cảm xúc:?\s*(\d+([,.]\d+)?\s*(k|m|nghìn|triệu)?)/i);
            if (mLike) likes = mLike[1].trim();
          }

          if (comments === '0') {
            const mCmt = fullText.match(/(\d+([,.]\d+)?\s*(k|m|nghìn|triệu)?)\s*(bình luận|comments?)/i);
            if (mCmt) comments = mCmt[1].trim();
          }

          if (shares === '0') {
            const mShare = fullText.match(/(\d+([,.]\d+)?\s*(k|m|nghìn|triệu)?)\s*(lượt chia sẻ|chia sẻ|shares?)/i);
            if (mShare) shares = mShare[1].trim();
          }

          // 5. Sequence numbers around "Tất cả cảm xúc"
          if (likes === '0' || (comments === '0' && shares === '0')) {
            const lines = fullText.split('\n').map((l) => l.trim()).filter(Boolean);
            const emoIdx = lines.findIndex((l) => /tất cả cảm xúc/i.test(l));
            if (emoIdx !== -1) {
              const followingNums = [];
              for (let i = emoIdx + 1; i < Math.min(lines.length, emoIdx + 6); i++) {
                const line = lines[i];
                if (/^\d+([,.]\d+)?\s*[kmb]?$/i.test(line)) {
                  followingNums.push(line);
                } else if (/^(thích|bình luận|chia sẻ)/i.test(line)) {
                  break;
                }
              }
              if (likes === '0' && followingNums.length >= 1) likes = followingNums[0];
              if (comments === '0' && shares === '0') {
                if (followingNums.length >= 2) comments = followingNums[1];
                if (followingNums.length >= 3) shares = followingNums[2];
              }
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
            allMsgs.length > 1 ||
            /chia sẻ một bài viết|shared a post/i.test(fullText.slice(0, 300));

          let textPreview = '';
          if (allMsgs.length > 0) {
            textPreview = (allMsgs[0] as HTMLElement).innerText.trim();
          } else {
            textPreview = fullText
              .split('\n')
              .map((l) => l.trim())
              .filter((l) => l && l !== 'Facebook')
              .slice(0, 3)
              .join(' ');
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

          // Hashtags & Thẻ mục tiêu (Tag)
          const hashLinks = Array.from(
            el.querySelectorAll('a[href*="hashtag"], a[href*="/hashtag/"]')
          );
          const hashtags = hashLinks
            .map((a) => (a as HTMLElement).innerText.trim())
            .filter(Boolean);
          const textToSearch = (textPreview + '\n' + fullText);
          const allHashesInText =
            textToSearch.match(/#[a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+/g) || [];
          const combinedHashes = Array.from(new Set([...hashtags, ...allHashesInText]));

          let hasTargetTag = false;
          let taggedName = combinedHashes[0] || '(Tất cả)';
          const targetClean = targetTagNormalized.replace(/^#/, '');

          if (!targetClean) {
            hasTargetTag = true;
            taggedName = combinedHashes[0] || '(Tất cả)';
          } else {
            for (const h of combinedHashes) {
              if (norm(h).includes(targetClean)) {
                hasTargetTag = true;
                taggedName = h;
                break;
              }
            }

            if (!hasTargetTag) {
              for (const link of allLinks) {
                const linkText = link.innerText || '';
                const linkNorm = norm(linkText);
                const hrefLower = link.href.toLowerCase();

                if (
                  linkNorm === targetClean ||
                  linkNorm === '#' + targetClean ||
                  linkNorm.includes(targetClean) ||
                  hrefLower.includes(targetClean)
                ) {
                  hasTargetTag = true;
                  const matchHash = linkText.match(/#[a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+/);
                  taggedName = matchHash ? matchHash[0] : '#' + targetClean;
                  break;
                }
              }
            }

            if (!hasTargetTag) {
              if (textNorm.includes(targetClean) || textNorm.includes('#' + targetClean)) {
                hasTargetTag = true;
                taggedName = targetTagRaw.startsWith('#') ? targetTagRaw : '#' + targetTagRaw;
              }
            }

            if (!hasTargetTag && combinedHashes.length > 0) {
              taggedName = combinedHashes[0];
            }
          }

          // Link bài viết
          let postUrl = '';
          const permalinks = allLinks.filter((a) => {
            const h = a.href;
            return (
              (h.includes('/posts/') ||
                h.includes('/permalink.php') ||
                h.includes('story.php') ||
                h.includes('/reel/')) &&
              !h.includes('/hashtag/') &&
              !h.includes('comment_id=')
            );
          });

          if (isShared && permalinks.length > 0) {
            postUrl = permalinks[0].href;
          } else if (videoId) {
            postUrl = `https://www.facebook.com/reel/${videoId}/`;
          } else if (permalinks.length > 0) {
            postUrl = permalinks[0].href;
          }

          if (!postUrl) {
            postUrl = videoUrl || window.location.href;
          }

          const reelUrl = videoId ? `https://www.facebook.com/reel/${videoId}/` : videoUrl;

          // Tác giả
          let author = '';
          const strongs = Array.from(
            el.querySelectorAll('h2, h3, h4, strong, a[role="link"]')
          ) as HTMLElement[];
          const authorCandidate = strongs.find((s) => {
            const t = (s.innerText || '').trim();
            return (
              t.length >= 2 &&
              t.length <= 40 &&
              !t.includes('Like') &&
              !t.includes('Thích') &&
              !t.includes('#')
            );
          });
          author =
            authorCandidate?.innerText?.trim() ||
            document.querySelector('h1')?.textContent?.trim() ||
            'Người dùng Facebook';

          const postType = isShared ? 'Chia sẻ' : 'FB Reel';

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
          const timeLinks = allLinks.filter((a) => {
            const h = a.href.toLowerCase();
            return (
              h.includes('/posts/') ||
              h.includes('/videos/') ||
              h.includes('/reel/') ||
              h.includes('story.php')
            );
          });
          for (const tl of timeLinks) {
            const t = tl.innerText.trim();
            if (t && t.length <= 20 && /\d|vừa|just/i.test(t)) {
              postDate = t.replace(/\n+/g, ' ');
              break;
            }
          }

          const cleanSnippet = textPreview
            .slice(0, 40)
            .replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '');
          const id = `${isShared ? 'share' : 'orig'}_${cleanSnippet}_${videoId || postUrl || fullText.slice(0, 30)}`;

          results.push({
            id,
            videoId: videoId || '',
            isShared,
            hasVideo,
            hasTargetTag,
            postUrl: postUrl || 'N/A',
            videoUrl: videoUrl || 'N/A',
            reelUrl: reelUrl || 'N/A',
            videoPoster: videoPoster || '',
            author,
            postType,
            date: postDate,
            taggedName: taggedName || 'N/A',
            textPreview: textPreview || '(Không có nội dung văn bản)',
            viewsCount,
            likesCount,
            commentsCount,
            sharesCount,
          });
        }

        return results;
      },
      { targetTagNormalized, targetTagRaw }
    );
  }
}
