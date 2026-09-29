import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { VideosService } from './videos.service';
import { StorageService } from './storage.service';
import { VideosGateway } from './videos.gateway';
import {
  ViolationRule,
  ViolationResult,
  getViolationRules,
  saveViolationRules,
  addViolationWord,
  removeViolationWord,
  addViolationCategory,
  deleteViolationCategory,
  toggleViolationCategory,
  getRawRulesJson,
  updateRawRulesJson,
  checkCaptionViolation,
  reloadRules,
} from './utils/profanity-checker';

export interface VocabularyStats {
  totalCategories: number;
  totalWords: number;
  totalPatterns: number;
  activeCategories: number;
  violationPostsCount: number;
}

@Injectable()
export class VocabularyService {
  private readonly logger = new Logger(VocabularyService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly videosService: VideosService,
    private readonly storageService: StorageService,
    private readonly videosGateway: VideosGateway
  ) {}

  public getRules(): ViolationRule[] {
    return getViolationRules();
  }

  public getStats(): VocabularyStats {
    const rules = getViolationRules();
    let totalWords = 0;
    let totalPatterns = 0;
    let activeCategories = 0;

    for (const r of rules) {
      if (r.enabled) activeCategories++;
      if (Array.isArray(r.words)) totalWords += r.words.length;
      if (Array.isArray(r.patterns)) totalPatterns += r.patterns.length;
    }

    const videos = this.videosService.getVideos();
    const violationPostsCount = videos.filter((v) => v.isViolation).length;

    return {
      totalCategories: rules.length,
      totalWords,
      totalPatterns,
      activeCategories,
      violationPostsCount,
    };
  }

  public addWord(category: string, word: string): { success: boolean; message: string } {
    const res = addViolationWord(category, word);
    if (!res.success) {
      throw new BadRequestException(res.message);
    }
    return res;
  }

  public removeWord(category: string, word: string): { success: boolean; message: string } {
    const res = removeViolationWord(category, word);
    if (!res.success) {
      throw new BadRequestException(res.message);
    }
    return res;
  }

  public addCategory(dto: { name: string; description?: string; severity?: 'HIGH' | 'MEDIUM' | 'LOW' }): {
    success: boolean;
    rule?: ViolationRule;
    message: string;
  } {
    const res = addViolationCategory(dto);
    if (!res.success) {
      throw new BadRequestException(res.message);
    }
    return res;
  }

  public deleteCategory(categoryKey: string): { success: boolean; message: string } {
    const res = deleteViolationCategory(categoryKey);
    if (!res.success) {
      throw new BadRequestException(res.message);
    }
    return res;
  }

  public toggleCategory(categoryKey: string): { success: boolean; enabled: boolean } {
    return toggleViolationCategory(categoryKey);
  }

  public getRawJson(): string {
    return getRawRulesJson();
  }

  public updateRawJson(jsonStr: string): { success: boolean; message: string } {
    const res = updateRawRulesJson(jsonStr);
    if (!res.success) {
      throw new BadRequestException(res.error || 'Lỗi cập nhật JSON.');
    }
    return { success: true, message: 'Đã cập nhật danh sách quy tắc JSON thành công.' };
  }

  public testCaption(caption: string): ViolationResult {
    return checkCaptionViolation(caption);
  }

  public rescanAllVideos(): {
    totalScanned: number;
    violationCount: number;
    newlyFlagged: number;
    newlyCleared: number;
  } {
    // Tải lại toàn bộ quy tắc để đảm bảo bản mới nhất
    reloadRules();

    const videos = this.videosService.getVideos();
    let newlyFlagged = 0;
    let newlyCleared = 0;
    let hasChanges = false;

    for (const v of videos) {
      const check = checkCaptionViolation(v.caption);
      const wasViolation = Boolean(v.isViolation);

      if (check.isViolation !== wasViolation || check.reason !== v.violationReason) {
        hasChanges = true;
        if (check.isViolation && !wasViolation) {
          newlyFlagged++;
        } else if (!check.isViolation && wasViolation) {
          newlyCleared++;
        }
        v.isViolation = check.isViolation;
        v.violationReason = check.reason;
      }
    }

    if (hasChanges) {
      this.storageService.saveVideos(videos);
      this.db.saveAllVideos(videos);
      this.videosGateway.emitVideosUpdated(videos);
      this.logger.log(
        `[VocabularyRescan] Đã quét lại ${videos.length} bài viết: +${newlyFlagged} vi phạm mới, -${newlyCleared} bỏ gắn cờ.`
      );
    }

    const currentViolations = videos.filter((v) => v.isViolation).length;

    return {
      totalScanned: videos.length,
      violationCount: currentViolations,
      newlyFlagged,
      newlyCleared,
    };
  }
}
