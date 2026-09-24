import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Moon,
  Sun,
  Clock,
  Radio,
  Database,
  Download,
  Upload,
  Save,
  HardDrive,
  Video,
  Users,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { settingsApi, SystemSettingsData } from '../services/settings.service';
import { Toast } from '../components/Toast';
import { ToastItem } from '../types/video';

interface SettingsPageProps {
  isConnected: boolean;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ isConnected }) => {
  const { theme, toggleTheme } = useTheme();
  const { isAdmin } = useAuth();

  const [settings, setSettings] = useState<SystemSettingsData | null>(null);
  const [intervalMinutes, setIntervalMinutes] = useState<number>(3);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSavingInterval, setIsSavingInterval] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);

  // File input ref for DB import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast
  const [toast, setToast] = useState<ToastItem | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now().toString(), message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  };

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const data = await settingsApi.getSettings();
      setSettings(data);
      setIntervalMinutes(data.autoRefreshMinutes || 3);
    } catch (err: any) {
      showToast(err.message || 'Không thể tải cài đặt hệ thống', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSaveInterval = async () => {
    if (intervalMinutes < 3) {
      showToast('Chu kỳ quét tự động tối thiểu là 3 phút!', 'error');
      return;
    }

    try {
      setIsSavingInterval(true);
      const res = await settingsApi.updateInterval(intervalMinutes);
      showToast(res.message || `Đã cập nhật chu kỳ quét thành ${intervalMinutes} phút.`, 'success');
      loadSettings();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi lưu chu kỳ quét', 'error');
    } finally {
      setIsSavingInterval(false);
    }
  };

  const handleExportDatabase = async () => {
    try {
      setIsExporting(true);
      await settingsApi.exportDatabase();
      showToast('Đã tải xuống tệp cơ sở dữ liệu SQLite thành công!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi xuất cơ sở dữ liệu', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so the same file can be selected again
    e.target.value = '';

    const confirmMsg = `Bạn có chắc chắn muốn nhập cơ sở dữ liệu từ tệp "${file.name}" (${(file.size / 1024).toFixed(1)} KB)?\n\nLƯU Ý: Toàn bộ dữ liệu hiện tại sẽ được ghi đè bằng tệp này (hệ thống sẽ tự động tạo một bản sao lưu an toàn tại database.sqlite.bak).`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsImporting(true);
      const res = await settingsApi.importDatabase(file);
      showToast(res.message || 'Đã nhập cơ sở dữ liệu thành công!', 'success');
      loadSettings();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi nhập cơ sở dữ liệu', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}

      {/* Hidden File Input for Database Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".sqlite,.db"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Banner */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Cài Đặt Hệ Thống</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Cấu hình chu kỳ tự động quét video, quản lý sao lưu / khôi phục cơ sở dữ liệu SQLite và trạng thái hệ thống
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadSettings}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 transition cursor-pointer disabled:opacity-50"
            title="Làm mới cài đặt"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Tải lại</span>
          </button>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 shadow-xs">
        {/* 1. Theme Setting */}
        <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold text-sm text-slate-900 dark:text-white">Giao Diện Màu Sắc (Theme)</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Chuyển đổi giữa chế độ Sáng (Light) và Tối (Dark)
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer transition hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span>Chế độ Tối (Bấm để đổi Sáng)</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-indigo-600" />
                <span>Chế độ Sáng (Bấm để đổi Tối)</span>
              </>
            )}
          </button>
        </div>

        {/* 2. Crawl Interval */}
        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="max-w-xl">
            <div className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              Chu Kỳ Tự Động Quét Video
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Hệ thống tự động kích hoạt worker chạy ngầm cập nhật lại số liệu tương tác (Like, Share, Cmt, View) của toàn bộ danh sách video. Yêu cầu tối thiểu <span className="font-bold text-blue-600 dark:text-blue-400">≥ 3 phút</span>.
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center">
              <input
                type="number"
                min={3}
                max={1440}
                step={1}
                value={intervalMinutes}
                disabled={!isAdmin || isSavingInterval}
                onChange={(e) => setIntervalMinutes(Math.max(1, parseInt(e.target.value, 10) || 3))}
                className="w-20 px-3 py-2 text-center text-xs font-bold rounded-l-xl border border-r-0 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
              />
              <span className="px-3 py-2 text-xs font-semibold rounded-r-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300">
                Phút
              </span>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={handleSaveInterval}
                disabled={isSavingInterval || intervalMinutes < 3 || intervalMinutes === settings?.autoRefreshMinutes}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSavingInterval ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Lưu chu kỳ</span>
              </button>
            )}
          </div>
        </div>

        {/* 3. SQLite Database Management (Export & Import) */}
        <div className="p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-500" />
                Cơ Sở Dữ Liệu Lưu Trữ (SQLite)
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Lưu trữ toàn bộ danh sách video, kết quả cào profile, cấu hình hệ thống. Có thể xuất tệp sao lưu hoặc nạp cơ sở dữ liệu từ tệp SQLite khác.
              </div>
            </div>

            {/* Export & Import Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExportDatabase}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition shadow-xs cursor-pointer disabled:opacity-50"
                title="Tải xuống tệp database.sqlite hiện tại"
              >
                {isExporting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
                ) : (
                  <Download className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                )}
                <span>Xuất CSDL (.sqlite)</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm cursor-pointer disabled:opacity-50"
                  title="Tải tệp database.sqlite từ máy tính lên để thay thế CSDL hiện tại"
                >
                  {isImporting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>Nhập CSDL (.sqlite)</span>
                </button>
              )}
            </div>
          </div>

          {/* Database Stats Cards */}
          {settings?.database && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-750">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px] font-medium">
                  <HardDrive className="w-3.5 h-3.5 text-blue-500" />
                  Dung lượng CSDL
                </div>
                <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                  {formatBytes(settings.database.fileSize)}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-750">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px] font-medium">
                  <Video className="w-3.5 h-3.5 text-indigo-500" />
                  Video theo dõi
                </div>
                <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                  {settings.database.videosCount} bài/video
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-750">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px] font-medium">
                  <Users className="w-3.5 h-3.5 text-amber-500" />
                  Hồ sơ (Profiles)
                </div>
                <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                  {settings.database.profilesCount} profile
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-750">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px] font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  Tài khoản hệ thống
                </div>
                <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                  {settings.database.usersCount} tài khoản
                </div>
              </div>
            </div>
          )}

          {settings?.database?.lastModified && (
            <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1 pt-1">
              <span>Đường dẫn tệp:</span>
              <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] text-slate-600 dark:text-slate-300">
                {settings.database.filePath}
              </code>
              <span className="ml-2">Cập nhật lần cuối:</span>
              <span className="font-medium text-slate-600 dark:text-slate-400">
                {new Date(settings.database.lastModified).toLocaleString('vi-VN')}
              </span>
            </div>
          )}
        </div>

        {/* 4. Socket Realtime Status */}
        <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-500" />
              Kết Nối WebSocket Realtime
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Đồng bộ dữ liệu trực tiếp khi worker hoàn thành cào từng video hoặc quét profile
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {isConnected ? 'Đang kết nối Realtime' : 'Mất kết nối máy chủ'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
