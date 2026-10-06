import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginModal } from './components/LoginModal';
import { CommandPalette } from './components/CommandPalette';
import { useVideoTracker } from './hooks/useVideoTracker';
import { profileManagementApi } from './services/profile-management.service';
import { UserProfileItem } from './types/profile-management';
import { socket } from './services/socket';

// Pages cho từng route
import { DashboardPage } from './pages/DashboardPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { DataLibraryPage } from './pages/DataLibraryPage';
import { UsersPage } from './pages/UsersPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { HelpPage } from './pages/HelpPage';
import { VideoProfilePage } from './pages/VideoProfilePage';
import { ProfileManagementPage } from './pages/ProfileManagementPage';
import { CookiePage } from './pages/CookiePage';
import { PostManagementPage } from './pages/PostManagementPage';
import { VocabularyPage } from './pages/VocabularyPage';
import { AuditLogPage } from './pages/AuditLogPage';

export const App: React.FC = () => {
  const {
    videos,
    isConnected,
    crawlStatus,
    batchProgress,
    updatedRowStt,
    toast,
    dismissToast,
    handleAddVideo,
    handleRefreshOne,
    handleRefreshAll,
    handleDelete,
    handleBulkDelete,
  } = useVideoTracker();

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [profiles, setProfiles] = useState<UserProfileItem[]>([]);

  // Tải danh sách profiles cho Command Palette
  useEffect(() => {
    profileManagementApi.getState().then((s) => setProfiles(s.profiles || [])).catch(() => {});

    const refreshProfiles = () => {
      profileManagementApi.getState().then((s) => setProfiles(s.profiles || [])).catch(() => {});
    };

    socket.on('profile_mgmt_item', refreshProfiles);
    socket.on('profile_mgmt_status', refreshProfiles);

    return () => {
      socket.off('profile_mgmt_item', refreshProfiles);
      socket.off('profile_mgmt_status', refreshProfiles);
    };
  }, []);

  // Lắng nghe phím tắt toàn cục Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex font-sans selection:bg-blue-600 selection:text-white transition-colors duration-200">
      {/* Modal tìm kiếm toàn cục Command Palette (Ctrl + K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        videos={videos}
        profiles={profiles}
      />

      {/* Left Sidebar (Mẫu giao diện Acme Inc. / shadcn dashboard giữ nguyên tông màu chủ đạo) */}
      <Sidebar
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Right Column: Header + Main Content (Routes) + Footer */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <Header
          isConnected={isConnected}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        />

        {/* Main Routed Page Content */}
        <main id="dashboard-top" className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6">
          <Routes>
            {/* 1. Dashboard (Trang chủ tổng quan - cho phép khách chưa đăng nhập truy cập) */}
            <Route
              path="/"
              element={
                <ProtectedRoute allowGuest={true}>
                  <DashboardPage
                    videos={videos}
                    batchProgress={batchProgress}
                    updatedRowStt={updatedRowStt}
                    crawlStatus={crawlStatus}
                    onAddVideo={handleAddVideo}
                    onRefreshOne={handleRefreshOne}
                    onRefreshAll={handleRefreshAll}
                    onDelete={handleDelete}
                    onBulkDelete={handleBulkDelete}
                  />
                </ProtectedRoute>
              }
            />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />

            {/* 2. Analytics (Thống kê & Biểu đồ - Yêu cầu đăng nhập) */}
            <Route
              path="/analytics"
              element={
                <ProtectedRoute>
                  <AnalyticsPage videos={videos} />
                </ProtectedRoute>
              }
            />

            {/* 2b. Cookie (Quản lý Cookie hệ thống - CHỈ DÀNH CHO ADMIN) */}
            <Route
              path="/cookie"
              element={
                <ProtectedRoute requiredRole="admin">
                  <CookiePage />
                </ProtectedRoute>
              }
            />

            {/* 3. Link (Bảng dữ liệu video đầy đủ - Yêu cầu đăng nhập) */}
            <Route
              path="/link"
              element={
                <ProtectedRoute>
                  <DataLibraryPage
                    videos={videos}
                    batchProgress={batchProgress}
                    updatedRowStt={updatedRowStt}
                    crawlStatus={crawlStatus}
                    onAddVideo={handleAddVideo}
                    onRefreshOne={handleRefreshOne}
                    onRefreshAll={handleRefreshAll}
                    onDelete={handleDelete}
                    onBulkDelete={handleBulkDelete}
                  />
                </ProtectedRoute>
              }
            />
            <Route path="/data-library" element={<Navigate to="/link" replace />} />
            <Route path="/video-link" element={<Navigate to="/link" replace />} />

            {/* 4. Video Profile (Quét video & tag - CHỈ DÀNH CHO ADMIN) */}
            <Route
              path="/video-profile"
              element={
                <ProtectedRoute requiredRole="admin">
                  <VideoProfilePage onAddVideo={handleAddVideo} videos={videos} />
                </ProtectedRoute>
              }
            />

            {/* 4b. Quản lý Profile (Cào thông tin cơ bản - Yêu cầu đăng nhập) */}
            <Route
              path="/profile-management"
              element={
                <ProtectedRoute>
                  <ProfileManagementPage />
                </ProtectedRoute>
              }
            />
            <Route path="/profile" element={<Navigate to="/profile-management" replace />} />
            <Route path="/quan-ly-profile" element={<Navigate to="/profile-management" replace />} />

            {/* 4c. Quản lý bài viết (3 cột: Profile + Phân loại + Thông tin bài viết - Yêu cầu đăng nhập) */}
            <Route
              path="/post-management"
              element={
                <ProtectedRoute>
                  <PostManagementPage
                    videos={videos}
                    onRefreshOne={handleRefreshOne}
                    onDelete={handleDelete}
                  />
                </ProtectedRoute>
              }
            />
            <Route path="/quan-ly-bai-viet" element={<Navigate to="/post-management" replace />} />
            <Route path="/posts" element={<Navigate to="/post-management" replace />} />

            {/* Redirect /lifecycle to / */}
            <Route path="/lifecycle" element={<Navigate to="/" replace />} />


            {/* 7. Users (Quản lý người dùng & phân quyền - Yêu cầu quyền Admin) */}
            <Route
              path="/users"
              element={
                <ProtectedRoute requiredRole="admin">
                  <UsersPage />
                </ProtectedRoute>
              }
            />

            {/* 7b. Vocabulary (Quản lý từ vựng vi phạm - Yêu cầu quyền Admin) */}
            <Route
              path="/vocabulary"
              element={
                <ProtectedRoute requiredRole="admin">
                  <VocabularyPage />
                </ProtectedRoute>
              }
            />
            <Route path="/quan-ly-tu-vung" element={<Navigate to="/vocabulary" replace />} />

            {/* 7c. Audit Logs (Nhật ký hoạt động hệ thống - Yêu cầu quyền Admin) */}
            <Route
              path="/audit-logs"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AuditLogPage />
                </ProtectedRoute>
              }
            />
            <Route path="/audit" element={<Navigate to="/audit-logs" replace />} />
            <Route path="/nhat-ky" element={<Navigate to="/audit-logs" replace />} />


            {/* 8. Reports (Báo cáo & Tải file - Yêu cầu đăng nhập) */}
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <ReportsPage videos={videos} />
                </ProtectedRoute>
              }
            />


            {/* 10. More */}
            <Route path="/more" element={<Navigate to="/link" replace />} />

            {/* 11. Settings (Cài đặt hệ thống - Yêu cầu đăng nhập) */}
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage isConnected={isConnected} />
                </ProtectedRoute>
              }
            />

            {/* 12. Get Help (Trợ giúp & FAQ - Yêu cầu đăng nhập) */}
            <Route
              path="/help"
              element={
                <ProtectedRoute>
                  <HelpPage />
                </ProtectedRoute>
              }
            />

            {/* 13. Search (Điều hướng sang Link) */}
            <Route path="/search" element={<Navigate to="/link" replace />} />

            {/* Fallback cho các URL khác */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 dark:border-slate-900 bg-white/60 dark:bg-slate-950/60 py-6 text-center text-xs text-slate-500">
          <p>Hệ thống Quản lý và Theo dõi Video Realtime • Xây dựng với Vite, React, TypeScript &amp; Tailwind CSS</p>
        </footer>
      </div>

      {/* Realtime Toast Notification (duy nhất 1 ô ở góc dưới) */}
      <Toast toast={toast} onDismiss={dismissToast} />

      {/* Modal đăng nhập tài khoản / phân quyền Admin & User */}
      <LoginModal />
    </div>
  );
};

export default App;

