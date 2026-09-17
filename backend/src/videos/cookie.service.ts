import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';

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
export class CookieService {
  private readonly logger = new Logger(CookieService.name);
  private lastCheckResult?: CookieCheckResult;

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

  public loadCookies(): any[] {
    const filePath = this.getEffectiveCookiePath();
    if (!fs.existsSync(filePath)) return [];

    const raw = fs.readFileSync(filePath, 'utf8').trim();
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
    const filePath = this.getEffectiveCookiePath();
    let rawCookie = '';
    let updatedAt: string | undefined;

    if (fs.existsSync(filePath)) {
      try {
        rawCookie = fs.readFileSync(filePath, 'utf8').trim();
        const stat = fs.statSync(filePath);
        updatedAt = stat.mtime.toISOString();
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

    return {
      hasCookie,
      cookieCount: cookies.length,
      rawCookie,
      detectedCookies,
      filePath,
      updatedAt,
      lastCheck: this.lastCheckResult,
    };
  }

  public saveCookie(content: string): CookieInfo {
    const filePath = this.getEffectiveCookiePath();
    const clean = (content || '').trim();
    fs.writeFileSync(filePath, clean, 'utf8');
    this.lastCheckResult = undefined;
    this.logger.log(`[CookieService] Đã lưu cookie vào: ${filePath}`);
    return this.getCookieInfo();
  }

  public clearCookie(): CookieInfo {
    const filePath = this.getEffectiveCookiePath();
    fs.writeFileSync(filePath, '[]', 'utf8');
    this.lastCheckResult = undefined;
    this.logger.log(`[CookieService] Đã làm trống file cookie: ${filePath}`);
    return this.getCookieInfo();
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
      return res;
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
      return res;
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }
}
