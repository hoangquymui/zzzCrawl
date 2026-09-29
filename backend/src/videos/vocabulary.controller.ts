import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { VocabularyService } from './vocabulary.service';
import { RolesGuard, Roles } from '../auth/roles.guard';

@Controller('vocabulary')
@UseGuards(RolesGuard)
@Roles('admin')
export class VocabularyController {
  constructor(private readonly vocabularyService: VocabularyService) {}

  @Get()
  public getVocabulary(): { rules: any[]; stats: any } {
    return {
      rules: this.vocabularyService.getRules(),
      stats: this.vocabularyService.getStats(),
    };
  }

  @Get('stats')
  public getStats(): any {
    return this.vocabularyService.getStats();
  }

  @Post('word')
  public addWord(
    @Body() body: { category: string; word: string }
  ): { success: boolean; message: string } {
    if (!body || !body.category || !body.word) {
      throw new BadRequestException('Vui lòng cung cấp nhóm quy tắc và từ ngữ cần thêm.');
    }
    return this.vocabularyService.addWord(body.category, body.word);
  }

  @Delete('word')
  public removeWord(
    @Body() body: { category: string; word: string }
  ): { success: boolean; message: string } {
    if (!body || !body.category || !body.word) {
      throw new BadRequestException('Vui lòng cung cấp nhóm quy tắc và từ ngữ cần xóa.');
    }
    return this.vocabularyService.removeWord(body.category, body.word);
  }

  @Post('category')
  public addCategory(
    @Body() body: { name: string; description?: string; severity?: 'HIGH' | 'MEDIUM' | 'LOW' }
  ): { success: boolean; message: string; rule?: any } {
    if (!body || !body.name) {
      throw new BadRequestException('Tên nhóm không được để trống.');
    }
    return this.vocabularyService.addCategory(body);
  }

  @Delete('category/:key')
  public deleteCategory(
    @Param('key') key: string
  ): { success: boolean; message: string } {
    if (!key) {
      throw new BadRequestException('Mã nhóm không hợp lệ.');
    }
    return this.vocabularyService.deleteCategory(key);
  }

  @Post('category/:key/toggle')
  public toggleCategory(
    @Param('key') key: string
  ): { success: boolean; enabled: boolean } {
    if (!key) {
      throw new BadRequestException('Mã nhóm không hợp lệ.');
    }
    return this.vocabularyService.toggleCategory(key);
  }

  @Get('raw')
  public getRaw(): { json: string } {
    return { json: this.vocabularyService.getRawJson() };
  }

  @Post('raw')
  public updateRaw(
    @Body() body: { json: string }
  ): { success: boolean; message: string } {
    if (!body || typeof body.json !== 'string') {
      throw new BadRequestException('Nội dung JSON không hợp lệ.');
    }
    return this.vocabularyService.updateRawJson(body.json);
  }

  @Post('test')
  public testCaption(
    @Body() body: { caption: string }
  ): any {
    return this.vocabularyService.testCaption(body?.caption || '');
  }

  @Post('rescan')
  public rescan(): any {
    return this.vocabularyService.rescanAllVideos();
  }
}
