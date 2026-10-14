function unescapeHtml(text) {
  if (!text) return "";
  let res = String(text)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\\r/g, "")
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\\//g, "/");

  try {
    res = res.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  } catch (e) {}

  return res.replace(/\s+/g, " ").trim();
}

function parseNumber(text) {
  if (text === null || text === undefined) return 0;
  if (typeof text === "number") return Math.floor(text);

  let str = String(text)
    .trim()
    .replace(/\xa0/g, " ")
    .replace(/&nbsp;/g, " ");
  const match = str.match(
    /([\d\.,]+)\s*(triệu|tr|nghìn|ngàn|tỷ|[kKmMbB])?(?=\s|[^\w]|$)/i,
  );
  if (!match) return 0;

  let numStr = match[1].trim();
  const unit = (match[2] || "").toLowerCase();

  if (numStr.includes(",") && numStr.includes(".")) {
    if (numStr.lastIndexOf(",") > numStr.lastIndexOf(".")) {
      numStr = numStr.replace(/\./g, "").replace(",", ".");
    } else {
      numStr = numStr.replace(/,/g, "");
    }
  } else if (numStr.includes(",")) {
    const parts = numStr.split(",");
    if (
      parts.length === 2 &&
      (parts[1].length === 1 || parts[1].length === 2) &&
      unit
    ) {
      numStr = parts[0] + "." + parts[1];
    } else {
      numStr = numStr.replace(/,/g, "");
    }
  } else if (numStr.includes(".")) {
    const parts = numStr.split(".");
    if (parts.length === 2 && parts[1].length === 3 && !unit) {
      numStr = numStr.replace(/\./g, "");
    }
  }

  const val = parseFloat(numStr);
  if (isNaN(val)) return 0;

  if (["k", "nghìn", "ngàn"].includes(unit)) return Math.floor(val * 1000);
  if (["m", "triệu", "tr"].includes(unit)) return Math.floor(val * 1000000);
  if (["b", "tỷ"].includes(unit)) return Math.floor(val * 1000000000);
  return Math.floor(val);
}

