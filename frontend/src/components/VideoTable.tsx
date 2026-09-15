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
} from "lucide-react";
import { BatchProgress, VideoItem } from "../types/video";
import { formatNumber } from "../utils/formatters";
import { exportVideosToExcel } from "../utils/exportExcel";
import { exportVideosToCSV } from "../utils/exportCsv";
import { FacebookIcon, TikTokIcon } from "./Icons";
import { DateRangePicker } from "./DateRangePicker";

interface VideoTableProps {
  videos: VideoItem[];
  batchProgress: BatchProgress;
  updatedRowStt: number | null;
  onRefreshOne: (stt: number) => Promise<void>;
  onRefreshAll: () => Promise<void>;
  onDelete: (stt: number) => Promise<void>;
  canManage?: boolean;
}

export const VideoTable: React.FC<VideoTableProps> = ({
  videos,
  batchProgress,
  updatedRowStt,
  onRefreshOne,
  onRefreshAll,
  onDelete,
  canManage = true,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPlatform, setFilterPlatform] = useState<"all" | "fb" | "tiktok">(
    "all",
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [refreshingStt, setRefreshingStt] = useState<number | null>(null);
  const [deletingStt, setDeletingStt] = useState<number | null>(null);

  // Phân trang
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

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

  const handleRefreshSingle = async (stt: number) => {
    setRefreshingStt(stt);
    await onRefreshOne(stt);
    setRefreshingStt(null);
  };

  const handleDeleteVideo = async (stt: number) => {
    if (
      window.confirm(
        `Bạn có chắc chắn muốn xóa video STT ${stt} khỏi danh sách theo dõi?`,
      )
    ) {
      setDeletingStt(stt);
      await onDelete(stt);
      setDeletingStt(null);
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
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70 text-slate-600 dark:text-slate-400 uppercase font-semibold tracking-wider text-[11px]">
              <th className="w-12 px-2 py-3 text-center shrink-0">STT</th>
              <th className="py-3 px-2.5 w-36 min-w-[120px]">Link</th>
              <th className="py-3 px-2.5 min-w-[160px]">Caption</th>
              <th className="py-3 px-2.5 w-28 text-center shrink-0">Loại</th>
              <th className="py-3 px-2.5 w-32 shrink-0">Người Đăng</th>
              <th className="py-3 px-2.5 w-28 shrink-0">Ngày Đăng</th>
              <th className="w-20 px-2 py-3 text-right shrink-0">Lượt Share</th>
              <th className="w-24 px-2 py-3 text-right shrink-0">Lượt Xem</th>
              <th className="w-20 px-2 py-3 text-right shrink-0">Lượt Like</th>
              <th className="w-20 px-2 py-3 text-right shrink-0">Bình Luận</th>
              {canManage && (
                <th className="w-20 px-2 py-3 text-center shrink-0">
                  Thao Tác
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
            {paginatedVideos.map((v) => {
              const isFB = (v.loai || "").includes("Facebook");
              const badgeColor = isFB
                ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20"
                : "bg-pink-50 dark:bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-500/20";

              const isUpdated = updatedRowStt === v.STT;
              const isRefreshing = refreshingStt === v.STT;
              const isDeleting = deletingStt === v.STT;

              return (
                <tr
                  key={v.STT}
                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition duration-150 ${
                    isUpdated ? "animate-row-pulse" : ""
                  }`}
                >
                  {/* STT */}
                  <td className="py-2.5 px-2 text-center font-bold text-slate-700 dark:text-slate-300">
                    {v.STT}
                  </td>

                  {/* Link */}
                  <td className="py-2.5 px-2.5">
                    <a
                      href={v.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium truncate max-w-[140px] inline-flex items-center gap-1.5 transition"
                      title={v.link}
                    >
                      <ExternalLink className="w-3 h-3 text-blue-500 shrink-0 dark:text-blue-400" />
                      <span className="truncate">
                        {v.link.replace(/^https?:\/\/(www\.)?/, "")}
                      </span>
                    </a>
                  </td>

                  {/* Caption */}
                  <td className="py-2.5 px-2.5 text-slate-800 dark:text-slate-200">
                    <div
                      className="leading-relaxed line-clamp-2"
                      title={v.caption || ""}
                    >
                      {v.caption || "(Không có tiêu đề)"}
                    </div>
                  </td>

                  {/* Loại */}
                  <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeColor}`}
                    >
                      {isFB ? (
                        <FacebookIcon className="w-3 h-3 shrink-0" />
                      ) : (
                        <TikTokIcon className="w-3 h-3 shrink-0" />
                      )}
                      <span>{isFB ? "FB Video" : "TikTok"}</span>
                    </span>
                  </td>

                  {/* Người Đăng */}
                  <td
                    className="py-2.5 px-2.5 font-medium text-slate-800 dark:text-slate-200 truncate max-w-[120px]"
                    title={v.nguoiDang || "N/A"}
                  >
                    {v.nguoiDang || "N/A"}
                  </td>

                  {/* Ngày Đăng */}
                  <td
                    className="py-2.5 px-2.5 text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap"
                    title={v.ngayDang || "N/A"}
                  >
                    {v.ngayDang ? v.ngayDang.slice(0, 10) : "N/A"}
                  </td>

                  {/* Lượt Share */}
                  <td className="py-2.5 px-2 text-right font-mono font-medium text-slate-700 dark:text-slate-300">
                    {formatNumber(v.SoLuongNguoiShare)}
                  </td>

                  {/* Lượt Xem */}
                  <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {formatNumber(v.LuotXem)}
                  </td>

                  {/* Lượt Like */}
                  <td className="py-2.5 px-2 text-right font-mono font-bold text-pink-600 dark:text-pink-400">
                    {formatNumber(v.LuotLike)}
                  </td>

                  {/* Bình Luận */}
                  <td className="py-2.5 px-2 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                    {formatNumber(v.LuotComment)}
                  </td>

                  {/* Thao Tác */}
                  {canManage && (
                    <td className="py-2.5 px-2 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => handleRefreshSingle(v.STT)}
                          disabled={isRefreshing}
                          title="Cập nhật lại số liệu ngay"
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 text-slate-600 dark:text-slate-300 hover:text-white transition disabled:opacity-50 cursor-pointer"
                        >
                          <RotateCw
                            className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-500" : ""}`}
                          />
                        </button>
                        <button
                          onClick={() => handleDeleteVideo(v.STT)}
                          disabled={isDeleting}
                          title="Xóa video khỏi bảng"
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
    </div>
  );
};
