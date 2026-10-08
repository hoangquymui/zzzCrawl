import { useState, useEffect, useMemo, useCallback } from 'react';
import { VideoItem } from '../types/video';
import { UserProfileItem } from '../types/profile-management';
import { profileManagementApi } from '../services/profile-management.service';
import { socket } from '../services/socket';
import { useResizableColumns } from './useResizableColumns';

export type PostCategory = 'all' | 'post' | 'photo' | 'video';
export type PostViewMode = 'cards' | 'compact' | 'grid';

/**
 * Phân loại VideoItem vào 1 trong 3 nhóm:
 * - 'post': Bài viết (status, chia sẻ, text permalink)
 * - 'photo': Hình ảnh
 * - 'video': Video / FB Reel
 */
export function categorizePost(item: VideoItem): 'post' | 'photo' | 'video' {
  const loai = (item.loai || '').toLowerCase();
  const link = (item.link || '').toLowerCase();

  if (
    loai.includes('video') ||
    loai.includes('reel') ||
    loai.includes('watch') ||
    link.includes('/reel/') ||
    link.includes('/videos/') ||
    link.includes('/watch') ||
    link.includes('tiktok.com')
  ) {
    return 'video';
  }

  if (
    loai.includes('hình ảnh') ||
    loai.includes('ảnh') ||
    loai.includes('photo') ||
    loai.includes('image') ||
    link.includes('photo.php') ||
    link.includes('/photo')
  ) {
    return 'photo';
  }

  return 'post';
}

/**
 * Chuẩn hóa tên để đối chiếu so sánh thông minh giữa tác giả bài viết và tên profile
 */
