import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginModal } from './components/LoginModal';
import { useVideoTracker } from './hooks/useVideoTracker';

// Pages cho từng route
import { DashboardPage } from './pages/DashboardPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { DataLibraryPage } from './pages/DataLibraryPage';
import { LifecyclePage } from './pages/LifecyclePage';
import { UsersPage } from './pages/UsersPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { HelpPage } from './pages/HelpPage';
import { VideoProfilePage } from './pages/VideoProfilePage';
import { ProfileManagementPage } from './pages/ProfileManagementPage';
import { CookiePage } from './pages/CookiePage';

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
  } = useVideoTracker();

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex font-sans selection:bg-blue-600 selection:text-white transition-colors duration-200">
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

            {/* 5. Lifecycle (Tiến trình cào, worker queue - Yêu cầu đăng nhập) */}
            <Route
              path="/lifecycle"
              element={
                <ProtectedRoute>
                  <LifecyclePage
                    videos={videos}
                    batchProgress={batchProgress}
                    isConnected={isConnected}
                    onRefreshAll={handleRefreshAll}
                  />
                </ProtectedRoute>
              }
            />


            {/* 7. Users (Quản lý người dùng & phân quyền - Yêu cầu quyền Admin) */}
            <Route
              path="/users"
              element={
                <ProtectedRoute requiredRole="admin">
                  <UsersPage />
                </ProtectedRoute>
              }
            />

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

