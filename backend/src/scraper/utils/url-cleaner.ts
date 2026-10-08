/**
 * Tiện ích làm sạch URL và nhận diện Platform & Content Type
 */

export type PlatformType = 'facebook' | 'tiktok' | 'unknown';
export type ContentType = 'reel' | 'video' | 'post' | 'photo' | 'group_post' | 'unknown';

/** Only accept real platform hostnames, never a look-alike such as facebook.com.evil.test. */
export function isFacebookUrl(url: string): boolean {
  try {
    const host = new URL(url.trim().match(/^https?:\/\//i) ? url.trim() : `https://${url.trim()}`).hostname.toLowerCase();
    return host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch';
  } catch {
    return false;
  }
}

export function isTikTokUrl(url: string): boolean {
  try {
    const host = new URL(url.trim().match(/^https?:\/\//i) ? url.trim() : `https://${url.trim()}`).hostname.toLowerCase();
    return host === 'tiktok.com' || host.endsWith('.tiktok.com');
  } catch {
    return false;
  }
}

function parseUrlPath(url: string): { pathname: string; search: string; segments: string[]; host: string } {
  try {
    const parsed = new URL(url.trim().match(/^https?:\/\//i) ? url.trim() : `https://${url.trim()}`);
    const pathname = parsed.pathname.toLowerCase();
    const search = parsed.search.toLowerCase();
    const segments = pathname.split('/').filter(Boolean);
    const host = parsed.hostname.toLowerCase();
    return { pathname, search, segments, host };
  } catch {
    const clean = url.trim().toLowerCase();
    const parts = clean.split('?');
    const pathname = parts[0] || '';
    const search = parts[1] ? `?${parts[1]}` : '';
    const segments = pathname.replace(/^https?:\/\/[^/]+/, '').split('/').filter(Boolean);
    return { pathname, search, segments, host: '' };
  }
}

/**
 * Kiểm tra xem URL có phải là link rút gọn hoặc link chuyển tiếp (redirect) cần phân giải không
 */
export function isRedirectUrl(url: string): boolean {
  if (!url) return false;
  const { pathname, segments, host } = parseUrlPath(url);

  if (isFacebookUrl(url)) {
    return (
      host === 'fb.watch' ||
      host.endsWith('.fb.watch') ||
      segments[0] === 'share' ||
      pathname.includes('/l.php') ||
      segments[0] === 'watch' ||
      pathname.includes('video.php')
    );
  }

  if (isTikTokUrl(url)) {
    return (
      host === 'vt.tiktok.com' ||
      host.endsWith('.vt.tiktok.com') ||
      host === 'vm.tiktok.com' ||
      host.endsWith('.vm.tiktok.com') ||
      segments[0] === 't' ||
      segments[0] === 'v'
    );
  }

  return false;
}

/**
 * Nhận diện nền tảng (Facebook, TikTok hoặc Unknown)
 */
export function detectPlatform(url: string): PlatformType {
  if (!url) return 'unknown';
  const u = url.trim().toLowerCase();
  if (isFacebookUrl(u)) {
    return 'facebook';
  }
  if (isTikTokUrl(u)) {
    return 'tiktok';
  }
  return 'unknown';
}

/**
 * Nhận diện loại nội dung (Reel, Video, Post, Photo, Group Post, Unknown)
 */
export function detectContentType(url: string): ContentType {
  if (!url) return 'unknown';
  const { pathname, search, segments } = parseUrlPath(url);

  // 1. TikTok
  if (isTikTokUrl(url)) {
    if (segments.includes('photo')) return 'photo';
    if (segments.includes('video')) return 'video';
    return 'video'; // Default TikTok
  }

  // 2. Facebook
  if (
    segments.includes('reel') ||
    segments.includes('reels') ||
    (segments[0] === 'share' && segments[1] === 'r')
  ) {
    return 'reel';
  }
  if (
    segments[0] === 'watch' ||
    segments.includes('videos') ||
    pathname.includes('video.php') ||
    (segments[0] === 'share' && segments[1] === 'v')
  ) {
    return 'video';
  }
  if (
    segments.includes('photo') ||
    segments.includes('photos') ||
    pathname.includes('photo.php') ||
    (segments[0] === 'share' && segments[1] === 'p')
  ) {
    return 'photo';
  }
  if (segments.includes('groups')) {
    return 'group_post';
  }
  if (
    segments.includes('posts') ||
    pathname.includes('permalink.php') ||
    pathname.includes('story.php') ||
    (pathname.includes('profile.php') && (search.includes('story_fbid=') || search.includes('fbid=')))
  ) {
    return 'post';
  }

  return 'unknown';
}

/**
 * Chuẩn hóa URL Facebook: giải mã các ký tự unicode escape như \u0025 hoặc /u0025 về ký tự chuẩn %
 */
export function normalizeFacebookUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let s = rawUrl.trim();
  // 1. Giải mã dấu gạch chéo bị escape: \/ -> /
  s = s.replace(/\\+\//g, '/');
  // 2. Giải mã các chuỗi unicode escape dạng \u0025 hoặc \\u0025
  s = s.replace(/\\+u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
  // 3. Xử lý trường hợp chuỗi bị dính /u0025 hoặc u0025 do lỗi encode/decode trước đó
  s = s.replace(/[\/\\]u0025([0-9a-fA-F]{2})/gi, (_, hex) => '%' + hex);
  s = s.replace(/u0025([0-9a-fA-F]{2})/gi, (_, hex) => '%' + hex);
  // 4. Nếu là URL dạng /people/... kết thúc bằng UID số, đảm bảo có dấu gạch chéo ở cuối
  if (/\/people\/[^/]+\/\d+$/i.test(s)) {
    s += '/';
  }
  return s;
}

/**
 * Làm sạch link: Chuẩn hóa giao thức, tên miền và cắt bỏ các tham số rác sau dấu '?'
 */
export function sanitizeUrl(url: string): string {
  if (!url) return '';
  let clean = normalizeFacebookUrl(url);

  // 1. Nếu link là wrapper redirect Facebook (l.facebook.com/l.php?u=... hoặc lm.facebook.com/l.php?u=...)
  if (clean.includes('facebook.com/l.php?') || clean.includes('/l.php?u=')) {
    try {
      const uObj = new URL(clean.startsWith('http') ? clean : 'https://' + clean);
      const targetParam = uObj.searchParams.get('u');
      if (targetParam) {
        clean = decodeURIComponent(targetParam);
      }
    } catch {}
  }

  // 2. Thêm giao thức https:// nếu người dùng dán link dạng domain/...
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = 'https://' + clean;
  }

  // 3. Chuẩn hóa tên miền phụ Facebook về www.facebook.com
  clean = clean.replace(
    /^https?:\/\/(?:web|m|touch|x|mbasic)\.facebook\.com/i,
    'https://www.facebook.com'
  );

  // 4. Xử lý các link TikTok
  if (isTikTokUrl(clean)) {
    // 4a. Mobile URL: https://m.tiktok.com/v/123456789.html -> https://www.tiktok.com/video/123456789
    const mMobileTt = clean.match(/(?:m\.)?tiktok\.com\/v\/(\d+)\.html/i);
    if (mMobileTt) {
      return `https://www.tiktok.com/video/${mMobileTt[1]}`;
    }

    // 4b. Embed URL: https://www.tiktok.com/embed/v2/123456789 -> https://www.tiktok.com/video/123456789
    const mEmbedTt = clean.match(/tiktok\.com\/embed\/v\d+\/(\d+)/i);
    if (mEmbedTt) {
      return `https://www.tiktok.com/video/${mEmbedTt[1]}`;
    }

    // 4c. Dạng chuẩn @username/video/123456 hoặc @username/photo/123456
    const mStandardTt = clean.match(/tiktok\.com\/(@[^/?#]+)\/(video|photo)\/(\d+)/i);
    if (mStandardTt) {
      return `https://www.tiktok.com/${mStandardTt[1]}/${mStandardTt[2].toLowerCase()}/${mStandardTt[3]}`;
    }

    // 4d. Các shortlink như vt.tiktok.com/ZS... hoặc vm.tiktok.com/ZS... hoặc tiktok.com/t/ZT...
    return clean.split('?')[0].split('#')[0].replace(/\/+$/, '');
  }

  // 5. Xử lý các link Facebook
  if (isFacebookUrl(clean)) {
    // 5a. Dạng Facebook Reel: /reel/123..., /reels/123..., /reel/?v=123..., /reel/pfbid...
    const mReel = clean.match(/\/reels?\/([a-zA-Z0-9_-]+)/i);
    if (mReel && mReel[1] !== 'watch' && mReel[1] !== 'videos') {
      return `https://www.facebook.com/reel/${mReel[1]}`;
    }
    if (clean.includes('/reel/') || clean.includes('/reels/')) {
      try {
        const u = new URL(clean);
        const v = u.searchParams.get('v') || u.searchParams.get('video_id');
        if (v) return `https://www.facebook.com/reel/${v}`;
      } catch {}
    }

    // 5b. Dạng Facebook Watch hoặc Video: https://www.facebook.com/watch/?v=123... hoặc video.php?v=123...
    if (clean.includes('/watch') || clean.includes('video.php')) {
      try {
        const u = new URL(clean);
        const v = u.searchParams.get('v') || u.searchParams.get('video_id');
        if (v) return `https://www.facebook.com/watch/?v=${v}`;
      } catch {}
    }

    // 5c. Dạng Video trên Page/User: /[username]/videos/[slug]/[id]/ hoặc /[username]/videos/[id]/
    const mUserVideos = clean.match(
      /^https?:\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]+)\/videos\/(?:[^/?#]+\/)*(\d+)/i
    );
    if (
      mUserVideos &&
      !['watch', 'reel', 'reels', 'videos', 'story', 'share', 'groups', 'people', 'profile.php'].includes(
        mUserVideos[1].toLowerCase()
      )
    ) {
      return `https://www.facebook.com/${mUserVideos[1]}/videos/${mUserVideos[2]}/`;
    }

    const mVideos = clean.match(/\/videos\/(?:[^/?#]+\/)*(\d+)/i);
    if (mVideos) {
      return `https://www.facebook.com/watch/?v=${mVideos[1]}`;
    }

    // 5d. Dạng Group Posts / Permalinks: /groups/[id]/posts/[postId] hoặc /groups/[id]/permalink/[postId]
    const mGroupPosts = clean.match(
      /^https?:\/\/(?:www\.)?facebook\.com\/groups\/([^/?#]+)\/(?:posts|permalink)\/(?:[^/?#]+\/)*([a-zA-Z0-9_-]+)/i
    );
    if (mGroupPosts) {
      return `https://www.facebook.com/groups/${mGroupPosts[1]}/posts/${mGroupPosts[2]}`;
    }

    // 5e. Dạng User / Page Posts: /[username]/posts/([slug]/)*([id])
    const mPosts = clean.match(
      /^https?:\/\/(?:www\.)?facebook\.com\/([^/?#]+)\/posts\/(?:[^/?#]+\/)*([a-zA-Z0-9_-]+)/i
    );
    if (mPosts) {
      return `https://www.facebook.com/${mPosts[1]}/posts/${mPosts[2]}`;
    }

    // 5f. Dạng permalink.php / story.php / profile.php?story_fbid=...
    if (
      clean.includes('permalink.php') ||
      clean.includes('story.php') ||
      (clean.includes('profile.php') && (clean.includes('story_fbid=') || clean.includes('fbid=')))
    ) {
      try {
        const u = new URL(clean);
        const storyFbid = u.searchParams.get('story_fbid') || u.searchParams.get('fbid');
        const id = u.searchParams.get('id');
        if (storyFbid && id) {
          return `https://www.facebook.com/permalink.php?story_fbid=${storyFbid}&id=${id}`;
        }
        if (storyFbid) {
          return `https://www.facebook.com/permalink.php?story_fbid=${storyFbid}`;
        }
      } catch {}
    }

    // 5g. Dạng photo / photo.php
    if (clean.includes('/photo/') || clean.includes('/photo?') || clean.includes('photo.php')) {
      try {
        const u = new URL(clean);
        const keep: string[] = [];
        const fbid = u.searchParams.get('fbid');
        const set = u.searchParams.get('set');
        const id = u.searchParams.get('id');
        if (fbid) keep.push(`fbid=${fbid}`);
        if (set) keep.push(`set=${encodeURIComponent(set)}`);
        if (id) keep.push(`id=${id}`);
        if (keep.length > 0) {
          return `${u.origin}${u.pathname}?${keep.join('&')}`;
        }
        return clean.split('?')[0];
      } catch {}
    }

    // 5h. Dạng share link: /share/r/, /share/v/, /share/p/, /share/
    if (clean.includes('/share/')) {
      return clean.split('?')[0].split('#')[0].replace(/\/+$/, '');
    }

    // 5i. Dạng fb.watch short link
    if (clean.includes('fb.watch')) {
      return clean.split('?')[0].split('#')[0].replace(/\/+$/, '');
    }
  }

  // Cắt bỏ query params dư thừa cho các link Facebook còn lại (giữ pathname sạch)
  if (isFacebookUrl(clean)) {
    try {
      const u = new URL(clean);
      if (
        !u.pathname.includes('permalink.php') &&
        !u.pathname.includes('profile.php') &&
        !u.pathname.includes('photo')
      ) {
        const cleanPath = u.pathname.includes('/people/')
          ? (u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`)
          : u.pathname.replace(/\/+$/, '');
        return `${u.origin}${cleanPath}`;
      }
    } catch {}
  }

  return clean;
}
