import {
  decodeHtmlEntities,
  normalizeCaption,
  isBoilerplateCaption,
  isValidAuthor,
  cleanAuthorName,
} from '../text-normalizer';
import * as assert from 'assert';

console.log('Testing text-normalizer...');

// 1. decodeHtmlEntities: Entities and unicode without losing newlines
const sampleHtml = 'D&ograve;ng 1 &amp; D&ograve;ng 2\n\nD&ograve;ng 3 &quot;tr&iacute;ch dẫn&quot;';
const decoded = decodeHtmlEntities(sampleHtml);
assert.ok(decoded.includes('\n\n'), 'Phải bảo tồn các dòng trống / xuống dòng');
assert.ok(decoded.includes('&'), 'Phải giải mã &amp;');
assert.ok(decoded.includes('"trích dẫn"'), 'Phải giải mã &quot; và unicode');

// 2. normalizeCaption: Preserves formatting and removes zero-width characters
const captionWithNewlines = 'Dòng 1    \nDòng 2\n\nDòng 3';
const normalized = normalizeCaption(captionWithNewlines);
assert.strictEqual(normalized, 'Dòng 1\nDòng 2\n\nDòng 3');

// 3. isBoilerplateCaption: Detects UI text
assert.strictEqual(isBoilerplateCaption('Video liên quan'), true);
assert.strictEqual(isBoilerplateCaption('Related videos'), true);
assert.strictEqual(isBoilerplateCaption('Xem video liên quan'), true);
assert.strictEqual(isBoilerplateCaption('Đăng nhập'), true);
assert.strictEqual(isBoilerplateCaption('Video này hiện không khả dụng'), true);
assert.strictEqual(isBoilerplateCaption('Hôm nay trời đẹp quá đi dạo phố!'), false);

// 4. isValidAuthor & cleanAuthorName: Rejects UI text as author
assert.strictEqual(isValidAuthor('Facebook'), false);
assert.strictEqual(isValidAuthor('Log in'), false);
assert.strictEqual(isValidAuthor('Đăng nhập'), false);
assert.strictEqual(isValidAuthor('Watch'), false);
assert.strictEqual(isValidAuthor('Reels'), false);
assert.strictEqual(isValidAuthor("This page isn't available"), false);
assert.strictEqual(isValidAuthor('Nguyễn Văn A'), true);

assert.strictEqual(cleanAuthorName('Nguyễn Văn A on Reels'), 'Nguyễn Văn A');
assert.strictEqual(cleanAuthorName('Trần Thị B trên Reels'), 'Trần Thị B');
assert.strictEqual(cleanAuthorName('Facebook on Reels'), '');

console.log('✅ ALL TEXT NORMALIZER TESTS PASSED!');
