import { UserProfileItem } from '../interfaces/profile-management.interface';
import { VideoItem } from '../../videos/interfaces/video.interface';

/**
 * Escape chuỗi đặc biệt trước khi tạo biểu thức chính quy RegExp
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Chuẩn hóa tên để đối chiếu so sánh thông minh giữa tác giả bài viết và tên profile
 */
export function normalizeNameForMatching(name: string): string {
  if (!name) return '';
  let s = name.normalize('NFC').toLowerCase().trim();
  // Loại bỏ phần đuôi pipe | ... (ví dụ: | Hue, | Hà Nội, | Facebook)
  s = s.replace(/\s*\|.*$/, '').trim();
  // Loại bỏ phần gạch ngang kèm địa danh hành chính (ví dụ: - TP Huế, - Thành phố Huế...)
  s = s.replace(/\s*-\s*(thành phố|tỉnh|tp\.?|huyện|thị xã|tt\.?|xã|quận).*$/i, '').trim();
  // Loại bỏ hậu tố on reels / trên reels
  s = s.replace(/\s+(on|trên)\s+reels.*$/i, '').trim();
  // Chuẩn hóa viết tắt thường gặp
  s = s.replace(/\bantt\b/g, 'an ninh trật tự');
  s = s.replace(/\bca\b/g, 'công an');
  // Thay thế dấu phân tách bằng khoảng trắng
  s = s.replace(/[,.:\-–—_]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Lọc lấy các từ mang tính nhận diện đặc thù (loại trừ các từ thông dụng cơ quan/hành chính)
 * 1. Tách theo cụm: gỡ "công an" và "an ninh trật tự" như một đơn vị trước khi lọc từng từ.
 * 2. Loại các từ hành chính đơn (phường, xã, thị, trấn, quận, huyện, thành, phố, tỉnh, tp, đội, phòng, ban).
 * 3. KHÔNG loại riêng lẻ các từ công, an, ninh, trật, tự.
 */
export function getDistinctiveTokens(norm: string): string[] {
  if (!norm) return [];
  let s = norm.replace(/\ban ninh trật tự\b/gi, ' ');
  s = s.replace(/\bcông an\b/gi, ' ');

  const adminWords = new Set([
    'phường', 'xã', 'thị', 'trấn', 'quận', 'huyện', 'thành', 'phố', 'tỉnh', 'tp',
    'đội', 'phòng', 'ban'
  ]);
  return s.split(' ').filter((w) => w && !adminWords.has(w));
}

/**
 * Trích xuất định danh / slug từ URL để so khớp
 */
export function extractSlugForMatching(rawUrl?: string): string {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl);
    if (u.hostname.includes('tiktok.com')) {
      const m = u.pathname.match(/@([^/?#]+)/);
      return m ? m[1].toLowerCase() : '';
    }
    const mPeople = u.pathname.match(/\/people\/[^/]+\/(\d+)/i);
    if (mPeople) return mPeople[1];
    const mP = u.pathname.match(/\/p\/[^-]+-(\d+)/i);
    if (mP) return mP[1];
    const idParam = u.searchParams.get('id');
    if (idParam && /^\d+$/.test(idParam)) return idParam;

    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length > 0) {
      const first = parts[0].toLowerCase();
      if (!['people', 'p', 'profile.php', 'watch', 'reel', 'reels', 'videos', 'story', 'share', 'groups'].includes(first)) {
        return first;
      }
    }
  } catch {}
  return '';
}

export type MatchByType = 'uid' | 'url' | 'slug' | 'name' | null;

export interface MatchProfileResult {
  matched: boolean;
  by: MatchByType;
}

/**
 * Kiểm tra xem một bài viết/video có thuộc về một profile nhất định không, kèm phương thức khớp (by)
 */
export function matchProfile(post: VideoItem, profile: UserProfileItem): MatchProfileResult {
  // 0. Phân lập nền tảng: Video TikTok chỉ khớp Profile TikTok, Video Facebook chỉ khớp Profile Facebook
  const isPostTikTok = (post.link || '').includes('tiktok.com');
  const isProfileTikTok = (profile.profileUrl || '').includes('tiktok.com');
  if (isPostTikTok !== isProfileTikTok) {
    return { matched: false, by: null };
  }

  // 1. So khớp theo UID
  if (profile.uid) {
    const pUid = String(profile.uid).trim();
    if (post.authorUid && String(post.authorUid).trim() === pUid) {
      return { matched: true, by: 'uid' };
    }
    if (isProfileTikTok) {
      // TikTok handle ngắn so khớp chính xác bằng nhau, không includes chuỗi con
      if (post.authorUid && String(post.authorUid).trim().toLowerCase() === pUid.toLowerCase()) {
        return { matched: true, by: 'uid' };
      }
    } else {
      // Facebook: chỉ so trong URL khi độ dài >= 5 và theo đúng ranh giới segment / tham số
      if (pUid.length >= 5) {
        const escapedUid = escapeRegExp(pUid);
        const uidRegex = new RegExp('(?:[/=]|\\b)' + escapedUid + '(?:[/&?#]|\\b|$)', 'i');
        if (post.authorUrl && uidRegex.test(post.authorUrl)) return { matched: true, by: 'uid' };
        if (post.link && uidRegex.test(post.link)) return { matched: true, by: 'uid' };
      }
    }
  }

  // 2. So khớp theo URL chính xác
  if (profile.profileUrl && post.authorUrl) {
    const cleanProfileUrl = profile.profileUrl.replace(/\/+$/, '').toLowerCase();
    const cleanAuthorUrl = post.authorUrl.replace(/\/+$/, '').toLowerCase();
    if (cleanProfileUrl === cleanAuthorUrl) {
      return { matched: true, by: 'url' };
    }
  }

  // 3. So khớp theo Slug hợp lệ
  const pSlug = extractSlugForMatching(profile.profileUrl);
  if (pSlug) {
    const aSlug = extractSlugForMatching(post.authorUrl);
    if (aSlug && aSlug === pSlug) {
      return { matched: true, by: 'slug' };
    }
    if (pSlug.length >= 3) {
      const escapedSlug = escapeRegExp(pSlug);
      const slugRegex = new RegExp('[/@=?&]' + escapedSlug + '(?:[/&?]|$)', 'i');
      if (post.authorUrl && slugRegex.test(post.authorUrl)) return { matched: true, by: 'slug' };
      if (post.link && slugRegex.test(post.link)) return { matched: true, by: 'slug' };
    }
  }

  // 4. So khớp thông minh theo Tên người đăng và Tên Profile (theo token)
  const normAuthor = normalizeNameForMatching(post.nguoiDang || '');
  const normName = normalizeNameForMatching(profile.name || '');

  if (normAuthor && normName) {
    // Bằng nhau hoàn toàn sau khi chuẩn hóa
    if (normAuthor === normName) {
      return { matched: true, by: 'name' };
    }

    const authorTokens = getDistinctiveTokens(normAuthor);
    const nameTokens = getDistinctiveTokens(normName);

    // Chỉ khớp khi chuỗi chuẩn hóa bằng nhau hoặc TẬP token đặc trưng giống hệt nhau (cả hai khác rỗng). Bỏ quy tắc tập con.
    if (authorTokens.length > 0 && nameTokens.length > 0) {
      const setA = new Set(authorTokens);
      const setB = new Set(nameTokens);

      const isIdentical =
        setA.size === setB.size &&
        Array.from(setA).every((t) => setB.has(t));

      if (isIdentical) {
        return { matched: true, by: 'name' };
      }
    }
  }

  return { matched: false, by: null };
}

/**
 * Kiểm tra xem một bài viết/video có thuộc về một profile nhất định không (giữ nguyên chữ ký)
 */
export function isPostMatchingProfile(post: VideoItem, profile: UserProfileItem): boolean {
  return matchProfile(post, profile).matched;
}

/**
 * Phân giải Profile tương ứng cho một bài viết/video từ danh sách hồ sơ đối tượng
 */
export function resolveProfileForVideo(
  video: VideoItem,
  profiles: UserProfileItem[]
): { profileId?: string; profileName?: string; matchedBy?: MatchByType } {
  if (!profiles || profiles.length === 0) {
    return {};
  }

  let nameCandidate: { profileId: string; profileName: string } | null = null;

  for (const profile of profiles) {
    const match = matchProfile(video, profile);
    if (match.matched) {
      if (match.by && match.by !== 'name') {
        // Ưu tiên cao nhất cho uid / url / slug
        return {
          profileId: profile.id,
          profileName: profile.name,
          matchedBy: match.by,
        };
      } else if (!nameCandidate) {
        nameCandidate = {
          profileId: profile.id,
          profileName: profile.name,
        };
      }
    }
  }

  if (nameCandidate) {
    return {
      ...nameCandidate,
      matchedBy: 'name',
    };
  }

  return {};
}

/**
 * Gom nhóm danh sách bài viết theo từng profile trên Backend
 */
export function groupVideosByProfile(
  videos: VideoItem[],
  profiles: UserProfileItem[]
): {
  profilePostMap: Record<string, VideoItem[]>;
  otherPosts: VideoItem[];
} {
  const profilePostMap: Record<string, VideoItem[]> = {};
  profiles.forEach((p) => {
    profilePostMap[p.id] = [];
  });

  const otherPosts: VideoItem[] = [];

  for (const video of videos) {
    if (video.profileMatchedBy === 'manual') {
      const matchedId = video.profileId;
      if (matchedId && profilePostMap[matchedId]) {
        profilePostMap[matchedId].push(video);
      } else {
        otherPosts.push(video);
      }
      continue;
    }

    const shouldRecompute =
      !video.profileId ||
      video.profileMatchedBy === 'name' ||
      video.profileMatchedBy === undefined;

    let matchedId = video.profileId;

    if (shouldRecompute) {
      const resolved = resolveProfileForVideo(video, profiles);
      if (resolved.profileId) {
        video.profileId = resolved.profileId;
        video.profileName = resolved.profileName;
        video.profileMatchedBy = resolved.matchedBy;
        matchedId = resolved.profileId;
      } else {
        if (video.profileMatchedBy === 'name') {
          delete video.profileId;
          delete video.profileName;
          delete video.profileMatchedBy;
          matchedId = undefined;
        }
      }
    }

    if (matchedId && profilePostMap[matchedId]) {
      profilePostMap[matchedId].push(video);
    } else {
      otherPosts.push(video);
    }
  }

  return { profilePostMap, otherPosts };
}
