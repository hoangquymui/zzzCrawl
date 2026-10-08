import { parseDateUnified } from './date-parser';

describe('Nhóm 6 — date-parser', () => {
  const fixedNow = new Date('2026-10-08T10:00:00+07:00');

  it('phân tích ngày tương đối: tuần, tháng, năm, phút, giờ', () => {
    const res2Weeks = parseDateUnified('2 tuần', fixedNow);
    expect(res2Weeks.formatted).toContain('2026-09-24');

    const res3Months = parseDateUnified('3 tháng trước', fixedNow);
    expect(res3Months.timestamp).toBeLessThan(fixedNow.getTime() - 85 * 86400 * 1000);
    expect(res3Months.timestamp).toBeGreaterThan(fixedNow.getTime() - 95 * 86400 * 1000);

    const res1Year = parseDateUnified('1 năm', fixedNow);
    expect(res1Year.timestamp).toBeLessThan(fixedNow.getTime() - 360 * 86400 * 1000);
    expect(res1Year.timestamp).toBeGreaterThan(fixedNow.getTime() - 370 * 86400 * 1000);

    const res5Min = parseDateUnified('5 phút', fixedNow);
    expect(res5Min.formatted).toContain('09:55:00');

    const res2Hour = parseDateUnified('2 giờ', fixedNow);
    expect(res2Hour.formatted).toContain('08:00:00');

    const resYesterday = parseDateUnified('hôm qua lúc 21:30', fixedNow);
    expect(resYesterday.formatted).toContain('2026-10-07 21:30:00');
  });

  it('phân tích ngày tuyệt đối tiếng Việt và tiếng Anh', () => {
    const resVn = parseDateUnified('5 tháng 9, 2026 lúc 09:57', fixedNow);
    expect(resVn.formatted).toContain('2026-09-05 09:57:00');

    const resEn = parseDateUnified('Friday 25 September 2026 at 15:43', fixedNow);
    expect(resEn.formatted).toContain('2026-09-25 15:43:00');

    const resIso = parseDateUnified('2026-09-05 14:30:00', fixedNow);
    expect(resIso.formatted).toContain('2026-09-05 14:30:00');

    const resDmy = parseDateUnified('05/09/2026', fixedNow);
    expect(resDmy.formatted).toContain('2026-09-05');

    const resUnix = parseDateUnified('1727000000', fixedNow);
    expect(resUnix.timestamp).toBe(1727000000000);
    expect(resUnix.formatted).toBeTruthy();
  });

  it('từ chối ngày không hợp lệ (không tự tràn tháng: ví dụ 31 tháng 2)', () => {
    const resInvalid = parseDateUnified('31 tháng 2', fixedNow);
    expect(resInvalid.dateObj).toBeNull();
    expect(resInvalid.timestamp).toBe(0);
    expect(resInvalid.formatted).toBe('');
  });
});
