import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Users,
  Video as VideoIcon,
  Image as ImageIcon,
  ExternalLink,
  Copy,
  Check,
  Search,
  Download,
  RotateCcw,
  Trash2,
  ThumbsUp,
  MessageSquare,
  Share2,
  Eye,
  Layers,
  Filter,
  User,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { VideoItem } from '../types/video';
import { UserProfileItem } from '../types/profile-management';
import { profileManagementApi } from '../services/profile-management.service';
import { useAuth } from '../context/AuthContext';
import { socket } from '../services/socket';

export interface PostManagementPageProps {
  videos: VideoItem[];
  onRefreshOne?: (stt: number) => Promise<void> | Promise<boolean> | void;
  onDelete?: (stt: number) => Promise<void> | Promise<boolean> | void;
}

export type PostCategory = 'all' | 'post' | 'photo' | 'video';

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
  // Loại bỏ phần đuôi pipe | ... (ví dụ: | Hue, | Hà Nội, | Facebook)
  s = s.replace(/\s*\|.*$/, '').trim();
  // Loại bỏ phần gạch ngang kèm địa danh hành chính (ví dụ: - TP Huế, - Thành phố Huế...)
  s = s.replace(/\s*-\s*(thành phố|tỉnh|tp\.?|huyện|thị xã|tt\.?|xã|quận).*$/i, '').trim();
  // Loại bỏ hậu tố on reels / trên reels
  s = s.replace(/\s+(on|trên)\s+reels.*$/i, '').trim();
  // Chuẩn hóa viết tắt thường gặp
  s = s.replace(/\bantt\b/g, 'an ninh trật tự');
  s = s.replace(/\bca\b/g, 'công an');
  // Thay thế dấu phân tách bằng khoảng trắng
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

/**
 * Kiểm tra xem một bài viết/video có thuộc về một profile nhất định không
 */
