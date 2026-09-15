import { VideoItem } from '../types/video';
import { getAuthHeaders } from './auth.service';

export async function fetchVideos(): Promise<VideoItem[]> {
  const res = await fetch('/api/videos', {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Lỗi tải danh sách video: ${res.statusText}`);
  }
  return res.json();
}

export async function addVideo(url: string): Promise<{ success: boolean; data: VideoItem }> {
  const res = await fetch('/api/videos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ url }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || json.error || 'Có lỗi xảy ra khi thêm video');
  }
  return json;
}

export async function refreshVideo(stt: number): Promise<{ success: boolean; data: VideoItem }> {
  const res = await fetch(`/api/videos/${stt}/refresh`, {
    method: 'POST',
    headers: { ...getAuthHeaders() },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || json.error || `Lỗi cập nhật video STT ${stt}`);
  }
  return json;
}

export async function deleteVideo(stt: number): Promise<{ success: boolean }> {
  const res = await fetch(`/api/videos/${stt}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || json.error || `Lỗi khi xóa video STT ${stt}`);
  }
  return json;
}

export async function refreshAllVideos(concurrency: string = 'all'): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/videos/refresh-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ concurrency }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || json.error || 'Lỗi khi làm mới tất cả video');
  }
  return json;
}
