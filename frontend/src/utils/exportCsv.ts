import { VideoItem } from '../types/video';

/**
 * Xuất danh sách video ra file CSV chuẩn UTF-8 BOM hiển thị tiếng Việt trên MS Excel
 */
export function exportVideosToCSV(
  videos: VideoItem[],
  filenamePrefix: string = 'video_metrics'
): boolean {
  if (!videos || videos.length === 0) {
    return false;
  }

  const headers = [
    'STT',
    'link',
    'caption',
    'loai',
    'nguoiDang',
    'ngayDang',
    'SoLuongNguoiShare',
    'LuotXem',
    'LuotLike',
    'LuotComment',
  ];

  const escapeCSV = (val: string | number | undefined | null) => {
    const s = String(val ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = videos.map((v) => [
    v.STT,
    escapeCSV(v.link),
    escapeCSV(v.caption),
    escapeCSV(v.loai),
    escapeCSV(v.nguoiDang),
    escapeCSV(v.ngayDang),
    v.SoLuongNguoiShare || 0,
    v.LuotXem || 0,
    v.LuotLike || 0,
    v.LuotComment || 0,
  ]);

  // \uFEFF là UTF-8 BOM giúp Excel nhận diện đúng mã hóa tiếng Việt
  const csvContent =
    '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `${filenamePrefix}_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return true;
}
