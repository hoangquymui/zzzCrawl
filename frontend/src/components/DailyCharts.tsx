import React, { useMemo, useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  registerables,
} from 'chart.js';
import { TrendingUp, LineChart, Calendar, Info } from 'lucide-react';
import { VideoItem } from '../types/video';
import { getDailyStatsData, formatDateVN } from '../utils/formatters';
import { useTheme } from '../context/ThemeContext';

// Đăng ký toàn bộ controller và plugin cần thiết của Chart.js
ChartJS.register(...registerables);

interface DailyChartsProps {
  videos: VideoItem[];
}

export const DailyCharts: React.FC<DailyChartsProps> = ({ videos }) => {
  const { theme } = useTheme();
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
    const cumPoints = stats.map((s) => s.cumulative);

    if (cumChartInstance.current) {
      cumChartInstance.current.data.labels = labels;
      cumChartInstance.current.data.datasets[0].data = cumPoints;
      if (cumChartInstance.current.options.scales) {
        if (cumChartInstance.current.options.scales.x?.grid) {
          cumChartInstance.current.options.scales.x.grid.color = gridColor;
        }
        if (cumChartInstance.current.options.scales.x?.ticks) {
          cumChartInstance.current.options.scales.x.ticks.color = textColor;
        }
        if (cumChartInstance.current.options.scales.y?.grid) {
          cumChartInstance.current.options.scales.y.grid.color = gridColor;
        }
        if (cumChartInstance.current.options.scales.y?.ticks) {
          cumChartInstance.current.options.scales.y.ticks.color = textColor;
        }
      }
      cumChartInstance.current.update();
      return;
    }

    const ctx = cumCanvasRef.current.getContext('2d');
    if (!ctx) return;

    let gradCum: CanvasGradient | null = null;
    try {
      gradCum = ctx.createLinearGradient(0, 0, 0, 240);
      gradCum.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
      gradCum.addColorStop(1, 'rgba(56, 189, 248, 0.01)');
    } catch {
      // Fallback
    }

    cumChartInstance.current = new ChartJS(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Tổng số video tích lũy',
            data: cumPoints,
            borderColor: '#38bdf8',
            backgroundColor: gradCum || 'rgba(56, 189, 248, 0.12)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#0284c7',
            pointBorderColor: '#bae6fd',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#38bdf8',
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
            bodyColor: '#0284c7',
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
                  return `📈 Tổng tích lũy: ${st.cumulative} video (+${st.count} trong ngày)`;
                }
                return `📈 Tổng tích lũy: ${item.raw} video`;
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
            ticks: { color: textColor, font: { size: 11 }, precision: 0, stepSize: 1 },
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
  }, [stats, theme]);

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
    const dailyPoints = stats.map((s) => s.count);

    if (dailyChartInstance.current) {
      dailyChartInstance.current.data.labels = labels;
      dailyChartInstance.current.data.datasets[0].data = dailyPoints;
      if (dailyChartInstance.current.options.scales) {
        if (dailyChartInstance.current.options.scales.x?.grid) {
          dailyChartInstance.current.options.scales.x.grid.color = gridColor;
        }
        if (dailyChartInstance.current.options.scales.x?.ticks) {
          dailyChartInstance.current.options.scales.x.ticks.color = textColor;
        }
        if (dailyChartInstance.current.options.scales.y?.grid) {
          dailyChartInstance.current.options.scales.y.grid.color = gridColor;
        }
        if (dailyChartInstance.current.options.scales.y?.ticks) {
          dailyChartInstance.current.options.scales.y.ticks.color = textColor;
        }
      }
      dailyChartInstance.current.update();
      return;
    }

    const ctx = dailyCanvasRef.current.getContext('2d');
    if (!ctx) return;

    let gradDaily: CanvasGradient | null = null;
    try {
      gradDaily = ctx.createLinearGradient(0, 0, 0, 240);
      gradDaily.addColorStop(0, 'rgba(52, 211, 153, 0.35)');
      gradDaily.addColorStop(1, 'rgba(52, 211, 153, 0.01)');
    } catch {
      // Fallback
    }

    dailyChartInstance.current = new ChartJS(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Số video trong ngày',
            data: dailyPoints,
            borderColor: '#34d399',
            backgroundColor: gradDaily || 'rgba(52, 211, 153, 0.12)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#059669',
            pointBorderColor: '#a7f3d0',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#34d399',
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
            bodyColor: '#059669',
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
                  return `🎬 Đăng trong ngày: +${st.count} video (Tổng lũy kế: ${st.cumulative})`;
                }
                return `🎬 Đăng trong ngày: +${item.raw} video`;
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
            ticks: { color: textColor, font: { size: 11 }, precision: 0, stepSize: 1 },
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
  }, [stats, theme]);

  return (
    <div id="analytics-charts" className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-4 transition-colors scroll-mt-20">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <LineChart className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            Thống Kê Video Ngày Qua Ngày
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Biểu đồ đường theo dõi tổng tích lũy &amp; số lượng video đăng theo từng mốc ngày
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 font-mono text-xs font-semibold border border-blue-500/20 dark:border-blue-500/30 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {stats.length} mốc ngày
          </span>
        </div>
      </div>

      {/* 2 Line Charts side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* Chart 1: Cumulative */}
        <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 flex flex-col justify-between min-h-[310px]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" /> Tổng Video Tích Lũy Qua Từng Ngày
            </span>
            <span className="text-[11px] text-slate-400 hidden sm:flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" /> Đường tăng trưởng dồn
            </span>
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
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <LineChart className="w-4 h-4" /> Số Video Đăng Ngày Qua Ngày
            </span>
            <span className="text-[11px] text-slate-400 hidden sm:flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> Số video mỗi ngày
            </span>
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
