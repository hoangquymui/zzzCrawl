import {
  ProfileScanConfig,
  ProfileScannerState,
} from '../types/profile-scanner';
import { getAuthHeaders } from './auth.service';

const API_BASE = '/api/profile-scanner';

export const profileScannerApi = {
  async getConfig(): Promise<ProfileScanConfig> {
    const res = await fetch(`${API_BASE}/config`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Không thể tải cấu hình quét profile');
    return res.json();
  },

  async saveCookie(content: string): Promise<{ success: boolean; cookieCount: number }> {
    const res = await fetch(`${API_BASE}/cookie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error('Lỗi khi lưu cookie');
    return res.json();
  },

  async startScan(params: {
    profileUrls: string[];
    maxScrolls: number;
    startDate?: string;
    endDate?: string;
  }): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error('Lỗi khi khởi chạy tiến trình quét');
    return res.json();
  },

  async stopScan(): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/stop`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Lỗi khi dừng tiến trình quét');
    return res.json();
  },

  async getState(): Promise<ProfileScannerState> {
    const res = await fetch(`${API_BASE}/state`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Không thể lấy trạng thái scanner');
    return res.json();
  },

  async clearState(): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/clear`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Không thể xóa trạng thái');
    return res.json();
  },
};
