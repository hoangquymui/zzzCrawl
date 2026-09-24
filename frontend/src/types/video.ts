export interface VideoItem {
  STT: number;
  link: string;
  caption: string;
  loai: string;
  nguoiDang: string;
  authorUid?: string;
  authorUrl?: string;
  ngayDang: string;
  SoLuongNguoiShare: number;
  LuotXem: number;
  LuotLike: number;
  LuotComment: number;
  lastUpdated?: string;
  postId?: string;
  isShared?: boolean;
  originalAuthor?: string;
  originalAuthorUrl?: string;
  originalPostUrl?: string;
}

export interface DailyStat {
  date: string;
  count: number;
  cumulative: number;
}

export interface CrawlStatus {
  message: string;
  url?: string;
}

export interface BatchProgress {
  isRunning: boolean;
  completed: number;
  total: number;
  concurrency?: number | string;
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}
