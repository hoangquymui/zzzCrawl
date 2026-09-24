import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { DatabaseService } from '../database/database.service';

export interface CookieCheckResult {
  isValid: boolean;
  status: 'VALID' | 'EXPIRED' | 'MISSING' | 'ERROR';
  message: string;
  cUser?: string;
  userName?: string;
  checkedAt: string;
}

export interface CookieInfo {
  hasCookie: boolean;
  cookieCount: number;
  rawCookie: string;
  detectedCookies: {
    c_user?: string;
    xs?: string;
    fr?: string;
    datr?: string;
  };
  filePath: string;
  updatedAt?: string;
  lastCheck?: CookieCheckResult;
}

@Injectable()
export class CookieService implements OnModuleInit {
  private readonly logger = new Logger(CookieService.name);
  private lastCheckResult?: CookieCheckResult;

  constructor(private readonly db: DatabaseService) {
    this.syncCookies();
  }

  public onModuleInit(): void {
    this.syncCookies();
  }

  public getEffectiveCookiePath(): string {
    if (process.cwd().endsWith('backend')) {
      return path.join(process.cwd(), 'cookies.json');
    }
    const backendPath = path.join(process.cwd(), 'backend', 'cookies.json');
    if (fs.existsSync(backendPath)) {
      return backendPath;
    }
    const rootPath = path.join(process.cwd(), 'cookies.json');
    if (fs.existsSync(rootPath)) {
      return rootPath;
    }
    // Mặc định tạo trong thư mục backend nếu có
    if (fs.existsSync(path.join(process.cwd(), 'backend'))) {
      return backendPath;
    }
    return rootPath;
  }

  /**
   * Tự động đồng bộ 2 chiều giữa CSDL SQLite và tệp cookies.json
   */
  public syncCookies(): void {
    const filePath = this.getEffectiveCookiePath();
    const dbMeta = this.db.getCookieWithMeta();
    const dbCookie = dbMeta ? (dbMeta.value || '').trim() : '';

    let fileCookie = '';
    let fileMtime = 0;

    if (fs.existsSync(filePath)) {
      try {
        fileCookie = fs.readFileSync(filePath, 'utf8').trim();
        fileMtime = fs.statSync(filePath).mtimeMs;
      } catch (e: any) {
        this.logger.warn(`Lỗi đọc file cookie khi đồng bộ: ${e?.message}`);
      }
    }

    const hasFileContent = fileCookie && fileCookie !== '[]' && fileCookie !== '{}';
    const hasDbContent = dbCookie && dbCookie !== '[]' && dbCookie !== '{}';

    // 1. Nếu SQLite chưa có mà file có -> Nạp từ file vào SQLite
    if (!hasDbContent && hasFileContent) {
      this.db.saveCookie(fileCookie);
      this.logger.log(`[CookieService] Đồng bộ Cookie từ tệp '${filePath}' vào SQLite.`);
    }
    // 2. Nếu SQLite có mà file chưa có hoặc rỗng -> Ghi từ SQLite ra tệp
    else if (hasDbContent && !hasFileContent) {
      try {
        fs.writeFileSync(filePath, dbCookie, 'utf8');
        this.logger.log(`[CookieService] Đồng bộ Cookie từ SQLite ra tệp '${filePath}'.`);
      } catch (e: any) {
        this.logger.error(`[CookieService] Lỗi ghi file cookie khi đồng bộ: ${e?.message}`);
      }
    }
    // 3. Nếu cả 2 đều có và nội dung khác nhau -> So sánh thời gian chỉnh sửa
    else if (hasDbContent && hasFileContent && fileCookie !== dbCookie) {
      const dbTime = dbMeta?.updatedAt ? new Date(dbMeta.updatedAt).getTime() : 0;
      if (fileMtime > dbTime) {
        this.db.saveCookie(fileCookie);
        this.logger.log(`[CookieService] Tệp cookies.json được sửa mới hơn, đã đồng bộ vào SQLite.`);
      } else {
        try {
          fs.writeFileSync(filePath, dbCookie, 'utf8');
          this.logger.log(`[CookieService] Cập nhật tệp cookies.json từ SQLite.`);
        } catch (e: any) {
          this.logger.error(`[CookieService] Lỗi đồng bộ SQLite ra tệp: ${e?.message}`);
        }
      }
    }
  }

