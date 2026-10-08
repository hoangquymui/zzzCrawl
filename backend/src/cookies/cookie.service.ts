import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { chromium, Browser, BrowserContext } from 'playwright';
import { DatabaseService } from '../database/database.service';
import { VideosGateway } from '../videos/videos.gateway';

export interface ParsedCookieItem {
  name: string;
  value: string;
  domain: string;
  path: string;
  sameSite?: 'Strict' | 'Lax' | 'None';
  httpOnly?: boolean;
  secure?: boolean;
  expires?: number;
}

export interface CookieCheckResult {
  isValid: boolean;
  status: 'VALID' | 'EXPIRED' | 'MISSING' | 'ERROR';
  message: string;
  cUser?: string;
  userName?: string;
  checkedAt: string;
}

export interface CookieSlot {
  id: number; // 1, 2, 3, 4, 5
  name: string; // 'Cookie 1', 'Cookie 2', ...
  enabled: boolean;
  rawCookie: string;
  cookieCount: number;
  detectedCookies: {
    c_user?: string;
    xs?: string;
    fr?: string;
    datr?: string;
  };
  updatedAt?: string;
  lastCheck?: CookieCheckResult;
}

export interface CookieSlotsResponse {
  slots: CookieSlot[];
  activeCount: number;
  activeSlotIds: number[];
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
  slots?: CookieSlot[];
  activeCount?: number;
}