function formatTimestamp(ts) {
  if (!ts) return "";
  let num = parseInt(ts, 10);
  if (isNaN(num)) return String(ts);
  if (num > 100000000000) num = Math.floor(num / 1000);
  const d = new Date(num * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function sanitizeTikTokUrl(url) {
  if (!url) return "";
  return url.trim().split("?")[0].split("#")[0].replace(/\/+$/, "");
}

/**
 * Cào dữ liệu TikTok Video bằng HTTP Request
 * @param {string} url - Đường link video TikTok
 * @param {number} stt - Số thứ tự (mặc định: 1)
 */
async function crawlTikTok(url, stt = 1) {
  const cleanUrl = sanitizeTikTokUrl(url);

  const result = {
    STT: stt,
    link: cleanUrl,
    caption: "",
    loai: "TikTok Video",
    nguoiDang: "",
    ngayDang: "",
    SoLuongNguoiShare: 0,
    LuotXem: 0,
    LuotLike: 0,
    LuotComment: 0,
  };

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
  };

  const startTime = Date.now();
  const res = await fetch(cleanUrl, { headers });
  const html = await res.text();
  const elapsedMs = Date.now() - startTime;

  // 1. Trích xuất từ __UNIVERSAL_DATA_FOR_REHYDRATION__
  const match = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (match) {
    try {
      const json = JSON.parse(match[1]);
      const scope = json["__DEFAULT_SCOPE__"] || {};
      const videoDetail =
        scope["webapp.video-detail"] || scope["webapp.videoDetail"];
      const item = videoDetail?.itemInfo?.itemStruct;

      if (item) {
        result.caption = unescapeHtml(item.desc || "");
        result.nguoiDang = unescapeHtml(
          item.author?.nickname || item.author?.uniqueId || "",
        );
        if (item.createTime) result.ngayDang = formatTimestamp(item.createTime);

        const stats = item.stats || item.statsV2 || {};
        result.LuotLike = parseNumber(stats.diggCount);
        result.SoLuongNguoiShare = parseNumber(stats.shareCount);
        result.LuotComment = parseNumber(stats.commentCount);
        result.LuotXem = parseNumber(stats.playCount);
      }
    } catch (e) {}
  }

  // 2. Trích xuất từ SIGI_STATE nếu có
  if (!result.caption || !result.LuotXem) {
    const mSigi = html.match(
      /<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (mSigi) {
      try {
        const sigi = JSON.parse(mSigi[1]);
        const itemModule = sigi.ItemModule || {};
        const firstKey = Object.keys(itemModule)[0];
        if (firstKey && itemModule[firstKey]) {
          const it = itemModule[firstKey];
          if (!result.caption) result.caption = unescapeHtml(it.desc || "");
          if (!result.nguoiDang)
            result.nguoiDang = unescapeHtml(it.author || it.nickname || "");
          if (!result.ngayDang && it.createTime)
            result.ngayDang = formatTimestamp(it.createTime);
          if (!result.LuotXem && it.stats)
            result.LuotXem = parseNumber(it.stats.playCount);
          if (!result.LuotLike && it.stats)
            result.LuotLike = parseNumber(it.stats.diggCount);
          if (!result.SoLuongNguoiShare && it.stats)
            result.SoLuongNguoiShare = parseNumber(it.stats.shareCount);
          if (!result.LuotComment && it.stats)
            result.LuotComment = parseNumber(it.stats.commentCount);
        }
      } catch (e) {}
    }
  }

  // 3. Fallback regex trực tiếp từ HTML
  if (!result.caption) {
    const mDesc = html.match(/"desc":\s*"([^"]+)"/);
    if (mDesc) result.caption = unescapeHtml(mDesc[1]);
  }
  if (!result.nguoiDang) {
    const mAuthor = html.match(/"nickname":\s*"([^"]+)"/);
    if (mAuthor) result.nguoiDang = unescapeHtml(mAuthor[1]);
  }
  if (!result.nguoiDang) {
    const mUser = cleanUrl.match(/@([^/?#]+)/);
    if (mUser) result.nguoiDang = mUser[1];
  }
  if (!result.ngayDang) {
    const mT = html.match(/"createTime":\s*"?(\d+)"?/);
    if (mT) result.ngayDang = formatTimestamp(mT[1]);
  }
  if (!result.LuotLike) {
    const mL = html.match(/"diggCount":\s*(\d+)/);
    if (mL) result.LuotLike = parseInt(mL[1], 10);
  }
  if (!result.LuotXem) {
    const mV = html.match(/"playCount":\s*(\d+)/);
    if (mV) result.LuotXem = parseInt(mV[1], 10);
  }
  if (!result.SoLuongNguoiShare) {
    const mS = html.match(/"shareCount":\s*(\d+)/);
    if (mS) result.SoLuongNguoiShare = parseInt(mS[1], 10);
  }
  if (!result.LuotComment) {
    const mC = html.match(/"commentCount":\s*(\d+)/);
    if (mC) result.LuotComment = parseInt(mC[1], 10);
  }

  return { ...result, _timeMs: elapsedMs };
}

// Chạy trực tiếp từ dòng lệnh: node crawl/tiktok.js "<url>"
if (require.main === module) {
  const url =
    process.argv[2] ||
    "https://www.tiktok.com/@dieuhientran612/video/7656058193382001938";
  console.log(`\n🔍 Đang cào TikTok Video: ${url}...`);
  crawlTikTok(url)
    .then((data) => {
      console.log(`⚡ Xong sau: ${data._timeMs} ms\n`);
      delete data._timeMs;
      console.table([data]);
      console.log("\nChi tiết JSON:");
      console.log(JSON.stringify(data, null, 2));
    })
    .catch((err) => {
      console.error("Lỗi:", err.message);
    });
}

module.exports = { crawlTikTok, sanitizeTikTokUrl };
