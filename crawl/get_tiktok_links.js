const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

/**
 * Trích xuất username chuẩn từ input (@username hoặc link profile)
 */
function extractTikTokUsername(input) {
  if (!input) return "";
  const clean = input.trim();
  const m = clean.match(/@([a-zA-Z0-9_.-]+)/);
  if (m) return m[1];
  return clean
    .replace(/^https?:\/\/(www\.)?tiktok\.com\//, "")
    .replace(/^@/, "")
    .split(/[?#/]/)[0];
}

/**
 * Cào danh sách link video TikTok của 1 kênh
 * @param {string} target - Tên kênh (@username) hoặc URL profile
 * @param {number} limit - Số lượng link tối đa muốn lấy (mặc định: 15)
 */
async function getTikTokVideoLinks(target, limit = 15) {
  const username = extractTikTokUsername(target);
  if (!username) {
    throw new Error("Không tìm thấy username TikTok hợp lệ trong: " + target);
  }

  const profileUrl = `https://www.tiktok.com/@${username}`;
  console.log(`\n======================================================`);
  console.log(`🔍 [TikTok Video Link Harvester]`);
  console.log(`👉 Kênh mục tiêu: @${username} (${profileUrl})`);
  console.log(`🎯 Số lượng mục tiêu: ${limit} video mới nhất`);
  console.log(`======================================================\n`);

  let browser;
  try {
    browser = await chromium.launch({
      channel: "chrome",
      headless: false,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-infobars",
        "--window-position=-2400,-2400",
        "--window-size=1280,800",
      ],
    });
  } catch (e) {
    // Fallback nếu không có Google Chrome cài sẵn
    browser = await chromium.launch({
      headless: false,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--window-position=-2400,-2400",
      ],
    });
  }

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "vi-VN",
  });

  const page = await context.newPage();
  const collectedLinks = new Set();
  const startTime = Date.now();

  try {
    console.log("[1/3] Đang kết nối đến kênh TikTok...");
    await page.goto(profileUrl, {
      waitUntil: "domcontentloaded",
      timeout: 35000,
    });
    await page.waitForTimeout(4000);

    console.log("[2/3] Đang cuộn trang thu thập link video...");
    let scrollCount = 0;
    const maxScrolls = Math.max(3, Math.ceil(limit / 6) + 2);

    while (collectedLinks.size < limit && scrollCount < maxScrolls) {
      const hrefs = await page.evaluate(() => {
        const anchors = Array.from(
          document.querySelectorAll('a[href*="/video/"]'),
        );
        return anchors.map((a) => a.href);
      });

      for (const h of hrefs) {
        const clean = h.split("?")[0].split("#")[0].replace(/\/+$/, "");
        if (clean.includes("/video/")) {
          collectedLinks.add(clean);
        }
      }

      if (collectedLinks.size >= limit) break;

      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(2000);
      scrollCount++;
      process.stdout.write(
        `\r  ⏳ Đã tìm thấy: ${collectedLinks.size}/${limit} link...`,
      );
    }

    process.stdout.write("\n");
  } catch (err) {
    console.warn("\n⚠️ Thông báo:", err.message);
  } finally {
    await browser.close();
  }

  const results = Array.from(collectedLinks).slice(0, limit);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(
    `\n[3/3] 🎉 HOÀN THÀNH trong ${elapsed}s! Đã thu thập ${results.length} link TikTok:`,
  );
  results.forEach((l, idx) =>
    console.log(`  [${String(idx + 1).padStart(2, " ")}] ${l}`),
  );

  return results;
}

// Chạy trực tiếp từ dòng lệnh: node crawl/get_tiktok_links.js "@vtv24news" [limit]
if (require.main === module) {
  const target = process.argv[2] || "@vtv24news";
  const limit = parseInt(process.argv[3], 10) || 15;

  getTikTokVideoLinks(target, limit)
    .then((links) => {
      if (links.length > 0) {
        const outFile = path.join(__dirname, "tiktok_links.txt");
        fs.writeFileSync(outFile, links.join("\n") + "\n", "utf-8");
        console.log(
          `\n💾 Đã lưu toàn bộ ${links.length} link vào file: ${outFile}\n`,
        );
      } else {
        console.log("\n⚠️ Không tìm thấy video nào cho kênh này.");
      }
    })
    .catch((e) => console.error("❌ Lỗi:", e.message));
}

module.exports = { getTikTokVideoLinks, extractTikTokUsername };
