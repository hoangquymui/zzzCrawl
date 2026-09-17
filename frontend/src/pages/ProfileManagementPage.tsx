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
} from 'lucide-react';
import { socket } from '../services/socket';
import { profileManagementApi } from '../services/profile-management.service';
import { cookieApi } from '../services/cookie.service';
import { Toast } from '../components/Toast';
import { ToastItem } from '../types/video';
import {
  UserProfileItem,
  ProfileCrawlProgress,
  ProfileManagementState,
} from '../types/profile-management';
import { useAuth } from '../context/AuthContext';

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
  const toastTimerRef = useRef<any>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now().toString(), message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  };

  // UI state
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'success' | 'error'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    } catch (err: any) {
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

    // Kiểm tra cookie trước khi cào
    if (!hasCookie || cookieCount === 0) {
      showToast('Chưa nạp cookie! Vui lòng vào mục Cookie để nạp cookie trước khi cào.', 'error');
      return;
    }

    const urls = profileUrlsText
      .split(/[\r\n,;]+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urls.length === 0) {
      setErrorMsg('Vui lòng nhập ít nhất một đường dẫn Facebook cá nhân.');
      return;
    }

    try {
      await profileManagementApi.crawlProfiles(urls);
      setStatus('SCANNING');
      setIsTerminalOpen(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Không thể bắt đầu tiến trình cào profile.');
    }
  };

  // Handle stop
  const handleStopCrawl = async () => {
    try {
      await profileManagementApi.stopCrawl();
      setStatus('STOPPED');
    } catch (err: any) {
      console.error('Lỗi dừng cào:', err);
    }
  };

  // Handle delete one
  const handleDeleteProfile = async (id: string, name: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa thông tin profile "${name}"?`)) return;
    try {
      await profileManagementApi.deleteProfile(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      alert('Lỗi xóa profile: ' + err.message);
    }
  };

  // Handle clear all
  const handleClearAll = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa toàn bộ danh sách profile đã cào?')) return;
    try {
      await profileManagementApi.clearAll();
      setProfiles([]);
    } catch (err: any) {
      alert('Lỗi xóa tất cả: ' + err.message);
    }
  };

  // Copy link helper
  const handleCopyLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url).then(() => {
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
      'UID',
      'Link Profile',
      'Ngày quét',
    ];

    const rows = profiles.map((p, idx) => [
      idx + 1,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.uid || '').replace(/"/g, '""')}"`,
      `"${(p.profileUrl || '').replace(/"/g, '""')}"`,
      `"${p.crawledAt || ''}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `facebook_profiles_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter & Search
  const filteredProfiles = profiles.filter((p) => {
    // Search match
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !term ||
      (p.name && p.name.toLowerCase().includes(term)) ||
      (p.uid && p.uid.toLowerCase().includes(term)) ||
      (p.profileUrl && p.profileUrl.toLowerCase().includes(term));

    if (!matchesSearch) return false;

    // Filter match
    if (filterType === 'success') return p.status === 'SUCCESS';
    if (filterType === 'error') return p.status !== 'SUCCESS';
    return true;
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
                Nhập danh sách link Facebook cá nhân để cào bảng thông tin: Họ và tên, UID, Link Profile.
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
              Hỗ trợ định dạng profile.php?id=... hoặc link username facebook.com/tennguoidung
            </span>
          </div>

          <textarea
            rows={3}
            value={profileUrlsText}
            onChange={(e) => setProfileUrlsText(e.target.value)}
            placeholder="https://www.facebook.com/profile.php?id=...&#10;https://www.facebook.com/username"
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
            {/* Filter Tabs */}
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={() => setFilterType('success')}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  filterType === 'success'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Thành công
              </button>
              <button
                type="button"
                onClick={() => setFilterType('error')}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  filterType === 'error'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Lỗi
              </button>
            </div>

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
                <th className="py-3 px-4 w-12 text-center">STT</th>
                <th className="py-3 px-4 min-w-[220px]">Họ và tên</th>
                <th className="py-3 px-4 min-w-[140px]">UID</th>
                <th className="py-3 px-4 min-w-[110px] text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
              {filteredProfiles.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                      <p className="font-medium">Chưa có thông tin profile nào.</p>
                      <p className="text-[11px]">
                        Nhập liên kết Facebook ở trên và bấm "Bắt đầu cào thông tin" để quét.
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
                    <td className="py-3.5 px-4 text-center font-mono text-slate-400">
                      {idx + 1}
                    </td>

                    {/* Họ và tên */}
                    <td className="py-3.5 px-4">
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

                    {/* UID */}
                    <td className="py-3.5 px-4 font-mono text-xs">
                      {p.uid ? (
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold border border-slate-200 dark:border-slate-700">
                          {p.uid}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Chưa rõ</span>
                      )}
                    </td>

                    {/* Thao tác */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        {/* Mở Facebook */}
                        <a
                          href={p.profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition"
                          title="Mở Facebook"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>

                        {/* Copy Link */}
                        <button
                          type="button"
                          onClick={() => handleCopyLink(p.profileUrl, p.id)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition cursor-pointer"
                          title="Copy Link Profile"
                        >
                          {copiedId === p.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

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

      {/* Realtime Toast Notification */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
