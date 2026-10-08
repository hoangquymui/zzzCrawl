import { Injectable, Logger, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { chromium, Browser, BrowserContext } from 'playwright';
import { VideoItem } from '../videos/interfaces/video.interface';
import { CookieService } from '../cookies/cookie.service';
import { parseNumber, parseNumberDetailed, ParsedNumberDetail } from './utils/number-parser';
import {
  decodeHtmlEntities,
  normalizeCaption,
  isBoilerplateCaption,
  isValidAuthor,
  cleanAuthorName,
} from './utils/text-normalizer';
import {
  sanitizeUrl,
  normalizeFacebookUrl,
  detectPlatform,
  detectContentType,
  isRedirectUrl,
  isFacebookUrl,
  isTikTokUrl,
  PlatformType,
  ContentType,
} from './utils/url-cleaner';
import { validateScrapeResult, ScrapeValidation } from './utils/scrape-validator';
import { mergeScrapeResults as mergeScrapeResultsFn } from './utils/merge-scrape';
import { parseDateUnified } from './utils/date-parser';

@Injectable()
export class ScraperService implements OnModuleDestroy {
  private readonly logger = new Logger(ScraperService.name);
  private browserInstance: Browser | null = null;
  private browserLaunching: Promise<Browser> | null = null;

  constructor(
    @Inject(forwardRef(() => CookieService))
    private readonly cookieService: CookieService
  ) {}

  public async onModuleDestroy(): Promise<void> {
    this.browserLaunching = null;
    if (this.browserInstance) {
      try {
        await this.browserInstance.close();
        this.browserInstance = null;
        this.logger.log('[Playwright] Đã đóng browser instance an toàn khi shutdown.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[Playwright] Lỗi đóng browser: ${msg}`);
      }
    }
  }

  /**
   * Giải mã các ký tự mã hóa HTML (&#x...;, &amp;, &quot;,...) và escape JSON
   * Giữ nguyên cấu trúc xuống dòng
   */
  public unescapeHtml(text?: string | null): string {
    return decodeHtmlEntities(text);
  }

  /**
   * Chuẩn hóa nội dung caption, loại bỏ khoảng trắng thừa nhưng bảo tồn dòng và đoạn văn
   */
  public normalizeCaption(text?: string | null): string {
    return normalizeCaption(text);
  }

  /**
   * Chuyển đổi các định dạng số có đơn vị (2,8 triệu, 1.3K, 45K, 2.8M, 2,823,400) sang số nguyên
   */
  public parseNumber(text?: string | number | null): number {
    return parseNumber(text);
  }

  public parseNumberDetailed(text?: string | number | null): ParsedNumberDetail {
    return parseNumberDetailed(text);
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
   * Phân tích và chuẩn hóa ngày đăng từ nhiều định dạng:
   * Unix timestamp, ISO 8601, ngày tuyệt đối tiếng Việt, ngày tương đối tiếng Việt/Anh
   * Trả về định dạng chuẩn: YYYY-MM-DD HH:mm:ss
   */
  public parseAnyDate(raw?: unknown, referenceNow?: Date): string {
    return parseDateUnified(raw, referenceNow).formatted;
  }

  private _oldParseAnyDate(raw?: unknown): string {
    if (!raw) return '';
    const str = String(raw).trim();
    if (!str) return '';

    // 1. Unix timestamp (9-13 chữ số)
    if (/^\d{9,13}$/.test(str)) {
      return this.formatTimestamp(str);
    }

    // 2. ISO 8601: 2026-09-05T02:57:26.000Z hoặc kèm timezone
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      }
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

    // 3. Ngày tương đối: vừa xong, vừa, mới đây, gần đây, just now
    if (/^(vừa xong|vừa|mới đây|gần đây|just now)$/i.test(str)) {
      return fmt(now);
    }

    const mMin = str.match(/(\d+)\s*(?:phút|mins?|m\b)/i);
    if (mMin) {
      const d = new Date(now.getTime() - parseInt(mMin[1], 10) * 60 * 1000);
      return fmt(d);
    }

    const mHour = str.match(/(\d+)\s*(?:giờ|hours?|h\b)/i);
    if (mHour) {
      const d = new Date(now.getTime() - parseInt(mHour[1], 10) * 3600 * 1000);
      return fmt(d);
    }

    const mYesterday = str.match(/(?:hôm qua|yesterday)(?:\s*(?:lúc|at)?\s*(\d{1,2}):(\d{2}))?/i);
    if (mYesterday) {
      const d = new Date(now.getTime() - 86400 * 1000);
      if (mYesterday[1] && mYesterday[2]) {
        d.setHours(parseInt(mYesterday[1], 10), parseInt(mYesterday[2], 10), 0, 0);
      }
      return fmt(d);
    }

    const mDay = str.match(/(\d+)\s*(?:ngày|days?|d\b)/i);
    if (mDay) {
      const d = new Date(now.getTime() - parseInt(mDay[1], 10) * 86400 * 1000);
      return fmt(d);
    }

    // 4. Ngày tuyệt đối tiếng Việt: "5 tháng 9, 2026 lúc 09:57" hoặc "5 tháng 9 lúc 09:57" hoặc "5 Tháng 9"
    const mVnDate = str.match(
      /(\d{1,2})\s+tháng\s+(\d{1,2})(?:[,\s]+(\d{4}))?(?:\s*(?:lúc|at)?\s*(\d{1,2}):(\d{2}))?/i
    );
    if (mVnDate) {
      const day = parseInt(mVnDate[1], 10);
      const month = parseInt(mVnDate[2], 10) - 1;
      let year = mVnDate[3] ? parseInt(mVnDate[3], 10) : now.getFullYear();
      if (!mVnDate[3] && month > now.getMonth()) {
        year -= 1;
      }
      const hasTime = Boolean(mVnDate[4]);
      const hour = hasTime ? parseInt(mVnDate[4], 10) : 0;
      const min = hasTime ? parseInt(mVnDate[5], 10) : 0;
      const d = new Date(year, month, day, hour, min, 0);
      return fmt(d);
    }

    // 4b. Ngày tuyệt đối tiếng Anh: "Friday 25 September 2026 at 15:43" hoặc "September 25, 2026 at 3:43 PM"
    const monthMap: Record<string, number> = {
      january: 0, jan: 0,
      february: 1, feb: 1,
      march: 2, mar: 2,
      april: 3, apr: 3,
      may: 4,
      june: 5, jun: 5,
      july: 6, jul: 6,
      august: 7, aug: 7,
      september: 8, sep: 8, sept: 8,
      october: 9, oct: 9,
      november: 10, nov: 10,
      december: 11, dec: 11,
    };

    const mEngDateA = str.match(
      /(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,\s]+)?(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)(?:[,\s]+(\d{4}))?(?:\s*(?:at|lúc)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(am|pm))?)?/i
    );
    if (mEngDateA) {
      const day = parseInt(mEngDateA[1], 10);
      const mName = mEngDateA[2].toLowerCase();
      const month = monthMap[mName] !== undefined ? monthMap[mName] : 0;
      let year = mEngDateA[3] ? parseInt(mEngDateA[3], 10) : now.getFullYear();
      if (!mEngDateA[3] && month > now.getMonth()) {
        year -= 1;
      }
      let hour = mEngDateA[4] ? parseInt(mEngDateA[4], 10) : 0;
      const min = mEngDateA[5] ? parseInt(mEngDateA[5], 10) : 0;
      const sec = mEngDateA[6] ? parseInt(mEngDateA[6], 10) : 0;
      const ampm = mEngDateA[7] ? mEngDateA[7].toLowerCase() : '';
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      const d = new Date(year, month, day, hour, min, sec);
      return fmt(d);
    }

    const mEngDateB = str.match(
      /(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,\s]+)?(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:[,\s]+(\d{4}))?(?:\s*(?:at|lúc)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(am|pm))?)?/i
    );
    if (mEngDateB) {
      const mName = mEngDateB[1].toLowerCase();
      const month = monthMap[mName] !== undefined ? monthMap[mName] : 0;
      const day = parseInt(mEngDateB[2], 10);
      let year = mEngDateB[3] ? parseInt(mEngDateB[3], 10) : now.getFullYear();
      if (!mEngDateB[3] && month > now.getMonth()) {
        year -= 1;
      }
      let hour = mEngDateB[4] ? parseInt(mEngDateB[4], 10) : 0;
      const min = mEngDateB[5] ? parseInt(mEngDateB[5], 10) : 0;
      const sec = mEngDateB[6] ? parseInt(mEngDateB[6], 10) : 0;
      const ampm = mEngDateB[7] ? mEngDateB[7].toLowerCase() : '';
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      const d = new Date(year, month, day, hour, min, sec);
      return fmt(d);
    }

    // 5. Chuẩn YYYY-MM-DD hoặc DD/MM/YYYY
    const mStd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (mStd) {
      const d = new Date(
        parseInt(mStd[1], 10),
        parseInt(mStd[2], 10) - 1,
        parseInt(mStd[3], 10),
        mStd[4] ? parseInt(mStd[4], 10) : 0,
        mStd[5] ? parseInt(mStd[5], 10) : 0,
        mStd[6] ? parseInt(mStd[6], 10) : 0
      );
      return fmt(d);
    }

    const mDmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (mDmy) {
      const d = new Date(
        parseInt(mDmy[3], 10),
        parseInt(mDmy[2], 10) - 1,
        parseInt(mDmy[1], 10),
        mDmy[4] ? parseInt(mDmy[4], 10) : 0,
        mDmy[5] ? parseInt(mDmy[5], 10) : 0,
        mDmy[6] ? parseInt(mDmy[6], 10) : 0
      );
      return fmt(d);
    }

    return '';
  }

  /**
   * Trích xuất ngày đăng từ HTML Facebook với cơ chế đa tầng:
   * 1. Quét toàn bộ các lần xuất hiện của targetVideoId để lấy publish_time, creation_time, created_time
   * 2. Quét mẫu tiếp giáp gần videoId trong JSON
   * 3. Quét thẻ Meta / LD+JSON
   * 4. Quét creation_story / CometFeedStoryLongerTimestampStrategy
   */
  public extractFacebookDate(html: string, targetVideoId?: string): string {
    if (!html) return '';

    // 1. Quét theo targetVideoId (duyệt qua toàn bộ vị trí xuất hiện trong HTML)
    if (targetVideoId) {
      let searchIdx = 0;
      while ((searchIdx = html.indexOf(targetVideoId, searchIdx)) !== -1) {
        const start = Math.max(0, searchIdx - 2500);
        const end = Math.min(html.length, searchIdx + 4500);
        const chunk = html.slice(start, end);

        const mT =
          chunk.match(/"publish_time":\s*(\d{10})/i) ||
          chunk.match(/"creation_time":\s*(\d{10})/i) ||
          chunk.match(/"created_time":\s*(\d{10})/i) ||
          chunk.match(/"upload_date":\s*"?(\d{10})"?/i) ||
          chunk.match(/"timestamp":\s*(\d{10})/i);

        if (mT) {
          return this.formatTimestamp(mT[1]);
        }
        searchIdx += targetVideoId.length;
      }

      // 1b. Tìm mẫu tiếp giáp gần videoId trong JSON (chẳng hạn "videoId":"..." kèm "publish_time":...)
      try {
        const mAdj1 = html.match(
          new RegExp(`"videoId"\\s*:\\s*"${targetVideoId}"[\\s\\S]{0,500}"(?:publish_time|creation_time)"\\s*:\\s*(\\d{10})`, 'i')
        );
        if (mAdj1) return this.formatTimestamp(mAdj1[1]);

        const mAdj2 = html.match(
          new RegExp(`"(?:publish_time|creation_time)"\\s*:\\s*(\\d{10})[\\s\\S]{0,500}"videoId"\\s*:\\s*"${targetVideoId}"`, 'i')
        );
        if (mAdj2) return this.formatTimestamp(mAdj2[1]);
      } catch {}
    }

    // 2. Thẻ Meta trong HTML: article:published_time, og:updated_time, video:release_date
    const mMetaDate =
      html.match(/<meta\s+(?:property|name)="(?:article:published_time|og:updated_time|video:release_date|uploadDate)"\s+content="([^"]+)"/i) ||
      html.match(/<meta\s+content="([^"]+)"\s+(?:property|name)="(?:article:published_time|og:updated_time|video:release_date|uploadDate)"/i);
    if (mMetaDate && mMetaDate[1]) {
      const parsed = this.parseAnyDate(mMetaDate[1]);
      if (parsed) return parsed;
    }

    // 3. LD+JSON schema uploadDate hoặc datePublished
    const mLd = html.match(/"(?:uploadDate|datePublished|dateCreated)":\s*"([^"]+)"/i);
    if (mLd && mLd[1]) {
      const parsed = this.parseAnyDate(mLd[1]);
      if (parsed) return parsed;
    }

    // 4. Comet timestamp strategy hoặc creation_story
    const mCometStory = html.match(/"CometFeedStoryLongerTimestampStrategy"[^}]*"creation_time":\s*(\d{10})/i);
    if (mCometStory && mCometStory[1]) {
      return this.formatTimestamp(mCometStory[1]);
    }

    const mStory =
      html.match(/"creation_story":\s*\{[^}]*"creation_time":\s*(\d{10})/i) ||
      html.match(/"story":\s*\{[^}]*"creation_time":\s*(\d{10})/i);
    if (mStory && mStory[1]) {
      return this.formatTimestamp(mStory[1]);
    }

    // 5. Thẻ time hoặc abbr
    const mTimeTag = html.match(/<time[^>]+datetime="([^"]+)"/i);
    if (mTimeTag && mTimeTag[1]) {
      const parsed = this.parseAnyDate(mTimeTag[1]);
      if (parsed) return parsed;
    }

    const mAbbr = html.match(/<abbr[^>]+data-utime="(\d+)"/i);
    if (mAbbr && mAbbr[1]) {
      return this.formatTimestamp(mAbbr[1]);
    }

    return '';
  }

  /**
   * Kiểm tra chuỗi caption có phải là văn bản rác giao diện mặc định của Facebook hay không
   */
  public isBoilerplateCaption(text?: string | null): boolean {
    return isBoilerplateCaption(text);
  }

  public isValidAuthor(name?: string | null): boolean {
    return isValidAuthor(name);
  }

  public cleanAuthorName(name?: string | null): string {
    return cleanAuthorName(name);
  }

  public detectPlatform(url: string): PlatformType {
    return detectPlatform(url);
  }

  public detectContentType(url: string): ContentType {
    return detectContentType(url);
  }

  public isRedirectUrl(url: string): boolean {
    return isRedirectUrl(url);
  }

  public validateScrapeResult(
    data: Partial<VideoItem> | null | undefined,
    platform: PlatformType,
    contentType: ContentType
  ): ScrapeValidation {
    return validateScrapeResult(data, platform, contentType);
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
    return sanitizeUrl(url);
  }

  private assertSupportedUrl(url: string): void {
    if (!isFacebookUrl(url) && !isTikTokUrl(url)) {
      throw new Error('Link không được hỗ trợ. Vui lòng nhập link Facebook hoặc TikTok hợp lệ!');
    }
  }

  private mergeScrapeResults(base: VideoItem, candidate: VideoItem): VideoItem {
    return mergeScrapeResultsFn(base, candidate);
  }

  /**
   * Tự động phân giải và theo dõi chuỗi redirect để lấy URL cuối cùng (Canonical/Final URL)
   */
  public async resolveFinalUrl(url: string, slotId?: number): Promise<string> {
    if (!url) return '';
    const clean = this.sanitizeUrl(url);

    try {
      this.assertSupportedUrl(clean);
      const isTikTok = isTikTokUrl(clean);
      const headers: Record<string, string> = { ...(isTikTok ? this.ttHeaders : this.fbHeaders) };

      if (!isTikTok && this.cookieService) {
        try {
          const cookies = this.cookieService.loadCookies(slotId);
          if (Array.isArray(cookies) && cookies.length > 0) {
            const cookieStr = cookies
              .filter((c) => c && c.name && c.value)
              .map((c) => `${c.name}=${c.value}`)
              .join('; ');
            if (cookieStr) headers['Cookie'] = cookieStr;
          }
        } catch {}
      }

      const res = await fetch(clean, {
        method: 'GET',
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
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
            (this.isWatchUrl(canonical) && !finalUrl.includes('/videos/')) ||
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

      // Nếu finalUrl vẫn là /watch hoặc video.php, thử bóc tách author từ HTML để chuyển thành /[author]/videos/[id]/
      if (this.isWatchUrl(finalUrl) || finalUrl.includes('video.php')) {
        const mVid = finalUrl.match(/[?&]v=(\d+)/) || clean.match(/[?&]v=(\d+)/);
        if (mVid) {
          const videoId = mVid[1];
          const mActorUrl =
            html.match(/"actors":\s*\[\s*\{[^}]*"url":\s*"([^"]+)"/i) ||
            html.match(/"owner_as_page":\s*\{[^}]*"url":\s*"([^"]+)"/i) ||
            html.match(/"video_owner":\s*\{[^}]*"url":\s*"([^"]+)"/i);
          if (mActorUrl && mActorUrl[1]) {
            const rawAuthorUrl = normalizeFacebookUrl(mActorUrl[1]);
            const mPeopleId = rawAuthorUrl.match(/\/people\/[^/]+\/(\d+)/i);
            if (mPeopleId) {
              finalUrl = `https://www.facebook.com/${mPeopleId[1]}/videos/${videoId}/`;
            } else {
              const mSlug = rawAuthorUrl.match(/facebook\.com\/([a-zA-Z0-9._-]+)/i);
              if (
                mSlug &&
                !['watch', 'reel', 'reels', 'videos', 'story', 'share', 'groups', 'people', 'profile.php'].includes(
                  mSlug[1].toLowerCase()
                )
              ) {
                finalUrl = `https://www.facebook.com/${mSlug[1]}/videos/${videoId}/`;
              }
            }
          }
          if (this.isWatchUrl(finalUrl) || finalUrl.includes('video.php')) {
            const mActorId =
              html.match(/"actors":\s*\[\s*\{[^}]*"id":\s*"(\d+)"/i) ||
              html.match(/"video_owner":\s*\{[^}]*"id":\s*"(\d+)"/i) ||
              html.match(/"owner":\s*\{[^}]*"id":\s*"(\d+)"/i);
            if (mActorId && mActorId[1]) {
              finalUrl = `https://www.facebook.com/${mActorId[1]}/videos/${videoId}/`;
            }
          }
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

  public isLoginWall(html: string): boolean {
    if (!html || html.length < 3000) return true;
    const hasLoginForm =
      /<form[^>]+action=["'][^"']*(?:login|checkpoint)[^"']*["']/i.test(html) ||
      /<input[^>]+name=["'](?:email|pass)["']/i.test(html);
    const mTitle = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = (mTitle ? mTitle[1] : '').trim().toLowerCase();
    const hasLoginTitle =
      title.startsWith('đăng nhập') ||
      title.startsWith('log in') ||
      title.startsWith('login');
    return hasLoginForm || hasLoginTitle;
  }

  public isWatchUrl(url: string): boolean {
    if (!url) return false;
    try {
      const u = new URL(url.trim().match(/^https?:\/\//i) ? url.trim() : `https://${url.trim()}`);
      return (
        (u.hostname === 'facebook.com' || u.hostname.endsWith('.facebook.com')) &&
        (u.pathname === '/watch' || u.pathname.startsWith('/watch/'))
      );
    } catch {
      return /(?:facebook\.com|fb\.watch)\/watch(?:\/|\?|$)/i.test(url);
    }
  }

  /**
   * Bóc tách Facebook bằng HTTP Request (~0.8s)
   */
  public async scrapeFacebookHttp(
    url: string,
    stt: number = 1,
    depth: number = 0,
    slotId?: number
  ): Promise<VideoItem> {
    const cleanUrl = this.sanitizeUrl(url);
    if (!isFacebookUrl(cleanUrl)) {
      throw new Error('Link Facebook không hợp lệ');
    }

    let reqHeaders: Record<string, string> = { ...this.fbHeaders };
    try {
      if (this.cookieService) {
        const cookies = this.cookieService.loadCookies(slotId);
        if (Array.isArray(cookies) && cookies.length > 0) {
          const cookieStr = cookies
            .filter((c) => c && c.name && c.value)
            .map((c) => `${c.name}=${c.value}`)
            .join('; ');
          if (cookieStr) {
            reqHeaders['Cookie'] = cookieStr;
          }
        }
      }
    } catch {}

    const res = await fetch(cleanUrl, {
      headers: reqHeaders,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    const finalHttpUrl = res.url ? this.sanitizeUrl(res.url) : cleanUrl;
    const html = await res.text();
    let result = await this.parseFacebookHtml(html, finalHttpUrl, stt, depth, slotId);

    // Nếu lần fetch đầu tiên bị login wall hoặc thiếu dữ liệu quan trọng, thử fallback qua Facebook Bot Headers
    const isLacking = !result.nguoiDang || (result.LuotXem === 0 && result.LuotLike === 0);
    const isLoginWall = this.isLoginWall(html);

    if (isLacking || isLoginWall) {
      try {
        const botRes = await fetch(cleanUrl, {
          headers: this.fbBotHeaders,
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        });
        if (botRes.ok) {
          const botHtml = await botRes.text();
          const botResult = await this.parseFacebookHtml(
            botHtml,
            botRes.url ? this.sanitizeUrl(botRes.url) : finalHttpUrl,
            stt,
            depth,
            slotId
          );
          if (botResult.nguoiDang || botResult.caption || botResult.LuotXem > 0 || botResult.LuotLike > 0) {
            result = this.mergeScrapeResults(result, botResult);
          }
        }
      } catch {}
    }

    return result;
  }

  /**
   * Phân tích HTML Facebook đã tải (dùng chung cho HTTP request và Playwright fallback)
   */
  private async parseFacebookHtml(
    html: string,
    cleanUrl: string,
    stt: number,
    depth: number = 0,
    slotId?: number
  ): Promise<VideoItem> {
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
          (this.isWatchUrl(canonical) && !effectiveUrl.includes('/videos/')) ||
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
      effectiveUrl.includes('/share/r');
    const isPhoto =
      (effectiveUrl.includes('/photo/') || effectiveUrl.includes('photo.php') || effectiveUrl.includes('/photo?')) &&
      !effectiveUrl.includes('permalink.php') &&
      !effectiveUrl.includes('/posts/');
    const isPermalink =
      effectiveUrl.includes('permalink.php') ||
      effectiveUrl.includes('story.php') ||
      effectiveUrl.includes('/posts/') ||
      effectiveUrl.includes('/groups/');

    const result: VideoItem = {
      id: `fb-${stt}`,
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

    // 2. Bóc tách từ các khối Relay GraphQL script trong HTML (Scoped theo Video/Post ID)
    const targetVideoId =
      effectiveUrl.match(/\/(?:reel|videos)\/(\d+)/)?.[1] ||
      effectiveUrl.match(/[?&]v=(\d+)/)?.[1] ||
      effectiveUrl.match(/(?:story_fbid|fbid)=(pfbid[a-zA-Z0-9]+|\d+)/)?.[1] ||
      effectiveUrl.match(/\/posts\/(?:[^/?#]+\/)*(pfbid[a-zA-Z0-9]+|\d+)/)?.[1];

    if (!result.caption) {
      let foundMessage = '';
      if (targetVideoId) {
        // Duyệt qua tất cả các vị trí của targetVideoId trong HTML để tìm khối chứa message thật của đúng bài này
        let searchIndex = 0;
        while ((searchIndex = html.indexOf(targetVideoId, searchIndex)) !== -1) {
          const start = Math.max(0, searchIndex - 2500);
          const end = Math.min(html.length, searchIndex + 4500);
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

      // Quét khối creation_story CHỈ KHI không có targetVideoId hoặc creation_story chứa targetVideoId
      if (!foundMessage) {
        const creationStoryIdx = html.indexOf('"creation_story"');
        if (creationStoryIdx !== -1) {
          const chunk = html.slice(creationStoryIdx, creationStoryIdx + 8000);
          if (!targetVideoId || chunk.includes(targetVideoId)) {
            const mStoryMsg = chunk.match(/"message":\s*\{\s*"text":\s*"((?:[^"\\]|\\.)*)"/);
            if (mStoryMsg && mStoryMsg[1] && !this.isBoilerplateCaption(mStoryMsg[1])) {
              foundMessage = mStoryMsg[1];
            }
          }
        }
      }

      // Quét khối comet_sections CHỈ KHI không có targetVideoId hoặc comet_sections chứa targetVideoId
      if (!foundMessage) {
        const cometIdx = html.indexOf('"comet_sections"');
        if (cometIdx !== -1) {
          const chunk = html.slice(cometIdx, cometIdx + 8000);
          if (!targetVideoId || chunk.includes(targetVideoId)) {
            const mStoryMsg = chunk.match(/"message":\s*\{\s*"text":\s*"((?:[^"\\]|\\.)*)"/);
            if (mStoryMsg && mStoryMsg[1] && !this.isBoilerplateCaption(mStoryMsg[1])) {
              foundMessage = mStoryMsg[1];
            }
          }
        }
      }

      if (foundMessage) {
        result.caption = this.decodeJsonEscapes(foundMessage);
      }
    }

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

    // 2a. Trích xuất ngày đăng (creation_time, publish_time, uploadDate,...)
    if (!result.ngayDang) {
      result.ngayDang = this.extractFacebookDate(html, targetVideoId);
    }

    // A reshare is a distinct post type. Detect it only from the target story's
    // data, not from adjacent preloaded stories in the response.
    if (targetVideoId) {
      const targetStoryChunk = this.getChunkAroundVideoId(html, targetVideoId);
      result.isShared =
        /"(?:is_shared|is_reshare|is_share_story)"\s*:\s*true/i.test(targetStoryChunk) ||
        /"story_type"\s*:\s*"(?:RESHARE|SHARE)"/i.test(targetStoryChunk) ||
        /(?:đã chia sẻ (?:một )?(?:bài viết|video|thước phim|ảnh|liên kết)|shared\s+(?:a\s+)?(?:post|video|reel|photo|link))/i.test(
          this.decodeJsonEscapes(targetStoryChunk)
        );
    }

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
        const cleanTitle = beforeDash
          .toLowerCase()
          .replace(/[.,:;!?…\-]+$/, '')
          .trim();
        if (
          beforeDash &&
          isValidAuthor(beforeDash) &&
          !invalidTitles.some((inv) => cleanTitle === inv || cleanTitle === `${inv} -` || cleanTitle === `${inv} |`)
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
        result.authorUrl = normalizeFacebookUrl(mActorUrl[1]);
      }
    }

    // Fallback trích xuất authorUid và authorUrl trực tiếp từ URL nếu chưa có
    if (!result.authorUid) {
      const mUrlUid = cleanUrl.match(/facebook\.com\/(\d{5,})/i) || cleanUrl.match(/[?&]id=(\d{5,})/i);
      if (mUrlUid && mUrlUid[1]) {
        result.authorUid = mUrlUid[1];
      }
    }
    if (!result.authorUrl) {
      if (result.authorUid) {
        result.authorUrl = `https://www.facebook.com/${result.authorUid}`;
      } else {
        const mSlug = cleanUrl.match(/facebook\.com\/([a-zA-Z0-9._-]+)\/(?:posts|videos|reel)/i);
        if (mSlug && !['watch', 'reel', 'videos', 'story', 'share', 'permalink.php'].includes(mSlug[1].toLowerCase())) {
          result.authorUrl = `https://www.facebook.com/${mSlug[1]}`;
        }
      }
    }
    if (result.authorUrl) {
      result.authorUrl = normalizeFacebookUrl(result.authorUrl);
    }

    // 2e. Nếu link bài viết đang là /watch hoặc video.php, nâng cấp lên link video gốc theo tác giả
    if ((this.isWatchUrl(effectiveUrl) || effectiveUrl.includes('video.php')) && targetVideoId) {
      if (result.authorUrl) {
        const mPeople = result.authorUrl.match(/\/people\/[^/]+\/(\d+)/i);
        if (mPeople) {
          effectiveUrl = `https://www.facebook.com/${mPeople[1]}/videos/${targetVideoId}/`;
          result.link = effectiveUrl;
        } else {
          const mSlug = result.authorUrl.match(/facebook\.com\/([a-zA-Z0-9._-]+)/i);
          if (
            mSlug &&
            !['watch', 'reel', 'reels', 'videos', 'story', 'share', 'groups', 'people', 'profile.php'].includes(
              mSlug[1].toLowerCase()
            )
          ) {
            effectiveUrl = `https://www.facebook.com/${mSlug[1]}/videos/${targetVideoId}/`;
            result.link = effectiveUrl;
          }
        }
      }
      if ((this.isWatchUrl(effectiveUrl) || effectiveUrl.includes('video.php')) && result.authorUid) {
        effectiveUrl = `https://www.facebook.com/${result.authorUid}/videos/${targetVideoId}/`;
        result.link = effectiveUrl;
      }
    }

    // 3. Nếu chưa có Lượt xem hoặc Ngày đăng, fallback qua endpoint Watch nhưng BẮT BUỘC phải scope theo đúng videoId mục tiêu
    if ((!result.LuotXem || !result.ngayDang) && isReel) {
      const mId = cleanUrl.match(/\/(?:reel|videos)\/(\d+)/);
      if (mId) {
        try {
          const watchRes = await fetch(`https://www.facebook.com/watch/?v=${mId[1]}`, {
            headers: this.fbHeaders,
            signal: AbortSignal.timeout(15000),
          });
          if (watchRes.ok) {
            const watchHtml = await watchRes.text();
            if (!result.LuotXem) {
              const scopedPlay = this.extractMetricScopedByVideoId(watchHtml, mId[1], [
                /"play_count":\s*(\d+)/,
                /"video_view_count":\s*(\d+)/,
              ]);
              if (scopedPlay > 0) {
                result.LuotXem = scopedPlay;
              }
            }
            if (!result.ngayDang) {
              const watchDate = this.extractFacebookDate(watchHtml, mId[1]);
              if (watchDate) {
                result.ngayDang = watchDate;
              }
            }
          }
        } catch {
          // Bỏ qua lỗi fallback Watch
        }
      }
    }

    // 4. Nếu là bài viết permalink / chia sẻ có video Reel nhúng bên trong, lấy lượt xem của video Reel đó
    if (!result.LuotXem && isPermalink && depth === 0) {
      const mEmbeddedVid = html.match(/(?:video_id|videoId|"video":\{"id"):["\s]*(\d+)/);
      if (mEmbeddedVid) {
        try {
          const reelRes = await this.scrapeFacebookHttp(
            `https://www.facebook.com/reel/${mEmbeddedVid[1]}`,
            stt,
            depth + 1,
            slotId
          );
          if (reelRes.LuotXem > 0) {
            result.LuotXem = reelRes.LuotXem;
          }
          if (!result.ngayDang && reelRes.ngayDang) {
            result.ngayDang = reelRes.ngayDang;
          }
        } catch {
          // Bỏ qua lỗi
        }
      }
    }

    // 5. Trích xuất ID duy nhất của bài viết / video để chống trùng lặp tuyệt đối
    const mPostId =
      cleanUrl.match(/\/reel\/([a-zA-Z0-9_-]+)/) ||
      cleanUrl.match(/(?:videos\/|\?v=)(\d+)/) ||
      cleanUrl.match(/(?:story_fbid|fbid)=(pfbid[a-zA-Z0-9]+|\d+)/) ||
      cleanUrl.match(/\/posts\/(?:[^/?#]+\/)*(pfbid[a-zA-Z0-9]+|\d+)/) ||
      html.match(/"video_id":"?(\d+)"?/) ||
      html.match(/"post_id":"?([a-zA-Z0-9_]+)"?/) ||
      html.match(/\/posts\/[^/]+\/(pfbid[a-zA-Z0-9]+|\d+)/);
    if (mPostId) {
      result.postId = mPostId[1];
      if (!result.ngayDang) {
        result.ngayDang = this.extractFacebookDate(html, result.postId);
      }
    }

    // Only inspect the data associated with this post. A Facebook response also
    // contains avatars, suggested posts and preloaded feed cards, none of which
    // proves that the target post has an image attachment.
    const targetContentChunk = targetVideoId
      ? this.getChunkAroundVideoId(html, targetVideoId)
      : '';
    const hasPhotoAttachment =
      isPhoto ||
      Boolean(
        targetContentChunk.includes('"attachment_style":"photo"') ||
        targetContentChunk.includes('"attachment_style":"album"') ||
        targetContentChunk.includes('"attachment_style":"multi_photo"') ||
        targetContentChunk.includes('"subattachment_style":"photo"')
      );
    result.hasImage = hasPhotoAttachment;

    // Phân loại chuẩn xác theo quy tắc:
    // - Nếu có mắt xem hoặc link là reel/watch/videos -> Facebook Video / Facebook Reel
    // - Nếu không có mắt xem: có ảnh -> Facebook Photo, không có ảnh/video -> Facebook Post
    if (isReel) {
      result.loai = 'Facebook Reel';
    } else if (result.LuotXem > 0 || effectiveUrl.includes('/videos/') || this.isWatchUrl(effectiveUrl)) {
      result.loai = 'Facebook Video';
    } else if (hasPhotoAttachment || isPhoto) {
      result.loai = 'Facebook Photo';
    } else {
      result.loai = 'Facebook Post';
    }

    return result;
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
    if (!isTikTokUrl(cleanUrl)) {
      throw new Error('Link TikTok không hợp lệ');
    }
    const res = await fetch(cleanUrl, {
      headers: this.ttHeaders,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
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
      id: `tt-${stt}`,
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
            result.authorUid = item.author.uniqueId;
            result.authorUrl = `https://www.tiktok.com/@${item.author.uniqueId}`;
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

    if (!result.authorUrl && cleanUrl.includes('tiktok.com/@')) {
      const mTT = cleanUrl.match(/tiktok\.com\/@([^/?#]+)/i);
      if (mTT) {
        if (!result.authorUid) result.authorUid = mTT[1];
        result.authorUrl = `https://www.tiktok.com/@${mTT[1]}`;
      }
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
    if (this.browserInstance && this.browserInstance.isConnected()) {
      return this.browserInstance;
    }
    if (this.browserLaunching) {
      return this.browserLaunching;
    }

    this.browserLaunching = (async () => {
      try {
        if (this.browserInstance) {
          await this.browserInstance.close().catch(() => {});
        }
      } catch {}

      try {
        const browser = await chromium.launch({
          headless: true,
          args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
        });

        browser.on('disconnected', () => {
          this.logger.warn('[Playwright] Chromium browser đã bị ngắt kết nối (crash hoặc bị đóng). Sẽ tự động tái tạo phiên mới ở lần gọi tiếp theo.');
          this.browserInstance = null;
          this.browserLaunching = null;
        });

        this.browserInstance = browser;
        return browser;
      } catch (err) {
        this.browserInstance = null;
        throw err;
      } finally {
        this.browserLaunching = null;
      }
    })();

    return this.browserLaunching;
  }

  /**
   * Fallback qua Playwright Browser (mở trang thật khi HTTP bị chặn/không parse được)
   */
  public async scrapeWithBrowser(url: string, stt: number = 1, slotId?: number): Promise<VideoItem> {
    const cleanUrl = this.sanitizeUrl(url);
    this.assertSupportedUrl(cleanUrl);
    const isTikTok = isTikTokUrl(cleanUrl);

    let browser = await this.getBrowser();
    let context: BrowserContext;
    const contextOptions = {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'vi-VN',
    };

    try {
      context = await browser.newContext(contextOptions);
    } catch (ctxErr: unknown) {
      this.logger.warn(`[Playwright] Lỗi tạo context (${(ctxErr as Error)?.message}). Đang tái khởi động Chromium mới...`);
      this.browserInstance = null;
      browser = await this.getBrowser();
      context = await browser.newContext(contextOptions);
    }

    // Nạp Cookie Facebook vào context nếu có
    if (!isTikTok && this.cookieService) {
      try {
        const cookies = this.cookieService.loadCookies(slotId);
        if (Array.isArray(cookies) && cookies.length > 0) {
          await context.addCookies(cookies);
          this.logger.log(`[Playwright] Đã nạp ${cookies.length} cookie vào phiên trình duyệt.`);
        }
      } catch (err: unknown) {
        this.logger.warn(`[Playwright] Không thể nạp cookie: ${(err as Error)?.message}`);
      }
    }

    try {
      const page = await context.newPage();

      // [Method 1] Chặn nạp các tài nguyên media nặng (ảnh, video mp4/webm, fonts) để tăng tốc độ cào gấp 4-5 lần
      await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        const u = route.request().url().toLowerCase();
        if (
          type === 'image' ||
          type === 'media' ||
          type === 'font' ||
          /\.(png|jpe?g|webp|gif|svg|ico|mp4|webm|woff2?|ttf|otf)(\?.*)?$/i.test(u)
        ) {
          return route.abort();
        }
        return route.continue();
      });

      await page.goto(cleanUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });

      // Chờ các phần tử chính xuất hiện thay vì waitForTimeout cố định
      try {
        await Promise.race([
          page.waitForSelector(
            'video, div[role="article"], div[role="main"], div[role="dialog"], [data-e2e="browse-video-desc"], h2, [role="button"], [data-e2e="like-count"]',
            { timeout: 3500 }
          ),
          page.waitForLoadState('networkidle', { timeout: 3000 }),
        ]);
      } catch {}

      if (cleanUrl.includes('/share/') || cleanUrl.includes('fb.watch')) {
        try {
          await page.waitForURL((u) => !u.href.includes('/share/') && !u.href.includes('fb.watch'), { timeout: 3000 });
        } catch {}
      }

      // Xác định URL thực tế sau khi redirect (chẳng hạn từ share link sang /reel/...)
      const currentUrl = page.url();
      let effectiveUrl = cleanUrl;
      if (
        currentUrl &&
        !currentUrl.includes('/login') &&
        (currentUrl.includes('/reel/') ||
          currentUrl.includes('/videos/') ||
          this.isWatchUrl(currentUrl) ||
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
              (this.isWatchUrl(cleanCanonical) && !effectiveUrl.includes('/videos/')) ||
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

      if (!result.ngayDang && !isTikTok) {
        result.ngayDang = this.extractFacebookDate(html, result.postId);
      }

      result.crawlSource = 'playwright';

      if (effectiveUrl && effectiveUrl !== cleanUrl && !result.link) {
        result.link = effectiveUrl;
      }

      // Nếu là Facebook mà thiếu tác giả hoặc tương tác, bổ trợ từ DOM thật
      if (!isTikTok) {
        try {
          const isReel =
            effectiveUrl.includes('/reel/') ||
            effectiveUrl.includes('/share/r');

          const domData = await page.evaluate((isReel) => {
            const parseNum = (t: string | null | undefined): number => {
              if (!t) return 0;
              const clean = t.trim();
              if (/(?:bạn|và).*(?:người khác)/i.test(clean) || /(?:others)/i.test(clean)) return 0;
              const m =
                clean.match(/([\d.,]+)\s*(triệu|tr|nghìn|ngàn|k|m|b|tỷ|n)(?![\p{L}\p{N}])/iu) ||
                clean.match(/([\d.,]+)/iu);
              if (!m) return 0;
              let numStr = m[1].replace(/\s+/g, '');
              const unit = (m[2] || '').toLowerCase();
              if (numStr.includes(',') && numStr.includes('.')) {
                if (numStr.lastIndexOf(',') > numStr.lastIndexOf('.')) {
                  numStr = numStr.replace(/\./g, '').replace(',', '.');
                } else {
                  numStr = numStr.replace(/,/g, '');
                }
              } else if (numStr.includes(',')) {
                const parts = numStr.split(',');
                if (parts.length > 2) numStr = numStr.replace(/,/g, '');
                else if (parts.length === 2) {
                  if (unit || parts[1].length <= 2) numStr = parts[0] + '.' + parts[1];
                  else numStr = numStr.replace(/,/g, '');
                }
              } else if (numStr.includes('.')) {
                const parts = numStr.split('.');
                if (parts.length > 2) numStr = numStr.replace(/\./g, '');
                else if (parts.length === 2 && !unit && parts[1].length === 3) numStr = numStr.replace(/\./g, '');
              }
              const val = parseFloat(numStr);
              if (isNaN(val)) return 0;
              let mult = 1;
              if (['k', 'nghìn', 'ngàn', 'n'].includes(unit)) mult = 1000;
              else if (['m', 'triệu', 'tr'].includes(unit)) mult = 1000000;
              else if (['b', 'tỷ'].includes(unit)) mult = 1000000000;
              return mult > 1 ? Math.round(val * mult) : Math.floor(val);
            };

            let author = '';
            let caption = '';
            let likes = 0;
            let comments = 0;
            let shares = 0;
            let views = 0;
            let hasImage = false;
            let isShared = false;
            let originalAuthor = '';
            let originalPostUrl = '';
            let dateStr = '';
            let containerFound = false;

            if (isReel) {
              // --- SCOPED REEL EXTRACTION ---
              // Tác giả Reel: thẻ <h2> hoặc link profile trong reel player
              const h2 = document.querySelector('h2');
              if (h2 && h2.textContent && h2.textContent.trim()) {
                author = h2.textContent.trim();
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

              // Caption Reel
              const mainEl = document.querySelector('div[role="main"]') || document.body;
              const autoTexts = Array.from(mainEl.querySelectorAll('div[dir="auto"]'));
              for (const el of autoTexts) {
                if (el.closest('button, [role="button"], h2, form')) continue;
                const t = el.textContent?.trim() || '';
                if (t && t.length >= 2 && !/^(like|thích|comment|bình luận|share|chia sẻ|follow|theo dõi)$/i.test(t)) {
                  caption = t;
                  break;
                }
              }

              // Action buttons của Reel: Nút Like đầu tiên của active reel
              const allButtons = Array.from(document.querySelectorAll('[role="button"], button'));
              const likeBtn = allButtons.find((b) => {
                const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                return aria === 'like' || aria === 'thích' || /^(\d+.*(thích|like|react|bày tỏ))/i.test(aria);
              });

              if (likeBtn) {
                containerFound = true;
                likes = parseNum(likeBtn.textContent);
                const mAria = (likeBtn.getAttribute('aria-label') || '').match(/(\d+([,.]\d+)?\s*[kmb]?)/i);
                if (likes === 0 && mAria) likes = parseNum(mAria[1]);

                // Tìm cụm action bar duy nhất chứa likeBtn của active reel (tránh quét sang preloaded reels)
                const actionContainer =
                  likeBtn.closest('div[class*="x1n2onr6"]') ||
                  likeBtn.parentElement?.parentElement;
                if (actionContainer) {
                  const btns = Array.from(actionContainer.querySelectorAll('[role="button"], button'));
                  for (const b of btns) {
                    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                    const txt = b.textContent?.trim() || '';
                    if (/comment|bình luận/i.test(aria)) {
                      comments = parseNum(txt);
                    } else if (/share|chia sẻ/i.test(aria)) {
                      shares = parseNum(txt);
                    }
                  }
                }
              }
            } else {
              // --- SCOPED POST / DIALOG EXTRACTION ---
              const container =
                document.querySelector('div[role="dialog"]') ||
                document.querySelector('div[role="main"] div[role="article"]') ||
                document.querySelector('div[role="main"]') ||
                document.querySelector('div[role="article"]');

              if (container) {
                containerFound = true;

                // Tác giả Post
                const authorEl = container.querySelector(
                  'h2 strong, h3 strong, h2 a, h3 a, [role="heading"] a, [role="heading"] strong, strong'
                );
                if (authorEl && authorEl.textContent?.trim()) {
                  author = authorEl.textContent.trim();
                }

                // Caption Post
                const msgEl = container.querySelector(
                  'div[data-ad-preview="message"], div[dir="auto"][style*="text-align"]'
                );
                if (msgEl && msgEl.textContent) {
                  caption = msgEl.textContent.trim();
                } else {
                  const textNodes = Array.from(container.querySelectorAll('div[dir="auto"]'));
                  for (const n of textNodes) {
                    if (n.closest('button, [role="button"], h2, h3, [role="toolbar"], form, [role="article"]')) continue;
                    const t = n.textContent?.trim() || '';
                    if (t.length >= 3 && !/^(like|thích|comment|bình luận|share|chia sẻ|gửi|send)$/i.test(t)) {
                      caption = t;
                      break;
                    }
                  }
                }

                // Phát hiện ảnh đính kèm (loại trừ avatar và ảnh cover)
                const postImgs = Array.from(container.querySelectorAll('img')).filter((img) => {
                  const alt = (img.alt || '').toLowerCase();
                  const parentA = img.closest('a');
                  const parentHref = parentA ? (parentA.href || '').toLowerCase() : '';
                  const parentAria = parentA ? (parentA.getAttribute('aria-label') || '').toLowerCase() : '';

                  if (
                    alt.includes('ảnh đại diện') ||
                    alt.includes('profile picture') ||
                    parentAria.includes('ảnh đại diện') ||
                    parentAria.includes('profile picture')
                  ) {
                    return false;
                  }
                  if (img.closest('h2, h3, h4, [role="heading"]')) return false;
                  if (parentHref.includes('profile.php') || parentHref.includes('/user/')) return false;

                  const r = img.getBoundingClientRect();
                  const isPhotoLink =
                    parentHref.includes('/photo') ||
                    parentHref.includes('photo.php') ||
                    parentHref.includes('set=pcb.');
                  return (r.width >= 150 && r.height >= 120) || (isPhotoLink && r.width >= 100);
                });
                hasImage = postImgs.length > 0;

                // Likes / Reactions
                const toolbar = container.querySelector(
                  '[role="toolbar"], [aria-label*="reacted" i], [aria-label*="bày tỏ" i], [aria-label*="reaction" i]'
                );
                if (toolbar) {
                  likes = parseNum(toolbar.textContent);
                }
                if (likes === 0) {
                  const likeBtn = container.querySelector('[aria-label="Like" i], [aria-label="Thích" i]');
                  if (likeBtn) likes = parseNum(likeBtn.textContent);
                }

                // Nút bình luận & chia sẻ bên trong container
                const actionBtns = Array.from(container.querySelectorAll('[role="button"]'));
                for (const b of actionBtns) {
                  const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                  const txt = b.textContent?.trim() || '';
                  if (/comment|bình luận/i.test(aria)) {
                    if (txt) comments = parseNum(txt);
                  } else if (/share|chia sẻ|send this/i.test(aria)) {
                    if (txt) shares = parseNum(txt);
                  }
                }

                // Nếu comments vẫn 0, đếm số comment article hiển thị trực tiếp trong container
                const visibleComments = container.querySelectorAll(
                  'div[role="article"][aria-label*="comment" i], div[role="article"][aria-label*="bình luận" i]'
                );
                if (comments === 0 && visibleComments.length > 0) {
                  comments = visibleComments.length;
                }

                // Phân biệt bài viết chia sẻ và tác giả gốc
                const headerEl = container.querySelector('h2, h3, h4, [role="heading"]');
                const headerText = headerEl ? (headerEl.textContent || '') : '';
                const sharedRegex =
                  /(?:đã chia sẻ một (?:bài viết|video|thước phim|ảnh|liên kết)|đã chia sẻ bài viết của|đã chia sẻ video của|shared a (?:post|video|reel|link|photo)|shared post from)/i;
                if (sharedRegex.test(headerText)) {
                  isShared = true;
                } else {
                  const nestedArticles = Array.from(container.querySelectorAll('div[role="article"]')).filter((a) => {
                    if (a === container) return false;
                    const aria = (a.getAttribute('aria-label') || '').toLowerCase();
                    if (aria.includes('comment') || aria.includes('bình luận') || aria.includes('reply')) return false;
                    return true;
                  });
                  if (nestedArticles.length > 0) {
                    isShared = true;
                  }
                }

                // Ngày đăng từ DOM trong container
                const timeEl = container.querySelector('time');
                if (timeEl) {
                  dateStr = timeEl.getAttribute('datetime') || timeEl.textContent?.trim() || '';
                }
                if (!dateStr) {
                  const abbrEl = container.querySelector('abbr[data-utime]');
                  if (abbrEl) dateStr = abbrEl.getAttribute('data-utime') || '';
                }
                if (!dateStr) {
                  const links = Array.from(container.querySelectorAll('a[role="link"], a'));
                  for (const a of links) {
                    const aria = (a.getAttribute('aria-label') || '').trim();
                    const txt = a.textContent?.trim() || '';
                    const href = (a.getAttribute('href') || '').toLowerCase();
                    if (
                      href.includes('/posts/') ||
                      href.includes('/permalink') ||
                      href.includes('story.php') ||
                      href.includes('/reel/') ||
                      href.includes('/videos/')
                    ) {
                      if (aria && /\d/.test(aria)) {
                        dateStr = aria;
                        break;
                      }
                      if (txt && /\d/.test(txt)) {
                        dateStr = txt;
                        break;
                      }
                    }
                  }
                }
              }
            }

            // Fallback ngày đăng từ thẻ script nếu chưa tìm thấy
            if (!dateStr) {
              const scripts = Array.from(document.querySelectorAll('script'));
              for (const s of scripts) {
                const t = s.textContent || '';
                const mP = t.match(/"publish_time":\s*(\d{10})/);
                if (mP) {
                  dateStr = mP[1];
                  break;
                }
                const mC = t.match(/"creation_time":\s*(\d{10})/);
                if (mC) {
                  dateStr = mC[1];
                  break;
                }
              }
            }

            return {
              author,
              caption,
              likes,
              comments,
              shares,
              views,
              hasImage,
              isShared,
              originalAuthor,
              originalPostUrl,
              dateStr,
              containerFound,
            };
          }, isReel);

          if ((!result.caption || this.isBoilerplateCaption(result.caption)) && domData.caption) {
            result.caption = this.normalizeCaption(domData.caption);
          }
          if (!result.nguoiDang && domData.author) {
            const cleaned = this.cleanAuthorName(domData.author);
            if (cleaned) result.nguoiDang = cleaned;
          }
          if (!result.ngayDang && domData.dateStr) {
            const parsed = this.parseAnyDate(domData.dateStr);
            if (parsed) result.ngayDang = parsed;
          }
          if (domData.containerFound) {
            result.containerFound = true;
            if (domData.likes > 0 || !result.LuotLike) {
              result.LuotLike = domData.likes > 0 ? domData.likes : result.LuotLike;
            }
            if (domData.comments > 0 || !result.LuotComment) {
              result.LuotComment = domData.comments > 0 ? domData.comments : result.LuotComment;
            }
            if (domData.shares > 0 || !result.SoLuongNguoiShare) {
              result.SoLuongNguoiShare = domData.shares > 0 ? domData.shares : result.SoLuongNguoiShare;
            }
            if (domData.views > 0 || !result.LuotXem) {
              result.LuotXem = domData.views > 0 ? domData.views : result.LuotXem;
            }
          }
          if (domData.hasImage) {
            result.hasImage = true;
          }
          if (domData.isShared && !result.isShared) {
            result.isShared = true;
          }
          if (domData.originalAuthor && !result.originalAuthor) {
            result.originalAuthor = this.cleanAuthorName(domData.originalAuthor);
          }
          if (domData.originalPostUrl && !result.originalPostUrl) {
            result.originalPostUrl = this.sanitizeUrl(domData.originalPostUrl);
          }
        } catch {}
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
          if (!result.nguoiDang && ttDom.author) {
            const cleaned = this.cleanAuthorName(ttDom.author);
            if (cleaned) result.nguoiDang = cleaned;
          }
          if ((!result.caption || result.caption === 'Không có tiêu đề') && ttDom.caption) {
            result.caption = this.normalizeCaption(ttDom.caption);
          }
          if (!result.LuotLike && ttDom.likes && ttDom.likes !== '0') {
            result.LuotLike = this.parseNumber(ttDom.likes);
          }
          if (!result.LuotComment && ttDom.comments && ttDom.comments !== '0') {
            result.LuotComment = this.parseNumber(ttDom.comments);
          }
          if (!result.SoLuongNguoiShare && ttDom.shares && ttDom.shares !== '0') {
            result.SoLuongNguoiShare = this.parseNumber(ttDom.shares);
          }
        } catch {}
      }

      return result;
    } finally {
      await context.close();
    }
  }

  private finalizeVideoItem(item: VideoItem, fallbackUrl: string): VideoItem {
    if (item.link) {
      item.link = this.sanitizeUrl(item.link);
    } else {
      item.link = fallbackUrl;
    }
    if (item.originalPostUrl) {
      item.originalPostUrl = this.sanitizeUrl(item.originalPostUrl);
    }
    if (!item.caption || !item.caption.trim()) {
      item.caption = 'Không có tiêu đề';
    } else {
      item.caption = this.normalizeCaption(item.caption);
    }
    if (item.nguoiDang) {
      item.nguoiDang = this.cleanAuthorName(item.nguoiDang) || item.nguoiDang;
    }
    return item;
  }

  /**
   * Hàm điều phối chính:
   * INPUT → sanitizeUrl() → resolveRedirects() → detectPlatform/ContentType → HTTP scrape → validation → Playwright fallback → finalize
   */
  public async scrapeVideo(url: string, stt: number = 1): Promise<VideoItem> {
    const sanitizedUrl = this.sanitizeUrl(url);

    // Chọn 1 slot cookie cho cả phiên cào (job-level)
    const activeCookieSlot = this.cookieService?.getNextActiveCookieSlot ? this.cookieService.getNextActiveCookieSlot() : null;
    const cookieSlotId = activeCookieSlot ? activeCookieSlot.id : undefined;

    // 1. Phân giải các redirect URL (fb.watch, /share/...) trước khi quyết định phương thức crawl
    let finalUrl = sanitizedUrl;
    if (this.isRedirectUrl(sanitizedUrl)) {
      try {
        finalUrl = await this.resolveFinalUrl(sanitizedUrl, cookieSlotId);
      } catch {}
    }

    const platform = this.detectPlatform(finalUrl);
    const contentType = this.detectContentType(finalUrl);

    this.assertSupportedUrl(finalUrl);

    this.logger.log(`[SCRAPER:ATTEMPT] platform=${platform} type=${contentType} method=http url=${finalUrl}`);

    // 2. Thử cào qua HTTP trước
    let result: VideoItem | null = null;
    try {
      if (platform === 'tiktok') {
        result = await this.scrapeTikTokHttp(finalUrl, stt);
      } else if (platform === 'facebook') {
        result = await this.scrapeFacebookHttp(finalUrl, stt, 0, cookieSlotId);
      }
    } catch (httpErr: unknown) {
      const msg = httpErr instanceof Error ? httpErr.message : String(httpErr);
      this.logger.warn(`[SCRAPER:HTTP_ERROR] url=${finalUrl} error=${msg}`);
    }

    // 3. Đánh giá chất lượng dữ liệu HTTP
    const validation = this.validateScrapeResult(result, platform, contentType);

    // Đối với Facebook: nếu cào HTTP mà toàn bộ tương tác đều bằng 0 (metrics = 0)
    // thì HTTP CHƯA ĐƯỢC coi là đủ (vì Facebook thường hoãn render tương tác sang client-side GraphQL).
    const isFacebookZeroMetrics = platform === 'facebook' && !validation.hasValidMetrics;

    if (result && validation.valid && validation.confidence >= 50 && !isFacebookZeroMetrics) {
      result.crawlStatus = 'SCRAPE_SUCCESS';
      result.confidence = validation.confidence;
      this.logger.log(
        `[SCRAPER:SUCCESS] platform=${platform} type=${contentType} method=http postId=${result.postId || 'N/A'} author="${result.nguoiDang}" confidence=${validation.confidence}`
      );
      return this.finalizeVideoItem(result, finalUrl);
    }

    if (isFacebookZeroMetrics && !validation.fallbackReason) {
      validation.fallbackReason = 'facebook_zero_metrics_require_browser';
    }

    // 4. Fallback sang Playwright Browser nếu dữ liệu HTTP không đủ hoặc nghi ngờ
    this.logger.log(
      `[SCRAPER:FALLBACK] reason=${validation.fallbackReason || 'insufficient_confidence'} missing=[${validation.missingFields.join(',')}] confidence=${validation.confidence} from=http to=playwright url=${finalUrl}`
    );

    let browserResult: VideoItem | null = null;
    try {
      browserResult = await this.scrapeWithBrowser(finalUrl, stt, cookieSlotId);
    } catch (browserErr: unknown) {
      const errMsg = browserErr instanceof Error ? browserErr.message : String(browserErr);
      this.logger.warn(`[SCRAPER:PLAYWRIGHT_ERROR] url=${finalUrl} error=${errMsg}`);
      if (result) {
        result.crawlStatus = 'PARTIAL_SUCCESS';
        result.fallbackReason = `playwright_failed: ${errMsg}`;
        return this.finalizeVideoItem(result, finalUrl);
      }
      throw browserErr;
    }

    const mergedResult = result ? this.mergeScrapeResults(result, browserResult) : browserResult;
    const browserValidation = this.validateScrapeResult(mergedResult, platform, contentType);
    mergedResult.confidence = browserValidation.confidence;
    mergedResult.crawlStatus = browserValidation.valid ? 'FALLBACK_SUCCESS' : 'PARTIAL_SUCCESS';
    mergedResult.fallbackReason = validation.fallbackReason;
    mergedResult.missingFields = browserValidation.missingFields;

    this.logger.log(
      `[SCRAPER:DONE] platform=${platform} type=${contentType} method=playwright status=${mergedResult.crawlStatus} postId=${mergedResult.postId || 'N/A'} author="${mergedResult.nguoiDang}" confidence=${browserValidation.confidence}`
    );

    return this.finalizeVideoItem(mergedResult, finalUrl);
  }
}
