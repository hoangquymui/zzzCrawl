import React, { useState } from 'react';
import {
  ExternalLink,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Calendar,
  User,
  Copy,
  Check,
} from 'lucide-react';
import { VideoItem } from '../types/video';
import { formatNumber } from '../utils/formatters';
import { FacebookIcon, TikTokIcon } from './Icons';

interface QuickPreviewCardProps {
  video: VideoItem;
  position: { top: number; left: number };
  onClose?: () => void;
}

export const QuickPreviewCard: React.FC<QuickPreviewCardProps> = ({
  video,
  position,
}) => {
  const [copied, setCopied] = useState(false);

  const isFB = (video.loai || '').toLowerCase().includes('facebook');

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(video.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Tính tỷ lệ tương tác Engagement Rate (ER)
  const totalEngagements =
    (video.LuotLike || 0) + (video.LuotComment || 0) + (video.SoLuongNguoiShare || 0);
  const erRate =
    video.LuotXem > 0
      ? ((totalEngagements / video.LuotXem) * 100).toFixed(2)
      : null;

  return (
    <div
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 9999,
      }}
      className="w-84 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 pointer-events-auto select-text"
    >
      {/* Top Banner / Platform Header */}
      <div className="px-4 py-2.5 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/60 dark:to-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isFB ? (
            <FacebookIcon className="w-4 h-4 text-blue-600 shrink-0" />
          ) : (
            <TikTokIcon className="w-4 h-4 text-pink-600 shrink-0" />
          )}
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            {video.loai || (isFB ? 'Facebook Video' : 'TikTok Video')}
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-700/60 px-1.5 py-0.5 rounded font-mono font-medium">
            STT #{video.STT}
          </span>
        </div>


      </div>

      {/* Body Content */}
      <div className="p-4 space-y-3.5">
        {/* Người đăng & Tác giả gốc nếu có */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-300">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {video.nguoiDang || 'Không rõ tác giả'}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                <Calendar className="w-3 h-3 shrink-0" />
                <span>{video.ngayDang || 'Chưa rõ ngày đăng'}</span>
              </div>
            </div>
          </div>

          {erRate !== null && (
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
                Tỷ lệ ER
              </div>
              <div className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                {erRate}%
              </div>
            </div>
          )}
        </div>

        {/* Caption */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            Nội dung Caption
          </div>
          <div
            className={`text-xs p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 max-h-28 overflow-y-auto leading-relaxed break-words whitespace-pre-wrap ${
              video.caption && video.caption.trim() && video.caption !== 'Không có tiêu đề'
                ? 'text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/60'
                : 'italic text-slate-400 dark:text-slate-500 bg-slate-50/60 dark:bg-slate-950/40'
            }`}
          >
            {video.caption && video.caption.trim() ? video.caption : 'Không có tiêu đề'}
          </div>
        </div>

        {/* 4 Thẻ Chỉ Số Nhanh */}
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {/* Lượt Xem */}
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/70 dark:border-emerald-500/20">
            <div className="flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-0.5">
              <Eye className="w-3.5 h-3.5" />
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Views</div>
            <div className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">
              {formatNumber(video.LuotXem)}
            </div>
          </div>

          {/* Lượt Like */}
          <div className="p-2 rounded-xl bg-pink-50 dark:bg-pink-500/10 border border-pink-200/70 dark:border-pink-500/20">
            <div className="flex items-center justify-center text-pink-600 dark:text-pink-400 mb-0.5">
              <Heart className="w-3.5 h-3.5" />
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Likes</div>
            <div className="text-xs font-mono font-bold text-pink-700 dark:text-pink-400">
              {formatNumber(video.LuotLike)}
            </div>
          </div>

          {/* Bình Luận */}
          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200/70 dark:border-amber-500/20">
            <div className="flex items-center justify-center text-amber-600 dark:text-amber-400 mb-0.5">
              <MessageCircle className="w-3.5 h-3.5" />
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Cmts</div>
            <div className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400">
              {formatNumber(video.LuotComment)}
            </div>
          </div>

          {/* Lượt Share */}
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200/70 dark:border-blue-500/20">
            <div className="flex items-center justify-center text-blue-600 dark:text-blue-400 mb-0.5">
              <Share2 className="w-3.5 h-3.5" />
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Shares</div>
            <div className="text-xs font-mono font-bold text-blue-700 dark:text-blue-400">
              {formatNumber(video.SoLuongNguoiShare)}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/70 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={handleCopyLink}
          className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                Đã sao chép!
              </span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Sao chép link</span>
            </>
          )}
        </button>

        <a
          href={video.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition"
        >
          <span>Mở liên kết</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
};
