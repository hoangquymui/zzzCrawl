import {
  Controller,
  Get,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { DatabaseService } from '../database/database.service';

@Controller('audit-logs')
@UseGuards(RolesGuard)
export class AuditController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @Roles('admin', 'user')
  public getLogs(
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('search') search?: string,
    @Query('action') action?: string
  ) {
    const data = this.db.getAuditLogs(limit, offset, search, action);
    return {
      success: true,
      logs: data.logs,
      total: data.total,
    };
  }

  @Get('stats')
  @Roles('admin', 'user')
  public getStats() {
    return { success: true, ...this.db.getAuditStats() };
  }

  @Delete('clear')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  public clearOldLogs(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    const deleted = this.db.clearAuditLogs(days);
    return {
      success: true,
      deletedCount: deleted,
      message: `Đã dọn dẹp ${deleted} bản ghi nhật ký cũ hơn ${days} ngày.`,
    };
  }
}
