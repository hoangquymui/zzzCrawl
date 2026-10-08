import { parseNumberDetailed } from './number-parser';

/**
 * Bóc tách số lượng tương tác từ DOM node text hoặc aria-label
 * Đảm bảo:
 * 1. Chấp nhận chuỗi có chữ xung quanh bằng cách trích xuất chuẩn xác.
 * 2. Từ chối chuỗi mơ hồ như "Bạn và N người khác" (trả found: false).
 * 3. Tái sử dụng parseNumberDetailed để đảm bảo tính nhất quán.
 */
export function parseDomCount(text?: string | null): { value: number; found: boolean } {
  if (!text || !text.trim()) {
    return { value: 0, found: false };
  }

  const clean = text.trim();

  // Chặn trường hợp ngữ cảnh phức tạp / danh sách người tương tác (ví dụ: "Bạn và 12 người khác")
  if (/(?:bạn|và).*(?:người khác)/i.test(clean) || /(?:others)/i.test(clean)) {
    return { value: 0, found: false };
  }

  const detailed = parseNumberDetailed(clean);
  if (!detailed.found || detailed.value < 0) {
    return { value: 0, found: false };
  }

  return { value: detailed.value, found: true };
}
