/**
 * Tiện ích chuẩn hóa văn bản, giải mã HTML Entities và xác thực tác giả / caption
 * Đảm bảo:
 * 1. Không làm mất newline, paragraph, khoảng trắng có ý nghĩa của caption.
 * 2. Tách biệt giải mã HTML Entity và chuẩn hóa caption.
 * 3. Loại trừ triệt để UI text rác khỏi tác giả và caption.
 */

const INVALID_AUTHORS = [
  'facebook',
  'facebook user',
  'người dùng facebook',
  'trang này hiện không hiển thị',
  "this page isn't available",
  'this page isn’t available',
  'log in to facebook',
  'đăng nhập facebook',
  'đăng nhập',
  'log in',
  'sign up',
  'đăng ký',
  'error',
  'lỗi',
  'content not found',
  'không tìm thấy nội dung',
  'reels',
  'watch',
  'video',
  'videos',
  'xem thêm',
  'see more',
];

const BOILERPLATE_CAPTIONS = [
  'video liên quan',
  'related videos',
  'xem video liên quan',
  'xem video',
  'xem thêm trên facebook',
  'see more on facebook',
  'video này hiện không khả dụng',
  "this video isn't available now",
  "this video isn't available right now",
  'đăng nhập',
  'log in',
  'sign up',
  'facebook',
  'flame',
  'support',
  'video',
  'chia sẻ nội dung này với bạn bè',
  'send this to friends',
];

/**
 * Giải mã các ký tự mã hóa HTML (&#x...;, &amp;, &quot;,...) và escape JSON
 * KHÔNG làm mất newline hay nén whitespace
 */
export function decodeHtmlEntities(text?: string | null): string {
  if (!text) return '';
  let res = String(text)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#039;/g, "'")
    .replace(/\\r\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/');
  const htmlEntities: Record<string, string> = {
    amp: '&',
    quot: '"',
    lt: '<',
    gt: '>',
    apos: "'",
    nbsp: ' ',
    copy: '©',
    reg: '®',
    trade: '™',
    aacute: 'á',
    Aacute: 'Á',
    agrave: 'à',
    Agrave: 'À',
    atilde: 'ã',
    Atilde: 'Ã',
    acirc: 'â',
    Acirc: 'Â',
    eacute: 'é',
    Eacute: 'É',
    egrave: 'è',
    Egrave: 'È',
    ecirc: 'ê',
    Ecirc: 'Ê',
    iacute: 'í',
    Iacute: 'Í',
    igrave: 'ì',
    Igrave: 'Ì',
    oacute: 'ó',
    Oacute: 'Ó',
    ograve: 'ò',
    Ograve: 'Ò',
    otilde: 'õ',
    Otilde: 'Õ',
    ocirc: 'ô',
    Ocirc: 'Ô',
    uacute: 'ú',
    Uacute: 'Ú',
    ugrave: 'ù',
    Ugrave: 'Ù',
    yacute: 'ý',
    Yacute: 'Ý',
    ntilde: 'ñ',
    Ntilde: 'Ñ',
    ccedil: 'ç',
    Ccedil: 'Ç',
  };

  res = res.replace(/&([a-zA-Z]+);/g, (match, entity) => {
    return htmlEntities[entity] || match;
  });

  try {
    res = res.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  } catch {}

  // Xử lý surrogate pairs (emoji): \uD83D\uDE00 → 😀
  try {
    res = res.replace(
      /[\uD800-\uDBFF][\uDC00-\uDFFF]/g,
      (pair) => pair
    );
  } catch {}

  return res;
}

/**
 * Chuẩn hóa caption:
 * - Bảo tồn định dạng dòng, xuống dòng (\n) và ngắt đoạn.
 * - Loại bỏ khoảng trắng thừa ở cuối mỗi dòng.
 * - Loại bỏ các ký tự ẩn (zero-width spaces).
 */
export function normalizeCaption(text?: string | null): string {
  if (!text) return '';
  const decoded = decodeHtmlEntities(text);

  return decoded
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Xóa zero-width space
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\s*(?:\.\.\.|…)?\s*(?:See more|Xem thêm)$/i, '')
    .trim();
}

/**
 * Kiểm tra xem chuỗi caption có phải văn bản rác mặc định của hệ thống không
 */
export function isBoilerplateCaption(text?: string | null): boolean {
  if (!text) return true;
  const clean = text.trim().toLowerCase();
  if (!clean) return true;

  return BOILERPLATE_CAPTIONS.some(
    (b) => clean === b || clean.startsWith(b + ' ') || clean.endsWith(' ' + b)
  );
}

/**
 * Kiểm tra tác giả có hợp lệ hay không (không phải UI text, nút bấm, hay thông báo lỗi)
 */
export function isValidAuthor(name?: string | null): boolean {
  if (!name) return false;
  const clean = name.trim().toLowerCase();
  if (clean.length < 2) return false;

  return !INVALID_AUTHORS.some((inv) => clean === inv || clean.startsWith(inv + ' - ') || clean.startsWith(inv + ' | '));
}

/**
 * Làm sạch tên tác giả (bỏ hậu tố " on Reels", " trên Reels", v.v.)
 */
export function cleanAuthorName(name?: string | null): string {
  if (!name) return '';
  const decoded = decodeHtmlEntities(name).trim();
  const cleaned = decoded.replace(/\s+(?:on|trên)\s+reels$/i, '').trim();

  if (!isValidAuthor(cleaned)) {
    return '';
  }
  return cleaned;
}
