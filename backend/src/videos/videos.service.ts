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
import { ScraperService } from './scraper.service';
import { VideosGateway } from './videos.gateway';
import { DatabaseService } from '../database/database.service';
import { CookieService } from './cookie.service';

@Injectable()
export class VideosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VideosService.name);
  private trackedVideos: VideoItem[] = [];
  private isRefreshingAll = false;
  private autoRefreshTimer: NodeJS.Timeout | null = null;
  private autoRefreshMinutes = 3;
  private concurrencyMode: 'custom' | 'max' = 'custom';
  private concurrencyCount = 5;

  constructor(
    private readonly storageService: StorageService,
    private readonly scraperService: ScraperService,
    @Inject(forwardRef(() => VideosGateway))
    private readonly videosGateway: VideosGateway,
    private readonly db: DatabaseService,
    private readonly cookieService: CookieService
  ) {}

  public onModuleInit(): void {
    this.trackedVideos = this.storageService.loadVideos();
    let hasChanges = false;
    for (const v of this.trackedVideos) {
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
    }
    if (hasChanges) {
      this.storageService.saveVideos(this.trackedVideos);
      this.logger.log(`Đã chuẩn hóa và làm gọn link cho các video trong database.`);
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
    return this.trackedVideos;
  }

  public async addVideo(rawUrl: string): Promise<VideoItem> {
    if (!rawUrl || !rawUrl.trim()) {
      throw new BadRequestException('URL không được để trống');
    }

    const cleanUrl = this.scraperService.sanitizeUrl(rawUrl);
    const isFacebook = cleanUrl.includes('facebook.com') || cleanUrl.includes('fb.watch');
    if (isFacebook) {
      await this.cookieService.validateCookieForCrawl();
    }

    // 1. Kiểm tra nhanh theo URL đã làm sạch
    const existingByUrl = this.trackedVideos.find((v) => v.link === cleanUrl);
    if (existingByUrl) {
      throw new BadRequestException(`Video này đã có trong danh sách theo dõi (STT ${existingByUrl.STT})!`);
    }

    const nextSTT =
      this.trackedVideos.length > 0
        ? Math.max(...this.trackedVideos.map((v) => v.STT)) + 1
        : 1;

    this.videosGateway.emitCrawlStatus(`Đang cào dữ liệu cho STT ${nextSTT}...`, cleanUrl);

    const data = await this.scraperService.scrapeVideo(cleanUrl, nextSTT);
    data.lastUpdated = new Date().toISOString();

    // Đảm bảo data.link luôn là URL đích cuối cùng gọn nhất
    let finalLink = data.link ? this.scraperService.sanitizeUrl(data.link) : cleanUrl;
    if (
      finalLink.includes('/share/') ||
      finalLink.includes('fb.watch') ||
      finalLink.includes('/t/') ||
      finalLink.includes('vt.tiktok.com') ||
      finalLink.includes('vm.tiktok.com')
    ) {
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
          `Video này đã có trong danh sách theo dõi (trùng với STT ${existingByResolvedUrl.STT})!`
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
        `Bài viết/video này đã có trong danh sách theo dõi (trùng với STT ${existingDuplicate.STT})!`
      );
    }

    this.trackedVideos.push(data);
    this.storageService.saveVideos(this.trackedVideos);

    this.videosGateway.emitVideoAdded(data);
    return data;
  }

  public async refreshVideo(stt: number): Promise<VideoItem> {
    const video = this.trackedVideos.find((v) => v.STT === stt);
    if (!video) {
      throw new NotFoundException('Không tìm thấy video');
    }

    const isFacebook = video.link.includes('facebook.com') || video.link.includes('fb.watch');
    if (isFacebook) {
      await this.cookieService.validateCookieForCrawl();
    }

    this.videosGateway.emitCrawlStatus(`Đang cập nhật video STT ${stt}...`, video.link);

    const freshData = await this.scraperService.scrapeVideo(video.link, stt);
    const resolvedLink = this.scraperService.sanitizeUrl(freshData.link || video.link);
    const updatedVideo: VideoItem = {
      ...video,
      ...freshData,
      link: resolvedLink,
      caption: freshData.caption || video.caption,
      nguoiDang: freshData.nguoiDang || video.nguoiDang,
      isShared: freshData.isShared !== undefined ? freshData.isShared : video.isShared,
      originalAuthor: freshData.originalAuthor || video.originalAuthor,
      originalAuthorUrl: freshData.originalAuthorUrl || video.originalAuthorUrl,
      originalPostUrl: freshData.originalPostUrl
        ? this.scraperService.sanitizeUrl(freshData.originalPostUrl)
        : video.originalPostUrl ? this.scraperService.sanitizeUrl(video.originalPostUrl) : undefined,
      lastUpdated: new Date().toISOString(),
    };

    const idx = this.trackedVideos.findIndex((v) => v.STT === stt);
    if (idx !== -1) {
      this.trackedVideos[idx] = updatedVideo;
      this.storageService.saveVideos(this.trackedVideos);
      this.videosGateway.emitVideoUpdated(updatedVideo);
    }

    return updatedVideo;
  }

  public deleteVideo(stt: number): boolean {
    this.trackedVideos = this.trackedVideos.filter((v) => v.STT !== stt);
    this.storageService.saveVideos(this.trackedVideos);
    this.videosGateway.emitVideoDeleted(stt);
    return true;
  }

  public async refreshAllVideosBatch(
    source = 'Thủ công',
    customConcurrency: string | number = 'default'
  ): Promise<{ total: number; concurrency: number }> {
    if (this.isRefreshingAll || this.trackedVideos.length === 0) {
      return { total: this.trackedVideos.length, concurrency: 0 };
    }

    const hasFbVideos = this.trackedVideos.some(
      (v) => v.link.includes('facebook.com') || v.link.includes('fb.watch')
    );
    if (hasFbVideos) {
      try {
        await this.cookieService.validateCookieForCrawl();
      } catch (err: any) {
        this.logger.error(`[Làm mới đồng loạt] Cookie hết hạn!`);
        this.videosGateway.emitCrawlStatus('Lỗi: Cookie hết hạn', '');
        throw new BadRequestException('Cookie hết hạn');
      }
    }

    this.isRefreshingAll = true;
    const total = this.trackedVideos.length;

    let concurrency = total;
    const effectiveConcurrency =
      customConcurrency === 'default'
        ? this.concurrencyMode === 'max'
          ? 'all'
          : this.concurrencyCount
        : customConcurrency;

    if (
      effectiveConcurrency !== 'all' &&
      effectiveConcurrency !== 'max' &&
      Number(effectiveConcurrency) > 0
    ) {
      concurrency = Math.min(total, parseInt(String(effectiveConcurrency), 10));
    }

    this.logger.log(
      `[${source}] Bắt đầu làm mới đồng loạt ${total} video với ${concurrency} luồng song song...`
    );
    this.videosGateway.emitRefreshAllStarted(total, concurrency);

    let completed = 0;

    const runTask = async (item: VideoItem) => {
      try {
        this.videosGateway.emitCrawlStatus(
          `[${source}] Đang cập nhật STT ${item.STT} (${completed + 1}/${total})...`,
          item.link
        );

        const freshData = await this.scraperService.scrapeVideo(item.link, item.STT);
        const resolvedLink = this.scraperService.sanitizeUrl(freshData.link || item.link);
        const mergedVideo: VideoItem = {
          ...item,
          ...freshData,
          link: resolvedLink,
          caption: freshData.caption || item.caption,
          nguoiDang: freshData.nguoiDang || item.nguoiDang,
          isShared: freshData.isShared !== undefined ? freshData.isShared : item.isShared,
          originalAuthor: freshData.originalAuthor || item.originalAuthor,
          originalAuthorUrl: freshData.originalAuthorUrl || item.originalAuthorUrl,
          originalPostUrl: freshData.originalPostUrl
            ? this.scraperService.sanitizeUrl(freshData.originalPostUrl)
            : item.originalPostUrl ? this.scraperService.sanitizeUrl(item.originalPostUrl) : undefined,
          lastUpdated: new Date().toISOString(),
        };

        const idx = this.trackedVideos.findIndex((v) => v.STT === item.STT);
        if (idx !== -1) {
          this.trackedVideos[idx] = mergedVideo;
          this.storageService.saveVideos(this.trackedVideos);
          this.videosGateway.emitVideoUpdated(mergedVideo);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`[Lỗi cập nhật STT ${item.STT}]: ${msg}`);
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
          if (item) await runTask(item);
        }
      }
    );

    try {
      await Promise.all(workers);
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
