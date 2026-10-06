import React from 'react';
import { Search, LayoutList, Table, LayoutGrid } from 'lucide-react';
import { PostCategory, PostViewMode } from '../../hooks/usePostManagement';

export interface PostFilterBarProps {
  selectedUserId: string;
  activeProfileName?: string;
  selectedCategory: PostCategory;
  displayedCount: number;
  viewMode: PostViewMode;
  onViewModeChange: (mode: PostViewMode) => void;
  postSearchTerm: string;
  onPostSearchChange: (value: string) => void;
}

export const PostFilterBar: React.FC<PostFilterBarProps> = ({
  selectedUserId,
  activeProfileName,
  selectedCategory,
  displayedCount,
  viewMode,
  onViewModeChange,
  postSearchTerm,
  onPostSearchChange,
}) => {
  return (
    <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <span>Thông tin các bài viết: link, caption, ...</span>
        </h2>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {selectedUserId === '__OTHER__'
            ? 'Bài viết khác'
            : activeProfileName || 'Tất cả'}{' '}
          •{' '}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {selectedCategory === 'all'
              ? 'Tất cả'
              : selectedCategory === 'video'
              ? 'Video'
              : selectedCategory === 'photo'
              ? 'Hình ảnh'
              : 'Bài viết'}
          </span>{' '}
          ({displayedCount} kết quả)
        </p>
      </div>

      {/* View Mode Switcher + Ô tìm kiếm */}
      <div className="flex items-center flex-wrap gap-2">
        {/* Nút chuyển chế độ xem */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
          <button
            type="button"
            onClick={() => onViewModeChange('cards')}
            className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
            title="Chế độ Thẻ chi tiết"
          >
            <LayoutList className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Thẻ</span>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('compact')}
            className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
              viewMode === 'compact'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
            title="Chế độ Bảng tinh gọn (dày đặc thông tin)"
          >
            <Table className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Bảng</span>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('grid')}
            className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
            title="Chế độ Lưới 2 cột"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lưới</span>
          </button>
        </div>

        {/* Ô tìm kiếm bài viết */}
        <div className="relative w-full sm:w-48">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={postSearchTerm}
            onChange={(e) => onPostSearchChange(e.target.value)}
            placeholder="Tìm link, caption..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none focus:border-blue-500 transition"
          />
        </div>

        {/* Hint phím tắt */}
        <span
          className="hidden 2xl:inline-flex items-center text-[10px] text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700"
          title="Phím tắt: J/K để chọn bài, Enter để mở chi tiết, C để chép link, R để làm mới"
        >
          J / K : duyệt
        </span>
      </div>
    </div>
  );
};
