import React from 'react';
import { Film, Eye, ThumbsUp, MessageSquare } from 'lucide-react';
import { VideoItem } from '../types/video';
import { formatNumber } from '../utils/formatters';

interface StatsCardsProps {
  videos: VideoItem[];
}

export const StatsCards: React.FC<StatsCardsProps> = ({ videos }) => {
  const totalVideos = videos.length;
  const totalViews = videos.reduce((sum, v) => sum + (Number(v.LuotXem) || 0), 0);
  const totalLikes = videos.reduce((sum, v) => sum + (Number(v.LuotLike) || 0), 0);
  const totalComments = videos.reduce((sum, v) => sum + (Number(v.LuotComment) || 0), 0);

  const cards = [
    {
      title: 'Tổng Video',
      value: totalVideos,
      formatted: formatNumber(totalVideos),
      icon: <Film className="w-5 h-5 text-blue-500 dark:text-blue-400" />,
      textColor: 'text-slate-900 dark:text-white',
      borderColor: 'border-blue-500/20',
      bgGlow: 'from-blue-500/10 to-transparent',
    },
    {
      title: 'Tổng Lượt Xem',
      value: totalViews,
      formatted: formatNumber(totalViews),
      icon: <Eye className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />,
      textColor: 'text-emerald-600 dark:text-emerald-400',
      borderColor: 'border-emerald-500/20',
      bgGlow: 'from-emerald-500/10 to-transparent',
    },
    {
      title: 'Tổng Lượt Like',
      value: totalLikes,
      formatted: formatNumber(totalLikes),
      icon: <ThumbsUp className="w-5 h-5 text-pink-500 dark:text-pink-400" />,
      textColor: 'text-pink-600 dark:text-pink-400',
      borderColor: 'border-pink-500/20',
      bgGlow: 'from-pink-500/10 to-transparent',
    },
    {
      title: 'Tổng Bình Luận',
      value: totalComments,
      formatted: formatNumber(totalComments),
      icon: <MessageSquare className="w-5 h-5 text-amber-500 dark:text-amber-400" />,
      textColor: 'text-amber-600 dark:text-amber-400',
      borderColor: 'border-amber-500/20',
      bgGlow: 'from-amber-500/10 to-transparent',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className="relative overflow-hidden bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm transition hover:border-slate-300 dark:hover:border-slate-600"
        >
          <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl ${card.bgGlow} rounded-full blur-xl pointer-events-none`} />
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">{card.title}</span>
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800/80">{card.icon}</div>
          </div>
          <div className={`text-2xl md:text-3xl font-extrabold tracking-tight ${card.textColor}`}>
            {card.formatted}
          </div>
        </div>
      ))}
    </div>
  );
};
