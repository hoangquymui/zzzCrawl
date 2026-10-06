import { Module, forwardRef } from '@nestjs/common';
import { VocabularyController } from './vocabulary.controller';
import { VocabularyService } from './vocabulary.service';
import { DatabaseModule } from '../database/database.module';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => VideosModule)],
  controllers: [VocabularyController],
  providers: [VocabularyService],
  exports: [VocabularyService],
})
export class VocabularyModule {}
