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

  @Delete(':stt')
  @UseGuards(RolesGuard)
  @Roles('admin')
  public delete(@Param('stt') sttParam: string): { success: boolean } {
    const stt = parseInt(sttParam, 10);
    if (isNaN(stt)) {
      throw new BadRequestException('STT không hợp lệ');
    }
    this.videosService.deleteVideo(stt);
    return { success: true };
  }

  @Post(':stt/refresh')
  @UseGuards(RolesGuard)
  @Roles('admin')
  public async refreshOne(
    @Param('stt') sttParam: string
  ): Promise<{ success: boolean; data: VideoItem }> {
    const stt = parseInt(sttParam, 10);
    if (isNaN(stt)) {
      throw new BadRequestException('STT không hợp lệ');
    }
    const data = await this.videosService.refreshVideo(stt);
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

    const concurrency = refreshDto?.concurrency || 'all';
    this.videosService.refreshAllVideosBatch('Yêu cầu từ người dùng', concurrency);

    return {
      success: true,
      message: `Bắt đầu làm mới ${videos.length} video với toàn bộ luồng song song (tối đa)`,
    };
  }
}