  public loadCookies(): any[] {
    this.syncCookies();
    const filePath = this.getEffectiveCookiePath();

    let raw = '';
    if (fs.existsSync(filePath)) {
      try {
        raw = fs.readFileSync(filePath, 'utf8').trim();
      } catch {}
    }
    if (!raw) {
      raw = (this.db.getCookie() || '').trim();
    }

    if (!raw || raw === '[]' || raw === '{}') return [];

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter((c) => c && c.name && c.value)
          .map((c) => {
            let domain = c.domain || '.facebook.com';
            if (!domain.includes('facebook.com')) {
              domain = '.facebook.com';
            }
            let sameSite: 'Strict' | 'Lax' | 'None' | undefined = undefined;
            if (c.sameSite) {
              const s = String(c.sameSite).toLowerCase();
              if (s === 'lax') sameSite = 'Lax';
              else if (s === 'strict') sameSite = 'Strict';
              else if (s === 'none' || s === 'no_restriction') sameSite = 'None';
            }
            const item: any = {
              name: String(c.name).trim(),
              value: String(c.value).trim(),
              domain,
              path: c.path || '/',
            };
            if (sameSite) item.sameSite = sameSite;
            if (typeof c.httpOnly === 'boolean') item.httpOnly = c.httpOnly;
            if (typeof c.secure === 'boolean') item.secure = c.secure;
            if (typeof c.expires === 'number' && c.expires > 0) {
              item.expires = Math.floor(c.expires);
            }
            return item;
          });
      }
    } catch {
      // Fallback sang chuỗi cookie dạng key=val; key2=val2
    }

    return raw
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const eqIdx = p.indexOf('=');
        if (eqIdx === -1) return null;
        return {
          name: p.slice(0, eqIdx).trim(),
          value: p.slice(eqIdx + 1).trim(),
          domain: '.facebook.com',
          path: '/',
        };
      })
      .filter(Boolean);
  }

  public getCookieInfo(): CookieInfo {
    this.syncCookies();
    const filePath = this.getEffectiveCookiePath();
    let rawCookie = (this.db.getCookie() || '').trim();
    let updatedAt: string | undefined;

    const dbMeta = this.db.getCookieWithMeta();
    if (dbMeta && dbMeta.updatedAt) {
      updatedAt = dbMeta.updatedAt;
    } else if (fs.existsSync(filePath)) {
      try {
        const stat = fs.statSync(filePath);
        updatedAt = stat.mtime.toISOString();
      } catch {}
    }

    if (!rawCookie && fs.existsSync(filePath)) {
      try {
        rawCookie = fs.readFileSync(filePath, 'utf8').trim();
      } catch (err: any) {
        this.logger.error(`Lỗi đọc file cookie: ${err?.message}`);
      }
    }

    const cookies = this.loadCookies();
    const detectedCookies: CookieInfo['detectedCookies'] = {};

    cookies.forEach((c) => {
      if (c.name === 'c_user') detectedCookies.c_user = c.value;
      if (c.name === 'xs') detectedCookies.xs = c.value ? `${c.value.substring(0, 8)}...` : undefined;
      if (c.name === 'fr') detectedCookies.fr = c.value ? `${c.value.substring(0, 8)}...` : undefined;
      if (c.name === 'datr') detectedCookies.datr = c.value ? `${c.value.substring(0, 8)}...` : undefined;
    });

    const hasCookie = cookies.length > 0;
    const lastCheck = this.lastCheckResult || this.db.getCookieLastCheck();

    return {
      hasCookie,
      cookieCount: cookies.length,
      rawCookie,
      detectedCookies,
      filePath,
      updatedAt,
      lastCheck,
    };
  }

  public saveCookie(content: string): CookieInfo {
    const filePath = this.getEffectiveCookiePath();
    const clean = (content || '').trim();

    // 1. Lưu vào SQLite
    this.db.saveCookie(clean);

    // 2. Đồng bộ ra file cookies.json
    try {
      fs.writeFileSync(filePath, clean, 'utf8');
    } catch (err: any) {
      this.logger.error(`[CookieService] Lỗi ghi file cookies.json: ${err?.message}`);
    }

    this.lastCheckResult = undefined;
    this.logger.log(`[CookieService] Đã lưu cookie vào SQLite và đồng bộ tệp: ${filePath}`);
    return this.getCookieInfo();
  }

  public clearCookie(): CookieInfo {
    const filePath = this.getEffectiveCookiePath();

    // 1. Làm trống trong SQLite
    this.db.saveCookie('[]');

    // 2. Đồng bộ ra tệp cookies.json
    try {
      fs.writeFileSync(filePath, '[]', 'utf8');
    } catch (err: any) {
      this.logger.error(`[CookieService] Lỗi làm trống tệp cookies.json: ${err?.message}`);
    }

    this.lastCheckResult = undefined;
    this.logger.log(`[CookieService] Đã làm trống cookie trong SQLite và tệp: ${filePath}`);
    return this.getCookieInfo();
  }

  /**
   * Đường nhanh: kiểm tra phiên đăng nhập bằng HTTPS Request (không mở trình duyệt, ~1s).
   * Xác minh qua marker "USER_ID"/"actorID" trong HTML trang chủ Facebook.
   * Trả về null nếu không xác định rõ để caller fallback qua Playwright.
   */
  private async checkCookieValidityHttp(
    cookies: any[],
    cUser: string
  ): Promise<CookieCheckResult | null> {
    try {
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      // /me: còn phiên → trả về trang cá nhân chứa USER_ID; hết phiên → redirect sang trang đăng nhập
      const res = await fetch('https://www.facebook.com/me', {
        headers: {
          Cookie: cookieHeader,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
      const html = await res.text();
      const finalUrl = (res.url || '').toLowerCase();

      const redirectedToLogin =
        finalUrl.includes('login.php') ||
        finalUrl.includes('/login/') ||
        finalUrl.includes('/checkpoint/');
      const hasLoginWall =
        html.includes('Hãy đăng nhập hoặc đăng ký') || html.includes('login_form');
      const hasSession =
        html.includes(`"USER_ID":"${cUser}"`) || html.includes(`"actorID":"${cUser}"`);

      if (hasSession && !redirectedToLogin) {
        return {
          isValid: true,
          status: 'VALID',
          cUser,
          message: `Cookie còn hạn! Đang đăng nhập tài khoản Facebook (UID: ${cUser}).`,
          checkedAt: new Date().toISOString(),
        };
      }

      if (redirectedToLogin || hasLoginWall) {
        return {
          isValid: false,
          status: 'EXPIRED',
          cUser,
          message: `Cookie đã hết hạn hoặc phiên đăng nhập bị hủy (${redirectedToLogin ? 'Bị điều hướng sang trang đăng nhập' : 'Facebook hiển thị form đăng nhập'}).`,
          checkedAt: new Date().toISOString(),
        };
      }

      // HTML khác thường / không đủ marker → không kết luận được
      return null;
    } catch (err: any) {
      this.logger.warn(
        `[CookieService] Kiểm tra qua HTTPS Request không thành công, chuyển sang trình duyệt: ${err?.message}`
      );
      return null;
    }
  }

  public async checkCookieValidity(): Promise<CookieCheckResult> {
    const cookies = this.loadCookies();
    const cUser = cookies.find((c) => c.name === 'c_user')?.value;
    const xs = cookies.find((c) => c.name === 'xs')?.value;

    if (!cookies.length || !cUser || !xs) {
      const res: CookieCheckResult = {
        isValid: false,
        status: 'MISSING',
        message: 'Chưa nạp cookie hoặc thiếu trường c_user / xs quan trọng của Facebook.',
        checkedAt: new Date().toISOString(),
      };
      this.lastCheckResult = res;
      this.db.saveCookieLastCheck(res);
      return res;
    }

    // Ưu tiên đường HTTPS Request nhanh (~1s), chỉ mở trình duyệt khi không kết luận được
    const httpResult = await this.checkCookieValidityHttp(cookies, cUser);
    if (httpResult) {
      this.lastCheckResult = httpResult;
      this.db.saveCookieLastCheck(httpResult);
      return httpResult;
    }

    let browser = null;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--disable-notifications', '--no-sandbox', '--disable-gpu'],
      });

      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        locale: 'vi-VN',
      });

      await context.addCookies(cookies);
      const page = await context.newPage();

      await page.goto('https://www.facebook.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await page.waitForTimeout(2500);

      const evalResult = await page.evaluate((uid) => {
        const url = window.location.href.toLowerCase();
        const text = document.body ? document.body.innerText : '';

        const isLoginUrl =
          url.includes('/login') ||
          url.includes('login.php') ||
          url.includes('/checkpoint/') ||
          url.includes('/recover/');

        const hasAccountButton = Boolean(
          document.querySelector(
            '[aria-label="Tài khoản"], [aria-label="Account"], [aria-label="Trang cá nhân của bạn"], [aria-label="Your profile"]'
          )
        );

        const hasMeLink = Boolean(
          document.querySelector(
            `a[href*="/me/"], a[href*="${uid}"], a[href*="profile.php?id=${uid}"]`
          )
        );

        const isReLoginPrompt =
          text.includes('Dùng trang cá nhân khác') ||
          text.includes('Tiếp tục dưới tên') ||
          (text.includes('Mật khẩu') && text.includes('Đăng nhập')) ||
          text.includes('Hãy đăng nhập hoặc đăng ký');

        // Tìm tên hiển thị tài khoản
        let foundName = '';
        const allLinks = Array.from(document.querySelectorAll('a[role="link"], a[href*="/me/"]'));
        for (const l of allLinks) {
          const href = (l as HTMLAnchorElement).href || '';
          const t = ((l as HTMLElement).innerText || '').trim();
          if (
            (href.includes('/me/') || href.includes(uid)) &&
            t &&
            t.length >= 2 &&
            t.length < 50 &&
            !t.includes('\n') &&
            !t.toLowerCase().includes('facebook')
          ) {
            foundName = t;
            break;
          }
        }

        if (!foundName) {
          const profBtn = document.querySelector(
            '[aria-label="Trang cá nhân của bạn"], [aria-label="Your profile"]'
          );
          if (profBtn) {
            const t = (profBtn as HTMLElement).innerText?.trim();
            if (t && t.length < 50) foundName = t;
          }
        }

        return {
          isLoginUrl,
          hasAccountButton,
          hasMeLink,
          isReLoginPrompt,
          userName: foundName,
        };
      }, cUser);

      const isValid =
        !evalResult.isLoginUrl &&
        !evalResult.isReLoginPrompt &&
        (evalResult.hasAccountButton || evalResult.hasMeLink);

      const res: CookieCheckResult = {
        isValid,
        status: isValid ? 'VALID' : 'EXPIRED',
        cUser,
        userName: evalResult.userName || undefined,
        message: isValid
          ? `Cookie còn hạn! Đang đăng nhập tài khoản Facebook${evalResult.userName ? `: ${evalResult.userName}` : ''} (UID: ${cUser}).`
          : `Cookie đã hết hạn hoặc phiên đăng nhập bị hủy (${evalResult.isReLoginPrompt ? 'Facebook yêu cầu nhập lại mật khẩu / chọn tài khoản' : 'Bị điều hướng sang trang đăng nhập'}).`,
        checkedAt: new Date().toISOString(),
      };

      this.lastCheckResult = res;
      this.db.saveCookieLastCheck(res);
      return res;
    } catch (err: any) {
      this.logger.error(`Lỗi kiểm tra cookie: ${err?.message || String(err)}`);
      const res: CookieCheckResult = {
        isValid: false,
        status: 'ERROR',
        message: `Lỗi kết nối khi kiểm tra cookie: ${err?.message || String(err)}`,
        checkedAt: new Date().toISOString(),
      };
      this.lastCheckResult = res;
      this.db.saveCookieLastCheck(res);
      return res;
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }
}
