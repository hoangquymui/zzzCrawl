import { mergeRefreshedVideo } from './merge-refresh';
import { VideoItem } from '../interfaces/video.interface';

describe('Nhóm 3 — merge-refresh', () => {
  const baseOld: VideoItem = {
    id: 'vid_123',
    STT: 1,
    link: 'https://www.facebook.com/watch/?v=123',
    loai: 'Facebook Video',
    caption: 'abc đm',
    nguoiDang: 'Tác giả cũ',
    ngayDang: '2026-09-01',
    postId: 'post_123',
    authorUid: 'uid_123',
    authorUrl: 'https://facebook.com/uid_123',
    LuotXem: 1500,
    LuotLike: 100,
    LuotComment: 10,
    SoLuongNguoiShare: 5,
    isViolation: true,
    violationReason: 'Chứa từ ngữ nhạy cảm',
    isShared: false,
    crawlStatus: 'SCRAPE_SUCCESS',
    lastUpdated: '2026-09-01T00:00:00.000Z',
  };

  it('giữ caption cũ và trạng thái vi phạm khi fresh.caption là "Không có tiêu đề"', () => {
    const fresh: VideoItem = {
      ...baseOld,
      caption: 'Không có tiêu đề',
      LuotXem: 0,
      ngayDang: '',
    };

    const merged = mergeRefreshedVideo(baseOld, fresh);
    expect(merged.caption).toBe('abc đm');
    expect(merged.isViolation).toBe(true);
    expect(merged.ngayDang).toBe('2026-09-01');
    expect(merged.LuotXem).toBe(1500);
  });

  it('cập nhật lượt xem khi fresh.LuotXem > 0', () => {
    const fresh: VideoItem = {
      ...baseOld,
      caption: 'Không có tiêu đề',
      LuotXem: 1800,
    };

    const merged = mergeRefreshedVideo(baseOld, fresh);
    expect(merged.LuotXem).toBe(1800);
  });

  it('thay caption và tính lại vi phạm khi fresh.caption hợp lệ mới', () => {
    const fresh: VideoItem = {
      ...baseOld,
      caption: 'Nội dung lành mạnh không vi phạm',
    };

    const merged = mergeRefreshedVideo(baseOld, fresh);
    expect(merged.caption).toBe('Nội dung lành mạnh không vi phạm');
    expect(merged.isViolation).toBe(false);
  });

  it('không mutate object đầu vào', () => {
    const oldCopy = JSON.parse(JSON.stringify(baseOld));
    const fresh: VideoItem = {
      ...baseOld,
      caption: 'Nội dung mới',
      LuotXem: 2000,
    };
    const freshCopy = JSON.parse(JSON.stringify(fresh));

    mergeRefreshedVideo(baseOld, fresh);

    expect(baseOld).toEqual(oldCopy);
    expect(fresh).toEqual(freshCopy);
  });
});
