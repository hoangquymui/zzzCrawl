const fs = require("fs");
const path = require("path");
const { crawlFacebook } = require("./facebook.js");
const { crawlTikTok } = require("./tiktok.js");

/**
 * Tự động nhận diện nền tảng và cào dữ liệu
 * @param {string} url - Link Facebook Reel/Video hoặc TikTok
 * @param {number} stt - Số thứ tự
 */
async function crawl(url, stt = 1) {
  if (!url || !url.trim()) {
    throw new Error("Đường link không được để trống");
  }

  const clean = url.trim();
  if (clean.includes("tiktok.com")) {
    return await crawlTikTok(clean, stt);
  } else if (clean.includes("facebook.com") || clean.includes("fb.watch")) {
    return await crawlFacebook(clean, stt);
  } else {
    throw new Error(
      `Đường link không được hỗ trợ: ${clean}. Vui lòng nhập link Facebook hoặc TikTok!`,
    );
  }
}

/**
 * Cào hàng loạt danh sách link theo mô hình đa luồng worker song song
 * @param {string[]} urls - Danh sách URL
 * @param {number} concurrency - Số luồng song song (mặc định: 5)
 * @param {function} onProgress - Callback tiến độ
 */
async function crawlBatch(urls, concurrency = 5, onProgress = null) {
  const cleanUrls = Array.from(
    new Set(urls.map((u) => u.trim()).filter((u) => u && !u.startsWith("#"))),
  );

  const total = cleanUrls.length;
  if (total === 0) return [];

  const results = new Array(total);
  let completed = 0;
  const queue = cleanUrls.map((url, idx) => ({
    url,
    stt: idx + 1,
    index: idx,
  }));

  const worker = async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;

      try {
        const item = await crawl(task.url, task.stt);
        results[task.index] = item;
      } catch (err) {
        results[task.index] = {
          STT: task.stt,
          link: task.url,
          caption: "",
          loai: task.url.includes("tiktok.com")
            ? "TikTok Video"
            : "Facebook Reel",
          nguoiDang: "",
          ngayDang: "",
          SoLuongNguoiShare: 0,
          LuotXem: 0,
          LuotLike: 0,
          LuotComment: 0,
          _error: err.message,
        };
      } finally {
        completed++;
        if (onProgress) onProgress(completed, total, results[task.index]);
      }
    }
  };

  const numWorkers = Math.min(concurrency, total);
  const workers = Array.from({ length: numWorkers }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Xuất danh sách kết quả ra file CSV chuẩn UTF-8 BOM mở bằng Excel
 */
function exportToCSV(data, filePath) {
  const headers = [
    "STT",
    "link",
    "caption",
    "loai",
    "nguoiDang",
    "ngayDang",
    "SoLuongNguoiShare",
    "LuotXem",
    "LuotLike",
    "LuotComment",
  ];
  const rows = data.map((v) => [
    v.STT,
    `"${(v.link || "").replace(/"/g, '""')}"`,
    `"${(v.caption || "").replace(/"/g, '""')}"`,
    `"${(v.loai || "").replace(/"/g, '""')}"`,
    `"${(v.nguoiDang || "").replace(/"/g, '""')}"`,
    `"${(v.ngayDang || "").replace(/"/g, '""')}"`,
    v.SoLuongNguoiShare || 0,
    v.LuotXem || 0,
    v.LuotLike || 0,
    v.LuotComment || 0,
  ]);

  const csvContent =
    "\uFEFF" +
    [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  fs.writeFileSync(filePath, csvContent, "utf-8");
}

// CLI Runner
async function main() {
  const args = process.argv.slice(2);

  let fileArg = null;
  let threads = 5;
  let singleUrl = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" || args[i] === "-f") {
      fileArg = args[i + 1];
      i++;
    } else if (args[i] === "--threads" || args[i] === "-t") {
      threads = parseInt(args[i + 1], 10) || 5;
      i++;
    } else if (!args[i].startsWith("-")) {
      singleUrl = args[i];
    }
  }

  // 1. Trường hợp cào 1 link duy nhất
  if (singleUrl) {
    console.log(`\n🚀 [Crawl] Đang gửi HTTP Request cào dữ liệu...`);
    console.log(`🔗 URL: ${singleUrl}\n`);

    const t0 = Date.now();
    try {
      const data = await crawl(singleUrl, 1);
      const timeMs = data._timeMs || Date.now() - t0;
      delete data._timeMs;

      console.log(
        `⚡ Thời gian hoàn thành: ${timeMs} ms (${(timeMs / 1000).toFixed(2)}s)\n`,
      );
      console.table([data]);
      console.log("\n📄 Chi tiết định dạng JSON:");
      console.log(JSON.stringify(data, null, 2));
    } catch (e) {
      console.error("❌ Lỗi khi cào dữ liệu:", e.message);
    }
    return;
  }

  // 2. Trường hợp cào từ file (mặc định lấy file urls.txt nếu không chỉ định)
  const targetFile = fileArg || path.join(__dirname, "urls.txt");
  if (fs.existsSync(targetFile)) {
    console.log(`\n======================================================`);
    console.log(
      `🚀 BẮT ĐẦU CÀO HÀNG LOẠT ĐA LUỒNG TỪ FILE: ${path.basename(targetFile)}`,
    );
    console.log(`⚡ SỐ LUỒNG SONG SONG (CONCURRENCY): ${threads}`);
    console.log(`======================================================\n`);

    const raw = fs.readFileSync(targetFile, "utf-8");
    const urls = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    console.log(
      `📋 Tổng cộng tìm thấy: ${urls.length} link hợp lệ trong file.\n`,
    );

    const t0 = Date.now();
    const results = await crawlBatch(urls, threads, (done, total, item) => {
      const statusIcon = item._error ? "❌" : "✅";
      const shortName = (item.caption || item.nguoiDang || item.link).slice(
        0,
        45,
      );
      console.log(
        `  [${done}/${total}] ${statusIcon} [${item.loai}] ${shortName}... (${item.LuotXem || 0} views, ${item.LuotLike || 0} likes)`,
      );
    });

    const elapsedTotal = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`\n======================================================`);
    console.log(
      `🎉 HOÀN TẤT CÀO ${results.length} VIDEO TRONG ${elapsedTotal} GIÂY!`,
    );
    console.log(
      `⚡ Tốc độ trung bình: ${(elapsedTotal / results.length).toFixed(2)} giây / video`,
    );
    console.log(`======================================================\n`);

    // In bảng tổng hợp
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

    // Xuất ra output.json và output.csv
    const jsonPath = path.join(__dirname, "output.json");
    const csvPath = path.join(__dirname, "output.csv");

    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), "utf-8");
    exportToCSV(results, csvPath);

    console.log(`💾 Đã xuất kết quả ra file:`);
    console.log(`   👉 JSON: ${jsonPath}`);
    console.log(
      `   👉 CSV : ${csvPath} (Mở trực tiếp bằng Excel không lỗi font)\n`,
    );
    return;
  }

  // 3. Hướng dẫn sử dụng nếu không có tham số
  console.log(`\n📖 HƯỚNG DẪN SỬ DỤNG CÔNG CỤ CÀO (crawl/):`);
  console.log(
    `----------------------------------------------------------------`,
  );
  console.log(`1. Cào 1 link Facebook Reel hoặc TikTok:`);
  console.log(
    `   node crawl/index.js "https://www.facebook.com/reel/1450006703719473"`,
  );
  console.log(
    `   node crawl/index.js "https://www.tiktok.com/@dieuhientran612/video/7656058193382001938"\n`,
  );
  console.log(`2. Cào hàng loạt từ file urls.txt với đa luồng:`);
  console.log(`   node crawl/index.js --threads 5`);
  console.log(`   node crawl/index.js --file my_links.txt --threads 8\n`);
  console.log(`3. Cào riêng từng nền tảng:`);
  console.log(`   node crawl/facebook.js "<link fb reel>"\n`);
  console.log(`   node crawl/tiktok.js "<link tiktok>"\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  crawl,
  crawlBatch,
  crawlFacebook,
  crawlTikTok,
  exportToCSV,
};
