/**
 * Bộ chuyển đổi và phân tích số liệu tương tác (views, likes, comments, shares)
 * Hỗ trợ chuẩn xác cả định dạng tiếng Việt (dấu chấm phân tách hàng nghìn, dấu phẩy thập phân)
 * và định dạng quốc tế (dấu phẩy phân tách hàng nghìn, dấu chấm thập phân), kèm đơn vị k, m, b, triệu, nghìn, tỷ.
 */

export interface ParsedNumberDetail {
  value: number;
  found: boolean;
  raw?: string;
}

export function parseNumberDetailed(text?: string | number | null): ParsedNumberDetail {
  if (text === null || text === undefined) {
    return { value: 0, found: false };
  }

  if (typeof text === 'number') {
    if (isNaN(text)) return { value: 0, found: false };
    return { value: Math.floor(text), found: true, raw: String(text) };
  }

  const raw = String(text).trim().replace(/\xa0/g, ' ').replace(/&nbsp;/g, ' ');
  if (!raw || raw === '-' || raw.toLowerCase() === 'n/a') {
    return { value: 0, found: false, raw };
  }

  // Regex nhận diện cụm số kèm đơn vị tùy chọn
  // Đơn vị chỉ được khớp khi theo sau là ranh giới từ Unicode-aware (không phải chữ cái, kể cả chữ có dấu)
  const match =
    raw.match(/([\d.,]+)\s*(triệu|tr|nghìn|ngàn|k|m|b|tỷ|n)(?![\p{L}\p{N}])/iu) ||
    raw.match(/([\d.,]+)/iu);
  if (!match) {
    return { value: 0, found: false, raw };
  }

  let numStr = match[1].trim().replace(/\s+/g, '');
  const unit = (match[2] || '').toLowerCase();

  if (!numStr) {
    return { value: 0, found: false, raw };
  }

  // 1. Trường hợp có cả dấu chấm '.' và dấu phẩy ','
  if (numStr.includes(',') && numStr.includes('.')) {
    const lastComma = numStr.lastIndexOf(',');
    const lastDot = numStr.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Kiểu Việt Nam / Châu Âu: 1.234,5 hoặc 1.234.567,89 -> xóa '.', đổi ',' thành '.'
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    } else {
      // Kiểu Quốc tế / Mỹ: 1,234.5 hoặc 1,234,567.89 -> xóa ','
      numStr = numStr.replace(/,/g, '');
    }
  }
  // 2. Chỉ có dấu phẩy ','
  else if (numStr.includes(',')) {
    const parts = numStr.split(',');
    // Nhiều hơn 1 dấu phẩy -> phân tách hàng nghìn (1,234,567)
    if (parts.length > 2) {
      numStr = numStr.replace(/,/g, '');
    } else if (parts.length === 2) {
      // Đúng 1 dấu phẩy:
      // Nếu có đơn vị (ví dụ 1,2K hoặc 2,8 triệu) -> dấu phẩy là thập phân
      if (unit) {
        numStr = parts[0] + '.' + parts[1];
      }
      // Nếu không có đơn vị:
      // Nếu phần sau có 3 chữ số (ví dụ 1,234 hoặc 12,345) -> dấu phẩy là phân cách hàng nghìn
      else if (parts[1].length === 3) {
        numStr = numStr.replace(/,/g, '');
      }
      // Nếu phần sau có 1 hoặc 2 chữ số (ví dụ 1,2 hoặc 1,25) -> dấu phẩy là thập phân
      else if (parts[1].length <= 2) {
        numStr = parts[0] + '.' + parts[1];
      } else {
        numStr = numStr.replace(/,/g, '');
      }
    }
  }
  // 3. Chỉ có dấu chấm '.'
  else if (numStr.includes('.')) {
    const parts = numStr.split('.');
    // Nhiều hơn 1 dấu chấm -> phân tách hàng nghìn kiểu Việt Nam (1.234.567)
    if (parts.length > 2) {
      numStr = numStr.replace(/\./g, '');
    } else if (parts.length === 2) {
      // Đúng 1 dấu chấm:
      // Nếu có đơn vị (ví dụ 1.2K hoặc 2.8 triệu) -> dấu chấm là thập phân
      if (unit) {
        // Giữ nguyên dấu chấm thập phân
      }
      // Nếu không có đơn vị:
      // Nếu phần sau có 3 chữ số (ví dụ 1.234 hoặc 12.345) -> phân cách hàng nghìn kiểu Việt Nam
      else if (parts[1].length === 3) {
        numStr = numStr.replace(/\./g, '');
      }
      // Nếu phần sau có 1 hoặc 2 chữ số (ví dụ 1.5) -> dấu chấm thập phân
      else {
        // Giữ nguyên dấu chấm thập phân
      }
    }
  }

  const val = parseFloat(numStr);
  if (isNaN(val)) {
    return { value: 0, found: false, raw };
  }

  let multiplier = 1;
  if (['k', 'nghìn', 'ngàn', 'n'].includes(unit)) multiplier = 1000;
  else if (['m', 'triệu', 'tr'].includes(unit)) multiplier = 1000000;
  else if (['b', 'tỷ'].includes(unit)) multiplier = 1000000000;

  const finalVal = multiplier > 1 ? Math.round(val * multiplier) : Math.floor(val);
  return {
    value: finalVal >= 0 ? finalVal : 0,
    found: true,
    raw,
  };
}

export function parseNumber(text?: string | number | null): number {
  return parseNumberDetailed(text).value;
}
