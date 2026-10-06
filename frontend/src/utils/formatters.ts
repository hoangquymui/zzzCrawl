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
 * Hỗ trợ các định dạng: YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, DD-MM-YYYY
 */
export function extractDate(dateStr?: string | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  // Khớp YYYY-MM-DD hoặc YYYY/MM/DD
  const matchIso = dateStr.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (matchIso) {
    return `${matchIso[1]}-${matchIso[2]}-${matchIso[3]}`;
  }
  // Khớp DD/MM/YYYY hoặc DD-MM-YYYY
  const matchDmy = dateStr.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (matchDmy) {
    return `${matchDmy[3]}-${matchDmy[2].padStart(2, '0')}-${matchDmy[1].padStart(2, '0')}`;
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
 * Tổng hợp dữ liệu video và tương tác (Like, Comment, Share, Views) theo từng ngày
 */
export function getDailyStatsData(videos: VideoItem[]): DailyStat[] {
  const map: Record<
    string,
    { count: number; views: number; likes: number; comments: number; shares: number }
  > = {};
  let unknownCount = 0;
  let unknownViews = 0;
  let unknownLikes = 0;
  let unknownComments = 0;
  let unknownShares = 0;

  videos.forEach((v) => {
    const d = extractDate(v.ngayDang);
    const views = typeof v.LuotXem === 'number' ? v.LuotXem : 0;
    const likes = typeof v.LuotLike === 'number' ? v.LuotLike : 0;
    const comments = typeof v.LuotComment === 'number' ? v.LuotComment : 0;
    const shares = typeof v.SoLuongNguoiShare === 'number' ? v.SoLuongNguoiShare : 0;

    if (d) {
      if (!map[d]) {
        map[d] = { count: 0, views: 0, likes: 0, comments: 0, shares: 0 };
      }
      map[d].count += 1;
      map[d].views += views;
      map[d].likes += likes;
      map[d].comments += comments;
      map[d].shares += shares;
    } else {
      unknownCount += 1;
      unknownViews += views;
      unknownLikes += likes;
      unknownComments += comments;
      unknownShares += shares;
    }
  });

  // Sắp xếp ngày từ cũ đến mới theo thời gian
  const sortedDates = Object.keys(map).sort();
  let runningCount = 0;
  let runningViews = 0;
  let runningLikes = 0;
  let runningComments = 0;
  let runningShares = 0;

  const items: DailyStat[] = sortedDates.map((d) => {
    runningCount += map[d].count;
    runningViews += map[d].views;
    runningLikes += map[d].likes;
    runningComments += map[d].comments;
    runningShares += map[d].shares;
    return {
      date: d,
      count: map[d].count,
      cumulative: runningCount,
      views: map[d].views,
      cumulativeViews: runningViews,
      likes: map[d].likes,
      cumulativeLikes: runningLikes,
      comments: map[d].comments,
      cumulativeComments: runningComments,
      shares: map[d].shares,
      cumulativeShares: runningShares,
    };
  });

  if (unknownCount > 0) {
    runningCount += unknownCount;
    runningViews += unknownViews;
    runningLikes += unknownLikes;
    runningComments += unknownComments;
    runningShares += unknownShares;
    items.push({
      date: 'Chưa rõ ngày',
      count: unknownCount,
      cumulative: runningCount,
      views: unknownViews,
      cumulativeViews: runningViews,
      likes: unknownLikes,
      cumulativeLikes: runningLikes,
      comments: unknownComments,
      cumulativeComments: runningComments,
      shares: unknownShares,
      cumulativeShares: runningShares,
    });
  }

  return items;
}

/**
 * Tải ảnh trực tiếp từ canvas ra file PNG chất lượng cao
 */
export function downloadCanvasChart(canvas: HTMLCanvasElement | null, filename: string): void {
  if (!canvas) return;
  try {
    const url = canvas.toDataURL('image/png', 1.0);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Lỗi xuất ảnh biểu đồ:', err);
  }
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
