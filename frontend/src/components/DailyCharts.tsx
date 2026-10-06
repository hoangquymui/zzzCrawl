import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  registerables,
} from 'chart.js';
import {
  TrendingUp,
  LineChart,
  Calendar,
  Info,
  Download,
  Eye,
  ThumbsUp,
  MessageSquare,
  Share2,
  FileText,
} from 'lucide-react';
import { VideoItem, DailyStat } from '../types/video';
import { getDailyStatsData, formatDateVN, formatNumber, downloadCanvasChart } from '../utils/formatters';
import { useTheme } from '../context/ThemeContext';

// Đăng ký toàn bộ controller và plugin cần thiết của Chart.js
ChartJS.register(...registerables);

interface DailyChartsProps {
  videos: VideoItem[];
}

export type DailyMetricType = 'count' | 'views' | 'likes' | 'comments' | 'shares';

interface MetricConfigItem {
  id: DailyMetricType;
  name: string;
  unit: string;
  cumKey: keyof DailyStat;
  dailyKey: keyof DailyStat;
  cumBorder: string;
  cumPoint: string;
  cumLight: string;
  cumGrad: string;
  dailyBorder: string;
  dailyPoint: string;
  dailyLight: string;
  dailyGrad: string;
}

const METRIC_CONFIG: Record<DailyMetricType, MetricConfigItem> = {
  count: {
    id: 'count',
    name: 'Số bài viết',
    unit: 'bài',
    cumKey: 'cumulative',
    dailyKey: 'count',
    cumBorder: '#38bdf8',
    cumPoint: '#0284c7',
    cumLight: '#bae6fd',
    cumGrad: 'rgba(56, 189, 248, 0.35)',
    dailyBorder: '#34d399',
    dailyPoint: '#059669',
    dailyLight: '#a7f3d0',
    dailyGrad: 'rgba(52, 211, 153, 0.35)',
  },
  views: {
    id: 'views',
    name: 'Lượt xem',
    unit: 'lượt',
    cumKey: 'cumulativeViews',
    dailyKey: 'views',
    cumBorder: '#f59e0b',
    cumPoint: '#d97706',
    cumLight: '#fde68a',
    cumGrad: 'rgba(245, 158, 11, 0.35)',
    dailyBorder: '#fbbf24',
    dailyPoint: '#b45309',
    dailyLight: '#fef3c7',
    dailyGrad: 'rgba(251, 191, 36, 0.35)',
  },
  likes: {
    id: 'likes',
    name: 'Lượt thích',
    unit: 'thích',
    cumKey: 'cumulativeLikes',
    dailyKey: 'likes',
    cumBorder: '#3b82f6',
    cumPoint: '#1d4ed8',
    cumLight: '#bfdbfe',
    cumGrad: 'rgba(59, 130, 246, 0.35)',
    dailyBorder: '#60a5fa',
    dailyPoint: '#2563eb',
    dailyLight: '#dbeafe',
    dailyGrad: 'rgba(96, 165, 250, 0.35)',
  },
  comments: {
    id: 'comments',
    name: 'Lượt bình luận',
    unit: 'bình luận',
    cumKey: 'cumulativeComments',
    dailyKey: 'comments',
    cumBorder: '#a855f7',
    cumPoint: '#7e22ce',
    cumLight: '#e9d5ff',
    cumGrad: 'rgba(168, 85, 247, 0.35)',
    dailyBorder: '#c084fc',
    dailyPoint: '#9333ea',
    dailyLight: '#f3e8ff',
    dailyGrad: 'rgba(192, 132, 252, 0.35)',
  },
  shares: {
    id: 'shares',
    name: 'Lượt chia sẻ',
    unit: 'chia sẻ',
    cumKey: 'cumulativeShares',
    dailyKey: 'shares',
    cumBorder: '#10b981',
    cumPoint: '#047857',
    cumLight: '#a7f3d0',
    cumGrad: 'rgba(16, 185, 129, 0.35)',
    dailyBorder: '#2dd4bf',
    dailyPoint: '#0f766e',
    dailyLight: '#ccfbf1',
    dailyGrad: 'rgba(45, 212, 191, 0.35)',
  },
};

