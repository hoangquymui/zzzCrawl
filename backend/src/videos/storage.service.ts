import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { VideoItem } from './interfaces/video.interface';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly db: DatabaseService) {}

  public getEffectiveDataPath(): string {
    const baseDir = process.cwd().endsWith('backend')
      ? process.cwd()
      : fs.existsSync(path.join(process.cwd(), 'backend'))
      ? path.join(process.cwd(), 'backend')
      : process.cwd();

    const dataPath = path.join(baseDir, 'data', 'videos_data.json');
    if (fs.existsSync(dataPath)) return dataPath;

    const legacyPath = path.join(baseDir, 'videos_data.json');
    if (fs.existsSync(legacyPath)) return legacyPath;

    const dataDir = path.join(baseDir, 'data');
    if (!fs.existsSync(dataDir)) {
      try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
    }
    return dataPath;
  }

  public loadVideos(): VideoItem[] {
    const dataFilePath = this.getEffectiveDataPath();
    try {
      const videos = this.db.getAllVideos();
      this.logger.log(`[Storage] Đã nạp ${videos.length} video từ SQLite.`);
      return videos;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Lỗi khi đọc video từ SQLite: ${msg}`);
      // Fallback đọc từ JSON nếu SQLite có lỗi bất ngờ
      if (fs.existsSync(dataFilePath)) {
        try {
          const raw = fs.readFileSync(dataFilePath, 'utf-8');
          return JSON.parse(raw) as VideoItem[];
        } catch {}
      }
      return [];
    }
  }

  public saveVideos(videos: VideoItem[]): void {
    const dataFilePath = this.getEffectiveDataPath();
    try {
      this.db.saveAllVideos(videos);
      // Ghi backup nhẹ vào JSON để đảm bảo an toàn tuyệt đối
      try {
        fs.writeFileSync(dataFilePath, JSON.stringify(videos, null, 2), 'utf-8');
      } catch {}
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Lỗi khi lưu video vào SQLite: ${msg}`);
    }
  }

  public upsertVideo(video: VideoItem): void {
    try {
      this.db.upsertVideo(video);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Lỗi khi lưu video STT ${video.STT} vào SQLite: ${msg}`);
    }
  }

  public deleteVideo(stt: number): boolean {
    try {
      return this.db.deleteVideo(stt);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Lỗi khi xóa video STT ${stt} khỏi SQLite: ${msg}`);
      return false;
    }
  }
}

