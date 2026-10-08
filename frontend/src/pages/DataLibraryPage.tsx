import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  FileCheck2,
  FileSpreadsheet,
  Search,
  ExternalLink,
  Printer,
  Copy,
  RotateCw,
  Trash2,
  Eye,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Table as TableIcon,
  X,
  AlertTriangle,
} from 'lucide-react';
import { VideoTable } from '../components/VideoTable';
import { VideoItem, BatchProgress } from '../types/video';
import { useAuth } from '../context/AuthContext';
import { formatNumber } from '../utils/formatters';
import { exportVideosToExcel } from '../utils/exportExcel';
import { FacebookIcon, TikTokIcon } from '../components/Icons';

interface DataLibraryPageProps {
  videos: VideoItem[];
  batchProgress: BatchProgress;
  updatedRowStt: string | number | null;
  crawlStatus: string | null;
  onAddVideo: (url: string) => Promise<boolean>;
  onRefreshOne: (idOrStt: string | number) => Promise<void>;
  onRefreshAll: () => Promise<void>;
  onDelete: (idOrStt: string | number) => Promise<void>;
  onBulkDelete?: (ids: (string | number)[]) => Promise<void>;
}

export const DataLibraryPage: React.FC<DataLibraryPageProps> = ({
  videos,
  batchProgress,
  updatedRowStt,
  onRefreshOne,
  onRefreshAll,
  onDelete,
  onBulkDelete,
}) => {
  const { isAdmin } = useAuth();

  // Chế độ xem: 'grid' (Lưới thẻ bài viết) hoặc 'table' (Bảng chi tiết)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'fb' | 'tiktok'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'violation' | 'clean'>('all');

  // Modal phiếu trích lục thông tin bài viết
  const [selectedDossier, setSelectedDossier] = useState<VideoItem | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Phân trang cho dạng thẻ Card Grid
  const [gridPage, setGridPage] = useState(1);
  const GRID_PAGE_SIZE = 9;

  // Thống kê số liệu bài viết
  const stats = useMemo(() => {
    const total = videos.length;
    const violations = videos.filter((v) => v.isViolation).length;
    const clean = total - violations;
    const fbCount = videos.filter((v) => (v.loai || '').toLowerCase().includes('facebook')).length;
    const tiktokCount = videos.filter((v) => (v.loai || '').toLowerCase().includes('tiktok')).length;
    return { total, violations, clean, fbCount, tiktokCount };
  }, [videos]);

  // Bộ lọc danh sách bài viết
  const filteredVideos = useMemo(() => {
    return videos.filter((v) => {
      const term = searchTerm.toLowerCase().trim();
      const matchSearch =
        !term ||
        (v.caption || '').toLowerCase().includes(term) ||
        (v.nguoiDang || '').toLowerCase().includes(term) ||
        (v.link || '').toLowerCase().includes(term) ||
        (v.id && String(v.id).toLowerCase().includes(term)) ||
        (v.violationKeywords && v.violationKeywords.some((k) => k.toLowerCase().includes(term)));

      if (!matchSearch) return false;

      // Lọc nền tảng
      if (platformFilter === 'fb' && !(v.loai || '').toLowerCase().includes('facebook')) return false;
      if (platformFilter === 'tiktok' && !(v.loai || '').toLowerCase().includes('tiktok')) return false;

      // Lọc trạng thái vi phạm
      if (statusFilter === 'violation' && !v.isViolation) return false;
      if (statusFilter === 'clean' && v.isViolation) return false;

      return true;
    });
  }, [videos, searchTerm, platformFilter, statusFilter]);

  // Phân trang cho chế độ Card Grid
  const totalGridPages = Math.max(1, Math.ceil(filteredVideos.length / GRID_PAGE_SIZE));
  const safeGridPage = Math.min(Math.max(1, gridPage), totalGridPages);
  const paginatedGridVideos = useMemo(() => {
    const start = (safeGridPage - 1) * GRID_PAGE_SIZE;
    return filteredVideos.slice(start, start + GRID_PAGE_SIZE);
  }, [filteredVideos, safeGridPage]);

  // Sao chép thông tin bài viết
  const handleCopyCitation = (video: VideoItem) => {
    const lines = [
      `Người đăng: ${video.nguoiDang || 'Không rõ'}`,
      `Nền tảng: ${(video.loai || '').includes('Facebook') ? 'Facebook' : 'TikTok'}`,
      `Ngày đăng: ${video.ngayDang || 'Không rõ'}`,
      `Link: ${video.link}`,
      `Tương tác: ${formatNumber(video.LuotXem)} xem, ${formatNumber(video.LuotLike)} thích, ${formatNumber(video.LuotComment)} bình luận, ${formatNumber(video.SoLuongNguoiShare)} chia sẻ`,
      `Vi phạm: ${video.isViolation ? 'Có' : 'Không'}${video.violationReason ? ` (${video.violationReason})` : ''}`,
      '',
      'Nội dung:',
      video.caption || '(không có nội dung chữ)',
    ];

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2500);
  };

  const handlePrintDossier = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Page Title & Subtitle */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Kho bài viết
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
            Toàn bộ bài viết đang theo dõi. Bấm vào một bài để xem chi tiết, sao chép hoặc in.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportVideosToExcel(filteredVideos, 'kho_bai_viet')}
            disabled={filteredVideos.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Xuất toàn bộ bài viết ({filteredVideos.length})</span>
          </button>
        </div>
      </div>

      {/* 2. Thống kê tổng quan Kho Bài Viết */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {/* Card 1: Tổng bài viết */}
        <div className="p-4 bg-white border shadow-sm dark:bg-slate-900/80 rounded-2xl border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Tổng bài viết theo dõi</span>
            <FileCheck2 className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {stats.total}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Dữ liệu được lưu trữ toàn vẹn
          </div>
        </div>

        {/* Card 2: Vi phạm tiêu chuẩn */}
        <div className="p-4 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-xs text-rose-700 dark:text-rose-400 font-medium">
            <span>Gắn cờ vi phạm</span>
            <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
            {stats.violations}
          </div>
          <div className="mt-1 text-[11px] text-rose-500/80">
            {stats.total > 0 ? Math.round((stats.violations / stats.total) * 100) : 0}% trên tổng bài viết
          </div>
        </div>

        {/* Card 3: Facebook */}
        <div className="p-4 bg-white border shadow-sm dark:bg-slate-900/80 rounded-2xl border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Bài viết Facebook</span>
            <FacebookIcon className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
            {stats.fbCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Bài viết &amp; Video Reels Facebook
          </div>
        </div>

        {/* Card 4: TikTok */}
        <div className="p-4 bg-white border shadow-sm dark:bg-slate-900/80 rounded-2xl border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Bài viết TikTok</span>
            <TikTokIcon className="w-4 h-4 text-pink-600 dark:text-pink-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-pink-600 dark:text-pink-400">
            {stats.tiktokCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Video ngắn &amp; xu hướng TikTok
          </div>
        </div>
      </div>

      {/* 3. Filter Bar & View Mode Toggle */}
      <div className="p-4 bg-white border shadow-sm dark:bg-slate-900/80 rounded-2xl border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setGridPage(1);
            }}
            placeholder="Tìm theo nội dung, tác giả, từ khóa..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Platform Filter */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => {
                setPlatformFilter('all');
                setGridPage(1);
              }}
              className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                platformFilter === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => {
                setPlatformFilter('fb');
                setGridPage(1);
              }}
              className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                platformFilter === 'fb'
                  ? 'bg-blue-600 text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-blue-600'
              }`}
            >
              <FacebookIcon className="w-3 h-3" />
              <span>Facebook</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPlatformFilter('tiktok');
                setGridPage(1);
              }}
              className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                platformFilter === 'tiktok'
                  ? 'bg-pink-600 text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-pink-600'
              }`}
            >
              <TikTokIcon className="w-3 h-3" />
              <span>TikTok</span>
            </button>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'all' | 'violation' | 'clean');
              setGridPage(1);
            }}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="violation">Chỉ bài vi phạm</option>
            <option value="clean">Bài viết bình thường</option>
          </select>

          {/* View Mode Toggle */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-slate-800 text-xs ml-auto">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Chế độ xem Thẻ bài viết"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Chế độ xem Bảng dữ liệu chi tiết"
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Main Content: Grid Cards View vs Table View */}
      {viewMode === 'grid' ? (
        <div className="space-y-4">
          {paginatedGridVideos.length === 0 ? (
            <div className="py-16 text-center bg-white border dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 rounded-2xl">
              <FileCheck2 className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Không tìm thấy bài viết nào phù hợp
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Hãy thử điều chỉnh bộ lọc tìm kiếm hoặc từ khóa tra cứu.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedGridVideos.map((item, idx) => {
                const autoStt = (safeGridPage - 1) * GRID_PAGE_SIZE + idx + 1;
                const isFB = (item.loai || '').includes('Facebook');

                return (
                  <div
                    key={item.id || item.STT || idx}
                    className={`flex flex-col justify-between bg-white dark:bg-slate-900 border rounded-2xl shadow-xs transition-all duration-200 hover:shadow-md hover:border-blue-400 dark:hover:border-blue-600 overflow-hidden ${
                      item.isViolation
                        ? 'border-rose-300 dark:border-rose-900/50'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {/* Card Header */}
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          #{item.STT !== undefined ? item.STT : autoStt}
                        </span>
                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${
                              isFB
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                                : 'bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-800'
                            }`}
                          >
                            {isFB ? <FacebookIcon className="w-2.5 h-2.5" /> : <TikTokIcon className="w-2.5 h-2.5" />}
                            <span>{isFB ? 'Facebook' : 'TikTok'}</span>
                          </span>
                        </div>
                      </div>

                      {/* Violation status badge */}
                      {item.isViolation ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-800 shrink-0">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          <span>Cảnh báo vi phạm</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                          <span>An toàn</span>
                        </span>
                      )}
                    </div>

                    {/* Card Body */}
                    <div className="p-4 space-y-3 flex-1">
                      {/* Author */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 text-[11px]">Chủ thể đối tượng:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]" title={item.nguoiDang}>
                          {item.nguoiDang || 'Chưa xác định'}
                        </span>
                      </div>

                      {/* Caption extract quote */}
                      <div className="relative p-2.5 bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-100 dark:border-slate-800/80 text-xs text-slate-700 dark:text-slate-300 line-clamp-3 leading-relaxed italic">
                        "{item.caption && item.caption.trim() ? item.caption : 'Không có tiêu đề / caption'}"
                      </div>

                      {/* Violation keywords if any */}
                      {item.violationKeywords && item.violationKeywords.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                            Từ khóa phát hiện:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {item.violationKeywords.map((kw, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-[10px] font-medium border border-rose-200 dark:border-rose-900/60"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Engagement stats */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-4 gap-2 text-center text-xs font-mono">
                        <div>
                          <div className="text-[10px] text-slate-400 font-sans">Lượt xem</div>
                          <div className="font-bold text-emerald-600 dark:text-emerald-400">{formatNumber(item.LuotXem)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 font-sans">Lượt like</div>
                          <div className="font-bold text-pink-600 dark:text-pink-400">{formatNumber(item.LuotLike)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 font-sans">Bình luận</div>
                          <div className="font-bold text-amber-600 dark:text-amber-400">{formatNumber(item.LuotComment)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 font-sans">Chia sẻ</div>
                          <div className="font-bold text-slate-700 dark:text-slate-300">{formatNumber(item.SoLuongNguoiShare)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedDossier(item)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer shadow-xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Xem chi tiết</span>
                      </button>

                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
                        title="Mở liên kết gốc"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>

                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => onRefreshOne(item.id || item.STT || 0)}
                            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                            title="Làm mới số liệu"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(item.id || item.STT || 0)}
                            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-600 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition cursor-pointer"
                            title="Xóa bài viết này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Phân trang Grid */}
          {totalGridPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-600 dark:text-slate-400">
              <div>
                Trang <span className="font-semibold text-slate-900 dark:text-white">{safeGridPage}</span> / {totalGridPages} ({filteredVideos.length} bài viết)
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setGridPage((p) => Math.max(1, p - 1))}
                  disabled={safeGridPage === 1}
                  className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setGridPage((p) => Math.min(totalGridPages, p + 1))}
                  disabled={safeGridPage === totalGridPages}
                  className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Table View */
        <VideoTable
          videos={filteredVideos}
          batchProgress={batchProgress}
          updatedRowStt={updatedRowStt}
          onRefreshOne={onRefreshOne}
          onRefreshAll={onRefreshAll}
          onDelete={onDelete}
          onBulkDelete={onBulkDelete}
          canManage={isAdmin}
        />
      )}

      {/* 5. Modal chi tiết bài viết */}
      {selectedDossier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Chi tiết bài viết
                  </h3>
                  <div className="text-[11px] text-slate-400">
                    Mã: {selectedDossier.id || selectedDossier.STT || 'N/A'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDossier(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Printable Content */}
            <div id="printable-dossier" className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Tiêu đề khi in */}
              <div className="hidden print:block text-center pb-2 border-b border-slate-300">
                <div className="text-base font-bold">Chi tiết bài viết</div>
                <div className="text-[11px] text-slate-500">Mã: {selectedDossier.id || selectedDossier.STT || 'N/A'}</div>
              </div>

              {/* Thông tin đối tượng và link */}
              <div className="space-y-2">
                <div className="font-semibold text-[11px] text-blue-600 dark:text-blue-400">
                  Thông tin chung
                </div>
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-950/70 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div>
                    <span className="text-slate-400">Nền tảng: </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {(selectedDossier.loai || '').includes('Facebook') ? 'Facebook' : 'TikTok'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Ngày đăng: </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedDossier.ngayDang || 'Không rõ'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400">Người đăng: </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {selectedDossier.nguoiDang || 'Không rõ'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400">Link bài viết: </span>
                    <a
                      href={selectedDossier.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 underline break-all"
                    >
                      {selectedDossier.link}
                    </a>
                  </div>
                </div>
              </div>

              {/* Nội dung */}
              <div className="space-y-2">
                <div className="font-semibold text-[11px] text-blue-600 dark:text-blue-400">
                  Nội dung bài viết
                </div>
                <div className="p-3.5 bg-slate-50 dark:bg-slate-950/70 rounded-xl border border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {selectedDossier.caption || 'Bài viết không có nội dung chữ.'}
                </div>
              </div>

              {/* Tương tác */}
              <div className="space-y-2">
                <div className="font-semibold text-[11px] text-blue-600 dark:text-blue-400">
                  Tương tác
                </div>
                <div className="grid grid-cols-4 gap-2 text-center p-3 bg-slate-50 dark:bg-slate-950/70 rounded-xl border border-slate-100 dark:border-slate-800 font-mono">
                  <div>
                    <div className="text-[10px] text-slate-400 font-sans">Lượt xem</div>
                    <div className="font-bold text-sm text-emerald-600">{formatNumber(selectedDossier.LuotXem)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-sans">Lượt thích</div>
                    <div className="font-bold text-sm text-pink-600">{formatNumber(selectedDossier.LuotLike)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-sans">Bình luận</div>
                    <div className="font-bold text-sm text-amber-600">{formatNumber(selectedDossier.LuotComment)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-sans">Chia sẻ</div>
                    <div className="font-bold text-sm text-slate-700 dark:text-slate-300">{formatNumber(selectedDossier.SoLuongNguoiShare)}</div>
                  </div>
                </div>
              </div>

              {/* Vi phạm */}
              <div className="space-y-2">
                <div className="font-semibold text-[11px] text-blue-600 dark:text-blue-400">
                  Kiểm tra vi phạm
                </div>
                <div className={`p-3 rounded-xl border ${
                  selectedDossier.isViolation
                    ? 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50'
                    : 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50'
                }`}>
                  <div className="flex items-center gap-2">
                    {selectedDossier.isViolation ? (
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    )}
                    <span className="font-bold">
                      {selectedDossier.isViolation ? 'Có dấu hiệu vi phạm' : 'Không phát hiện vi phạm'}
                    </span>
                  </div>
                  {selectedDossier.violationReason && (
                    <div className="mt-2 text-[11px]">
                      Lý do: <b className="text-rose-600">{selectedDossier.violationReason}</b>
                    </div>
                  )}
                  {selectedDossier.violationKeywords && selectedDossier.violationKeywords.length > 0 && (
                    <div className="mt-1 text-[11px]">
                      Từ khóa: <b className="text-rose-600">{selectedDossier.violationKeywords.join(', ')}</b>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 text-[10px] text-slate-400 text-right">
                Cập nhật số liệu lần cuối: {selectedDossier.lastUpdated ? new Date(selectedDossier.lastUpdated).toLocaleString('vi-VN') : 'Không rõ'}
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyCitation(selectedDossier)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium transition cursor-pointer text-xs"
                >
                  {copiedNotification ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">Đã sao chép!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Sao chép thông tin</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handlePrintDossier}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium transition cursor-pointer text-xs"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-400" />
                  <span>In</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDossier(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold hover:bg-slate-800 text-xs transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataLibraryPage;
