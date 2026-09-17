import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as fs from 'fs';
import * as path from 'path';
import { VideosModule } from './videos/videos.module';
import { AuthModule } from './auth/auth.module';

const getPublicPath = () => {
  const p1 = path.join(process.cwd(), 'public');
  if (fs.existsSync(p1)) return p1;
  const p2 = path.join(process.cwd(), 'backend', 'public');
  if (fs.existsSync(p2)) return p2;
  return path.join(__dirname, '..', 'public');
};

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: getPublicPath(),
      exclude: ['/api/(.*)'],
    }),
    AuthModule,
    VideosModule,
  ],
})
export class AppModule {}
