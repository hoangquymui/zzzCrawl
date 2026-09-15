import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { VideoItem } from './interfaces/video.interface';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly dataFilePath = path.join(process.cwd(), 'videos_data.json');

  public loadVideos(): VideoItem[] {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const raw = fs.readFileSync(this.dataFilePath, 'utf-8');
        return JSON.parse(raw) as VideoItem[];
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Lỗi khi đọc file videos_data.json: ${msg}`);
    }
    return [];
  }

  public saveVideos(videos: VideoItem[]): void {
    try {
      fs.writeFileSync(this.dataFilePath, JSON.stringify(videos, null, 2), 'utf-8');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Lỗi khi lưu file videos_data.json: ${msg}`);
    }
  }
}
