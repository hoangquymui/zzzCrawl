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
 */
export function getDistinctiveTokens(norm: string): string[] {
  const common = new Set([
    'công', 'an', 'ninh', 'trật', 'tự',
    'phường', 'xã', 'thị', 'trấn', 'quận', 'huyện', 'thành', 'phố', 'tỉnh', 'tp',
    'đội', 'phòng', 'ban'
  ]);
  return norm.split(' ').filter((w) => w && !common.has(w));
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

    // Chỉ khớp khi cả 2 bên đều có token đặc trưng
    if (authorTokens.length > 0 && nameTokens.length > 0) {
      const setA = new Set(authorTokens);
      const setB = new Set(nameTokens);

      const isIdentical =
        authorTokens.length === nameTokens.length &&
        authorTokens.every((t) => setB.has(t));

      if (isIdentical) {
        return { matched: true, by: 'name' };
      }

      const isASubsetOfB = authorTokens.every((t) => setB.has(t));
      const isBSubsetOfA = nameTokens.every((t) => setA.has(t));
      const smallerLen = Math.min(authorTokens.length, nameTokens.length);

      // Một tập là tập con của tập kia VÀ tập nhỏ có >= 2 token đặc trưng
      if ((isASubsetOfB || isBSubsetOfA) && smallerLen >= 2) {
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
    // Nếu chưa match hoặc match trước đó chỉ dựa vào name -> cho phép tính lại để tìm match mạnh hơn (uid/url/slug)
    const resolved = resolveProfileForVideo(video, profiles);
    let matchedId = resolved.profileId || video.profileId;
    if (resolved.profileId) {
      video.profileId = resolved.profileId;
      video.profileName = resolved.profileName;
    }

    if (matchedId && profilePostMap[matchedId]) {
      profilePostMap[matchedId].push(video);
    } else {
      otherPosts.push(video);
    }
  }

  return { profilePostMap, otherPosts };
}
