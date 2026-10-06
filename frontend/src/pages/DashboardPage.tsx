import React, { useMemo } from 'react';
import { StatsCards } from '../components/StatsCards';
import { DailyCharts } from '../components/DailyCharts';
import { AddVideoForm } from '../components/AddVideoForm';
import { VideoTable } from '../components/VideoTable';
import { ViolationTable } from '../components/ViolationTable';
import { VideoItem, BatchProgress } from '../types/video';
import { useAuth } from '../context/AuthContext';

interface DashboardPageProps {
  videos: VideoItem[];
  batchProgress: BatchProgress;
  updatedRowStt: string | number | null;
  crawlStatus: string | null;
  onAddVideo: (url: string) => Promise<boolean>;
  onRefreshOne: (idOrStt: string | number) => Promise<void>;
  onRefreshAll: () => Promise<void>;
  onDelete: (idOrStt: string | number) => Promise<void>;
  onBulkDelete?: (ids: (string | number)[]) => Promise<void>;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  videos,
  batchProgress,
  updatedRowStt,
  crawlStatus,
  onAddVideo,
  onRefreshOne,
  onRefreshAll,
  onDelete,
  onBulkDelete,
}) => {
  const { isAdmin } = useAuth();

  // Tách riêng các bài viết vi phạm tiêu chuẩn và các bài viết theo dõi bình thường
  const violationVideos = useMemo(() => videos.filter((v) => v.isViolation), [videos]);
  const trackingVideos = useMemo(() => videos.filter((v) => !v.isViolation), [videos]);

  return (
    <div className="space-y-6">
      {/* Metric Summary Cards */}
      <StatsCards videos={videos} />

      {/* Daily Video Statistics & 2 Line Charts */}
      <DailyCharts videos={videos} />

      {/* Add Video Form (Chỉ Admin mới có quyền thêm link và cào dữ liệu mới) */}
      {isAdmin && (
        <AddVideoForm onAddVideo={onAddVideo} crawlStatus={crawlStatus} />
      )}

      {/* Bảng vi phạm tiêu chuẩn (Hiển thị ngay trên trang chủ) */}
      <ViolationTable
        videos={violationVideos}
        onRefreshOne={onRefreshOne}
        onDelete={onDelete}
        canManage={isAdmin}
      />

      {/* Data Table */}
      <VideoTable
        videos={trackingVideos}
        batchProgress={batchProgress}
        updatedRowStt={updatedRowStt}
        onRefreshOne={onRefreshOne}
        onRefreshAll={onRefreshAll}
        onDelete={onDelete}
        onBulkDelete={onBulkDelete}
        canManage={isAdmin}
      />
    </div>
  );
};

