const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

/**
 * Chuẩn hóa URL trang Facebook về tab /reels/
 */
function formatFacebookReelsUrl(input) {
  let clean = input.trim();
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    clean = "https://www.facebook.com/" + clean.replace(/^\/+/, "");
  }
  clean = clean.split("?")[0].split("#")[0].replace(/\/+$/, "");
  if (!clean.endsWith("/reels")) {
    clean += "/reels/";
  } else {
    clean += "/";
  }
  return clean;
}

/**
 * Cào danh sách link Reel từ trang Facebook
 * @param {string} pageUrl - Link Fanpage / Profile Facebook
 * @param {number} limit - Số lượng link tối đa muốn lấy (mặc định: 15)
 */
async function getFacebookReelLinks(pageUrl, limit = 15) {
  const targetUrl = formatFacebookReelsUrl(pageUrl);
  console.log(`\n======================================================`);
  console.log(`🔍 [Facebook Reels Link Harvester]`);
  console.log(`👉 Trang nguồn: ${targetUrl}`);
  console.log(`🎯 Số lượng mục tiêu: ${limit} link Reel mới nhất`);
  console.log(`======================================================\n`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-infobars",
      "--disable-dev-shm-usage",
      "--lang=vi-VN,vi",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 900 },
    locale: "vi-VN",
  });

  const page = await context.newPage();
  const collectedLinks = new Set();
  const startTime = Date.now();

  try {
    console.log("[1/3] Đang tải giao diện Facebook Reels...");
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 35000,
    });
    await page.waitForTimeout(3500);

    console.log(
      "[2/3] Đang cuộn trang thu thập danh sách link Reel mới nhất...",
    );
    let scrollCount = 0;
    const maxScrolls = Math.max(3, Math.ceil(limit / 5) + 2);

    while (collectedLinks.size < limit && scrollCount < maxScrolls) {
      const hrefs = await page.evaluate(() => {
        const anchors = Array.from(
          document.querySelectorAll('a[href*="/reel/"]'),
        );
        return anchors.map((a) => a.href);
      });

      for (const h of hrefs) {
        const m = h.match(/\/reel\/(\d+)/);
        if (m) {
          collectedLinks.add(`https://www.facebook.com/reel/${m[1]}`);
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
    console.warn("\n⚠️ Thông báo trong quá trình cào:", err.message);
  } finally {
    await browser.close();
  }

  const results = Array.from(collectedLinks).slice(0, limit);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(
    `\n[3/3] 🎉 HOÀN THÀNH trong ${elapsed}s! Đã thu thập ${results.length} link Facebook Reel:`,
  );
  results.forEach((l, idx) =>
    console.log(`  [${String(idx + 1).padStart(2, " ")}] ${l}`),
  );

  return results;
}

// Chạy trực tiếp từ dòng lệnh: node crawl/get_facebook_links.js "<url fanpage>" [limit]
if (require.main === module) {
  const target = process.argv[2] || "https://www.facebook.com/GenshinImpact.vi";
  const limit = parseInt(process.argv[3], 10) || 15;

  getFacebookReelLinks(target, limit)
    .then((links) => {
      if (links.length > 0) {
        const outFile = path.join(__dirname, "facebook_links.txt");
        fs.writeFileSync(outFile, links.join("\n") + "\n", "utf-8");
        console.log(
          `\n💾 Đã lưu toàn bộ ${links.length} link vào file: ${outFile}\n`,
        );
      } else {
        console.log("\n⚠️ Không tìm thấy link Reel nào trên trang này.");
      }
    })
    .catch((e) => console.error("❌ Lỗi:", e.message));
}

module.exports = { getFacebookReelLinks, formatFacebookReelsUrl };
