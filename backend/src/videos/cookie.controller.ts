import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { CookieService } from './cookie.service';
import { SaveCookieDto, ToggleSlotCookieDto } from './dto/cookie.dto';
import { RolesGuard, Roles } from '../auth/roles.guard';

@Controller('cookie')
@UseGuards(RolesGuard)
@Roles('admin')
export class CookieController {
  constructor(private readonly cookieService: CookieService) {}

  /**
   * Lấy thông tin tổng hợp và danh sách 5 slots cookie
   */
  @Get()
  public getCookieInfo() {
    return this.cookieService.getCookieInfo();
  }

  /**
   * Lấy danh sách 5 slots cookie và số lượng cookie đang bật
   */
  @Get('slots')
  public getCookieSlots() {
    return this.cookieService.getCookieSlots();
  }

  /**
   * Lấy chi tiết 1 slot cookie theo ID (1..5)
   */
  @Get('slot/:id')
  public getCookieSlot(@Param('id', ParseIntPipe) id: number) {
    return this.cookieService.getSlot(id);
  }

  /**
   * Lưu nội dung cookie cho 1 slot cụ thể (1..5)
   * Tự động kiểm tra chống trùng lặp UID c_user với các slot khác
   */
  @Post('slot/:id')
  @HttpCode(HttpStatus.OK)
  public saveCookieSlot(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveCookieDto
  ) {
    return this.cookieService.saveCookieSlot(id, dto.content, dto.enabled);
  }

  /**
   * Bật / Tắt trạng thái hoạt động của 1 slot cookie
   */
  @Patch('slot/:id/toggle')
  @HttpCode(HttpStatus.OK)
  public toggleCookieSlot(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ToggleSlotCookieDto
  ) {
    return this.cookieService.toggleCookieSlot(id, dto.enabled);
  }

  @Post('slot/:id/toggle')
  @HttpCode(HttpStatus.OK)
  public toggleCookieSlotPost(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ToggleSlotCookieDto
  ) {
    return this.cookieService.toggleCookieSlot(id, dto.enabled);
  }

  /**
   * Xóa cookie của 1 slot cụ thể (1..5)
   */
  @Delete('slot/:id')
  @HttpCode(HttpStatus.OK)
  public clearCookieSlot(@Param('id', ParseIntPipe) id: number) {
    return this.cookieService.clearCookieSlot(id);
  }

  @Post('slot/:id/clear')
  @HttpCode(HttpStatus.OK)
  public clearCookieSlotPost(@Param('id', ParseIntPipe) id: number) {
    return this.cookieService.clearCookieSlot(id);
  }

  /**
   * Kiểm tra tính hợp lệ của cookie trong 1 slot cụ thể
   */
  @Post('slot/:id/check')
  @HttpCode(HttpStatus.OK)
  public async checkCookieSlot(@Param('id', ParseIntPipe) id: number) {
    return await this.cookieService.checkCookieSlotValidity(id);
  }

  /**
   * Khởi chạy trình duyệt thật (headless: false) để người dùng tự đăng nhập và hệ thống tự lấy Cookie
   */
  @Post('slot/:id/browser-login')
  @HttpCode(HttpStatus.OK)
  public async startBrowserLogin(@Param('id', ParseIntPipe) id: number) {
    return await this.cookieService.startBrowserLogin(id);
  }

  /**
   * Hủy phiên đăng nhập trình duyệt
   */
  @Post('slot/:id/cancel-login')
  @HttpCode(HttpStatus.OK)
  public async cancelBrowserLogin(@Param('id', ParseIntPipe) id: number) {
    return await this.cookieService.cancelBrowserLogin(id);
  }

  // ===========================================================================
  // CÁC ENDPOINT TƯƠNG THÍCH NGƯỢC (LEGACY APIS CHO SLOT 1)
  // ===========================================================================

  @Post()
  @HttpCode(HttpStatus.OK)
  public saveCookie(@Body() dto: SaveCookieDto) {
    return this.cookieService.saveCookie(dto.content);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  public clearCookie() {
    return this.cookieService.clearCookie();
  }

  @Post('clear')
  @HttpCode(HttpStatus.OK)
  public clearCookiePost() {
    return this.cookieService.clearCookie();
  }

  @Post('check')
  @HttpCode(HttpStatus.OK)
  public async checkCookie() {
    return await this.cookieService.checkCookieValidity();
  }
}
