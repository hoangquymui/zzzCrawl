import { mergeDomCounts } from './merge-dom';
import { VideoItem } from '../../videos/interfaces/video.interface';

describe('Mục 2 — mergeDomCounts (HTML-first & Node DOM parsing)', () => {
  const baseItem: VideoItem = {
    STT: 1,
    link: 'https://fb.com/1',
    caption: '',
    loai: 'Facebook',
    nguoiDang: '',
    ngayDang: '',
    LuotLike: 0,
    LuotComment: 0,
    SoLuongNguoiShare: 0,
    LuotXem: 0,
  };

  it('HTML likes=500, DOM [\'12\'] -> 500 (HTML thắng)', () => {
    const input: VideoItem = {
      ...baseItem,
      LuotLike: 500,
    };
    const dom = {
      likes: ['12'],
      comments: [],
      shares: [],
      views: [],
    };
    const out = mergeDomCounts(input, dom);
    expect(out.LuotLike).toBe(500);
  });

  it('HTML likes=0, DOM [\'1,2 N\'] -> 1200', () => {
    const input: VideoItem = {
      ...baseItem,
      LuotLike: 0,
    };
    const dom = {
      likes: ['1,2 N'],
      comments: [],
      shares: [],
      views: [],
    };
    const out = mergeDomCounts(input, dom);
    expect(out.LuotLike).toBe(1200);
  });

  it('HTML=0, DOM [\'Bạn và 12 người khác\', \'45\'] -> 45', () => {
    const input: VideoItem = {
      ...baseItem,
      LuotLike: 0,
    };
    const dom = {
      likes: ['Bạn và 12 người khác', '45'],
      comments: [],
      shares: [],
      views: [],
    };
    const out = mergeDomCounts(input, dom);
    expect(out.LuotLike).toBe(45);
  });

  it('không mutate đối tượng đầu vào; không hạ số dương xuống 0', () => {
    const input: VideoItem = {
      ...baseItem,
      LuotLike: 100,
      LuotComment: 20,
      SoLuongNguoiShare: 5,
      LuotXem: 5000,
    };
    const inputCopy = { ...input };
    const dom = {
      likes: ['0'],
      comments: [''],
      shares: [],
      views: ['Bạn và 12 người khác'],
    };
    const out = mergeDomCounts(input, dom);
    expect(input).toEqual(inputCopy);
    expect(out).not.toBe(input);
    expect(out.LuotLike).toBe(100);
    expect(out.LuotComment).toBe(20);
    expect(out.SoLuongNguoiShare).toBe(5);
    expect(out.LuotXem).toBe(5000);
  });
});
