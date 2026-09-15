import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as path from 'path';
import { VideosModule } from './videos/videos.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: path.join(process.cwd(), 'public'),
      exclude: ['/api/(.*)'],
    }),
    AuthModule,
    VideosModule,
  ],
})
export class AppModule {}
