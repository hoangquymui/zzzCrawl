import React from 'react';
import { Filter, Layers, FileText, Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import { PostCategory } from '../../hooks/usePostManagement';
import { ResizeHandle } from '../ResizeHandle';

export interface PostCategoryFilterProps {
  selectedCategory: PostCategory;
  onSelectCategory: (category: PostCategory) => void;
  categoryCounts: {
    post: number;
    photo: number;
    video: number;
    total: number;
  };
  activeProfileName?: string;
  selectedUserId: string;
  width?: number;
  onResize?: (e: React.MouseEvent) => void;
}

export const PostCategoryFilter: React.FC<PostCategoryFilterProps> = ({
  selectedCategory,
  onSelectCategory,
  categoryCounts,
  activeProfileName,
  selectedUserId,
  width,
  onResize,
}) => {
  return (
    <div
      style={{
        width: typeof window !== 'undefined' && window.innerWidth >= 1024 && width ? `${width}px` : undefined,
      }}
      className="w-full lg:shrink-0 relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 min-h-[580px] flex flex-col"
    >
      <div className="border-b border-slate-100 dark:border-slate-800/80 pb-3 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Filter className="w-4 h-4 text-indigo-500" />
          <span>Loại nội dung:</span>
        </h2>
        <p className="text-[11px] text-slate-400 mt-1 truncate">
          {selectedUserId === '__OTHER__'
            ? 'Bài viết khác'
            : activeProfileName || 'Chưa chọn'}
        </p>
      </div>

      {/* Các mục lựa chọn: Tất cả / Bài viết / Hình ảnh / Video */}
      <div className="space-y-2.5 flex-1">
        {/* 0. Tất cả nội dung */}
        <button
          type="button"
          onClick={() => onSelectCategory('all')}
          className={`w-full flex items-center justify-between p-3.5 rounded-xl font-bold text-xs transition-all cursor-pointer text-left ${
            selectedCategory === 'all'
              ? 'border-2 border-slate-900 dark:border-white bg-slate-100/80 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-900/10'
              : 'border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Layers
              className={`w-4 h-4 ${
                selectedCategory === 'all'
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-400'
              }`}
            />
            <span>Tất cả nội dung</span>
          </div>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-md font-mono ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}
          >
            {categoryCounts.total}
          </span>
        </button>

        {/* 1. Bài viết */}
        <button
          type="button"
          onClick={() => onSelectCategory('post')}
          className={`w-full flex items-center justify-between p-3.5 rounded-xl font-bold text-xs transition-all cursor-pointer text-left ${
            selectedCategory === 'post'
              ? 'border-2 border-slate-900 dark:border-white bg-slate-100/80 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-900/10'
              : 'border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <FileText
              className={`w-4 h-4 ${
                selectedCategory === 'post'
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-400'
              }`}
            />
            <span>Bài viết</span>
          </div>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-md font-mono ${
              selectedCategory === 'post'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}
          >
            {categoryCounts.post}
          </span>
        </button>

        {/* 2. Hình ảnh */}
        <button
          type="button"
          onClick={() => onSelectCategory('photo')}
          className={`w-full flex items-center justify-between p-3.5 rounded-xl font-bold text-xs transition-all cursor-pointer text-left ${
            selectedCategory === 'photo'
              ? 'border-2 border-slate-900 dark:border-white bg-slate-100/80 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-900/10'
              : 'border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <ImageIcon
              className={`w-4 h-4 ${
                selectedCategory === 'photo'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-400'
              }`}
            />
            <span>Hình ảnh</span>
          </div>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-md font-mono ${
              selectedCategory === 'photo'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}
          >
            {categoryCounts.photo}
          </span>
        </button>

        {/* 3. Video */}
        <button
          type="button"
          onClick={() => onSelectCategory('video')}
          className={`w-full flex items-center justify-between p-3.5 rounded-xl font-bold text-xs transition-all cursor-pointer text-left ${
            selectedCategory === 'video'
              ? 'border-2 border-slate-900 dark:border-white bg-slate-100/80 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-900/10'
              : 'border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <VideoIcon
              className={`w-4 h-4 ${
                selectedCategory === 'video'
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-400'
              }`}
            />
            <span>Video</span>
          </div>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-md font-mono ${
              selectedCategory === 'video'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}
          >
            {categoryCounts.video}
          </span>
        </button>
      </div>

      {/* Tóm tắt tổng số */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
        <span>Tổng số bài viết:</span>
        <span className="font-bold text-slate-700 dark:text-slate-300">
          {categoryCounts.total}
        </span>
      </div>

      {/* ResizeHandle cho Cột 2 (Desktop) */}
      {onResize && (
        <ResizeHandle
          onMouseDown={onResize}
          className="hidden lg:flex"
        />
      )}
    </div>
  );
};
