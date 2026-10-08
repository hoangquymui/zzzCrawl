import { ScraperService } from '../scraper/scraper.service';

async function runRegression() {
  console.log('--- STARTING REGRESSION TEST SUITE ---');

  const mockCookieService = {
    loadCookies: () => [],
    getNextActiveCookieSlot: () => null,
  };
  const scraperService = new ScraperService(mockCookieService as any);

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

  // 2. Fixture Video-page: Format video page
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

  let passedCount = 0;

  // Test 1: Caption "Video hài hước hôm nay" được GIỮ nguyên (không bị coi là boilerplate do từ "Video")
  const reelItem = await (scraperService as any).parseFacebookHtml(
    reelHtmlFixture,
    'https://www.facebook.com/reel/123456789',
    1
  );
  if (reelItem.caption === 'Video hài hước hôm nay') {
    console.log('✅ Check 1 PASS: Caption "Video hài hước hôm nay" được GIỮ nguyên.');
    passedCount++;
  } else {
    console.error(`❌ Check 1 FAIL: Caption bị đổi thành "${reelItem.caption}"`);
    process.exit(1);
  }

  // Test 2: emoji trong og:description không thành ký tự private-use
  const unescapedDesc = scraperService.unescapeHtml("Xem clip giải trí vui vẻ 🤣🔥 &#x1F602;");
  const hasPrivateUse = /[\uE000-\uF8FF]/.test(unescapedDesc);
  if (!hasPrivateUse && unescapedDesc.includes('🤣') && unescapedDesc.includes('🔥') && unescapedDesc.includes('😂')) {
    console.log('✅ Check 2 PASS: Emoji không bị biến thành ký tự private-use và giải mã đúng code point.');
    passedCount++;
  } else {
    console.error('❌ Check 2 FAIL: Emoji giải mã không đúng hoặc dính private use:', unescapedDesc);
    process.exit(1);
  }

  // Test 3: Số liệu "2,01 triệu lượt xem" cho 2010000
  const parsedNum = scraperService.parseNumber('2,01 triệu lượt xem');
  if (parsedNum === 2010000 && reelItem.LuotXem === 2010000) {
    console.log('✅ Check 3 PASS: Số liệu "2,01 triệu lượt xem" cho 2010000 chính xác.');
    passedCount++;
  } else {
    console.error(`❌ Check 3 FAIL: Số parse ra ${parsedNum}, reelItem.LuotXem ra ${reelItem.LuotXem}`);
    process.exit(1);
  }

  // Test 4: Link watchdog.vn/posts/... ra loại 'Facebook Post'
  const textPostItem = await (scraperService as any).parseFacebookHtml(
    textPostHtmlFixture,
    'https://www.facebook.com/watchdog.vn/posts/123456789',
    1
  );
  if (textPostItem.loai === 'Facebook Post') {
    console.log('✅ Check 4 PASS: Link watchdog.vn/posts/... ra loại "Facebook Post".');
    passedCount++;
  } else {
    console.error(`❌ Check 4 FAIL: Loại nhận được là "${textPostItem.loai}"`);
    process.exit(1);
  }

  console.log(`--- ALL ${passedCount}/4 REGRESSION CHECKS PASSED SUCCESSFULLY ---`);
}

runRegression().catch((err) => {
  console.error('Fatal regression error:', err);
  process.exit(1);
});