export function normalizeNameForMatching(name: string): string {
  if (!name) return '';
  let s = name.normalize('NFC').toLowerCase().trim();
  s = s.replace(/\s*\|.*$/, '').trim();
  s = s.replace(/\s*-\s*(thành phố|tỉnh|tp\.?|huyện|thị xã|tt\.?|xã|quận).*$/i, '').trim();
  s = s.replace(/\s+(on|trên)\s+reels.*$/i, '').trim();
  s = s.replace(/\bantt\b/g, 'an ninh trật tự');
  s = s.replace(/\bca\b/g, 'công an');
  s = s.replace(/[,.:\-–—_]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

export function getDistinctiveTokens(norm: string): string[] {
  const common = new Set([
    'công', 'an', 'ninh', 'trật', 'tự',
    'phường', 'xã', 'thị', 'trấn', 'quận', 'huyện', 'thành', 'phố', 'tỉnh', 'tp',
    'đội', 'phòng', 'ban', 'chi'
  ]);
  return norm.split(' ').filter((w) => w && !common.has(w));
}

export function extractSlugForMatching(rawUrl?: string): string {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl);
    if (u.hostname.includes('tiktok.com')) {
      const m = u.pathname.match(/@([^/?#]+)/);
      return m ? m[1].toLowerCase() : '';
    }
    const mPeople = u.pathname.match(/\/people\/[^/]+\/(\d+)/i);
    if (mPeople) return mPeople[1];
    const mP = u.pathname.match(/\/p\/[^-]+-(\d+)/i);
    if (mP) return mP[1];
    const idParam = u.searchParams.get('id');
    if (idParam && /^\d+$/.test(idParam)) return idParam;

    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length > 0) {
      const first = parts[0].toLowerCase();
      if (!['people', 'p', 'profile.php', 'watch', 'reel', 'reels', 'videos', 'story', 'share', 'groups'].includes(first)) {
        return first;
      }
    }
  } catch {}
  return '';
}

/**
 * Kiểm tra xem một bài viết/video có thuộc về một profile nhất định không
 */
export function isPostMatchingProfile(post: VideoItem, profile: UserProfileItem): boolean {
  const isPostTikTok = (post.link || '').includes('tiktok.com');
  const isProfileTikTok = (profile.profileUrl || '').includes('tiktok.com');
  if (isPostTikTok !== isProfileTikTok) return false;

  if (profile.uid) {
    if (post.authorUid && String(post.authorUid).trim() === String(profile.uid).trim()) return true;
    if (post.authorUrl && post.authorUrl.includes(profile.uid)) return true;
    if (post.link && post.link.includes(profile.uid)) return true;
  }

  if (profile.profileUrl && post.authorUrl) {
    const cleanProfileUrl = profile.profileUrl.replace(/\/+$/, '').toLowerCase();
    const cleanAuthorUrl = post.authorUrl.replace(/\/+$/, '').toLowerCase();
    if (cleanProfileUrl === cleanAuthorUrl) return true;
  }

  const pSlug = extractSlugForMatching(profile.profileUrl);
  if (pSlug) {
    const aSlug = extractSlugForMatching(post.authorUrl);
    if (aSlug && aSlug === pSlug) return true;
    if (pSlug.length >= 3) {
      const slugRegex = new RegExp('[/@=?&]' + pSlug + '(?:[/&?]|$)', 'i');
      if (post.authorUrl && slugRegex.test(post.authorUrl)) return true;
      if (post.link && slugRegex.test(post.link)) return true;
    }
  }

  const normAuthor = normalizeNameForMatching(post.nguoiDang || '');
  const normName = normalizeNameForMatching(profile.name || '');

  if (normAuthor && normName) {
    if (normAuthor === normName) return true;

    if (normAuthor.includes(normName) || normName.includes(normAuthor)) {
      const authorTokens = getDistinctiveTokens(normAuthor);
      const nameTokens = getDistinctiveTokens(normName);
      if (authorTokens.length > 0 && nameTokens.length > 0) {
        if (authorTokens.some((t) => nameTokens.includes(t))) return true;
      } else {
        return true;
      }
    }
  }

  return false;
}

export interface UsePostManagementOptions {
  videos: VideoItem[];
  onRefreshOne?: (idOrStt: string | number) => Promise<void> | Promise<boolean> | void;
  onDelete?: (idOrStt: string | number) => Promise<void> | Promise<boolean> | void;
}

export function usePostManagement({
  videos,
  onRefreshOne,
}: UsePostManagementOptions) {
  const [profiles, setProfiles] = useState<UserProfileItem[]>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<PostCategory>('all');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [postSearchTerm, setPostSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedCaptions, setExpandedCaptions] = useState<Record<string | number, boolean>>({});
  const [viewMode, setViewMode] = useState<PostViewMode>('cards');
  const [selectedDetailPost, setSelectedDetailPost] = useState<VideoItem | null>(null);
  const [focusedPostIndex, setFocusedPostIndex] = useState<number>(-1);
  const [isCreatePostModalOpen, setIsCreatePostModalOpen] = useState(false);
  const [isCreateProfileModalOpen, setIsCreateProfileModalOpen] = useState(false);

  const { widths: panelWidths, handleMouseDown: handlePanelResize } = useResizableColumns(
    {
      col1: 290,
      col2: 260,
    },
    'post_mgmt_panels',
    200
  );

  const fetchProfiles = useCallback(async () => {
    try {
      setIsLoadingProfiles(true);
      const state = await profileManagementApi.getState();
      const list = state.profiles || [];
      setProfiles(list);

      if (!selectedUserId && list.length > 0) {
        setSelectedUserId(list[0].id);
      } else if (!selectedUserId) {
        setSelectedUserId('__OTHER__');
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách profile:', err);
      if (!selectedUserId) {
        setSelectedUserId('__OTHER__');
      }
    } finally {
      setIsLoadingProfiles(false);
    }
  }, [selectedUserId]);

  useEffect(() => {
    fetchProfiles();

    const handleProfileUpdate = () => {
      fetchProfiles();
    };

    socket.on('profile_mgmt_item', handleProfileUpdate);
    socket.on('profile_mgmt_status', handleProfileUpdate);

    return () => {
      socket.off('profile_mgmt_item', handleProfileUpdate);
      socket.off('profile_mgmt_status', handleProfileUpdate);
    };
  }, [fetchProfiles]);

  const handleCopy = useCallback((text: string, id: string) => {
    if (!text || text === 'N/A') return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const toggleCaption = useCallback((idOrStt: string | number) => {
    setExpandedCaptions((prev) => ({ ...prev, [idOrStt]: !prev[idOrStt] }));
  }, []);

  const { profilePostMap, otherPosts } = useMemo(() => {
    const map = new Map<string, VideoItem[]>();
    profiles.forEach((p) => map.set(p.id, []));

    const others: VideoItem[] = [];

    videos.forEach((v) => {
      // 1. Ưu tiên sử dụng nhãn profileId từ Backend (Single Source of Truth, O(1))
      if (v.profileId && map.has(v.profileId)) {
        map.get(v.profileId)!.push(v);
        return;
      }

      // 2. Fallback dự phòng tương thích ngược nếu video chưa được gán nhãn
      let matched = false;
      for (const p of profiles) {
        if (isPostMatchingProfile(v, p)) {
          map.get(p.id)?.push(v);
          matched = true;
          break;
        }
      }
      if (!matched) {
        others.push(v);
      }
    });

    return { profilePostMap: map, otherPosts: others };
  }, [profiles, videos]);

  useEffect(() => {
    if (selectedUserId === '__OTHER__') return;
    if (profiles.length > 0 && !profiles.some((p) => p.id === selectedUserId)) {
      setSelectedUserId(profiles[0].id);
    } else if (profiles.length === 0 && selectedUserId !== '__OTHER__') {
      setSelectedUserId('__OTHER__');
    }
  }, [profiles, selectedUserId]);

  const filteredProfiles = useMemo(() => {
    if (!userSearchTerm.trim()) return profiles;
    const term = userSearchTerm.toLowerCase();
    return profiles.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.uid && p.uid.toLowerCase().includes(term)) ||
        (p.profileUrl && p.profileUrl.toLowerCase().includes(term))
    );
  }, [profiles, userSearchTerm]);

  const activeUserPosts = useMemo(() => {
    if (selectedUserId === '__OTHER__') {
      return otherPosts;
    }
    return profilePostMap.get(selectedUserId) || [];
  }, [selectedUserId, otherPosts, profilePostMap]);

  const categoryCounts = useMemo(() => {
    let postCount = 0;
    let photoCount = 0;
    let videoCount = 0;

    activeUserPosts.forEach((v) => {
      const cat = categorizePost(v);
      if (cat === 'video') videoCount++;
      else if (cat === 'photo') photoCount++;
      else postCount++;
    });

    return {
      post: postCount,
      photo: photoCount,
      video: videoCount,
      total: activeUserPosts.length,
    };
  }, [activeUserPosts]);

  const displayedPosts = useMemo(() => {
    let result =
      selectedCategory === 'all'
        ? activeUserPosts
        : activeUserPosts.filter((v) => categorizePost(v) === selectedCategory);

    if (postSearchTerm.trim()) {
      const term = postSearchTerm.toLowerCase();
      result = result.filter(
        (v) =>
          (v.caption && v.caption.toLowerCase().includes(term)) ||
          (v.link && v.link.toLowerCase().includes(term)) ||
          (v.nguoiDang && v.nguoiDang.toLowerCase().includes(term)) ||
          (v.ngayDang && v.ngayDang.toLowerCase().includes(term))
      );
    }

    return result;
  }, [activeUserPosts, selectedCategory, postSearchTerm]);

  const activeProfile = useMemo(() => {
    return profiles.find((p) => p.id === selectedUserId);
  }, [profiles, selectedUserId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.key === 'Escape') {
        if (selectedDetailPost) {
          e.preventDefault();
          setSelectedDetailPost(null);
        }
      } else if (e.key === 'j' || e.key === 'ArrowDown') {
        if (displayedPosts.length > 0) {
          e.preventDefault();
          setFocusedPostIndex((prev) => {
            const next = prev + 1 < displayedPosts.length ? prev + 1 : 0;
            if (selectedDetailPost) {
              setSelectedDetailPost(displayedPosts[next]);
            }
            return next;
          });
        }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        if (displayedPosts.length > 0) {
          e.preventDefault();
          setFocusedPostIndex((prev) => {
            const next = prev - 1 >= 0 ? prev - 1 : displayedPosts.length - 1;
            if (selectedDetailPost) {
              setSelectedDetailPost(displayedPosts[next]);
            }
            return next;
          });
        }
      } else if (e.key === 'Enter') {
        if (focusedPostIndex >= 0 && displayedPosts[focusedPostIndex] && !selectedDetailPost) {
          e.preventDefault();
          setSelectedDetailPost(displayedPosts[focusedPostIndex]);
        }
      } else if (e.key.toLowerCase() === 'c') {
        const targetPost = selectedDetailPost || (focusedPostIndex >= 0 ? displayedPosts[focusedPostIndex] : null);
        if (targetPost && targetPost.link) {
          e.preventDefault();
          handleCopy(targetPost.link, `link_${targetPost.id || targetPost.STT}`);
        }
      } else if (e.key.toLowerCase() === 'r') {
        const targetPost = selectedDetailPost || (focusedPostIndex >= 0 ? displayedPosts[focusedPostIndex] : null);
        const refreshId = targetPost?.id ?? targetPost?.STT;
        if (refreshId !== undefined && onRefreshOne) {
          e.preventDefault();
          onRefreshOne(refreshId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [displayedPosts, selectedDetailPost, focusedPostIndex, onRefreshOne, handleCopy]);

  const handleExportCSV = useCallback(() => {
    if (displayedPosts.length === 0) return;

    const headers = [
      'STT',
      'LOAI',
      'NGUOI_DANG',
      'LINK',
      'CAPTION',
      'NGAY_DANG',
      'LUOT_LIKE',
      'BINH_LUAN',
      'LUOT_SHARE',
      'LUOT_XEM',
    ];

    const rows = displayedPosts.map((p) => [
      `"${p.STT}"`,
      `"${p.loai || (categorizePost(p) === 'video' ? 'Video' : categorizePost(p) === 'photo' ? 'Hình ảnh' : 'Bài viết')}"`,
      `"${(p.nguoiDang || '').replace(/"/g, '""')}"`,
      `"${(p.link || '').replace(/"/g, '""')}"`,
      `"${(p.caption || '').replace(/"/g, '""')}"`,
      `"${(p.ngayDang || '').replace(/"/g, '""')}"`,
      p.LuotLike || 0,
      p.LuotComment || 0,
      p.SoLuongNguoiShare || 0,
      p.LuotXem || 0,
    ]);

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const fileNameSuffix =
      selectedUserId === '__OTHER__'
        ? 'bai_viet_khac'
        : (activeProfile?.name || 'user').replace(/\s+/g, '_');
    link.setAttribute('download', `quan_ly_bai_viet_${fileNameSuffix}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [displayedPosts, selectedUserId, activeProfile]);

  return {
    profiles,
    isLoadingProfiles,
    fetchProfiles,
    selectedUserId,
    setSelectedUserId,
    selectedCategory,
    setSelectedCategory,
    userSearchTerm,
    setUserSearchTerm,
    postSearchTerm,
    setPostSearchTerm,
    copiedId,
    handleCopy,
    expandedCaptions,
    toggleCaption,
    viewMode,
    setViewMode,
    selectedDetailPost,
    setSelectedDetailPost,
    focusedPostIndex,
    setFocusedPostIndex,
    panelWidths,
    handlePanelResize,
    filteredProfiles,
    profilePostMap,
    otherPosts,
    activeUserPosts,
    categoryCounts,
    displayedPosts,
    activeProfile,
    handleExportCSV,
    isCreatePostModalOpen,
    setIsCreatePostModalOpen,
    isCreateProfileModalOpen,
    setIsCreateProfileModalOpen,
  };
}
