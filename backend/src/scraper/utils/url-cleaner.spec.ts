import {
  detectContentType,
  isRedirectUrl,
  detectPlatform,
  sanitizeUrl,
} from './url-cleaner';

describe('Nhóm 7 — url-cleaner', () => {
  describe('detectContentType & isRedirectUrl', () => {
    it('nhận diện chính xác URL chứa từ "watch" trong slug', () => {
      const url = 'https://www.facebook.com/watchdog.vn/posts/123456';
      expect(detectContentType(url)).toBe('post');
      expect(isRedirectUrl(url)).toBe(false);
    });

    it('nhận diện đúng các loại video và reel của Facebook', () => {
      expect(detectContentType('https://www.facebook.com/watch/?v=999')).toBe('video');
      expect(detectContentType('https://www.facebook.com/reel/123')).toBe('reel');
      expect(detectContentType('https://www.facebook.com/share/v/AbC')).toBe('video');
      expect(detectContentType('https://www.facebook.com/share/r/AbC')).toBe('reel');
    });
  });

  describe('15 ca hồi quy sanitizeUrl & detectPlatform', () => {
    it('1. reel với tham số ?v=', () => {
      expect(sanitizeUrl('https://www.facebook.com/reel/?v=123456&mibextid=abc')).toBe(
        'https://www.facebook.com/reel/123456'
      );
    });

    it('2. watch với tham số &t=', () => {
      expect(sanitizeUrl('https://www.facebook.com/watch/?v=999&t=10s')).toBe(
        'https://www.facebook.com/watch/?v=999'
      );
    });

    it('3. group permalink chuyển về /posts/', () => {
      expect(sanitizeUrl('https://www.facebook.com/groups/123/permalink/456/')).toBe(
        'https://www.facebook.com/groups/123/posts/456'
      );
    });

    it('4. story.php chuyển về permalink.php', () => {
      expect(sanitizeUrl('https://www.facebook.com/story.php?story_fbid=111&id=222')).toBe(
        'https://www.facebook.com/permalink.php?story_fbid=111&id=222'
      );
    });

    it('5. m.facebook.com chuyển về www.facebook.com', () => {
      expect(sanitizeUrl('https://m.facebook.com/page/posts/123')).toBe(
        'https://www.facebook.com/page/posts/123'
      );
    });

    it('6. domain giả mạo facebook.com.evil.test ra platform unknown', () => {
      expect(detectPlatform('https://facebook.com.evil.test/video/123')).toBe('unknown');
    });

    it('7. tiktok URL loại bỏ query parameters', () => {
      expect(sanitizeUrl('https://www.tiktok.com/@user/video/123456?is_from_webapp=1&sender_device=pc')).toBe(
        'https://www.tiktok.com/@user/video/123456'
      );
    });

    it('8. touch.facebook.com chuyển về www.facebook.com', () => {
      expect(sanitizeUrl('https://touch.facebook.com/reel/123')).toBe(
        'https://www.facebook.com/reel/123'
      );
    });

    it('9. tiktok photo URL giữ nguyên format', () => {
      expect(sanitizeUrl('https://www.tiktok.com/@user/photo/123456?extra=1')).toBe(
        'https://www.tiktok.com/@user/photo/123456'
      );
    });

    it('10. /user/videos/slug/id/ chuẩn hóa đúng', () => {
      expect(sanitizeUrl('https://www.facebook.com/user/videos/clip-hay/123456789/')).toBe(
        'https://www.facebook.com/user/videos/123456789/'
      );
    });

    it('11. /share/ link cắt bỏ query params', () => {
      expect(sanitizeUrl('https://www.facebook.com/share/r/AbCdEf/?mibextid=123')).toBe(
        'https://www.facebook.com/share/r/AbCdEf'
      );
    });

    it('12. fb.watch link cắt bỏ query params', () => {
      expect(sanitizeUrl('https://fb.watch/xyz123/?mibextid=abc')).toBe(
        'https://fb.watch/xyz123'
      );
    });

    it('13. l.facebook.com redirect wrapper được phân giải URL gốc', () => {
      expect(
        sanitizeUrl('https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.facebook.com%2Freel%2F999')
      ).toBe('https://www.facebook.com/reel/999');
    });

    it('14. URL không có giao thức tự thêm https://', () => {
      expect(sanitizeUrl('facebook.com/reel/123')).toBe('https://www.facebook.com/reel/123');
    });

    it('15. tiktok shortlink vt.tiktok.com bỏ query', () => {
      expect(sanitizeUrl('https://vt.tiktok.com/ZS123456/?k=1')).toBe('https://vt.tiktok.com/ZS123456');
    });
  });
});
