import { parseNumber } from './number-parser';

describe('Nhóm 2 — number-parser', () => {
  it('phân tích chính xác các định dạng số tương tác và đơn vị', () => {
    expect(parseNumber('2,01 triệu')).toBe(2010000);
    expect(parseNumber('2.01K')).toBe(2010);
    expect(parseNumber('32.3K')).toBe(32300);
    expect(parseNumber('1,2K')).toBe(1200);
    expect(parseNumber('2,8 triệu')).toBe(2800000);
    expect(parseNumber('1.234')).toBe(1234);
    expect(parseNumber('1.234.567')).toBe(1234567);
    expect(parseNumber('1,234,567')).toBe(1234567);
    expect(parseNumber('12,5')).toBe(12);
    expect(parseNumber('1,2 N')).toBe(1200);
    expect(parseNumber('3,4 Tr')).toBe(3400000);
    expect(parseNumber('3 bình luận')).toBe(3);
    expect(parseNumber('5 bài viết')).toBe(5);
    expect(parseNumber('2 mới')).toBe(2);
    expect(parseNumber('4 lượt chia sẻ')).toBe(4);
    expect(parseNumber('N/A')).toBe(0);
  });

  it('property test: parseNumber x + K và x + triệu khớp Math.round cho dải 1..999', () => {
    // Thử nghiệm các giá trị đại diện với 1 và 2 chữ số thập phân
    for (let i = 1; i <= 999; i += 7) {
      const val1 = Number((i + 0.3).toFixed(1));
      expect(parseNumber(`${val1}K`)).toBe(Math.round(val1 * 1000));
      expect(parseNumber(`${val1} triệu`)).toBe(Math.round(val1 * 1e6));

      const val2 = Number((i + 0.29).toFixed(2));
      expect(parseNumber(`${val2}K`)).toBe(Math.round(val2 * 1000));
      expect(parseNumber(`${val2} triệu`)).toBe(Math.round(val2 * 1e6));
    }
  });
});
