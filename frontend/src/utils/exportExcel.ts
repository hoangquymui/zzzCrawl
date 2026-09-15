import * as XLSX from 'xlsx';
import { VideoItem } from '../types/video';

/**
 * Xuất dữ liệu danh sách video ra file Microsoft Excel (.xlsx) chuẩn chỉnh
 */
export function exportVideosToExcel(
  videos: VideoItem[],
  filenamePrefix: string = 'video_metrics'
): boolean {
  if (!videos || videos.length === 0) {
    return false;
  }

  // Chuẩn bị dữ liệu bảng với tiêu đề tiếng Việt rõ ràng
  const data = videos.map((v) => ({
    'STT': v.STT,
    'Đường Link': v.link || '',
    'Tiêu đề / Caption': v.caption || '',
    'Nền tảng': v.loai || '',
    'Người đăng': v.nguoiDang || '',
    'Ngày đăng': v.ngayDang || '',
    'Lượt Share': Number(v.SoLuongNguoiShare) || 0,
    'Lượt Xem': Number(v.LuotXem) || 0,
    'Lượt Thích': Number(v.LuotLike) || 0,
    'Bình luận': Number(v.LuotComment) || 0,
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);

  // Thiết lập độ rộng cột cho file Excel đẹp mắt, không bị che chữ
  worksheet['!cols'] = [
    { wch: 8 },   // STT
    { wch: 38 },  // Đường Link
    { wch: 50 },  // Tiêu đề / Caption
    { wch: 18 },  // Nền tảng
    { wch: 22 },  // Người đăng
    { wch: 20 },  // Ngày đăng
    { wch: 14 },  // Lượt Share
    { wch: 16 },  // Lượt Xem
    { wch: 14 },  // Lượt Thích
    { wch: 14 },  // Bình luận
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh Sách Video');

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${filenamePrefix}_${dateStr}.xlsx`);
  return true;
}
