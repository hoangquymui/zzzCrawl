import React from 'react';
import {
  FileText,
  Users,
  Download,
  RotateCcw,
  Plus,
} from 'lucide-react';
import { VideoItem } from '../types/video';
import { useAuth } from '../context/AuthContext';
import {
  usePostManagement,
  PostCategory,
  categorizePost,
  normalizeNameForMatching,
  getDistinctiveTokens,
  extractSlugForMatching,
  isPostMatchingProfile,
} from '../hooks/usePostManagement';
import {
  ProfileSidebar,
  PostCategoryFilter,
  PostFilterBar,
  PostListView,
  PostDetailDrawer,
  PostCreateModal,
  ProfileCreateModal,
} from '../components/post-management';

export interface PostManagementPageProps {
  videos: VideoItem[];
  onRefreshOne?: (idOrStt: string | number) => Promise<void> | Promise<boolean> | void;
  onDelete?: (idOrStt: string | number) => Promise<void> | Promise<boolean> | void;
}

// Re-export helpers and types for full backward compatibility
export {
  categorizePost,
  normalizeNameForMatching,
  getDistinctiveTokens,
  extractSlugForMatching,
  isPostMatchingProfile,
};
export type { PostCategory };

export const PostManagementPage: React.FC<PostManagementPageProps> = ({
  videos,
  onRefreshOne,
  onDelete,
}) => {
  const { isAdmin } = useAuth();

  const {
    profiles,
    isLoadingProfiles,
    fetchProfiles,
    selectedUserId,
    setSelectedUserId,
    selectedCategory,
    setSelectedCategory,
    userSearchTerm,
    setUserSearchTerm,
    postSearchTerm,
    setPostSearchTerm,
    copiedId,
    handleCopy,
    expandedCaptions,
    toggleCaption,
    viewMode,
    setViewMode,
    selectedDetailPost,
    setSelectedDetailPost,
    focusedPostIndex,
    setFocusedPostIndex,
    panelWidths,
    handlePanelResize,
    filteredProfiles,
    profilePostMap,
    otherPosts,
    categoryCounts,
    displayedPosts,
    activeProfile,
    handleExportCSV,
    isCreatePostModalOpen,
    setIsCreatePostModalOpen,
    isCreateProfileModalOpen,
    setIsCreateProfileModalOpen,
  } = usePostManagement({
    videos,
    onRefreshOne,
    onDelete,
  });

  return (
    <div className="space-y-5">
      {/* 1. Header trên cùng: Tiêu đề Quản lý bài viết */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Bài viết
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30">
                  Posts Manager
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Phân loại bài viết theo từng Profile quản lý và các bài viết ngoại lai
              </p>
            </div>
          </div>
        </div>

        {/* Thanh công cụ và thống kê tóm tắt */}
        <div className="flex items-center flex-wrap gap-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/60">
            <Users className="w-3.5 h-3.5 text-blue-500" />
            <span>{profiles.length} profile</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <FileText className="w-3.5 h-3.5 text-indigo-500" />
            <span>{videos.length} bài viết</span>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setIsCreatePostModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Thêm bài viết mới"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm bài viết</span>
            </button>
          )}

          <button
            type="button"
            onClick={fetchProfiles}
            disabled={isLoadingProfiles}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition shadow-xs cursor-pointer disabled:opacity-50"
            title="Làm mới danh sách profile"
          >
            <RotateCcw className={`w-4 h-4 ${isLoadingProfiles ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={displayedPosts.length === 0}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition flex items-center gap-1.5 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Xuất file CSV danh sách bài viết đang hiển thị"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Khung 3 cột với Resizable Panels */}
      <div className="flex flex-col lg:flex-row gap-4 items-start relative w-full">
        {/* CỘT 1: Danh sách profile người dùng & Bài viết khác */}
        <ProfileSidebar
          profiles={filteredProfiles}
          selectedUserId={selectedUserId}
          onSelectUser={setSelectedUserId}
          userSearchTerm={userSearchTerm}
          onUserSearchChange={setUserSearchTerm}
          profilePostMap={profilePostMap}
          otherPostsCount={otherPosts.length}
          width={panelWidths.col1}
          onResize={(e) => handlePanelResize('col1', e)}
        />

        {/* CỘT 2: Phân loại loại nội dung */}
        <PostCategoryFilter
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          categoryCounts={categoryCounts}
          activeProfileName={activeProfile?.name}
          selectedUserId={selectedUserId}
          width={panelWidths.col2}
          onResize={(e) => handlePanelResize('col2', e)}
        />

        {/* CỘT 3: Thông tin chi tiết các bài viết */}
        <div className="flex-1 w-full min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col min-h-[580px] max-h-[780px] overflow-hidden">
          {/* Header Cột 3 (Bộ lọc & công cụ hiển thị) */}
          <PostFilterBar
            selectedUserId={selectedUserId}
            activeProfileName={activeProfile?.name}
            selectedCategory={selectedCategory}
            displayedCount={displayedPosts.length}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            postSearchTerm={postSearchTerm}
            onPostSearchChange={setPostSearchTerm}
          />

          {/* Danh sách bài viết theo 3 view modes (compact, grid, cards) */}
          <PostListView
            posts={displayedPosts}
            viewMode={viewMode}
            selectedUserId={selectedUserId}
            activeProfileName={activeProfile?.name}
            selectedCategory={selectedCategory}
            focusedPostIndex={focusedPostIndex}
            selectedDetailPost={selectedDetailPost}
            copiedId={copiedId}
            expandedCaptions={expandedCaptions}
            isAdmin={isAdmin}
            onSelectPost={(post, idx) => {
              setFocusedPostIndex(idx);
              setSelectedDetailPost(post);
            }}
            onCopy={handleCopy}
            onToggleCaption={toggleCaption}
            onRefreshOne={onRefreshOne}
            onDelete={onDelete}
          />
        </div>
      </div>

      {/* 3. Slide-over Detail Drawer / Inspector */}
      <PostDetailDrawer
        post={selectedDetailPost}
        onClose={() => setSelectedDetailPost(null)}
        copiedId={copiedId}
        onCopy={handleCopy}
      />

      {/* 4. Modals */}
      <PostCreateModal
        isOpen={isCreatePostModalOpen}
        onClose={() => setIsCreatePostModalOpen(false)}
      />

      <ProfileCreateModal
        isOpen={isCreateProfileModalOpen}
        onClose={() => setIsCreateProfileModalOpen(false)}
      />
    </div>
  );
};

export default PostManagementPage;
