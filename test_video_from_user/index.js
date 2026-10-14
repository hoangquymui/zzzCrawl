const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// ==========================================
// CONFIGURATION
// ==========================================
const PROFILE_URL = "https://www.facebook.com/profile.php?id=61594147624561";
const TARGET_TAG = "m123_kiemtra";
const MAX_SCROLLS = 10;
const COOKIE_FILE = path.join(__dirname, "cookies.json");

/**
 * Normalize a string for comparing names or tags
 */
function normalizeName(str) {
  if (!str) return "";
  return str.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Load and sanitize cookies from cookies.json
 */
function loadCookies(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw || raw === "[]" || raw === "{}") {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
        .filter((c) => c && c.name && c.value)
        .map((c) => {
          let domain = c.domain || ".facebook.com";
          if (!domain.includes("facebook.com")) {
            domain = ".facebook.com";
          }
          const item = {
            name: String(c.name).trim(),
            value: String(c.value).trim(),
            domain: domain,
            path: c.path || "/",
          };

          if (["Strict", "Lax", "None"].includes(c.sameSite)) {
            item.sameSite = c.sameSite;
          }
          if (typeof c.httpOnly === "boolean") item.httpOnly = c.httpOnly;
          if (typeof c.secure === "boolean") item.secure = c.secure;
          if (typeof c.expires === "number" && c.expires > 0) {
            item.expires = Math.floor(c.expires);
          }
          return item;
        });
    }
  } catch (e) {
    // Continue to raw string parser
  }

  return raw
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const eqIdx = p.indexOf("=");
      if (eqIdx === -1) return null;
      return {
        name: p.slice(0, eqIdx).trim(),
        value: p.slice(eqIdx + 1).trim(),
        domain: ".facebook.com",
        path: "/",
      };
    })
    .filter(Boolean);
}

/**
 * Check if the page is currently blocked
 */
async function checkIfBlocked(page, response) {
  if (response && (response.status() === 403 || response.status() === 429)) {
    return true;
  }

  const url = page.url().toLowerCase();
  if (
    url.includes("/checkpoint/") ||
    url.includes("/security/") ||
    url.includes("blocked")
  ) {
    return true;
  }

  const title = (await page.title()).toLowerCase();
  if (
    title.includes("temporarily blocked") ||
    title.includes("bị chặn") ||
    title.includes("security check") ||
    title.includes("kiểm tra bảo mật")
  ) {
    return true;
  }

  const hasBlockedText = await page.evaluate(() => {
    const text = document.body ? document.body.innerText.toLowerCase() : "";
    return (
      text.includes("you’re temporarily blocked") ||
      text.includes("bạn tạm thời bị chặn") ||
      text.includes("help us confirm it's you")
    );
  });

  return hasBlockedText;
}

/**
 * Check if Facebook requires login
 */
async function checkIfLoginRequired(page) {
  const currentUrl = page.url().toLowerCase();

  if (
    currentUrl.includes("/login") ||
    currentUrl.includes("login.php") ||
    currentUrl.includes("next=")
  ) {
    return true;
  }

  const title = (await page.title()).toLowerCase();
  if (
    title.startsWith("đăng nhập") ||
    title.startsWith("log in") ||
    title.includes("đăng nhập facebook") ||
    title.includes("log in to facebook")
  ) {
    return true;
  }

  const loginBarrier = await page.evaluate(() => {
    const hasLoginForm = !!document.querySelector(
      'form[action*="login"], input[name="email"], input[type="password"]',
    );

    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    const hasLoginDialog = dialogs.some((d) => {
      const text = (d.innerText || "").toLowerCase();
      return (
        text.includes("đăng nhập") ||
        text.includes("log in") ||
        text.includes("xem thêm trên facebook") ||
        text.includes("see more on facebook")
      );
    });

    const hasFeed = !!document.querySelector('[role="feed"]');
    const articles = document.querySelectorAll('[role="article"]');
    const hasArticles = articles.length > 0;
    const hasMessages =
      document.querySelectorAll('div[data-ad-preview="message"]').length > 0;
    const hasActionButtons =
      document.querySelectorAll('[aria-label="Like"], [aria-label="Thích"]')
        .length > 0;

    const loginLinks = Array.from(
      document.querySelectorAll('a[href*="/login"]'),
    );

    return {
      hasLoginForm,
      hasLoginDialog,
      hasContent: hasFeed || hasArticles || hasMessages || hasActionButtons,
      loginLinkCount: loginLinks.length,
    };
  });

  if (loginBarrier.hasContent) {
    return false;
  }

  if (
    loginBarrier.hasLoginDialog ||
    loginBarrier.hasLoginForm ||
    loginBarrier.loginLinkCount > 0
  ) {
    return true;
  }

  return false;
}

