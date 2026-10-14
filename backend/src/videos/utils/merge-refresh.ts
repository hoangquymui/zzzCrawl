import { VideoItem } from '../interfaces/video.interface';
import { checkCaptionViolation } from '../../vocabulary/utils/profanity-checker';
import { isBoilerplateCaption } from '../../scraper/utils/text-normalizer';

/**
 * Hàm thuần gộp dữ liệu video khi refresh, đảm bảo:
 * 1. Caption mới chỉ thay khi khác rỗng và khác 'Không có tiêu đề' (và không phải boilerplate).
 * 2. Chuỗi rỗng không ghi đè chuỗi có giá trị (ngayDang, postId, authorUid, authorUrl, nguoiDang).
 * 3. Số liệu chỉ ghi đè khi fresh > 0.
 * 4. isViolation và violationReason tính trên caption CUỐI CÙNG sau merge, không tính trên placeholder.
 * 5. Tuyệt đối không mutate object đầu vào.
 */
export function mergeRefreshedVideo(oldItem: VideoItem, freshItem: VideoItem): VideoItem {
  const isFreshCaptionValid =
    Boolean(freshItem.caption) &&
    freshItem.caption.trim().length > 0 &&
    freshItem.caption.trim() !== 'Không có tiêu đề' &&
    !isBoilerplateCaption(freshItem.caption);

  const finalCaption = isFreshCaptionValid
    ? freshItem.caption.trim()
    : (oldItem.caption || '');

  // Kiểm tra vi phạm trên caption cuối cùng (không kiểm tra placeholder "Không có tiêu đề")
  const shouldCheckViolation =
    Boolean(finalCaption) &&
    finalCaption !== 'Không có tiêu đề' &&
    !isBoilerplateCaption(finalCaption);

  const violationCheck = shouldCheckViolation
    ? checkCaptionViolation(finalCaption)
    : { isViolation: false, reason: '' };

  // Hợp nhất số liệu:
  // Quy tắc cuối: số liệu chỉ ghi đè khi fresh > 0 (cho phép giảm xuống số dương),
  // fresh === 0 thì giữ số cũ.
  // Refresh không thể hạ chỉ số về 0.
  const mergeNum = (oldVal: number | undefined, freshVal: number | undefined): number => {
    const o = oldVal || 0;
    const f = freshVal !== undefined ? freshVal : 0;
    if (f > 0) return f;
    return o;
  };

  const mergeStr = (oldVal: string | undefined, freshVal: string | undefined): string => {
    if (freshVal && freshVal.trim().length > 0) {
      return freshVal.trim();
    }
    return oldVal || '';
  };

  // isShared khi refresh:
  // Nếu freshItem.crawlSource === 'playwright' thì tin giá trị freshItem.isShared khi nó khác undefined.
  // Nếu nguồn là HTTP thì chỉ cho nâng false -> true, không hạ true -> false.
  let finalIsShared = Boolean(oldItem.isShared);
  if (freshItem.crawlSource === 'playwright' && freshItem.isShared !== undefined) {
    finalIsShared = freshItem.isShared;
  } else if (freshItem.isShared) {
    finalIsShared = true;
  }

  const merged: VideoItem = {
    ...oldItem,
    ...freshItem,
    id: oldItem.id,
    STT: oldItem.STT,
    link: freshItem.link || oldItem.link,
    caption: finalCaption,
    nguoiDang: mergeStr(oldItem.nguoiDang, freshItem.nguoiDang),
    ngayDang: mergeStr(oldItem.ngayDang, freshItem.ngayDang),
    postId: mergeStr(oldItem.postId, freshItem.postId),
    authorUid: mergeStr(oldItem.authorUid, freshItem.authorUid),
    authorUrl: mergeStr(oldItem.authorUrl, freshItem.authorUrl),
    originalAuthor: mergeStr(oldItem.originalAuthor, freshItem.originalAuthor),
    originalAuthorUrl: mergeStr(oldItem.originalAuthorUrl, freshItem.originalAuthorUrl),
    originalPostUrl: mergeStr(oldItem.originalPostUrl, freshItem.originalPostUrl),
    LuotXem: mergeNum(oldItem.LuotXem, freshItem.LuotXem),
    LuotLike: mergeNum(oldItem.LuotLike, freshItem.LuotLike),
    LuotComment: mergeNum(oldItem.LuotComment, freshItem.LuotComment),
    SoLuongNguoiShare: mergeNum(oldItem.SoLuongNguoiShare, freshItem.SoLuongNguoiShare),
    isShared: finalIsShared,
    isViolation: violationCheck.isViolation,
    violationReason: violationCheck.reason || '',
    lastUpdated: new Date().toISOString(),
  };

  return merged;
}
