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

export interface CrawlStatusEvent {
  message: string;
  url?: string;
}

export interface RefreshAllStartedEvent {
  total: number;
  concurrency: number | string;
}

export interface RefreshAllProgressEvent {
  completed: number;
  total: number;
}

export interface RefreshAllCompletedEvent {
  total: number;
}
