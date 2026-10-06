import { Module, forwardRef } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { CookieModule } from '../cookies/cookie.module';

@Module({
  imports: [forwardRef(() => CookieModule)],
  providers: [ScraperService],
  exports: [ScraperService],
})
export class ScraperModule {}
