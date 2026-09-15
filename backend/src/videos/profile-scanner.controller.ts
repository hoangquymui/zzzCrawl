import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ProfileScannerService } from './profile-scanner.service';
import { StartScanDto, SaveCookieDto } from './dto/profile-scanner.dto';
import { RolesGuard, Roles } from '../auth/roles.guard';

@Controller('profile-scanner')
export class ProfileScannerController {
  constructor(private readonly profileScannerService: ProfileScannerService) {}

  @Get('config')
  public getConfig() {
    return this.profileScannerService.getConfig();
  }

  @Post('cookie')
  @UseGuards(RolesGuard)
  @Roles('admin')
  public saveCookie(@Body() body: SaveCookieDto) {
    return this.profileScannerService.saveCookie(body.content);
  }

  @Post('scan')
  @UseGuards(RolesGuard)
  @Roles('admin')
  public async startScan(@Body() body: StartScanDto) {
    return await this.profileScannerService.startScan(body);
  }

  @Post('stop')
  @UseGuards(RolesGuard)
  @Roles('admin')
  public stopScan() {
    this.profileScannerService.stopScan();
    return { success: true, message: 'Đã gửi yêu cầu dừng quét.' };
  }

  @Get('state')
  public getState() {
    return this.profileScannerService.getState();
  }

  @Post('clear')
  @UseGuards(RolesGuard)
  @Roles('admin')
  public clearState() {
    this.profileScannerService.clearState();
    return { success: true };
  }
}
