import { mergeScrapeResults } from './merge-scrape';
import { VideoItem } from '../../videos/interfaces/video.interface';

describe('Nhóm 4 — merge-scrape', () => {
  const createBase = (): VideoItem => ({
    id: 'vid_1',
    link: 'https://facebook.com/video/1',
    loai: 'Facebook Video',
    caption: 'Caption gốc',
    nguoiDang: 'Tác giả gốc',
    ngayDang: '2026-09-01',
    LuotXem: 1000,
    LuotLike: 50,
    LuotComment: 10,
    SoLuongNguoiShare: 5,
    isShared: true,
  });

  it('không hạ số liệu dương xuống 0 khi candidate có số liệu 0', () => {
    const base = createBase();
    const candidate: VideoItem = {
      ...base,
      LuotLike: 0,
      crawlSource: 'playwright',
    };

    const merged = mergeScrapeResults(base, candidate);
    expect(merged.LuotLike).toBe(50);
  });

  it('cập nhật số liệu khi candidate lớn hơn', () => {
    const base = createBase();
    const candidate: VideoItem = {
      ...base,
      LuotLike: 70,
      crawlSource: 'playwright',
    };

    const merged = mergeScrapeResults(base, candidate);
    expect(merged.LuotLike).toBe(70);
  });

  it('không hạ isShared từ true xuống false', () => {
    const base = createBase();
    base.isShared = true;
    const candidate: VideoItem = {
      ...base,
      isShared: false,
      crawlSource: 'playwright',
    };

    const merged = mergeScrapeResults(base, candidate);
    expect(merged.isShared).toBe(true);
  });
});
