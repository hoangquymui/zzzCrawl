import { ScraperService } from './scraper.service';
import { CookieService } from '../cookies/cookie.service';
import { chromium } from 'playwright';

describe('Nhóm 8 — Độ bền vận hành', () => {
  let scraperService: ScraperService;
  let mockCookieService: jest.Mocked<Partial<CookieService>>;

  beforeEach(() => {
    mockCookieService = {
      loadCookies: jest.fn().mockReturnValue([]),
      getNextActiveCookieSlot: jest.fn().mockReturnValue(null),
      validateCookieForCrawl: jest.fn().mockResolvedValue(undefined),
    };
    scraperService = new ScraperService(mockCookieService as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. getBrowser() race condition cache', () => {
    it('gọi getBrowser() 5 lần song song thì chromium.launch chỉ được gọi 1 lần', async () => {
      const mockBrowser = {
        isConnected: jest.fn().mockReturnValue(true),
        close: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      };
      const launchSpy = jest
        .spyOn(chromium, 'launch')
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve(mockBrowser as any), 50))
        );

      const results = await Promise.all([
        (scraperService as any).getBrowser(),
        (scraperService as any).getBrowser(),
        (scraperService as any).getBrowser(),
        (scraperService as any).getBrowser(),
        (scraperService as any).getBrowser(),
      ]);

      expect(launchSpy).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(5);
      expect(results[0]).toBe(mockBrowser);
    });
  });

  describe('2. Cookie expirationDate và loadCookies slotId', () => {
    it('chuyển đổi expirationDate của Cookie-Editor thành expires và bỏ cookie đã hết hạn', () => {
      const dbMock = {
        getCookieSlots: jest.fn().mockReturnValue([]),
        saveCookieSlots: jest.fn(),
        getCookie: jest.fn().mockReturnValue(''),
        getCookieLastCheck: jest.fn().mockReturnValue(null),
        saveCookie: jest.fn(),
        saveCookieLastCheck: jest.fn(),
      };
      const cookieService = new CookieService(dbMock as any);
      const nowSec = Math.floor(Date.now() / 1000);

      const rawJson = JSON.stringify([
        {
          name: 'c_user',
          value: '10001234',
          domain: '.facebook.com',
          path: '/',
          expirationDate: nowSec + 3600, // còn hạn
        },
        {
          name: 'expired_cookie',
          value: 'old_value',
          domain: '.facebook.com',
          path: '/',
          expirationDate: nowSec - 3600, // hết hạn
        },
      ]);

      const parsed = cookieService.parseCookiesFromRaw(rawJson);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('c_user');
      expect(parsed[0].expires).toBe(nowSec + 3600);
    });
  });

  describe('3. fetch với AbortSignal.timeout(15000)', () => {
    it('scrapeFacebookHttp truyền signal timeout 15000 vào fetch', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() =>
        Promise.resolve({
          ok: true,
          url: 'https://www.facebook.com/watch/?v=123',
          text: () => Promise.resolve('<html><title>Test Video</title></html>'),
        } as any)
      );

      await scraperService.scrapeFacebookHttp('https://www.facebook.com/watch/?v=123');

      expect(fetchSpy).toHaveBeenCalled();
      const callArgs = fetchSpy.mock.calls[0];
      const options = callArgs[1] as RequestInit;
      expect(options).toBeDefined();
      expect(options.signal).toBeDefined();
    });
  });

  describe('4. scrapeVideo trả kết quả HTTP partial khi Playwright gặp lỗi', () => {
    it('khi Playwright ném lỗi mà đã có kết quả HTTP thì trả PARTIAL_SUCCESS không ném lỗi ra ngoài', async () => {
      const httpResult = {
        id: 'fb-1',
        STT: 1,
        link: 'https://www.facebook.com/watch/?v=123',
        caption: 'Tiêu đề video test',
        loai: 'Facebook Video',
        nguoiDang: 'Tác giả',
        ngayDang: '2026-01-01',
        SoLuongNguoiShare: 0,
        LuotXem: 0, // 0 metrics gây fallback sang Playwright
        LuotLike: 0,
        LuotComment: 0,
      };

      jest.spyOn(scraperService, 'scrapeFacebookHttp').mockResolvedValue(httpResult as any);
      jest
        .spyOn(scraperService, 'scrapeWithBrowser')
        .mockRejectedValue(new Error('Playwright browser crashed'));

      const result = await scraperService.scrapeVideo('https://www.facebook.com/watch/?v=123', 1);

      expect(result).toBeDefined();
      expect(result.crawlStatus).toBe('PARTIAL_SUCCESS');
      expect(result.fallbackReason).toContain('Playwright browser crashed');
      expect(result.caption).toBe('Tiêu đề video test');
    });
  });

  describe('5. Chặn đệ quy scrapeFacebookHttp', () => {
    it('khi depth > 0 không gọi đệ quy cào reel nhúng', async () => {
      const htmlWithEmbeddedReel = `
        <html>
          <head><title>Post Title</title></head>
          <body>
            "video_id":"999999"
          </body>
        </html>
      `;

      jest.spyOn(global, 'fetch').mockImplementation(() =>
        Promise.resolve({
          ok: true,
          url: 'https://www.facebook.com/posts/111',
          text: () => Promise.resolve(htmlWithEmbeddedReel),
        } as any)
      );

      const spyScrapeHttp = jest.spyOn(scraperService, 'scrapeFacebookHttp');

      // Khi gọi với depth = 1 thì không được đệ quy gọi thêm lần nào nữa
      await scraperService.scrapeFacebookHttp('https://www.facebook.com/posts/111', 1, 1);

      expect(spyScrapeHttp).toHaveBeenCalledTimes(1);
    });
  });

  describe('9. profile-scanner không gọi scrapeWithBrowser lần 2 nếu crawlSource === "playwright"', () => {
    it('bỏ qua scrapeWithBrowser khi kết quả scrapeVideo đã có crawlSource là playwright', async () => {
      const mockScraper = {
        scrapeVideo: jest.fn().mockResolvedValue({
          id: 'test-1',
          STT: 1,
          link: 'https://www.facebook.com/posts/123',
          caption: 'Bài viết test',
          loai: 'Facebook Post',
          hasImage: false,
          crawlSource: 'playwright',
        }),
        scrapeWithBrowser: jest.fn(),
      };

      const scraped = await mockScraper.scrapeVideo('https://www.facebook.com/posts/123');
      if (
        scraped.crawlSource !== 'playwright' &&
        !scraped.hasImage &&
        scraped.loai !== 'Facebook Reel' &&
        scraped.loai !== 'Facebook Video'
      ) {
        await mockScraper.scrapeWithBrowser('https://www.facebook.com/posts/123');
      }

      expect(mockScraper.scrapeWithBrowser).not.toHaveBeenCalled();
    });
  });

  describe('Mục 5 — Cookie slot pinning & Scanner cookie slot', () => {
    it('scrapeVideo với link TikTok không gọi getNextActiveCookieSlot; với Facebook gọi đúng 1 lần', async () => {
      jest.spyOn(scraperService as any, 'scrapeTikTokHttp').mockResolvedValue({
        id: 'tt-1',
        link: 'https://www.tiktok.com/@user/video/123',
        caption: 'TikTok caption',
        loai: 'TikTok Video',
        nguoiDang: 'user',
        ngayDang: '2026-01-01',
        LuotXem: 100,
        LuotLike: 10,
        LuotComment: 1,
        SoLuongNguoiShare: 0,
      });

      await scraperService.scrapeVideo('https://www.tiktok.com/@user/video/123');
      expect(mockCookieService.getNextActiveCookieSlot).not.toHaveBeenCalled();

      jest.spyOn(scraperService as any, 'scrapeFacebookHttp').mockResolvedValue({
        id: 'fb-1',
        link: 'https://www.facebook.com/watch/?v=123',
        caption: 'FB caption',
        loai: 'Facebook Video',
        nguoiDang: 'user',
        ngayDang: '2026-01-01',
        LuotXem: 100,
        LuotLike: 10,
        LuotComment: 1,
        SoLuongNguoiShare: 0,
      });

      await scraperService.scrapeVideo('https://www.facebook.com/watch/?v=123');
      expect(mockCookieService.getNextActiveCookieSlot).toHaveBeenCalledTimes(1);
    });

    it('với link Facebook: loadCookies của resolveFinalUrl, scrapeFacebookHttp và scrapeWithBrowser đều nhận CÙNG một slotId', async () => {
      mockCookieService.getNextActiveCookieSlot = jest.fn().mockReturnValue({ id: 42, name: 'Slot 42' });
      const receivedSlotIds: (number | undefined)[] = [];

      jest.spyOn(scraperService as any, 'isRedirectUrl').mockReturnValue(true);
      jest.spyOn(scraperService as any, 'resolveFinalUrl').mockImplementation(async (url: string, slotId?: number) => {
        receivedSlotIds.push(slotId);
        return url;
      });
      jest.spyOn(scraperService as any, 'scrapeFacebookHttp').mockImplementation(async (url: string, stt?: number, retry?: number, slotId?: number) => {
        receivedSlotIds.push(slotId);
        return {
          id: 'fb-1',
          link: url,
          caption: 'cap',
          loai: 'Facebook Video',
          nguoiDang: 'author',
          ngayDang: '2026-01-01',
          LuotXem: 0, // 0 metrics triggers fallback
          LuotLike: 0,
          LuotComment: 0,
          SoLuongNguoiShare: 0,
        };
      });
      jest.spyOn(scraperService as any, 'scrapeWithBrowser').mockImplementation(async (url: string, stt?: number, slotId?: number) => {
        receivedSlotIds.push(slotId);
        return {
          id: 'fb-1',
          link: url,
          caption: 'cap',
          loai: 'Facebook Video',
          nguoiDang: 'author',
          ngayDang: '2026-01-01',
          LuotXem: 100,
          LuotLike: 10,
          LuotComment: 1,
          SoLuongNguoiShare: 0,
        };
      });

      await scraperService.scrapeVideo('https://www.facebook.com/watch/?v=123');

      expect(receivedSlotIds).toHaveLength(3);
      expect(receivedSlotIds[0]).toBe(42);
      expect(receivedSlotIds[1]).toBe(42);
      expect(receivedSlotIds[2]).toBe(42);
    });

    it('scanner: một bài non-video không ảnh gọi scrapeVideo và scrapeWithBrowser với cùng slotId', async () => {
      const mockScraper = {
        pickCookieSlotId: jest.fn().mockReturnValue(7),
        scrapeVideo: jest.fn().mockResolvedValue({
          id: 'fb-post-1',
          link: 'https://www.facebook.com/permalink.php?story_fbid=123',
          caption: 'Nội dung bài viết chữ',
          loai: 'Facebook Post',
          hasImage: false,
          crawlSource: 'http',
          LuotLike: 10,
        }),
        scrapeWithBrowser: jest.fn().mockResolvedValue({
          id: 'fb-post-1',
          caption: 'Nội dung bài viết chữ',
          hasImage: false,
          isShared: false,
          LuotLike: 10,
          LuotComment: 0,
          SoLuongNguoiShare: 0,
        }),
      };

      const crawlUrl = 'https://www.facebook.com/permalink.php?story_fbid=123';
      const slotId = mockScraper.pickCookieSlotId(crawlUrl);
      let scraped = await mockScraper.scrapeVideo(crawlUrl, undefined, slotId);
      if (
        scraped.crawlSource !== 'playwright' &&
        !scraped.hasImage &&
        scraped.loai !== 'Facebook Reel' &&
        scraped.loai !== 'Facebook Video'
      ) {
        await mockScraper.scrapeWithBrowser(crawlUrl, 1, slotId);
      }

      expect(mockScraper.scrapeVideo).toHaveBeenCalledWith(crawlUrl, undefined, 7);
      expect(mockScraper.scrapeWithBrowser).toHaveBeenCalledWith(crawlUrl, 1, 7);
    });
  });
});
