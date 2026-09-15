import React from 'react';
import { GitBranch, Clock, Play, CheckCircle2, RefreshCw, Cpu, Database } from 'lucide-react';
import { VideoItem, BatchProgress } from '../types/video';
import { useAuth } from '../context/AuthContext';

interface LifecyclePageProps {
  videos: VideoItem[];
  batchProgress: BatchProgress;
  isConnected: boolean;
  onRefreshAll: () => Promise<void>;
}

export const LifecyclePage: React.FC<LifecyclePageProps> = ({
  videos,
  batchProgress,
  isConnected,
  onRefreshAll,
}) => {
  const { isAdmin } = useAuth();

  return (
    <div className="space-y-6">
      {/* Page Header Banner */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Vòng Đời Quét Video &amp; Worker Queue</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Theo dõi tiến trình Playwright Scraper, chu kỳ quét định kỳ 3 phút và luồng xử lý thời gian thực
              </p>
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={onRefreshAll}
              disabled={batchProgress.isRunning || videos.length === 0}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${batchProgress.isRunning ? 'animate-spin' : ''}`} />
              <span>Kích hoạt quét ngay</span>
            </button>
          )}
        </div>
      </div>

      {/* Lifecycle Flow Stages */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Stage 1 */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Bước 1</span>
            <Clock className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="font-semibold text-sm text-slate-900 dark:text-white mb-1">Schedule Trigger</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Tự động kích hoạt định kỳ mỗi 3 phút qua NestJS Schedule Module.</div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Đang chạy nền</span>
          </div>
        </div>

        {/* Stage 2 */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Bước 2</span>
            <Cpu className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="font-semibold text-sm text-slate-900 dark:text-white mb-1">Queue &amp; Concurrency</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Phân luồng tối đa song song để cào dữ liệu Facebook &amp; TikTok.</div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 font-medium">
            <span>Tối đa: 5 luồng worker</span>
          </div>
        </div>

        {/* Stage 3 */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Bước 3</span>
            <Database className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="font-semibold text-sm text-slate-900 dark:text-white mb-1">Atomic Storage</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Lưu dữ liệu an toàn vào videos_data.json chống xung đột ghi đè.</div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 font-medium">
            <span>{videos.length} bản ghi đã lưu</span>
          </div>
        </div>

        {/* Stage 4 */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Bước 4</span>
            <Play className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="font-semibold text-sm text-slate-900 dark:text-white mb-1">Socket.IO Realtime</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Phát sự kiện cập nhật tức thì tới trình duyệt mà không cần tải lại trang.</div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 text-xs font-medium">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            <span className={isConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
              {isConnected ? 'Realtime hoạt động' : 'Chưa kết nối'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
