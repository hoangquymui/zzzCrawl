import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseModule } from './database/database.module';
import { CookieModule } from './cookies/cookie.module';
import { VocabularyModule } from './vocabulary/vocabulary.module';
import { ScraperModule } from './scraper/scraper.module';
import { ProfilesModule } from './profiles/profiles.module';
import { VideosModule } from './videos/videos.module';
import { AuthModule } from './auth/auth.module';
import { SettingsModule } from './settings/settings.module';
import { AuditModule } from './audit/audit.module';

const getPublicPath = () => {
  const p1 = path.join(process.cwd(), 'public');
  if (fs.existsSync(p1)) return p1;
  const p2 = path.join(process.cwd(), 'backend', 'public');
  if (fs.existsSync(p2)) return p2;
  return path.join(__dirname, '..', 'public');
};

@Module({
  imports: [
    DatabaseModule,
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: getPublicPath(),
      exclude: ['/api/(.*)'],
      serveStaticOptions: {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          }
        },
      },
    }),
    CookieModule,
    VocabularyModule,
    ScraperModule,
    ProfilesModule,
    VideosModule,
    AuthModule,
    SettingsModule,
    AuditModule,
  ],
})
export class AppModule {}
