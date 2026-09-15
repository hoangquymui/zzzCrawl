export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const authApi = {
  async login(username: string, password: string): Promise<LoginResponse> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Đăng nhập không thành công');
    }
    return res.json();
  },

  async me(): Promise<{ user: AuthUser }> {
    const headers: HeadersInit = {
      ...getAuthHeaders(),
    };
    const res = await fetch('/api/auth/me', { headers });
    if (!res.ok) {
      throw new Error('Phiên đăng nhập không hợp lệ');
    }
    return res.json();
  },

  async logout(): Promise<void> {
    const headers: HeadersInit = {
      ...getAuthHeaders(),
    };
    await fetch('/api/auth/logout', { method: 'POST', headers }).catch(() => {});
  },

  async getUsers(): Promise<AuthUser[]> {
    const headers: HeadersInit = {
      ...getAuthHeaders(),
    };
    const res = await fetch('/api/auth/users', { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Không thể lấy danh sách người dùng');
    }
    return res.json();
  },

  async createUser(data: {
    username: string;
    name?: string;
    role: 'admin' | 'user';
    password: string;
  }): Promise<AuthUser> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    };
    const res = await fetch('/api/auth/users', {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Không thể tạo người dùng mới');
    }
    return res.json();
  },

  async deleteUser(id: string): Promise<boolean> {
    const headers: HeadersInit = {
      ...getAuthHeaders(),
    };
    const res = await fetch(`/api/auth/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Không thể xoá người dùng');
    }
    const data = await res.json();
    return data.success;
  },
};
