import { VideoItem } from '../../videos/interfaces/video.interface';
import { pickDomCount } from './dom-count';

export interface RawDomCounts {
  likes: string[];
  comments: string[];
  shares: string[];
  views: string[];
}

/**
 * Gộp số liệu bóc tách từ DOM vào kết quả VideoItem theo quy tắc HTML-first:
 * - Nếu giá trị từ HTML/JSON > 0: GIỮ NGUYÊN (HTML thắng).
 * - Chỉ khi giá trị HTML <= 0 hoặc falsy thì mới lấy số liệu từ DOM (nếu DOM > 0).
 * - Không bao giờ hạ số dương xuống 0.
 * - Hàm thuần (pure function), không mutate đối tượng đầu vào.
 */
export function mergeDomCounts(
  result: VideoItem,
  dom: RawDomCounts
): VideoItem {
  const merged: VideoItem = { ...result };

  const domLikes = pickDomCount(dom.likes || []);
  const domComments = pickDomCount(dom.comments || []);
  const domShares = pickDomCount(dom.shares || []);
  const domViews = pickDomCount(dom.views || []);

  if ((!merged.LuotLike || merged.LuotLike === 0) && domLikes > 0) {
    merged.LuotLike = domLikes;
  }

  if ((!merged.LuotComment || merged.LuotComment === 0) && domComments > 0) {
    merged.LuotComment = domComments;
  }

  if ((!merged.SoLuongNguoiShare || merged.SoLuongNguoiShare === 0) && domShares > 0) {
    merged.SoLuongNguoiShare = domShares;
  }

  if ((!merged.LuotXem || merged.LuotXem === 0) && domViews > 0) {
    merged.LuotXem = domViews;
  }

  return merged;
}
