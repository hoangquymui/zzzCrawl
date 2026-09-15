import { useState, useEffect, useCallback, useRef } from 'react';
import { socket } from '../services/socket';
import {
  fetchVideos,
  addVideo,
  refreshVideo,
  deleteVideo,
  refreshAllVideos,
} from '../services/api';
import { BatchProgress, ToastItem, VideoItem } from '../types/video';
import { exportVideosToCSV } from '../utils/exportCsv';
import { exportVideosToExcel } from '../utils/exportExcel';

export function useVideoTracker() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(socket.connected);
  const [crawlStatus, setCrawlStatus] = useState<string | null>(null);
  const [updatedRowStt, setUpdatedRowStt] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({
    isRunning: false,
    completed: 0,
    total: 0,
  });

  const rowPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hiển thị toast duy nhất ở góc màn hình, thông báo mới sẽ ghi đè lên thông báo cũ
  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    const id = Math.random().toString(36).substring(2, 9);
    setToast({ id, message, type });

    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast(null);
  }, []);

  // Kích hoạt animation chớp sáng dòng vừa cập nhật
  const triggerRowPulse = useCallback((stt: number) => {
    if (rowPulseTimerRef.current) {
      clearTimeout(rowPulseTimerRef.current);
    }
    setUpdatedRowStt(stt);
    rowPulseTimerRef.current = setTimeout(() => {
      setUpdatedRowStt(null);
    }, 2500);
  }, []);

  // Lắng nghe sự kiện Socket.IO
  useEffect(() => {
    // Tải dữ liệu qua REST API ban đầu phòng khi socket chưa kịp bắn
    fetchVideos()
      .then((data) => {
        if (Array.isArray(data)) {
          setVideos(data);
        }
      })
      .catch(() => {
        // Có thể server chưa chạy, sẽ chờ socket emit
      });

    const onConnect = () => {
      setIsConnected(true);
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    const onInitialData = (data: VideoItem[]) => {
      setVideos(data || []);
    };

    const onCrawlStatus = (data: { message: string; url?: string }) => {
      setCrawlStatus(data?.message || 'Đang cào dữ liệu...');
    };

    const onVideoAdded = (newVideo: VideoItem) => {
      setCrawlStatus(null);
      setVideos((prev) => {
        const exists = prev.find((v) => v.STT === newVideo.STT);
        if (exists) return prev;
        return [...prev, newVideo];
      });
      addToast(`Đã thêm thành công video STT ${newVideo.STT}`, 'success');
      triggerRowPulse(newVideo.STT);
    };

    const onVideoUpdated = (freshVideo: VideoItem) => {
      setCrawlStatus(null);
      setVideos((prev) =>
        prev.map((v) => (v.STT === freshVideo.STT ? freshVideo : v))
      );
      triggerRowPulse(freshVideo.STT);
      addToast(`Đã cập nhật số liệu mới cho STT ${freshVideo.STT}`, 'info');
    };

    const onVideoDeleted = (payload: { STT: number }) => {
      setVideos((prev) => prev.filter((v) => v.STT !== payload.STT));
      addToast(`Đã xóa video STT ${payload.STT}`, 'info');
    };

    const onRefreshAllStarted = (data: { total: number; concurrency?: number | string }) => {
      setBatchProgress({
        isRunning: true,
        completed: 0,
        total: data.total,
        concurrency: data.concurrency,
      });
      setCrawlStatus(`Đang làm mới đồng loạt ${data.total} video...`);
    };

    const onRefreshAllProgress = (data: { completed: number; total: number }) => {
      setBatchProgress((prev) => ({
        ...prev,
        completed: data.completed,
        total: data.total,
      }));
      setCrawlStatus(`Tiến trình: ${data.completed}/${data.total} video`);
    };

    const onRefreshAllCompleted = (data: { total: number }) => {
      setBatchProgress({
        isRunning: false,
        completed: data.total,
        total: data.total,
      });
      setCrawlStatus(null);
      addToast(`Đã làm mới thành công toàn bộ ${data.total} video!`, 'success');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('initial_data', onInitialData);
    socket.on('crawl_status', onCrawlStatus);
    socket.on('video_added', onVideoAdded);
    socket.on('video_updated', onVideoUpdated);
    socket.on('video_deleted', onVideoDeleted);
    socket.on('refresh_all_started', onRefreshAllStarted);
    socket.on('refresh_all_progress', onRefreshAllProgress);
    socket.on('refresh_all_completed', onRefreshAllCompleted);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('initial_data', onInitialData);
      socket.off('crawl_status', onCrawlStatus);
      socket.off('video_added', onVideoAdded);
      socket.off('video_updated', onVideoUpdated);
      socket.off('video_deleted', onVideoDeleted);
      socket.off('refresh_all_started', onRefreshAllStarted);
      socket.off('refresh_all_progress', onRefreshAllProgress);
      socket.off('refresh_all_completed', onRefreshAllCompleted);
    };
  }, [addToast, triggerRowPulse]);

  // Các thao tác gửi lên API
  const handleAddVideo = async (url: string): Promise<boolean> => {
    try {
      setCrawlStatus('Đang mở trình duyệt bóc tách dữ liệu...');
      await addVideo(url);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi khi thêm video';
      addToast(message, 'error');
      return false;
    } finally {
      setCrawlStatus(null);
    }
  };

  const handleRefreshOne = async (stt: number): Promise<void> => {
    try {
      setCrawlStatus(`Đang cập nhật lại video STT ${stt}...`);
      await refreshVideo(stt);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi khi làm mới video';
      addToast(message, 'error');
    } finally {
      setCrawlStatus(null);
    }
  };

  const handleRefreshAll = async (): Promise<void> => {
    if (videos.length === 0) {
      addToast('Danh sách theo dõi đang trống!', 'error');
      return;
    }

    try {
      const res = await refreshAllVideos('all');
      addToast(res.message || 'Bắt đầu làm mới toàn bộ video...', 'info');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi khi làm mới toàn bộ';
      addToast(message, 'error');
    }
  };

  const handleDelete = async (stt: number): Promise<void> => {
    try {
      await deleteVideo(stt);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi khi xóa video';
      addToast(message, 'error');
    }
  };

  const handleExportCSV = (): void => {
    const success = exportVideosToCSV(videos);
    if (!success) {
      addToast('Chưa có dữ liệu để xuất file CSV!', 'error');
    } else {
      addToast('Đã tạo và tải file CSV thành công!', 'success');
    }
  };

  const handleExportExcel = (): void => {
    const success = exportVideosToExcel(videos);
    if (!success) {
      addToast('Chưa có dữ liệu để xuất file Excel!', 'error');
    } else {
      addToast('Đã tạo và tải file Excel (.xlsx) thành công!', 'success');
    }
  };

  return {
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
    handleExportCSV,
    handleExportExcel,
  };
}
