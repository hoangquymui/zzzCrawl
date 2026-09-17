import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Square,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Terminal,
  Activity,
  FileText,
  Video,
  Hash,
  ExternalLink,
  Plus,
  Copy,
  Check,
  Download,
  Search,
  Users,
  ChevronDown,
  Calendar,
} from 'lucide-react';
import { DateRangePicker } from '../components/DateRangePicker';
import { socket } from '../services/socket';
import { profileScannerApi } from '../services/profile-scanner.service';
import { profileManagementApi } from '../services/profile-management.service';
import { Toast } from '../components/Toast';
import { ToastItem, VideoItem } from '../types/video';
import {
  ScannedPostItem,
  ProfileScannerProgress,
  ProfileScannerState,
} from '../types/profile-scanner';
import { UserProfileItem } from '../types/profile-management';
import { useAuth } from '../context/AuthContext';

interface VideoProfilePageProps {
  onAddVideo?: (url: string) => Promise<boolean>;
  videos?: VideoItem[];
}

export const VideoProfilePage: React.FC<VideoProfilePageProps> = ({ onAddVideo, videos = [] }) => {
  const { isAdmin } = useAuth();
  // Target mode: 'profile' (mặc định, luôn hiện trước) hoặc 'link'
  const [sourceMode, setSourceMode] = useState<'profile' | 'link'>('profile');
  const [availableProfiles, setAvailableProfiles] = useState<UserProfileItem[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [profileUrlsText, setProfileUrlsText] = useState('');
  const [targetTag, setTargetTag] = useState('');
  const [maxScrolls, setMaxScrolls] = useState<number>(5);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Cookie manager modal
  const [isCookieModalOpen, setIsCookieModalOpen] = useState(false);
  const [rawCookieInput, setRawCookieInput] = useState('');
  const [cookieCount, setCookieCount] = useState(0);
  const [isSavingCookie, setIsSavingCookie] = useState(false);
  const [cookieSaveMsg, setCookieSaveMsg] = useState<string | null>(null);

  // Scanner state
  const [status, setStatus] = useState<ProfileScannerState['status']>('IDLE');
  const [logs, setLogs] = useState<string[]>([]);
  const [postsCount, setPostsCount] = useState(0);
  const [videosCount, setVideosCount] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [foundPosts, setFoundPosts] = useState<ScannedPostItem[]>([]);
  const [progress, setProgress] = useState<ProfileScannerProgress | null>(null);

  // Terminal & search
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Toast state
  const [toast, setToast] = useState<ToastItem | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now().toString(), message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  };

  // Load config & initial state on mount
  useEffect(() => {
    // Tải danh sách profile có sẵn từ Quản lý Profile
    profileManagementApi
      .getState()
      .then((st) => {
        if (st.profiles && st.profiles.length > 0) {
          setAvailableProfiles(st.profiles);
          setSelectedProfileId(st.profiles[0].id);
        }
      })
      .catch(() => {});

    profileScannerApi
      .getConfig()
      .then((cfg) => {
        if (cfg.profileUrls && cfg.profileUrls.length > 0) {
          setProfileUrlsText(cfg.profileUrls.join('\n'));
        }
        if (cfg.targetTag) setTargetTag(cfg.targetTag);
        if (cfg.maxScrolls) {
          setMaxScrolls(Math.min(15, Math.max(1, cfg.maxScrolls)));
        } else {
          setMaxScrolls(5);
        }
        setCookieCount(cfg.cookieCount || 0);
        setRawCookieInput(cfg.rawCookie || '');
      })
      .catch(() => {});

    profileScannerApi
      .getState()
      .then((st) => {
        setStatus(st.status);
        setLogs(st.logs || []);
        setPostsCount(st.postsCount || 0);
        setVideosCount(st.videosCount || 0);
        setMatchedCount(st.matchedCount || 0);
        setFoundPosts(st.foundPosts || []);
        setProgress(st.progress || null);
      })
      .catch(() => {});
  }, []);

  // Socket.IO event listeners for real-time streaming
  useEffect(() => {
    const handleLog = (data: { message: string }) => {
      setLogs((prev) => [...prev, data.message]);
    };

    const handleFound = (post: ScannedPostItem) => {
      setFoundPosts((prev) => {
        if (prev.some((p) => p.id === post.id)) return prev;
        return [post, ...prev];
      });
    };

    const handleProgress = (prog: ProfileScannerProgress) => {
      setProgress(prog);
      if (typeof prog.postsCount === 'number') setPostsCount(prog.postsCount);
      if (typeof prog.videosCount === 'number') setVideosCount(prog.videosCount);
      if (typeof prog.matchedCount === 'number') setMatchedCount(prog.matchedCount);
    };

    const handleStatus = (data: { status: ProfileScannerState['status'] }) => {
      setStatus(data.status);
      if (data.status === 'DONE' || data.status === 'IDLE') {
        profileScannerApi
          .getState()
          .then((st) => {
            if (typeof st.postsCount === 'number') setPostsCount(st.postsCount);
            if (typeof st.videosCount === 'number') setVideosCount(st.videosCount);
            if (typeof st.matchedCount === 'number') setMatchedCount(st.matchedCount);
            if (st.foundPosts) setFoundPosts(st.foundPosts);
          })
          .catch(() => {});
      }
    };

    socket.on('profile_scanner_log', handleLog);
    socket.on('profile_scanner_found', handleFound);
    socket.on('profile_scanner_progress', handleProgress);
    socket.on('profile_scanner_status', handleStatus);

    return () => {
      socket.off('profile_scanner_log', handleLog);
      socket.off('profile_scanner_found', handleFound);
      socket.off('profile_scanner_progress', handleProgress);
      socket.off('profile_scanner_status', handleStatus);
    };
  }, []);

  // Auto-scroll terminal logs
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Handle start scan
  const handleStartScan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (cookieCount === 0) {
      showToast('Chưa nạp cookie! Vui lòng vào mục Cookie để nạp cookie trước khi quét.', 'error');
      return;
    }

    let urls: string[] = [];
    if (sourceMode === 'profile') {
      if (availableProfiles.length === 0) {
        alert('Chưa có profile nào được lưu trong hệ thống để quét. Vui lòng chuyển sang chế độ "Link" hoặc cào profile trước!');
        return;
      }
      if (selectedProfileId === 'ALL') {
        urls = availableProfiles.map((p) => p.profileUrl).filter(Boolean);
      } else {
        const prof = availableProfiles.find((p) => p.id === selectedProfileId) || availableProfiles[0];
        if (prof && prof.profileUrl) {
          urls = [prof.profileUrl];
        }
      }
    } else {
      urls = profileUrlsText
        .split(/[\r\n,;]+/)
        .map((u) => u.trim())
        .filter(Boolean);
    }

    if (urls.length === 0) {
      alert(
        sourceMode === 'profile'
          ? 'Vui lòng chọn một profile hợp lệ để quét!'
          : 'Vui lòng nhập ít nhất 1 link Profile/Fanpage Facebook!'
      );
      return;
    }

    try {
      setStatus('RUNNING');
      setPostsCount(0);
      setVideosCount(0);
      setMatchedCount(0);
      setFoundPosts([]);
      await profileScannerApi.startScan({
        profileUrls: urls,
        targetTag,
        maxScrolls: Math.min(15, Math.max(1, maxScrolls || 5)),
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
    } catch (err: any) {
      alert(`Không thể bắt đầu quét: ${err.message}`);
      setStatus('ERROR');
    }
  };

  // Handle stop scan
  const handleStopScan = async () => {
    try {
      await profileScannerApi.stopScan();
      setStatus('CANCELLED');
    } catch (err: any) {
      alert(`Lỗi khi dừng: ${err.message}`);
    }
  };

  // Handle clear state
  const handleClear = async () => {
    if (status === 'RUNNING') {
      alert('Vui lòng dừng quét trước khi xóa!');
      return;
    }
    await profileScannerApi.clearState();
    setLogs(['[HỆ THỐNG] Đã làm mới nhật ký và kết quả.']);
    setFoundPosts([]);
    setPostsCount(0);
    setVideosCount(0);
    setMatchedCount(0);
    setProgress(null);
    setStatus('IDLE');
    setStartDate('');
    setEndDate('');
  };

  // Handle save cookie
  const handleSaveCookie = async () => {
    setIsSavingCookie(true);
    setCookieSaveMsg(null);
    try {
      const res = await profileScannerApi.saveCookie(rawCookieInput);
      setCookieCount(res.cookieCount);
      setCookieSaveMsg(`✅ Đã lưu thành công (${res.cookieCount} cookies hợp lệ)`);
      setTimeout(() => {
        setIsCookieModalOpen(false);
        setCookieSaveMsg(null);
      }, 1500);
    } catch (err: any) {
      setCookieSaveMsg(`❌ Lỗi: ${err.message}`);
    } finally {
      setIsSavingCookie(false);
    }
  };

  // Copy link helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Quick add to Video Tracker
  const handleAddToTracker = async (post: ScannedPostItem & { isChild?: boolean }) => {
    const isPostShared = post.isShared || post.postType === 'Chia sẻ';
    const url = isPostShared
      ? (post.postUrl && post.postUrl !== 'N/A' ? post.postUrl : post.reelUrl)
      : (post.reelUrl && post.reelUrl !== 'N/A'
        ? post.reelUrl
        : post.videoUrl && post.videoUrl !== 'N/A'
        ? post.videoUrl
        : post.postUrl);
    if (!url || url === 'N/A') {
      showToast('Bài viết này chưa có link hợp lệ để theo dõi!', 'error');
      return;
    }

    // Kiểm tra trùng lặp với danh sách Video Tracker
    const isAlreadyTracked = videos.some((v) => {
      if (isPostShared) {
        // Bài chia sẻ: CHỈ coi là đã thêm nếu chính link permalink của nó đã có trong danh sách
        return Boolean(
          post.postUrl &&
          post.postUrl !== 'N/A' &&
          (v.link === post.postUrl || (v.postId && (post.postUrl.includes('/' + v.postId) || post.postUrl.includes('=' + v.postId))))
        );
      }

      if (url && v.link === url) return true;
      if (post.reelUrl && v.link === post.reelUrl) return true;
      if (post.postUrl && v.link === post.postUrl) return true;
      if (post.videoId && (v.link.includes(post.videoId) || (v.postId && v.postId === post.videoId))) return true;
      if (
        post.textPreview &&
        v.caption &&
        v.caption.trim() === post.textPreview.trim() &&
        v.nguoiDang &&
        post.author &&
        v.nguoiDang.trim().toLowerCase() === post.author.trim().toLowerCase()
      ) {
        return true;
      }
      return false;
    });

    if (isAlreadyTracked) {
      showToast('Bài viết/video này đã có trong danh sách theo dõi!', 'info');
      setAddedIds((prev) => new Set([...prev, post.id]));
      return;
    }

    if (onAddVideo) {
      const success = await onAddVideo(url);
      if (success) {
        setAddedIds((prev) => new Set([...prev, post.id]));
      }
    }
  };

  interface GroupedScannedItem extends ScannedPostItem {
    isChild: boolean;
    sttDisplay: string;
    groupKey: string;
  }

  // Nhóm bài viết theo video: Nếu có bài gốc FB Reel, bài gốc đứng trước (STT N), các bài chia sẻ cùng video thụt lề con (STT N.1, N.2...)
  // Nếu bài chia sẻ độc lập (không có bài gốc trên timeline này), hiển thị tuần tự theo dòng thời gian với STT N
  const getGroupedPosts = (posts: ScannedPostItem[]): GroupedScannedItem[] => {
    const isSharedPost = (p: ScannedPostItem) => Boolean(p.isShared || p.postType === 'Chia sẻ');

    const visited = new Set<string>();
    const orderedList: GroupedScannedItem[] = [];
    let groupNumber = 1;

    posts.forEach((post) => {
      if (visited.has(post.id)) return;

      const isShared = isSharedPost(post);
      const videoKey = (post.videoId && post.videoId !== 'N/A') ? post.videoId : '';

      if (!isShared) {
        // 1. Bài gốc (FB Reel)
        visited.add(post.id);
        const groupKey = videoKey || post.reelUrl || post.postUrl || post.id;
        orderedList.push({
          ...post,
          isChild: false,
          sttDisplay: `${groupNumber}`,
          groupKey,
        });

        // Tìm các bài chia sẻ con cùng video trên timeline
        if (videoKey) {
          let childIdx = 1;
          posts.forEach((other) => {
            if (!visited.has(other.id) && isSharedPost(other) && other.videoId === videoKey) {
              visited.add(other.id);
              orderedList.push({
                ...other,
                isChild: true,
                sttDisplay: `${groupNumber}.${childIdx}`,
                groupKey,
              });
              childIdx++;
            }
          });
        }

        groupNumber++;
      } else {
        // 2. Bài chia sẻ (Nếu video gốc có xuất hiện trên timeline thì tìm ghép, nếu không thì hiển thị độc lập)
        const parentPost = videoKey
          ? posts.find((p) => !visited.has(p.id) && !isSharedPost(p) && p.videoId === videoKey)
          : null;

        if (parentPost) {
          // Xuất hiện bài gốc: Đưa bài gốc lên trước
          visited.add(parentPost.id);
          const groupKey = videoKey || parentPost.id;
          orderedList.push({
            ...parentPost,
            isChild: false,
            sttDisplay: `${groupNumber}`,
            groupKey,
          });

          // Đưa bài chia sẻ này và các bài chia sẻ cùng video khác làm cấp con
          visited.add(post.id);
          orderedList.push({
            ...post,
            isChild: true,
            sttDisplay: `${groupNumber}.1`,
            groupKey,
          });

          let childIdx = 2;
          posts.forEach((other) => {
            if (!visited.has(other.id) && isSharedPost(other) && other.videoId === videoKey) {
              visited.add(other.id);
              orderedList.push({
                ...other,
                isChild: true,
                sttDisplay: `${groupNumber}.${childIdx}`,
                groupKey,
              });
              childIdx++;
            }
          });

          groupNumber++;
        } else {
          // Bài chia sẻ độc lập (share từ page khác/người khác, không có bài gốc của profile này)
          visited.add(post.id);
          const groupKey = videoKey || post.id;
          orderedList.push({
            ...post,
            isChild: false,
            sttDisplay: `${groupNumber}`,
            groupKey,
          });

          // Nếu có bài chia sẻ thứ 2 cùng chia sẻ 1 video ngoại này
          if (videoKey) {
            let childIdx = 1;
            posts.forEach((other) => {
              if (!visited.has(other.id) && isSharedPost(other) && other.videoId === videoKey) {
                visited.add(other.id);
                orderedList.push({
                  ...other,
                  isChild: true,
                  sttDisplay: `${groupNumber}.${childIdx}`,
                  groupKey,
                });
                childIdx++;
              }
            });
          }

          groupNumber++;
        }
      }
    });

    return orderedList;
  };

  // Filtered posts (by search term)
  const filteredPosts = foundPosts.filter((p) => {
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      return (
        p.author.toLowerCase().includes(term) ||
        p.textPreview.toLowerCase().includes(term) ||
        p.taggedName.toLowerCase().includes(term) ||
        p.postUrl.toLowerCase().includes(term) ||
        p.reelUrl.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const orderedPosts = getGroupedPosts(filteredPosts);

  // Export CSV of scanned posts
  const handleExportCSV = () => {
    if (orderedPosts.length === 0) return;
    const headers = [
      'STT',
      'LINK',
      'CAPTION',
      'TAG',
      'LOAI',
      'NGUOI_DANG',
      'NGAY_DANG',
      'LUOT_SHARE',
      'LUOT_XEM',
      'LUOT_LIKE',
      'BINH_LUAN',
    ];

    const rows = orderedPosts.map((p) => {
      const isShared = Boolean(p.isShared || p.postType === 'Chia sẻ');
      const link = isShared
        ? (p.postUrl && p.postUrl !== 'N/A' ? p.postUrl : (p.reelUrl || p.videoUrl))
        : (p.reelUrl && p.reelUrl !== 'N/A' ? p.reelUrl : (p.videoUrl || p.postUrl));
      const captionPrefix = p.isChild ? '  ↳ ' : '';
      return [
        `"${p.sttDisplay}"`,
        `"${(link || '').replace(/"/g, '""')}"`,
        `"${(captionPrefix + (p.textPreview || '')).replace(/"/g, '""')}"`,
        `"${(p.taggedName || '').replace(/"/g, '""')}"`,
        `"${(isShared ? 'Chia sẻ' : (p.postType || 'FB Reel')).replace(/"/g, '""')}"`,
        `"${(p.author || '').replace(/"/g, '""')}"`,
        `"${(p.date || '').replace(/"/g, '""')}"`,
        p.sharesCount || '0',
        p.viewsCount || '-',
        p.likesCount || '0',
        p.commentsCount || '0',
      ];
    });

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `facebook_reels_scan_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const parsedUrlCount = profileUrlsText
    .split(/[\r\n,;]+/)
    .map((u) => u.trim())
    .filter(Boolean).length;

  const selectedProfile =
    availableProfiles.find((p) => p.id === selectedProfileId) || (availableProfiles[0] || null);

  return (
    <div className="space-y-6">
      {/* Top Header & Overview */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Facebook Video + Tag Scanner
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30">
                  Profile Scanner
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tự động quét trang cá nhân / Fanpage để tìm bài viết chứa Video và thẻ Tag mục tiêu
              </p>
            </div>
          </div>
        </div>

        {/* Cookie Pill (Chỉ Admin) */}
        {isAdmin && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsCookieModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-xs bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
            >
              {cookieCount > 0 ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span>Cookie: đã nạp</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-500 ml-0.5" />
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                  <span>Cookie: chưa nạp</span>
                  <ShieldAlert className="w-4 h-4 text-rose-500 ml-0.5" />
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Control Panel (7 cols) + Live Logs (5 cols) - Chỉ hiển thị cho Admin */}
      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form Control Panel */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <form onSubmit={handleStartScan} className="space-y-4">
              {/* Danh sách Target: Dropdown Chọn Profile hoặc Link (Luôn hiện Profile trước) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="h-5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>Danh sách:</span>
                    </label>

                    {/* Sổ xuống gồm Profile và Link (Luôn hiện profile trước) */}
                    <div className="relative inline-block">
                      <select
                        value={sourceMode}
                        onChange={(e) => setSourceMode(e.target.value as 'profile' | 'link')}
                        disabled={status === 'RUNNING'}
                        className="appearance-none bg-blue-50 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-xl pl-3 pr-8 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs"
                      >
                        <option value="profile">Profile</option>
                        <option value="link">Link</option>
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20">
                    {sourceMode === 'profile'
                      ? selectedProfileId === 'ALL'
                        ? `${availableProfiles.length} profiles`
                        : availableProfiles.length > 0
                        ? '1 profile'
                        : '0 profile'
                      : `${parsedUrlCount} profile${parsedUrlCount > 1 ? 's' : ''}`}
                  </span>
                </div>

                {/* Khi ở Profile: Chọn profile từ profile có sẵn để crawl */}
                {sourceMode === 'profile' ? (
                  <div className="space-y-2">
                    {availableProfiles.length === 0 ? (
                      <div className="p-3.5 rounded-xl border border-dashed border-amber-300 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                        <p className="font-semibold">Chưa có profile nào được lưu trong hệ thống!</p>
                        <p className="text-slate-600 dark:text-slate-400">
                          Bạn có thể chuyển sang lựa chọn <strong>Link</strong> ở trên để nhập link trực tiếp, hoặc cào profile tại trang Quản lý Profile.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <select
                            value={selectedProfileId}
                            onChange={(e) => setSelectedProfileId(e.target.value)}
                            disabled={status === 'RUNNING'}
                            className="w-full appearance-none bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-3.5 pr-9 py-2 text-xs text-slate-800 dark:text-slate-200 transition outline-none font-medium cursor-pointer"
                          >
                            {availableProfiles.length > 1 && (
                              <option value="ALL">
                                ★ Quét tất cả ({availableProfiles.length} profile có sẵn)
                              </option>
                            )}
                            {availableProfiles.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name || 'Không rõ tên'}{p.uid ? ` (UID: ${p.uid})` : ''}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>

                        {/* Thẻ hiển thị tóm tắt Profile đã chọn */}
                        {selectedProfileId !== 'ALL' && selectedProfile && (
                          <div className="bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              {selectedProfile.avatarUrl ? (
                                <img
                                  src={selectedProfile.avatarUrl}
                                  alt={selectedProfile.name}
                                  className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                                  <Users className="w-4 h-4" />
                                </div>
                              )}
                              <div className="min-w-0 flex flex-col justify-center">
                                <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                  {selectedProfile.name || 'Chưa đặt tên'}
                                </span>
                                {selectedProfile.uid ? (
                                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                    UID: {selectedProfile.uid}
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                                    {selectedProfile.profileUrl}
                                  </span>
                                )}
                              </div>
                            </div>

                            <a
                              href={selectedProfile.profileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-blue-600 transition shrink-0"
                              title="Mở Facebook cá nhân"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  /* Khi ở Link: Nhập link thủ công vào textarea */
                  <textarea
                    rows={3}
                    value={profileUrlsText}
                    onChange={(e) => setProfileUrlsText(e.target.value)}
                    disabled={status === 'RUNNING'}
                    placeholder="https://www.facebook.com/profile.php?id=...&#10;https://www.facebook.com/profile.php?id=..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 transition outline-none font-mono resize-y leading-relaxed disabled:opacity-60"
                  />
                )}
              </div>

              {/* Target Tag & Max Scrolls (Căn chỉnh đồng bộ 100% chuẩn hàng) */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
                <div className="sm:col-span-8 flex flex-col space-y-1.5">
                  <label className="h-5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    <Hash className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>Target Tag / Hashtag</span>
                  </label>
                  <input
                    type="text"
                    value={targetTag}
                    onChange={(e) => setTargetTag(e.target.value)}
                    disabled={status === 'RUNNING'}
                    placeholder="m123_kiemtra (để trống nếu quét tất cả)"
                    className="w-full h-[38px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 transition outline-none disabled:opacity-60"
                  />
                </div>

                <div className="sm:col-span-4 flex flex-col space-y-1.5">
                  <label className="h-5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    <RotateCcw className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>Scrolls tối đa</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={maxScrolls}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setMaxScrolls(Math.min(15, Math.max(1, val || 1)));
                    }}
                    disabled={status === 'RUNNING'}
                    className="w-full h-[38px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 transition outline-none disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Khoảng ngày đăng (Sử dụng DateRangePicker chuẩn giống Video Link) */}
              <div className="flex flex-col space-y-1.5">
                <label className="h-5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>Khoảng ngày đăng (Tùy chọn)</span>
                </label>
                <div className="flex items-center">
                  <DateRangePicker
                    startDate={startDate}
                    endDate={endDate}
                    onChange={({ startDate: s, endDate: e }) => {
                      setStartDate(s);
                      setEndDate(e);
                    }}
                    placeholder="Chọn khoảng ngày đăng..."
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                {status !== 'RUNNING' ? (
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.99] text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Bắt đầu quét Profile</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopScan}
                    className="flex-1 bg-rose-600 hover:bg-rose-500 active:scale-[0.99] text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-md shadow-rose-500/20 cursor-pointer animate-pulse"
                  >
                    <Square className="w-4 h-4 fill-white" />
                    <span>Dừng quét ({progress ? `Profile ${progress.profileIndex}/${progress.totalProfiles}` : 'Đang xử lý...'})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleClear}
                  disabled={status === 'RUNNING'}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 text-xs font-semibold text-slate-600 dark:text-slate-300 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Xóa log và kết quả quét"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Làm mới</span>
                </button>
              </div>
            </form>
          </div>

          {/* Live Terminal Logs */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-500" />
                Live Logs Terminal
              </h2>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-slate-500 flex items-center gap-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-0"
                  />
                  Auto-scroll
                </label>
                <button
                  type="button"
                  onClick={() => setLogs([])}
                  className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                >
                  Xóa log
                </button>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 font-mono text-[11px] text-slate-300 h-48 overflow-y-auto space-y-1 mt-2 shadow-inner">
              {logs.map((line, idx) => {
                let color = 'text-slate-300';
                if (line.includes('[TÌM THẤY]')) color = 'text-emerald-400 font-bold';
                else if (line.includes('[CẢNH BÁO]') || line.includes('[HỆ THỐNG]')) color = 'text-amber-400';
                else if (line.includes('[LỖI')) color = 'text-rose-400 font-bold';
                else if (line.includes('HOÀN THÀNH')) color = 'text-cyan-400 font-bold';
                else if (line.startsWith('>>>')) color = 'text-blue-400 font-semibold';

                return (
                  <div key={idx} className={`${color} leading-relaxed whitespace-pre-wrap break-all`}>
                    {line}
                  </div>
                );
              })}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Status */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Trạng thái</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {status === 'RUNNING' ? 'Đang quét dữ liệu...' : status === 'DONE' ? 'Hoàn thành' : status === 'CANCELLED' ? 'Đã dừng' : status === 'ERROR' ? 'Có lỗi' : 'Sẵn sàng'}
            </div>
          </div>
        </div>

        {/* Card 2: Total Posts */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Bài viết phát hiện</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{postsCount}</div>
          </div>
        </div>

        {/* Card 3: Videos Found */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Video / Reel phát hiện</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{videosCount}</div>
          </div>
        </div>

        {/* Card 4: Matched Target Tag */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Check className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Khớp thẻ #{targetTag}</div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{matchedCount}</div>
          </div>
        </div>
      </div>

      {/* Scanned Results Table Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3.5">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Kết Quả Quét ({filteredPosts.length})
            </h3>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm tác giả, nội dung, link..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none w-48 sm:w-60 focus:border-blue-500"
              />
            </div>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredPosts.length === 0}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition flex items-center gap-1.5 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
              title="Xuất file CSV kết quả quét"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Xuất CSV</span>
            </button>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3 px-3.5 w-12 text-center">STT</th>
                <th className="py-3 px-3.5 min-w-[140px]">Người đăng</th>
                <th className="py-3 px-3.5 w-24">Loại</th>
                <th className="py-3 px-3.5 min-w-[120px]">Tag phát hiện</th>
                <th className="py-3 px-3.5 min-w-[200px]">Nội dung trích đoạn</th>
                <th className="py-3 px-3.5 min-w-[140px]">Tương tác</th>
                <th className="py-3 px-3.5 w-24">Ngày đăng</th>
                <th className="py-3 px-3.5 min-w-[150px]">Link</th>
                <th className="py-3 px-3.5 w-28 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {orderedPosts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                      <p className="font-medium text-xs">Chưa có kết quả quét nào phù hợp.</p>
                      <p className="text-[11px] text-slate-400">
                        Nhập link Profile và bấm "Bắt đầu quét Profile" để thu thập video.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                orderedPosts.map((post) => {
                  const isPostShared = Boolean(post.isShared || post.postType === 'Chia sẻ');
                  const targetVideoUrl = isPostShared
                    ? (post.postUrl && post.postUrl !== 'N/A' ? post.postUrl : post.reelUrl)
                    : (post.reelUrl !== 'N/A'
                      ? post.reelUrl
                      : post.videoUrl !== 'N/A'
                      ? post.videoUrl
                      : post.postUrl);

                  const isAlreadyTracked = videos.some((v) => {
                    if (isPostShared) {
                      return Boolean(
                        post.postUrl &&
                        post.postUrl !== 'N/A' &&
                        (v.link === post.postUrl || (v.postId && (post.postUrl.includes('/' + v.postId) || post.postUrl.includes('=' + v.postId))))
                      );
                    }

                    if (targetVideoUrl && v.link === targetVideoUrl) return true;
                    if (post.reelUrl && v.link === post.reelUrl) return true;
                    if (post.postUrl && v.link === post.postUrl) return true;
                    if (post.videoId && (v.link.includes(post.videoId) || (v.postId && v.postId === post.videoId))) return true;
                    if (
                      post.textPreview &&
                      v.caption &&
                      v.caption.trim() === post.textPreview.trim() &&
                      v.nguoiDang &&
                      post.author &&
                      v.nguoiDang.trim().toLowerCase() === post.author.trim().toLowerCase()
                    ) {
                      return true;
                    }
                    return false;
                  });

                  const isAdded = addedIds.has(post.id) || isAlreadyTracked;

                  return (
                    <tr
                      key={post.id}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                        isPostShared
                          ? 'bg-indigo-50/30 dark:bg-indigo-950/20'
                          : post.hasTargetTag
                          ? 'bg-emerald-500/5'
                          : ''
                      }`}
                    >
                      {/* STT */}
                      <td className="py-3 px-3.5 text-center font-mono text-[11px]">
                        {isPostShared ? (
                          <div className="inline-flex items-center justify-center gap-0.5 text-indigo-500 font-bold">
                            <span className="select-none text-xs">↳</span>
                            <span>{post.sttDisplay}</span>
                          </div>
                        ) : (
                          <span className="text-slate-700 dark:text-slate-200 font-bold">{post.sttDisplay}</span>
                        )}
                      </td>

                      {/* Author */}
                      <td className="py-3 px-3.5">
                        <div
                          className={`font-bold truncate max-w-[150px] flex items-center gap-1 ${
                            isPostShared
                              ? 'text-indigo-600 dark:text-indigo-300 font-normal pl-2'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {isPostShared && <span className="text-indigo-400 select-none text-xs">↳</span>}
                          <span className="truncate">{post.author}</span>
                        </div>
                        {post.profileSource && (
                          <div
                            className={`text-[10px] text-slate-400 truncate max-w-[150px] font-mono ${
                              isPostShared ? 'pl-4' : ''
                            }`}
                          >
                            {post.profileSource.replace('https://www.facebook.com/', '')}
                          </div>
                        )}
                      </td>

                      {/* Loại */}
                      <td className="py-3 px-3.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            isPostShared
                              ? 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30'
                              : 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30'
                          }`}
                        >
                          {isPostShared ? 'Chia sẻ' : post.postType}
                        </span>
                      </td>

                      {/* Tag */}
                      <td className="py-3 px-3.5">
                        {post.hasTargetTag ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40">
                            <Check className="w-3 h-3" />
                            {post.taggedName}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">
                            {post.taggedName !== 'N/A' ? post.taggedName : '—'}
                          </span>
                        )}
                      </td>

                      {/* Caption */}
                      <td className="py-3 px-3.5">
                        <div
                          className={`line-clamp-2 max-w-[280px] flex items-start gap-1 ${
                            isPostShared
                              ? 'text-slate-600 dark:text-slate-300 pl-2 text-xs font-normal'
                              : 'text-slate-800 dark:text-slate-200 text-xs font-semibold'
                          }`}
                          title={post.textPreview}
                        >
                          {isPostShared && (
                            <span className="text-indigo-400 select-none text-xs mt-0.5 shrink-0">↳</span>
                          )}
                          <span className="line-clamp-2">{post.textPreview}</span>
                        </div>
                      </td>

                      {/* Interactions */}
                      <td className="py-3 px-3.5 font-mono text-[11px]">
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                          <span title="Lượt thích">👍 {post.likesCount}</span>
                          <span title="Bình luận">💬 {post.commentsCount}</span>
                          <span title="Lượt chia sẻ">↗ {post.sharesCount}</span>
                          {post.viewsCount !== '-' && (
                            <span className="font-bold text-blue-600 dark:text-blue-400" title="Lượt xem">
                              👁 {post.viewsCount}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Date */}
                      <td className="py-3 px-3.5 text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap">
                        {post.date}
                      </td>

                      {/* Links */}
                      <td className="py-3 px-3.5">
                        <div className="flex flex-col gap-1">
                          {isPostShared ? (
                            <>
                              {/* 1. Link bài chia sẻ (Post Permalink) */}
                              <div className="flex items-center gap-1.5">
                                {post.postUrl && post.postUrl !== 'N/A' ? (
                                  <a
                                    href={post.postUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:underline flex items-center gap-1 font-mono text-[11px] truncate max-w-[130px] text-purple-600 dark:text-purple-400 font-semibold"
                                    title={`Mở bài viết chia sẻ: ${post.postUrl}`}
                                  >
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                    <span>Bài chia sẻ</span>
                                  </a>
                                ) : (
                                  <span className="text-slate-400 text-[11px]">N/A (Bài chia sẻ)</span>
                                )}

                                {post.postUrl && post.postUrl !== 'N/A' && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(post.postUrl, `post_${post.id}`)}
                                    className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                                    title="Sao chép link bài chia sẻ (Permalink)"
                                  >
                                    {copiedId === `post_${post.id}` ? (
                                      <Check className="w-3 h-3 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                )}
                              </div>

                              {/* 2. Link video/Reel gốc */}
                              {post.reelUrl && post.reelUrl !== 'N/A' ? (
                                <div className="flex items-center gap-1 text-[10px] pl-0.5">
                                  <a
                                    href={post.reelUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-slate-500 dark:text-slate-400 hover:text-blue-500 hover:underline flex items-center gap-0.5 truncate max-w-[120px]"
                                    title={`Video/Reel gốc: ${post.reelUrl}`}
                                  >
                                    <span>↳ Reel gốc</span>
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(post.reelUrl, `reel_${post.id}`)}
                                    className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                                    title="Sao chép link Reel gốc"
                                  >
                                    {copiedId === `reel_${post.id}` ? (
                                      <Check className="w-2.5 h-2.5 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-2.5 h-2.5" />
                                    )}
                                  </button>
                                </div>
                              ) : post.videoUrl && post.videoUrl !== 'N/A' && post.videoUrl !== post.postUrl ? (
                                <div className="flex items-center gap-1 text-[10px] pl-0.5">
                                  <a
                                    href={post.videoUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-slate-500 dark:text-slate-400 hover:text-blue-500 hover:underline flex items-center gap-0.5 truncate max-w-[120px]"
                                    title={`Video gốc: ${post.videoUrl}`}
                                  >
                                    <span>↳ Video gốc</span>
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(post.videoUrl, `reel_${post.id}`)}
                                    className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                                    title="Sao chép link Video gốc"
                                  >
                                    {copiedId === `reel_${post.id}` ? (
                                      <Check className="w-2.5 h-2.5 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-2.5 h-2.5" />
                                    )}
                                  </button>
                                </div>
                              ) : null}
                            </>
                          ) : (
                            /* Bài đăng gốc (FB Reel) */
                            <div className="flex items-center gap-1.5">
                              {targetVideoUrl && targetVideoUrl !== 'N/A' ? (
                                <a
                                  href={targetVideoUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:underline flex items-center gap-1 font-mono text-[11px] truncate max-w-[130px] text-blue-600 dark:text-blue-400 font-semibold"
                                  title={`Link Reel: ${targetVideoUrl}`}
                                >
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                  <span>Reel/Video</span>
                                </a>
                              ) : (
                                <span className="text-slate-400 text-[11px]">N/A</span>
                              )}

                              {targetVideoUrl && targetVideoUrl !== 'N/A' && (
                                <button
                                  type="button"
                                  onClick={() => handleCopy(targetVideoUrl, post.id)}
                                  className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                                  title="Sao chép link video"
                                >
                                  {copiedId === post.id ? (
                                    <Check className="w-3 h-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3.5 text-center">
                        {isAdmin && onAddVideo && targetVideoUrl && targetVideoUrl !== 'N/A' ? (
                          <button
                            type="button"
                            onClick={() => handleAddToTracker(post)}
                            disabled={isAdded}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition inline-flex items-center gap-1 ${
                              isAdded
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                                : 'bg-blue-50 dark:bg-blue-500/15 hover:bg-blue-100 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30'
                            }`}
                            title={
                              isPostShared
                                ? 'Thêm bài chia sẻ này vào Tracker để theo dõi riêng'
                                : 'Thêm video này vào Video Tracker chính để theo dõi tự động'
                            }
                          >
                            {isAdded ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Đã theo dõi</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3 h-3" />
                                <span>Thêm</span>
                              </>
                            )}
                          </button>
                        ) : isPostShared && (!targetVideoUrl || targetVideoUrl === 'N/A') ? (
                          <span className="text-slate-400 text-[10px] italic" title="Bài chia sẻ chưa có link permalink">
                            Chưa có link
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cookie Manager Modal (Chỉ Admin) */}
      {isAdmin && isCookieModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Quản Lý Cookie Facebook
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCookieModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Facebook yêu cầu đăng nhập đối với một số trang cá nhân (Personal Profile). Dán chuỗi raw Cookie (dạng <code className="text-blue-600 font-mono">c_user=...; xs=...</code>) hoặc mảng JSON xuất từ extension Cookie-Editor:
            </p>

            <textarea
              rows={6}
              value={rawCookieInput}
              onChange={(e) => setRawCookieInput(e.target.value)}
              placeholder="c_user=1000...; xs=...;&#10;hoặc [ { 'name': 'c_user', 'value': '...' } ]"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-3 text-xs font-mono text-slate-800 dark:text-slate-200 outline-none resize-y"
            />

            {cookieSaveMsg && (
              <div className="text-xs font-medium p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                {cookieSaveMsg}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-slate-500 font-medium">
                Hiện có: <strong className="text-blue-600">{cookieCount}</strong> cookie hợp lệ
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCookieModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleSaveCookie}
                  disabled={isSavingCookie}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/25 transition disabled:opacity-60"
                >
                  {isSavingCookie ? 'Đang lưu...' : 'Lưu Cookie'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Realtime Toast Notification */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
