import { getAuthHeaders } from './auth.service';

export interface AuditLogItem {
  id: string;
  timestamp: string;
  username: string;
  action: string;
  details?: string;
  targetId?: string;
  ipAddress?: string;
}

export interface AuditLogsResponse {
  success: boolean;
  logs: AuditLogItem[];
  total: number;
}

export interface AuditStatsResponse {
  success: boolean;
  total: number;
  today: number;
  deletes7d: number;
  loginFailed7d: number;
  topUser: { username: string; count: number } | null;
}

export const auditApi = {
  getStats: async (): Promise<AuditStatsResponse> => {
    const res = await fetch('/api/audit-logs/stats', {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Lỗi khi tải thống kê nhật ký');
    }
    return res.json();
  },

  getLogs: async (
    limit: number = 100,
    offset: number = 0,
    search?: string,
    action?: string
  ): Promise<AuditLogsResponse> => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (search && search.trim()) params.set('search', search.trim());
    if (action && action !== 'all') params.set('action', action);

    const res = await fetch(`/api/audit-logs?${params.toString()}`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Lỗi khi tải nhật ký hoạt động');
    }
    return res.json();
  },

  clearOldLogs: async (days: number = 30): Promise<{ success: boolean; deletedCount: number; message: string }> => {
    const res = await fetch(`/api/audit-logs/clear?days=${days}`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Lỗi khi dọn dẹp nhật ký hoạt động');
    }
    return res.json();
  },
};
