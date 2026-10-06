import React, { useState, useMemo } from 'react';
import { DailyCharts } from '../components/DailyCharts';
import { AdvancedCharts } from '../components/AdvancedCharts';
import { StatsCards } from '../components/StatsCards';
import { VideoItem } from '../types/video';
import { Eye, ThumbsUp, Share2, Calendar, Filter, RotateCcw, Sparkles } from 'lucide-react';
import { formatNumber, extractDate } from '../utils/formatters';

interface AnalyticsPageProps {
  videos: VideoItem[];
}

export type TimeRangePreset = 'all' | '7d' | '30d' | '90d' | 'custom';
export type PlatformFilterType = 'all' | 'facebook' | 'tiktok';

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ videos }) => {
  // Bộ lọc thời gian
  const [timeRange, setTimeRange] = useState<TimeRangePreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Bộ lọc nền tảng (Facebook / TikTok / Tất cả)
  const [platformFilter, setPlatformFilter] = useState<PlatformFilterType>('all');

  // Lọc danh sách video theo thời gian và nền tảng
  const filteredVideos = useMemo(() => {
    let result = videos;

    // 1. Lọc theo nền tảng
    if (platformFilter === 'facebook') {
      result = result.filter((v) => (v.loai || '').toLowerCase().includes('facebook'));
    } else if (platformFilter === 'tiktok') {
      result = result.filter((v) => (v.loai || '').toLowerCase().includes('tiktok'));
    }

    // 2. Lọc theo khoảng thời gian
    if (timeRange === 'all') return result;

    const now = new Date();
    let thresholdDate: Date | null = null;
    if (timeRange === '7d') {
      thresholdDate = new Date();
      thresholdDate.setDate(now.getDate() - 7);
    } else if (timeRange === '30d') {
      thresholdDate = new Date();
      thresholdDate.setDate(now.getDate() - 30);
    } else if (timeRange === '90d') {
      thresholdDate = new Date();
      thresholdDate.setDate(now.getDate() - 90);
    }

    if (thresholdDate) {
      const thresholdStr = thresholdDate.toISOString().slice(0, 10);
      return result.filter((v) => {
        const d = extractDate(v.ngayDang);
        if (!d) return true; // Giữ lại bài chưa rõ ngày hoặc chỉ lọc bài có ngày hợp lệ
        return d >= thresholdStr;
      });
    }

    if (timeRange === 'custom') {
      return result.filter((v) => {
        const d = extractDate(v.ngayDang);
        if (!d) return false;
        if (customStartDate && d < customStartDate) return false;
        if (customEndDate && d > customEndDate) return false;
        return true;
      });
    }

    return result;
  }, [videos, platformFilter, timeRange, customStartDate, customEndDate]);

  // Thống kê riêng cho 2 thẻ nền tảng (luôn tính trên tập videos hoặc filteredVideos)
  const platformMetrics = useMemo(() => {
    let fbCount = 0;
    let fbViews = 0;
    let fbLikes = 0;
    let fbShares = 0;

    let ttCount = 0;
    let ttViews = 0;
    let ttLikes = 0;
    let ttShares = 0;

    for (const v of videos) {
      const loai = (v.loai || '').toLowerCase();
      const views = typeof v.LuotXem === 'number' ? v.LuotXem : 0;
      const likes = typeof v.LuotLike === 'number' ? v.LuotLike : 0;
      const shares = typeof v.SoLuongNguoiShare === 'number' ? v.SoLuongNguoiShare : 0;

      if (loai.includes('facebook')) {
        fbCount++;
        fbViews += views;
        fbLikes += likes;
        fbShares += shares;
      } else if (loai.includes('tiktok')) {
        ttCount++;
        ttViews += views;
        ttLikes += likes;
        ttShares += shares;
      }
    }

    return {
      fb: { count: fbCount, views: fbViews, likes: fbLikes, shares: fbShares },
      tt: { count: ttCount, views: ttViews, likes: ttLikes, shares: ttShares },
    };
  }, [videos]);

  const isFiltered = timeRange !== 'all' || platformFilter !== 'all';

  const handleResetFilters = () => {
    setTimeRange('all');
    setPlatformFilter('all');
    setCustomStartDate('');
    setCustomEndDate('');
  };

  return (
    <div className="space-y-6">
      {/* 1. Thanh điều khiển Bộ Lọc Thời Gian & Nền Tảng (Time & Platform Filter Toolbar) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Filter className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                Bảng Phân Tích &amp; Đo Lường Tương Tác
              </h2>
              {isFiltered && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  Đang lọc
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Đang hiển thị{' '}
              <strong className="text-slate-800 dark:text-slate-200">{filteredVideos.length}</strong> / {videos.length} bài viết
              {platformFilter !== 'all' && (
                <span>
                  {' '}• Nền tảng: <strong className="capitalize">{platformFilter}</strong>
                </span>
              )}
              {timeRange !== 'all' && (
                <span>
                  {' '}• Thời gian:{' '}
                  <strong>
                    {timeRange === '7d'
                      ? '7 ngày qua'
                      : timeRange === '30d'
                      ? '30 ngày qua'
                      : timeRange === '90d'
                      ? '90 ngày qua'
                      : 'Tùy chọn'}
                  </strong>
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Các nút bấm chọn Preset thời gian */}
        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/60 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTimeRange('all')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                timeRange === 'all'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Toàn bộ
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('7d')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                timeRange === '7d'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              7 ngày
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('30d')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                timeRange === '30d'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              30 ngày
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('90d')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                timeRange === '90d'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              90 ngày
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('custom')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                timeRange === 'custom'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Tùy chọn</span>
            </button>
          </div>

          {/* Ô chọn ngày khi ở chế độ custom */}
          {timeRange === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500"
                title="Từ ngày"
              />
              <span className="text-slate-400">-</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500"
                title="Đến ngày"
              />
            </div>
          )}

          {/* Nút đặt lại bộ lọc */}
          {isFiltered && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
              title="Đặt lại toàn bộ lọc"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Overview Cards (Tính theo filteredVideos) */}
      <StatsCards videos={filteredVideos} />

      {/* 3. Platform Comparison Cards (Có tính năng click để lọc theo nền tảng) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Facebook Breakdown Card */}
        <div
          onClick={() => setPlatformFilter((prev) => (prev === 'facebook' ? 'all' : 'facebook'))}
          className={`bg-white dark:bg-slate-900/80 border rounded-2xl p-5 shadow-xs cursor-pointer transition-all ${
            platformFilter === 'facebook'
              ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-950/20 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
          title={
            platformFilter === 'facebook'
              ? 'Đang lọc Facebook (Click để bỏ lọc)'
              : 'Click để lọc riêng dữ liệu Facebook'
          }
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                f
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">Facebook Analytics</h3>
                  {platformFilter === 'facebook' && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-blue-600 text-white">
                      Đang chọn
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  {platformMetrics.fb.count} video đang theo dõi • Click để lọc
                </p>
              </div>
            </div>
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-semibold transition ${
                platformFilter === 'facebook'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 dark:bg-blue-600/15 text-blue-700 dark:text-blue-300'
              }`}
            >
              Facebook
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-4 text-center">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-center gap-1 text-slate-500 text-[11px] mb-1">
                <Eye className="w-3 h-3" />
                <span>Xem</span>
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                {formatNumber(platformMetrics.fb.views)}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-center gap-1 text-slate-500 text-[11px] mb-1">
                <ThumbsUp className="w-3 h-3" />
                <span>Thích</span>
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                {formatNumber(platformMetrics.fb.likes)}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-center gap-1 text-slate-500 text-[11px] mb-1">
                <Share2 className="w-3 h-3" />
                <span>Chia sẻ</span>
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                {formatNumber(platformMetrics.fb.shares)}
              </div>
            </div>
          </div>
        </div>

        {/* TikTok Breakdown Card */}
        <div
          onClick={() => setPlatformFilter((prev) => (prev === 'tiktok' ? 'all' : 'tiktok'))}
          className={`bg-white dark:bg-slate-900/80 border rounded-2xl p-5 shadow-xs cursor-pointer transition-all ${
            platformFilter === 'tiktok'
              ? 'border-pink-500 ring-2 ring-pink-500/20 bg-pink-50/20 dark:bg-pink-950/20 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
          title={
            platformFilter === 'tiktok'
              ? 'Đang lọc TikTok (Click để bỏ lọc)'
              : 'Click để lọc riêng dữ liệu TikTok'
          }
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center font-bold text-sm shadow-xs">
                🎵
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">TikTok Analytics</h3>
                  {platformFilter === 'tiktok' && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-pink-600 text-white">
                      Đang chọn
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  {platformMetrics.tt.count} video đang theo dõi • Click để lọc
                </p>
              </div>
            </div>
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-semibold transition ${
                platformFilter === 'tiktok'
                  ? 'bg-pink-600 text-white'
                  : 'bg-pink-50 dark:bg-pink-600/15 text-pink-700 dark:text-pink-300'
              }`}
            >
              TikTok
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-4 text-center">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-center gap-1 text-slate-500 text-[11px] mb-1">
                <Eye className="w-3 h-3" />
                <span>Xem</span>
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                {formatNumber(platformMetrics.tt.views)}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-center gap-1 text-slate-500 text-[11px] mb-1">
                <ThumbsUp className="w-3 h-3" />
                <span>Thích</span>
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                {formatNumber(platformMetrics.tt.likes)}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-center gap-1 text-slate-500 text-[11px] mb-1">
                <Share2 className="w-3 h-3" />
                <span>Chia sẻ</span>
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                {formatNumber(platformMetrics.tt.shares)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Thông báo khi không có bài viết nào khớp bộ lọc */}
      {filteredVideos.length === 0 && (
        <div className="py-12 text-center bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 flex flex-col items-center justify-center gap-2">
          <Sparkles className="w-8 h-8 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Không tìm thấy bài viết nào khớp với khoảng thời gian và nền tảng đã chọn.
          </p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="mt-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer"
          >
            Đặt lại bộ lọc
          </button>
        </div>
      )}

      {/* 4. Daily Video Statistics & 2 Line Charts (Nhận filteredVideos) */}
      <DailyCharts videos={filteredVideos} />

      {/* 5. Advanced Visual Analytics: Format Breakdown, Top Channels, Cross-Platform Engagement, Peak Posting Times, Compliance Rate & Viral Ranking */}
      <AdvancedCharts videos={filteredVideos} />
    </div>
  );
};
