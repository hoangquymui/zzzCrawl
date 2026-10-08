import { ProfileDomParser } from './profile-dom-parser';

describe('Nhóm 6 — date-range & scanner early stopping', () => {
  let domParser: ProfileDomParser;

  beforeEach(() => {
    // Parser không cần ScraperService thật cho kiểm tra isDateInRange
    domParser = new ProfileDomParser({} as any);
  });

  it('isDateInRange xử lý chính xác timestamp 0 khi có và không có filter', () => {
    const start = new Date('2026-09-01').getTime();

    // Có start -> timestamp 0 (không rõ ngày) phải trả về false
    expect(domParser.isDateInRange(0, start, null)).toBe(false);
    expect(domParser.isDateInRange(undefined, start, null)).toBe(false);

    // Không đặt start/end -> timestamp 0 vẫn hợp lệ (trả về true)
    expect(domParser.isDateInRange(0, null, null)).toBe(true);
    expect(domParser.isDateInRange(undefined, null, null)).toBe(true);
  });

  it('mô phỏng vòng lặp scanner: 5 bài cũ xen 1 bài không ngày vẫn dừng sớm', () => {
    const startTimestamp = new Date('2026-09-15').getTime();
    // Danh sách bài: 3 bài cũ, 1 bài không rõ ngày (ts=0), 2 bài cũ
    const posts = [
      { id: '1', timestamp: new Date('2026-09-10').getTime() }, // cũ
      { id: '2', timestamp: new Date('2026-09-09').getTime() }, // cũ
      { id: '3', timestamp: new Date('2026-09-08').getTime() }, // cũ
      { id: '4', timestamp: 0 },                                // không ngày
      { id: '5', timestamp: new Date('2026-09-07').getTime() }, // cũ
      { id: '6', timestamp: new Date('2026-09-06').getTime() }, // cũ
    ];

    let consecutiveOldPosts = 0;
    let stoppedEarly = false;
    let processedCount = 0;

    for (const post of posts) {
      processedCount++;
      const inRange = domParser.isDateInRange(post.timestamp, startTimestamp, null);
      if (!inRange) {
        if (post.timestamp && post.timestamp < startTimestamp) {
          consecutiveOldPosts++;
        }
        // Bài không có timestamp: KHÔNG reset consecutiveOldPosts
        if (consecutiveOldPosts >= 5) {
          stoppedEarly = true;
          break;
        }
        continue;
      }
      consecutiveOldPosts = 0;
    }

    expect(stoppedEarly).toBe(true);
    expect(consecutiveOldPosts).toBe(5);
    expect(processedCount).toBe(6);
  });
});
