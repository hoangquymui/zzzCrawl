import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  RotateCw,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Loader2,
  Video as VideoIcon,
  Image as ImageIcon,
  FileText,
} from 'lucide-react';
import { VideoItem } from '../types/video';
import { formatNumber } from '../utils/formatters';
import { vocabularyApi } from '../services/vocabulary.service';

interface ViolationTableProps {
  videos: VideoItem[];
  onRefreshOne: (idOrStt: string | number) => Promise<void>;
  onDelete: (idOrStt: string | number) => Promise<void>;
  canManage?: boolean;
}

export const ViolationTable: React.FC<ViolationTableProps> = ({
  videos,
  onRefreshOne,
  onDelete,
  canManage = true,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshingId, setRefreshingId] = useState<string | number | null>(null);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [copiedId, setCopiedId] = useState<string | number | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isRescanning, setIsRescanning] = useState(false);
  const [rescanFeedback, setRescanFeedback] = useState<string | null>(null);

  // Phân trang
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  const filteredVideos = useMemo(() => {
    return videos.filter((v) => {
      const matchSearch =
        !searchTerm.trim() ||
        (v.caption && v.caption.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (v.nguoiDang && v.nguoiDang.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (v.violationReason && v.violationReason.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (v.id && v.id.toLowerCase().includes(searchTerm.toLowerCase())) ||
        v.link.toLowerCase().includes(searchTerm.toLowerCase());
      return matchSearch;
    });
  }, [videos, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredVideos.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedVideos = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredVideos.slice(start, start + pageSize);
  }, [filteredVideos, safePage, pageSize]);

  const handleCopyLink = (idOrStt: string | number, link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedId(idOrStt);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRefresh = async (idOrStt: string | number) => {
    try {
      setRefreshingId(idOrStt);
      await onRefreshOne(idOrStt);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDelete = async (idOrStt: string | number) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa bài viết (${idOrStt}) khỏi danh sách?`)) {
      try {
        setDeletingId(idOrStt);
        await onDelete(idOrStt);
      } finally {
        setDeletingId(null);
      }
    }
  };

  const handleRescan = async () => {
    try {
      setIsRescanning(true);
      const res = await vocabularyApi.rescan();
      setRescanFeedback(`Đã quét lại ${res.totalScanned} bài viết: phát hiện ${res.violationCount} bài vi phạm.`);
      setTimeout(() => setRescanFeedback(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Lỗi quét lại bài viết.');
    } finally {
      setIsRescanning(false);
    }
  };

  const renderLoaiBadge = (loai: string) => {
    const norm = (loai || '').toLowerCase();
    if (norm === 'video') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
          <VideoIcon className="w-3 h-3 text-indigo-500" />
          Video
        </span>
      );
    }
    if (norm === 'hình ảnh' || norm === 'image' || norm === 'photo') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <ImageIcon className="w-3 h-3 text-emerald-500" />
          Hình ảnh
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
        <FileText className="w-3 h-3 text-slate-500" />
        Bài viết
      </span>
    );
  };

  return (
    <div className="overflow-hidden transition-colors bg-white border shadow-sm dark:bg-slate-900/80 border-rose-200 dark:border-rose-900/60 rounded-2xl dark:shadow-xl">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 px-5 py-4 border-b border-rose-100 dark:border-rose-950/60 bg-rose-50/40 dark:bg-rose-950/20 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-200 dark:border-rose-800/60">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Bảng vi phạm tiêu chuẩn
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                {videos.length} bài vi phạm
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Các bài viết có caption chứa từ ngữ bậy bạ, chửi thề hoặc nhạy cảm. Sau mỗi lần quét lại, nếu nội dung đã được sửa sạch sẽ tự động chuyển về Bảng dữ liệu theo dõi.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Search Input */}
          {videos.length > 0 && !isCollapsed && (
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm bài viết vi phạm..."
                className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-950/80 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition"
              />
            </div>
          )}

          {/* Nút Quét lại toàn bộ bài viết theo từ vựng mới */}
          {canManage && (
            <button
              onClick={handleRescan}
              disabled={isRescanning}
              title="Quét lại toàn bộ bài viết trong hệ thống theo danh sách từ vựng hiện tại"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 transition disabled:opacity-50 shrink-0"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Quét lại vi phạm</span>
            </button>
          )}

          {/* Nút Thu gọn / Mở rộng */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Mở rộng bảng' : 'Thu gọn bảng'}
            className="p-1.5 rounded-xl border border-rose-200 dark:border-rose-800/60 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition shrink-0"
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Feedback banner if rescan was performed */}
      {rescanFeedback && (
        <div className="px-5 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center justify-between">
          <span>{rescanFeedback}</span>
          <button
            onClick={() => setRescanFeedback(null)}
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Table Content */}
      {!isCollapsed && (
        <>
          {videos.length === 0 ? (
            <div className="py-8 text-center text-slate-500 dark:text-slate-400">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 mb-2">
                <Check className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Không có bài viết vi phạm tiêu chuẩn
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Tất cả các bài viết hiện tại đều có nội dung hợp lệ và đang nằm trong Bảng dữ liệu theo dõi.
              </p>
            </div>
      ) : filteredVideos.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-xs">
          Không tìm thấy bài viết vi phạm nào phù hợp với từ khóa "{searchTerm}".
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 font-semibold select-none">
                <th className="py-3 px-3 w-14 text-center">STT</th>
                <th className="py-3 px-3 min-w-[140px]">Người đăng</th>
                <th className="py-3 px-3 min-w-[260px]">Caption</th>
                <th className="py-3 px-3 w-28 text-center">Loại</th>
                <th className="py-3 px-3 min-w-[100px]">Ngày đăng</th>
                <th className="py-3 px-3 min-w-[85px] text-right">Lượt like</th>
                <th className="py-3 px-3 min-w-[95px] text-right">lượt comment</th>
                <th className="py-3 px-3 min-w-[85px] text-right">lượt Share</th>
                <th className="py-3 px-3 min-w-[90px] text-right">Lượt xem</th>
                {canManage && <th className="py-3 px-3 w-28 text-center">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {pagedVideos.map((v, idx) => {
                const autoStt = (safePage - 1) * pageSize + idx + 1;
                const rowId = v.id || (v.STT !== undefined ? v.STT : autoStt);
                const isRefreshing = refreshingId === rowId;
                const isDeleting = deletingId === rowId;

                return (
                  <tr
                    key={rowId}
                    className="hover:bg-rose-50/30 dark:hover:bg-rose-950/15 transition-colors"
                  >
                    {/* 1. STT */}
                    <td className="py-3 px-3 text-center font-bold text-slate-700 dark:text-slate-300">
                      <div className="inline-flex items-center gap-1 font-mono">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span>{autoStt}</span>
                      </div>
                    </td>

                    {/* 2. Người đăng */}
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[160px]" title={v.nguoiDang || 'Không rõ'}>
                        {v.nguoiDang || 'Không rõ'}
                      </div>
                    </td>

                    {/* 3. Caption */}
                    <td className="py-3 px-3">
                      <div
                        className="text-slate-800 dark:text-slate-200 line-clamp-2 max-w-[320px] whitespace-pre-line leading-relaxed font-medium"
                        title={v.caption}
                      >
                        {v.caption || 'Không có tiêu đề'}
                      </div>
                      {/* Lỗi vi phạm */}
                      <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/80">
                        <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                        <span className="truncate max-w-[280px]" title={v.violationReason}>
                          {v.violationReason || 'Chứa từ ngữ vi phạm tiêu chuẩn'}
                        </span>
                      </div>
                    </td>

                    {/* 4. Loại */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {renderLoaiBadge(v.loai)}
                    </td>

                    {/* 5. Ngày đăng */}
                    <td className="py-3 px-3 text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap">
                      {v.ngayDang ? v.ngayDang.slice(0, 10) : "N/A"}
                    </td>

                    {/* 6. Lượt like */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-pink-600 dark:text-pink-400 whitespace-nowrap">
                      {formatNumber(v.LuotLike)}
                    </td>

                    {/* 7. lượt comment */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                      {formatNumber(v.LuotComment)}
                    </td>

                    {/* 8. lượt Share */}
                    <td className="py-3 px-3 text-right font-mono font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {formatNumber(v.SoLuongNguoiShare)}
                    </td>

                    {/* 9. Lượt xem */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      {formatNumber(v.LuotXem)}
                    </td>

                    {/* 10. Thao tác */}
                    {canManage && (
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Copy Link */}
                          <button
                            type="button"
                            onClick={() => handleCopyLink(rowId, v.link)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                            title="Sao chép link bài viết"
                          >
                            {copiedId === rowId ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Mở liên kết */}
                          <a
                            href={v.link}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer"
                            title="Mở liên kết bài viết"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>

                          {/* Quét lại */}
                          <button
                            type="button"
                            onClick={() => handleRefresh(rowId)}
                            disabled={isRefreshing || isDeleting}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer disabled:opacity-50"
                            title="Quét lại"
                          >
                            {isRefreshing ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                            ) : (
                              <RotateCw className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Xóa */}
                          <button
                            type="button"
                            onClick={() => handleDelete(rowId)}
                            disabled={isRefreshing || isDeleting}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer disabled:opacity-50"
                            title="Xóa khỏi danh sách"
                          >
                            {isDeleting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
              <div>
                Hiển thị trang {safePage} / {totalPages} ({filteredVideos.length} bài vi phạm)
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40 cursor-pointer"
                  title="Trang trước"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 font-semibold text-slate-700 dark:text-slate-300">
                  {safePage}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40 cursor-pointer"
                  title="Trang tiếp"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )}
</div>
);
};
