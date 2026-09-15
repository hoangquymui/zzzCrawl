import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser } from 'playwright';
import { VideoItem } from './interfaces/video.interface';

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private browserInstance: Browser | null = null;

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
   * Làm sạch link: Cắt bỏ các tham số rác sau dấu '?'
   */
  public sanitizeUrl(url: string): string {
    if (!url) return '';
    let clean = url.trim();
    if (clean.includes('tiktok.com')) {
      clean = clean.split('?')[0].split('#')[0].replace(/\/+$/, '');
    } else if (clean.includes('facebook.com') || clean.includes('fb.watch')) {
      if (clean.includes('/reel/') || clean.includes('/share/r')) {
        clean = clean.split('?')[0].split('#')[0].replace(/\/+$/, '');
      } else if (clean.includes('/watch')) {
        try {
          const u = new URL(clean);
          const v = u.searchParams.get('v');
          if (v) clean = `https://www.facebook.com/watch/?v=${v}`;
        } catch {
          // Bỏ qua lỗi parse URL
        }
      } else if (clean.includes('permalink.php')) {
        try {
          const u = new URL(clean);
          const storyFbid = u.searchParams.get('story_fbid');
          const id = u.searchParams.get('id');
          if (storyFbid && id) {
            clean = `https://www.facebook.com/permalink.php?story_fbid=${storyFbid}&id=${id}`;
          }
        } catch {
          // Bỏ qua lỗi parse URL
        }
      }
    }
    return clean;
  }

  /**
   * Bóc tách Facebook bằng HTTP Request (~0.8s)
   */
  public async scrapeFacebookHttp(url: string, stt: number = 1): Promise<VideoItem> {
    const cleanUrl = this.sanitizeUrl(url);
    const isReel = cleanUrl.includes('/reel/') || cleanUrl.includes('/share/r');
    const isPermalink = cleanUrl.includes('permalink.php') || cleanUrl.includes('/posts/');

    const result: VideoItem = {
      STT: stt,
      link: cleanUrl,
      caption: '',
      loai: isReel ? 'Facebook Reel' : isPermalink ? 'Facebook Post' : 'Facebook Video',
      nguoiDang: '',
      ngayDang: '',
      SoLuongNguoiShare: 0,
      LuotXem: 0,
      LuotLike: 0,
      LuotComment: 0,
    };

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
    };

    const res = await fetch(cleanUrl, { headers });
    const html = await res.text();

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

      const parts = ogTitle.split('|');
      if (parts.length >= 2) {
        const cap = parts[parts.length - 2].trim();
        if (cap && cap.toLowerCase() !== 'facebook') result.caption = cap;
      }
      if (parts.length >= 3 && !result.nguoiDang) {
        const authorFromTitle = parts[parts.length - 1].trim();
        if (authorFromTitle && authorFromTitle.toLowerCase() !== 'facebook') {
          result.nguoiDang = authorFromTitle;
        }
      }
    }

    if (ogDesc && !result.caption) {
      result.caption = ogDesc;
    }

    // 2. Bóc tách từ các khối Relay GraphQL script trong HTML
    if (!result.LuotXem) {
      const mV =
        html.match(/"video_view_count":\s*(\d+)/) || html.match(/"play_count":\s*(\d+)/);
      if (mV) result.LuotXem = parseInt(mV[1], 10);
    }

    const mL =
      html.match(/"unified_reactors":\s*\{\s*"count":\s*(\d+)/) ||
      html.match(/"likers":\s*\{\s*"count":\s*(\d+)/) ||
      html.match(/"reaction_count":\s*\{\s*"count":\s*(\d+)/) ||
      html.match(/"default_reaction_count":\s*(\d+)/) ||
      html.match(/"top_reactions":\s*\{\s*"count":\s*(\d+)/);
    if (mL) {
      result.LuotLike = Math.max(result.LuotLike, parseInt(mL[1], 10));
    } else if (!result.LuotLike) {
      const mLi = html.match(/"i18n_reaction_count":\s*"([^"]+)"/);
      if (mLi) result.LuotLike = this.parseNumber(mLi[1]);
    }

    const mC =
      html.match(/"total_comment_count":\s*(\d+)/) ||
      html.match(/"comment_count":\s*\{\s*"total_count":\s*(\d+)/);
    if (mC) {
      result.LuotComment = Math.max(result.LuotComment, parseInt(mC[1], 10));
    } else if (!result.LuotComment) {
      const mCi = html.match(/"i18n_comment_count":\s*"([^"]+)"/);
      if (mCi) result.LuotComment = this.parseNumber(mCi[1]);
    }

    const mSr = html.match(/"share_count_reduced":\s*"([^"]+)"/);
    const mS = html.match(/"share_count":\s*\{\s*"count":\s*(\d+)/);
    if (mSr) {
      result.SoLuongNguoiShare = Math.max(result.SoLuongNguoiShare, this.parseNumber(mSr[1]));
    } else if (mS) {
      result.SoLuongNguoiShare = Math.max(result.SoLuongNguoiShare, parseInt(mS[1], 10));
    }

    const mT = html.match(/"creation_time":\s*(\d+)/) || html.match(/"publish_time":\s*(\d+)/);
    if (mT) result.ngayDang = this.formatTimestamp(mT[1]);

    if (!result.nguoiDang) {
      const mAuthor =
        html.match(/"owner_as_page":\s*\{\s*"name":\s*"([^"]+)"/) ||
        html.match(/"video_owner":\s*\{\s*"__typename":\s*"User"[^}]*"name":\s*"([^"]+)"/) ||
        html.match(/"author":\s*\{\s*"__typename":\s*"User"[^}]*"name":\s*"([^"]+)"/);
      if (mAuthor) result.nguoiDang = this.unescapeHtml(mAuthor[1]);
    }

    if (!result.nguoiDang && ogTitle && !ogTitle.includes('|') && ogTitle.toLowerCase() !== 'facebook') {
      result.nguoiDang = ogTitle.trim();
    }

    if (!result.nguoiDang) {
      const mPageTitle = html.match(/<title>([^<]+)<\/title>/);
      if (mPageTitle) {
        const titleText = this.unescapeHtml(mPageTitle[1]).trim();
        const authorMatch = titleText.split(/[-|]/)[0].trim();
        if (authorMatch && authorMatch.toLowerCase() !== 'facebook') {
          result.nguoiDang = authorMatch;
        }
      }
    }

    // 3. Nếu chưa có Lượt xem (đặc biệt với Reels cá nhân hoặc ít tương tác), fallback qua endpoint Watch
    if (!result.LuotXem && isReel) {
      const mId = cleanUrl.match(/\/(?:reel|videos)\/(\d+)/);
      if (mId) {
        try {
          const watchRes = await fetch(`https://www.facebook.com/watch/?v=${mId[1]}`, { headers });
          if (watchRes.ok) {
            const watchHtml = await watchRes.text();
            const mWatchPlay =
              watchHtml.match(/"play_count":\s*(\d+)/) ||
              watchHtml.match(/"video_view_count":\s*(\d+)/);
            if (mWatchPlay) {
              result.LuotXem = parseInt(mWatchPlay[1], 10);
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
      html.match(/"post_id":"?(\d+)"?/) ||
      html.match(/\/posts\/[^/]+\/(\d+)/) ||
      cleanUrl.match(/\/reel\/(\d+)/) ||
      cleanUrl.match(/story_fbid=(\d+)/);
    if (mPostId) {
      result.postId = mPostId[1];
    }

    return result;
  }

  /**
   * Bóc tách TikTok bằng HTTP Request
   */
  public async scrapeTikTokHttp(url: string, stt: number = 1): Promise<VideoItem> {
    const cleanUrl = this.sanitizeUrl(url);

    const result: VideoItem = {
      STT: stt,
      link: cleanUrl,
      caption: '',
      loai: 'TikTok Video',
      nguoiDang: '',
      ngayDang: '',
      SoLuongNguoiShare: 0,
      LuotXem: 0,
      LuotLike: 0,
      LuotComment: 0,
    };

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
    };

    const res = await fetch(cleanUrl, { headers });
    const html = await res.text();

    const match = html.match(
      /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
    );
    if (match) {
      try {
        const json = JSON.parse(match[1]);
        const scope = json['__DEFAULT_SCOPE__'] || {};
        const videoDetail = scope['webapp.video-detail'] || scope['webapp.videoDetail'];
        const item = videoDetail?.itemInfo?.itemStruct;

        if (item) {
          result.caption = this.unescapeHtml(item.desc || '');
          result.nguoiDang = this.unescapeHtml(
            item.author?.nickname || item.author?.uniqueId || ''
          );
          result.ngayDang = this.formatTimestamp(item.createTime);

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

    // Fallback regex
    if (!result.caption) {
      const mDesc = html.match(/"desc":\s*"([^"]+)"/);
      if (mDesc) result.caption = this.unescapeHtml(mDesc[1]);
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

    const mTikTokId = cleanUrl.match(/\/video\/(\d+)/);
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
   * Fallback qua Playwright Browser
   */
  public async scrapeWithBrowser(url: string, stt: number = 1): Promise<VideoItem> {
    const cleanUrl = this.sanitizeUrl(url);
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'vi-VN',
    });

    try {
      if (cleanUrl.includes('tiktok.com')) {
        const res = await this.scrapeTikTokHttp(cleanUrl, stt);
        if (res.LuotXem > 0 || res.LuotLike > 0) return res;
      } else {
        const res = await this.scrapeFacebookHttp(cleanUrl, stt);
        if (res.LuotXem > 0 || res.LuotLike > 0) return res;
      }
    } catch {
      // Tiếp tục fallback
    } finally {
      await context.close();
    }

    return cleanUrl.includes('tiktok.com')
      ? await this.scrapeTikTokHttp(cleanUrl, stt)
      : await this.scrapeFacebookHttp(cleanUrl, stt);
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
        result = await this.scrapeFacebookHttp(cleanUrl, stt);
      } else {
        throw new Error('Link không được hỗ trợ. Vui lòng nhập link Facebook hoặc TikTok!');
      }

      if (result && (result.caption || result.LuotXem > 0 || result.LuotLike > 0)) {
        return result;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[HTTP Warn] URL ${cleanUrl} thử qua Playwright: ${msg}`);
    }

    return await this.scrapeWithBrowser(cleanUrl, stt);
  }
}
