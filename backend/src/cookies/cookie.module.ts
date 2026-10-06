import { Module, forwardRef } from '@nestjs/common';
import { CookieController } from './cookie.controller';
import { CookieService } from './cookie.service';
import { DatabaseModule } from '../database/database.module';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => VideosModule)],
  controllers: [CookieController],
  providers: [CookieService],
  exports: [CookieService],
})
export class CookieModule {}
