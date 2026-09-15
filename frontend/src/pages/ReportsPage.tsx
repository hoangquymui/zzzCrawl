import React from 'react';
import { FileText, Download, FileSpreadsheet, Calendar, CheckCircle2 } from 'lucide-react';
import { VideoItem } from '../types/video';
import { exportVideosToExcel } from '../utils/exportExcel';
import { exportVideosToCSV } from '../utils/exportCsv';

interface ReportsPageProps {
  videos: VideoItem[];
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ videos }) => {
  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-500" />
            Báo Cáo &amp; Xuất File Dữ Liệu
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tạo và tải về các file báo cáo tổng hợp chỉ số tương tác Facebook &amp; TikTok theo thời gian thực
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportVideosToExcel(videos, 'bao_cao_tong_hop')}
            disabled={videos.length === 0}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Tải Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={() => exportVideosToCSV(videos, 'bao_cao_tong_hop')}
            disabled={videos.length === 0}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold text-xs transition flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải CSV (.csv)</span>
          </button>
        </div>
      </div>

      {/* Reports Templates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Report 1 */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">Báo Cáo Toàn Diện</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Đầy đủ 10 trường dữ liệu (STT, Link, Caption, Loại, Người đăng, Ngày đăng, Share, View, Like, Comment) của tất cả {videos.length} video.
          </p>
          <button
            type="button"
            onClick={() => exportVideosToExcel(videos, 'bao_cao_toan_dien')}
            className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition cursor-pointer"
          >
            Xuất file ngay
          </button>
        </div>

        {/* Report 2 */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
            <Calendar className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">Báo Cáo 30 Ngày Gần Nhất</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Lọc và tổng kết dữ liệu các bài đăng trong vòng 30 ngày qua kèm tốc độ tăng trưởng.
          </p>
          <button
            type="button"
            onClick={() => exportVideosToExcel(videos, 'bao_cao_30_ngay')}
            className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition cursor-pointer"
          >
            Xuất file ngay
          </button>
        </div>

        {/* Report 3 */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">Báo Cáo Top Tương Tác</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Danh sách xếp hạng các video có lượt xem, lượt like và bình luận cao nhất trên hệ thống.
          </p>
          <button
            type="button"
            onClick={() => exportVideosToExcel(videos, 'bao_cao_top_tuong_tac')}
            className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition cursor-pointer"
          >
            Xuất file ngay
          </button>
        </div>
      </div>
    </div>
  );
};
