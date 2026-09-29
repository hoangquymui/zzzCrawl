import React, { useMemo, useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  registerables,
} from 'chart.js';
import {
  PieChart,
  BarChart2,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Award,
  TrendingUp,
  ExternalLink,
  ThumbsUp,
  MessageSquare,
  Share2,
} from 'lucide-react';
import { VideoItem } from '../types/video';
import { formatNumber } from '../utils/formatters';
import { useTheme } from '../context/ThemeContext';

ChartJS.register(...registerables);

interface AdvancedChartsProps {
  videos: VideoItem[];
}

export const AdvancedCharts: React.FC<AdvancedChartsProps> = ({ videos }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Common colors
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(51, 65, 85, 0.35)' : 'rgba(203, 213, 225, 0.7)';
  const tooltipBg = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
  const tooltipTitle = isDark ? '#f1f5f9' : '#0f172a';
  const tooltipBorder = isDark ? 'rgba(51, 65, 85, 0.8)' : 'rgba(203, 213, 225, 0.8)';

  // Canvas Refs
  const formatCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const authorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const engagementCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hourCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Chart Instances
  const formatChartRef = useRef<ChartJS | null>(null);
  const authorChartRef = useRef<ChartJS | null>(null);
  const engagementChartRef = useRef<ChartJS | null>(null);
  const hourChartRef = useRef<ChartJS | null>(null);

  // 1. Dữ liệu phân bố định dạng nội dung
  const formatData = useMemo(() => {
    const counts: Record<string, number> = {
      'Facebook Reel': 0,
      'Facebook Video': 0,
      'Facebook Post': 0,
      'Facebook Photo': 0,
      'TikTok Video': 0,
      'TikTok Photo': 0,
      'Khác': 0,
    };

    for (const v of videos) {
      const loai = v.loai || '';
      if (counts[loai] !== undefined) {
        counts[loai]++;
      } else {
        counts['Khác']++;
      }
    }

    const filtered = Object.entries(counts).filter(([_, count]) => count > 0);
    return {
      labels: filtered.map(([name]) => name),
      data: filtered.map(([_, count]) => count),
      total: videos.length,
    };
  }, [videos]);

  // 2. Dữ liệu Top 5 Tác giả
  const topAuthorsData = useMemo(() => {
    const authorCounts: Record<string, number> = {};
    for (const v of videos) {
      const author = (v.nguoiDang || 'Chưa xác định').trim();
      authorCounts[author] = (authorCounts[author] || 0) + 1;
    }

    const sorted = Object.entries(authorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      labels: sorted.map(([name]) => name),
      data: sorted.map(([_, count]) => count),
    };
  }, [videos]);

  // 3. Dữ liệu so sánh tương tác Facebook vs TikTok
  const platformEngagement = useMemo(() => {
    let fbLikes = 0, fbComments = 0, fbShares = 0;
    let ttLikes = 0, ttComments = 0, ttShares = 0;

    for (const v of videos) {
      const loai = (v.loai || '').toLowerCase();
      const likes = typeof v.LuotLike === 'number' ? v.LuotLike : 0;
      const comments = typeof v.LuotComment === 'number' ? v.LuotComment : 0;
      const shares = typeof v.SoLuongNguoiShare === 'number' ? v.SoLuongNguoiShare : 0;

      if (loai.includes('facebook')) {
        fbLikes += likes;
        fbComments += comments;
        fbShares += shares;
      } else if (loai.includes('tiktok')) {
        ttLikes += likes;
        ttComments += comments;
        ttShares += shares;
      }
    }

    return {
      fb: [fbLikes, fbComments, fbShares],
      tt: [ttLikes, ttComments, ttShares],
    };
  }, [videos]);

  // 4. Dữ liệu phân bố khung giờ đăng bài
  const hourDistribution = useMemo(() => {
    // Sáng: 6-12, Chiều: 12-18, Tối: 18-22, Đêm/Khuya: 22-6
    const slots = {
      'Sáng (06:00 - 12:00)': 0,
      'Chiều (12:00 - 18:00)': 0,
      'Tối (18:00 - 22:00)': 0,
      'Đêm (22:00 - 06:00)': 0,
    };

    for (const v of videos) {
      if (!v.ngayDang) continue;
      const m = v.ngayDang.match(/(\d{1,2}):\d{2}/);
      if (m) {
        const hour = parseInt(m[1], 10);
        if (hour >= 6 && hour < 12) {
          slots['Sáng (06:00 - 12:00)']++;
        } else if (hour >= 12 && hour < 18) {
          slots['Chiều (12:00 - 18:00)']++;
        } else if (hour >= 18 && hour < 22) {
          slots['Tối (18:00 - 22:00)']++;
        } else {
          slots['Đêm (22:00 - 06:00)']++;
        }
      }
    }

    return {
      labels: Object.keys(slots),
      data: Object.values(slots),
    };
  }, [videos]);

  // 5. Thống kê tỷ lệ vi phạm tiêu chuẩn
  const violationStats = useMemo(() => {
    let violationCount = 0;
    let safeCount = 0;

    for (const v of videos) {
      if (v.isViolation) {
        violationCount++;
      } else {
        safeCount++;
      }
    }

    const total = videos.length || 1;
    const safePercent = Math.round((safeCount / total) * 100);
    const violationPercent = Math.round((violationCount / total) * 100);

    return { violationCount, safeCount, safePercent, violationPercent, total: videos.length };
  }, [videos]);

  // 6. Top 5 bài viết / video có tương tác cao nhất
  const topViralVideos = useMemo(() => {
    return [...videos]
      .map((v) => {
        const score =
          (v.LuotLike || 0) * 1 +
          (v.LuotComment || 0) * 2 +
          (v.SoLuongNguoiShare || 0) * 3 +
          (v.LuotXem || 0) * 0.05;
        return { ...v, totalScore: Math.round(score) };
      })
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 5);
  }, [videos]);

  // EFFECT 1: Biểu đồ Format Doughnut
  useEffect(() => {
    if (!formatCanvasRef.current || formatData.data.length === 0) return;
    if (formatChartRef.current) {
      formatChartRef.current.destroy();
      formatChartRef.current = null;
    }

    const ctx = formatCanvasRef.current.getContext('2d');
    if (!ctx) return;

    const colors = [
      '#2563eb', // Reel
      '#0284c7', // Video
      '#6366f1', // Post
      '#0d9488', // Photo
      '#ec4899', // TT Video
      '#f43f5e', // TT Photo
      '#94a3b8', // Khác
    ];

    formatChartRef.current = new ChartJS(ctx, {
      type: 'doughnut',
      data: {
        labels: formatData.labels,
        datasets: [
          {
            data: formatData.data,
            backgroundColor: colors.slice(0, formatData.labels.length),
            borderColor: isDark ? '#0f172a' : '#ffffff',
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: textColor,
              font: { size: 11 },
              boxWidth: 12,
              boxHeight: 12,
              padding: 12,
            },
          },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: tooltipTitle,
            bodyColor: textColor,
            borderColor: tooltipBorder,
            borderWidth: 1,
            padding: 10,
            cornerRadius: 10,
            callbacks: {
              label: (item) => {
                const total = formatData.total || 1;
                const val = item.raw as number;
                const percent = ((val / total) * 100).toFixed(1);
                return ` ${item.label}: ${val} bài (${percent}%)`;
              },
            },
          },
        },
        cutout: '62%',
      },
    });

    return () => {
      formatChartRef.current?.destroy();
      formatChartRef.current = null;
    };
  }, [formatData, isDark, textColor, tooltipBg, tooltipBorder, tooltipTitle]);

  // EFFECT 2: Biểu đồ Top 5 Tác giả (Horizontal Bar)
  useEffect(() => {
    if (!authorCanvasRef.current || topAuthorsData.data.length === 0) return;
    if (authorChartRef.current) {
      authorChartRef.current.destroy();
      authorChartRef.current = null;
    }

    const ctx = authorCanvasRef.current.getContext('2d');
    if (!ctx) return;

    authorChartRef.current = new ChartJS(ctx, {
      type: 'bar',
      data: {
        labels: topAuthorsData.labels,
        datasets: [
          {
            label: 'Số bài viết / video',
            data: topAuthorsData.data,
            backgroundColor: 'rgba(59, 130, 246, 0.75)',
            borderColor: '#3b82f6',
            borderWidth: 1.5,
            borderRadius: 8,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: tooltipTitle,
            bodyColor: '#3b82f6',
            borderColor: tooltipBorder,
            borderWidth: 1,
            padding: 10,
            cornerRadius: 10,
            callbacks: {
              label: (item) => ` 🎬 ${item.raw} bài viết / video`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 11 }, precision: 0 },
            beginAtZero: true,
          },
          y: {
            grid: { display: false },
            ticks: {
              color: textColor,
              font: { size: 11 },
              callback: function (_val, index) {
                const label = topAuthorsData.labels[index] || '';
                return label.length > 18 ? label.slice(0, 16) + '...' : label;
              },
            },
          },
        },
      },
    });

    return () => {
      authorChartRef.current?.destroy();
      authorChartRef.current = null;
    };
  }, [topAuthorsData, isDark, gridColor, textColor, tooltipBg, tooltipBorder, tooltipTitle]);

  // EFFECT 3: Biểu đồ so sánh tương tác đa chiều (Grouped Bar)
  useEffect(() => {
    if (!engagementCanvasRef.current) return;
    if (engagementChartRef.current) {
      engagementChartRef.current.destroy();
      engagementChartRef.current = null;
    }

    const ctx = engagementCanvasRef.current.getContext('2d');
    if (!ctx) return;

    engagementChartRef.current = new ChartJS(ctx, {
      type: 'bar',
      data: {
        labels: ['Lượt thích (Likes)', 'Bình luận (Comments)', 'Chia sẻ (Shares)'],
        datasets: [
          {
            label: 'Facebook',
            data: platformEngagement.fb,
            backgroundColor: 'rgba(37, 99, 235, 0.8)',
            borderColor: '#2563eb',
            borderWidth: 1.5,
            borderRadius: 6,
          },
          {
            label: 'TikTok',
            data: platformEngagement.tt,
            backgroundColor: 'rgba(236, 72, 153, 0.8)',
            borderColor: '#ec4899',
            borderWidth: 1.5,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: textColor, font: { size: 11 }, boxWidth: 12, padding: 12 },
          },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: tooltipTitle,
            bodyColor: textColor,
            borderColor: tooltipBorder,
            borderWidth: 1,
            padding: 10,
            cornerRadius: 10,
            callbacks: {
              label: (item) => ` ${item.dataset.label}: ${formatNumber(item.raw as number)} lượt`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { size: 11 } },
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { size: 11 },
              callback: (val) => formatNumber(val as number),
            },
            beginAtZero: true,
          },
        },
      },
    });

    return () => {
      engagementChartRef.current?.destroy();
      engagementChartRef.current = null;
    };
  }, [platformEngagement, isDark, gridColor, textColor, tooltipBg, tooltipBorder, tooltipTitle]);

  // EFFECT 4: Biểu đồ phân bố khung giờ đăng bài (Polar Area)
  useEffect(() => {
    if (!hourCanvasRef.current) return;
    if (hourChartRef.current) {
      hourChartRef.current.destroy();
      hourChartRef.current = null;
    }

    const ctx = hourCanvasRef.current.getContext('2d');
    if (!ctx) return;

    hourChartRef.current = new ChartJS(ctx, {
      type: 'polarArea',
      data: {
        labels: hourDistribution.labels,
        datasets: [
          {
            data: hourDistribution.data,
            backgroundColor: [
              'rgba(245, 158, 11, 0.75)', // Sáng - Vàng hổ phách
              'rgba(59, 130, 246, 0.75)',  // Chiều - Xanh lam
              'rgba(147, 51, 234, 0.75)',  // Tối - Tím
              'rgba(99, 102, 241, 0.75)',  // Đêm - Chàm
            ],
            borderColor: isDark ? '#0f172a' : '#ffffff',
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: textColor, font: { size: 10 }, boxWidth: 10, padding: 8 },
          },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: tooltipTitle,
            bodyColor: textColor,
            borderColor: tooltipBorder,
            borderWidth: 1,
            padding: 10,
            cornerRadius: 10,
            callbacks: {
              label: (item) => ` ${item.label}: ${item.raw} bài`,
            },
          },
        },
        scales: {
          r: {
            grid: { color: gridColor },
            ticks: { display: false },
          },
        },
      },
    });

    return () => {
      hourChartRef.current?.destroy();
      hourChartRef.current = null;
    };
  }, [hourDistribution, isDark, gridColor, textColor, tooltipBg, tooltipBorder, tooltipTitle]);

  return (
    <div className="space-y-6">
      {/* Hàng 1: Cơ cấu định dạng nội dung + Top 5 Tác giả */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Biểu đồ 1: Cơ cấu định dạng nội dung */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <PieChart className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">Cơ cấu định dạng nội dung</h3>
                  <p className="text-[11px] text-slate-500">Tỷ lệ Reel, Video, Post, Photo</p>
                </div>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {videos.length} bài
              </span>
            </div>

            <div className="h-64 relative mt-3 flex items-center justify-center">
              <canvas ref={formatCanvasRef} />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-around text-center text-xs">
            <div>
              <span className="text-slate-400 text-[10px] block">Video / Reel</span>
              <span className="font-bold text-blue-600 dark:text-blue-400">
                {videos.filter((v) => (v.loai || '').toLowerCase().includes('reel') || (v.loai || '').toLowerCase().includes('video')).length}
              </span>
            </div>
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />
            <div>
              <span className="text-slate-400 text-[10px] block">Bài viết (Post)</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">
                {videos.filter((v) => (v.loai || '').toLowerCase().includes('post')).length}
              </span>
            </div>
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />
            <div>
              <span className="text-slate-400 text-[10px] block">Hình ảnh (Photo)</span>
              <span className="font-bold text-teal-600 dark:text-teal-400">
                {videos.filter((v) => (v.loai || '').toLowerCase().includes('photo')).length}
              </span>
            </div>
          </div>
        </div>

        {/* Biểu đồ 2: Top 5 Tác giả nhiều nội dung nhất */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <BarChart2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">Top 5 Tác giả hoạt động nhiều nhất</h3>
                  <p className="text-[11px] text-slate-500">Kênh/Fanpage có số lượng bài viết cao nhất</p>
                </div>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300">
                Xếp hạng
              </span>
            </div>

            <div className="h-64 relative mt-3">
              <canvas ref={authorCanvasRef} />
            </div>
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
            <span>Thống kê phân bổ tải lượng theo dõi của hệ thống crawler theo từng kênh mục tiêu.</span>
          </p>
        </div>
      </div>

      {/* Hàng 2: So sánh tương tác Facebook vs TikTok + Phân bố khung giờ đăng bài */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Biểu đồ 3: So sánh cơ cấu tương tác Facebook vs TikTok */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">So sánh tương tác Facebook &amp; TikTok</h3>
                <p className="text-[11px] text-slate-500">Đối chiếu lượt thích, bình luận và chia sẻ giữa 2 nền tảng</p>
              </div>
            </div>
          </div>

          <div className="h-64 relative mt-3">
            <canvas ref={engagementCanvasRef} />
          </div>
        </div>

        {/* Biểu đồ 4: Phân bố khung giờ đăng bài */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">Khung giờ đăng bài</h3>
                  <p className="text-[11px] text-slate-500">Thời điểm hoạt động cao điểm trong ngày</p>
                </div>
              </div>
            </div>

            <div className="h-64 relative mt-3 flex items-center justify-center">
              <canvas ref={hourCanvasRef} />
            </div>
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
            Dựa trên nhãn thời gian bóc tách thực tế từ các bài viết đã quét
          </p>
        </div>
      </div>

      {/* Hàng 3: Chỉ số an toàn tiêu chuẩn + Bảng vinh danh Top 5 Viral Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Widget 5: Tỷ lệ an toàn & vi phạm tiêu chuẩn */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">Kiểm duyệt tiêu chuẩn</h3>
                  <p className="text-[11px] text-slate-500">Đối soát từ vựng nhạy cảm</p>
                </div>
              </div>
            </div>

            {/* Gauge / Progress */}
            <div className="mt-5 space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="w-4 h-4" />
                    Hợp chuẩn an toàn
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {violationStats.safeCount} bài ({violationStats.safePercent}%)
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${violationStats.safePercent}%` }}
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                    <ShieldAlert className="w-4 h-4" />
                    Cảnh báo vi phạm
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {violationStats.violationCount} bài ({violationStats.violationPercent}%)
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-rose-500 rounded-full transition-all duration-500"
                    style={{ width: `${violationStats.violationPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-400">
              Quy tắc đối soát theo bộ từ điển tại mục <strong>Quản trị &gt; Từ ngữ</strong>.
            </span>
          </div>
        </div>

        {/* Widget 6: Top 5 Video / Bài viết Viral nhất */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Top 5 Nội dung có tương tác cao nhất</h3>
                <p className="text-[11px] text-slate-500">Xếp hạng theo tổng điểm Thích, Bình luận, Chia sẻ và Lượt xem</p>
              </div>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              Viral Content
            </span>
          </div>

          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800/80">
            {topViralVideos.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">Chưa có đủ dữ liệu video</div>
            ) : (
              topViralVideos.map((item, idx) => {
                const rankColors = [
                  'bg-amber-400 text-amber-950 shadow-xs shadow-amber-400/40', // #1 Vàng
                  'bg-slate-300 text-slate-900', // #2 Bạc
                  'bg-amber-600 text-white',     // #3 Đồng
                  'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
                  'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
                ];

                return (
                  <div key={item.STT || idx} className="py-3 flex items-center justify-between gap-3 group">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          rankColors[idx] || rankColors[3]
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                            {item.nguoiDang || 'Chưa có tên'}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">
                            {item.loai}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-md mt-0.5">
                          {item.caption || 'Không có tiêu đề'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 text-xs">
                      <div className="hidden sm:flex items-center gap-3 text-slate-500 text-[11px]">
                        <span className="flex items-center gap-1" title="Lượt thích">
                          <ThumbsUp className="w-3 h-3 text-blue-500" />
                          {formatNumber(item.LuotLike || 0)}
                        </span>
                        <span className="flex items-center gap-1" title="Bình luận">
                          <MessageSquare className="w-3 h-3 text-emerald-500" />
                          {formatNumber(item.LuotComment || 0)}
                        </span>
                        <span className="flex items-center gap-1" title="Chia sẻ">
                          <Share2 className="w-3 h-3 text-indigo-500" />
                          {formatNumber(item.SoLuongNguoiShare || 0)}
                        </span>
                      </div>

                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Mở liên kết gốc"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
