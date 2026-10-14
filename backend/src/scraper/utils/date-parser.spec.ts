import { parseDateUnified, formatDateTime } from './date-parser';

describe('Nhóm 6 / Mục 1 — date-parser độc lập múi giờ', () => {
  const fixedNow = new Date('2026-10-08T10:00:00+07:00');

  it('phân tích ngày tương đối: tuần, tháng, năm, phút, giờ', () => {
    // 2 tuần
    const res2Weeks = parseDateUnified('2 tuần', fixedNow);
    const expected2Weeks = new Date(fixedNow.getTime() - 14 * 86400 * 1000);
    expect(res2Weeks.timestamp).toBe(expected2Weeks.getTime());
    expect(res2Weeks.formatted).toBe(formatDateTime(expected2Weeks));

    // 3 tháng trước
    const res3Months = parseDateUnified('3 tháng trước', fixedNow);
    expect(res3Months.timestamp).toBeLessThan(fixedNow.getTime() - 85 * 86400 * 1000);
    expect(res3Months.timestamp).toBeGreaterThan(fixedNow.getTime() - 95 * 86400 * 1000);

    // 1 năm
    const res1Year = parseDateUnified('1 năm', fixedNow);
    expect(res1Year.timestamp).toBeLessThan(fixedNow.getTime() - 360 * 86400 * 1000);
    expect(res1Year.timestamp).toBeGreaterThan(fixedNow.getTime() - 370 * 86400 * 1000);

    // 5 phút
    const res5Min = parseDateUnified('5 phút', fixedNow);
    const expected5Min = new Date(fixedNow.getTime() - 5 * 60 * 1000);
    expect(res5Min.timestamp).toBe(expected5Min.getTime());
    expect(res5Min.formatted).toBe(formatDateTime(expected5Min));

    // 2 giờ
    const res2Hour = parseDateUnified('2 giờ', fixedNow);
    const expected2Hour = new Date(fixedNow.getTime() - 2 * 3600 * 1000);
    expect(res2Hour.timestamp).toBe(expected2Hour.getTime());
    expect(res2Hour.formatted).toBe(formatDateTime(expected2Hour));

    // hôm qua lúc 21:30
    const resYesterday = parseDateUnified('hôm qua lúc 21:30', fixedNow);
    const expectedYesterday = new Date(fixedNow.getTime());
    expectedYesterday.setDate(expectedYesterday.getDate() - 1);
    expectedYesterday.setHours(21, 30, 0, 0);
    expect(resYesterday.timestamp).toBe(expectedYesterday.getTime());
    expect(resYesterday.formatted).toBe(formatDateTime(expectedYesterday));
  });

  it('phân tích ngày tuyệt đối tiếng Việt và tiếng Anh', () => {
    const resVn = parseDateUnified('5 tháng 9, 2026 lúc 09:57', fixedNow);
    const expectedVn = new Date(2026, 8, 5, 9, 57, 0);
    expect(resVn.timestamp).toBe(expectedVn.getTime());
    expect(resVn.formatted).toBe(formatDateTime(expectedVn));

    const resEn = parseDateUnified('Friday 25 September 2026 at 15:43', fixedNow);
    const expectedEn = new Date(2026, 8, 25, 15, 43, 0);
    expect(resEn.timestamp).toBe(expectedEn.getTime());
    expect(resEn.formatted).toBe(formatDateTime(expectedEn));

    const resIso = parseDateUnified('2026-09-05 14:30:00', fixedNow);
    const expectedIso = new Date(2026, 8, 5, 14, 30, 0);
    expect(resIso.timestamp).toBe(expectedIso.getTime());
    expect(resIso.formatted).toBe(formatDateTime(expectedIso));

    const resDmy = parseDateUnified('05/09/2026', fixedNow);
    const expectedDmy = new Date(2026, 8, 5, 0, 0, 0);
    expect(resDmy.timestamp).toBe(expectedDmy.getTime());
    expect(resDmy.formatted).toBe(formatDateTime(expectedDmy));

    const resUnix = parseDateUnified('1727000000', fixedNow);
    const expectedUnix = new Date(1727000000000);
    expect(resUnix.timestamp).toBe(expectedUnix.getTime());
    expect(resUnix.formatted).toBe(formatDateTime(expectedUnix));
  });

  it('từ chối ngày không hợp lệ (không tự tràn tháng: ví dụ 31 tháng 2)', () => {
    const resInvalid = parseDateUnified('31 tháng 2', fixedNow);
    expect(resInvalid.dateObj).toBeNull();
    expect(resInvalid.timestamp).toBe(0);
    expect(resInvalid.formatted).toBe('');
  });
});
