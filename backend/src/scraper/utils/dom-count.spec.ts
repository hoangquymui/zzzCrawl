import { parseDomCount } from './dom-count';

describe('Nhóm 4 — dom-count', () => {
  it('phân tích chính xác số liệu từ DOM', () => {
    expect(parseDomCount('1.234')).toEqual({ value: 1234, found: true });
    expect(parseDomCount('1,2K')).toEqual({ value: 1200, found: true });
    expect(parseDomCount('1,2 N')).toEqual({ value: 1200, found: true });
    expect(parseDomCount('3,4 Tr')).toEqual({ value: 3400000, found: true });
  });

  it('từ chối chuỗi mơ hồ hoặc rỗng', () => {
    expect(parseDomCount('Bạn và 12 người khác').found).toBe(false);
    expect(parseDomCount('').found).toBe(false);
    expect(parseDomCount(null).found).toBe(false);
    expect(parseDomCount(undefined).found).toBe(false);
  });
});
