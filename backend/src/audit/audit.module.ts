import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseModule } from '../database/database.module';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';

@Module({
  imports: [DatabaseModule],
  controllers: [AuditController],
  providers: [
    // Tự động ghi nhật ký cho mọi thao tác ghi (POST/PUT/PATCH/DELETE) thành công
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [],
})
export class AuditModule {}
