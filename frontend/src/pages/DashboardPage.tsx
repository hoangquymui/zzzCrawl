import React from 'react';
import { StatsCards } from '../components/StatsCards';
import { DailyCharts } from '../components/DailyCharts';
import { AddVideoForm } from '../components/AddVideoForm';
import { VideoTable } from '../components/VideoTable';
import { VideoItem, BatchProgress } from '../types/video';
import { useAuth } from '../context/AuthContext';

interface DashboardPageProps {
  videos: VideoItem[];
  batchProgress: BatchProgress;
  updatedRowStt: number | null;
  crawlStatus: string | null;
  onAddVideo: (url: string) => Promise<boolean>;
  onRefreshOne: (stt: number) => Promise<void>;
  onRefreshAll: () => Promise<void>;
  onDelete: (stt: number) => Promise<void>;
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
}) => {
  const { isAdmin } = useAuth();

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

      {/* Data Table */}
      <VideoTable
        videos={videos}
        batchProgress={batchProgress}
        updatedRowStt={updatedRowStt}
        onRefreshOne={onRefreshOne}
        onRefreshAll={onRefreshAll}
        onDelete={onDelete}
        canManage={isAdmin}
      />
    </div>
  );
};

