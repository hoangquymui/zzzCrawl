export interface VideoItem {
  STT: number;
  link: string;
  caption: string;
  loai: string;
  nguoiDang: string;
  ngayDang: string;
  SoLuongNguoiShare: number;
  LuotXem: number;
  LuotLike: number;
  LuotComment: number;
  lastUpdated?: string;
  postId?: string;
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
