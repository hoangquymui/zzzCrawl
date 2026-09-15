export interface UserProfileItem {
  id: string;
  profileUrl: string;
  uid?: string;
  name: string;
  birthday?: string;
  birthYear?: string;
  location?: string;
  hometown?: string;
  gender?: string;
  avatarUrl?: string;
  bio?: string;
  work?: string;
  education?: string;
  relationship?: string;
  crawledAt: string;
  status: 'SUCCESS' | 'PARTIAL' | 'ERROR';
  errorMsg?: string;
}

export interface ProfileCrawlProgress {
  current: number;
  total: number;
  currentUrl: string;
  currentName?: string;
  status: 'RUNNING' | 'DONE' | 'STOPPED' | 'ERROR';
  message: string;
}

export interface ProfileManagementState {
  status: 'IDLE' | 'SCANNING' | 'DONE' | 'STOPPED' | 'ERROR';
  logs: string[];
  profilesCount: number;
  profiles: UserProfileItem[];
  progress: ProfileCrawlProgress | null;
}
