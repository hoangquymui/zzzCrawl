import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ProfileManagementService } from './profile-management.service';
import { CrawlProfilesDto } from './dto/profile-management.dto';
import { RolesGuard, Roles } from '../auth/roles.guard';

@Controller('profile-management')
export class ProfileManagementController {
  constructor(private readonly profileManagementService: ProfileManagementService) {}

  @Get('state')
  public getState() {
    return this.profileManagementService.getState();
  }

  @Get('list')
  public listProfiles() {
    return this.profileManagementService.listProfiles();
  }

  @Post('crawl')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  public async crawlProfiles(@Body() dto: CrawlProfilesDto) {
    if (!dto || !Array.isArray(dto.profileUrls) || dto.profileUrls.length === 0) {
      throw new BadRequestException('Danh sách link profile không được rỗng.');
    }
    return this.profileManagementService.startCrawl(dto.profileUrls);
  }

  @Post('stop')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  public stopCrawl() {
    this.profileManagementService.stopCrawl();
    return { success: true, message: 'Đã gửi tín hiệu dừng cào profile.' };
  }

  @Delete('clear')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  public clearAllProfiles() {
    const success = this.profileManagementService.clearProfiles();
    return { success };
  }

  @Post('clear')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  public clearAllProfilesPost() {
    const success = this.profileManagementService.clearProfiles();
    return { success };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  public deleteProfile(@Param('id') id: string) {
    const success = this.profileManagementService.deleteProfile(id);
    return { success };
  }
}
