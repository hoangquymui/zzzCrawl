import React from 'react';
import { VideoTable } from '../components/VideoTable';
import { AddVideoForm } from '../components/AddVideoForm';
import { VideoItem, BatchProgress } from '../types/video';
import { useAuth } from '../context/AuthContext';

interface DataLibraryPageProps {
  videos: VideoItem[];
  batchProgress: BatchProgress;
  updatedRowStt: number | null;
  crawlStatus: string | null;
  onAddVideo: (url: string) => Promise<boolean>;
  onRefreshOne: (stt: number) => Promise<void>;
  onRefreshAll: () => Promise<void>;
  onDelete: (stt: number) => Promise<void>;
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

  return (
    <div className="space-y-6">
      {/* Quick Add Video Bar (Chỉ Admin mới có quyền thêm link) */}
      {isAdmin && (
        <AddVideoForm onAddVideo={onAddVideo} crawlStatus={crawlStatus} />
      )}

      {/* Main Full-Featured Video Table */}
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

