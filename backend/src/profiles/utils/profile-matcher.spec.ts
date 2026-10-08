import {
  matchProfile,
  isPostMatchingProfile,
} from './profile-matcher';
import { VideoItem } from '../../videos/interfaces/video.interface';
import { UserProfileItem } from '../interfaces/profile-management.interface';

describe('Nhóm 5 — profile-matcher', () => {
  const createPost = (overrides: Partial<VideoItem> = {}): VideoItem => ({
    link: 'https://facebook.com/post/1',
    loai: 'Facebook Post',
    caption: 'Test caption',
    nguoiDang: 'Tác giả',
    ngayDang: '2026-09-01',
    LuotXem: 0,
    LuotLike: 0,
    LuotComment: 0,
    SoLuongNguoiShare: 0,
    ...overrides,
  });

  const createProfile = (overrides: Partial<UserProfileItem> = {}): UserProfileItem => ({
    id: 'prof_1',
    name: 'Tên Profile',
    profileUrl: 'https://facebook.com/profile_1',
    crawledAt: '2026-09-01',
    status: 'SUCCESS',
    ...overrides,
  });

  describe('Các trường hợp KHÔNG khớp', () => {
    it('không khớp "Linh" vs "Linh Chi"', () => {
      const post = createPost({ nguoiDang: 'Linh' });
      const profile = createProfile({ name: 'Linh Chi' });
      expect(isPostMatchingProfile(post, profile)).toBe(false);
    });

    it('không khớp "An" vs "Nguyễn Thị Lan"', () => {
      const post = createPost({ nguoiDang: 'An' });
      const profile = createProfile({ name: 'Nguyễn Thị Lan' });
      expect(isPostMatchingProfile(post, profile)).toBe(false);
    });

    it('không khớp "Công an" vs "Công an phường Phú Hội"', () => {
      const post = createPost({ nguoiDang: 'Công an' });
      const profile = createProfile({ name: 'Công an phường Phú Hội' });
      expect(isPostMatchingProfile(post, profile)).toBe(false);
    });

    it('không khớp "Công an phường A" vs "Công an phường B"', () => {
      const post = createPost({ nguoiDang: 'Công an phường A' });
      const profile = createProfile({ name: 'Công an phường B' });
      expect(isPostMatchingProfile(post, profile)).toBe(false);
    });

    it('không khớp TikTok uid "ca" vs link /@scarlett/video/123', () => {
      const post = createPost({ link: 'https://www.tiktok.com/@scarlett/video/123' });
      const profile = createProfile({
        uid: 'ca',
        profileUrl: 'https://www.tiktok.com/@ca',
      });
      expect(isPostMatchingProfile(post, profile)).toBe(false);
    });

    it('không khớp slug "a.b" vs link /axb/', () => {
      const post = createPost({ authorUrl: 'https://www.facebook.com/axb/' });
      const profile = createProfile({ profileUrl: 'https://www.facebook.com/a.b/' });
      expect(isPostMatchingProfile(post, profile)).toBe(false);
    });
  });

  describe('Các trường hợp CÓ khớp và trả đúng by', () => {
    it('khớp theo uid', () => {
      const post = createPost({ authorUid: '1000123456789' });
      const profile = createProfile({ uid: '1000123456789' });
      const res = matchProfile(post, profile);
      expect(res.matched).toBe(true);
      expect(res.by).toBe('uid');
    });

    it('khớp theo URL (khác dấu / cuối)', () => {
      const post = createPost({ authorUrl: 'https://www.facebook.com/conganphuhoi/' });
      const profile = createProfile({ profileUrl: 'https://www.facebook.com/conganphuhoi' });
      const res = matchProfile(post, profile);
      expect(res.matched).toBe(true);
      expect(res.by).toBe('url');
    });

    it('khớp theo slug', () => {
      const post = createPost({ authorUrl: 'https://www.facebook.com/conganphuhoi/posts/123' });
      const profile = createProfile({ profileUrl: 'https://www.facebook.com/conganphuhoi' });
      const res = matchProfile(post, profile);
      expect(res.matched).toBe(true);
      expect(res.by).toBe('slug');
    });

    it('khớp theo name: "Công an phường Phú Hội" vs "Công an phường Phú Hội - TP Huế"', () => {
      const post = createPost({ nguoiDang: 'Công an phường Phú Hội' });
      const profile = createProfile({ name: 'Công an phường Phú Hội - TP Huế' });
      const res = matchProfile(post, profile);
      expect(res.matched).toBe(true);
      expect(res.by).toBe('name');
    });
  });
});
