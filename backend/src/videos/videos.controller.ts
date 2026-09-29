import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { VideosService } from './videos.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { RefreshAllDto } from './dto/refresh-all.dto';
import { VideoItem } from './interfaces/video.interface';
import { RolesGuard, Roles } from '../auth/roles.guard';

@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get()
  public getAll(): VideoItem[] {
    return this.videosService.getVideos();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  public async create(@Body() createDto: CreateVideoDto): Promise<{ success: boolean; data: VideoItem }> {
    const data = await this.videosService.addVideo(createDto.url);
    return { success: true, data };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  public delete(@Param('id') idParam: string): { success: boolean } {
    if (!idParam) {
      throw new BadRequestException('ID không hợp lệ');
    }
    this.videosService.deleteVideo(idParam);
    return { success: true };
  }

  @Post(':id/refresh')
  @UseGuards(RolesGuard)
  @Roles('admin')
  public async refreshOne(
    @Param('id') idParam: string
  ): Promise<{ success: boolean; data: VideoItem }> {
    if (!idParam) {
      throw new BadRequestException('ID không hợp lệ');
    }
    const data = await this.videosService.refreshVideo(idParam);
    return { success: true, data };
  }

  @Post('refresh-all')
  @UseGuards(RolesGuard)
  @Roles('admin')
  public refreshAll(@Body() refreshDto: RefreshAllDto): { success: boolean; message: string } {
    if (this.videosService.isBatchRefreshing()) {
      throw new BadRequestException('Đang trong quá trình cập nhật, vui lòng đợi!');
    }

    const videos = this.videosService.getVideos();
    if (videos.length === 0) {
      return { success: true, message: 'Danh sách theo dõi đang trống' };
    }

    const concurrency = refreshDto?.concurrency || 'default';
    void this.videosService.refreshAllVideosBatch('Yêu cầu từ người dùng', concurrency).catch(() => {
      // The service has already logged and emitted the actionable error to the UI.
    });

    return {
      success: true,
      message: `Bắt đầu làm mới ${videos.length} video với số luồng an toàn đã cấu hình`,
    };
  }
}