export function isPostMatchingProfile(post: VideoItem, profile: UserProfileItem): boolean {
  // 1. So khớp theo UID (chính xác tuyệt đối)
  if (profile.uid) {
    if (post.authorUid && post.authorUid === profile.uid) return true;
    if (post.link && post.link.includes(profile.uid)) return true;
  }

  // 2. So khớp theo URL / Slug
  try {
    const slug = (profile.profileUrl || '')
      .replace(/^https?:\/\/(www\.)?facebook\.com\//i, '')
      .split('/')[0]
      .split('?')[0]
      .trim()
      .toLowerCase();
    if (slug && slug !== 'profile.php') {
      if (post.link && post.link.toLowerCase().includes(slug)) return true;
      if (post.authorUrl && post.authorUrl.toLowerCase().includes(slug)) return true;
    }
    if (profile.profileUrl && post.authorUrl) {
      const cleanProfileUrl = profile.profileUrl.replace(/\/+$/, '').toLowerCase();
      const cleanAuthorUrl = post.authorUrl.replace(/\/+$/, '').toLowerCase();
      if (cleanProfileUrl === cleanAuthorUrl) return true;
    }
  } catch {
    // Bỏ qua lỗi URL parse
  }

  // 3. So khớp thông minh theo Tên người đăng và Tên Profile
  const normAuthor = normalizeNameForMatching(post.nguoiDang || '');
  const normName = normalizeNameForMatching(profile.name || '');

  if (normAuthor && normName) {
    // Bằng nhau hoàn toàn sau khi chuẩn hóa (đã bao gồm xử lý viết tắt & bỏ | Hue...)
    if (normAuthor === normName) return true;

    // Quan hệ bao hàm (substring) khi độ dài đủ lớn
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

export const PostManagementPage: React.FC<PostManagementPageProps> = ({
  videos,
  onRefreshOne,
  onDelete,
}) => {
  const { isAdmin } = useAuth();

  // Danh sách profile lấy từ Profile Management
  const [profiles, setProfiles] = useState<UserProfileItem[]>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);

  // Lựa chọn hiện tại
  // selectedUserId: ID của profile hoặc '__OTHER__' cho mục "Bài viết khác"
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<PostCategory>('all');

  // Tìm kiếm người dùng ở Cột 1
  const [userSearchTerm, setUserSearchTerm] = useState('');

  // Tìm kiếm bài viết ở Cột 3
  const [postSearchTerm, setPostSearchTerm] = useState('');

  // Trạng thái copy ID
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Trạng thái mở rộng caption bài viết
  const [expandedCaptions, setExpandedCaptions] = useState<Record<number, boolean>>({});

  // Tải danh sách profiles từ backend
  const fetchProfiles = async () => {
    try {
      setIsLoadingProfiles(true);
      const state = await profileManagementApi.getState();
      const list = state.profiles || [];
      setProfiles(list);

      // Nếu chưa chọn user nào hoặc user đã bị xóa, chọn user đầu tiên (hoặc __OTHER__)
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
  };

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
  }, []);

  // Xử lý sao chép text
  const handleCopy = (text: string, id: string) => {
    if (!text || text === 'N/A') return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Toggle xem thêm caption
  const toggleCaption = (stt: number) => {
    setExpandedCaptions((prev) => ({ ...prev, [stt]: !prev[stt] }));
  };

  // 1. Phân chia bài viết cho từng profile và "Bài viết khác"
  const { profilePostMap, otherPosts } = useMemo(() => {
    const map = new Map<string, VideoItem[]>();
    profiles.forEach((p) => map.set(p.id, []));

    const others: VideoItem[] = [];

    videos.forEach((v) => {
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

  // Đảm bảo selectedUserId luôn có giá trị hợp lệ
  useEffect(() => {
    if (selectedUserId === '__OTHER__') return;
    if (profiles.length > 0 && !profiles.some((p) => p.id === selectedUserId)) {
      setSelectedUserId(profiles[0].id);
    } else if (profiles.length === 0 && selectedUserId !== '__OTHER__') {
      setSelectedUserId('__OTHER__');
    }
  }, [profiles, selectedUserId]);

  // Danh sách profile sau khi lọc theo từ khóa tìm kiếm
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

  // Danh sách bài viết của người dùng/mục đang được chọn
  const activeUserPosts = useMemo(() => {
    if (selectedUserId === '__OTHER__') {
      return otherPosts;
    }
    return profilePostMap.get(selectedUserId) || [];
  }, [selectedUserId, otherPosts, profilePostMap]);

  // Đếm số lượng theo 3 loại cho người dùng đang chọn (Cột 2)
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

  // Danh sách bài viết hiển thị ở Cột 3 (sau khi lọc theo Loại + Tìm kiếm)
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

  // Thông tin người dùng đang chọn
  const activeProfile = profiles.find((p) => p.id === selectedUserId);

  // Xuất file CSV cho danh sách bài viết đang hiển thị
  const handleExportCSV = () => {
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
  };

  return (
    <div className="space-y-5">
      {/* 1. Header trên cùng: Tiêu đề Quản lý bài viết */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Quản lý bài viết
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30">
                  Posts Manager
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Phân loại bài viết theo từng Profile quản lý và các bài viết ngoại lai
              </p>
            </div>
          </div>
        </div>

        {/* Thanh công cụ và thống kê tóm tắt */}
        <div className="flex items-center flex-wrap gap-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/60">
            <Users className="w-3.5 h-3.5 text-blue-500" />
            <span>{profiles.length} profile</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <FileText className="w-3.5 h-3.5 text-indigo-500" />
            <span>{videos.length} bài viết</span>
          </div>

          <button
            type="button"
            onClick={fetchProfiles}
            disabled={isLoadingProfiles}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition shadow-xs cursor-pointer disabled:opacity-50"
            title="Làm mới danh sách profile"
          >
            <RotateCcw className={`w-4 h-4 ${isLoadingProfiles ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={displayedPosts.length === 0}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition flex items-center gap-1.5 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Xuất file CSV danh sách bài viết đang hiển thị"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Khung 3 cột theo đúng bản vẽ wireframe */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* =========================================================================
            CỘT 1: Danh sách người dùng (lấy từ profile + mục "Bài viết khác")
           ========================================================================= */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col min-h-[580px] max-h-[780px] overflow-hidden">
          {/* Header Cột 1 */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              <span>Danh sách người dùng:</span>
            </h2>

            {/* Ô tìm kiếm người dùng */}
            <div className="relative mt-2.5">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                placeholder="Tìm tên hoặc UID..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          {/* Danh sách cuộn Người dùng */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredProfiles.length === 0 && userSearchTerm && (
              <div className="py-8 text-center text-slate-400 text-xs">
                Không tìm thấy profile nào phù hợp.
              </div>
            )}

            {filteredProfiles.map((p) => {
              const isSelected = selectedUserId === p.id;
              const postCount = profilePostMap.get(p.id)?.length || 0;

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedUserId(p.id)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100 shadow-xs'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-slate-200 dark:bg-slate-800 flex items-center justify-center border border-slate-200/80 dark:border-slate-700">
                    {p.avatarUrl ? (
                      <img
                        src={p.avatarUrl}
                        alt={p.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Fallback icon khi lỗi ảnh
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <User className="w-4 h-4 text-slate-400" />
                    )}
                  </div>

                  {/* Thông tin tên & UID */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-xs truncate">{p.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">
                      {p.uid ? `UID: ${p.uid}` : p.profileUrl?.replace('https://www.facebook.com/', '')}
                    </p>
                  </div>

                  {/* Số lượng bài viết */}
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      postCount > 0
                        ? isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        : 'bg-slate-100 dark:bg-slate-800/40 text-slate-400'
                    }`}
                  >
                    {postCount}
                  </span>
                </button>
              );
            })}

            {/* Mục cố định: BÀI VIẾT KHÁC (chứa các link có người đăng không thuộc danh sách profile) */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 my-1">
              <button
                type="button"
                onClick={() => setSelectedUserId('__OTHER__')}
                className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                  selectedUserId === '__OTHER__'
                    ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100 shadow-xs'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 text-slate-700 dark:text-slate-300 bg-slate-50/40 dark:bg-slate-950/30'
                }`}
              >
                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-800">
                  <Layers className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-xs truncate">Bài viết khác</p>
                  <p className="text-[10px] text-slate-400 truncate">Người đăng ngoài profile</p>
                </div>

                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                    otherPosts.length > 0
                      ? selectedUserId === '__OTHER__'
                        ? 'bg-amber-600 text-white'
                        : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}
                >
                  {otherPosts.length}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* =========================================================================
            CỘT 2: Phân loại bài viết (Bài viết / Hình ảnh / Video)
           ========================================================================= */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 min-h-[580px] flex flex-col">
          <div className="border-b border-slate-100 dark:border-slate-800/80 pb-3 mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Filter className="w-4 h-4 text-indigo-500" />
              <span>Loại nội dung:</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-1 truncate">
              {selectedUserId === '__OTHER__'
                ? 'Bài viết khác'
                : activeProfile?.name || 'Chưa chọn'}
            </p>
          </div>

          {/* Các mục lựa chọn: Tất cả / Bài viết / Hình ảnh / Video */}
          <div className="space-y-2.5 flex-1">
            {/* 0. Tất cả nội dung */}
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`w-full flex items-center justify-between p-3.5 rounded-xl font-bold text-xs transition-all cursor-pointer text-left ${
                selectedCategory === 'all'
                  ? 'border-2 border-slate-900 dark:border-white bg-slate-100/80 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-900/10'
                  : 'border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Layers
                  className={`w-4 h-4 ${
                    selectedCategory === 'all'
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-400'
                  }`}
                />
                <span>Tất cả nội dung</span>
              </div>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-md font-mono ${
                  selectedCategory === 'all'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                {categoryCounts.total}
              </span>
            </button>

            {/* 1. Bài viết */}
            <button
              type="button"
              onClick={() => setSelectedCategory('post')}
              className={`w-full flex items-center justify-between p-3.5 rounded-xl font-bold text-xs transition-all cursor-pointer text-left ${
                selectedCategory === 'post'
                  ? 'border-2 border-slate-900 dark:border-white bg-slate-100/80 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-900/10'
                  : 'border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FileText
                  className={`w-4 h-4 ${
                    selectedCategory === 'post'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-400'
                  }`}
                />
                <span>Bài viết</span>
              </div>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-md font-mono ${
                  selectedCategory === 'post'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                {categoryCounts.post}
              </span>
            </button>

            {/* 2. Hình ảnh */}
            <button
              type="button"
              onClick={() => setSelectedCategory('photo')}
              className={`w-full flex items-center justify-between p-3.5 rounded-xl font-bold text-xs transition-all cursor-pointer text-left ${
                selectedCategory === 'photo'
                  ? 'border-2 border-slate-900 dark:border-white bg-slate-100/80 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-900/10'
                  : 'border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ImageIcon
                  className={`w-4 h-4 ${
                    selectedCategory === 'photo'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-400'
                  }`}
                />
                <span>Hình ảnh</span>
              </div>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-md font-mono ${
                  selectedCategory === 'photo'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                {categoryCounts.photo}
              </span>
            </button>

            {/* 3. Video */}
            <button
              type="button"
              onClick={() => setSelectedCategory('video')}
              className={`w-full flex items-center justify-between p-3.5 rounded-xl font-bold text-xs transition-all cursor-pointer text-left ${
                selectedCategory === 'video'
                  ? 'border-2 border-slate-900 dark:border-white bg-slate-100/80 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-900/10'
                  : 'border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <VideoIcon
                  className={`w-4 h-4 ${
                    selectedCategory === 'video'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-400'
                  }`}
                />
                <span>Video</span>
              </div>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-md font-mono ${
                  selectedCategory === 'video'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                {categoryCounts.video}
              </span>
            </button>
          </div>

          {/* Tóm tắt tổng số */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Tổng số bài viết:</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">
              {categoryCounts.total}
            </span>
          </div>
        </div>

        {/* =========================================================================
            CỘT 3: Thông tin các bài viết: link, caption, ...
           ========================================================================= */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col min-h-[580px] max-h-[780px] overflow-hidden">
          {/* Header Cột 3 */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <span>Thông tin các bài viết: link, caption, ...</span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {selectedUserId === '__OTHER__'
                  ? 'Bài viết khác'
                  : activeProfile?.name || 'Tất cả'}{' '}
                •{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {selectedCategory === 'all'
                    ? 'Tất cả'
                    : selectedCategory === 'video'
                    ? 'Video'
                    : selectedCategory === 'photo'
                    ? 'Hình ảnh'
                    : 'Bài viết'}
                </span>{' '}
                ({displayedPosts.length} kết quả)
              </p>
            </div>

            {/* Ô tìm kiếm bài viết */}
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={postSearchTerm}
                onChange={(e) => setPostSearchTerm(e.target.value)}
                placeholder="Tìm link, caption, ngày..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          {/* Danh sách cuộn các bài viết */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {displayedPosts.length === 0 ? (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <AlertCircle className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                <p className="font-medium text-xs">
                  Không có bài viết nào thuộc mục này.
                </p>
                <p className="text-[11px] text-slate-400 max-w-sm">
                  {selectedUserId === '__OTHER__'
                    ? 'Không có bài viết ngoại lai nào thuộc phân loại này trong hệ thống.'
                    : `Người dùng "${activeProfile?.name || 'này'}" hiện chưa có ${
                        selectedCategory === 'video'
                          ? 'Video'
                          : selectedCategory === 'photo'
                          ? 'Hình ảnh'
                          : 'Bài viết'
                      } nào.`}
                </p>
              </div>
            ) : (
              displayedPosts.map((post) => {
                const isExpanded = Boolean(expandedCaptions[post.STT]);
                const snippetLength = 120;
                const isLongCaption = (post.caption || '').length > snippetLength;

                return (
                  <div
                    key={post.STT}
                    className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-950/30 hover:border-slate-300 dark:hover:border-slate-700 transition space-y-3"
                  >
                    {/* Hàng 1: STT, Loại & Ngày đăng, Người đăng */}
                    <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          #{post.STT}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            selectedCategory === 'video'
                              ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30'
                              : selectedCategory === 'photo'
                              ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30'
                              : 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30'
                          }`}
                        >
                          {post.loai || (selectedCategory === 'video' ? 'Video' : selectedCategory === 'photo' ? 'Hình ảnh' : 'Bài viết')}
                        </span>

                        {post.nguoiDang && (
                          <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs truncate max-w-[160px]">
                            {post.nguoiDang}
                          </span>
                        )}
                      </div>

                      {post.ngayDang && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Calendar className="w-3 h-3" />
                          <span>{post.ngayDang}</span>
                        </div>
                      )}
                    </div>

                    {/* Hàng 2: Caption nội dung */}
                    <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/60">
                      <p className="whitespace-pre-wrap break-words">
                        {isExpanded || !isLongCaption
                          ? post.caption || '(Không có nội dung văn bản)'
                          : `${(post.caption || '').slice(0, snippetLength)}...`}
                      </p>
                      {isLongCaption && (
                        <button
                          type="button"
                          onClick={() => toggleCaption(post.STT)}
                          className="mt-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          {isExpanded ? 'Thu gọn' : 'Xem thêm'}
                        </button>
                      )}
                    </div>

                    {/* Hàng 3: Link bài viết + Nút sao chép */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <a
                          href={post.link}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium truncate max-w-[280px] sm:max-w-[340px]"
                          title={`Mở link bài viết: ${post.link}`}
                        >
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{post.link}</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => handleCopy(post.link, `link_${post.STT}`)}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition shrink-0 cursor-pointer"
                          title="Sao chép link bài viết"
                        >
                          {copiedId === `link_${post.STT}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Nút hành động (Làm mới / Xóa nếu là Admin) */}
                      {isAdmin && (
                        <div className="flex items-center gap-1 shrink-0">
                          {onRefreshOne && (
                            <button
                              type="button"
                              onClick={() => onRefreshOne(post.STT)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
                              title="Cập nhật lại tương tác bài viết này"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onDelete && (
                            <button
                              type="button"
                              onClick={() => onDelete(post.STT)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                              title="Xóa bài viết này khỏi danh sách theo dõi"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Hàng 4: Thống kê tương tác */}
                    <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                      <span className="flex items-center gap-1" title="Lượt thích">
                        <ThumbsUp className="w-3 h-3 text-blue-500" />
                        <span>{post.LuotLike || 0}</span>
                      </span>

                      <span className="flex items-center gap-1" title="Bình luận">
                        <MessageSquare className="w-3 h-3 text-indigo-500" />
                        <span>{post.LuotComment || 0}</span>
                      </span>

                      <span className="flex items-center gap-1" title="Lượt chia sẻ">
                        <Share2 className="w-3 h-3 text-purple-500" />
                        <span>{post.SoLuongNguoiShare || 0}</span>
                      </span>

                      {post.LuotXem > 0 && (
                        <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold" title="Lượt xem">
                          <Eye className="w-3 h-3" />
                          <span>{post.LuotXem}</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostManagementPage;
