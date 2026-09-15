import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  Inject,
  forwardRef,
  OnModuleInit,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { VideoItem } from './interfaces/video.interface';
import { StorageService } from './storage.service';
import { ScraperService } from './scraper.service';
import { VideosGateway } from './videos.gateway';

@Injectable()
export class VideosService implements OnModuleInit {
  private readonly logger = new Logger(VideosService.name);
  private trackedVideos: VideoItem[] = [];
  private isRefreshingAll = false;

  constructor(
    private readonly storageService: StorageService,
    private readonly scraperService: ScraperService,
    @Inject(forwardRef(() => VideosGateway))
    private readonly videosGateway: VideosGateway
  ) {}

  public onModuleInit(): void {
    this.trackedVideos = this.storageService.loadVideos();
    this.logger.log(`Đã tải ${this.trackedVideos.length} video từ bộ nhớ lưu trữ.`);
  }

  public getVideos(): VideoItem[] {
    return this.trackedVideos;
  }

  public async addVideo(rawUrl: string): Promise<VideoItem> {
    if (!rawUrl || !rawUrl.trim()) {
      throw new BadRequestException('URL không được để trống');
    }

    const cleanUrl = this.scraperService.sanitizeUrl(rawUrl);
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

    this.videosGateway.emitCrawlStatus(`Đang cập nhật video STT ${stt}...`, video.link);

    const freshData = await this.scraperService.scrapeVideo(video.link, stt);
    freshData.lastUpdated = new Date().toISOString();

    const idx = this.trackedVideos.findIndex((v) => v.STT === stt);
    if (idx !== -1) {
      this.trackedVideos[idx] = freshData;
      this.storageService.saveVideos(this.trackedVideos);
      this.videosGateway.emitVideoUpdated(freshData);
    }

    return freshData;
  }

  public deleteVideo(stt: number): boolean {
    this.trackedVideos = this.trackedVideos.filter((v) => v.STT !== stt);
    this.storageService.saveVideos(this.trackedVideos);
    this.videosGateway.emitVideoDeleted(stt);
    return true;
  }

  public async refreshAllVideosBatch(
    source = 'Thủ công',
    customConcurrency: string | number = 'all'
  ): Promise<{ total: number; concurrency: number }> {
    if (this.isRefreshingAll || this.trackedVideos.length === 0) {
      return { total: this.trackedVideos.length, concurrency: 0 };
    }

    this.isRefreshingAll = true;
    const total = this.trackedVideos.length;

    let concurrency = total;
    if (
      customConcurrency !== 'all' &&
      customConcurrency !== 'max' &&
      Number(customConcurrency) > 0
    ) {
      concurrency = parseInt(String(customConcurrency), 10);
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
        freshData.lastUpdated = new Date().toISOString();

        const idx = this.trackedVideos.findIndex((v) => v.STT === item.STT);
        if (idx !== -1) {
          this.trackedVideos[idx] = freshData;
          this.storageService.saveVideos(this.trackedVideos);
          this.videosGateway.emitVideoUpdated(freshData);
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

  // Quét tự động định kỳ mỗi 3 phút bằng NestJS Schedule Interval
  @Interval(3 * 60 * 1000)
  public handleAutoRefreshInterval(): void {
    if (this.trackedVideos.length > 0 && !this.isRefreshingAll) {
      this.refreshAllVideosBatch('Tự động định kỳ', 'all');
    }
  }
}