@Injectable()
export class CookieService implements OnModuleInit {
  private readonly logger = new Logger(CookieService.name);
  private roundRobinIndex = 0;
  private activeLoginSessions = new Map<
    number,
    { browser: Browser; isClosed: boolean }
  >();

  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => VideosGateway))
    private readonly videosGateway?: VideosGateway
  ) {
    this.initSlots();
  }

  public onModuleInit(): void {
    this.initSlots();
  }

  public getEffectiveCookiePath(): string {
    const baseDir = process.cwd().endsWith('backend')
      ? process.cwd()
      : fs.existsSync(path.join(process.cwd(), 'backend'))
      ? path.join(process.cwd(), 'backend')
      : process.cwd();

    const dataPath = path.join(baseDir, 'data', 'cookies.json');
    if (fs.existsSync(dataPath)) return dataPath;

    const legacyPath = path.join(baseDir, 'cookies.json');
    if (fs.existsSync(legacyPath)) return legacyPath;

    const dataDir = path.join(baseDir, 'data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch {}
    }
    return dataPath;
  }

  /**
   * Phân tích chuỗi cookie (JSON hoặc header string) ra mảng Playwright cookie
   */
  public parseCookiesFromRaw(rawCookie: string): ParsedCookieItem[] {
    const raw = (rawCookie || '').trim();
    if (!raw || raw === '[]' || raw === '{}') return [];

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object' && 'name' in c && 'value' in c))
          .map((c) => {
            let domain = (c.domain as string) || '.facebook.com';
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
            const item: ParsedCookieItem = {
              name: String(c.name).trim(),
              value: String(c.value).trim(),
              domain,
              path: (c.path as string) || '/',
            };
            if (sameSite) item.sameSite = sameSite;
            if (typeof c.httpOnly === 'boolean') item.httpOnly = c.httpOnly;
            if (typeof c.secure === 'boolean') item.secure = c.secure;
            const exp =
              typeof c.expires === 'number' && c.expires > 0
                ? c.expires
                : typeof (c as Record<string, unknown>).expirationDate === 'number' &&
                  ((c as Record<string, unknown>).expirationDate as number) > 0
                ? ((c as Record<string, unknown>).expirationDate as number)
                : undefined;
            if (exp !== undefined) {
              const expSec = Math.floor(exp);
              const nowSec = Math.floor(Date.now() / 1000);
              if (expSec < nowSec) {
                return null;
              }
              item.expires = expSec;
            }
            return item;
          })
          .filter((c): c is ParsedCookieItem => c !== null);
      }
    } catch {
      // Chuỗi dạng name=val; name2=val2
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
      .filter((c): c is ParsedCookieItem => c !== null);
  }

  /**
   * Trích xuất các trường cookie quan trọng (c_user, xs, fr, datr)
   */
  public extractDetectedCookies(cookies: ParsedCookieItem[]): CookieSlot['detectedCookies'] {
    const detected: CookieSlot['detectedCookies'] = {};
    if (!Array.isArray(cookies)) return detected;
    for (const c of cookies) {
      if (c.name === 'c_user') detected.c_user = c.value;
      if (c.name === 'xs') detected.xs = c.value ? `${c.value.substring(0, 8)}...` : undefined;
      if (c.name === 'fr') detected.fr = c.value ? `${c.value.substring(0, 8)}...` : undefined;
      if (c.name === 'datr') detected.datr = c.value ? `${c.value.substring(0, 8)}...` : undefined;
    }
    return detected;
  }

  /**
   * Khởi tạo và bảo đảm luôn có đủ 5 slots cookie (1..5)
   */
  public initSlots(): CookieSlot[] {
    let slots = this.db.getCookieSlots() as CookieSlot[] | null;

    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      slots = [];
    }

    // Đọc cookie legacy từ SQLite hoặc file cookies.json cho Slot 1
    const legacyDbCookie = (this.db.getCookie() || '').trim();
    const filePath = this.getEffectiveCookiePath();
    let legacyFileCookie = '';
    if (fs.existsSync(filePath)) {
      try {
        legacyFileCookie = fs.readFileSync(filePath, 'utf8').trim();
      } catch {}
    }
    const legacyCookie = legacyDbCookie || legacyFileCookie || '';
    const legacyLastCheck = this.db.getCookieLastCheck();

    // Đảm bảo đủ 5 slots (id từ 1 đến 5)
    for (let i = 1; i <= 5; i++) {
      let existing = slots.find((s) => s.id === i);
      if (!existing) {
        let rawCookie = '';
        let enabled = false;
        let lastCheck: CookieCheckResult | undefined = undefined;

        // Nếu là slot 1 và là lần đầu tạo slots, nạp cookie hiện tại
        if (i === 1 && legacyCookie && legacyCookie !== '[]' && legacyCookie !== '{}') {
          rawCookie = legacyCookie;
          enabled = true;
          lastCheck = legacyLastCheck || undefined;
        }

        const parsed = this.parseCookiesFromRaw(rawCookie);
        const detected = this.extractDetectedCookies(parsed);

        existing = {
          id: i,
          name: `Cookie ${i}`,
          enabled,
          rawCookie,
          cookieCount: parsed.length,
          detectedCookies: detected,
          updatedAt: rawCookie ? new Date().toISOString() : undefined,
          lastCheck,
        };
        slots.push(existing);
      } else {
        existing.name = existing.name || `Cookie ${i}`;
        existing.enabled = Boolean(existing.enabled);
        existing.rawCookie = existing.rawCookie || '';
        const parsed = this.parseCookiesFromRaw(existing.rawCookie);
        existing.cookieCount = parsed.length;
        existing.detectedCookies = this.extractDetectedCookies(parsed);
      }
    }

    // Sắp xếp theo ID 1..5
    slots.sort((a, b) => a.id - b.id);
    this.db.saveCookieSlots(slots);

    // Đồng bộ cookie của slot đầu tiên đang bật ra file cookies.json
    this.syncActiveCookieToFile(slots);

    return slots;
  }

  /**
   * Đồng bộ cookie ra file cookies.json (để các công cụ đọc tệp trực tiếp vẫn chạy bình thường)
   */
  private syncActiveCookieToFile(slots?: CookieSlot[]): void {
    try {
      const currentSlots = slots || (this.db.getCookieSlots() as CookieSlot[]) || [];
      const activeSlot = currentSlots.find((s) => s.enabled && s.rawCookie && s.cookieCount > 0) || currentSlots[0];
      const filePath = this.getEffectiveCookiePath();
      const contentToSync = activeSlot?.rawCookie ? activeSlot.rawCookie.trim() : '[]';

      fs.writeFileSync(filePath, contentToSync, 'utf8');
      if (activeSlot && activeSlot.rawCookie) {
        this.db.saveCookie(activeSlot.rawCookie);
      }
    } catch (err: unknown) {
      this.logger.warn(`[CookieService] Không thể đồng bộ tệp cookies.json: ${(err as Error)?.message}`);
    }
  }

  /**
   * Lấy danh sách toàn bộ 5 slots cookie
   */
  public getCookieSlots(): CookieSlotsResponse {
    const slots = this.initSlots();
    const activeSlots = slots.filter((s) => s.enabled && s.rawCookie && s.cookieCount > 0);
    return {
      slots,
      activeCount: activeSlots.length,
      activeSlotIds: activeSlots.map((s) => s.id),
    };
  }

  /**
   * Lấy thông tin 1 slot theo id
   */
  public getSlot(slotId: number): CookieSlot {
    const slots = this.initSlots();
    const slot = slots.find((s) => s.id === Number(slotId));
    if (!slot) {
      throw new BadRequestException(`Không tìm thấy slot cookie ${slotId} (hỗ trợ 1 đến 5).`);
    }
    return slot;
  }

  /**
   * Kiểm tra xem UID Facebook (c_user) có bị trùng với slot nào khác không
   */
  public checkDuplicateCUser(slots: CookieSlot[], targetSlotId: number, cUser?: string): void {
    if (!cUser) return;
    const cleanUid = String(cUser).trim();
    const duplicateSlot = slots.find(
      (s) => s.id !== targetSlotId && s.detectedCookies?.c_user && String(s.detectedCookies.c_user).trim() === cleanUid
    );
    if (duplicateSlot) {
      throw new BadRequestException(
        `Tài khoản Facebook này (UID: ${cleanUid}) đã tồn tại ở Cookie ${duplicateSlot.id}. Các cookie không được trùng nhau!`
      );
    }
  }

  /**
   * Lưu nội dung cookie cho 1 slot
   */
  public saveCookieSlot(slotId: number, content: string, enabled?: boolean): CookieSlot {
    const id = Number(slotId);
    if (id < 1 || id > 5) {
      throw new BadRequestException('Slot cookie không hợp lệ (chỉ hỗ trợ slot từ 1 đến 5).');
    }

    const slots = this.initSlots();
    const slotIndex = slots.findIndex((s) => s.id === id);
    if (slotIndex === -1) {
      throw new BadRequestException(`Không tìm thấy Cookie ${id}`);
    }

    const clean = (content || '').trim();
    const parsed = this.parseCookiesFromRaw(clean);
    const detected = this.extractDetectedCookies(parsed);

    // Kiểm tra không được trùng UID c_user với các cookie slot khác
    if (detected.c_user) {
      this.checkDuplicateCUser(slots, id, detected.c_user);
    }

    const slot = slots[slotIndex];
    slot.rawCookie = clean;
    slot.cookieCount = parsed.length;
    slot.detectedCookies = detected;
    slot.updatedAt = new Date().toISOString();
    slot.lastCheck = undefined; // reset kết quả check cũ
    if (typeof enabled === 'boolean') {
      slot.enabled = enabled;
    } else {
      // Mặc định bật nếu có cookie hợp lệ
      slot.enabled = parsed.length > 0;
    }

    this.db.saveCookieSlots(slots);
    this.syncActiveCookieToFile(slots);

    this.logger.log(
      `[CookieService] Đã lưu Cookie ${id} (${slot.cookieCount} cookies, UID: ${detected.c_user || 'N/A'}, Bật: ${slot.enabled})`
    );

    return slot;
  }

  /**
   * Bật / Tắt trạng thái hoạt động của 1 slot cookie
   */
  public toggleCookieSlot(slotId: number, enabled: boolean): CookieSlot {
    const id = Number(slotId);
    const slots = this.initSlots();
    const slot = slots.find((s) => s.id === id);
    if (!slot) {
      throw new BadRequestException(`Không tìm thấy Cookie ${id}`);
    }

    slot.enabled = Boolean(enabled);
    this.db.saveCookieSlots(slots);
    this.syncActiveCookieToFile(slots);

    this.logger.log(`[CookieService] Đã chuyển Cookie ${id} sang trạng thái: ${slot.enabled ? 'BẬT' : 'TẮT'}`);
    return slot;
  }

  /**
   * Xóa nội dung của 1 slot cookie
   */
  public clearCookieSlot(slotId: number): CookieSlot {
    const id = Number(slotId);
    const slots = this.initSlots();
    const slot = slots.find((s) => s.id === id);
    if (!slot) {
      throw new BadRequestException(`Không tìm thấy Cookie ${id}`);
    }

    slot.rawCookie = '';
    slot.cookieCount = 0;
    slot.detectedCookies = {};
    slot.enabled = false;
    slot.lastCheck = undefined;
    slot.updatedAt = new Date().toISOString();

    this.db.saveCookieSlots(slots);
    this.syncActiveCookieToFile(slots);

    this.logger.log(`[CookieService] Đã làm trống Cookie ${id}`);
    return slot;
  }

  /**
   * Cơ chế luân phiên Round-Robin:
   * Lấy slot tiếp theo trong danh sách các cookie đang BẬT và có cookie hợp lệ
   */
  public getNextActiveCookieSlot(): CookieSlot | null {
    const response = this.getCookieSlots();
    const activeSlots = response.slots.filter((s) => s.enabled && s.rawCookie && s.cookieCount > 0);

    if (activeSlots.length === 0) {
      return null;
    }

    const slot = activeSlots[this.roundRobinIndex % activeSlots.length];
    this.roundRobinIndex++;

    this.logger.log(
      `[CookieService] 🔄 Luân phiên sử dụng [${slot.name}] (UID: ${slot.detectedCookies?.c_user || 'N/A'}) - Lượt xoay vòng #${this.roundRobinIndex} (Đang bật ${activeSlots.length}/5 cookie)`
    );

    return slot;
  }

  /**
   * Trả về mảng cookies cho trình duyệt Playwright hoặc HTTP fetch.
   * Tự động luân phiên Round-Robin qua các Cookie đang BẬT!
   */
  public loadCookies(slotId?: number): ParsedCookieItem[] {
    let activeSlot: CookieSlot | null = null;
    if (typeof slotId === 'number' && slotId >= 1 && slotId <= 5) {
      const slots = this.initSlots();
      activeSlot = slots.find((s) => s.id === slotId && s.enabled && s.rawCookie && s.cookieCount > 0) || null;
    }

    if (!activeSlot) {
      activeSlot = this.getNextActiveCookieSlot();
    }

    if (activeSlot && activeSlot.rawCookie) {
      const parsed = this.parseCookiesFromRaw(activeSlot.rawCookie);
      if (parsed.length > 0) return parsed;
    }

    // Fallback: nếu không có slot nào bật, thử nạp từ slot 1 hoặc tệp cookies.json
    const slots = this.initSlots();
    for (const slot of slots) {
      if (slot.rawCookie) {
        const parsed = this.parseCookiesFromRaw(slot.rawCookie);
        if (parsed.length > 0) return parsed;
      }
    }

    const filePath = this.getEffectiveCookiePath();
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8').trim();
        return this.parseCookiesFromRaw(raw);
      } catch {}
    }

    return [];
  }

  /**
   * Trả về chuỗi Header Cookie luân phiên
   */
  public getCookieString(slotId?: number): string {
    const cookies = this.loadCookies(slotId);
    if (!cookies || cookies.length === 0) return '';
    const essential = ['c_user', 'xs', 'datr', 'fr', 'sb'];
    return cookies
      .filter((c) => c && c.name && c.value && (essential.includes(c.name) || cookies.length <= 15))
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
  }

  /**
   * Phương thức tương thích ngược với API cũ (trả về thông tin cookie)
   */
  public getCookieInfo(targetSlotId = 1): CookieInfo {
    const response = this.getCookieSlots();
    const slot = response.slots.find((s) => s.id === targetSlotId) || response.slots[0];
    const cookies = this.parseCookiesFromRaw(slot?.rawCookie || '');

    return {
      hasCookie: cookies.length > 0,
      cookieCount: cookies.length,
      rawCookie: slot?.rawCookie || '',
      detectedCookies: slot?.detectedCookies || this.extractDetectedCookies(cookies),
      filePath: this.getEffectiveCookiePath(),
      updatedAt: slot?.updatedAt,
      lastCheck: slot?.lastCheck,
      slots: response.slots,
      activeCount: response.activeCount,
    };
  }

  public saveCookie(content: string): CookieInfo {
    this.saveCookieSlot(1, content);
    return this.getCookieInfo(1);
  }

  public clearCookie(): CookieInfo {
    this.clearCookieSlot(1);
    return this.getCookieInfo(1);
  }

  /**
   * Đường nhanh: kiểm tra phiên đăng nhập bằng HTTPS Request (không mở trình duyệt, ~1s).
   */
  private async checkCookieValidityHttp(
    cookies: ParsedCookieItem[],
    cUser: string
  ): Promise<CookieCheckResult | null> {
    try {
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
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

      return null;
    } catch (err: unknown) {
      this.logger.warn(
        `[CookieService] Kiểm tra qua HTTPS Request không thành công, chuyển sang trình duyệt: ${(err as Error)?.message}`
      );
      return null;
    }
  }

  /**
   * Kiểm tra tính hợp lệ của cookie trong 1 slot cụ thể
   */
  public async checkCookieSlotValidity(slotId = 1): Promise<CookieCheckResult> {
    const slot = this.getSlot(slotId);
    const cookies = this.parseCookiesFromRaw(slot.rawCookie);
    const cUser = cookies.find((c) => c.name === 'c_user')?.value;
    const xs = cookies.find((c) => c.name === 'xs')?.value;

    if (!cookies.length || !cUser || !xs) {
      const res: CookieCheckResult = {
        isValid: false,
        status: 'MISSING',
        message: `Cookie ${slotId}: Chưa nạp cookie hoặc thiếu trường c_user / xs quan trọng của Facebook.`,
        checkedAt: new Date().toISOString(),
      };
      this.updateSlotLastCheck(slotId, res);
      return res;
    }

    // 1. Kiểm tra nhanh bằng HTTPS Request
    const httpResult = await this.checkCookieValidityHttp(cookies, cUser);
    if (httpResult) {
      this.updateSlotLastCheck(slotId, httpResult);
      return httpResult;
    }

    // 2. Fallback sang mở trình duyệt Playwright
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
          ? `Cookie ${slotId} còn hạn! Đang đăng nhập tài khoản Facebook${evalResult.userName ? `: ${evalResult.userName}` : ''} (UID: ${cUser}).`
          : `Cookie ${slotId} đã hết hạn hoặc phiên đăng nhập bị hủy (${evalResult.isReLoginPrompt ? 'Facebook yêu cầu đăng nhập lại' : 'Bị điều hướng sang trang đăng nhập'}).`,
        checkedAt: new Date().toISOString(),
      };

      this.updateSlotLastCheck(slotId, res);
      return res;
    } catch (err: unknown) {
      const errMsg = (err as Error)?.message || String(err);
      this.logger.error(`Lỗi kiểm tra Cookie ${slotId}: ${errMsg}`);
      const res: CookieCheckResult = {
        isValid: false,
        status: 'ERROR',
        message: `Lỗi kết nối khi kiểm tra Cookie ${slotId}: ${errMsg}`,
        checkedAt: new Date().toISOString(),
      };
      this.updateSlotLastCheck(slotId, res);
      return res;
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  public async checkCookieValidity(): Promise<CookieCheckResult> {
    const slotsResponse = this.getCookieSlots();
    const firstActive = slotsResponse.slots.find((s) => s.enabled && s.cookieCount > 0) || slotsResponse.slots[0];
    return await this.checkCookieSlotValidity(firstActive.id);
  }

  private updateSlotLastCheck(slotId: number, result: CookieCheckResult): void {
    const slots = this.initSlots();
    const slot = slots.find((s) => s.id === slotId);
    if (slot) {
      slot.lastCheck = result;
      this.db.saveCookieSlots(slots);
      if (slotId === 1) {
        this.db.saveCookieLastCheck(result);
      }
    }
  }

  /**
   * Tự động kiểm tra cookie trước khi crawl.
   * Phải có ít nhất 1 Cookie đang BẬT và có nội dung.
   */
  public async validateCookieForCrawl(force = false): Promise<void> {
    const { slots, activeCount } = this.getCookieSlots();
    const activeSlots = slots.filter((s) => s.enabled && s.rawCookie && s.cookieCount > 0);

    if (activeCount === 0 || activeSlots.length === 0) {
      throw new BadRequestException(
        'Chưa có Cookie nào được BẬT! Vui lòng vào trang Quản lý Cookie để bật ít nhất 1 Cookie trước khi cào dữ liệu.'
      );
    }

    // Kiểm tra xem các slot đang bật có cái nào còn hạn không
    const checkedValidSlots = activeSlots.filter((s) => s.lastCheck && s.lastCheck.isValid);
    if (!force && checkedValidSlots.length > 0) {
      // Có ít nhất 1 cookie đã xác thực hợp lệ
      return;
    }

    // Nếu force hoặc chưa có slot nào được check thành công: kiểm tra slot đang bật đầu tiên
    const targetSlot = activeSlots[0];
    const checkRes = await this.checkCookieSlotValidity(targetSlot.id);
    if (!checkRes || !checkRes.isValid) {
      // Nếu slot đầu tiên lỗi nhưng còn slot bật khác, kiểm tra tiếp
      for (let i = 1; i < activeSlots.length; i++) {
        const nextRes = await this.checkCookieSlotValidity(activeSlots[i].id);
        if (nextRes && nextRes.isValid) return;
      }
      throw new BadRequestException(
        `Cookie [${targetSlot.name}] đã hết hạn hoặc không hợp lệ. Vui lòng cập nhật Cookie mới!`
      );
    }
  }

  // ===========================================================================
  // INTERACTIVE BROWSER LOGIN: MỞ TRÌNH DUYỆT THẬT VÀ TỰ ĐỘNG BÓC TÁCH COOKIE
  // ===========================================================================

  /**
   * Khởi chạy trình duyệt thật (headless: false) để người dùng tự đăng nhập Facebook.
   * Khi đăng nhập thành công, hệ thống tự động bóc tách cookie, kiểm tra chống trùng UID, lưu slot và tự đóng trình duyệt.
   */
  public async startBrowserLogin(slotId: number): Promise<{ success: boolean; message: string }> {
    const id = Number(slotId);
    if (id < 1 || id > 5) {
      throw new BadRequestException('Slot cookie không hợp lệ (1..5).');
    }

    // Đóng phiên đăng nhập cũ nếu có
    if (this.activeLoginSessions.size > 0) {
      for (const [sId, sess] of this.activeLoginSessions.entries()) {
        try {
          if (!sess.isClosed) {
            sess.isClosed = true;
            await sess.browser.close().catch(() => {});
          }
        } catch {}
        this.activeLoginSessions.delete(sId);
      }
    }

    const slot = this.getSlot(id);
    this.logger.log(`[CookieService] 🌐 Khởi chạy trình duyệt đăng nhập Facebook cho [${slot.name}]...`);

    this.videosGateway?.emitCookieLoginEvent({
      slotId: id,
      status: 'OPENING',
      message: `Đang mở cửa sổ trình duyệt cho ${slot.name}...`,
    });

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        headless: false,
        args: [
          '--disable-notifications',
          '--no-default-browser-check',
          '--disable-blink-features=AutomationControlled',
        ],
      });

      const sessionObj = { browser, isClosed: false };
      this.activeLoginSessions.set(id, sessionObj);

      browser.on('disconnected', () => {
        if (!sessionObj.isClosed) {
          sessionObj.isClosed = true;
          this.activeLoginSessions.delete(id);
          this.logger.log(`[CookieService] Cửa sổ trình duyệt cho Cookie ${id} đã được đóng.`);
          this.videosGateway?.emitCookieLoginEvent({
            slotId: id,
            status: 'CANCELLED',
            message: `Cửa sổ đăng nhập Cookie ${id} đã đóng.`,
          });
        }
      });

      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        locale: 'vi-VN',
      });

      const page = await context.newPage();

      this.videosGateway?.emitCookieLoginEvent({
        slotId: id,
        status: 'WAITING_LOGIN',
        message: `Vui lòng đăng nhập tài khoản Facebook trên cửa sổ vừa mở. Hệ thống sẽ tự động bắt cookie và đóng lại khi thành công.`,
      });

      await page.goto('https://www.facebook.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      }).catch(() => {});

      // Chạy vòng lặp ngầm giám sát trạng thái đăng nhập
      this.monitorBrowserLogin(id, context, sessionObj);

      return {
        success: true,
        message: `Đã mở cửa sổ trình duyệt đăng nhập cho ${slot.name}. Vui lòng đăng nhập trên cửa sổ Chrome vừa xuất hiện.`,
      };
    } catch (err: unknown) {
      if (browser) {
        await browser.close().catch(() => {});
      }
      this.activeLoginSessions.delete(id);
      const errMsg = (err as Error)?.message || String(err);
      this.logger.error(`[CookieService] Lỗi khi mở trình duyệt đăng nhập: ${errMsg}`);
      this.videosGateway?.emitCookieLoginEvent({
        slotId: id,
        status: 'ERROR',
        message: `Không thể mở trình duyệt: ${errMsg}`,
        error: errMsg,
      });
      throw new BadRequestException(`Không thể mở trình duyệt: ${errMsg}`);
    }
  }

  /**
   * Vòng lặp ngầm giám sát việc người dùng đăng nhập thành công vào Facebook
   */
  private monitorBrowserLogin(
    slotId: number,
    context: BrowserContext,
    sessionObj: { browser: Browser; isClosed: boolean }
  ): void {
    const maxWaitSeconds = 180; // 3 phút tối đa
    const checkIntervalMs = 1500;
    const startTime = Date.now();

    const intervalId = setInterval(async () => {
      if (sessionObj.isClosed) {
        clearInterval(intervalId);
        return;
      }

      // Quá thời gian timeout (3 phút)
      if (Date.now() - startTime > maxWaitSeconds * 1000) {
        clearInterval(intervalId);
        if (!sessionObj.isClosed) {
          sessionObj.isClosed = true;
          this.activeLoginSessions.delete(slotId);
          await sessionObj.browser.close().catch(() => {});
          this.logger.warn(`[CookieService] Hết thời gian chờ đăng nhập (3 phút) cho Cookie ${slotId}.`);
          this.videosGateway?.emitCookieLoginEvent({
            slotId,
            status: 'ERROR',
            message: 'Đã hết thời gian chờ đăng nhập (3 phút). Vui lòng thử lại.',
          });
        }
        return;
      }

      try {
        const cookies = await context.cookies();
        const cUserCookie = cookies.find((c) => c.name === 'c_user');
        const xsCookie = cookies.find((c) => c.name === 'xs');

        // Khi có cả c_user và xs -> Người dùng đã đăng nhập thành công!
        if (cUserCookie && cUserCookie.value && xsCookie && xsCookie.value) {
          clearInterval(intervalId);

          const cUser = String(cUserCookie.value).trim();
          this.logger.log(`[CookieService] ✅ Phát hiện đăng nhập thành công UID: ${cUser} cho Cookie ${slotId}!`);

          // 1. Kiểm tra chống trùng lặp với các slot khác
          const slots = this.getCookieSlots().slots;
          const duplicateSlot = slots.find(
            (s) => s.id !== slotId && s.detectedCookies?.c_user && String(s.detectedCookies.c_user).trim() === cUser
          );

          if (duplicateSlot) {
            sessionObj.isClosed = true;
            this.activeLoginSessions.delete(slotId);
            await sessionObj.browser.close().catch(() => {});

            this.logger.warn(`[CookieService] ❌ Trùng lặp UID ${cUser} với Cookie ${duplicateSlot.id}!`);
            this.videosGateway?.emitCookieLoginEvent({
              slotId,
              status: 'ERROR',
              message: `❌ Trùng lặp tài khoản: Tài khoản này (UID: ${cUser}) đã được sử dụng ở Cookie ${duplicateSlot.id}. Các cookie không được trùng nhau!`,
            });
            return;
          }

          // 2. Định dạng lại cookies sang JSON chuẩn
          const formattedCookies = cookies.map((c) => ({
            domain: c.domain,
            expirationDate: c.expires > 0 ? c.expires : undefined,
            hostOnly: !c.domain.startsWith('.'),
            httpOnly: c.httpOnly,
            name: c.name,
            path: c.path,
            sameSite: c.sameSite,
            secure: c.secure,
            session: c.expires <= 0,
            value: c.value,
          }));

          const rawCookieJson = JSON.stringify(formattedCookies, null, 2);

          // 3. Lưu vào Cookie Slot và tự động BẬT
          const updatedSlot = this.saveCookieSlot(slotId, rawCookieJson, true);

          // 4. Bắn sự kiện thành công tới Client
          this.videosGateway?.emitCookieLoginEvent({
            slotId,
            status: 'SUCCESS',
            message: `🎉 Đăng nhập thành công tài khoản Facebook (UID: ${cUser})! Đã tự động lưu vào Cookie ${slotId} và kích hoạt sẵn sàng.`,
            slot: updatedSlot,
          });

          // Đợi 1.2 giây để người dùng thấy thông báo rồi tự động đóng trình duyệt
          setTimeout(async () => {
            if (!sessionObj.isClosed) {
              sessionObj.isClosed = true;
              this.activeLoginSessions.delete(slotId);
              await sessionObj.browser.close().catch(() => {});
            }
          }, 1200);
        }
      } catch (err: unknown) {
        const errMsg = (err as Error)?.message || '';
        if (errMsg.includes('Target page, context or browser has been closed') ||
            errMsg.includes('Browser has been closed')) {
          clearInterval(intervalId);
          sessionObj.isClosed = true;
          this.activeLoginSessions.delete(slotId);
        }
      }
    }, checkIntervalMs);
  }

  /**
   * Hủy phiên đăng nhập trình duyệt
   */
  public async cancelBrowserLogin(slotId: number): Promise<{ success: boolean; message: string }> {
    const id = Number(slotId);
    const sess = this.activeLoginSessions.get(id);
    if (sess && !sess.isClosed) {
      sess.isClosed = true;
      this.activeLoginSessions.delete(id);
      await sess.browser.close().catch(() => {});
      this.videosGateway?.emitCookieLoginEvent({
        slotId: id,
        status: 'CANCELLED',
        message: `Đã hủy phiên đăng nhập Cookie ${id}.`,
      });
      return { success: true, message: `Đã hủy đăng nhập cho Cookie ${id}.` };
    }
    return { success: true, message: 'Không có phiên đăng nhập nào đang hoạt động.' };
  }
}
