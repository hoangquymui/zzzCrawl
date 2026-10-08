import { ScraperService } from '../scraper/scraper.service';

describe('Regression Test Script — Kiểm tra hồi quy chéo', () => {
  let scraperService: ScraperService;

  beforeEach(() => {
    const mockCookieService = {
      loadCookies: jest.fn().mockReturnValue([]),
      getNextActiveCookieSlot: jest.fn().mockReturnValue(null),
    };
    scraperService = new ScraperService(mockCookieService as any);
  });

  // 1. Fixture Reel: Format chuẩn Facebook "Stats | Caption | Author | Facebook"
  const reelHtmlFixture = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Facebook</title>
        <meta property="og:title" content="2,01 triệu lượt xem | Video hài hước hôm nay | Kênh Giải Trí | Facebook" />
        <meta property="og:description" content="Xem clip giải trí vui vẻ 🤣🔥 &#x1F602; 2,01 triệu lượt xem" />
        <link rel="canonical" href="https://www.facebook.com/reel/123456789" />
      </head>
      <body>
        <div>2,01 triệu lượt xem</div>
        <script type="application/json">
          {"video":{"id":"123456789","play_count":2010000}}
        </script>
      </body>
    </html>
  `;

  // 2. Fixture Video-page
  const videoPageHtmlFixture = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Facebook</title>
        <meta property="og:title" content="100K lượt xem | Facebook đang làm gì vậy | Tin Tức 24h | Facebook" />
        <meta property="og:description" content="Clip hay mỗi ngày 😊✨ &#x1F60D;" />
        <link rel="canonical" href="https://www.facebook.com/page/videos/987654321/" />
      </head>
      <body>
        <div>Video clip Facebook</div>
      </body>
    </html>
  `;

  // 3. Fixture Text post từ page watchdog.vn
  const textPostHtmlFixture = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Watchdog VN - Bài viết mới | Facebook</title>
        <meta property="og:title" content="Watchdog Việt Nam" />
        <meta property="og:description" content="Cập nhật tin tức an ninh mạng" />
        <link rel="canonical" href="https://www.facebook.com/watchdog.vn/posts/123456789" />
      </head>
      <body>
        <div>Nội dung bài viết watchdog.vn</div>
      </body>
    </html>
  `;

  it('1. Caption "Video hài hước hôm nay" được GIỮ nguyên (không bị loại do boilerplate "Video")', async () => {
    const item = await (scraperService as any).parseFacebookHtml(
      reelHtmlFixture,
      'https://www.facebook.com/reel/123456789',
      1
    );
    expect(item.caption).toBe('Video hài hước hôm nay');
    expect(item.caption).not.toBe('Không có tiêu đề');
  });

  it('2. Emoji trong og:description không thành ký tự private-use, giải mã đúng code point', async () => {
    const unescapedDesc = scraperService.unescapeHtml("Xem clip giải trí vui vẻ 🤣🔥 &#x1F602;");
    expect(unescapedDesc).not.toMatch(/[\uE000-\uF8FF]/);
    expect(unescapedDesc).toContain('🤣');
    expect(unescapedDesc).toContain('🔥');
    expect(unescapedDesc).toContain('😂');
  });

  it('3. Số liệu "2,01 triệu lượt xem" parse ra chính xác 2010000', async () => {
    const parsedNum = scraperService.parseNumber('2,01 triệu lượt xem');
    expect(parsedNum).toBe(2010000);

    const item = await (scraperService as any).parseFacebookHtml(
      reelHtmlFixture,
      'https://www.facebook.com/reel/123456789',
      1
    );
    expect(item.LuotXem).toBe(2010000);
  });

  it('4. Link watchdog.vn/posts/... ra loại "Facebook Post"', async () => {
    const item = await (scraperService as any).parseFacebookHtml(
      textPostHtmlFixture,
      'https://www.facebook.com/watchdog.vn/posts/123456789',
      1
    );
    expect(item.loai).toBe('Facebook Post');
  });
});
