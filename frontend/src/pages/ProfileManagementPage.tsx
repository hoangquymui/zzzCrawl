import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserCheck,
  Play,
  Square,
  RotateCcw,
  Download,
  Search,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  Users,
  Activity,
  Terminal,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Pencil,
  ArrowLeftRight,
  X,
  Save,
} from 'lucide-react';
import { socket } from '../services/socket';
import { profileManagementApi } from '../services/profile-management.service';
import { cookieApi } from '../services/cookie.service';
import { Toast } from '../components/Toast';
import { ToastItem } from '../types/video';
import { useResizableColumns } from '../hooks/useResizableColumns';
import { ResizeHandle } from '../components/ResizeHandle';
import { FacebookIcon, TikTokIcon } from '../components/Icons';
import {
  UserProfileItem,
  ProfileCrawlProgress,
  ProfileManagementState,
} from '../types/profile-management';
import { useAuth } from '../context/AuthContext';

export function getProfilePlatform(rawUrl?: string, uid?: string): 'facebook' | 'tiktok' {
  const url = (rawUrl || '').toLowerCase();
  const id = (uid || '').toLowerCase();
  if (url.includes('tiktok.com') || url.startsWith('@') || id.startsWith('@')) {
    return 'tiktok';
  }
  return 'facebook';
}

function normalizeProfileUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  let s = rawUrl.trim();
  s = s.replace(/\\+\//g, '/');
  s = s.replace(/\\+u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
  s = s.replace(/[\/\\]u0025([0-9a-fA-F]{2})/gi, (_, hex) => '%' + hex);
  s = s.replace(/u0025([0-9a-fA-F]{2})/gi, (_, hex) => '%' + hex);
  if (s.startsWith('@')) {
    s = 'https://www.tiktok.com/' + s;
  }
  if (/\/people\/[^/]+\/\d+$/i.test(s)) {
    s += '/';
  }
  return s;
}

export const ProfileManagementPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  // Input URLs
  const [profileUrlsText, setProfileUrlsText] = useState('');

  // Status & Data
  const [status, setStatus] = useState<ProfileManagementState['status']>('IDLE');
  const [logs, setLogs] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<UserProfileItem[]>([]);
  const [progress, setProgress] = useState<ProfileCrawlProgress | null>(null);

  // Cookie status
  const [hasCookie, setHasCookie] = useState<boolean>(false);
  const [cookieCount, setCookieCount] = useState<number>(0);

  // Toast state
  const [toast, setToast] = useState<ToastItem | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now().toString(), message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  };

  // UI state
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSyncingData, setIsSyncingData] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Edit Profile modal state
  const [editingProfile, setEditingProfile] = useState<UserProfileItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editUid, setEditUid] = useState('');
  const [editPlatform, setEditPlatform] = useState<'facebook' | 'tiktok'>('facebook');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Kéo giãn độ rộng các cột của bảng
  const { widths: colWidths, handleMouseDown: handleColResize } = useResizableColumns(
    {
      stt: 60,
      name: 260,
      platform: 120,
      uid: 200,
      actions: 140,
    },
    'profile_management_table'
  );

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Load initial data
  const loadData = async () => {
    try {
      setIsLoading(true);
      const state = await profileManagementApi.getState();
      setStatus(state.status);
      setLogs(state.logs || []);
      setProfiles(state.profiles || []);
      setProgress(state.progress || null);

      // Fetch cookie status
      const cookieData = await cookieApi.getCookieInfo().catch(() => null);
      if (cookieData) {
        setHasCookie(cookieData.hasCookie);
        setCookieCount(cookieData.cookieCount);
      }
    } catch (err: unknown) {
      console.error('Lỗi khi tải dữ liệu profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Realtime Socket listeners
  useEffect(() => {
    const handleLog = (data: { message: string }) => {
      setLogs((prev) => [...prev, data.message]);
    };

    const handleItem = (item: UserProfileItem) => {
      setProfiles((prev) => {
        const existIdx = prev.findIndex(
          (p) => p.profileUrl === item.profileUrl || (item.uid && p.uid === item.uid)
        );
        if (existIdx !== -1) {
          const next = [...prev];
          next[existIdx] = item;
          return next;
        }
        return [item, ...prev];
      });
    };

    const handleProgress = (prog: ProfileCrawlProgress) => {
      setProgress(prog);
    };

    const handleStatus = (data: { status: ProfileManagementState['status'] }) => {
      setStatus(data.status);
      if (data.status === 'DONE' || data.status === 'IDLE') {
        loadData();
      }
    };

    socket.on('profile_mgmt_log', handleLog);
    socket.on('profile_mgmt_item', handleItem);
    socket.on('profile_mgmt_progress', handleProgress);
    socket.on('profile_mgmt_status', handleStatus);

    return () => {
      socket.off('profile_mgmt_log', handleLog);
      socket.off('profile_mgmt_item', handleItem);
      socket.off('profile_mgmt_progress', handleProgress);
      socket.off('profile_mgmt_status', handleStatus);
    };
  }, []);

  // Auto scroll terminal logs
  useEffect(() => {
    if (autoScroll && isTerminalOpen && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, isTerminalOpen]);

  // Handle start crawling
  const handleStartCrawl = async () => {
    setErrorMsg(null);

    const urls = profileUrlsText
      .split(/[\r\n,;]+/)
      .map((u) => normalizeProfileUrl(u))
      .filter((u) => u.length > 0);

    if (urls.length === 0) {
      setErrorMsg('Vui lòng nhập ít nhất một đường dẫn Facebook hoặc TikTok cá nhân.');
      return;
    }

    const hasFacebook = urls.some((u) => !u.includes('tiktok.com') && !u.startsWith('@'));
    if (hasFacebook && (!hasCookie || cookieCount === 0)) {
      showToast('Chưa nạp cookie Facebook! Vui lòng vào mục Cookie để nạp cookie trước khi cào trang Facebook.', 'error');
      return;
    }

    try {
      await profileManagementApi.crawlProfiles(urls);
      setStatus('SCANNING');
      setIsTerminalOpen(true);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || 'Không thể bắt đầu tiến trình cào profile.');
    }
  };

  // Handle stop
  const handleStopCrawl = async () => {
    try {
      await profileManagementApi.stopCrawl();
      setStatus('STOPPED');
    } catch (err: unknown) {
      console.error('Lỗi dừng cào:', err);
    }
  };

  // Handle delete one
  const handleDeleteProfile = async (id: string, name: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa thông tin profile "${name}"?`)) return;
    try {
      await profileManagementApi.deleteProfile(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch (err: unknown) {
      alert('Lỗi xóa profile: ' + ((err as Error)?.message || String(err)));
    }
  };

  // Handle clear all
  const handleClearAll = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa toàn bộ danh sách profile đã cào?')) return;
    try {
      await profileManagementApi.clearAll();
      setProfiles([]);
    } catch (err: unknown) {
      alert('Lỗi xóa tất cả: ' + ((err as Error)?.message || String(err)));
    }
  };

  // Quét người dùng dựa trên dữ liệu video/bài viết (đối chiếu UID, nếu chưa có thì thêm profile)
  const handleSyncFromData = async () => {
    setIsSyncingData(true);
    try {
      const res = await profileManagementApi.syncFromVideos();
      if (res.addedCount > 0) {
        showToast(res.message, 'success');
      } else {
        showToast(res.message, 'info');
      }
      await loadData();
    } catch (err: unknown) {
      showToast((err as Error)?.message || 'Lỗi khi quét người dùng từ dữ liệu', 'error');
    } finally {
      setIsSyncingData(false);
    }
  };

  // Chuyển đổi nhanh phân loại nền tảng (Facebook <-> TikTok)
  const handleTogglePlatform = async (p: UserProfileItem) => {
    if (!isAdmin) return;
    const currentPlatform = getProfilePlatform(p.profileUrl, p.uid);
    const targetPlatform = currentPlatform === 'facebook' ? 'tiktok' : 'facebook';
    try {
      const res = await profileManagementApi.updateProfile(p.id, { platform: targetPlatform });
      setProfiles((prev) => prev.map((item) => (item.id === p.id ? res.item : item)));
      showToast(
        `Đã chuyển phân loại "${p.name}" sang ${targetPlatform === 'facebook' ? 'Facebook' : 'TikTok'}.`,
        'success'
      );
    } catch (err: unknown) {
      showToast(`Không thể đổi phân loại: ${(err as Error)?.message || String(err)}`, 'error');
    }
  };

  // Mở modal chỉnh sửa profile
  const handleOpenEdit = (p: UserProfileItem) => {
    setEditingProfile(p);
    setEditName(p.name || '');
    setEditUrl(p.profileUrl || '');
    setEditUid(p.uid || '');
    setEditPlatform(getProfilePlatform(p.profileUrl, p.uid));
  };

  // Lưu chỉnh sửa profile
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;
    try {
      setIsSavingEdit(true);
      const res = await profileManagementApi.updateProfile(editingProfile.id, {
        name: editName.trim(),
        profileUrl: editUrl.trim(),
        uid: editUid.trim() || undefined,
        platform: editPlatform,
      });
      setProfiles((prev) => prev.map((item) => (item.id === editingProfile.id ? res.item : item)));
      showToast(`Đã lưu thay đổi cho profile "${editName}".`, 'success');
      setEditingProfile(null);
    } catch (err: unknown) {
      showToast(`Lỗi khi lưu profile: ${(err as Error)?.message || String(err)}`, 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Copy link helper
  const handleCopyLink = (url: string, id: string) => {
    const cleanUrl = normalizeProfileUrl(url);
    navigator.clipboard.writeText(cleanUrl).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // Export CSV
  const handleExportCsv = () => {
    if (profiles.length === 0) {
      alert('Chưa có dữ liệu để xuất file.');
      return;
    }

    const headers = [
      'STT',
      'Họ và tên',
      'Loại',
      'UID',
      'Link Profile',
      'Ngày quét',
    ];

    const rows = profiles.map((p, idx) => [
      idx + 1,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${getProfilePlatform(p.profileUrl, p.uid) === 'facebook' ? 'Facebook' : 'TikTok'}"`,
      `"${(p.uid || '').replace(/"/g, '""')}"`,
      `"${(normalizeProfileUrl(p.profileUrl) || '').replace(/"/g, '""')}"`,
      `"${p.crawledAt || ''}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `user_profiles_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Search filter
  const filteredProfiles = profiles.filter((p) => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    const platform = getProfilePlatform(p.profileUrl, p.uid);
    const platformMatch =
      platform.includes(term) ||
      (term === 'fb' && platform === 'facebook') ||
      (term === 'tt' && platform === 'tiktok');
    return (
      (p.name && p.name.toLowerCase().includes(term)) ||
      (p.uid && p.uid.toLowerCase().includes(term)) ||
      (p.profileUrl && p.profileUrl.toLowerCase().includes(term)) ||
      platformMatch
    );
  });

  // KPI calculations
  const totalCount = profiles.length;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Quản lý Profile Cá Nhân
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Nhập danh sách link Facebook hoặc TikTok cá nhân để cào bảng thông tin: Họ và tên, Loại, UID, Link Profile.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={profiles.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 disabled:opacity-40 transition cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4 text-emerald-500" />
              Xuất CSV
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={handleClearAll}
                disabled={profiles.length === 0 || status === 'SCANNING'}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 disabled:opacity-40 transition cursor-pointer shadow-xs"
              >
                <Trash2 className="w-4 h-4 text-rose-500" />
                Xóa tất cả
              </button>
            )}

            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition cursor-pointer shadow-xs"
            >
              <RotateCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>
        </div>
      </div>

      {/* Input Link Section Card (Chỉ Admin mới có quyền nhập link và cào dữ liệu) */}
      {isAdmin && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              Danh sách Link Profile cá nhân (Mỗi link 1 dòng)
            </label>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Hỗ trợ Facebook (profile.php?id=..., username) và TikTok (@username, tiktok.com/@...)
            </span>
          </div>

          <textarea
            rows={3}
            value={profileUrlsText}
            onChange={(e) => setProfileUrlsText(e.target.value)}
            placeholder="https://www.facebook.com/username&#10;https://www.tiktok.com/@username&#10;@username"
            className="w-full text-xs font-mono p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/60 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition resize-y"
          />

          {errorMsg && (
            <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 p-3 rounded-xl border border-rose-200 dark:border-rose-900/50">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
            <div className="flex items-center">
              {hasCookie ? (
                <button
                  type="button"
                  onClick={() => navigate('/cookie')}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-xs bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                  title="Bấm để vào trang quản lý Cookie"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span>Cookie: đã nạp</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-500 ml-0.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/cookie')}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-xs bg-rose-50/60 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400"
                  title="Bấm để vào trang quản lý Cookie"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                  <span>Cookie: chưa nạp</span>
                  <ShieldAlert className="w-4 h-4 text-rose-500 ml-0.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {status === 'SCANNING' ? (
                <button
                  type="button"
                  onClick={handleStopCrawl}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-md transition cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-white" />
                  Dừng cào
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartCrawl}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 active:scale-98 text-white shadow-md shadow-blue-500/20 transition cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  Bắt đầu cào thông tin
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KPI Stats Cards (Chỉ Admin mới hiển thị) */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 max-w-xl gap-4">
          {/* Card 1: Tổng profile */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Tổng Profile</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{totalCount}</p>
            </div>
          </div>

          {/* Card 2: Trạng thái cào */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Trạng thái</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    status === 'SCANNING'
                      ? 'bg-blue-500 animate-ping'
                      : status === 'DONE'
                      ? 'bg-emerald-500'
                      : status === 'STOPPED'
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`}
                />
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {status === 'SCANNING'
                    ? 'Đang cào...'
                    : status === 'DONE'
                    ? 'Hoàn thành'
                    : status === 'STOPPED'
                    ? 'Đã dừng'
                    : 'Sẵn sàng'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Realtime Terminal & Progress (Chỉ Admin mới hiển thị Terminal) */}
      {isAdmin && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                Nhật ký tiến trình cào (Terminal Logs)
              </span>
              {progress && status === 'SCANNING' && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                  {progress.current}/{progress.total}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <label className="hidden sm:flex items-center gap-1.5 text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                />
                <span>Tự cuộn</span>
              </label>

              <button
                type="button"
                onClick={() => setIsTerminalOpen(!isTerminalOpen)}
                className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition"
                title={isTerminalOpen ? 'Thu gọn' : 'Mở rộng'}
              >
                {isTerminalOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Progress Bar when scanning */}
          {progress && status === 'SCANNING' && (
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-300 ease-out"
                style={{
                  width: `${Math.min(100, Math.round((progress.current / Math.max(1, progress.total)) * 100))}%`,
                }}
              />
            </div>
          )}

          {/* Terminal Content */}
          {isTerminalOpen && (
            <div className="p-4 bg-slate-950 text-slate-100 font-mono text-[11px] sm:text-xs max-h-48 overflow-y-auto space-y-1">
              {logs.length === 0 ? (
                <div className="text-slate-500 italic">Chưa có nhật ký hoạt động.</div>
              ) : (
                logs.map((log, index) => (
                  <div
                    key={index}
                    className={`leading-relaxed break-all ${
                      log.includes('✔')
                        ? 'text-emerald-400'
                        : log.includes('✖') || log.includes('LỖI')
                        ? 'text-rose-400'
                        : log.includes('>>>')
                        ? 'text-cyan-300 font-semibold'
                        : log.includes('===')
                        ? 'text-blue-400 font-bold'
                        : 'text-slate-300'
                    }`}
                  >
                    {log}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}

      {/* Main Profiles Table Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {/* Table Header Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Bảng Thông Tin Profile ({filteredProfiles.length})
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Nút Quét người dùng dựa trên dữ liệu (thay thế Tất cả, Thành công, Lỗi) */}
            <button
              type="button"
              onClick={handleSyncFromData}
              disabled={isSyncingData}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              title="Quét UID đối chiếu với UID trong dữ liệu, nếu chưa có thì thêm profile, có rồi thì thôi"
            >
              {isSyncingData ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang quét...</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Quét người dùng dựa trên dữ liệu</span>
                </>
              )}
            </button>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm họ tên, UID, link profile..."
                className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          </div>
        </div>

        {/* Profiles Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <th style={{ width: colWidths.stt, minWidth: colWidths.stt }} className="relative py-3 px-4 text-center shrink-0 border-r border-slate-200 dark:border-slate-800">
                  STT
                  <ResizeHandle onMouseDown={(e) => handleColResize('stt', e)} />
                </th>
                <th style={{ width: colWidths.name, minWidth: colWidths.name }} className="relative py-3 px-4 border-r border-slate-200 dark:border-slate-800">
                  Họ và tên
                  <ResizeHandle onMouseDown={(e) => handleColResize('name', e)} />
                </th>
                <th style={{ width: colWidths.platform, minWidth: colWidths.platform }} className="relative py-3 px-4 text-center border-r border-slate-200 dark:border-slate-800">
                  Loại
                  <ResizeHandle onMouseDown={(e) => handleColResize('platform', e)} />
                </th>
                <th style={{ width: colWidths.uid, minWidth: colWidths.uid }} className="relative py-3 px-4 border-r border-slate-200 dark:border-slate-800">
                  UID
                  <ResizeHandle onMouseDown={(e) => handleColResize('uid', e)} />
                </th>
                <th style={{ width: colWidths.actions, minWidth: colWidths.actions }} className="relative py-3 px-4 text-right">
                  Thao tác
                  <ResizeHandle onMouseDown={(e) => handleColResize('actions', e)} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
              {filteredProfiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                      <p className="font-medium">Chưa có thông tin profile nào.</p>
                      <p className="text-[11px]">
                        Nhập liên kết ở trên hoặc bấm "Quét người dùng dựa trên dữ liệu" để cập nhật.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((p, idx) => (
                  <tr
                    key={p.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    {/* STT */}
                    <td style={{ width: colWidths.stt, minWidth: colWidths.stt }} className="py-3.5 px-4 text-center font-mono text-slate-400 border-r border-slate-100 dark:border-slate-800/60">
                      {idx + 1}
                    </td>

                    {/* Họ và tên */}
                    <td style={{ width: colWidths.name, minWidth: colWidths.name }} className="py-3.5 px-4 border-r border-slate-100 dark:border-slate-800/60">
                      <div className="flex items-center gap-3">
                        {p.avatarUrl ? (
                          <img
                            src={p.avatarUrl}
                            alt={p.name}
                            className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                'https://static.xx.fbcdn.net/rsrc.php/v3/yo/r/UlIqmHJn-SK.gif';
                            }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-500/20">
                            {p.name ? p.name.charAt(0).toUpperCase() : 'U'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 dark:text-white truncate">
                            {p.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span
                              className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                                p.status === 'SUCCESS'
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                                  : p.status === 'ERROR'
                                  ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                                  : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {p.status === 'SUCCESS'
                                ? 'Thành công'
                                : p.status === 'ERROR'
                                ? 'Lỗi'
                                : 'Một phần'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Loại (Facebook / TikTok) */}
                    <td style={{ width: colWidths.platform, minWidth: colWidths.platform }} className="py-3.5 px-4 text-center border-r border-slate-100 dark:border-slate-800/60">
                      {(() => {
                        const isFB = getProfilePlatform(p.profileUrl, p.uid) === 'facebook';
                        return (
                          <button
                            type="button"
                            disabled={!isAdmin}
                            onClick={() => handleTogglePlatform(p)}
                            className={`group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border shrink-0 transition-all cursor-pointer hover:shadow-xs active:scale-95 disabled:cursor-default disabled:hover:shadow-none ${
                              isFB
                                ? 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                                : 'bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/40 dark:hover:bg-pink-900/50 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-800'
                            }`}
                            title={isAdmin ? `Nhấp để chuyển nhanh sang ${isFB ? 'TikTok' : 'Facebook'}` : undefined}
                          >
                            {isFB ? (
                              <FacebookIcon className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <TikTokIcon className="w-3 h-3 text-pink-600 dark:text-pink-400" />
                            )}
                            <span>{isFB ? 'Facebook' : 'TikTok'}</span>
                            {isAdmin && (
                              <ArrowLeftRight className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100 transition-opacity" />
                            )}
                          </button>
                        );
                      })()}
                    </td>

                    {/* UID */}
                    <td style={{ width: colWidths.uid, minWidth: colWidths.uid }} className="py-3.5 px-4 font-mono text-xs border-r border-slate-100 dark:border-slate-800/60">
                      {p.uid ? (
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold border border-slate-200 dark:border-slate-700">
                          {p.uid}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Chưa rõ</span>
                      )}
                    </td>

                    {/* Thao tác */}
                    <td style={{ width: colWidths.actions, minWidth: colWidths.actions }} className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        {/* Mở Facebook / TikTok */}
                        {(() => {
                          const isFB = getProfilePlatform(p.profileUrl, p.uid) === 'facebook';
                          return (
                            <a
                              href={normalizeProfileUrl(p.profileUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition ${
                                isFB
                                  ? 'hover:text-blue-600 dark:hover:text-blue-400'
                                  : 'hover:text-pink-600 dark:hover:text-pink-400'
                              }`}
                              title={isFB ? 'Mở Facebook' : 'Mở TikTok'}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          );
                        })()}

                        {/* Copy Link */}
                        <button
                          type="button"
                          onClick={() => handleCopyLink(normalizeProfileUrl(p.profileUrl), p.id)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition cursor-pointer"
                          title="Copy Link Profile"
                        >
                          {copiedId === p.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Chỉnh sửa thông tin profile (Chỉ Admin) */}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer"
                            title="Chỉnh sửa profile"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Xóa (Chỉ Admin mới có quyền xóa) */}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteProfile(p.id, p.name)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                            title="Xóa thông tin này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Chỉnh sửa Profile */}
      {editingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setEditingProfile(null)}
          />
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Chỉnh sửa thông tin Profile
                  </h3>
                  <p className="text-xs text-slate-400">
                    Phân loại nền tảng và cập nhật thông tin nhận diện
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingProfile(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Phân loại nền tảng (Loại)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEditPlatform('facebook');
                      if (editUrl.includes('tiktok.com/@')) {
                        const m = editUrl.match(/tiktok\.com\/@([^/?#]+)/i);
                        if (m) setEditUrl(`https://www.facebook.com/${m[1]}`);
                      }
                    }}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border font-semibold transition cursor-pointer ${
                      editPlatform === 'facebook'
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700 ring-2 ring-blue-500/20'
                        : 'bg-white dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <FacebookIcon className="w-4 h-4 text-blue-600" />
                    <span>Facebook</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditPlatform('tiktok');
                      if (editUrl.includes('facebook.com')) {
                        const clean = editUrl.replace(/^https?:\/\/(?:www\.)?facebook\.com\/?/i, '').replace(/\/+$/, '');
                        if (clean) setEditUrl(`https://www.tiktok.com/@${clean}`);
                      }
                    }}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border font-semibold transition cursor-pointer ${
                      editPlatform === 'tiktok'
                        ? 'bg-pink-50 dark:bg-pink-950/50 text-pink-600 dark:text-pink-400 border-pink-300 dark:border-pink-700 ring-2 ring-pink-500/20'
                        : 'bg-white dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <TikTokIcon className="w-4 h-4 text-pink-600" />
                    <span>TikTok</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Họ và tên *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nhập họ và tên..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Đường dẫn Profile (URL) *
                </label>
                <input
                  type="text"
                  required
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  placeholder="https://www.facebook.com/... hoặc https://www.tiktok.com/@..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-[11px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  UID (Định danh / Username)
                </label>
                <input
                  type="text"
                  value={editUid}
                  onChange={(e) => setEditUid(e.target.value)}
                  placeholder="UID số hoặc username..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-[11px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Lưu thay đổi</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Realtime Toast Notification */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
