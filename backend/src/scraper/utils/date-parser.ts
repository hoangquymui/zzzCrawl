/**
 * Bộ phân tích và chuẩn hóa ngày tháng dùng chung
 * Lưu ý: Múi giờ sử dụng là giờ máy chủ (Server Local Timezone)
 */

export interface ParsedDateResult {
  dateObj: Date | null;
  timestamp: number;
  formatted: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const MONTH_MAP: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

function createValidDate(year: number, monthIndex: number, day: number, hour = 0, minute = 0, second = 0): ParsedDateResult {
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) {
    return { dateObj: null, timestamp: 0, formatted: '' };
  }
  const d = new Date(year, monthIndex, day, hour, minute, second);
  // Kiểm tra ngày không tự tràn (ví dụ 31 tháng 2 tự tràn sang tháng 3)
  if (d.getFullYear() !== year || d.getMonth() !== monthIndex || d.getDate() !== day) {
    return { dateObj: null, timestamp: 0, formatted: '' };
  }
  return {
    dateObj: d,
    timestamp: d.getTime(),
    formatted: formatDateTime(d),
  };
}

export function parseDateUnified(raw?: unknown, referenceNow?: Date): ParsedDateResult {
  if (!raw && raw !== 0) {
    return { dateObj: null, timestamp: 0, formatted: '' };
  }

  const now = referenceNow ? new Date(referenceNow.getTime()) : new Date();

  // 1. Số nguyên hoặc chuỗi số Unix timestamp (9-13 chữ số)
  if (typeof raw === 'number' || (typeof raw === 'string' && /^\d{9,13}$/.test(raw.trim()))) {
    let num = typeof raw === 'number' ? raw : parseInt(raw.trim(), 10);
    if (num < 100000000000) num = num * 1000;
    const d = new Date(num);
    if (!isNaN(d.getTime())) {
      return { dateObj: d, timestamp: d.getTime(), formatted: formatDateTime(d) };
    }
  }

  const str = String(raw).trim();
  if (!str) {
    return { dateObj: null, timestamp: 0, formatted: '' };
  }

  // 2. ISO 8601
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return { dateObj: d, timestamp: d.getTime(), formatted: formatDateTime(d) };
    }
  }

  // 3. Thời gian tương đối tức thời
  if (/^(vừa xong|vừa|mới đây|gần đây|just now|today|hôm nay)$/i.test(str)) {
    return { dateObj: now, timestamp: now.getTime(), formatted: formatDateTime(now) };
  }

  // 4. Giây
  const mSec = str.match(/^(\d+)\s*(?:giây|seconds?|secs?|s)(?:\s|[^\p{L}\p{N}]|$)/iu);
  if (mSec) {
    const d = new Date(now.getTime() - parseInt(mSec[1], 10) * 1000);
    return { dateObj: d, timestamp: d.getTime(), formatted: formatDateTime(d) };
  }

  // 5. Phút
  const mMin = str.match(/^(\d+)\s*(?:phút|minutes?|mins?|m)(?:\s|[^\p{L}\p{N}]|$)/iu);
  if (mMin) {
    const d = new Date(now.getTime() - parseInt(mMin[1], 10) * 60 * 1000);
    return { dateObj: d, timestamp: d.getTime(), formatted: formatDateTime(d) };
  }

  // 6. Giờ
  const mHour = str.match(/^(\d+)\s*(?:giờ|hours?|hrs?|h)(?:\s|[^\p{L}\p{N}]|$)/iu);
  if (mHour) {
    const d = new Date(now.getTime() - parseInt(mHour[1], 10) * 3600 * 1000);
    return { dateObj: d, timestamp: d.getTime(), formatted: formatDateTime(d) };
  }

  // 7. Hôm qua
  const mYesterday = str.match(/(?:hôm qua|yesterday)(?:\s*(?:lúc|at)?\s*(\d{1,2}):(\d{2}))?/iu);
  if (mYesterday) {
    const d = new Date(now.getTime() - 86400 * 1000);
    if (mYesterday[1] && mYesterday[2]) {
      d.setHours(parseInt(mYesterday[1], 10), parseInt(mYesterday[2], 10), 0, 0);
    }
    return { dateObj: d, timestamp: d.getTime(), formatted: formatDateTime(d) };
  }

  // 8. Tuần
  const mWeek = str.match(/^(\d+)\s*(?:tuần|weeks?|w)(?:\s|[^\p{L}\p{N}]|$)/iu);
  if (mWeek) {
    const d = new Date(now.getTime() - parseInt(mWeek[1], 10) * 7 * 86400 * 1000);
    return { dateObj: d, timestamp: d.getTime(), formatted: formatDateTime(d) };
  }

  // 9. Tháng tương đối (ví dụ "3 tháng", "3 tháng trước", "3 months ago")
  const mMonthRel = str.match(/^(\d+)\s*(?:tháng|months?)(?:\s|[^\p{L}\p{N}]|$)/iu);
  if (mMonthRel && !/tháng\s+\d{1,2}/i.test(str)) {
    const count = parseInt(mMonthRel[1], 10);
    const d = new Date(now.getTime() - count * 30 * 86400 * 1000);
    return { dateObj: d, timestamp: d.getTime(), formatted: formatDateTime(d) };
  }

  // 10. Năm tương đối
  const mYearRel = str.match(/^(\d+)\s*(?:năm|years?|y)(?:\s|[^\p{L}\p{N}]|$)/iu);
  if (mYearRel) {
    const count = parseInt(mYearRel[1], 10);
    const d = new Date(now.getTime() - count * 365 * 86400 * 1000);
    return { dateObj: d, timestamp: d.getTime(), formatted: formatDateTime(d) };
  }

  // 11. Ngày tương đối
  const mDay = str.match(/(\d+)\s*(?:ngày|days?|d)\b/i);
  if (mDay) {
    const d = new Date(now.getTime() - parseInt(mDay[1], 10) * 86400 * 1000);
    return { dateObj: d, timestamp: d.getTime(), formatted: formatDateTime(d) };
  }

  // 12. Ngày tuyệt đối tiếng Việt: "5 tháng 9, 2026 lúc 09:57"
  const mVnDate = str.match(
    /(\d{1,2})\s+tháng\s+(\d{1,2})(?:[,\s]+(\d{4}))?(?:\s*(?:lúc|at)?\s*(\d{1,2}):(\d{2}))?/i
  );
  if (mVnDate) {
    const day = parseInt(mVnDate[1], 10);
    const month = parseInt(mVnDate[2], 10) - 1;
    let year = mVnDate[3] ? parseInt(mVnDate[3], 10) : now.getFullYear();
    if (!mVnDate[3] && month > now.getMonth()) {
      year -= 1;
    }
    const hasTime = Boolean(mVnDate[4]);
    const hour = hasTime ? parseInt(mVnDate[4], 10) : 0;
    const min = hasTime ? parseInt(mVnDate[5], 10) : 0;
    return createValidDate(year, month, day, hour, min, 0);
  }

  // 13. Ngày tuyệt đối tiếng Anh (Định dạng A: "Friday 25 September 2026 at 15:43")
  const mEngDateA = str.match(
    /(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,\s]+)?(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)(?:[,\s]+(\d{4}))?(?:\s*(?:at|lúc)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(am|pm))?)?/i
  );
  if (mEngDateA) {
    const day = parseInt(mEngDateA[1], 10);
    const mName = mEngDateA[2].toLowerCase();
    const month = MONTH_MAP[mName] !== undefined ? MONTH_MAP[mName] : 0;
    let year = mEngDateA[3] ? parseInt(mEngDateA[3], 10) : now.getFullYear();
    if (!mEngDateA[3] && month > now.getMonth()) {
      year -= 1;
    }
    let hour = mEngDateA[4] ? parseInt(mEngDateA[4], 10) : 0;
    const min = mEngDateA[5] ? parseInt(mEngDateA[5], 10) : 0;
    const sec = mEngDateA[6] ? parseInt(mEngDateA[6], 10) : 0;
    const ampm = mEngDateA[7] ? mEngDateA[7].toLowerCase() : '';
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return createValidDate(year, month, day, hour, min, sec);
  }

  // 14. Ngày tuyệt đối tiếng Anh (Định dạng B: "September 25, 2026 at 3:43 PM")
  const mEngDateB = str.match(
    /(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,\s]+)?(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:[,\s]+(\d{4}))?(?:\s*(?:at|lúc)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(am|pm))?)?/i
  );
  if (mEngDateB) {
    const mName = mEngDateB[1].toLowerCase();
    const month = MONTH_MAP[mName] !== undefined ? MONTH_MAP[mName] : 0;
    const day = parseInt(mEngDateB[2], 10);
    let year = mEngDateB[3] ? parseInt(mEngDateB[3], 10) : now.getFullYear();
    if (!mEngDateB[3] && month > now.getMonth()) {
      year -= 1;
    }
    let hour = mEngDateB[4] ? parseInt(mEngDateB[4], 10) : 0;
    const min = mEngDateB[5] ? parseInt(mEngDateB[5], 10) : 0;
    const sec = mEngDateB[6] ? parseInt(mEngDateB[6], 10) : 0;
    const ampm = mEngDateB[7] ? mEngDateB[7].toLowerCase() : '';
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return createValidDate(year, month, day, hour, min, sec);
  }

  // 15. Chuẩn YYYY-MM-DD
  const mStd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (mStd) {
    const year = parseInt(mStd[1], 10);
    const month = parseInt(mStd[2], 10) - 1;
    const day = parseInt(mStd[3], 10);
    const hour = mStd[4] ? parseInt(mStd[4], 10) : 0;
    const min = mStd[5] ? parseInt(mStd[5], 10) : 0;
    const sec = mStd[6] ? parseInt(mStd[6], 10) : 0;
    return createValidDate(year, month, day, hour, min, sec);
  }

  // 16. Chuẩn DD/MM/YYYY
  const mDmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (mDmy) {
    const year = parseInt(mDmy[3], 10);
    const month = parseInt(mDmy[2], 10) - 1;
    const day = parseInt(mDmy[1], 10);
    const hour = mDmy[4] ? parseInt(mDmy[4], 10) : 0;
    const min = mDmy[5] ? parseInt(mDmy[5], 10) : 0;
    const sec = mDmy[6] ? parseInt(mDmy[6], 10) : 0;
    return createValidDate(year, month, day, hour, min, sec);
  }

  return { dateObj: null, timestamp: 0, formatted: '' };
}
