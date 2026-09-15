import React from 'react';
import { Settings, Moon, Sun, Clock, Radio, Server } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface SettingsPageProps {
  isConnected: boolean;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ isConnected }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-500/10 text-slate-700 dark:text-slate-300 flex items-center justify-center">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Cài Đặt Hệ Thống</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Cấu hình tiến trình Playwright cào dữ liệu, giao diện hiển thị và kết nối Realtime
            </p>
          </div>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 shadow-xs">
        {/* 1. Theme Setting */}
        <div className="p-5 flex items-center justify-between gap-4">
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
        <div className="p-5 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              Chu Kỳ Tự Động Quét Video
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Hệ thống tự động kích hoạt worker quét lại toàn bộ dữ liệu video định kỳ
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
            Mỗi 3 phút (@Interval)
          </span>
        </div>

        {/* 3. Socket Realtime Status */}
        <div className="p-5 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-500" />
              Kết Nối WebSocket Realtime
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Đồng bộ dữ liệu trực tiếp khi worker hoàn thành cào từng video
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {isConnected ? 'Đang kết nối Realtime' : 'Mất kết nối máy chủ'}
            </span>
          </div>
        </div>

        {/* 4. Backend Storage */}
        <div className="p-5 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-500" />
              Cơ Sở Dữ Liệu Lưu Trữ
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Lưu trữ dạng tệp JSON nguyên tử tại thư mục backend
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono text-xs text-slate-600 dark:text-slate-400">
            backend/videos_data.json
          </span>
        </div>
      </div>
    </div>
  );
};
