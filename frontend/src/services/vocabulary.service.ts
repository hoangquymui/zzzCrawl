import { getAuthHeaders } from './auth.service';

export interface ViolationRule {
  id: string;
  category: string;
  description?: string;
  enabled: boolean;
  severity?: 'HIGH' | 'MEDIUM' | 'LOW';
  words: string[];
  patterns?: string[];
}

export interface VocabularyStats {
  totalCategories: number;
  totalWords: number;
  totalPatterns: number;
  activeCategories: number;
  violationPostsCount: number;
}

export interface TestResult {
  isViolation: boolean;
  reason?: string;
  matchedWords: string[];
}

export interface RescanResult {
  totalScanned: number;
  violationCount: number;
  newlyFlagged: number;
  newlyCleared: number;
}

export const vocabularyApi = {
  async getVocabulary(): Promise<{ rules: ViolationRule[]; stats: VocabularyStats }> {
    const res = await fetch('/api/vocabulary', {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Không thể tải danh sách từ vựng vi phạm.');
    }
    return res.json();
  },

  async addWord(category: string, word: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/vocabulary/word', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ category, word }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || 'Lỗi thêm từ ngữ.');
    }
    return json;
  },

  async removeWord(category: string, word: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/vocabulary/word', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ category, word }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || 'Lỗi xóa từ ngữ.');
    }
    return json;
  },

  async addCategory(dto: {
    name: string;
    description?: string;
    severity?: 'HIGH' | 'MEDIUM' | 'LOW';
  }): Promise<{ success: boolean; rule: ViolationRule; message: string }> {
    const res = await fetch('/api/vocabulary/category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(dto),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || 'Lỗi tạo nhóm quy tắc.');
    }
    return json;
  },

  async deleteCategory(key: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/vocabulary/category/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || 'Lỗi xóa nhóm quy tắc.');
    }
    return json;
  },

  async toggleCategory(key: string): Promise<{ success: boolean; enabled: boolean }> {
    const res = await fetch(`/api/vocabulary/category/${encodeURIComponent(key)}/toggle`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || 'Lỗi bật/tắt nhóm quy tắc.');
    }
    return json;
  },

  async getRawJson(): Promise<string> {
    const res = await fetch('/api/vocabulary/raw', {
      headers: { ...getAuthHeaders() },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || 'Không thể lấy dữ liệu JSON.');
    }
    return json.json;
  },

  async updateRawJson(rawJson: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/vocabulary/raw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ json: rawJson }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || 'Lỗi cập nhật JSON.');
    }
    return json;
  },

  async testCaption(caption: string): Promise<TestResult> {
    const res = await fetch('/api/vocabulary/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ caption }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || 'Lỗi kiểm tra mẫu văn bản.');
    }
    return json;
  },

  async rescan(): Promise<RescanResult> {
    const res = await fetch('/api/vocabulary/rescan', {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || 'Lỗi quét lại bài viết.');
    }
    return json;
  },
};
