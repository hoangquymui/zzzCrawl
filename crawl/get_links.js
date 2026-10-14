const fs = require("fs");
const path = require("path");
const { getTikTokVideoLinks } = require("./get_tiktok_links.js");
const { getFacebookReelLinks } = require("./get_facebook_links.js");
const { crawlBatch, exportToCSV } = require("./index.js");

async function main() {
  const args = process.argv.slice(2);

  let target = null;
  let limit = 10;
  let outFile = path.join(__dirname, "links.txt");
  let autoScrape = false;
  let forcePlatform = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--limit" || arg === "-l" || arg === "-n") {
      limit = parseInt(args[i + 1], 10) || 10;
      i++;
    } else if (arg === "--out" || arg === "-o") {
      outFile = path.resolve(args[i + 1]);
      i++;
    } else if (arg === "--scrape" || arg === "-s") {
      autoScrape = true;
    } else if (arg === "--platform" || arg === "-p") {
      forcePlatform = (args[i + 1] || "").toLowerCase();
      i++;
    } else if (!arg.startsWith("-")) {
      target = arg;
    }
  }

  if (!target) {
    console.log(`\n📖 HƯỚNG DẪN CÀO THU THẬP LINK TIKTOK & FACEBOOK REEL:`);
    console.log(
      `----------------------------------------------------------------`,
    );
    console.log(`1. Cào link video từ kênh TikTok:`);
    console.log(`   node crawl/get_links.js "@vtv24news" --limit 10`);
    console.log(
      `   node crawl/get_links.js "https://www.tiktok.com/@schannelvn" --limit 15\n`,
    );
    console.log(`2. Cào link Reel từ Fanpage / Profile Facebook:`);
    console.log(
      `   node crawl/get_links.js "https://www.facebook.com/GenshinImpact.vi" --limit 10`,
    );
    console.log(
      `   node crawl/get_links.js "https://www.facebook.com/anhdavangofficial" --limit 10\n`,
    );
    console.log(
      `3. Cào link XONG rồi CÀO LUÔN cả 10 chỉ số (Views, Likes, Shares, Comments):`,
    );
    console.log(`   node crawl/get_links.js "@vtv24news" --limit 10 --scrape`);
    console.log(
      `   node crawl/get_links.js "https://www.facebook.com/GenshinImpact.vi" --limit 10 --scrape\n`,
    );
    return;
  }

  const cleanTarget = target.trim();
  let links = [];

  const isTikTok =
    forcePlatform === "tiktok" ||
    cleanTarget.startsWith("@") ||
    cleanTarget.includes("tiktok.com");
  const isFacebook =
    forcePlatform === "facebook" ||
    forcePlatform === "fb" ||
    cleanTarget.includes("facebook.com") ||
    cleanTarget.includes("fb.watch");

  if (isTikTok) {
    links = await getTikTokVideoLinks(cleanTarget, limit);
  } else if (isFacebook) {
    links = await getFacebookReelLinks(cleanTarget, limit);
  } else {
    // Đoán theo định dạng
    if (cleanTarget.startsWith("@")) {
      links = await getTikTokVideoLinks(cleanTarget, limit);
    } else {
      console.log("⚠️ Không nhận diện rõ nền tảng, thử cào Facebook Reels...");
      links = await getFacebookReelLinks(cleanTarget, limit);
    }
  }

  if (!links || links.length === 0) {
    console.log("❌ Không tìm thấy link nào.");
    return;
  }

  // Lưu danh sách link ra file
  fs.writeFileSync(outFile, links.join("\n") + "\n", "utf-8");
  console.log(`💾 Đã lưu thành công ${links.length} link vào file: ${outFile}`);

  // Nếu người dùng yêu cầu cào luôn cả 10 chỉ số đo lường
  if (autoScrape) {
    console.log(`\n======================================================`);
    console.log(
      `🚀 BẮT ĐẦU CÀO CHI TIẾT 10 TRƯỜNG DỮ LIỆU CỦA ${links.length} LINK VỪA LẤY...`,
    );
    console.log(`======================================================\n`);

    const t0 = Date.now();
    const results = await crawlBatch(links, 5, (done, total, item) => {
      const shortCap = (item.caption || item.link).slice(0, 45);
      console.log(
        `  [${done}/${total}] ✅ [${item.loai}] ${shortCap}... (${item.LuotXem || 0} views, ${item.LuotLike || 0} likes)`,
      );
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`\n🎉 Hoàn thành bóc tách trong ${elapsed}s!`);
    console.table(
      results.map((r) => {
        const copy = { ...r };
        delete copy._timeMs;
        delete copy._error;
        if (copy.caption && copy.caption.length > 35) {
          copy.caption = copy.caption.slice(0, 32) + "...";
        }
        return copy;
      }),
    );

    const jsonPath = path.join(__dirname, "output.json");
    const csvPath = path.join(__dirname, "output.csv");
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), "utf-8");
    exportToCSV(results, csvPath);

    console.log(`\n💾 Kết quả chi tiết đã xuất ra:`);
    console.log(`   👉 JSON: ${jsonPath}`);
    console.log(`   👉 CSV : ${csvPath}\n`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
