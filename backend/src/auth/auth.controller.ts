import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RolesGuard, Roles } from './roles.guard';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsIn(['admin', 'user'])
  role!: 'admin' | 'user';

  @IsString()
  @IsNotEmpty()
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  public login(@Body() body: LoginDto) {
    if (!body || !body.username || !body.password) {
      throw new UnauthorizedException('Vui lòng nhập đầy đủ tên tài khoản và mật khẩu.');
    }
    const user = this.authService.validateUser(body.username, body.password);
    return this.authService.login(user);
  }

  @Get('me')
  public me(@Headers('authorization') authHeader?: string) {
    const user = this.authService.verifyToken(authHeader);
    if (!user) {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn hoặc không hợp lệ.');
    }
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  public logout(@Headers('authorization') authHeader?: string) {
    this.authService.logout(authHeader);
    return { success: true };
  }

  @Get('users')
  @UseGuards(RolesGuard)
  @Roles('admin')
  public getUsers() {
    return this.authService.getUsers();
  }

  @Post('users')
  @UseGuards(RolesGuard)
  @Roles('admin')
  public createUser(@Body() body: CreateUserDto) {
    return this.authService.createUser(body);
  }

  @Delete('users/:id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  public deleteUser(@Param('id') id: string) {
    return { success: this.authService.deleteUser(id) };
  }
}
