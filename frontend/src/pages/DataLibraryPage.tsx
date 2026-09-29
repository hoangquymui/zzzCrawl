import React, { useMemo } from 'react';
import { VideoTable } from '../components/VideoTable';
import { ViolationTable } from '../components/ViolationTable';
import { AddVideoForm } from '../components/AddVideoForm';
import { VideoItem, BatchProgress } from '../types/video';
import { useAuth } from '../context/AuthContext';

interface DataLibraryPageProps {
  videos: VideoItem[];
  batchProgress: BatchProgress;
  updatedRowStt: string | number | null;
  crawlStatus: string | null;
  onAddVideo: (url: string) => Promise<boolean>;
  onRefreshOne: (idOrStt: string | number) => Promise<void>;
  onRefreshAll: () => Promise<void>;
  onDelete: (idOrStt: string | number) => Promise<void>;
}

export const DataLibraryPage: React.FC<DataLibraryPageProps> = ({
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

  // Tách riêng các bài viết vi phạm tiêu chuẩn và các bài viết theo dõi bình thường
  const violationVideos = useMemo(() => videos.filter((v) => v.isViolation), [videos]);
  const trackingVideos = useMemo(() => videos.filter((v) => !v.isViolation), [videos]);

  return (
    <div className="space-y-6">
      {/* Quick Add Video Bar (Chỉ Admin mới có quyền thêm link) */}
      {isAdmin && (
        <AddVideoForm onAddVideo={onAddVideo} crawlStatus={crawlStatus} />
      )}

      {/* 1. Bảng vi phạm tiêu chuẩn (Nằm bên trên Bảng dữ liệu theo dõi) */}
      <ViolationTable
        videos={violationVideos}
        onRefreshOne={onRefreshOne}
        onDelete={onDelete}
        canManage={isAdmin}
      />

      {/* 2. Main Full-Featured Video Table (Bảng dữ liệu theo dõi) */}
      <VideoTable
        videos={trackingVideos}
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

