import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

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
}

@Injectable()
export class CookieService {
  private readonly logger = new Logger(CookieService.name);

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
    };
  }

  public saveCookie(content: string): CookieInfo {
    const filePath = this.getEffectiveCookiePath();
    const clean = (content || '').trim();
    fs.writeFileSync(filePath, clean, 'utf8');
    this.logger.log(`[CookieService] Đã lưu cookie vào: ${filePath}`);
    return this.getCookieInfo();
  }

  public clearCookie(): CookieInfo {
    const filePath = this.getEffectiveCookiePath();
    fs.writeFileSync(filePath, '[]', 'utf8');
    this.logger.log(`[CookieService] Đã làm trống file cookie: ${filePath}`);
    return this.getCookieInfo();
  }
}