/**
 * Dismiss non-blocking modal if present
 */
async function dismissLoginModalIfPossible(page) {
  try {
    const closeSelector =
      '[aria-label="Đóng"], [aria-label="Close"], div[role="button"][aria-label="Đóng"], div[role="button"][aria-label="Close"]';
    const closeBtn = await page.$(closeSelector);
    if (closeBtn) {
      await closeBtn.click();
      await page.waitForTimeout(1500);
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Extract posts from the page
 */
async function extractPosts(page, targetTagNormalized) {
  return await page.evaluate(
    ({ targetTagNormalized, targetTagRaw }) => {
      function norm(str) {
        if (!str) return "";
        return str.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
      }

      // 1. Identify distinct top-level post cards
      let postCardElements = [];

      // Option A: Top-level role="article" (excluding nested articles inside shared posts)
      const rawArticles = Array.from(
        document.querySelectorAll('div[role="article"]'),
      );
      const topArticles = rawArticles.filter(
        (a) => !a.parentElement.closest('div[role="article"]'),
      );

      if (topArticles.length > 0) {
        postCardElements = topArticles;
      } else {
        // Option B: Group by post cards using messages and action buttons
        const messages = Array.from(
          document.querySelectorAll('div[data-ad-preview="message"]'),
        );
        const actionButtons = Array.from(
          document.querySelectorAll(
            '[aria-label="Like"], [aria-label="Thích"], [aria-label="Bày tỏ cảm xúc"], [aria-label="React"]',
          ),
        );

        const seenCards = new Set();

        // For each message, walk up to find the enclosing post card
        for (const msg of messages) {
          let card = msg;
          while (
            card &&
            card.parentElement &&
            card.parentElement !== document.body
          ) {
            if (
              card.querySelector(
                '[aria-label="Like"], [aria-label="Thích"], [aria-label="Bày tỏ cảm xúc"], [aria-label="React"]',
              )
            ) {
              break;
            }
            card = card.parentElement;
          }
          if (card && !seenCards.has(card)) {
            seenCards.add(card);
            postCardElements.push(card);
          }
        }

        // Check action buttons not covered (e.g. video-only posts with no text message)
        for (const btn of actionButtons) {
          const alreadyCovered = postCardElements.some((c) => c.contains(btn));
          if (!alreadyCovered) {
            let card = btn;
            while (
              card &&
              card.parentElement &&
              card.parentElement !== document.body
            ) {
              if (
                card.parentElement.children.length > 1 &&
                card.innerText.length > 30
              ) {
                break;
              }
              card = card.parentElement;
            }
            if (card && !seenCards.has(card)) {
              seenCards.add(card);
              postCardElements.push(card);
            }
          }
        }
      }

      const posts = [];

      for (const el of postCardElements) {
        const text = el.innerText || "";
        const textNorm = norm(text);

        // --- Detect Video ---
        let hasVideo = false;
        let videoUrl = "";

        // 1. <video> tag
        const videoEl = el.querySelector("video");
        if (videoEl) {
          hasVideo = true;
          videoUrl =
            videoEl.src ||
            (videoEl.querySelector("source")
              ? videoEl.querySelector("source").src
              : "");
          if (!videoUrl && videoEl.getAttribute("poster")) {
            videoUrl = videoEl.getAttribute("poster");
          }
        }

        // 2. Direct video / watch / reel links
        const allLinks = Array.from(el.querySelectorAll("a[href]"));
        const videoLinks = allLinks.filter((a) => {
          const h = a.href.toLowerCase();
          return (
            h.includes("/videos/") ||
            h.includes("/reel/") ||
            h.includes("/watch") ||
            h.includes("fb.watch")
          );
        });
        if (videoLinks.length > 0) {
          hasVideo = true;
          // Prefer clean video permalink over poster image
          if (
            !videoUrl ||
            videoUrl.includes(".jpg") ||
            videoUrl.includes(".png")
          ) {
            videoUrl = videoLinks[0].href;
          }
        }

        // 3. Play buttons or duration badges (e.g. "0:00 / 0:12")
        if (!hasVideo) {
          const hasTimeDuration = /\d+:\d+\s*\/\s*\d+:\d+/.test(text);
          const playBtn = el.querySelector(
            '[aria-label*="Play" i], [aria-label*="Phát" i], [aria-label*="Xem video" i], [aria-label*="Reel" i], [aria-label*="Thước phim" i]',
          );
          if (hasTimeDuration || playBtn) {
            hasVideo = true;
          }
        }

        // --- Detect Tag ---
        let hasTargetTag = false;
        let taggedName = "";

        const targetTagClean = targetTagNormalized.replace(/^#/, "");

        // 1. Check anchor tags (hashtags or profile tags)
        for (const link of allLinks) {
          const linkText = link.innerText || "";
          const linkNorm = norm(linkText);
          const ariaLabelNorm = norm(link.getAttribute("aria-label") || "");
          const hrefLower = link.href.toLowerCase();

          if (
            linkNorm === targetTagClean ||
            linkNorm === "#" + targetTagClean ||
            linkNorm.includes(targetTagClean) ||
            ariaLabelNorm.includes(targetTagClean) ||
            hrefLower.includes(targetTagClean)
          ) {
            hasTargetTag = true;
            taggedName = linkText.trim() || targetTagRaw;
            break;
          }
        }

        // 2. Fallback: text matching within post
        if (!hasTargetTag) {
          if (
            textNorm.includes(targetTagClean) ||
            textNorm.includes("#" + targetTagClean)
          ) {
            hasTargetTag = true;
            taggedName = targetTagRaw;
          }
        }

        // --- Extract Post URL ---
        let postUrl = "";
        const permalinks = allLinks.filter((a) => {
          const h = a.href;
          return (
            (h.includes("/posts/") ||
              h.includes("/permalink.php") ||
              h.includes("story.php") ||
              h.includes("/videos/") ||
              h.includes("/reel/")) &&
            !h.includes("/hashtag/")
          );
        });

        if (permalinks.length > 0) {
          postUrl = permalinks[0].href;
        } else {
          // Fallback: look for timestamp link with __tn__ parameter
          const timestampLink = allLinks.find(
            (a) =>
              a.href.includes("__tn__=%2CO%2CP-R") ||
              a.href.includes("__tn__=*NK") ||
              a.href.includes("__tn__=%2CO%2CP"),
          );
          if (timestampLink) {
            postUrl = timestampLink.href;
          }
        }

        // --- Extract Date ---
        let date = "";
        const timeEl = el.querySelector(
          'abbr, [aria-label*="202"], [aria-label*="hour"], [aria-label*="phút"], [aria-label*="giờ"], [aria-label*="tháng"], [aria-label*="Tháng"]',
        );
        if (timeEl) {
          date = (
            timeEl.getAttribute("aria-label") ||
            timeEl.innerText ||
            ""
          ).trim();
        }

        const id = postUrl || videoUrl || text.slice(0, 100);

        posts.push({
          id,
          hasVideo,
          hasTargetTag,
          postUrl: postUrl || "N/A",
          videoUrl: videoUrl || (hasVideo ? "(Facebook video stream)" : "N/A"),
          date: date || "N/A",
          taggedName: taggedName || "N/A",
        });
      }

      return posts;
    },
    { targetTagNormalized, targetTagRaw: TARGET_TAG },
  );
}

// ==========================================
// MAIN RUNNER
// ==========================================
(async () => {
  console.log("========================================");
  console.log("Facebook Video + Tag Test");
  console.log("========================================");
  console.log("");
  console.log("Profile:");
  console.log(PROFILE_URL);
  console.log("");
  console.log("Target tag:");
  console.log(TARGET_TAG);
  console.log("");

  const cookies = loadCookies(COOKIE_FILE);
  if (cookies.length > 0) {
    console.log(
      `Using cookies: YES (${cookies.length} cookies loaded from cookies.json)`,
    );
  } else {
    console.log("Using cookies: NO (cookies.json trống hoặc chưa có)");
  }
  console.log("");
  console.log("Opening Facebook...");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-notifications",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  let postsDetectedCount = 0;
  let videosDetectedCount = 0;
  let matchingTaggedVideosCount = 0;

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
      locale: "vi-VN",
    });

    if (cookies.length > 0) {
      try {
        await context.addCookies(cookies);
      } catch (cookieErr) {
        console.warn("[WARN] Lỗi khi thêm cookie:", cookieErr.message);
      }
    }

    const page = await context.newPage();

    let response;
    try {
      response = await page.goto(PROFILE_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
    } catch (err) {
      console.log("");
      console.log("[BLOCKED]");
      console.log("");
      console.log(
        "Facebook blocked the request or navigation failed: " + err.message,
      );
      console.log("");
      console.log("ACCESS FAILED");
      console.log("Reason: NAVIGATION_ERROR");
      return;
    }

    await page.waitForTimeout(4000);

    // 1. Check if blocked
    const isBlocked = await checkIfBlocked(page, response);
    if (isBlocked) {
      console.log("");
      console.log("[BLOCKED]");
      console.log("");
      console.log("Facebook blocked the request.");
      console.log("");
      console.log("========================================");
      console.log("RESULT");
      console.log("========================================");
      console.log("");
      console.log("Posts detected: 0");
      console.log("Videos detected: 0");
      console.log("Matching tagged videos: 0");
      console.log("");
      console.log("ACCESS FAILED");
      console.log("Reason: BLOCKED");
      return;
    }

    // 2. Check if login is required
    const isLoginRequired = await checkIfLoginRequired(page);

    if (isLoginRequired) {
      await dismissLoginModalIfPossible(page);
      const stillLoginRequired = await checkIfLoginRequired(page);

      if (stillLoginRequired) {
        console.log("");
        console.log("[LOGIN_REQUIRED]");
        console.log("");
        if (cookies.length > 0) {
          console.log(
            "Facebook requires login. Cookie hiện tại có thể đã hết hạn hoặc không hợp lệ.",
          );
        } else {
          console.log("Facebook requires login to access this profile.");
        }
        console.log("");
        console.log("========================================");
        console.log("RESULT");
        console.log("========================================");
        console.log("");
        console.log("Posts detected: 0");
        console.log("Videos detected: 0");
        console.log("Matching tagged videos: 0");
        console.log("");
        console.log("ACCESS FAILED");
        console.log("Reason: LOGIN_REQUIRED");
        return;
      }
    }

    // 3. Access successful - scan posts
    console.log("");
    console.log("[ACCESS_SUCCESS]");
    console.log("");
    console.log("Scanning posts...");

    const targetTagNorm = normalizeName(TARGET_TAG);
    const seenPostIds = new Set();

    for (let scrollIdx = 0; scrollIdx <= MAX_SCROLLS; scrollIdx++) {
      const currentPosts = await extractPosts(page, targetTagNorm);

      for (const p of currentPosts) {
        if (!seenPostIds.has(p.id)) {
          seenPostIds.add(p.id);
          postsDetectedCount++;

          if (p.hasVideo) {
            videosDetectedCount++;
          }

          if (p.hasVideo && p.hasTargetTag) {
            matchingTaggedVideosCount++;
            console.log("");
            console.log("[FOUND]");
            console.log("");
            console.log(`Date: ${p.date}`);
            console.log(`Tagged: ${p.taggedName}`);
            console.log("Has video: YES");
            console.log(`Post URL: ${p.postUrl}`);
            console.log(`Video URL: ${p.videoUrl}`);
          }
        }
      }

      if (scrollIdx < MAX_SCROLLS) {
        await page.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight),
        );
        await page.waitForTimeout(2500);

        const scrollBlocked = await checkIfLoginRequired(page);
        if (scrollBlocked) {
          await dismissLoginModalIfPossible(page);
        }
      }
    }

    console.log("");
    console.log("========================================");
    console.log("RESULT");
    console.log("========================================");
    console.log("");
    console.log(`Posts detected: ${postsDetectedCount}`);
    console.log(`Videos detected: ${videosDetectedCount}`);
    console.log(`Matching tagged videos: ${matchingTaggedVideosCount}`);
  } catch (err) {
    console.error("Unexpected error during execution:", err);
  } finally {
    await browser.close();
  }
})();
