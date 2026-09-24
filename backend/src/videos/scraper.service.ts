import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser } from 'playwright';
import { VideoItem } from './interfaces/video.interface';
import { CookieService } from './cookie.service';

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private browserInstance: Browser | null = null;

  constructor(private readonly cookieService: CookieService) {}

  /**
   * Giải mã các ký tự mã hóa HTML (&#x...;, &amp;, &quot;,...) và escape JSON
   */
  public unescapeHtml(text?: string | null): string {
    if (!text) return '';
    let res = String(text)
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&apos;/g, "'")
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\\r/g, '')
      .replace(/\\n/g, ' ')
      .replace(/\\"/g, '"')
      .replace(/\\\//g, '/');

    try {
      res = res.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
    } catch {
      // Bỏ qua lỗi
    }

    // Xử lý surrogate pairs (emoji): \uD83D\uDE00 → 😀
    try {
      res = res.replace(
        /[\uD800-\uDBFF][\uDC00-\uDFFF]/g,
        (pair) => pair // Giữ nguyên surrogate pair hợp lệ
      );
    } catch {
      // Bỏ qua lỗi
    }

    return res.replace(/\s+/g, ' ').trim();
  }

  /**
   * Chuyển đổi các định dạng số có đơn vị (2,8 triệu, 1.3K, 45K, 2.8M, 2,823,400) sang số nguyên
   */
  public parseNumber(text?: string | number | null): number {
    if (text === null || text === undefined) return 0;
    if (typeof text === 'number') return Math.floor(text);

    const str = String(text).trim().replace(/\xa0/g, ' ').replace(/&nbsp;/g, ' ');
    const match = str.match(/([\d.,]+)\s*(triệu|tr|nghìn|ngàn|tỷ|[kKmMbB])?(?=\s|[^\w]|$)/i);
    if (!match) return 0;

    let numStr = match[1].trim();
    const unit = (match[2] || '').toLowerCase();

    if (numStr.includes(',') && numStr.includes('.')) {
      if (numStr.lastIndexOf(',') > numStr.lastIndexOf('.')) {
        numStr = numStr.replace(/\./g, '').replace(',', '.');
      } else {
        numStr = numStr.replace(/,/g, '');
      }
    } else if (numStr.includes(',')) {
      const parts = numStr.split(',');
      if (parts.length === 2 && (parts[1].length === 1 || parts[1].length === 2) && unit) {
        numStr = parts[0] + '.' + parts[1];
      } else {
        numStr = numStr.replace(/,/g, '');
      }
    } else if (numStr.includes('.')) {
      const parts = numStr.split('.');
      if (parts.length === 2 && parts[1].length === 3 && !unit) {
        numStr = numStr.replace(/\./g, '');
      }
    }

    const val = parseFloat(numStr);
    if (isNaN(val)) return 0;

    if (['k', 'nghìn', 'ngàn'].includes(unit)) return Math.floor(val * 1000);
    if (['m', 'triệu', 'tr'].includes(unit)) return Math.floor(val * 1000000);
    if (['b', 'tỷ'].includes(unit)) return Math.floor(val * 1000000000);
    return Math.floor(val);
  }

  /**
   * Chuyển timestamp Unix sang chuỗi ngày giờ YYYY-MM-DD HH:MM:SS
   */
  public formatTimestamp(ts?: string | number | null): string {
    if (!ts) return '';
    let num = parseInt(String(ts), 10);
    if (isNaN(num)) return String(ts);
    if (num > 100000000000) num = Math.floor(num / 1000);
    const d = new Date(num * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  /**
   * Kiểm tra chuỗi caption có phải là văn bản rác giao diện mặc định của Facebook hay không
   */
  public isBoilerplateCaption(text?: string | null): boolean {
    if (!text) return true;
    const clean = text.trim().toLowerCase();
    const boilerplate = [
      'video liên quan',
      'related videos',
      'xem video liên quan',
      'xem video',
      'xem thêm trên facebook',
      'see more on facebook',
      'video này hiện không khả dụng',
      "this video isn't available now",
      "this video isn't available right now",
      'đăng nhập',
      'log in',
      'sign up',
      'facebook',
      'flame',
      'support',
      'video',
    ];
    return boilerplate.some(
      (b) => clean === b || clean.startsWith(b + ' ') || clean.endsWith(' ' + b)
    );
  }

  /**
   * Giải mã ký tự unicode escape trong JSON (ví dụ: \u0025, \n, v.v.)
   */
  public decodeJsonEscapes(str: string): string {
    if (!str) return '';
    try {
      return JSON.parse(`"${str.replace(/"/g, '\\"')}"`);
    } catch {
      return this.unescapeHtml(
        str
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) =>
            String.fromCharCode(parseInt(code, 16))
          )
      );
    }
  }

  /**
   * Làm sạch link: Cắt bỏ các tham số rác sau dấu '?'
   */
  public sanitizeUrl(url: string): string {
    if (!url) return '';
    let clean = url.trim();

    // 1. Nếu link là wrapper redirect Facebook (l.facebook.com/l.php?u=... hoặc lm.facebook.com/l.php?u=...)
    if (clean.includes('facebook.com/l.php?') || clean.includes('/l.php?u=')) {
      try {
        const uObj = new URL(clean.startsWith('http') ? clean : 'https://' + clean);
        const targetParam = uObj.searchParams.get('u');
        if (targetParam) {
          clean = decodeURIComponent(targetParam);
        }
      } catch {}
    }

    // 2. Thêm giao thức https:// nếu người dùng dán link dạng domain/...
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }

    // 3. Chuẩn hóa tên miền phụ Facebook về www.facebook.com
    clean = clean.replace(
      /^https?:\/\/(?:web|m|touch|x|mbasic)\.facebook\.com/i,
      'https://www.facebook.com'
    );

    // 4. Xử lý các link TikTok
    if (clean.includes('tiktok.com')) {
      // 4a. Mobile URL: https://m.tiktok.com/v/123456789.html -> https://www.tiktok.com/video/123456789
      const mMobileTt = clean.match(/(?:m\.)?tiktok\.com\/v\/(\d+)\.html/i);
      if (mMobileTt) {
        return `https://www.tiktok.com/video/${mMobileTt[1]}`;
      }

      // 4b. Embed URL: https://www.tiktok.com/embed/v2/123456789 -> https://www.tiktok.com/video/123456789
      const mEmbedTt = clean.match(/tiktok\.com\/embed\/v\d+\/(\d+)/i);
      if (mEmbedTt) {
        return `https://www.tiktok.com/video/${mEmbedTt[1]}`;
      }

      // 4c. Dạng chuẩn @username/video/123456 hoặc @username/photo/123456
      const mStandardTt = clean.match(/tiktok\.com\/(@[^/?#]+)\/(video|photo)\/(\d+)/i);
      if (mStandardTt) {
        return `https://www.tiktok.com/${mStandardTt[1]}/${mStandardTt[2].toLowerCase()}/${mStandardTt[3]}`;
      }

      // 4d. Các shortlink như vt.tiktok.com/ZS... hoặc vm.tiktok.com/ZS... hoặc tiktok.com/t/ZT...
      return clean.split('?')[0].split('#')[0].replace(/\/+$/, '');
    }

    // 5. Xử lý các link Facebook
    if (clean.includes('facebook.com') || clean.includes('fb.watch')) {
      // 5a. Dạng Facebook Reel: /reel/123..., /reels/123..., /reel/?v=123..., /reel/pfbid...
      const mReel = clean.match(/\/reels?\/([a-zA-Z0-9_-]+)/i);
      if (mReel && mReel[1] !== 'watch' && mReel[1] !== 'videos') {
        return `https://www.facebook.com/reel/${mReel[1]}`;
      }
      if (clean.includes('/reel/') || clean.includes('/reels/')) {
        try {
          const u = new URL(clean);
          const v = u.searchParams.get('v') || u.searchParams.get('video_id');
          if (v) return `https://www.facebook.com/reel/${v}`;
        } catch {}
      }

      // 5b. Dạng Facebook Watch hoặc Video: https://www.facebook.com/watch/?v=123... hoặc video.php?v=123...
      if (clean.includes('/watch') || clean.includes('video.php')) {
        try {
          const u = new URL(clean);
          const v = u.searchParams.get('v') || u.searchParams.get('video_id');
          if (v) return `https://www.facebook.com/watch/?v=${v}`;
        } catch {}
      }

      // 5c. Dạng Video trên Page/User: /[username]/videos/[slug]/[id]/ hoặc /[username]/videos/[id]/
      const mVideos = clean.match(/\/videos\/(?:[^/?#]+\/)*(\d+)/i);
      if (mVideos) {
        return `https://www.facebook.com/watch/?v=${mVideos[1]}`;
      }

      // 5d. Dạng Group Posts / Permalinks: /groups/[id]/posts/[postId] hoặc /groups/[id]/permalink/[postId]
      const mGroupPosts = clean.match(
        /^https?:\/\/(?:www\.)?facebook\.com\/groups\/([^/?#]+)\/(?:posts|permalink)\/(?:[^/?#]+\/)*([a-zA-Z0-9_-]+)/i
      );
      if (mGroupPosts) {
        return `https://www.facebook.com/groups/${mGroupPosts[1]}/posts/${mGroupPosts[2]}`;
      }

      // 5e. Dạng User / Page Posts: /[username]/posts/([slug]/)*([id])
      const mPosts = clean.match(
        /^https?:\/\/(?:www\.)?facebook\.com\/([^/?#]+)\/posts\/(?:[^/?#]+\/)*([a-zA-Z0-9_-]+)/i
      );
      if (mPosts) {
        return `https://www.facebook.com/${mPosts[1]}/posts/${mPosts[2]}`;
      }

      // 5f. Dạng permalink.php / story.php / profile.php?story_fbid=...
      if (
        clean.includes('permalink.php') ||
        clean.includes('story.php') ||
        (clean.includes('profile.php') && (clean.includes('story_fbid=') || clean.includes('fbid=')))
      ) {
        try {
          const u = new URL(clean);
          const storyFbid = u.searchParams.get('story_fbid') || u.searchParams.get('fbid');
          const id = u.searchParams.get('id');
          if (storyFbid && id) {
            return `https://www.facebook.com/permalink.php?story_fbid=${storyFbid}&id=${id}`;
          }
        } catch {}
      }

      // 5g. Dạng photo / photo.php
      if (clean.includes('/photo/') || clean.includes('/photo?') || clean.includes('photo.php')) {
        try {
          const u = new URL(clean);
          const keep: string[] = [];
          const fbid = u.searchParams.get('fbid');
          const set = u.searchParams.get('set');
          const id = u.searchParams.get('id');
          if (fbid) keep.push(`fbid=${fbid}`);
          if (set) keep.push(`set=${encodeURIComponent(set)}`);
          if (id) keep.push(`id=${id}`);
          if (keep.length > 0) {
            return `${u.origin}${u.pathname}?${keep.join('&')}`;
          }
          return clean.split('?')[0];
        } catch {}
      }

      // 5h. Dạng share link: /share/r/, /share/v/, /share/p/, /share/
      if (clean.includes('/share/')) {
        return clean.split('?')[0].split('#')[0].replace(/\/+$/, '');
      }

      // 5i. Dạng fb.watch short link
      if (clean.includes('fb.watch')) {
        return clean.split('?')[0].split('#')[0].replace(/\/+$/, '');
      }
    }

    // Cắt bỏ query params dư thừa cho các link Facebook còn lại (giữ pathname sạch)
    if (clean.includes('facebook.com')) {
      try {
        const u = new URL(clean);
        if (!u.pathname.includes('permalink.php') && !u.pathname.includes('profile.php') && !u.pathname.includes('photo')) {
          return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
        }
      } catch {}
    }

    return clean;
  }

  /**
   * Tự động phân giải và theo dõi chuỗi redirect để lấy URL cuối cùng (Canonical/Final URL)
   */
  public async resolveFinalUrl(url: string): Promise<string> {
    if (!url) return '';
    const clean = this.sanitizeUrl(url);

    try {
      const isTikTok = clean.includes('tiktok.com');
      const headers = isTikTok ? this.ttHeaders : this.fbHeaders;

      const res = await fetch(clean, {
        method: 'GET',
        headers,
        redirect: 'follow',
      });

      let finalUrl = res.url ? this.sanitizeUrl(res.url) : clean;

      // Đọc thêm thẻ canonical hoặc og:url từ HTML để đảm bảo 100% chuẩn link gốc của video/post
      const html = await res.text();
      const mCanonical =
        html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i) ||
        html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i);

      if (mCanonical) {
        const canonical = this.sanitizeUrl(this.unescapeHtml(mCanonical[1]));
        if (
          canonical &&
          !canonical.includes('/login') &&
          !canonical.endsWith('facebook.com') &&
          !canonical.endsWith('tiktok.com') &&
          (canonical.includes('/reel/') ||
            canonical.includes('/videos/') ||
            canonical.includes('/watch') ||
            canonical.includes('/posts/') ||
            canonical.includes('/groups/') ||
            canonical.includes('/photo') ||
            canonical.includes('permalink.php') ||
            canonical.includes('/video/') ||
            canonical.includes('/photo/'))
        ) {
          finalUrl = canonical;
        }
      }

      return this.sanitizeUrl(finalUrl);
    } catch {
      return clean;
    }
  }

  private readonly fbHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
  };

  private readonly fbBotHeaders = {
    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  /**
   * Bóc tách Facebook bằng HTTP Request (~0.8s)
   */
  public async scrapeFacebookHttp(url: string, stt: number = 1): Promise<VideoItem> {
    const cleanUrl = this.sanitizeUrl(url);
    const res = await fetch(cleanUrl, { headers: this.fbHeaders, redirect: 'follow' });
    const finalHttpUrl = res.url ? this.sanitizeUrl(res.url) : cleanUrl;
    const html = await res.text();
    let result = await this.parseFacebookHtml(html, finalHttpUrl, stt);

    // Nếu lần fetch đầu tiên bị login wall hoặc thiếu dữ liệu quan trọng, thử fallback qua Facebook Bot Headers
    const isLacking = !result.nguoiDang || (result.LuotXem === 0 && result.LuotLike === 0);
    const isLoginWall = html.includes('/login') || html.length < 5000;

    if (isLacking || isLoginWall) {
      try {
        const botRes = await fetch(cleanUrl, { headers: this.fbBotHeaders, redirect: 'follow' });
        if (botRes.ok) {
          const botHtml = await botRes.text();
          const botResult = await this.parseFacebookHtml(
            botHtml,
            botRes.url ? this.sanitizeUrl(botRes.url) : finalHttpUrl,
            stt
          );
          if (botResult.nguoiDang || botResult.caption || botResult.LuotXem > 0 || botResult.LuotLike > 0) {
            result = {
              ...result,
              ...botResult,
              nguoiDang: botResult.nguoiDang || result.nguoiDang,
              caption: botResult.caption || result.caption,
              LuotXem: botResult.LuotXem || result.LuotXem,
              LuotLike: botResult.LuotLike || result.LuotLike,
              link: botResult.link || result.link,
            };
          }
        }
      } catch {}
    }

    return result;
  }

  /**
   * Phân tích HTML Facebook đã tải (dùng chung cho HTTP request và Playwright fallback)
   */
  private async parseFacebookHtml(html: string, cleanUrl: string, stt: number): Promise<VideoItem> {
    let effectiveUrl = cleanUrl;

    // 0. Trích xuất Canonical URL hoặc og:url từ HTML để lấy link đích cuối cùng chuẩn nhất
    const mCanonical =
      html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i) ||
      html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i);
    if (mCanonical) {
      const canonical = this.sanitizeUrl(this.unescapeHtml(mCanonical[1]));
      if (
        canonical &&
        !canonical.includes('/login') &&
        !canonical.endsWith('facebook.com') &&
        (canonical.includes('/reel/') ||
          canonical.includes('/videos/') ||
          canonical.includes('/watch') ||
          canonical.includes('/posts/') ||
          canonical.includes('/groups/') ||
          canonical.includes('/photo') ||
          canonical.includes('permalink.php'))
      ) {
        effectiveUrl = canonical;
      }
    }

    const isReel =
      effectiveUrl.includes('/reel/') ||
      effectiveUrl.includes('/share/r') ||
      effectiveUrl.includes('/share/v');
    const isPhoto =
      effectiveUrl.includes('/photo') ||
      effectiveUrl.includes('photo.php');
    const isPermalink =
      effectiveUrl.includes('permalink.php') ||
      effectiveUrl.includes('story.php') ||
      effectiveUrl.includes('/posts/') ||
      effectiveUrl.includes('/groups/');

    const result: VideoItem = {
      STT: stt,
      link: effectiveUrl,
      caption: '',
      loai: isReel
        ? 'Facebook Reel'
        : isPhoto
        ? 'Facebook Photo'
        : isPermalink
        ? 'Facebook Post'
        : 'Facebook Video',
      nguoiDang: '',
      ngayDang: '',
      SoLuongNguoiShare: 0,
      LuotXem: 0,
      LuotLike: 0,
      LuotComment: 0,
    };

    // 1. Bóc tách từ thẻ Meta
    const mTitle =
      html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i) ||
      html.match(/<meta\s+name="title"\s+content="([^"]*)"/i);
    const mDesc =
      html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i) ||
      html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);

    const ogTitle = mTitle ? this.unescapeHtml(mTitle[1]) : '';
    const ogDesc = mDesc ? this.unescapeHtml(mDesc[1]) : '';

    if (ogTitle) {
      const mView = ogTitle.match(
        /([\d.,]+\s*(?:triệu|tr|nghìn|k|m|b)?)\s*(?:lượt xem|views|plays)/i
      );
      if (mView) result.LuotXem = this.parseNumber(mView[1]);

      const mRxn = ogTitle.match(
        /([\d.,]+\s*(?:triệu|tr|nghìn|k|m|b)?)\s*(?:cảm xúc|lượt thích|likes|reactions)/i
      );
      if (mRxn) result.LuotLike = this.parseNumber(mRxn[1]);

      const parts = ogTitle.split('|').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        // Phần cuối: "Facebook" hoặc "Tên tác giả" hoặc "Tên tác giả on Reels"
        let lastPart = parts[parts.length - 1];
        let authorFromTitle = '';
        let authorIdx = parts.length; // index bắt đầu vùng author (exclusive cho caption)

        if (lastPart.toLowerCase() === 'facebook') {
          // Format: "Stats | Caption... | Author | Facebook"
          if (parts.length >= 3) {
            authorFromTitle = parts[parts.length - 2].trim();
            authorIdx = parts.length - 2;
          }
        } else {
          // Format: "Stats | Caption... | Author" (không có "Facebook" ở cuối)
          authorFromTitle = lastPart.trim();
          authorIdx = parts.length - 1;
        }

        authorFromTitle = authorFromTitle.replace(/\s+(?:on|trên)\s+reels$/i, '').trim();
        if (authorFromTitle && authorFromTitle.toLowerCase() !== 'facebook') {
          result.nguoiDang = authorFromTitle;
        }

        // Caption = ghép các phần ở giữa (bỏ phần stats đầu và phần author/Facebook cuối)
        const firstIsStats = /lượt xem|views|cảm xúc|reactions|likes|plays/i.test(parts[0]);
        const startIdx = firstIsStats ? 1 : 0;

        const captionParts = parts.slice(startIdx, authorIdx);
        if (captionParts.length > 0) {
          const cap = captionParts.join(' | ').trim();
          if (
            cap &&
            !this.isBoilerplateCaption(cap) &&
            !/^[\d.,\s]*(?:triệu|tr|nghìn|k|m|b)?\s*(?:lượt xem|views|cảm xúc|reactions|likes)/i.test(cap)
          ) {
            result.caption = cap;
          }
        }
      } else if (parts.length === 1) {
        // Dạng bài viết cá nhân: og:title chính là tên người đăng bài
        if (
          parts[0].toLowerCase() !== 'facebook' &&
          !/lượt xem|views|cảm xúc|reactions|likes/i.test(parts[0])
        ) {
          let authorFromTitle = parts[0].trim();
          authorFromTitle = authorFromTitle.replace(/\s+(?:on|trên)\s+reels$/i, '').trim();
          result.nguoiDang = authorFromTitle;
        }
      }
    }

    if (
      ogDesc &&
      !result.caption &&
      !this.isBoilerplateCaption(ogDesc) &&
      !/^[\d.,\s]*(?:triệu|tr|nghìn|k|m|b)?\s*(?:lượt xem|views|cảm xúc|lượt thích|likes|bình luận|comments)/i.test(
        ogDesc
      )
    ) {
      result.caption = ogDesc;
    }

    if (!result.caption) {
      // Xác định videoId hiện tại để tìm caption chính xác của video này
      const targetVideoId =
        effectiveUrl.match(/\/(?:reel|videos)\/(\d+)/)?.[1] ||
        effectiveUrl.match(/[?&]v=(\d+)/)?.[1];

      let foundMessage = '';
      if (targetVideoId) {
        // Duyệt qua tất cả các vị trí của targetVideoId trong HTML để tìm khối chứa message thật (tránh kẹt ở <head>)
        let searchIndex = 0;
        while ((searchIndex = html.indexOf(targetVideoId, searchIndex)) !== -1) {
          const start = Math.max(0, searchIndex - 2000);
          const end = Math.min(html.length, searchIndex + 4000);
          const chunk = html.slice(start, end);

          const mChunkMsg = chunk.match(/"message":\s*\{\s*"text":\s*"((?:[^"\\]|\\.)*)"/);
          if (mChunkMsg && mChunkMsg[1]) {
            const matchIndex = mChunkMsg.index || 0;
            const sub = chunk.slice(Math.max(0, matchIndex - 200), matchIndex);
            if (
              !sub.includes('"Comment"') &&
              !sub.includes('"feedback"') &&
              !this.isBoilerplateCaption(mChunkMsg[1])
            ) {
              foundMessage = mChunkMsg[1];
              break;
            }
          }

          const mSavable = chunk.match(/"savable_description":\s*\{\s*"text":\s*"((?:[^"\\]|\\.)*)"/);
          if (mSavable && mSavable[1] && !this.isBoilerplateCaption(mSavable[1])) {
            foundMessage = mSavable[1];
            break;
          }

          const mTitleChunk = chunk.match(/"video_title":\s*"((?:[^"\\]|\\.)*)"/);
          if (mTitleChunk && mTitleChunk[1] && !this.isBoilerplateCaption(mTitleChunk[1])) {
            foundMessage = mTitleChunk[1];
            break;
          }

          searchIndex += targetVideoId.length;
        }
      }

      // Quét khối creation_story (nơi lưu caption chính thức của bài viết)
      if (!foundMessage) {
        const creationStoryIdx = html.indexOf('"creation_story"');
        if (creationStoryIdx !== -1) {
          const chunk = html.slice(creationStoryIdx, creationStoryIdx + 8000);
          const mStoryMsg = chunk.match(/"message":\s*\{\s*"text":\s*"((?:[^"\\]|\\.)*)"/);
          if (mStoryMsg && mStoryMsg[1] && !this.isBoilerplateCaption(mStoryMsg[1])) {
            foundMessage = mStoryMsg[1];
          }
        }
      }

      // Quét khối comet_sections
      if (!foundMessage) {
        const cometIdx = html.indexOf('"comet_sections"');
        if (cometIdx !== -1) {
          const chunk = html.slice(cometIdx, cometIdx + 8000);
          const mStoryMsg = chunk.match(/"message":\s*\{\s*"text":\s*"((?:[^"\\]|\\.)*)"/);
          if (mStoryMsg && mStoryMsg[1] && !this.isBoilerplateCaption(mStoryMsg[1])) {
            foundMessage = mStoryMsg[1];
          }
        }
      }

      if (foundMessage) {
        result.caption = this.decodeJsonEscapes(foundMessage);
      }
    }

    // 2. Bóc tách từ các khối Relay GraphQL script trong HTML (Scoped theo Video ID)
    const targetVideoId =
      effectiveUrl.match(/\/(?:reel|videos)\/(\d+)/)?.[1] ||
      effectiveUrl.match(/[?&]v=(\d+)/)?.[1];

    if (!result.LuotXem && targetVideoId) {
      result.LuotXem = this.extractMetricScopedByVideoId(html, targetVideoId, [
        /"video_view_count":\s*(\d+)/,
        /"play_count":\s*(\d+)/,
      ]);
    }

    if (!result.LuotLike && targetVideoId) {
      result.LuotLike = this.extractMetricScopedByVideoId(html, targetVideoId, [
        /"reaction_count":\s*\{\s*"count":\s*(\d+)/,
        /"unified_reactors":\s*\{\s*"count":\s*(\d+)/,
        /"likers":\s*\{\s*"count":\s*(\d+)/,
        /"default_reaction_count":\s*(\d+)/,
        /"top_reactions":\s*\{\s*"count":\s*(\d+)/,
        /"i18n_reaction_count":\s*"([^"]+)"/,
      ]);
    }

    if (!result.LuotComment && targetVideoId) {
      result.LuotComment = this.extractMetricScopedByVideoId(html, targetVideoId, [
        /"total_comment_count":\s*(\d+)/,
        /"comment_count":\s*\{\s*"total_count":\s*(\d+)/,
        /"i18n_comment_count":\s*"([^"]+)"/,
      ]);
    }

    if (!result.SoLuongNguoiShare && targetVideoId) {
      result.SoLuongNguoiShare = this.extractMetricScopedByVideoId(html, targetVideoId, [
        /"share_count":\s*\{\s*"count":\s*(\d+)/,
        /"share_count_reduced":\s*"([^"]+)"/,
      ]);
    }

    // Nếu không có videoId hoặc chưa lấy được từ scope videoId, mới tìm trong creation_story hoặc khối chính
    if (!result.LuotLike) {
      const mL =
        html.match(/"reaction_count":\s*\{\s*"count":\s*(\d+)/) ||
        html.match(/"unified_reactors":\s*\{\s*"count":\s*(\d+)/) ||
        html.match(/"top_reactions":\s*\{\s*"count":\s*(\d+)/);
      if (mL) result.LuotLike = parseInt(mL[1], 10);
    }

    if (!result.LuotComment) {
      const mC =
        html.match(/"total_comment_count":\s*(\d+)/) ||
        html.match(/"comment_count":\s*\{\s*"total_count":\s*(\d+)/);
      if (mC) result.LuotComment = parseInt(mC[1], 10);
    }

    if (!result.SoLuongNguoiShare) {
      const mS = html.match(/"share_count":\s*\{\s*"count":\s*(\d+)/);
      if (mS) result.SoLuongNguoiShare = parseInt(mS[1], 10);
    }

    const mT = html.match(/"creation_time":\s*(\d+)/) || html.match(/"publish_time":\s*(\d+)/);
    if (mT) result.ngayDang = this.formatTimestamp(mT[1]);

    // 2b. Nếu chưa có tác giả, kiểm tra thẻ <title>
    if (!result.nguoiDang) {
      const mPageTitle = html.match(/<title>([^<]+)<\/title>/);
      if (mPageTitle) {
        const titleText = this.unescapeHtml(mPageTitle[1]).trim();
        const beforePipe = titleText.split('|')[0].trim();
        const beforeDash = beforePipe.split(' - ')[0].trim();
        const invalidTitles = [
          'facebook',
          'trang này hiện không hiển thị',
          "this page isn't available",
          'this page isn’t available',
          'log in to facebook',
          'đăng nhập facebook',
          'đăng nhập',
          'log in',
          'error',
          'lỗi',
          'content not found',
        ];
        if (
          beforeDash &&
          !invalidTitles.some((inv) => beforeDash.toLowerCase().includes(inv))
        ) {
          result.nguoiDang = beforeDash;
        }
      }
    }

    // 2c. Bóc tách tác giả từ Relay GraphQL (chỉ lấy owner_as_page, video_owner, actors, owner)
    if (!result.nguoiDang && targetVideoId) {
      // Ưu tiên tìm owner gần videoId mục tiêu
      const ownerChunk = this.getChunkAroundVideoId(html, targetVideoId);
      if (ownerChunk) {
        const mOwnerChunk =
          ownerChunk.match(/"owner_as_page":\s*\{\s*"name":\s*"([^"]+)"/) ||
          ownerChunk.match(/"video_owner":\s*\{[^}]*"name":\s*"([^"]+)"/) ||
          ownerChunk.match(/"owner":\s*\{[^}]*"__typename":\s*"(?:User|Page)"[^}]*"name":\s*"([^"]+)"/);
        if (mOwnerChunk) result.nguoiDang = this.unescapeHtml(mOwnerChunk[1]);
      }
    }

    if (!result.nguoiDang) {
      const mOwner =
        html.match(/"owner_as_page":\s*\{\s*"name":\s*"([^"]+)"/) ||
        html.match(/"video_owner":\s*\{\s*"__typename":\s*"(?:User|Page)"[^}]*"name":\s*"([^"]+)"/) ||
        html.match(/"owner":\s*\{[^}]*"__typename":\s*"(?:User|Page)"[^}]*"name":\s*"([^"]+)"/);
      if (mOwner) result.nguoiDang = this.unescapeHtml(mOwner[1]);
    }

    if (!result.nguoiDang) {
      const mActors =
        html.match(/"actors":\s*\[\s*\{\s*"__typename":\s*"(?:User|Page)"[^}]*"name":\s*"([^"]+)"/) ||
        html.match(/"actors":\s*\[\s*\{[^}]*"name":\s*"([^"]+)"/);
      if (mActors) result.nguoiDang = this.unescapeHtml(mActors[1]);
    }

    // Giải mã nếu chuỗi còn unicode escaped (\u00e0...)
    if (result.nguoiDang && result.nguoiDang.includes('\\u')) {
      try {
        result.nguoiDang = JSON.parse(`"${result.nguoiDang}"`);
      } catch {
        // Bỏ qua
      }
    }

    if (result.nguoiDang) {
      result.nguoiDang = result.nguoiDang.replace(/\s+(?:on|trên)\s+reels$/i, '').trim();
    }

    // 2d. Bóc tách authorUid và authorUrl nếu có từ GraphQL
    if (!result.authorUid) {
      const mActorId =
        html.match(/"actors":\s*\[\s*\{[^}]*"id":\s*"(\d+)"/i) ||
        html.match(/"owner":\s*\{[^}]*"id":\s*"(\d+)"/i) ||
        html.match(/"video_owner":\s*\{[^}]*"id":\s*"(\d+)"/i);
      if (mActorId && mActorId[1]) {
        result.authorUid = mActorId[1];
      }
    }
    if (!result.authorUrl) {
      const mActorUrl =
        html.match(/"actors":\s*\[\s*\{[^}]*"url":\s*"([^"]+)"/i) ||
        html.match(/"owner_as_page":\s*\{[^}]*"url":\s*"([^"]+)"/i);
      if (mActorUrl && mActorUrl[1]) {
        result.authorUrl = mActorUrl[1].replace(/\\\//g, '/');
      }
    }

    // 3. Nếu chưa có Lượt xem, fallback qua endpoint Watch nhưng BẮT BUỘC phải scope theo đúng videoId mục tiêu
    if (!result.LuotXem && isReel) {
      const mId = cleanUrl.match(/\/(?:reel|videos)\/(\d+)/);
      if (mId) {
        try {
          const watchRes = await fetch(`https://www.facebook.com/watch/?v=${mId[1]}`, {
            headers: this.fbHeaders,
          });
          if (watchRes.ok) {
            const watchHtml = await watchRes.text();
            const scopedPlay = this.extractMetricScopedByVideoId(watchHtml, mId[1], [
              /"play_count":\s*(\d+)/,
              /"video_view_count":\s*(\d+)/,
            ]);
            if (scopedPlay > 0) {
              result.LuotXem = scopedPlay;
            }
          }
        } catch {
          // Bỏ qua lỗi fallback Watch
        }
      }
    }

    // 4. Nếu là bài viết permalink / chia sẻ có video Reel nhúng bên trong, lấy lượt xem của video Reel đó
    if (!result.LuotXem && isPermalink) {
      const mEmbeddedVid = html.match(/(?:video_id|videoId|"video":\{"id"):["\s]*(\d+)/);
      if (mEmbeddedVid) {
        try {
          const reelRes = await this.scrapeFacebookHttp(`https://www.facebook.com/reel/${mEmbeddedVid[1]}`, stt);
          if (reelRes.LuotXem > 0) {
            result.LuotXem = reelRes.LuotXem;
          }
        } catch {
          // Bỏ qua lỗi
        }
      }
    }

    // 5. Trích xuất ID duy nhất của bài viết / video để chống trùng lặp tuyệt đối
    const mPostId =
      cleanUrl.match(/\/reel\/(\d+)/) ||
      cleanUrl.match(/(?:videos\/|\?v=)(\d+)/) ||
      cleanUrl.match(/story_fbid=(\d+)/) ||
      html.match(/"video_id":"?(\d+)"?/) ||
      html.match(/"post_id":"?(\d+)"?/) ||
      html.match(/\/posts\/[^/]+\/(\d+)/);
    if (mPostId) {
      result.postId = mPostId[1];
    }

    // 6. Phát hiện bài viết chia sẻ lại (shared/repost)
    this.detectSharedPost(html, result);

    return result;
  }

  /**
   * Phát hiện bài viết được chia sẻ lại từ người khác.
   * Kết hợp nhiều phương pháp: GraphQL JSON, so sánh tác giả, text matching.
   */
  private detectSharedPost(html: string, result: VideoItem): void {
    // Phương pháp 1: GraphQL JSON — tìm "attached_story" (bài gốc được nhúng trong bài share)
    const mAttachedStory = html.match(
      /"attached_story":\s*\{[^]*?"actors":\s*\[\s*\{[^}]*"name":\s*"([^"]+)"[^}]*?"url":\s*"([^"]+)"/
    );

    if (mAttachedStory) {
      result.isShared = true;
      result.originalAuthor = this.unescapeHtml(mAttachedStory[1]);
      result.originalAuthorUrl = mAttachedStory[2].replace(/\\\//g, '/');
    }

    // Phương pháp 2: So sánh video_owner với actors — nếu khác tên → người share ≠ người tạo video
    if (!result.isShared && result.nguoiDang) {
      const mVideoOwner =
        html.match(/"video_owner":\s*\{[^}]*"name":\s*"([^"]+)"/) ||
        html.match(/"owner_as_page":\s*\{\s*"name":\s*"([^"]+)"/);
      if (mVideoOwner) {
        const videoOwnerName = this.unescapeHtml(mVideoOwner[1]);
        if (videoOwnerName && videoOwnerName !== result.nguoiDang) {
          result.isShared = true;
          result.originalAuthor = videoOwnerName;
        }
      }
    }

    // Phương pháp 3: Text matching trong HTML (đa ngôn ngữ)
    if (!result.isShared) {
      const sharePatterns = [
        // Tiếng Việt
        /đã chia sẻ một/i,
        /đã chia sẻ bài viết/i,
        /đã chia sẻ một video/i,
        /Chia sẻ lại Reels/i,
        // Tiếng Anh
        /shared a\s+(?:post|video|reel|link)/i,
        /Shared Reels/i,
        // Trong Relay GraphQL JSON
        /"text":\s*"[^"]*(?:đã chia sẻ|shared\s+a)[^"]*"/i,
      ];

      for (const pattern of sharePatterns) {
        if (pattern.test(html)) {
          result.isShared = true;
          break;
        }
      }
    }

    // Nếu đã xác định là shared, thử lấy URL bài gốc
    if (result.isShared && !result.originalPostUrl) {
      const mOriginalUrl =
        html.match(/"attached_story"[^]*?"(?:permalink_url|url)":\s*"(https?:[^\s"\\]*(?:\\\/[^\s"\\]*)*)"/i) ||
        html.match(/"attachments"[^]*?"(?:permalink_url|url)":\s*"(https?:[^\s"\\]*(?:\\\/[^\s"\\]*)*)"/i) ||
        html.match(/"attached_story"[^]*?"url":\s*"(https?:[^"]*\/(?:reel|videos)\/\d+[^"]*)"/i) ||
        html.match(/"attachments"[^]*?"url":\s*"(https?:[^"]*\/(?:reel|videos)\/\d+[^"]*)"/i);
      if (mOriginalUrl) {
        result.originalPostUrl = this.sanitizeUrl(mOriginalUrl[1].replace(/\\\//g, '/'));
      }
    }

    // Nếu đã phát hiện shared nhưng chưa có originalAuthorUrl, thử tìm từ các pattern khác
    if (result.isShared && result.originalAuthor && !result.originalAuthorUrl) {
      const mOwnerUrl =
        html.match(/"video_owner":\s*\{[^}]*"url":\s*"([^"]+)"/) ||
        html.match(/"owner_as_page":\s*\{[^}]*"url":\s*"([^"]+)"/);
      if (mOwnerUrl) {
        result.originalAuthorUrl = mOwnerUrl[1].replace(/\\\//g, '/');
      }
    }
  }

  /**
   * Trích xuất số liệu (views, likes, comments, shares) trong vùng dữ liệu JSON xung quanh videoId mục tiêu.
   * Điều này ngăn chặn việc regex nhầm vào video kế tiếp trong feed vô tận (Reel feed prefetch) hoặc comment.
   */
  private extractMetricScopedByVideoId(html: string, videoId: string, regexPatterns: RegExp[]): number {
    if (!videoId) return 0;
    let searchIndex = 0;
    while (true) {
      const pos = html.indexOf(videoId, searchIndex);
      if (pos === -1) break;
      const start = Math.max(0, pos - 1500);
      const end = Math.min(html.length, pos + 4000);
      const chunk = html.slice(start, end);
      for (const rx of regexPatterns) {
        const m = chunk.match(rx);
        if (m && m[1]) {
          const val = this.parseNumber(m[1]);
          if (val > 0) return val;
        }
      }
      searchIndex = pos + videoId.length;
    }
    return 0;
  }

  /**
   * Lấy đoạn HTML / JSON xung quanh videoId mục tiêu
   */
  private getChunkAroundVideoId(html: string, videoId: string): string {
    if (!videoId) return '';
    const pos = html.indexOf(videoId);
    if (pos === -1) return '';
    return html.slice(Math.max(0, pos - 1000), Math.min(html.length, pos + 4000));
  }

  private readonly ttHeaders = {
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  /**
   * Bóc tách TikTok bằng HTTP Request
   */
  public async scrapeTikTokHttp(url: string, stt: number = 1): Promise<VideoItem> {
    const cleanUrl = this.sanitizeUrl(url);
    const res = await fetch(cleanUrl, { headers: this.ttHeaders, redirect: 'follow' });
    const finalHttpUrl = res.url ? this.sanitizeUrl(res.url) : cleanUrl;
    const html = await res.text();
    return this.parseTikTokHtml(html, finalHttpUrl, stt);
  }

  /**
   * Phân tích HTML TikTok đã tải (dùng chung cho HTTP request và Playwright fallback)
   */
  private parseTikTokHtml(html: string, cleanUrl: string, stt: number): VideoItem {
    let effectiveUrl = cleanUrl;

    // Trích xuất link canonical từ HTML nếu có
    const mCanonical =
      html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i) ||
      html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i);
    if (mCanonical) {
      const canonical = this.sanitizeUrl(this.unescapeHtml(mCanonical[1]));
      if (canonical && (canonical.includes('/video/') || canonical.includes('/photo/'))) {
        effectiveUrl = canonical;
      }
    }

    let isPhoto = effectiveUrl.includes('/photo/');

    const result: VideoItem = {
      STT: stt,
      link: effectiveUrl,
      caption: '',
      loai: isPhoto ? 'TikTok Photo' : 'TikTok Video',
      nguoiDang: '',
      ngayDang: '',
      SoLuongNguoiShare: 0,
      LuotXem: 0,
      LuotLike: 0,
      LuotComment: 0,
    };

    const match = html.match(
      /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
    );
    if (match) {
      try {
        const json = JSON.parse(match[1]);
        const scope = json['__DEFAULT_SCOPE__'] || {};
        const videoDetail = scope['webapp.video-detail'] || scope['webapp.videoDetail'];
        const photoDetail = scope['webapp.photo-detail'] || scope['webapp.photoDetail'];
        const item = (videoDetail || photoDetail)?.itemInfo?.itemStruct;

        if (item) {
          if (item.imagePostInfo) {
            isPhoto = true;
            result.loai = 'TikTok Photo';
          }
          result.caption = this.unescapeHtml(item.desc || '');
          result.nguoiDang = this.unescapeHtml(
            item.author?.nickname || item.author?.uniqueId || ''
          );
          result.ngayDang = this.formatTimestamp(item.createTime);

          // Nếu có ID và uniqueId của author, tái tạo link video/photo chuẩn tuyệt đối
          if (item.id && item.author?.uniqueId) {
            const type = isPhoto ? 'photo' : 'video';
            result.link = `https://www.tiktok.com/@${item.author.uniqueId}/${type}/${item.id}`;
          }

          const stats = item.stats || item.statsV2 || {};
          result.LuotLike = this.parseNumber(stats.diggCount);
          result.SoLuongNguoiShare = this.parseNumber(stats.shareCount);
          result.LuotComment = this.parseNumber(stats.commentCount);
          result.LuotXem = this.parseNumber(stats.playCount);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`Lỗi parse JSON TikTok qua HTTP: ${msg}`);
      }
    }

    // Fallback SIGI_STATE (layout web thay thế của TikTok)
    if (!result.caption && !result.LuotLike && !result.LuotXem) {
      const sigiMatch = html.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
      if (sigiMatch) {
        try {
          const sigiJson = JSON.parse(sigiMatch[1]);
          const itemModule = sigiJson.ItemModule || {};
          const firstKey = Object.keys(itemModule)[0];
          const item = firstKey ? itemModule[firstKey] : null;
          if (item) {
            if (item.imagePostInfo) {
              isPhoto = true;
              result.loai = 'TikTok Photo';
            }
            result.caption = this.unescapeHtml(item.desc || '');
            result.nguoiDang = this.unescapeHtml(item.nickname || item.author || '');
            result.ngayDang = this.formatTimestamp(item.createTime);
            result.LuotLike = this.parseNumber(item.diggCount);
            result.SoLuongNguoiShare = this.parseNumber(item.shareCount);
            result.LuotComment = this.parseNumber(item.commentCount);
            result.LuotXem = this.parseNumber(item.playCount);
            if (item.id && item.author) {
              const type = isPhoto ? 'photo' : 'video';
              result.link = `https://www.tiktok.com/@${item.author}/${type}/${item.id}`;
            }
          }
        } catch {}
      }
    }

    // Fallback trích xuất trực tiếp từ HTML / DOM tĩnh của Mobile Safari
    if (!result.caption) {
      const mArticle = html.match(/<article[^>]*>([\s\S]*?)<\/article>/);
      if (mArticle) {
        const cleanArticle = mArticle[1]
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, '')
          .replace(/#<!-- -->/g, '#')
          .trim();
        if (cleanArticle) result.caption = this.unescapeHtml(cleanArticle);
      }
    }
    if (!result.caption) {
      const mDescQuote = html.match(/"desc":\s*"[^"]*“([^”]+)”/);
      if (mDescQuote) result.caption = this.unescapeHtml(mDescQuote[1].trim());
    }
    if (!result.caption) {
      const mDesc = html.match(/"desc":\s*"((?:[^"\\]|\\.)*)"/);
      if (mDesc) result.caption = this.unescapeHtml(mDesc[1]);
    }
    if (!result.caption) {
      const mOgDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i);
      if (mOgDesc) result.caption = this.unescapeHtml(mOgDesc[1]);
    }

    if (!result.nguoiDang) {
      const mAuthorLink = html.match(/href="\/@([^"]+)"\s+title="([^"(]+)/);
      if (mAuthorLink) {
        result.nguoiDang = this.unescapeHtml(mAuthorLink[2].trim());
      }
    }
    if (!result.nguoiDang) {
      const mTitleAuthor = html.match(/"title":"TikTok\s*·\s*([^"]+)"/);
      if (mTitleAuthor) result.nguoiDang = this.unescapeHtml(mTitleAuthor[1].trim());
    }
    if (!result.nguoiDang) {
      const mAuthor = html.match(/"nickname":\s*"([^"]+)"/);
      if (mAuthor) result.nguoiDang = this.unescapeHtml(mAuthor[1]);
    }

    if (!result.ngayDang) {
      const mT = html.match(/"createTime":\s*"?(\d+)"?/);
      if (mT) result.ngayDang = this.formatTimestamp(mT[1]);
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

    const mTikTokId =
      effectiveUrl.match(/\/(?:video|photo)\/(\d+)/) ||
      cleanUrl.match(/\/(?:video|photo)\/(\d+)/);
    if (mTikTokId) {
      result.postId = mTikTokId[1];
    }

    return result;
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browserInstance) {
      this.browserInstance = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
      });
    }
    return this.browserInstance;
  }

  /**
   * Fallback qua Playwright Browser (mở trang thật khi HTTP bị chặn/không parse được)
   */
  public async scrapeWithBrowser(url: string, stt: number = 1): Promise<VideoItem> {
    const cleanUrl = this.sanitizeUrl(url);
    const isTikTok = cleanUrl.includes('tiktok.com');

    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'vi-VN',
    });

    // Nạp Cookie Facebook vào context nếu có
    if (!isTikTok && this.cookieService) {
      try {
        const cookies = this.cookieService.loadCookies();
        if (Array.isArray(cookies) && cookies.length > 0) {
          await context.addCookies(cookies);
          this.logger.log(`[Playwright] Đã nạp ${cookies.length} cookie vào phiên trình duyệt.`);
        }
      } catch (err: any) {
        this.logger.warn(`[Playwright] Không thể nạp cookie: ${err?.message}`);
      }
    }

    try {
      const page = await context.newPage();
      await page.goto(cleanUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

      // Nếu là link chuyển tiếp /share/ hoặc fb.watch, chờ thêm để Facebook thực hiện client redirect
      if (cleanUrl.includes('/share/') || cleanUrl.includes('fb.watch')) {
        await page.waitForTimeout(2500);
      } else {
        await page.waitForTimeout(1500);
      }

      // Xác định URL thực tế sau khi redirect (chẳng hạn từ share link sang /reel/...)
      const currentUrl = page.url();
      let effectiveUrl = cleanUrl;
      if (
        currentUrl &&
        !currentUrl.includes('/login') &&
        (currentUrl.includes('/reel/') ||
          currentUrl.includes('/videos/') ||
          currentUrl.includes('/watch') ||
          currentUrl.includes('/posts/') ||
          currentUrl.includes('permalink.php') ||
          currentUrl.includes('story.php') ||
          currentUrl.includes('/video/'))
      ) {
        effectiveUrl = this.sanitizeUrl(currentUrl);
      }

      // Thử đọc thêm thẻ canonical từ DOM trang
      try {
        const domCanonical = await page
          .$eval('link[rel="canonical"]', (el) => el.getAttribute('href'))
          .catch(() => null);
        if (domCanonical) {
          const cleanCanonical = this.sanitizeUrl(domCanonical);
          if (
            cleanCanonical &&
            !cleanCanonical.includes('/login') &&
            !cleanCanonical.endsWith('facebook.com') &&
            !cleanCanonical.endsWith('tiktok.com') &&
            (cleanCanonical.includes('/reel/') ||
              cleanCanonical.includes('/videos/') ||
              cleanCanonical.includes('/watch') ||
              cleanCanonical.includes('/posts/') ||
              cleanCanonical.includes('permalink.php') ||
              cleanCanonical.includes('/video/'))
          ) {
            effectiveUrl = cleanCanonical;
          }
        }
      } catch {}

      const html = await page.content();
      const result = isTikTok
        ? this.parseTikTokHtml(html, effectiveUrl, stt)
        : await this.parseFacebookHtml(html, effectiveUrl, stt);

      if (effectiveUrl && effectiveUrl !== cleanUrl && !result.link) {
        result.link = effectiveUrl;
      }

      // Nếu là Facebook mà thiếu tác giả hoặc tương tác, bổ trợ từ DOM thật
      if (!isTikTok) {
        try {
          const domData = await page.evaluate(() => {
            let author = '';
            // Tác giả trong Reel thường là thẻ <h2> trên trang
            const h2 = document.querySelector('h2');
            if (h2 && h2.textContent && h2.textContent.trim()) {
              const h2Text = h2.textContent.trim();
              const invalid = [
                'trang này hiện không hiển thị',
                "this page isn't available",
                'this page isn’t available',
                'đăng nhập',
                'log in',
                'facebook',
                'error',
                'lỗi',
                'reels',
                'xem thêm',
              ];
              if (!invalid.some((inv) => h2Text.toLowerCase().includes(inv))) {
                author = h2Text;
              }
            }
            if (!author) {
              const followBtn = document.querySelector(
                '[aria-label*="Follow" i], [aria-label*="Theo dõi" i]'
              );
              if (followBtn) {
                const aria = followBtn.getAttribute('aria-label') || '';
                const m = aria.match(/(?:follow|theo dõi)\s+(.+)/i);
                if (m) author = m[1].trim();
              }
            }

            let likes: string | number = '0';
            let comments: string | number = '0';
            let shares: string | number = '0';

            const allButtons = Array.from(document.querySelectorAll('[role="button"], button'));
            for (const btn of allButtons) {
              const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
              const text = (btn.textContent || '').trim();
              const mNum = text.match(/^(\d+([,.]\d+)?\s*[kmb]?)$/i);
              const num = mNum ? mNum[1] : '';

              if (/^(like|thích|react|bày tỏ)/i.test(aria) || /^(\d+.*(thích|like|người))/i.test(aria)) {
                if (num && likes === '0') likes = num;
                const mAria = aria.match(/(\d+([,.]\d+)?\s*[kmb]?)/i);
                if (mAria && likes === '0') likes = mAria[1];
              } else if (/comment|bình luận/i.test(aria)) {
                if (num && comments === '0') comments = num;
                const mAria = aria.match(/(\d+([,.]\d+)?\s*[kmb]?)\s*(bình luận|comment)/i);
                if (mAria && comments === '0') comments = mAria[1];
              } else if (/share|chia sẻ|send this to friends|gửi nội dung này/i.test(aria)) {
                if (num && shares === '0') shares = num;
                const mAria = aria.match(/(\d+([,.]\d+)?\s*[kmb]?)\s*(lượt chia sẻ|chia sẻ|share)/i);
                if (mAria && shares === '0') shares = mAria[1];
              }
            }

            // Bổ trợ reaction breakdown nếu chưa có like
            if (likes === '0') {
              let totalReactions = 0;
              let foundAny = false;
              for (const btn of allButtons) {
                const aria = btn.getAttribute('aria-label') || '';
                const mReact = aria.match(/^(?:Like|Love|Care|Haha|Wow|Sad|Angry|Thích|Yêu thích|Thương thương|Haha|Wow|Buồn|Phẫn nộ):\s*(\d+([,.]\d+)?\s*[kmb]?)/i);
                if (mReact) {
                  foundAny = true;
                  let val = parseFloat(mReact[1].replace(',', '.'));
                  if (/k/i.test(mReact[1])) val *= 1000;
                  else if (/m/i.test(mReact[1])) val *= 1000000;
                  totalReactions += val;
                }
              }
              if (foundAny && totalReactions > 0) {
                likes = String(Math.round(totalReactions));
              }
            }

            const bodyText = document.body ? document.body.innerText || '' : '';
            if (comments === '0') {
              const mC = bodyText.match(/(\d+([,.]\d+)?\s*([kKmM]|nghìn|triệu)?)\s*(bình luận|comments?)/i);
              if (mC) comments = mC[1].trim();
            }
            if (shares === '0') {
              const mS = bodyText.match(/(\d+([,.]\d+)?\s*([kKmM]|nghìn|triệu)?)\s*(lượt chia sẻ|chia sẻ|shares?)/i);
              if (mS) shares = mS[1].trim();
            }

            // Quét các span số độc lập
            if (likes === '0' || (comments === '0' && shares === '0')) {
              const numSpans = Array.from(document.querySelectorAll('span'))
                .map((s) => (s.innerText || '').trim())
                .filter((t) => /^\d+([,.]\d+)?\s*[kmb]?$/i.test(t));
              if (numSpans.length >= 1 && likes === '0') likes = numSpans[0];
              if (numSpans.length >= 2 && comments === '0') comments = numSpans[1];
              if (numSpans.length >= 3 && shares === '0') shares = numSpans[2];
            }

            let isShared = false;
            let originalAuthor = '';
            const msgBlocks = document.querySelectorAll('[data-ad-preview="message"]');
            if (msgBlocks.length >= 2) {
              isShared = true;
            }
            if (/đã chia sẻ|shared a\s+(post|video|reel)/i.test(bodyText)) {
              isShared = true;
            }

            return { author, likes, comments, shares, isShared, originalAuthor };
          });

          const invalidAuthors = [
            'facebook',
            'trang này hiện không hiển thị',
            "this page isn't available",
            'this page isn’t available',
            'log in to facebook',
            'đăng nhập facebook',
            'đăng nhập',
            'log in',
            'error',
            'lỗi',
            'content not found',
            'reels',
          ];
          if (
            !result.nguoiDang &&
            domData.author &&
            !invalidAuthors.some((inv) => domData.author.toLowerCase().includes(inv))
          ) {
            result.nguoiDang = domData.author;
          }
          if (!result.LuotLike && domData.likes) {
            result.LuotLike = this.parseNumber(domData.likes);
          }
          if (!result.SoLuongNguoiShare && domData.shares) {
            result.SoLuongNguoiShare = this.parseNumber(domData.shares);
          }
          if (!result.LuotComment && domData.comments) {
            result.LuotComment = this.parseNumber(domData.comments);
          }
          if (domData.isShared && !result.isShared) {
            result.isShared = true;
          }
          if (domData.originalAuthor && !result.originalAuthor) {
            result.originalAuthor = domData.originalAuthor;
          }
        } catch {
          // Bỏ qua lỗi DOM evaluate
        }
      }

      // Nếu là TikTok mà thiếu tác giả hoặc tương tác, bổ trợ từ DOM thật
      if (isTikTok) {
        try {
          const ttDom = await page.evaluate(() => {
            const author =
              document.querySelector('[data-e2e="video-author-uniqueid"], [data-e2e="video-author-nickname"], [data-e2e="user-title"], h2')?.textContent?.trim() || '';
            const caption =
              document.querySelector('[data-e2e="video-desc"], [data-e2e="browse-video-desc"], article, h1')?.textContent?.trim() || '';
            const likes =
              document.querySelector('[data-e2e="like-count"]')?.textContent?.trim() || '0';
            const comments =
              document.querySelector('[data-e2e="comment-count"]')?.textContent?.trim() || '0';
            const shares =
              document.querySelector('[data-e2e="share-count"]')?.textContent?.trim() || '0';
            return { author, caption, likes, comments, shares };
          });
          if (!result.nguoiDang && ttDom.author) result.nguoiDang = ttDom.author;
          if ((!result.caption || result.caption === 'Không có tiêu đề') && ttDom.caption) result.caption = ttDom.caption;
          if (!result.LuotLike && ttDom.likes) result.LuotLike = this.parseNumber(ttDom.likes);
          if (!result.LuotComment && ttDom.comments) result.LuotComment = this.parseNumber(ttDom.comments);
          if (!result.SoLuongNguoiShare && ttDom.shares) result.SoLuongNguoiShare = this.parseNumber(ttDom.shares);
        } catch {
          // Bỏ qua lỗi
        }
      }

      if (
        result.caption ||
        result.LuotXem > 0 ||
        result.LuotLike > 0 ||
        result.nguoiDang
      ) {
        return result;
      }
      return result;
    } finally {
      await context.close();
    }
  }

  /**
   * Hàm điều phối chính
   */
  public async scrapeVideo(url: string, stt: number = 1): Promise<VideoItem> {
    const cleanUrl = this.sanitizeUrl(url);

    try {
      let result: VideoItem | null = null;
      if (cleanUrl.includes('tiktok.com')) {
        result = await this.scrapeTikTokHttp(cleanUrl, stt);
      } else if (cleanUrl.includes('facebook.com') || cleanUrl.includes('fb.watch')) {
        // Link chia sẻ dạng /share/ hoặc fb.watch yêu cầu chạy browser client redirect, không fetch thẳng được
        if (!cleanUrl.includes('/share/') && !cleanUrl.includes('fb.watch')) {
          result = await this.scrapeFacebookHttp(cleanUrl, stt);
        }
      } else {
        throw new Error('Link không được hỗ trợ. Vui lòng nhập link Facebook hoặc TikTok!');
      }

      const isHttpSuccess = cleanUrl.includes('tiktok.com')
        ? Boolean(result && (result.caption || result.LuotXem > 0 || result.LuotLike > 0 || result.nguoiDang))
        : Boolean(result && result.nguoiDang && (result.caption || result.LuotXem > 0 || result.LuotLike > 0));

      if (result && isHttpSuccess) {
        if (result.link) {
          result.link = this.sanitizeUrl(result.link);
        } else {
          result.link = cleanUrl;
        }
        if (!result.caption || !result.caption.trim()) {
          result.caption = 'Không có tiêu đề';
        }
        return result;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[HTTP Warn] URL ${cleanUrl} thử qua Playwright: ${msg}`);
    }

    const browserResult = await this.scrapeWithBrowser(cleanUrl, stt);
    if (browserResult) {
      if (browserResult.link) {
        browserResult.link = this.sanitizeUrl(browserResult.link);
      }
      if (!browserResult.caption || !browserResult.caption.trim()) {
        browserResult.caption = 'Không có tiêu đề';
      }
    }
    return browserResult;
  }
}
