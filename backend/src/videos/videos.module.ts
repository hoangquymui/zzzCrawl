import { Module, forwardRef } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { StorageService } from './storage.service';
import { VideosGateway } from './videos.gateway';
import { DatabaseModule } from '../database/database.module';
import { ScraperModule } from '../scraper/scraper.module';
import { CookieModule } from '../cookies/cookie.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { VocabularyModule } from '../vocabulary/vocabulary.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => ScraperModule),
    forwardRef(() => CookieModule),
    forwardRef(() => ProfilesModule),
    forwardRef(() => VocabularyModule),
  ],
  controllers: [VideosController],
  providers: [VideosService, StorageService, VideosGateway],
  exports: [VideosService, StorageService, VideosGateway],
})
export class VideosModule {}
