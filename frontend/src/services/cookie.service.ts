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

import { getAuthHeaders } from './auth.service';

const API_BASE = '/api/cookie';

export const cookieApi = {
  async getCookieInfo(): Promise<CookieInfo> {
    const res = await fetch(API_BASE, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Không thể tải thông tin cookie');
    return res.json();
  },

  async saveCookie(content: string): Promise<CookieInfo> {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Lỗi khi lưu cookie');
    }
    return res.json();
  },

  async clearCookie(): Promise<CookieInfo> {
    const res = await fetch(API_BASE, {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Không thể xóa cookie');
    return res.json();
  },
};
