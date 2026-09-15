import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, forwardRef, Inject } from '@nestjs/common';
import { VideoItem } from './interfaces/video.interface';
import { VideosService } from './videos.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'DELETE'],
  },
})
export class VideosGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  public server: Server;

  private readonly logger = new Logger(VideosGateway.name);

  constructor(
    @Inject(forwardRef(() => VideosService))
    private readonly videosService: VideosService
  ) {}

  public handleConnection(client: Socket): void {
    this.logger.log(`[Socket.IO] Client đã kết nối: ${client.id}`);
    // Gửi toàn bộ dữ liệu ban đầu cho client mới kết nối
    const initialVideos = this.videosService.getVideos();
    client.emit('initial_data', initialVideos);
  }

  public handleDisconnect(client: Socket): void {
    this.logger.log(`[Socket.IO] Client đã ngắt kết nối: ${client.id}`);
  }

  public emitCrawlStatus(message: string, url?: string): void {
    this.server?.emit('crawl_status', { message, url });
  }

  public emitVideoAdded(video: VideoItem): void {
    this.server?.emit('video_added', video);
  }

  public emitVideoUpdated(video: VideoItem): void {
    this.server?.emit('video_updated', video);
  }

  public emitVideoDeleted(stt: number): void {
    this.server?.emit('video_deleted', { STT: stt });
  }

  public emitRefreshAllStarted(total: number, concurrency: number | string): void {
    this.server?.emit('refresh_all_started', { total, concurrency });
  }

  public emitRefreshAllProgress(completed: number, total: number): void {
    this.server?.emit('refresh_all_progress', { completed, total });
  }

  public emitRefreshAllCompleted(total: number): void {
    this.server?.emit('refresh_all_completed', { total });
  }

  public emitProfileScannerLog(message: string): void {
    this.server?.emit('profile_scanner_log', { message, timestamp: new Date().toISOString() });
  }

  public emitProfileScannerFound(post: any): void {
    this.server?.emit('profile_scanner_found', post);
  }

  public emitProfileScannerProgress(progress: any): void {
    this.server?.emit('profile_scanner_progress', progress);
  }

  public emitProfileScannerStatus(status: string): void {
    this.server?.emit('profile_scanner_status', { status });
  }

  public emitProfileMgmtLog(message: string): void {
    this.server?.emit('profile_mgmt_log', { message, timestamp: new Date().toISOString() });
  }

  public emitProfileMgmtItem(item: any): void {
    this.server?.emit('profile_mgmt_item', item);
  }

  public emitProfileMgmtProgress(progress: any): void {
    this.server?.emit('profile_mgmt_progress', progress);
  }

  public emitProfileMgmtStatus(status: string): void {
    this.server?.emit('profile_mgmt_status', { status });
  }
}

