import { VideoItem } from '../interfaces/video.interface';
import { isValidAuthor, isBoilerplateCaption } from './text-normalizer';
import { PlatformType, ContentType } from './url-cleaner';

export interface ScrapeValidation {
  valid: boolean;
  hasAuthor: boolean;
  hasCaption: boolean;
  hasPostId: boolean;
  hasValidMetrics: boolean;
  confidence: number; // 0 - 100
  missingFields: string[];
  fallbackReason?: string;
  isSuspect?: boolean;
}

/**
 * Đánh giá tính toàn vẹn và độ tin cậy của dữ liệu cào được từ HTTP
 * Quyết định xem có cần fallback sang Playwright Browser hay không.
 */
export function validateScrapeResult(
  data: Partial<VideoItem> | null | undefined,
  platform: PlatformType,
  contentType: ContentType
): ScrapeValidation {
  const missingFields: string[] = [];

  if (!data) {
    return {
      valid: false,
      hasAuthor: false,
      hasCaption: false,
      hasPostId: false,
      hasValidMetrics: false,
      confidence: 0,
      missingFields: ['all'],
      fallbackReason: 'no_data_returned',
    };
  }

  // 1. Kiểm tra tác giả
  const hasAuthor = Boolean(data.nguoiDang && isValidAuthor(data.nguoiDang));
  if (!hasAuthor) {
    missingFields.push('author');
  }

  // 2. Kiểm tra Caption
  const hasCaption = Boolean(
    data.caption &&
    data.caption.trim() &&
    data.caption !== 'Không có tiêu đề' &&
    !isBoilerplateCaption(data.caption)
  );
  if (!hasCaption) {
    missingFields.push('caption');
  }

  // 3. Kiểm tra Post / Video ID
  const hasPostId = Boolean(data.postId && String(data.postId).trim());
  if (!hasPostId) {
    missingFields.push('postId');
  }

  // 4. Kiểm tra Metrics
  const hasViews = typeof data.LuotXem === 'number' && data.LuotXem > 0;
  const hasLikes = typeof data.LuotLike === 'number' && data.LuotLike > 0;
  const hasComments = typeof data.LuotComment === 'number' && data.LuotComment > 0;
  const hasShares = typeof data.SoLuongNguoiShare === 'number' && data.SoLuongNguoiShare > 0;
  const hasValidMetrics = hasViews || hasLikes || hasComments || hasShares;

  if (!hasValidMetrics) {
    missingFields.push('metrics');
  }

  // 5. Tính toán điểm tin cậy (Confidence 0 - 100)
  let confidence = 0;
  if (hasAuthor) confidence += 30;
  if (hasPostId) confidence += 25;
  if (hasCaption) confidence += 20;
  if (hasValidMetrics) {
    confidence += 25;
  } else if (contentType === 'post') {
    // Với bài viết thuần chữ, có thể ban đầu tương tác = 0 nên cho một ít điểm nếu có caption và author
    if (hasAuthor && hasCaption) confidence += 10;
  }

  let isSuspect = false;
  // Dấu hiệu nghi ngờ: Tác giả là UI text hoặc caption là boilerplate
  if (data.nguoiDang && !isValidAuthor(data.nguoiDang)) {
    isSuspect = true;
  }
  if (data.caption && isBoilerplateCaption(data.caption)) {
    isSuspect = true;
  }

  // 6. Quyết định tính hợp lệ của phiên cào HTTP
  let valid = false;
  let fallbackReason: string | undefined;

  if (isSuspect) {
    valid = false;
    fallbackReason = 'suspect_data_detected';
  } else if (platform === 'tiktok') {
    // Với TikTok: Cần tối thiểu author hoặc postId, và (caption hoặc metrics)
    valid = (hasAuthor || hasPostId) && (hasCaption || hasValidMetrics);
    if (!valid) {
      fallbackReason = 'tiktok_insufficient_data';
    }
  } else if (platform === 'facebook') {
    // Với Facebook Video / Reel: Cần có tác giả và ít nhất 1 chỉ số tương tác (views, likes, comments, shares)
    if (contentType === 'reel' || contentType === 'video') {
      valid = hasAuthor && (hasViews || hasLikes || hasComments || hasShares);
      if (!valid) {
        fallbackReason = 'facebook_video_missing_author_or_metrics';
      }
    } else {
      // Với bài viết Facebook: Cần có tác giả và (caption hoặc postId)
      valid = hasAuthor && (hasCaption || hasPostId);
      if (!valid) {
        fallbackReason = 'facebook_post_missing_author_or_caption';
      }
    }
  }

  return {
    valid,
    hasAuthor,
    hasCaption,
    hasPostId,
    hasValidMetrics,
    confidence,
    missingFields,
    fallbackReason,
    isSuspect,
  };
}
