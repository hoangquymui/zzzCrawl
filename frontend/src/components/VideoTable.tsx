import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  RotateCw,
  Trash2,
  ExternalLink,
  TableProperties,
  Search,
  Inbox,
  Loader2,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Layers,
  Check,
  X,
} from "lucide-react";
import { BatchProgress, VideoItem } from "../types/video";
import { formatNumber } from "../utils/formatters";
import { exportVideosToExcel } from "../utils/exportExcel";
import { exportVideosToCSV } from "../utils/exportCsv";
import { deleteVideosBulk } from "../services/api";
import { FacebookIcon, TikTokIcon } from "./Icons";
import { DateRangePicker } from "./DateRangePicker";
import { useResizableColumns } from "../hooks/useResizableColumns";
import { ResizeHandle } from "./ResizeHandle";
import { QuickPreviewCard } from "./QuickPreviewCard";

interface VideoTableProps {
  videos: VideoItem[];
  batchProgress: BatchProgress;
  updatedRowStt?: number | string | null;
  onRefreshOne: (idOrStt: string | number) => Promise<void>;
  onRefreshAll: () => Promise<void>;
  onDelete: (idOrStt: string | number) => Promise<void>;
  onBulkDelete?: (ids: (string | number)[]) => Promise<void>;
  canManage?: boolean;
}

