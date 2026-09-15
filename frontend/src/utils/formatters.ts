import { DailyStat, VideoItem } from '../types/video';

/**
 * Format số nguyên có dấu chấm/phẩy theo chuẩn tiếng Việt
 */
export function formatNumber(num: number | string | null | undefined): string {
  if (num === null || num === undefined || isNaN(Number(num))) return '0';
  return Number(num).toLocaleString('vi-VN');
}

/**
 * Trích xuất ngày định dạng YYYY-MM-DD từ chuỗi ngày đăng
 */
export function extractDate(dateStr?: string | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const match = dateStr.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}

/**
 * Hiển thị ngày dạng DD/MM/YYYY
 */
export function formatDateVN(dateStr?: string | null): string {
  if (!dateStr || dateStr === 'Chưa rõ ngày') return 'Chưa rõ';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Tổng hợp dữ liệu video theo từng ngày phục vụ 2 biểu đồ đường
 */
export function getDailyStatsData(videos: VideoItem[]): DailyStat[] {
  const map: Record<string, number> = {};
  let unknownCount = 0;

  videos.forEach((v) => {
    const d = extractDate(v.ngayDang);
    if (d) {
      map[d] = (map[d] || 0) + 1;
    } else {
      unknownCount++;
    }
  });

  // Sắp xếp ngày từ cũ đến mới theo thời gian
  const sortedDates = Object.keys(map).sort();
  let runningTotal = 0;

  const items: DailyStat[] = sortedDates.map((d) => {
    runningTotal += map[d];
    return {
      date: d,
      count: map[d],
      cumulative: runningTotal,
    };
  });

  if (unknownCount > 0) {
    runningTotal += unknownCount;
    items.push({
      date: 'Chưa rõ ngày',
      count: unknownCount,
      cumulative: runningTotal,
    });
  }

  return items;
}

/**
 * Làm sạch đường link (cắt bỏ query param thừa của TikTok)
 */
export function sanitizeVideoUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.includes('tiktok.com')) {
    return trimmed.split('?')[0].split('#')[0].replace(/\/+$/, '');
  }
  return trimmed;
}
