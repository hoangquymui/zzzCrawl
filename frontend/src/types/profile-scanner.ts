export interface ScannedPostItem {
  id: string;
  videoId: string;
  isShared: boolean;
  hasVideo: boolean;
  /** Phân loại thô: 'Bài viết' | 'Video' | 'Hình ảnh' | 'Chia sẻ' */
  loai?: string;
  postUrl: string;
  videoUrl: string;
  reelUrl: string;
  videoPoster: string;
  author: string;
  postType: string;
  date: string;
  timestamp?: number;
  textPreview: string;
  viewsCount: string;
  likesCount: string;
  commentsCount: string;
  sharesCount: string;
  profileSource?: string;
  attachedAuthor?: string;
}

export interface ProfileScanConfig {
  profileUrls: string[];
  maxScrolls: number;
  cookieCount: number;
  rawCookie: string;
  startDate?: string;
  endDate?: string;
}

export interface ProfileScannerProgress {
  profileIndex: number;
  totalProfiles: number;
  currentScroll: number;
  maxScrolls: number;
  currentUrl: string;
  postsCount?: number;
  videosCount?: number;
  matchedCount?: number;
}

export interface ProfileScannerState {
  status: 'IDLE' | 'RUNNING' | 'DONE' | 'CANCELLED' | 'ERROR';
  logs: string[];
  postsCount: number;
  videosCount: number;
  matchedCount: number;
  foundPosts: ScannedPostItem[];
  progress: ProfileScannerProgress | null;
}
