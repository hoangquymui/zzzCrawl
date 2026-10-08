import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  Inject,
  forwardRef,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { VideoItem } from './interfaces/video.interface';
import { StorageService } from './storage.service';
import { ScraperService } from '../scraper/scraper.service';
import { VideosGateway } from './videos.gateway';
import { DatabaseService } from '../database/database.service';
import { CookieService } from '../cookies/cookie.service';
import { checkCaptionViolation } from '../vocabulary/utils/profanity-checker';
import { isBoilerplateCaption } from '../scraper/utils/text-normalizer';
import { mergeRefreshedVideo } from './utils/merge-refresh';
import { ProfileManagementService } from '../profiles/profile-management.service';
import { resolveProfileForVideo, groupVideosByProfile } from '../profiles/utils/profile-matcher';

@Injectable()
export class VideosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VideosService.name);
  private trackedVideos: VideoItem[] = [];
  private isRefreshingAll = false;
  private autoRefreshTimer: NodeJS.Timeout | null = null;
  private autoRefreshMinutes = 3;
  private concurrencyMode: 'custom' | 'max' = 'custom';
  private concurrencyCount = 5;
  private readonly maxSafeConcurrency = 5;

  constructor(
    private readonly storageService: StorageService,
    @Inject(forwardRef(() => ScraperService))
    private readonly scraperService: ScraperService,
    @Inject(forwardRef(() => VideosGateway))
    private readonly videosGateway: VideosGateway,
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => CookieService))
    private readonly cookieService: CookieService,
    @Inject(forwardRef(() => ProfileManagementService))
    private readonly profileManagementService: ProfileManagementService
  ) {}

  public onModuleInit(): void {
    this.trackedVideos = this.storageService.loadVideos();
    let hasChanges = false;
    for (const v of this.trackedVideos) {
      // 1. Chuyển đổi link /watch/?v=... hoặc video.php cũ sang link chuẩn /[author]/videos/[id]/ nếu có thông tin tác giả
      if (v.link && (v.link.includes('/watch') || v.link.includes('video.php'))) {
        const mVid = v.link.match(/[?&]v=(\d+)/);
        if (mVid) {
          const videoId = mVid[1];
          let authorHandle = '';
          if (v.authorUrl) {
            const mPeople = v.authorUrl.match(/\/people\/[^/]+\/(\d+)/i);
            if (mPeople) {
              authorHandle = mPeople[1];
            } else {
              const mUser = v.authorUrl.match(/facebook\.com\/([a-zA-Z0-9._-]+)(?:\/|\?|$)/i);
              if (
                mUser &&
                !['people', 'watch', 'reel', 'reels', 'videos', 'story', 'share', 'groups', 'profile.php'].includes(
                  mUser[1].toLowerCase()
                )
              ) {
                authorHandle = mUser[1];
              }
            }
          }
          if (!authorHandle && v.authorUid) {
            authorHandle = v.authorUid;
          }
          if (authorHandle) {
            v.link = `https://www.facebook.com/${authorHandle}/videos/${videoId}/`;
            hasChanges = true;
          }
        }
      }

      const clean = this.scraperService.sanitizeUrl(v.link);
      if (clean && clean !== v.link) {
        v.link = clean;
        hasChanges = true;
      }
      if (v.originalPostUrl) {
        const cleanOrig = this.scraperService.sanitizeUrl(v.originalPostUrl);
        if (cleanOrig && cleanOrig !== v.originalPostUrl) {
          v.originalPostUrl = cleanOrig;
          hasChanges = true;
        }
      }
      if (!v.caption || !v.caption.trim() || this.scraperService.isBoilerplateCaption(v.caption)) {
        if (v.caption !== 'Không có tiêu đề') {
          v.caption = 'Không có tiêu đề';
          hasChanges = true;
        }
      }
      if (!v.id || !v.id.trim()) {
        const isTt = this.scraperService.detectPlatform(v.link) === 'tiktok' || v.link.includes('tiktok.com');
        v.id = `${isTt ? 'tt' : 'fb'}-${v.STT || 1}`;
        hasChanges = true;
      }
      const violation = checkCaptionViolation(v.caption);
      if (v.isViolation !== violation.isViolation || v.violationReason !== violation.reason) {
        v.isViolation = violation.isViolation;
        v.violationReason = violation.reason;
        hasChanges = true;
      }
    }
    if (hasChanges) {
      this.storageService.saveVideos(this.trackedVideos);
      this.logger.log(`Đã chuẩn hóa, gắn ID và làm gọn link cho các video trong database.`);
    }
    this.logger.log(`Đã tải ${this.trackedVideos.length} video từ bộ nhớ lưu trữ.`);

    const saved = this.db.getSetting('auto_refresh_minutes');
    const parsed = saved ? parseInt(saved, 10) : 3;
    this.autoRefreshMinutes = !isNaN(parsed) && parsed >= 3 ? parsed : 3;

    const savedMode = this.db.getSetting('crawl_concurrency_mode');
    this.concurrencyMode = savedMode === 'max' ? 'max' : 'custom';

    const savedCount = this.db.getSetting('crawl_concurrency_count');
    const parsedCount = savedCount ? parseInt(savedCount, 10) : 5;
    this.concurrencyCount = !isNaN(parsedCount) && parsedCount >= 1 ? parsedCount : 5;

    this.startAutoRefreshTimer();
  }

  public onModuleDestroy(): void {
    this.stopAutoRefreshTimer();
  }

  public getVideos(): VideoItem[] {
    this.annotateVideosWithProfiles();
    return this.trackedVideos;
  }

  public annotateVideo(video: VideoItem): void {
    if (!video.profileId) {
      try {
        const profiles = this.profileManagementService.listProfiles();
        const resolved = resolveProfileForVideo(video, profiles);
        if (resolved.profileId) {
          video.profileId = resolved.profileId;
          video.profileName = resolved.profileName;
        }
      } catch {}
    }
  }

  public annotateVideosWithProfiles(): void {
    try {
      const profiles = this.profileManagementService.listProfiles();
      if (!profiles || profiles.length === 0) return;
      for (const v of this.trackedVideos) {
        if (!v.profileId) {
          const resolved = resolveProfileForVideo(v, profiles);
          if (resolved.profileId) {
            v.profileId = resolved.profileId;
            v.profileName = resolved.profileName;
          }
        }
      }
    } catch {}
  }

  public getVideosGroupedByProfile(): {
    profilePostMap: Record<string, VideoItem[]>;
    otherPosts: VideoItem[];
  } {
    const profiles = this.profileManagementService.listProfiles();
    return groupVideosByProfile(this.getVideos(), profiles);
  }

  public generateNextId(link: string): string {
    const isTikTok = this.scraperService.detectPlatform(link) === 'tiktok' || link.includes('tiktok.com');
    const prefix = isTikTok ? 'tt-' : 'fb-';
    let maxNum = 0;
    for (const v of this.trackedVideos) {
      if (v.id && v.id.startsWith(prefix)) {
        const numPart = parseInt(v.id.slice(prefix.length), 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    }
    return `${prefix}${maxNum + 1}`;
  }

  public async addVideo(rawUrl: string): Promise<VideoItem> {
    if (!rawUrl || !rawUrl.trim()) {
      throw new BadRequestException('URL không được để trống');
    }

    let cleanUrl = this.scraperService.sanitizeUrl(rawUrl);
    if (this.scraperService.isRedirectUrl(cleanUrl)) {
      try {
        const resolved = await this.scraperService.resolveFinalUrl(cleanUrl);
        if (resolved) cleanUrl = this.scraperService.sanitizeUrl(resolved);
      } catch {}
    }

    const isFacebook = cleanUrl.includes('facebook.com') || cleanUrl.includes('fb.watch');
    if (isFacebook) {
      await this.cookieService.validateCookieForCrawl();
    }

    // 1. Kiểm tra nhanh theo URL đã làm sạch
    const existingByUrl = this.trackedVideos.find((v) => v.link === cleanUrl);
    if (existingByUrl) {
      throw new BadRequestException(`Video này đã có trong danh sách theo dõi (${existingByUrl.id || 'STT ' + existingByUrl.STT})!`);
    }

    const nextSTT =
      this.trackedVideos.length > 0
        ? Math.max(...this.trackedVideos.map((v) => v.STT || 0)) + 1
        : 1;

    const nextId = this.generateNextId(cleanUrl);

    this.videosGateway.emitCrawlStatus(`Đang cào dữ liệu cho ${nextId}...`, cleanUrl);

    const data = await this.scraperService.scrapeVideo(cleanUrl, nextSTT);
    if (data.crawlStatus === 'PARTIAL_SUCCESS' || data.crawlStatus === 'SCRAPE_FAILED') {
      throw new BadRequestException('Không thể xác minh đủ dữ liệu của nội dung này; không lưu kết quả crawl thiếu.');
    }
    data.id = nextId;
    data.STT = nextSTT;
    data.lastUpdated = new Date().toISOString();

    // Đảm bảo data.link luôn là URL đích cuối cùng gọn nhất
    let finalLink = data.link ? this.scraperService.sanitizeUrl(data.link) : cleanUrl;
    if (this.scraperService.isRedirectUrl(finalLink)) {
      try {
        finalLink = await this.scraperService.resolveFinalUrl(finalLink);
      } catch {}
    }
    data.link = this.scraperService.sanitizeUrl(finalLink);
    if (data.originalPostUrl) {
      data.originalPostUrl = this.scraperService.sanitizeUrl(data.originalPostUrl);
    }

    // Nếu link chuyển hướng (ví dụ share link sang reel URL), kiểm tra tiếp xem URL mới đã có chưa
    if (data.link && data.link !== cleanUrl) {
      const existingByResolvedUrl = this.trackedVideos.find((v) => v.link === data.link);
      if (existingByResolvedUrl) {
        throw new BadRequestException(
          `Video này đã có trong danh sách theo dõi (trùng với ${existingByResolvedUrl.id || 'STT ' + existingByResolvedUrl.STT})!`
        );
      }
    }

    // 2. Kiểm tra trùng lặp nâng cao (postId duy nhất hoặc bộ ba Caption + Người đăng + Ngày đăng)
    const existingDuplicate = this.trackedVideos.find((v) => {
      if (data.postId && v.postId && v.postId === data.postId) {
        return true;
      }
      if (
        data.caption &&
        v.caption &&
        data.caption.trim() === v.caption.trim() &&
        data.nguoiDang &&
        v.nguoiDang &&
        data.nguoiDang.trim().toLowerCase() === v.nguoiDang.trim().toLowerCase() &&
        data.ngayDang &&
        v.ngayDang &&
        data.ngayDang.trim() === v.ngayDang.trim()
      ) {
        return true;
      }
      return false;
    });

    if (existingDuplicate) {
      throw new BadRequestException(
        `Bài viết/video này đã có trong danh sách theo dõi (trùng với ${existingDuplicate.id || 'STT ' + existingDuplicate.STT})!`
      );
    }

    const shouldCheckViolation =
      Boolean(data.caption) &&
      data.caption.trim() !== 'Không có tiêu đề' &&
      !isBoilerplateCaption(data.caption);
    const violation = shouldCheckViolation
      ? checkCaptionViolation(data.caption)
      : { isViolation: false, reason: '' };
    data.isViolation = violation.isViolation;
    data.violationReason = violation.reason;

    this.trackedVideos.push(data);
    this.storageService.saveVideos(this.trackedVideos);

    this.videosGateway.emitVideoAdded(data);

    // Tự động kiểm tra và thêm profile của người đăng nếu chưa có id trong database
    try {
      const authorProfile = await this.profileManagementService.ensureProfileForAuthor({
        nguoiDang: data.nguoiDang,
        authorUid: data.authorUid,
        authorUrl: data.authorUrl,
        link: data.link || cleanUrl,
      });

      if (authorProfile) {
        data.profileId = authorProfile.id;
        data.profileName = authorProfile.name;
        if (!data.authorUid && authorProfile.uid) {
          data.authorUid = authorProfile.uid;
        }
        if (!data.authorUrl && authorProfile.profileUrl) {
          data.authorUrl = authorProfile.profileUrl;
        }
        this.storageService.saveVideos(this.trackedVideos);
      }
    } catch (profileErr: unknown) {
      this.logger.warn(`Lỗi khi tự động thêm profile cho người đăng (${data.nguoiDang}): ${(profileErr as Error)?.message}`);
    }

    return data;
  }

  public async refreshVideo(idOrStt: string | number): Promise<VideoItem> {
    const video = this.trackedVideos.find(
      (v) => v.id === String(idOrStt) || String(v.STT) === String(idOrStt)
    );
    if (!video) {
      throw new NotFoundException('Không tìm thấy video');
    }

    const isFacebook = video.link.includes('facebook.com') || video.link.includes('fb.watch');
    if (isFacebook) {
      await this.cookieService.validateCookieForCrawl();
    }

    this.videosGateway.emitCrawlStatus(`Đang cập nhật video ${video.id || 'STT ' + video.STT}...`, video.link);

    const freshData = await this.scraperService.scrapeVideo(video.link, video.STT || 1);
    if (freshData.crawlStatus === 'PARTIAL_SUCCESS' || freshData.crawlStatus === 'SCRAPE_FAILED') {
      throw new BadRequestException('Không thể xác minh đủ dữ liệu mới; dữ liệu đã lưu được giữ nguyên.');
    }
    const resolvedLink = this.scraperService.sanitizeUrl(freshData.link || video.link);
    const updatedVideo: VideoItem = mergeRefreshedVideo(video, {
      ...freshData,
      link: resolvedLink,
    });

    const idx = this.trackedVideos.findIndex(
      (v) => (video.id && v.id === video.id) || v.STT === video.STT
    );
    if (idx !== -1) {
      this.trackedVideos[idx] = updatedVideo;
      this.storageService.saveVideos(this.trackedVideos);
      this.videosGateway.emitVideoUpdated(updatedVideo);
    }

    return updatedVideo;
  }

  public deleteVideo(idOrStt: string | number): boolean {
    const target = this.trackedVideos.find(
      (v) => v.id === String(idOrStt) || String(v.STT) === String(idOrStt)
    );
    if (!target) return false;
    this.trackedVideos = this.trackedVideos.filter((v) => v !== target);
    this.storageService.saveVideos(this.trackedVideos);
    this.videosGateway.emitVideoDeleted(target.id || target.STT || 0);

    return true;
  }

  public deleteVideosBulk(ids: (string | number)[]): { success: boolean; count: number } {
    if (!ids || ids.length === 0) return { success: true, count: 0 };
    const idSet = new Set(ids.map((id) => String(id)));
    const toDelete = this.trackedVideos.filter(
      (v) => (v.id && idSet.has(String(v.id))) || (v.STT !== undefined && idSet.has(String(v.STT)))
    );

    if (toDelete.length === 0) return { success: true, count: 0 };

    this.trackedVideos = this.trackedVideos.filter(
      (v) => !((v.id && idSet.has(String(v.id))) || (v.STT !== undefined && idSet.has(String(v.STT))))
    );
    this.storageService.saveVideos(this.trackedVideos);
    this.videosGateway.emitVideosUpdated(this.trackedVideos);

    return { success: true, count: toDelete.length };
  }

  public async refreshAllVideosBatch(
    source = 'Thủ công',
    customConcurrency: string | number = 'default'
  ): Promise<{ total: number; concurrency: number }> {
    if (this.isRefreshingAll || this.trackedVideos.length === 0) {
      return { total: this.trackedVideos.length, concurrency: 0 };
    }

    // Set the lock before the first await so simultaneous requests cannot start two batches.
    this.isRefreshingAll = true;

    try {
      const hasFbVideos = this.trackedVideos.some(
        (v) => this.scraperService.detectPlatform(v.link) === 'facebook'
      );
      if (hasFbVideos) {
        await this.cookieService.validateCookieForCrawl();
      }
    } catch (err: unknown) {
        const errMsg = (err as Error)?.message || String(err);
        this.logger.error(`[Làm mới đồng loạt] Cookie hết hạn hoặc không hợp lệ: ${errMsg}`);
        this.videosGateway.emitCrawlStatus('Lỗi: Cookie hết hạn', '');
        this.isRefreshingAll = false;
        if (source === 'Tự động định kỳ') {
          return { total: this.trackedVideos.length, concurrency: 0 };
        }
        throw new BadRequestException('Cookie hết hạn hoặc không hợp lệ');
    }

    const total = this.trackedVideos.length;

    const hardCap = this.maxSafeConcurrency || 5;
    let concurrency = Math.min(total, hardCap);
    const effectiveConcurrency =
      customConcurrency === 'default'
        ? this.concurrencyMode === 'max'
          ? hardCap
          : this.concurrencyCount
        : customConcurrency;

    if (
      effectiveConcurrency !== 'all' &&
      effectiveConcurrency !== 'max' &&
      Number(effectiveConcurrency) > 0
    ) {
      concurrency = Math.min(total, hardCap, Math.max(1, parseInt(String(effectiveConcurrency), 10)));
    } else {
      concurrency = Math.min(total, hardCap);
    }

    this.logger.log(
      `[${source}] Bắt đầu làm mới đồng loạt ${total} video với ${concurrency} luồng song song (giới hạn an toàn tối đa ${hardCap})...`
    );
    this.videosGateway.emitRefreshAllStarted(total, concurrency);

    let completed = 0;

    const runTask = async (item: VideoItem) => {
      try {
        this.videosGateway.emitCrawlStatus(
          `[${source}] Đang cập nhật ${item.id || 'STT ' + item.STT} (${completed + 1}/${total})...`,
          item.link
        );

        const freshData = await this.scraperService.scrapeVideo(item.link, item.STT || 1);
        if (freshData.crawlStatus === 'PARTIAL_SUCCESS' || freshData.crawlStatus === 'SCRAPE_FAILED') {
          throw new Error('Không thể xác minh đủ dữ liệu mới; giữ nguyên dữ liệu đã lưu');
        }
        const resolvedLink = this.scraperService.sanitizeUrl(freshData.link || item.link);
        const mergedVideo: VideoItem = mergeRefreshedVideo(item, {
          ...freshData,
          link: resolvedLink,
        });

        const idx = this.trackedVideos.findIndex(
          (v) => (item.id && v.id === item.id) || v.STT === item.STT
        );
        if (idx !== -1) {
          this.trackedVideos[idx] = mergedVideo;
          // TỐI ƯU HIỆU NĂNG: Chỉ upsert đúng 1 bản ghi hiện tại vào SQLite (triệt tiêu Write Amplification 50x)
          this.storageService.upsertVideo(mergedVideo);
          this.videosGateway.emitVideoUpdated(mergedVideo);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`[Lỗi cập nhật ${item.id || 'STT ' + item.STT}]: ${msg}`);
      } finally {
        completed++;
        this.videosGateway.emitRefreshAllProgress(completed, total);
      }
    };

    const queue = [...this.trackedVideos];
    const workers = Array.from(
      { length: Math.min(concurrency, queue.length) },
      async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (item) {
            await runTask(item);
            if (queue.length > 0) {
              const delay = Math.floor(Math.random() * (1200 - 300 + 1)) + 300;
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
        }
      }
    );

    try {
      await Promise.all(workers);
      // Sau khi toàn bộ các luồng cào hoàn tất, đồng bộ file backup JSON một lần duy nhất
      try {
        this.storageService.saveVideos(this.trackedVideos);
      } catch {}
    } finally {
      this.isRefreshingAll = false;
      this.videosGateway.emitRefreshAllCompleted(total);
      this.logger.log(`[${source}] Đã hoàn thành làm mới toàn bộ ${total} video!`);
    }

    return { total, concurrency };
  }

  public isBatchRefreshing(): boolean {
    return this.isRefreshingAll;
  }

  public getAutoRefreshMinutes(): number {
    return this.autoRefreshMinutes;
  }

  public setAutoRefreshMinutes(minutes: number): void {
    if (!minutes || minutes < 3) {
      throw new BadRequestException('Chu kỳ quét tự động tối thiểu phải từ 3 phút trở lên!');
    }
    this.autoRefreshMinutes = minutes;
    this.db.setSetting('auto_refresh_minutes', String(minutes));
    this.logger.log(`[Cấu hình] Đã cập nhật chu kỳ quét video tự động thành ${minutes} phút.`);
    this.startAutoRefreshTimer();
  }

  private startAutoRefreshTimer(): void {
    this.stopAutoRefreshTimer();
    const intervalMs = this.autoRefreshMinutes * 60 * 1000;
    this.logger.log(`[Hệ thống] Bắt đầu hẹn giờ quét video tự động mỗi ${this.autoRefreshMinutes} phút.`);
    this.autoRefreshTimer = setInterval(() => {
      this.handleAutoRefresh();
    }, intervalMs);
  }

  private stopAutoRefreshTimer(): void {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  public getConcurrencySettings(): { mode: 'custom' | 'max'; count: number } {
    return {
      mode: this.concurrencyMode,
      count: this.concurrencyCount,
    };
  }

  public setConcurrencySettings(mode: 'custom' | 'max', count?: number): void {
    if (mode !== 'custom' && mode !== 'max') {
      throw new BadRequestException('Chế độ luồng quét không hợp lệ!');
    }
    this.concurrencyMode = mode;
    this.db.setSetting('crawl_concurrency_mode', mode);

    if (count !== undefined && count !== null) {
      if (count < 1) {
        throw new BadRequestException('Số lượng luồng quét phải lớn hơn hoặc bằng 1!');
      }
      this.concurrencyCount = count;
      this.db.setSetting('crawl_concurrency_count', String(count));
    }
    this.logger.log(`[Cấu hình] Đã cập nhật luồng quét: mode=${this.concurrencyMode}, count=${this.concurrencyCount}`);
  }

  public handleAutoRefresh(): void {
    if (this.trackedVideos.length > 0 && !this.isRefreshingAll) {
      this.logger.log(`[Tự động] Kích hoạt làm mới video định kỳ (chu kỳ ${this.autoRefreshMinutes} phút)...`);
      this.refreshAllVideosBatch('Tự động định kỳ', 'default');
    }
  }

  public reloadVideos(): void {
    this.trackedVideos = this.storageService.loadVideos();
    this.logger.log(`[Videos] Đã nạp lại ${this.trackedVideos.length} video sau khi thay đổi CSDL.`);
  }
}
