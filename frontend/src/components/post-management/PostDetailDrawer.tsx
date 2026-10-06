import React from 'react';
import {
  X,
  User,
  ThumbsUp,
  MessageSquare,
  Share2,
  Eye,
  Calendar,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { VideoItem } from '../../types/video';
import { categorizePost } from '../../hooks/usePostManagement';

export interface PostDetailDrawerProps {
  post: VideoItem | null;
  onClose: () => void;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}

export const PostDetailDrawer: React.FC<PostDetailDrawerProps> = ({
  post,
  onClose,
  copiedId,
  onCopy,
}) => {
  if (!post) return null;

  const cat = categorizePost(post);
  const categoryLabel =
    post.loai || (cat === 'video' ? 'Video' : cat === 'photo' ? 'Hình ảnh' : 'Bài viết');

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200 cursor-pointer"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 shadow-2xl h-full flex flex-col z-10 border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-250">
        {/* Header Drawer */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
              {post.id || `#${post.STT}`}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-bold border ${
                cat === 'video'
                  ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30'
                  : cat === 'photo'
                  ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30'
                  : 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30'
              }`}
            >
              {categoryLabel}
            </span>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
              Chi tiết nội dung
            </h3>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Đóng (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Tác giả & Kênh */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                  {post.nguoiDang || 'Chưa xác định tác giả'}
                </p>
                <p className="text-xs text-slate-400 font-mono truncate">
                  {post.authorUid
                    ? `UID: ${post.authorUid}`
                    : post.authorUrl || '—'}
                </p>
              </div>
            </div>

            {post.authorUrl && (
              <a
                href={post.authorUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-blue-600 transition shrink-0 flex items-center gap-1"
              >
                <span>Trang cá nhân</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* 4 Khối thống kê tương tác chính */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col items-center justify-center text-center">
              <ThumbsUp className="w-4 h-4 text-blue-500 mb-1" />
              <span className="font-bold text-base text-slate-900 dark:text-white font-mono">
                {Number(post.LuotLike || 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400">Lượt thích</span>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col items-center justify-center text-center">
              <MessageSquare className="w-4 h-4 text-indigo-500 mb-1" />
              <span className="font-bold text-base text-slate-900 dark:text-white font-mono">
                {Number(post.LuotComment || 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400">Bình luận</span>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col items-center justify-center text-center">
              <Share2 className="w-4 h-4 text-purple-500 mb-1" />
              <span className="font-bold text-base text-slate-900 dark:text-white font-mono">
                {Number(post.SoLuongNguoiShare || 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400">Chia sẻ</span>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col items-center justify-center text-center">
              <Eye className="w-4 h-4 text-amber-500 mb-1" />
              <span className="font-bold text-base text-slate-900 dark:text-white font-mono">
                {Number(post.LuotXem || 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400">Lượt xem</span>
            </div>
          </div>

          {/* Toàn bộ nội dung Caption */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Toàn bộ nội dung bài viết
              </label>
              <button
                type="button"
                onClick={() => onCopy(post.caption || '', 'drawer_caption')}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                {copiedId === 'drawer_caption' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Đã sao chép</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Sao chép toàn bộ</span>
                  </>
                )}
              </button>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-normal whitespace-pre-wrap select-text max-h-[300px] overflow-y-auto">
              {post.caption ? (
                post.caption
              ) : (
                <span className="text-slate-400 italic">Không có nội dung văn bản cho bài viết này.</span>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>{(post.caption || '').split(/\s+/).filter(Boolean).length} từ</span>
              <span>{(post.caption || '').length} ký tự</span>
            </div>
          </div>

          {/* Thông tin liên kết & Thời gian */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Thời gian đăng:</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {post.ngayDang || 'Chưa xác định'}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-1.5">
              <span className="text-xs text-slate-400">Đường dẫn bài viết:</span>
              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono">
                <span className="truncate text-blue-600 dark:text-blue-400 flex-1">
                  {post.link}
                </span>
                <button
                  type="button"
                  onClick={() => onCopy(post.link, 'drawer_link')}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0 cursor-pointer"
                  title="Sao chép link"
                >
                  {copiedId === 'drawer_link' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
              Phím tắt: J/K (tiếp/trước) • C (chép link) • Esc (đóng)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={post.link}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-sm"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Mở link gốc</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
