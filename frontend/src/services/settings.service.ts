import { getAuthHeaders, getAuthToken } from './auth.service';

export interface DatabaseStats {
  filePath: string;
  fileSize: number;
  videosCount: number;
  profilesCount: number;
  usersCount: number;
  lastModified: string | null;
}

export interface ConcurrencySettings {
  mode: 'custom' | 'max';
  count: number;
}

export interface SystemSettingsData {
  autoRefreshMinutes: number;
  concurrency?: ConcurrencySettings;
  database: DatabaseStats;
}

const API_BASE = '/api/settings';

export const settingsApi = {
  async getSettings(): Promise<SystemSettingsData> {
    const res = await fetch(API_BASE, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Không thể tải cài đặt hệ thống');
    }
    return res.json();
  },

  async updateInterval(minutes: number): Promise<{ success: boolean; autoRefreshMinutes: number; message: string }> {
    const res = await fetch(`${API_BASE}/interval`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ minutes }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Lỗi khi cập nhật chu kỳ quét');
    }
    return res.json();
  },

  async updateConcurrency(mode: 'custom' | 'max', count?: number): Promise<{ success: boolean; concurrency: ConcurrencySettings; message: string }> {
    const res = await fetch(`${API_BASE}/concurrency`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ mode, count }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Lỗi khi cập nhật số lượng luồng quét');
    }
    return res.json();
  },

  async exportDatabase(): Promise<void> {
    const res = await fetch(`${API_BASE}/database/export`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Lỗi khi xuất tệp cơ sở dữ liệu');
    }

    const blob = await res.blob();
    const contentDisposition = res.headers.get('content-disposition');
    let filename = `zzzCrawl_backup_${new Date().toISOString().slice(0, 10)}.sqlite`;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },

  async importDatabase(file: File): Promise<{ success: boolean; message: string; database: DatabaseStats }> {
    const formData = new FormData();
    formData.append('file', file);

    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}/database/import`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Lỗi khi nhập tệp cơ sở dữ liệu');
    }
    return res.json();
  },
};
