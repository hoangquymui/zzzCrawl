import { Module, forwardRef } from '@nestjs/common';
import { ProfileManagementController } from './profile-management.controller';
import { ProfileManagementService } from './profile-management.service';
import { ProfileScannerController } from './profile-scanner.controller';
import { ProfileScannerService } from './profile-scanner.service';
import { ProfileBrowserManager } from './services/profile-browser-manager';
import { ProfileDomParser } from './services/profile-dom-parser';
import { ProfileTimelineScroller } from './services/profile-timeline-scroller';
import { DatabaseModule } from '../database/database.module';
import { CookieModule } from '../cookies/cookie.module';
import { ScraperModule } from '../scraper/scraper.module';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => CookieModule),
    forwardRef(() => ScraperModule),
    forwardRef(() => VocabularyModule),
    forwardRef(() => VideosModule),
  ],
  controllers: [ProfileManagementController, ProfileScannerController],
  providers: [
    ProfileManagementService,
    ProfileScannerService,
    ProfileBrowserManager,
    ProfileDomParser,
    ProfileTimelineScroller,
  ],
  exports: [
    ProfileManagementService,
    ProfileScannerService,
    ProfileBrowserManager,
    ProfileDomParser,
    ProfileTimelineScroller,
  ],
})
export class ProfilesModule {}