export const VideoTable: React.FC<VideoTableProps> = ({
  videos,
  batchProgress,
  updatedRowStt,
  onRefreshOne,
  onRefreshAll,
  onDelete,
  onBulkDelete,
  canManage = true,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPlatform, setFilterPlatform] = useState<"all" | "fb" | "tiktok">(
    "all",
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [refreshingId, setRefreshingId] = useState<string | number | null>(null);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);

  // Phân trang
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Quick Preview Hover Card
  const [hoveredVideo, setHoveredVideo] = useState<VideoItem | null>(null);
  const [previewPos, setPreviewPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleRowMouseEnter = (video: VideoItem, e: React.MouseEvent) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }

    const clientX = e.clientX;
    const clientY = e.clientY;

    // Tự động tính toán toạ độ để card không bị tràn màn hình
    const cardWidth = 384; // w-96 = 24rem = 384px
    const cardHeight = 360; // ước lượng chiều cao tối đa card

    let left = clientX + 15;
    if (left + cardWidth > window.innerWidth - 20) {
      left = Math.max(10, clientX - cardWidth - 15);
    }

    let top = clientY - 40;
    if (top + cardHeight > window.innerHeight - 20) {
      top = Math.max(10, window.innerHeight - cardHeight - 20);
    }
    if (top < 10) top = 10;

    hoverTimerRef.current = setTimeout(() => {
      setPreviewPos({ top, left });
      setHoveredVideo(video);
    }, 180);
  };

  const handleRowMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    setHoveredVideo(null);
  };

  // Kéo giãn độ rộng các cột của bảng
  const { widths: colWidths, handleMouseDown: handleColResize } = useResizableColumns(
    {
      select: 38,
      stt: 55,
      nguoiDang: 150,
      caption: 260,
      loai: 110,
      ngayDang: 105,
      like: 95,
      comment: 95,
      share: 95,
      view: 105,
      actions: 125,
    },
    'video_table_v2'
  );

  // Trạng thái menu xổ xuất dữ liệu
  const [isExportOpen, setIsExportOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Trạng thái menu xổ chọn nền tảng
  const [isPlatformOpen, setIsPlatformOpen] = useState(false);
  const platformDropdownRef = useRef<HTMLDivElement>(null);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        exportDropdownRef.current &&
        !exportDropdownRef.current.contains(event.target as Node)
      ) {
        setIsExportOpen(false);
      }
      if (
        platformDropdownRef.current &&
        !platformDropdownRef.current.contains(event.target as Node)
      ) {
        setIsPlatformOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Thống kê số lượng video theo từng nền tảng
  const platformCounts = useMemo(() => {
    let fb = 0;
    let tiktok = 0;
    for (const v of videos) {
      const loai = (v.loai || "").toLowerCase();
      if (loai.includes("facebook")) fb++;
      else if (loai.includes("tiktok")) tiktok++;
    }
    return { all: videos.length, fb, tiktok };
  }, [videos]);

  // Filter video theo từ khóa, nền tảng và khoảng ngày đăng
  const filteredVideos = useMemo(() => {
    return videos.filter((v) => {
      // 1. Lọc theo từ khóa tìm kiếm
      const term = searchTerm.toLowerCase();
      const matchTerm =
        (v.caption || "").toLowerCase().includes(term) ||
        (v.nguoiDang || "").toLowerCase().includes(term) ||
        (v.link || "").toLowerCase().includes(term);

      if (!matchTerm) return false;

      // 2. Lọc theo nền tảng
      if (filterPlatform === "fb") {
        if (!(v.loai || "").toLowerCase().includes("facebook")) return false;
      } else if (filterPlatform === "tiktok") {
        if (!(v.loai || "").toLowerCase().includes("tiktok")) return false;
      }

      // 3. Lọc theo ngày đăng (Từ ngày này đến ngày khác)
      if (startDate || endDate) {
        if (!v.ngayDang) return false;
        const vDate = v.ngayDang.trim().slice(0, 10);
        if (startDate && vDate < startDate) return false;
        if (endDate && vDate > endDate) return false;
      }

      return true;
    });
  }, [videos, searchTerm, filterPlatform, startDate, endDate]);

  // Reset về trang 1 khi lọc hoặc tìm kiếm
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterPlatform, startDate, endDate, pageSize]);

  // Tính toán phân trang
  const totalItems = filteredVideos.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedVideos = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredVideos.slice(start, start + pageSize);
  }, [filteredVideos, safePage, pageSize]);

  const handleRefreshSingle = async (idOrStt: string | number) => {
    setRefreshingId(idOrStt);
    try {
      await onRefreshOne(idOrStt);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDeleteVideo = async (idOrStt: string | number) => {
    if (
      window.confirm(
        `Bạn có chắc chắn muốn xóa bài viết/video (${idOrStt}) khỏi danh sách theo dõi?`,
      )
    ) {
      setDeletingId(idOrStt);
      try {
        await onDelete(idOrStt);
      } finally {
        setDeletingId(null);
      }
    }
  };

  // Trạng thái chọn nhiều dòng (Bulk Actions)
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkRefreshing, setIsBulkRefreshing] = useState(false);

  const getVideoKey = (v: VideoItem, fallbackIdx: number): string | number => {
    return v.id || (v.STT !== undefined ? v.STT : fallbackIdx);
  };

  const toggleSelectRow = (id: string | number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const areAllPageSelected = useMemo(() => {
    if (paginatedVideos.length === 0) return false;
    return paginatedVideos.every((v, i) => selectedIds.has(getVideoKey(v, i)));
  }, [paginatedVideos, selectedIds]);

  const isSomePageSelected = useMemo(() => {
    return paginatedVideos.some((v, i) => selectedIds.has(getVideoKey(v, i)));
  }, [paginatedVideos, selectedIds]);

  const toggleSelectAllPage = () => {
    if (areAllPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedVideos.forEach((v, i) => next.delete(getVideoKey(v, i)));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedVideos.forEach((v, i) => next.add(getVideoKey(v, i)));
        return next;
      });
    }
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredVideos.map((v, i) => getVideoKey(v, i))));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const selectedVideosList = useMemo(() => {
    return videos.filter((v, i) => selectedIds.has(getVideoKey(v, i)));
  }, [videos, selectedIds]);

  const handleBulkDeleteAction = async () => {
    if (selectedIds.size === 0) return;
    if (
      !window.confirm(
        `Bạn có chắc chắn muốn xóa ${selectedIds.size} bài viết đã chọn khỏi danh sách theo dõi?`
      )
    ) {
      return;
    }
    setIsBulkDeleting(true);
    try {
      const idsArray = Array.from(selectedIds);
      if (onBulkDelete) {
        await onBulkDelete(idsArray);
      } else {
        await deleteVideosBulk(idsArray).catch(async () => {
          for (const id of idsArray) {
            await onDelete(id).catch(() => {});
          }
        });
      }
      clearSelection();
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleBulkRefreshAction = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkRefreshing(true);
    try {
      for (const id of Array.from(selectedIds)) {
        await onRefreshOne(id).catch(() => {});
      }
    } finally {
      setIsBulkRefreshing(false);
    }
  };


  // Tạo mảng số trang hiển thị
  const pageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (safePage <= 4) {
        pages.push(1, 2, 3, 4, 5, "...", totalPages);
      } else if (safePage >= totalPages - 3) {
        pages.push(
          1,
          "...",
          totalPages - 4,
          totalPages - 3,
          totalPages - 2,
          totalPages - 1,
          totalPages,
        );
      } else {
        pages.push(
          1,
          "...",
          safePage - 1,
          safePage,
          safePage + 1,
          "...",
          totalPages,
        );
      }
    }
    return pages;
  }, [totalPages, safePage]);

  return (
    <div
      id="video-table"
      className="overflow-hidden transition-colors bg-white border shadow-sm dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 rounded-2xl dark:shadow-xl scroll-mt-20"
    >
      {/* Table Header Controls */}
      <div className="flex flex-col justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800 md:flex-row md:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
            <TableProperties className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            Bảng Dữ Liệu Theo Dõi (10 Trường Dữ Liệu)
          </h2>
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            <span>Tự động quét định kỳ mỗi 3 phút (Tối đa luồng)</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              id="search-box"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo caption, tác giả..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
            />
          </div>

          {/* Custom Platform Dropdown (Menu sổ xuống chọn nền tảng) */}
          <div className="relative" ref={platformDropdownRef}>
            <button
              type="button"
              onClick={() => setIsPlatformOpen((prev) => !prev)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer shadow-xs select-none ${
                filterPlatform === "fb"
                  ? "bg-blue-50 dark:bg-blue-600/15 border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-600/25"
                  : filterPlatform === "tiktok"
                    ? "bg-pink-50 dark:bg-pink-600/15 border-pink-300 dark:border-pink-500/40 text-pink-700 dark:text-pink-300 hover:bg-pink-100 dark:hover:bg-pink-600/25"
                    : "bg-slate-50 dark:bg-slate-950/80 border-slate-300 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-900"
              }`}
              title="Chọn nền tảng để lọc"
              aria-haspopup="true"
              aria-expanded={isPlatformOpen}
            >
              {filterPlatform === "fb" ? (
                <>
                  <div className="flex items-center justify-center w-4 h-4 text-white bg-blue-600 rounded-md shrink-0">
                    <FacebookIcon className="w-2.5 h-2.5" />
                  </div>
                  <span>Facebook</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-semibold bg-blue-200/80 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
                    {platformCounts.fb}
                  </span>
                </>
              ) : filterPlatform === "tiktok" ? (
                <>
                  <div className="flex items-center justify-center w-4 h-4 text-white rounded-md bg-slate-900 dark:bg-slate-100 dark:text-slate-900 shrink-0">
                    <TikTokIcon className="w-2.5 h-2.5" />
                  </div>
                  <span>TikTok</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-semibold bg-pink-200/80 dark:bg-pink-900/50 text-pink-800 dark:text-pink-200">
                    {platformCounts.tiktok}
                  </span>
                </>
              ) : (
                <>
                  <Layers className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span>Tất cả nền tảng</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-semibold bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {platformCounts.all}
                  </span>
                </>
              )}

              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                  isPlatformOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isPlatformOpen && (
              <div className="absolute left-0 mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/90 rounded-2xl shadow-xl p-1.5 z-40 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Lọc theo nền tảng ({videos.length} video)
                </div>

                {/* Option 1: Tất cả */}
                <button
                  type="button"
                  onClick={() => {
                    setFilterPlatform("all");
                    setIsPlatformOpen(false);
                  }}
                  className={`w-full px-2.5 py-2 mt-1 rounded-xl text-left text-xs flex items-center justify-between transition cursor-pointer group ${
                    filterPlatform === "all"
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center transition-transform border rounded-lg w-7 h-7 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 group-hover:scale-105 shrink-0">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        Tất cả nền tảng
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {platformCounts.all} video theo dõi
                      </div>
                    </div>
                  </div>
                  {filterPlatform === "all" && (
                    <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  )}
                </button>

                {/* Option 2: Facebook */}
                <button
                  type="button"
                  onClick={() => {
                    setFilterPlatform("fb");
                    setIsPlatformOpen(false);
                  }}
                  className={`w-full px-2.5 py-2 mt-0.5 rounded-xl text-left text-xs flex items-center justify-between transition cursor-pointer group ${
                    filterPlatform === "fb"
                      ? "bg-blue-50 dark:bg-blue-600/15 text-blue-700 dark:text-blue-300 font-semibold"
                      : "text-slate-700 dark:text-slate-300 hover:bg-blue-50/60 dark:hover:bg-blue-500/10"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center text-white transition-transform bg-blue-600 rounded-lg shadow-xs w-7 h-7 group-hover:scale-105 shrink-0">
                      <FacebookIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        Facebook
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {platformCounts.fb} video theo dõi
                      </div>
                    </div>
                  </div>
                  {filterPlatform === "fb" && (
                    <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  )}
                </button>

                {/* Option 3: TikTok */}
                <button
                  type="button"
                  onClick={() => {
                    setFilterPlatform("tiktok");
                    setIsPlatformOpen(false);
                  }}
                  className={`w-full px-2.5 py-2 mt-0.5 rounded-xl text-left text-xs flex items-center justify-between transition cursor-pointer group ${
                    filterPlatform === "tiktok"
                      ? "bg-pink-50 dark:bg-pink-600/15 text-pink-700 dark:text-pink-300 font-semibold"
                      : "text-slate-700 dark:text-slate-300 hover:bg-pink-50/60 dark:hover:bg-pink-500/10"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center text-white transition-transform rounded-lg shadow-xs w-7 h-7 bg-slate-900 dark:bg-slate-100 dark:text-slate-900 group-hover:scale-105 shrink-0">
                      <TikTokIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-pink-600 dark:group-hover:text-pink-400">
                        TikTok
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {platformCounts.tiktok} video theo dõi
                      </div>
                    </div>
                  </div>
                  {filterPlatform === "tiktok" && (
                    <Check className="w-4 h-4 text-pink-600 dark:text-pink-400 shrink-0" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Custom Popover Date-Range Picker (The field is trigger, floating month popover, role="grid", range_start / range_end / range_middle) */}
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChange={({ startDate: s, endDate: e }) => {
              setStartDate(s);
              setEndDate(e);
            }}
            placeholder="Chọn khoảng ngày đăng..."
          />

          {/* Refresh All Button */}
          {canManage && (
            <button
              onClick={onRefreshAll}
              disabled={batchProgress.isRunning || videos.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white transition shadow-md cursor-pointer rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {batchProgress.isRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    Đang cập nhật ({batchProgress.completed}/
                    {batchProgress.total})...
                  </span>
                </>
              ) : (
                <>
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Làm mới tất cả</span>
                </>
              )}
            </button>
          )}

          {/* Export Dropdown (Thanh xổ chọn xuất Excel hoặc CSV) */}
          <div className="relative" ref={exportDropdownRef}>
            <button
              type="button"
              onClick={() => setIsExportOpen((prev) => !prev)}
              disabled={filteredVideos.length === 0}
              className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 font-semibold text-xs transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0 shadow-sm"
              title={
                filteredVideos.length === 0
                  ? "Không có dữ liệu để xuất"
                  : "Chọn định dạng để xuất file"
              }
            >
              <Download className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              <span>Xuất dữ liệu</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                  isExportOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isExportOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl py-1.5 z-40">
                <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Chọn định dạng ({filteredVideos.length} video)
                </div>

                {/* Option 1: Excel */}
                <button
                  type="button"
                  onClick={() => {
                    exportVideosToExcel(filteredVideos, "danh_sach_video");
                    setIsExportOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-2.5 transition cursor-pointer group"
                >
                  <div className="flex items-center justify-center transition-transform border rounded-lg w-7 h-7 bg-emerald-100 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 shrink-0">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-300">
                      Xuất file Excel
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      Tệp .xlsx (Tự căn độ rộng cột)
                    </div>
                  </div>
                </button>

                {/* Option 2: CSV */}
                <button
                  type="button"
                  onClick={() => {
                    exportVideosToCSV(filteredVideos, "danh_sach_video");
                    setIsExportOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-2.5 transition cursor-pointer group"
                >
                  <div className="flex items-center justify-center text-blue-600 transition-transform bg-blue-100 border border-blue-300 rounded-lg w-7 h-7 dark:bg-blue-500/15 dark:border-blue-500/20 dark:text-blue-400 group-hover:scale-105 shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-300">
                      Xuất file CSV
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      Tệp .csv (Chuẩn UTF-8 BOM)
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table Data - Căn chỉnh kích thước cột gọn gàng để vừa khít màn hình */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70 text-slate-600 dark:text-slate-400 uppercase font-semibold tracking-wider text-[11px] select-none">
              {/* 0. Checkbox chọn hàng loạt */}
              {canManage && (
                <th style={{ width: colWidths.select, minWidth: colWidths.select }} className="relative px-2 py-3 text-center shrink-0 border-r border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={areAllPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = !areAllPageSelected && isSomePageSelected;
                      }}
                      onChange={toggleSelectAllPage}
                      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                      title={areAllPageSelected ? "Bỏ chọn trang này" : "Chọn tất cả trên trang"}
                    />
                  </div>
                  <ResizeHandle onMouseDown={(e) => handleColResize('select', e)} />
                </th>
              )}
              {/* 1. STT */}
              <th style={{ width: colWidths.stt, minWidth: colWidths.stt }} className="relative px-2 py-3 text-center shrink-0 border-r border-slate-200 dark:border-slate-800">
                STT
                <ResizeHandle onMouseDown={(e) => handleColResize('stt', e)} />
              </th>
              {/* 2. Người đăng */}
              <th style={{ width: colWidths.nguoiDang, minWidth: colWidths.nguoiDang }} className="relative py-3 px-2.5 shrink-0 border-r border-slate-200 dark:border-slate-800">
                Người đăng
                <ResizeHandle onMouseDown={(e) => handleColResize('nguoiDang', e)} />
              </th>
              {/* 3. Caption */}
              <th style={{ width: colWidths.caption, minWidth: colWidths.caption }} className="relative py-3 px-2.5 border-r border-slate-200 dark:border-slate-800">
                Caption
                <ResizeHandle onMouseDown={(e) => handleColResize('caption', e)} />
              </th>
              {/* 4. Loại */}
              <th style={{ width: colWidths.loai, minWidth: colWidths.loai }} className="relative py-3 px-2.5 text-center shrink-0 border-r border-slate-200 dark:border-slate-800">
                Loại
                <ResizeHandle onMouseDown={(e) => handleColResize('loai', e)} />
              </th>
              {/* 5. Ngày đăng */}
              <th style={{ width: colWidths.ngayDang, minWidth: colWidths.ngayDang }} className="relative py-3 px-2.5 shrink-0 border-r border-slate-200 dark:border-slate-800">
                Ngày đăng
                <ResizeHandle onMouseDown={(e) => handleColResize('ngayDang', e)} />
              </th>
              {/* 6. Lượt like */}
              <th style={{ width: colWidths.like, minWidth: colWidths.like }} className="relative px-2 py-3 text-right shrink-0 border-r border-slate-200 dark:border-slate-800">
                Lượt like
                <ResizeHandle onMouseDown={(e) => handleColResize('like', e)} />
              </th>
              {/* 7. lượt comment */}
              <th style={{ width: colWidths.comment, minWidth: colWidths.comment }} className="relative px-2 py-3 text-right shrink-0 border-r border-slate-200 dark:border-slate-800">
                lượt comment
                <ResizeHandle onMouseDown={(e) => handleColResize('comment', e)} />
              </th>
              {/* 8. lượt Share */}
              <th style={{ width: colWidths.share, minWidth: colWidths.share }} className="relative px-2 py-3 text-right shrink-0 border-r border-slate-200 dark:border-slate-800">
                lượt Share
                <ResizeHandle onMouseDown={(e) => handleColResize('share', e)} />
              </th>
              {/* 9. Lượt xem */}
              <th style={{ width: colWidths.view, minWidth: colWidths.view }} className="relative px-2 py-3 text-right shrink-0 border-r border-slate-200 dark:border-slate-800">
                Lượt xem
                <ResizeHandle onMouseDown={(e) => handleColResize('view', e)} />
              </th>
              {/* 10. Thao tác */}
              {canManage && (
                <th style={{ width: colWidths.actions, minWidth: colWidths.actions }} className="relative px-2 py-3 text-center shrink-0">
                  Thao tác
                  <ResizeHandle onMouseDown={(e) => handleColResize('actions', e)} />
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
            {paginatedVideos.map((v, idx) => {
              const autoStt = (safePage - 1) * pageSize + idx + 1;
              const rowId = getVideoKey(v, autoStt);
              const isSelected = selectedIds.has(rowId);
              const isFB = (v.loai || "").includes("Facebook");
              const isUpdated = updatedRowStt === rowId || (v.STT !== undefined && updatedRowStt === v.STT);
              const isRefreshing = refreshingId === rowId;
              const isDeleting = deletingId === rowId;

              return (
                <tr
                  key={rowId}
                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition duration-150 ${
                    isSelected ? "bg-blue-50/70 dark:bg-blue-950/30" : ""
                  } ${isUpdated ? "animate-row-pulse" : ""}`}
                >
                  {/* 0. Checkbox chọn dòng */}
                  {canManage && (
                    <td style={{ width: colWidths.select }} className="py-2.5 px-2 text-center border-r border-slate-100 dark:border-slate-800/60">
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(rowId)}
                          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                          title="Chọn dòng này để thao tác hàng loạt"
                        />
                      </div>
                    </td>
                  )}

                  {/* 1. STT: Tự động đánh số theo vị trí hiển thị, không phụ thuộc vào dữ liệu */}
                  <td style={{ width: colWidths.stt }} className="py-2.5 px-2 text-center font-bold text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800/60 font-mono">
                    {autoStt}
                  </td>

                  {/* 2. Người đăng */}
                  <td
                    style={{ width: colWidths.nguoiDang, minWidth: colWidths.nguoiDang, maxWidth: colWidths.nguoiDang }}
                    className="py-2.5 px-2.5 font-medium text-slate-800 dark:text-slate-200 border-r border-slate-100 dark:border-slate-800/60 overflow-hidden"
                  >
                    <div className="w-full min-w-0 overflow-hidden">
                      <div className="truncate w-full min-w-0 block font-semibold" title={v.nguoiDang || "N/A"}>
                        {v.nguoiDang || "N/A"}
                      </div>
                    </div>
                  </td>

                  {/* 3. Caption */}
                  <td
                    style={{ width: colWidths.caption, minWidth: colWidths.caption, maxWidth: colWidths.caption }}
                    className="py-2.5 px-2.5 text-slate-800 dark:text-slate-200 border-r border-slate-100 dark:border-slate-800/60 cursor-pointer overflow-hidden"
                    onMouseEnter={(e) => handleRowMouseEnter(v, e)}
                    onMouseLeave={handleRowMouseLeave}
                  >
                    <div
                      className={`leading-relaxed line-clamp-2 transition-colors w-full min-w-0 break-words ${
                        v.caption && v.caption.trim() && v.caption !== "Không có tiêu đề"
                          ? "hover:text-blue-600 dark:hover:text-blue-400 text-slate-800 dark:text-slate-200"
                          : "italic text-slate-400 dark:text-slate-500"
                      }`}
                      title={v.caption && v.caption.trim() ? v.caption : "Không có tiêu đề"}
                    >
                      {v.caption && v.caption.trim() ? v.caption : "Không có tiêu đề"}
                    </div>
                  </td>

                  {/* 4. Loại */}
                  <td style={{ width: colWidths.loai, minWidth: colWidths.loai, maxWidth: colWidths.loai }} className="py-2 px-2 text-center whitespace-nowrap border-r border-slate-100 dark:border-slate-800/60">
                    <div className="flex flex-col items-center justify-center gap-1">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                          isFB
                            ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20"
                            : "bg-pink-50 dark:bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-500/20"
                        }`}
                      >
                        {isFB ? (
                          <FacebookIcon className="w-3 h-3 shrink-0" />
                        ) : (
                          <TikTokIcon className="w-3 h-3 shrink-0" />
                        )}
                        <span>{isFB ? "Facebook" : "TikTok"}</span>
                      </span>
                    </div>
                  </td>

                  {/* 5. Ngày đăng */}
                  <td
                    style={{ width: colWidths.ngayDang, minWidth: colWidths.ngayDang, maxWidth: colWidths.ngayDang }}
                    className="py-2.5 px-2.5 text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap border-r border-slate-100 dark:border-slate-800/60"
                    title={v.ngayDang || "N/A"}
                  >
                    {v.ngayDang ? v.ngayDang.slice(0, 10) : "N/A"}
                  </td>

                  {/* 6. Lượt like */}
                  <td style={{ width: colWidths.like, minWidth: colWidths.like, maxWidth: colWidths.like }} className="py-2.5 px-2 text-right font-mono font-bold text-pink-600 dark:text-pink-400 border-r border-slate-100 dark:border-slate-800/60">
                    {formatNumber(v.LuotLike)}
                  </td>

                  {/* 7. lượt comment */}
                  <td style={{ width: colWidths.comment, minWidth: colWidths.comment, maxWidth: colWidths.comment }} className="py-2.5 px-2 text-right font-mono font-bold text-amber-600 dark:text-amber-400 border-r border-slate-100 dark:border-slate-800/60">
                    {formatNumber(v.LuotComment)}
                  </td>

                  {/* 8. lượt Share */}
                  <td style={{ width: colWidths.share, minWidth: colWidths.share, maxWidth: colWidths.share }} className="py-2.5 px-2 text-right font-mono font-medium text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800/60">
                    {formatNumber(v.SoLuongNguoiShare)}
                  </td>

                  {/* 9. Lượt xem */}
                  <td style={{ width: colWidths.view, minWidth: colWidths.view, maxWidth: colWidths.view }} className="py-2.5 px-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 border-r border-slate-100 dark:border-slate-800/60">
                    {formatNumber(v.LuotXem)}
                  </td>

                  {/* 10. Thao tác */}
                  {canManage && (
                    <td style={{ width: colWidths.actions, minWidth: colWidths.actions, maxWidth: colWidths.actions }} className="py-2.5 px-2 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <a
                          href={v.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Mở link bài viết: ${v.link}`}
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 text-slate-600 dark:text-slate-300 hover:text-white transition inline-flex items-center justify-center cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => handleRefreshSingle(rowId)}
                          disabled={isRefreshing}
                          title="Cập nhật lại số liệu ngay"
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 text-slate-600 dark:text-slate-300 hover:text-white transition disabled:opacity-50 cursor-pointer"
                        >
                          <RotateCw
                            className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-500" : ""}`}
                          />
                        </button>
                        <button
                          onClick={() => handleDeleteVideo(rowId)}
                          disabled={isDeleting}
                          title="Xóa bài viết khỏi bảng"
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-600 text-slate-600 dark:text-slate-300 hover:text-white transition disabled:opacity-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Empty States */}
      {videos.length === 0 ? (
        <div className="py-16 text-center text-slate-500 dark:text-slate-400">
          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-3 text-2xl rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-400">
            <Inbox className="w-8 h-8 text-slate-400 dark:text-slate-500" />
          </div>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-300">
            Chưa có video nào trong danh sách theo dõi.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Hãy dán đường link video ở trên để bắt đầu cào dữ liệu!
          </p>
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="py-12 text-center text-slate-500 dark:text-slate-400">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-300">
            Không tìm thấy video nào phù hợp với bộ lọc.
          </p>
          <button
            onClick={() => {
              setSearchTerm("");
              setFilterPlatform("all");
            }}
            className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Đặt lại bộ lọc
          </button>
        </div>
      ) : null}

      {/* Thanh Phân Trang (Pagination Controls) */}
      {totalItems > 0 && (
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
          {/* Thông tin số lượng */}
          <div className="flex items-center gap-3">
            <span>
              Hiển thị{" "}
              <span className="font-semibold text-slate-900 dark:text-white">
                {totalItems > 0 ? (safePage - 1) * pageSize + 1 : 0}
              </span>{" "}
              -{" "}
              <span className="font-semibold text-slate-900 dark:text-white">
                {Math.min(safePage * pageSize, totalItems)}
              </span>{" "}
              trong tổng số{" "}
              <span className="font-semibold text-slate-900 dark:text-white">
                {totalItems}
              </span>{" "}
              video
            </span>

            {/* Số video mỗi trang */}
            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-slate-500">Mỗi trang:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2 py-1 text-xs bg-white border rounded-lg dark:bg-slate-900 border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={99999}>Tất cả</option>
              </select>
            </div>
          </div>

          {/* Nút bấm chuyển trang */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              {/* Về trang đầu */}
              <button
                onClick={() => setCurrentPage(1)}
                disabled={safePage === 1}
                className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                title="Trang đầu"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>

              {/* Lùi 1 trang */}
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                title="Trang trước"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {/* Danh sách số trang */}
              <div className="flex items-center gap-1 px-1">
                {pageNumbers.map((num, idx) => {
                  if (num === "...") {
                    return (
                      <span
                        key={`dots-${idx}`}
                        className="px-2 py-1 text-slate-400 dark:text-slate-500"
                      >
                        ...
                      </span>
                    );
                  }
                  const isCurrent = num === safePage;
                  return (
                    <button
                      key={`page-${num}`}
                      onClick={() => setCurrentPage(Number(num))}
                      className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                        isCurrent
                          ? "bg-blue-600 text-white font-bold shadow-sm shadow-blue-500/30"
                          : "bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>

              {/* Tiến 1 trang */}
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={safePage === totalPages}
                className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                title="Trang sau"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              {/* Tới trang cuối */}
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={safePage === totalPages}
                className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                title="Trang cuối"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating Bulk Actions Bar (Thanh tác vụ hàng loạt nổi) */}
      {selectedIds.size > 0 && canManage && (
        <div className="sticky bottom-3 z-30 mx-4 my-2 px-4 py-3 bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-slate-700/80 flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-600/30 text-blue-300 font-semibold border border-blue-500/40">
              <Check className="w-3.5 h-3.5" />
              Đã chọn {selectedIds.size} bài viết
            </span>
            {selectedIds.size < filteredVideos.length && (
              <button
                type="button"
                onClick={selectAllFiltered}
                className="text-xs text-blue-400 hover:text-blue-300 underline font-medium cursor-pointer transition"
              >
                Chọn tất cả {filteredVideos.length} bài trong bộ lọc
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Làm mới hàng loạt */}
            <button
              type="button"
              onClick={handleBulkRefreshAction}
              disabled={isBulkRefreshing || isBulkDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition cursor-pointer disabled:opacity-50"
              title="Cập nhật số liệu các bài viết đã chọn"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isBulkRefreshing ? "animate-spin text-blue-400" : ""}`} />
              <span>{isBulkRefreshing ? "Đang cập nhật..." : "Làm mới đã chọn"}</span>
            </button>

            {/* Xuất Excel đã chọn */}
            <button
              type="button"
              onClick={() => exportVideosToExcel(selectedVideosList, "danh_sach_video_da_chon")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 transition cursor-pointer"
              title="Xuất các bài đã chọn ra Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Xuất Excel ({selectedIds.size})</span>
            </button>

            {/* Xuất CSV đã chọn */}
            <button
              type="button"
              onClick={() => exportVideosToCSV(selectedVideosList, "danh_sach_video_da_chon")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 transition cursor-pointer"
              title="Xuất các bài đã chọn ra CSV"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>Xuất CSV ({selectedIds.size})</span>
            </button>

            {/* Xóa hàng loạt */}
            <button
              type="button"
              onClick={handleBulkDeleteAction}
              disabled={isBulkDeleting || isBulkRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-rose-600/25 hover:bg-rose-600/40 text-rose-300 border border-rose-500/40 transition cursor-pointer disabled:opacity-50"
              title="Xóa vĩnh viễn các bài đã chọn khỏi hệ thống"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>{isBulkDeleting ? "Đang xóa..." : "Xóa đã chọn"}</span>
            </button>

            {/* Bỏ chọn */}
            <button
              type="button"
              onClick={clearSelection}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/60 transition cursor-pointer ml-1"
              title="Bỏ chọn tất cả"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Quick Preview Card khi rê chuột */}
      {hoveredVideo && (
        <QuickPreviewCard video={hoveredVideo} position={previewPos} />
      )}
    </div>
  );
};
