import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as fs from 'fs';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { DatabaseService } from '../database/database.service';
import { VideosService } from '../videos/videos.service';
import { UpdateIntervalDto } from './dto/settings.dto';

@Controller('settings')
@UseGuards(RolesGuard)
export class SettingsController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly videosService: VideosService
  ) {}

  @Get()
  public getSettings() {
    return {
      autoRefreshMinutes: this.videosService.getAutoRefreshMinutes(),
      database: this.databaseService.getDatabaseStats(),
    };
  }

  @Post('interval')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  public updateInterval(@Body() dto: UpdateIntervalDto) {
    this.videosService.setAutoRefreshMinutes(dto.minutes);
    return {
      success: true,
      autoRefreshMinutes: dto.minutes,
      message: `Đã cập nhật chu kỳ quét tự động thành ${dto.minutes} phút.`,
    };
  }

  @Get('database/export')
  @Roles('admin')
  public exportDatabase(@Res() res: Response) {
    this.databaseService.checkpoint();
    const dbPath = this.databaseService.getDatabasePath();
    if (!fs.existsSync(dbPath)) {
      throw new NotFoundException('Không tìm thấy tệp cơ sở dữ liệu.');
    }
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const downloadName = `zzzCrawl_backup_${dateStr}.sqlite`;
    return res.download(dbPath, downloadName);
  }

  @Post('database/import')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  public importDatabase(@UploadedFile() file: any) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Vui lòng chọn tệp SQLite (.sqlite hoặc .db) để tải lên.');
    }

    try {
      this.databaseService.replaceDatabase(file.buffer);
      this.videosService.reloadVideos();
      return {
        success: true,
        message: 'Đã nhập cơ sở dữ liệu SQLite thành công!',
        database: this.databaseService.getDatabaseStats(),
      };
    } catch (err: any) {
      throw new BadRequestException(err.message || 'Lỗi khi nhập cơ sở dữ liệu.');
    }
  }
}
