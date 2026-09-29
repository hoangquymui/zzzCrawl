import { validateScrapeResult } from '../scrape-validator';
import * as assert from 'assert';

console.log('Testing scrape-validator...');

// 1. Full valid data
const fullValid = validateScrapeResult(
  {
    nguoiDang: 'Kênh Tin Tức',
    caption: 'Bản tin nóng chiều nay',
    postId: '123456789',
    LuotXem: 15000,
    LuotLike: 350,
  },
  'facebook',
  'video'
);
assert.strictEqual(fullValid.valid, true);
assert.strictEqual(fullValid.hasAuthor, true);
assert.strictEqual(fullValid.hasPostId, true);
assert.strictEqual(fullValid.hasCaption, true);
assert.strictEqual(fullValid.hasValidMetrics, true);
assert.ok(fullValid.confidence >= 80);

// 2. Missing author
const missingAuthor = validateScrapeResult(
  {
    nguoiDang: '',
    caption: 'Video hay',
    postId: '123456789',
    LuotXem: 100,
  },
  'facebook',
  'reel'
);
assert.strictEqual(missingAuthor.valid, false);
assert.strictEqual(missingAuthor.hasAuthor, false);
assert.ok(missingAuthor.missingFields.includes('author'));

// 3. Suspect author ("Facebook" or "Log in")
const suspectAuthor = validateScrapeResult(
  {
    nguoiDang: 'Facebook',
    caption: 'Video hay',
    postId: '123456789',
    LuotXem: 100,
  },
  'facebook',
  'video'
);
assert.strictEqual(suspectAuthor.valid, false);
assert.strictEqual(suspectAuthor.isSuspect, true);

// 4. Missing metrics and postId for video
const noMetricsNoPostId = validateScrapeResult(
  {
    nguoiDang: 'Người Dùng A',
    caption: 'Một ngày làm việc vui vẻ cùng đồng nghiệp',
    postId: '',
    LuotXem: 0,
    LuotLike: 0,
  },
  'facebook',
  'video'
);
assert.strictEqual(noMetricsNoPostId.valid, false);
assert.strictEqual(noMetricsNoPostId.fallbackReason, 'facebook_video_missing_author_or_metrics');

// 5. Post Facebook without metrics but has author & caption
const validTextPost = validateScrapeResult(
  {
    nguoiDang: 'Chu Nonedde',
    caption: 'Trượt cả mầm non...',
    postId: 'pfbid02B2B',
    LuotXem: 0,
    LuotLike: 0,
  },
  'facebook',
  'post'
);
assert.strictEqual(validTextPost.valid, true);
assert.strictEqual(validTextPost.hasAuthor, true);
assert.strictEqual(validTextPost.hasCaption, true);

console.log('✅ ALL SCRAPE VALIDATOR TESTS PASSED!');
