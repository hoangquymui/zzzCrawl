export interface CookieCheckResult {
  isValid: boolean;
  status: 'VALID' | 'EXPIRED' | 'MISSING' | 'ERROR';
  message: string;
  cUser?: string;
  userName?: string;
  checkedAt: string;
}

export interface CookieSlot {
  id: number; // 1 to 5
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

  async getCookieSlots(): Promise<CookieSlotsResponse> {
    const res = await fetch(`${API_BASE}/slots`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Không thể tải danh sách slots cookie');
    return res.json();
  },

  async getCookieSlot(id: number): Promise<CookieSlot> {
    const res = await fetch(`${API_BASE}/slot/${id}`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error(`Không thể tải thông tin Cookie ${id}`);
    return res.json();
  },

  async saveCookieSlot(id: number, content: string, enabled?: boolean): Promise<CookieSlot> {
    const res = await fetch(`${API_BASE}/slot/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ content, enabled }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Lỗi khi lưu Cookie ${id}`);
    }
    return res.json();
  },

  async toggleCookieSlot(id: number, enabled: boolean): Promise<CookieSlot> {
    const res = await fetch(`${API_BASE}/slot/${id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Lỗi khi bật/tắt Cookie ${id}`);
    }
    return res.json();
  },

  async clearCookieSlot(id: number): Promise<CookieSlot> {
    const res = await fetch(`${API_BASE}/slot/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error(`Không thể xóa Cookie ${id}`);
    return res.json();
  },

  async checkCookieSlot(id: number): Promise<CookieCheckResult> {
    const res = await fetch(`${API_BASE}/slot/${id}/check`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Lỗi khi kiểm tra Cookie ${id}`);
    }
    return res.json();
  },

  async startBrowserLogin(id: number): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/slot/${id}/browser-login`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Lỗi khi mở trình duyệt đăng nhập Cookie ${id}`);
    }
    return res.json();
  },

  async cancelBrowserLogin(id: number): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/slot/${id}/cancel-login`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Lỗi khi hủy đăng nhập Cookie ${id}`);
    }
    return res.json();
  },

  // Legacy fallback APIs
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

  async checkCookie(): Promise<CookieCheckResult> {
    const res = await fetch(`${API_BASE}/check`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Lỗi khi kiểm tra cookie');
    }
    return res.json();
  },
};
