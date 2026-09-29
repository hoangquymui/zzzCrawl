import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { StorageService } from './storage.service';
import { ScraperService } from './scraper.service';
import { VideosGateway } from './videos.gateway';
import { ProfileScannerController } from './profile-scanner.controller';
import { ProfileScannerService } from './profile-scanner.service';
import { ProfileManagementController } from './profile-management.controller';
import { ProfileManagementService } from './profile-management.service';
import { CookieController } from './cookie.controller';
import { CookieService } from './cookie.service';
import { VocabularyController } from './vocabulary.controller';
import { VocabularyService } from './vocabulary.service';

@Module({
  controllers: [
    VideosController,
    ProfileScannerController,
    ProfileManagementController,
    CookieController,
    VocabularyController,
  ],
  providers: [
    VideosService,
    StorageService,
    ScraperService,
    VideosGateway,
    ProfileScannerService,
    ProfileManagementService,
    CookieService,
    VocabularyService,
  ],
  exports: [
    VideosService,
    VideosGateway,
    ProfileScannerService,
    ProfileManagementService,
    CookieService,
    VocabularyService,
  ],
})
export class VideosModule {}
