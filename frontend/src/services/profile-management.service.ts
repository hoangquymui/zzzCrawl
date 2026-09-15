import {
  UserProfileItem,
  ProfileManagementState,
} from '../types/profile-management';
import { getAuthHeaders } from './auth.service';

const API_BASE = '/api/profile-management';

export const profileManagementApi = {
  async getState(): Promise<ProfileManagementState> {
    const res = await fetch(`${API_BASE}/state`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Không thể lấy trạng thái quản lý profile');
    return res.json();
  },

  async listProfiles(): Promise<UserProfileItem[]> {
    const res = await fetch(`${API_BASE}/list`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Không thể tải danh sách profile');
    return res.json();
  },

  async crawlProfiles(profileUrls: string[]): Promise<{ started: boolean; count: number }> {
    const res = await fetch(`${API_BASE}/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ profileUrls }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Lỗi khi khởi chạy tiến trình cào profile');
    }
    return res.json();
  },

  async stopCrawl(): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/stop`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Lỗi khi dừng cào profile');
    return res.json();
  },

  async deleteProfile(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Không thể xóa profile');
    return res.json();
  },

  async clearAll(): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/clear`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Không thể xóa danh sách profile');
    return res.json();
  },
};
