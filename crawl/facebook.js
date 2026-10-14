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

function sanitizeFacebookUrl(url) {
  if (!url) return "";
  let clean = url.trim();
  if (clean.includes("/reel/") || clean.includes("/share/r")) {
    clean = clean.split("?")[0].split("#")[0].replace(/\/+$/, "");
  } else if (clean.includes("/watch")) {
    try {
      const u = new URL(clean);
      const v = u.searchParams.get("v");
      if (v) clean = `https://www.facebook.com/watch/?v=${v}`;
    } catch (e) {}
  }
  return clean;
}

/**
 * Cào dữ liệu Facebook Reel / Video bằng HTTP Request
 * @param {string} url - Đường link video Facebook
 * @param {number} stt - Số thứ tự (mặc định: 1)
 */
async function crawlFacebook(url, stt = 1) {
  const cleanUrl = sanitizeFacebookUrl(url);
  const isReel = cleanUrl.includes("/reel/") || cleanUrl.includes("/share/r");

  const result = {
    STT: stt,
    link: cleanUrl,
    caption: "",
    loai: isReel ? "Facebook Reel" : "Facebook Video",
    nguoiDang: "",
    ngayDang: "",
    SoLuongNguoiShare: 0,
    LuotXem: 0,
    LuotLike: 0,
    LuotComment: 0,
  };

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
  };

  const startTime = Date.now();
  const res = await fetch(cleanUrl, { headers });
  const html = await res.text();
  const elapsedMs = Date.now() - startTime;

  // 1. Bóc tách qua Meta Tags
  const mTitle =
    html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i) ||
    html.match(/<meta\s+name="title"\s+content="([^"]*)"/i);
  const mDesc =
    html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i) ||
    html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);

  const ogTitle = mTitle ? unescapeHtml(mTitle[1]) : "";
  const ogDesc = mDesc ? unescapeHtml(mDesc[1]) : "";

  if (ogTitle) {
    const mView = ogTitle.match(
      /([\d\.,]+\s*(?:triệu|tr|nghìn|k|m|b)?)\s*(?:lượt xem|views|plays)/i,
    );
    if (mView) result.LuotXem = parseNumber(mView[1]);

    const mRxn = ogTitle.match(
      /([\d\.,]+\s*(?:triệu|tr|nghìn|k|m|b)?)\s*(?:cảm xúc|lượt thích|likes|reactions)/i,
    );
    if (mRxn) result.LuotLike = parseNumber(mRxn[1]);

    const parts = ogTitle.split("|");
    if (parts.length >= 2) {
      const cap = parts[parts.length - 2].trim();
      if (cap && cap.toLowerCase() !== "facebook") result.caption = cap;
    }
    if (parts.length >= 3 && !result.nguoiDang) {
      const authorFromTitle = parts[parts.length - 1].trim();
      if (authorFromTitle && authorFromTitle.toLowerCase() !== "facebook") {
        result.nguoiDang = authorFromTitle;
      }
    }
  }

  if (ogDesc && !result.caption) {
    result.caption = ogDesc;
  }

  // 2. Bóc tách Relay GraphQL JSON trong script
  if (!result.LuotXem) {
    const mV =
      html.match(/"video_view_count":\s*(\d+)/) ||
      html.match(/"play_count":\s*(\d+)/);
    if (mV) result.LuotXem = parseInt(mV[1], 10);
  }

  if (!result.LuotLike) {
    const mL = html.match(/"reaction_count":\s*\{\s*"count":\s*(\d+)/);
    if (mL) {
      result.LuotLike = parseInt(mL[1], 10);
    } else {
      const mLi = html.match(/"i18n_reaction_count":\s*"([^"]+)"/);
      if (mLi) result.LuotLike = parseNumber(mLi[1]);
    }
  }

  const mC =
    html.match(/"total_comment_count":\s*(\d+)/) ||
    html.match(/"comment_count":\s*\{\s*"total_count":\s*(\d+)/);
  if (mC) {
    result.LuotComment = parseInt(mC[1], 10);
  } else {
    const mCi = html.match(/"i18n_comment_count":\s*"([^"]+)"/);
    if (mCi) result.LuotComment = parseNumber(mCi[1]);
  }

  const mSr = html.match(/"share_count_reduced":\s*"([^"]+)"/);
  const mS = html.match(/"share_count":\s*\{\s*"count":\s*(\d+)/);
  if (mSr) {
    result.SoLuongNguoiShare = parseNumber(mSr[1]);
  } else if (mS) {
    result.SoLuongNguoiShare = parseInt(mS[1], 10);
  }

  const mT =
    html.match(/"creation_time":\s*(\d+)/) ||
    html.match(/"publish_time":\s*(\d+)/);
  if (mT) result.ngayDang = formatTimestamp(mT[1]);

  if (!result.nguoiDang) {
    const mAuthor =
      html.match(/"owner_as_page":\s*\{\s*"name":\s*"([^"]+)"/) ||
      html.match(
        /"video_owner":\s*\{\s*"__typename":\s*"User"[^}]*"name":\s*"([^"]+)"/,
      ) ||
      html.match(
        /"author":\s*\{\s*"__typename":\s*"User"[^}]*"name":\s*"([^"]+)"/,
      );
    if (mAuthor) result.nguoiDang = unescapeHtml(mAuthor[1]);
  }

  return { ...result, _timeMs: elapsedMs };
}

// Chạy trực tiếp từ dòng lệnh: node crawl/facebook.js "<url>"
if (require.main === module) {
  const url =
    process.argv[2] || "https://www.facebook.com/reel/2650540798735360";
  console.log(`\n🔍 Đang cào Facebook Reel: ${url}...`);
  crawlFacebook(url)
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

module.exports = { crawlFacebook, sanitizeFacebookUrl };
