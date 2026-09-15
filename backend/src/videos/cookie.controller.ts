import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { CookieService } from './cookie.service';
import { SaveCookieDto } from './dto/cookie.dto';
import { RolesGuard, Roles } from '../auth/roles.guard';

@Controller('cookie')
@UseGuards(RolesGuard)
@Roles('admin')
export class CookieController {
  constructor(private readonly cookieService: CookieService) {}

  @Get()
  public getCookieInfo() {
    return this.cookieService.getCookieInfo();
  }

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
}
