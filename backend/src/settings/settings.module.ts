import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { VideosModule } from '../videos/videos.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [VideosModule, AuthModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