export const DailyCharts: React.FC<DailyChartsProps> = ({ videos }) => {
  const { theme } = useTheme();
  const [selectedMetric, setSelectedMetric] = useState<DailyMetricType>('count');
  const metricCfg = METRIC_CONFIG[selectedMetric];

  const stats = useMemo(() => getDailyStatsData(videos), [videos]);

  const cumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dailyCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const cumChartInstance = useRef<ChartJS | null>(null);
  const dailyChartInstance = useRef<ChartJS | null>(null);

  // Hiệu ứng khởi tạo & cập nhật biểu đồ tích lũy (Cumulative)
  useEffect(() => {
    if (!cumCanvasRef.current || stats.length === 0) {
      if (cumChartInstance.current) {
        cumChartInstance.current.destroy();
        cumChartInstance.current = null;
      }
      return;
    }

    const isDark = theme === 'dark';
    const gridColor = isDark ? 'rgba(51, 65, 85, 0.35)' : 'rgba(203, 213, 225, 0.7)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    const labels = stats.map((s) => formatDateVN(s.date));
    const cumPoints = stats.map((s) => (s[metricCfg.cumKey] as number) || 0);

    if (cumChartInstance.current) {
      cumChartInstance.current.destroy();
      cumChartInstance.current = null;
    }

    const ctx = cumCanvasRef.current.getContext('2d');
    if (!ctx) return;

    let gradCum: CanvasGradient | null = null;
    try {
      gradCum = ctx.createLinearGradient(0, 0, 0, 240);
      gradCum.addColorStop(0, metricCfg.cumGrad);
      gradCum.addColorStop(1, 'rgba(0, 0, 0, 0.01)');
    } catch {
      // Fallback
    }

    cumChartInstance.current = new ChartJS(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: `Tổng ${metricCfg.name.toLowerCase()} tích lũy`,
            data: cumPoints,
            borderColor: metricCfg.cumBorder,
            backgroundColor: gradCum || 'rgba(56, 189, 248, 0.12)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: metricCfg.cumPoint,
            pointBorderColor: metricCfg.cumLight,
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: metricCfg.cumBorder,
            pointHoverBorderColor: '#ffffff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark ? '#f1f5f9' : '#0f172a',
            bodyColor: metricCfg.cumPoint,
            borderColor: isDark ? 'rgba(51, 65, 85, 0.8)' : 'rgba(203, 213, 225, 0.8)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 10,
            displayColors: false,
            callbacks: {
              title: (items) => '📅 Ngày: ' + items[0]?.label,
              label: (item) => {
                const st = stats[item.dataIndex];
                if (st) {
                  const dayVal = (st[metricCfg.dailyKey] as number) || 0;
                  return `📈 Tổng tích lũy: ${formatNumber(item.raw as number)} ${metricCfg.unit} (+${formatNumber(dayVal)} trong ngày)`;
                }
                return `📈 Tổng tích lũy: ${formatNumber(item.raw as number)} ${metricCfg.unit}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 11 }, maxRotation: 45, minRotation: 0 },
          },
          y: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { size: 11 },
              callback: (val) => formatNumber(val as number),
            },
          },
        },
      },
    });

    return () => {
      if (cumChartInstance.current) {
        cumChartInstance.current.destroy();
        cumChartInstance.current = null;
      }
    };
  }, [stats, theme, selectedMetric, metricCfg]);

  // Hiệu ứng khởi tạo & cập nhật biểu đồ đăng theo ngày (Daily)
  useEffect(() => {
    if (!dailyCanvasRef.current || stats.length === 0) {
      if (dailyChartInstance.current) {
        dailyChartInstance.current.destroy();
        dailyChartInstance.current = null;
      }
      return;
    }

    const isDark = theme === 'dark';
    const gridColor = isDark ? 'rgba(51, 65, 85, 0.35)' : 'rgba(203, 213, 225, 0.7)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    const labels = stats.map((s) => formatDateVN(s.date));
    const dailyPoints = stats.map((s) => (s[metricCfg.dailyKey] as number) || 0);

    if (dailyChartInstance.current) {
      dailyChartInstance.current.destroy();
      dailyChartInstance.current = null;
    }

    const ctx = dailyCanvasRef.current.getContext('2d');
    if (!ctx) return;

    let gradDaily: CanvasGradient | null = null;
    try {
      gradDaily = ctx.createLinearGradient(0, 0, 0, 240);
      gradDaily.addColorStop(0, metricCfg.dailyGrad);
      gradDaily.addColorStop(1, 'rgba(0, 0, 0, 0.01)');
    } catch {
      // Fallback
    }

    dailyChartInstance.current = new ChartJS(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: `${metricCfg.name} trong ngày`,
            data: dailyPoints,
            borderColor: metricCfg.dailyBorder,
            backgroundColor: gradDaily || 'rgba(52, 211, 153, 0.12)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: metricCfg.dailyPoint,
            pointBorderColor: metricCfg.dailyLight,
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: metricCfg.dailyBorder,
            pointHoverBorderColor: '#ffffff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark ? '#f1f5f9' : '#0f172a',
            bodyColor: metricCfg.dailyPoint,
            borderColor: isDark ? 'rgba(51, 65, 85, 0.8)' : 'rgba(203, 213, 225, 0.8)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 10,
            displayColors: false,
            callbacks: {
              title: (items) => '📅 Ngày: ' + items[0]?.label,
              label: (item) => {
                const st = stats[item.dataIndex];
                if (st) {
                  const cumVal = (st[metricCfg.cumKey] as number) || 0;
                  return `🎬 Trong ngày: +${formatNumber(item.raw as number)} ${metricCfg.unit} (Lũy kế: ${formatNumber(cumVal)})`;
                }
                return `🎬 Trong ngày: +${formatNumber(item.raw as number)} ${metricCfg.unit}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 11 }, maxRotation: 45, minRotation: 0 },
          },
          y: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { size: 11 },
              callback: (val) => formatNumber(val as number),
            },
          },
        },
      },
    });

    return () => {
      if (dailyChartInstance.current) {
        dailyChartInstance.current.destroy();
        dailyChartInstance.current = null;
      }
    };
  }, [stats, theme, selectedMetric, metricCfg]);

  return (
    <div
      id="analytics-charts"
      className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-4 transition-colors scroll-mt-20"
    >
      {/* Header bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <LineChart className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            Thống Kê Biến Động Theo Mốc Thời Gian
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Biểu đồ đường theo dõi tăng trưởng tích lũy &amp; số liệu phát sinh theo từng ngày
          </p>
        </div>

        {/* Metric Switcher Tabs */}
        <div className="flex items-center flex-wrap gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
          <button
            type="button"
            onClick={() => setSelectedMetric('count')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              selectedMetric === 'count'
                ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Số bài viết</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedMetric('views')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              selectedMetric === 'views'
                ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Lượt xem</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedMetric('likes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              selectedMetric === 'likes'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
            <span>Lượt thích</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedMetric('comments')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              selectedMetric === 'comments'
                ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Bình luận</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedMetric('shares')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              selectedMetric === 'shares'
                ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Chia sẻ</span>
          </button>
        </div>
      </div>

      {/* 2 Line Charts side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* Chart 1: Cumulative */}
        <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between min-h-[310px]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-sky-500" /> Tổng {metricCfg.name.toLowerCase()} tích lũy
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 hidden sm:flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" /> Đường dồn tích lũy
              </span>
              <button
                type="button"
                onClick={() => downloadCanvasChart(cumCanvasRef.current, `bieu-do-tich-luy-${selectedMetric}`)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Tải ảnh biểu đồ PNG"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="relative w-full flex-1 min-h-[250px]">
            {stats.length > 0 ? (
              <canvas ref={cumCanvasRef} />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Chưa có dữ liệu ngày để hiển thị biểu đồ
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: Daily */}
        <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between min-h-[310px]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <LineChart className="w-4 h-4 text-emerald-500" /> {metricCfg.name} phát sinh mỗi ngày
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 hidden sm:flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> {stats.length} mốc ngày
              </span>
              <button
                type="button"
                onClick={() => downloadCanvasChart(dailyCanvasRef.current, `bieu-do-phat-sinh-${selectedMetric}`)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Tải ảnh biểu đồ PNG"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="relative w-full flex-1 min-h-[250px]">
            {stats.length > 0 ? (
              <canvas ref={dailyCanvasRef} />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Chưa có dữ liệu ngày để hiển thị biểu đồ
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
