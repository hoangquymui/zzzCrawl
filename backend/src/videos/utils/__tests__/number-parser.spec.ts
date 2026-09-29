import { parseNumber, parseNumberDetailed } from '../number-parser';
import * as assert from 'assert';

console.log('Testing number-parser...');

// 1. Basic numbers
assert.strictEqual(parseNumber(0), 0);
assert.strictEqual(parseNumber('0'), 0);
assert.strictEqual(parseNumber(1), 1);
assert.strictEqual(parseNumber('1'), 1);
assert.strictEqual(parseNumber(10), 10);
assert.strictEqual(parseNumber('10'), 10);
assert.strictEqual(parseNumber(999), 999);
assert.strictEqual(parseNumber('999'), 999);

// 2. K format
assert.strictEqual(parseNumber('1K'), 1000);
assert.strictEqual(parseNumber('1k'), 1000);
assert.strictEqual(parseNumber('1.2K'), 1200);
assert.strictEqual(parseNumber('1,2K'), 1200);
assert.strictEqual(parseNumber('10K'), 10000);
assert.strictEqual(parseNumber('45K'), 45000);

// 3. M format & Triệu format
assert.strictEqual(parseNumber('1M'), 1000000);
assert.strictEqual(parseNumber('1.2M'), 1200000);
assert.strictEqual(parseNumber('1,2M'), 1200000);
assert.strictEqual(parseNumber('1,2 triệu'), 1200000);
assert.strictEqual(parseNumber('2,8 triệu'), 2800000);
assert.strictEqual(parseNumber('2.8 triệu'), 2800000);
assert.strictEqual(parseNumber('1.5 tr'), 1500000);

// 4. Nghìn / Ngàn format
assert.strictEqual(parseNumber('45 nghìn'), 45000);
assert.strictEqual(parseNumber('45 ngàn'), 45000);

// 5. Thousand separators without unit (Vietnamese dot vs International comma)
assert.strictEqual(parseNumber('1.234'), 1234);
assert.strictEqual(parseNumber('1,234'), 1234);
assert.strictEqual(parseNumber('12.345'), 12345);
assert.strictEqual(parseNumber('12,345'), 12345);
assert.strictEqual(parseNumber('1.234.567'), 1234567);
assert.strictEqual(parseNumber('1,234,567'), 1234567);

// 6. Decimal numbers with thousand separator
assert.strictEqual(parseNumber('1,234.5'), 1234);
assert.strictEqual(parseNumber('1.234,5'), 1234);

// 7. Billion / Tỷ
assert.strictEqual(parseNumber('1B'), 1000000000);
assert.strictEqual(parseNumber('1,5 tỷ'), 1500000000);

// 8. Detailed results
const resNull = parseNumberDetailed(null);
assert.strictEqual(resNull.value, 0);
assert.strictEqual(resNull.found, false);

const resDash = parseNumberDetailed('-');
assert.strictEqual(resDash.value, 0);
assert.strictEqual(resDash.found, false);

const resZero = parseNumberDetailed('0');
assert.strictEqual(resZero.value, 0);
assert.strictEqual(resZero.found, true);

const res1k = parseNumberDetailed('1.2K');
assert.strictEqual(res1k.value, 1200);
assert.strictEqual(res1k.found, true);

console.log('✅ ALL NUMBER PARSER TESTS PASSED!');
