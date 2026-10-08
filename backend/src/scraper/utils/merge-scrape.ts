import { VideoItem } from '../../videos/interfaces/video.interface';

/**
 * Hợp nhất kết quả cào từ nhiều nguồn (HTTP, Playwright DOM)
 * Quy tắc:
 * 1. Không bao giờ hạ hoặc xóa dữ liệu đã thu thập được từ nguồn trước.
 * 2. Số liệu dương không bị ghi đè thành 0.
 * 3. isShared chỉ nâng từ false -> true, không hạ từ true -> false.
 */
export function mergeScrapeResults(base: VideoItem, candidate: VideoItem): VideoItem {
  return {
    ...base,
    ...candidate,
    link: candidate.link || base.link,
    caption: candidate.caption || base.caption,
    nguoiDang: candidate.nguoiDang || base.nguoiDang,
    ngayDang: candidate.ngayDang || base.ngayDang,
    postId: candidate.postId || base.postId,
    authorUid: candidate.authorUid || base.authorUid,
    authorUrl: candidate.authorUrl || base.authorUrl,
    LuotXem: candidate.LuotXem > 0 ? candidate.LuotXem : (base.LuotXem || 0),
    LuotLike: candidate.LuotLike > 0 ? candidate.LuotLike : (base.LuotLike || 0),
    LuotComment: candidate.LuotComment > 0 ? candidate.LuotComment : (base.LuotComment || 0),
    SoLuongNguoiShare: candidate.SoLuongNguoiShare > 0 ? candidate.SoLuongNguoiShare : (base.SoLuongNguoiShare || 0),
    isShared: base.isShared ? true : Boolean(candidate.isShared),
  };
}
