export interface VideoItem {
  id?: string;
  STT?: number;
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
  hasImage?: boolean;
  originalAuthor?: string;
  originalAuthorUrl?: string;
  originalPostUrl?: string;
  isViolation?: boolean;
  violationReason?: string;
  crawlSource?: 'http' | 'graphql' | 'dom' | 'aria' | 'playwright';
  crawlStatus?: 'SCRAPE_SUCCESS' | 'PARTIAL_SUCCESS' | 'FALLBACK_SUCCESS' | 'SCRAPE_FAILED';
  confidence?: number;
  fallbackReason?: string;
  missingFields?: string[];
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
