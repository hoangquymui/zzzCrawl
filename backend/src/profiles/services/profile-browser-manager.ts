import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser, BrowserContext, Page, Response } from 'playwright';
import { CookieService, ParsedCookieItem } from '../../cookies/cookie.service';

@Injectable()
export class ProfileBrowserManager {
  private readonly logger = new Logger(ProfileBrowserManager.name);

  constructor(private readonly cookieService: CookieService) {}

  public async launchBrowser(): Promise<Browser> {
    this.logger.log('Khởi chạy trình duyệt Playwright Chromium...');
    return await chromium.launch({
      headless: true,
      args: [
        '--disable-notifications',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });
  }

  public async createContext(browser: Browser, cookies: ParsedCookieItem[] = []): Promise<BrowserContext> {
    const context: BrowserContext = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'vi-VN',
    });

    if (cookies.length > 0) {
      try {
        await context.addCookies(cookies);
      } catch (cookieErr: unknown) {
        this.logger.warn(`[CẢNH BÁO] Lỗi khi thêm cookie: ${(cookieErr as Error)?.message || String(cookieErr)}`);
      }
    }

    return context;
  }

  public async checkIfLoginRequired(page: Page): Promise<boolean> {
    try {
      const url = page.url().toLowerCase();
      if (url.includes('/login') || url.includes('login.php')) return true;
      const title = (await page.title()).toLowerCase();
      if (title.startsWith('đăng nhập') || title.startsWith('log in')) return true;

      const isLoginPrompt = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        return (
          text.includes('Hãy đăng nhập hoặc đăng ký Facebook') ||
          text.includes('Đăng nhập để xem thêm') ||
          text.includes('Dùng trang cá nhân khác') ||
          Boolean(document.querySelector('form[action*="login"]'))
        );
      });
      if (isLoginPrompt) return true;
    } catch {
      // Bỏ qua lỗi context
    }
    return false;
  }

  public async checkIfBlocked(page: Page, response?: Response | null): Promise<boolean> {
    if (response && (response.status() === 403 || response.status() === 429)) {
      return true;
    }
    const url = page.url().toLowerCase();
    if (url.includes('/checkpoint/') || url.includes('/security/') || url.includes('blocked')) {
      return true;
    }
    try {
      const title = (await page.title()).toLowerCase();
      if (
        title.includes('temporarily blocked') ||
        title.includes('bị chặn') ||
        title.includes('security check')
      ) {
        return true;
      }
    } catch {
      // Bỏ qua
    }
    return false;
  }

  public async dismissLoginModalIfPossible(page: Page): Promise<void> {
    try {
      const closeSelector =
        '[aria-label="Đóng"], [aria-label="Close"], div[role="button"][aria-label="Đóng"], div[role="button"][aria-label="Close"]';
      const closeBtn = await page.$(closeSelector);
      if (closeBtn) {
        await closeBtn.click();
        await page.waitForTimeout(1000);
      } else {
        await page.keyboard.press('Escape');
      }
    } catch {
      // Bỏ qua
    }
  }

  public async closeBrowser(browser: Browser | null): Promise<void> {
    if (browser) {
      try {
        await browser.close();
      } catch (err: unknown) {
        this.logger.warn(`Lỗi khi đóng browser: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}
