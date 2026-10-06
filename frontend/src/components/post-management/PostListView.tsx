import React from 'react';
import {
  AlertCircle,
  ThumbsUp,
  MessageSquare,
  Share2,
  ChevronRight,
  Check,
  Copy,
  ExternalLink,
  Calendar,
  RotateCcw,
  Trash2,
  Eye,
} from 'lucide-react';
import { VideoItem } from '../../types/video';
import { PostCategory, PostViewMode, categorizePost } from '../../hooks/usePostManagement';

export interface PostListViewProps {
  posts: VideoItem[];
  viewMode: PostViewMode;
  selectedUserId: string;
  activeProfileName?: string;
  selectedCategory: PostCategory;
  focusedPostIndex: number;
  selectedDetailPost: VideoItem | null;
  copiedId: string | null;
  expandedCaptions: Record<string | number, boolean>;
  isAdmin?: boolean;
  onSelectPost: (post: VideoItem, index: number) => void;
  onCopy: (text: string, id: string) => void;
  onToggleCaption: (idOrStt: string | number) => void;
  onRefreshOne?: (idOrStt: string | number) => Promise<void> | Promise<boolean> | void;
  onDelete?: (idOrStt: string | number) => Promise<void> | Promise<boolean> | void;
}

export const PostListView: React.FC<PostListViewProps> = ({
  posts,
  viewMode,
  selectedUserId,
  activeProfileName,
  selectedCategory,
  focusedPostIndex,
  selectedDetailPost,
  copiedId,
  expandedCaptions,
  isAdmin,
  onSelectPost,
  onCopy,
  onToggleCaption,
  onRefreshOne,
  onDelete,
}) => {
  if (posts.length === 0) {
    return (
      <div className="flex-1 py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2 p-4">
        <AlertCircle className="w-8 h-8 text-slate-300 dark:text-slate-600" />
        <p className="font-medium text-xs">Không có bài viết nào thuộc mục này.</p>
        <p className="text-[11px] text-slate-400 max-w-sm">
          {selectedUserId === '__OTHER__'
            ? 'Không có bài viết ngoại lai nào thuộc phân loại này trong hệ thống.'
            : `Người dùng "${activeProfileName || 'này'}" hiện chưa có ${
                selectedCategory === 'video'
                  ? 'Video'
                  : selectedCategory === 'photo'
                  ? 'Hình ảnh'
                  : 'Bài viết'
              } nào.`}
        </p>
      </div>
    );
  }

  if (viewMode === 'compact') {
    return (
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 dark:bg-slate-950/70 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 backdrop-blur-xs">
            <tr>
              <th className="py-2.5 px-3">#</th>
              <th className="py-2.5 px-3">Loại</th>
              <th className="py-2.5 px-3">Người đăng</th>
              <th className="py-2.5 px-3 min-w-[220px]">Nội dung</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Tương tác</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Ngày đăng</th>
              <th className="py-2.5 px-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {posts.map((post, idx) => {
              const rowId = post.id || (post.STT !== undefined ? post.STT : String(post.link));
              const isFocused = focusedPostIndex === idx;
              const isSelectedDrawer =
                selectedDetailPost &&
                (selectedDetailPost.id || selectedDetailPost.STT) === (post.id || post.STT);
              const cat = categorizePost(post);

              return (
                <tr
                  key={rowId}
                  onClick={() => onSelectPost(post, idx)}
                  className={`hover:bg-blue-50/40 dark:hover:bg-blue-950/20 cursor-pointer transition ${
                    isSelectedDrawer || isFocused
                      ? 'bg-blue-50/80 dark:bg-blue-950/50 font-medium'
                      : ''
                  }`}
                >
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {post.id || `#${post.STT}`}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        cat === 'video'
                          ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30'
                          : cat === 'photo'
                          ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30'
                          : 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30'
                      }`}
                    >
                      {post.loai || (cat === 'video' ? 'Video' : cat === 'photo' ? 'Hình ảnh' : 'Bài viết')}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 max-w-[130px] truncate text-slate-800 dark:text-slate-200 font-medium">
                    {post.nguoiDang || '—'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 max-w-sm">
                    <div className="line-clamp-2" title={post.caption}>
                      {post.caption || <span className="italic text-slate-400">(Không có văn bản)</span>}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1" title="Lượt thích">
                        <ThumbsUp className="w-3 h-3 text-blue-500" />
                        <span>{post.LuotLike || 0}</span>
                      </span>
                      <span className="flex items-center gap-1" title="Bình luận">
                        <MessageSquare className="w-3 h-3 text-indigo-500" />
                        <span>{post.LuotComment || 0}</span>
                      </span>
                      <span className="flex items-center gap-1" title="Chia sẻ">
                        <Share2 className="w-3 h-3 text-purple-500" />
                        <span>{post.SoLuongNguoiShare || 0}</span>
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                    {post.ngayDang || '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onSelectPost(post, idx)}
                        className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 transition"
                        title="Xem chi tiết (Slide-over Drawer)"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onCopy(post.link, `link_${rowId}`)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Sao chép link"
                      >
                        {copiedId === `link_${rowId}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <a
                        href={post.link}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Mở link gốc"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {posts.map((post, idx) => {
          const rowId = post.id || (post.STT !== undefined ? post.STT : String(post.link));
          const isFocused = focusedPostIndex === idx;
          const isSelectedDrawer =
            selectedDetailPost &&
            (selectedDetailPost.id || selectedDetailPost.STT) === (post.id || post.STT);
          const cat = categorizePost(post);

          return (
            <div
              key={rowId}
              onClick={() => onSelectPost(post, idx)}
              className={`p-3.5 rounded-xl border bg-slate-50/40 dark:bg-slate-950/30 hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer transition flex flex-col justify-between gap-3 ${
                isSelectedDrawer || isFocused
                  ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/30 dark:bg-blue-950/20 shadow-xs'
                  : 'border-slate-200/80 dark:border-slate-800/80'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {post.id || `#${post.STT}`}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                      cat === 'video'
                        ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30'
                        : cat === 'photo'
                        ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30'
                        : 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30'
                    }`}
                  >
                    {post.loai || (cat === 'video' ? 'Video' : cat === 'photo' ? 'Hình ảnh' : 'Bài viết')}
                  </span>
                  {post.nguoiDang && (
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs truncate max-w-[110px]">
                      {post.nguoiDang}
                    </span>
                  )}
                </div>
                {post.ngayDang && (
                  <span className="text-[10px] text-slate-400 shrink-0">{post.ngayDang}</span>
                )}
              </div>

              <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-3 leading-relaxed">
                {post.caption || <span className="italic text-slate-400">(Không có nội dung văn bản)</span>}
              </p>

              <div
                className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-0.5" title="Like">
                    <ThumbsUp className="w-3 h-3 text-blue-500" />
                    <span>{post.LuotLike || 0}</span>
                  </span>
                  <span className="flex items-center gap-0.5" title="Comment">
                    <MessageSquare className="w-3 h-3 text-indigo-500" />
                    <span>{post.LuotComment || 0}</span>
                  </span>
                  <span className="flex items-center gap-0.5" title="Share">
                    <Share2 className="w-3 h-3 text-purple-500" />
                    <span>{post.SoLuongNguoiShare || 0}</span>
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSelectPost(post, idx)}
                    className="p-1 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                    title="Mở xem chi tiết"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopy(post.link, `link_${rowId}`)}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    title="Sao chép link"
                  >
                    {copiedId === `link_${rowId}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <a
                    href={post.link}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    title="Mở link gốc"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Chế độ xem Thẻ chi tiết (Cards View)
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {posts.map((post, idx) => {
        const rowId = post.id || (post.STT !== undefined ? post.STT : String(post.link));
        const isExpanded = Boolean(expandedCaptions[rowId]);
        const snippetLength = 140;
        const isLongCaption = (post.caption || '').length > snippetLength;
        const isFocused = focusedPostIndex === idx;
        const isSelectedDrawer =
          selectedDetailPost &&
          (selectedDetailPost.id || selectedDetailPost.STT) === (post.id || post.STT);
        const cat = categorizePost(post);

        return (
          <div
            key={rowId}
            className={`p-4 rounded-xl border bg-slate-50/40 dark:bg-slate-950/30 hover:border-slate-300 dark:hover:border-slate-700 transition space-y-3 ${
              isSelectedDrawer || isFocused
                ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-950/20 shadow-xs'
                : 'border-slate-200/80 dark:border-slate-800/80'
            }`}
          >
            {/* Hàng 1: ID/STT, Loại & Ngày đăng, Người đăng */}
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {post.id || `#${post.STT}`}
                </span>

                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                    cat === 'video'
                      ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30'
                      : cat === 'photo'
                      ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30'
                      : 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30'
                  }`}
                >
                  {post.loai || (cat === 'video' ? 'Video' : cat === 'photo' ? 'Hình ảnh' : 'Bài viết')}
                </span>

                {post.nguoiDang && (
                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs truncate max-w-[160px]">
                    {post.nguoiDang}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {post.ngayDang && (
                  <div className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{post.ngayDang}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onSelectPost(post, idx)}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <span>Chi tiết</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Hàng 2: Caption nội dung */}
            <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/60">
              <p className="whitespace-pre-wrap break-words">
                {isExpanded || !isLongCaption
                  ? post.caption || '(Không có nội dung văn bản)'
                  : `${(post.caption || '').slice(0, snippetLength)}...`}
              </p>
              {isLongCaption && (
                <button
                  type="button"
                  onClick={() => onToggleCaption(rowId)}
                  className="mt-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {isExpanded ? 'Thu gọn' : 'Xem thêm'}
                </button>
              )}
            </div>

            {/* Hàng 3: Link bài viết + Nút sao chép */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <a
                  href={post.link}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium truncate max-w-[280px] sm:max-w-[340px]"
                  title={`Mở link bài viết: ${post.link}`}
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{post.link}</span>
                </a>

                <button
                  type="button"
                  onClick={() => onCopy(post.link, `link_${rowId}`)}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition shrink-0 cursor-pointer"
                  title="Sao chép link bài viết"
                >
                  {copiedId === `link_${rowId}` ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              {/* Nút hành động (Làm mới / Xóa nếu là Admin) */}
              {isAdmin && (
                <div className="flex items-center gap-1 shrink-0">
                  {onRefreshOne && (
                    <button
                      type="button"
                      onClick={() => onRefreshOne(rowId)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
                      title="Cập nhật lại tương tác bài viết này"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(rowId)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                      title="Xóa bài viết này khỏi danh sách theo dõi"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Hàng 4: Thống kê tương tác */}
            <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/60">
              <span className="flex items-center gap-1" title="Lượt thích">
                <ThumbsUp className="w-3 h-3 text-blue-500" />
                <span>{post.LuotLike || 0}</span>
              </span>

              <span className="flex items-center gap-1" title="Bình luận">
                <MessageSquare className="w-3 h-3 text-indigo-500" />
                <span>{post.LuotComment || 0}</span>
              </span>

              <span className="flex items-center gap-1" title="Lượt chia sẻ">
                <Share2 className="w-3 h-3 text-purple-500" />
                <span>{post.SoLuongNguoiShare || 0}</span>
              </span>

              {post.LuotXem > 0 && (
                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold" title="Lượt xem">
                  <Eye className="w-3 h-3" />
                  <span>{post.LuotXem}</span>
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
