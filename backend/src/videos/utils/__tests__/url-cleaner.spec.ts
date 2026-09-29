import {
  sanitizeUrl,
  detectPlatform,
  detectContentType,
  isRedirectUrl,
} from '../url-cleaner';
import * as assert from 'assert';

console.log('Testing url-cleaner...');

// 1. Facebook Reel
const fbReel = 'https://www.facebook.com/reel/123456789?mibextid=wwXIfr';
assert.strictEqual(sanitizeUrl(fbReel), 'https://www.facebook.com/reel/123456789');
assert.strictEqual(detectPlatform(fbReel), 'facebook');
assert.strictEqual(detectContentType(fbReel), 'reel');

// 2. Facebook Watch
const fbWatch = 'https://www.facebook.com/watch/?v=987654321&ref=sharing';
assert.strictEqual(sanitizeUrl(fbWatch), 'https://www.facebook.com/watch/?v=987654321');
assert.strictEqual(detectPlatform(fbWatch), 'facebook');
assert.strictEqual(detectContentType(fbWatch), 'video');
assert.strictEqual(isRedirectUrl(fbWatch), true);

// 3. Facebook Video
const fbVid = 'https://www.facebook.com/somepage/videos/555444333/';
assert.strictEqual(sanitizeUrl(fbVid), 'https://www.facebook.com/somepage/videos/555444333/');
assert.strictEqual(
  sanitizeUrl('https://www.facebook.com/somepage/videos/tieu-de-slug/555444333/?mibextid=123'),
  'https://www.facebook.com/somepage/videos/555444333/'
);
assert.strictEqual(
  sanitizeUrl('https://www.facebook.com/videos/555444333/'),
  'https://www.facebook.com/watch/?v=555444333'
);
assert.strictEqual(detectContentType(fbVid), 'video');

// 4. Facebook Share / fb.watch
const fbShare = 'https://www.facebook.com/share/r/abc123xyz/';
assert.strictEqual(isRedirectUrl(fbShare), true);
assert.strictEqual(detectContentType(fbShare), 'reel');

const fbWatchShort = 'https://fb.watch/mX48g-A/';
assert.strictEqual(isRedirectUrl(fbWatchShort), true);
assert.strictEqual(detectPlatform(fbWatchShort), 'facebook');

// 5. Facebook Group Post
const fbGroup = 'https://www.facebook.com/groups/123456/posts/7891011/?source=feed';
assert.strictEqual(sanitizeUrl(fbGroup), 'https://www.facebook.com/groups/123456/posts/7891011');
assert.strictEqual(detectContentType(fbGroup), 'group_post');

// 6. Facebook Post / Permalink
const fbPost = 'https://www.facebook.com/permalink.php?story_fbid=pfbid02B2B&id=61594031320050';
assert.strictEqual(detectContentType(fbPost), 'post');

// 7. TikTok Video
const ttVid = 'https://www.tiktok.com/@creator/video/7123456789012345678?is_from_webapp=1';
assert.strictEqual(
  sanitizeUrl(ttVid),
  'https://www.tiktok.com/@creator/video/7123456789012345678'
);
assert.strictEqual(detectPlatform(ttVid), 'tiktok');
assert.strictEqual(detectContentType(ttVid), 'video');

// 8. TikTok Photo
const ttPhoto = 'https://www.tiktok.com/@creator/photo/7987654321098765432';
assert.strictEqual(detectContentType(ttPhoto), 'photo');

// 9. TikTok Shortlink
const ttShort = 'https://vt.tiktok.com/ZS2xY87B9/?k=1';
assert.strictEqual(isRedirectUrl(ttShort), true);
assert.strictEqual(detectPlatform(ttShort), 'tiktok');

// 10. Look-alike hosts must never be treated as a platform URL (cookie-safety boundary)
const fakeFacebook = 'https://facebook.com.attacker.example/reel/123';
const fakeTikTok = 'https://tiktok.com.attacker.example/@creator/video/123';
assert.strictEqual(detectPlatform(fakeFacebook), 'unknown');
assert.strictEqual(detectPlatform(fakeTikTok), 'unknown');
assert.strictEqual(isRedirectUrl(fakeFacebook), false);

console.log('✅ ALL URL CLEANER TESTS PASSED!');
