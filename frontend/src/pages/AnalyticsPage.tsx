import React, { useMemo } from 'react';
import { DailyCharts } from '../components/DailyCharts';
import { StatsCards } from '../components/StatsCards';
import { VideoItem } from '../types/video';
import { Eye, ThumbsUp, Share2 } from 'lucide-react';
import { formatNumber } from '../utils/formatters';

interface AnalyticsPageProps {
  videos: VideoItem[];
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ videos }) => {
  const metrics = useMemo(() => {
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

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <StatsCards videos={videos} />

      {/* Platform Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Facebook Breakdown Card */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                f
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Facebook Analytics</h3>
                <p className="text-[11px] text-slate-500">{metrics.fb.count} video đang theo dõi</p>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-600/15 text-blue-700 dark:text-blue-300 font-semibold">
              Facebook
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-4 text-center">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-center gap-1 text-slate-500 text-[11px] mb-1">
                <Eye className="w-3 h-3" />
                <span>Xem</span>
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">{formatNumber(metrics.fb.views)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-center gap-1 text-slate-500 text-[11px] mb-1">
                <ThumbsUp className="w-3 h-3" />
                <span>Thích</span>
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">{formatNumber(metrics.fb.likes)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-center gap-1 text-slate-500 text-[11px] mb-1">
                <Share2 className="w-3 h-3" />
                <span>Chia sẻ</span>
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">{formatNumber(metrics.fb.shares)}</div>
            </div>
          </div>
        </div>

        {/* TikTok Breakdown Card */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center font-bold text-sm">
                🎵
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">TikTok Analytics</h3>
                <p className="text-[11px] text-slate-500">{metrics.tt.count} video đang theo dõi</p>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-pink-50 dark:bg-pink-600/15 text-pink-700 dark:text-pink-300 font-semibold">
              TikTok
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-4 text-center">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-center gap-1 text-slate-500 text-[11px] mb-1">
                <Eye className="w-3 h-3" />
                <span>Xem</span>
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">{formatNumber(metrics.tt.views)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-center gap-1 text-slate-500 text-[11px] mb-1">
                <ThumbsUp className="w-3 h-3" />
                <span>Thích</span>
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">{formatNumber(metrics.tt.likes)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-center gap-1 text-slate-500 text-[11px] mb-1">
                <Share2 className="w-3 h-3" />
                <span>Chia sẻ</span>
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">{formatNumber(metrics.tt.shares)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Video Statistics & 2 Line Charts */}
      <DailyCharts videos={videos} />
    </div>
  );
};
