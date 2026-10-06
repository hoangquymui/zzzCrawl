import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
import { ScannedPostItem } from '../interfaces/profile-scanner.interface';
import { ScraperService } from '../../scraper/scraper.service';

@Injectable()
export class ProfileDomParser {
  private readonly logger = new Logger(ProfileDomParser.name);

  constructor(private readonly scraperService: ScraperService) {}

  public extractProfileId(profileUrl: string): string | null {
    try {
      const parsed = new URL(profileUrl);
      const id = parsed.searchParams.get('id');
      return id && /^\d+$/.test(id) ? id : null;
    } catch {
      const match = profileUrl.match(/[?&]id=(\d+)/);
      return match ? match[1] : null;
    }
  }

  public getTimelineUrl(profileUrl: string): string {
    let cleanUrl = profileUrl.trim().replace(/\/+$/, '');
    if (cleanUrl.includes('facebook.com/l.php?')) {
      try {
        const u = new URL(cleanUrl);
        const target = u.searchParams.get('u');
        if (target) cleanUrl = decodeURIComponent(target);
      } catch {}
    }
    if (cleanUrl.includes('sk=timeline')) {
      return cleanUrl;
    }
    if (cleanUrl.includes('profile.php')) {
      try {
        const u = new URL(cleanUrl);
        const id = u.searchParams.get('id');
        if (id) {
          return `${u.origin}/profile.php?id=${id}&sk=timeline`;
        }
      } catch {}
      return cleanUrl.includes('?') ? `${cleanUrl}&sk=timeline` : `${cleanUrl}?sk=timeline`;
    }

    try {
      const u = new URL(cleanUrl);
      return `${u.origin}${u.pathname.replace(/\/+$/, '')}/?sk=timeline`;
    } catch {
      return `${cleanUrl}/?sk=timeline`;
    }
  }

  public async fetchProfileReelsViews(
    page: Page,
    profileUrl: string
  ): Promise<{
    viewsMap: Record<string, string>;
    reels: Array<{ videoId: string; reelUrl: string; viewsCount: string }>;
  }> {
    let reelsUrl = profileUrl.trim().replace(/\/+$/, '');
    if (reelsUrl.includes('profile.php')) {
      try {
        const u = new URL(reelsUrl);
        const id = u.searchParams.get('id');
        if (id) {
          reelsUrl = `${u.origin}/profile.php?id=${id}&sk=reels_tab`;
        } else {
          reelsUrl = `${reelsUrl}&sk=reels_tab`;
        }
      } catch {
        reelsUrl = `${reelsUrl}&sk=reels_tab`;
      }
    } else {
      try {
        const u = new URL(reelsUrl);
        reelsUrl = `${u.origin}${u.pathname.replace(/\/+$/, '')}/reels`;
      } catch {
        reelsUrl = `${reelsUrl}/reels`;
      }
    }

    try {
      await page.goto(reelsUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('a[href*="/reel/"]', { timeout: 5000 }).catch(() => null);
      await page.waitForTimeout(400);

      return await page.evaluate(() => {
        const viewsMap: Record<string, string> = {};
        const reels: Array<{ videoId: string; reelUrl: string; viewsCount: string }> = [];
        const links = Array.from(document.querySelectorAll('a[href*="/reel/"]'));
        const seenVids = new Set<string>();

        for (const a of links) {
          const href = (a as HTMLAnchorElement).href || '';
          const m = href.match(/reel\/(\d+)/);
          if (!m) continue;
          const videoId = m[1];
          if (seenVids.has(videoId)) continue;
          seenVids.add(videoId);

          let countText = (a as HTMLElement).innerText.trim();
          if (!countText && a.parentElement) {
            countText = a.parentElement.innerText.trim();
          }
          let viewsCount = '-';
          const mCount = countText.match(/(\d+([,.]\d+)?\s*[kmb]?)/i);
          if (mCount) {
            viewsCount = mCount[1].toUpperCase();
          } else if (countText && countText !== 'Reels') {
            viewsCount = countText;
          }
          viewsMap[videoId] = viewsCount;
          reels.push({
            videoId,
            reelUrl: `https://www.facebook.com/reel/${videoId}/`,
            viewsCount,
          });
        }
        return { viewsMap, reels };
      });
    } catch {
      return { viewsMap: {}, reels: [] };
    }
  }

  public async buildReelItemFromHttp(
    reelUrl: string,
    videoId: string,
    viewsCount: string,
    profileAuthorDefault?: string
  ): Promise<ScannedPostItem | null> {
    try {
      const http = await this.scraperService.scrapeFacebookHttp(reelUrl, 1);
      if (!(http.caption || http.LuotXem > 0 || http.LuotLike > 0)) return null;

      return {
        id: `reel_${videoId}`,
        videoId,
        isShared: false,
        hasVideo: true,
        loai: 'Video',
        postUrl: reelUrl,
        videoUrl: reelUrl,
        reelUrl,
        videoPoster: '',
        author: http.nguoiDang || profileAuthorDefault || 'Người dùng Facebook',
        postType: 'FB Reel',
        date: http.ngayDang || 'Gần đây',
        timestamp: 0,
        textPreview: (http.caption || '(FB Reel)').replace(/\s+\d+\s*$/, '').trim(),
        viewsCount:
          viewsCount && viewsCount !== '-'
            ? viewsCount
            : http.LuotXem > 0
              ? String(http.LuotXem)
              : '-',
        likesCount: http.LuotLike > 0 ? String(http.LuotLike) : '0',
        commentsCount: http.LuotComment > 0 ? String(http.LuotComment) : '0',
        sharesCount: http.SoLuongNguoiShare > 0 ? String(http.SoLuongNguoiShare) : '0',
      };
    } catch {
      return null;
    }
  }

  public async extractReelDetails(
    page: Page,
    reelUrl: string,
    videoId: string,
    viewsCount: string,
    profileAuthorDefault?: string
  ): Promise<ScannedPostItem | null> {
    try {
      await page.goto(reelUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('div[role="article"]', { timeout: 5000 }).catch(() => null);
      await page.waitForTimeout(400);

      return await page.evaluate(
        (args: {
          videoId: string;
          reelUrl: string;
          viewsCount: string;
          profileAuthorDefault?: string;
        }) => {
          const { videoId, reelUrl, viewsCount, profileAuthorDefault } = args;

          function norm(str: string) {
            if (!str) return '';
            return str.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
          }

          const mainContainer = document.querySelector('[role="main"]') || document.body;
          const fullText = (mainContainer as HTMLElement).innerText || document.body.innerText || '';

          // 1. Author
          let author = (profileAuthorDefault || '').trim();
          if (!author) {
            const authorLink = Array.from(document.querySelectorAll('a[href]')).find((a) => {
              const h = (a as HTMLAnchorElement).href || '';
              const clone = (a as HTMLElement).cloneNode(true) as HTMLElement;
              clone.querySelectorAll('img, svg, i, [aria-hidden="true"]').forEach((x) => x.remove());
              const t = (clone.innerText || clone.textContent || '').trim();
              return (
                (h.includes('sk=reels_tab') ||
                  h.includes('/people/') ||
                  (h.includes('/profile.php') && !h.includes('login'))) &&
                t.length >= 2 &&
                t.length <= 120 &&
                !/đăng nhập|login|facebook|reels|bình luận|chia sẻ/i.test(t)
              );
            });
            if (authorLink) {
              const clone = (authorLink as HTMLElement).cloneNode(true) as HTMLElement;
              clone.querySelectorAll('img, svg, i, [aria-hidden="true"]').forEach((x) => x.remove());
              author = (clone.innerText || clone.textContent || '').trim();
            }
          }
          if (!author || /đăng nhập|login|facebook/i.test(author)) {
            author = profileAuthorDefault || 'Người dùng Facebook';
          }

          // 2. Caption
          function isNoiseLine(str: string) {
            const s = str.trim();
            const low = s.toLowerCase();
            if (/^\d+([,.]\d+)?\s*[kmb]?$/i.test(low)) return true;
            if (/^\d+:\d+(\s*\/\s*\d+:\d+)?$/.test(low)) return true;
            if (/^(công khai|public|bạn bè|friends|chỉ mình tôi|only me|theo dõi|follow|đã theo dõi|following)$/i.test(low)) return true;
            if (/^(thích|like|bình luận|comment|chia sẻ|share|gửi|send)$/i.test(low)) return true;
            if (/^\d+\s*(giây|phút|giờ|ngày|tuần|tháng|năm|s|m|h|d|w|y)(\s*·)?$/i.test(low)) return true;
            if (/^·$/.test(low)) return true;
            if (/^(find friends|tìm bạn bè|number of unread notifications|thông báo|notifications|messenger|tin nhắn|hộp thư|trang chủ|home|watch|marketplace|groups|nhóm|gaming|facebook|meta)$/i.test(low)) return true;
            if (/^(xem thêm|see more|thu gọn|see less|bài viết|posts?|chọn ngôn ngữ|language|tùy chọn tài khoản|cài đặt|quyền riêng tư|privacy|settings|help|trợ giúp)$/i.test(low)) return true;
            return false;
          }

          let metaDesc = '';
          const metaEl = document.querySelector('meta[property="og:description"], meta[name="description"]');
          if (metaEl) {
            metaDesc = (metaEl.getAttribute('content') || '').trim();
          }

          const lines = fullText
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);

          let textPreview = '';
          if (
            metaDesc &&
            metaDesc.length > 3 &&
            !/^(đăng nhập|login|facebook|bạn có thích video này|xem thêm)$/i.test(metaDesc.toLowerCase()) &&
            !metaDesc.toLowerCase().includes('number of unread notifications') &&
            !metaDesc.toLowerCase().startsWith('video')
          ) {
            textPreview = metaDesc;
          } else {
            const candidateLines: string[] = [];
            let startCollecting = false;
            for (const line of lines) {
              const low = line.toLowerCase();
              if (/^(đăng nhập|login|bạn quên tài khoản|quên mật khẩu|tạo tài khoản)/i.test(low)) {
                break;
              }
              if (author && (line === author || low.includes(author.toLowerCase()))) {
                startCollecting = true;
                continue;
              }
              if (
                /^(công khai|reels?|xem thêm|email|mật khẩu|tất cả cảm xúc)/i.test(low) ||
                isNoiseLine(line)
              ) {
                continue;
              }
              if (startCollecting && line.length > 2) {
                candidateLines.push(line);
              }
            }
            textPreview = candidateLines.slice(0, 3).join(' ');
          }
          if (!textPreview) {
            const good = lines.filter((l) => l.length > 5 && !isNoiseLine(l) && !l.includes(author));
            textPreview = good.slice(0, 2).join(' ') || '(FB Reel)';
          }

          // 3. Reactions, Comments, Shares
          let likes = '0';
          let comments = '0';
          let shares = '0';

          const remaining = lines.filter((l) => !l.includes(author) && l !== textPreview);
          const nums = remaining.filter((l) => /^\d+([,.]\d+)?\s*[kmb]?$/i.test(l));

          for (let i = 0; i < remaining.length; i++) {
            const line = remaining[i];
            const next = remaining[i + 1] || '';
            const prev = remaining[i - 1] || '';

            const isNextNum = /^\d+([,.]\d+)?\s*[kmb]?$/i.test(next);
            const isPrevNum = /^\d+([,.]\d+)?\s*[kmb]?$/i.test(prev);

            const label = line.toLowerCase();
            if (/thích|like|react|cảm xúc/i.test(label)) {
              if (isNextNum && likes === '0') likes = next;
              else if (isPrevNum && likes === '0') likes = prev;
            }
            if (/bình luận|comment/i.test(label)) {
              if (isNextNum && comments === '0') comments = next;
              else if (isPrevNum && comments === '0') comments = prev;
            }
            if (/chia sẻ|share/i.test(label)) {
              if (isNextNum && shares === '0') shares = next;
              else if (isPrevNum && shares === '0') shares = prev;
            }
          }

          if (likes === '0' && comments === '0' && shares === '0') {
            const actionElements = Array.from(
              document.querySelectorAll('[aria-label], [role="button"]')
            );
            for (const el of actionElements) {
              const aria = (el.getAttribute('aria-label') || '').toLowerCase();
              const text = (el as HTMLElement).innerText || '';
              const m = (aria + ' ' + text).match(/(\d+([,.]\d+)?\s*[kmb]?)/i);
              if (m) {
                if (likes === '0' && /thích|like|react|cảm xúc/i.test(aria)) {
                  likes = m[1].toUpperCase();
                } else if (comments === '0' && /bình luận|comment/i.test(aria)) {
                  comments = m[1].toUpperCase();
                } else if (shares === '0' && /chia sẻ|share/i.test(aria)) {
                  shares = m[1].toUpperCase();
                }
              }
            }
          }

          if (likes === '0' && nums.length > 0) likes = nums[0];
          if (comments === '0' && nums.length > 1) comments = nums[1];
          if (shares === '0' && nums.length > 2) shares = nums[2];

          // 4. Date
          let date = 'Gần đây';
          let timestamp = 0;

          const dateAnchors = Array.from(document.querySelectorAll('a[href]'));
          for (const a of dateAnchors) {
            const href = (a as HTMLAnchorElement).href || '';
            const t = (a as HTMLElement).innerText.trim();
            const aria = a.getAttribute('aria-label') || '';
            if (
              (href.includes('/reel/') || href.includes('/videos/') || href.includes('fbid=')) &&
              (/\d|vừa|just/i.test(aria) && !aria.includes('lượt xem') && !aria.includes('views'))
            ) {
              date = aria;
              break;
            }
            if (
              (href.includes('/reel/') || href.includes('/videos/')) &&
              t &&
              t.length <= 30 &&
              /\d|vừa|just/i.test(t) &&
              !t.includes('lượt xem') &&
              !t.includes('views')
            ) {
              date = t;
              break;
            }
          }

          return {
            id: `reel_${videoId}`,
            videoId,
            isShared: false,
            hasVideo: true,
            loai: 'Video',
            postUrl: reelUrl,
            videoUrl: reelUrl,
            reelUrl,
            videoPoster: '',
            author,
            postType: 'FB Reel',
            date,
            timestamp,
            textPreview,
            likesCount: likes,
            commentsCount: comments,
            sharesCount: shares,
            viewsCount: viewsCount || '-',
          };
        },
        { videoId, reelUrl, viewsCount, profileAuthorDefault }
      );
    } catch {
      return null;
    }
  }

  public async extractTimelineLinksAndTypes(
    page: Page
  ): Promise<Array<{ url: string; loai: string; hasImage: boolean; hasVideo: boolean; isShared: boolean }>> {
    try {
      return await page.evaluate(() => {
        const results: Array<{ url: string; loai: string; hasImage: boolean; hasVideo: boolean; isShared: boolean }> = [];
        const seenUrls = new Set<string>();

        function cleanFbUrl(href: string): { url: string; loai: string } | null {
          if (!href) return null;
          let h = href.trim();
          if (h.startsWith('/')) {
            h = 'https://www.facebook.com' + h;
          }
          if (!h.includes('facebook.com')) return null;

          if (
            h.includes('/login') ||
            h.includes('/sharer.php') ||
            h.includes('/recover/') ||
            h.includes('/messages/') ||
            h.includes('/friends') ||
            h.includes('/notifications') ||
            h.includes('/about/') ||
            h.includes('/privacy') ||
            h.includes('/hashtag/') ||
            h.includes('/p/') ||
            h.includes('/people/') ||
            h.includes('comment_id=') ||
            h.includes('help.facebook.com') ||
            (h.includes('profile.php') && !h.includes('story_fbid=') && !h.includes('fbid='))
          ) {
            return null;
          }

          if (h.includes('/reel/') || h.includes('/reels/')) {
            const m = h.match(/\/reels?\/([a-zA-Z0-9_-]+)/);
            if (m && m[1] !== 'watch' && m[1] !== 'videos') {
              return { url: `https://www.facebook.com/reel/${m[1]}`, loai: 'Video' };
            }
          }

          if (h.includes('/videos/') || h.includes('/watch')) {
            const mUserVid =
              h.match(/facebook\.com\/([a-zA-Z0-9._-]+)\/videos\/(?:[^/?#]+\/)*(\d+)/i) ||
              h.match(/^\/([a-zA-Z0-9._-]+)\/videos\/(?:[^/?#]+\/)*(\d+)/i);
            if (
              mUserVid &&
              !['watch', 'reel', 'reels', 'videos', 'story', 'share', 'groups', 'people', 'profile.php'].includes(
                mUserVid[1].toLowerCase()
              )
            ) {
              return { url: `https://www.facebook.com/${mUserVid[1]}/videos/${mUserVid[2]}/`, loai: 'Video' };
            }
            const mV = h.match(/(?:videos\/|\?v=)(\d+)/);
            if (mV) {
              return { url: `https://www.facebook.com/watch/?v=${mV[1]}`, loai: 'Video' };
            }
            return { url: h.split('?')[0].split('#')[0], loai: 'Video' };
          }

          if (h.includes('/posts/')) {
            const m = h.match(/\/posts\/([a-zA-Z0-9_-]+)/);
            if (m) {
              const base = h.split('?')[0].split('#')[0];
              return { url: base, loai: 'Bài viết' };
            }
          }

          if (h.includes('permalink.php') || h.includes('story.php')) {
            try {
              const u = new URL(h);
              const sf = u.searchParams.get('story_fbid') || u.searchParams.get('fbid');
              const id = u.searchParams.get('id');
              if (sf && id) {
                return {
                  url: `https://www.facebook.com/permalink.php?story_fbid=${sf}&id=${id}`,
                  loai: 'Bài viết',
                };
              }
              if (sf) {
                return {
                  url: `https://www.facebook.com/permalink.php?story_fbid=${sf}`,
                  loai: 'Bài viết',
                };
              }
            } catch {}
          }

          if (h.includes('set=pcb.')) {
            const mPcb = h.match(/set=pcb\.(\d+)/);
            if (mPcb) {
              return {
                url: `https://www.facebook.com/permalink.php?story_fbid=${mPcb[1]}`,
                loai: 'Hình ảnh',
              };
            }
          }
          if (h.includes('/photo') || h.includes('photo.php')) {
            if (h.includes('set=a.') || h.includes('set=pb.')) {
              return null;
            }
            const mFbid = h.match(/fbid=(\d+)/);
            if (mFbid) {
              return {
                url: `https://www.facebook.com/permalink.php?story_fbid=${mFbid[1]}`,
                loai: 'Hình ảnh',
              };
            }
          }

          return null;
        }

        let articles = Array.from(document.querySelectorAll('div[role="article"]')).filter((a) => {
          const aria = (a.getAttribute('aria-label') || '').toLowerCase();
          return !aria.includes('comment') && !aria.includes('bình luận');
        });
        if (articles.length === 0) {
          articles = Array.from(
            document.querySelectorAll('div[data-pagelet*="FeedUnit_"], div[data-pagelet*="ProfileTimeline"]')
          );
        }
        if (articles.length === 0) {
          const actionBtns = Array.from(
            document.querySelectorAll(
              'div[aria-label*="Actions for this post" i], div[aria-label*="Hành động với bài viết" i], div[aria-label*="Thao tác với bài viết" i], div[aria-label*="Tùy chọn bài viết" i]'
            )
          );
          articles = actionBtns
            .map((btn) => {
              let p: HTMLElement | null = btn as HTMLElement;
              for (let k = 0; k < 12 && p && p.parentElement && p.parentElement !== document.body; k++) {
                if (
                  p.getAttribute('data-pagelet') ||
                  (p.className && (p.className.includes('x1yztbdb') || p.className.includes('x1a2a7pz')))
                ) {
                  break;
                }
                p = p.parentElement;
              }
              return p;
            })
            .filter(Boolean) as HTMLElement[];
        }

        for (const art of articles) {
          const articleText = (art as HTMLElement).innerText || '';
          const isShared = /(?:đã chia sẻ (?:một )?(?:bài viết|video|thước phim|ảnh|liên kết)|shared\s+(?:a\s+)?(?:post|video|reel|link|photo)|shared post from)/i.test(articleText.slice(0, 500));
          const hasVideoTag = Boolean(
            art.querySelector('video') ||
            art.querySelector('div[data-video-id]') ||
            art.querySelector('a[href*="/reel/"], a[href*="/reels/"], a[href*="/watch"], a[href*="/videos/"]')
          );

          const photoAnchors = Array.from(
            art.querySelectorAll('a[href*="/photo/"], a[href*="/photo?"], a[href*="photo.php"], a[href*="set=pcb."]')
          );
          const hasImageTag = photoAnchors.some((a) => {
            const href = a.getAttribute('href') || '';
            if (href.includes('set=a.') || href.includes('set=pb.')) return false;
            const img = a.querySelector('img');
            if (img) {
              const rect = img.getBoundingClientRect();
              const w = rect.width || img.naturalWidth || img.width || 0;
              const h = rect.height || img.naturalHeight || img.height || 0;
              if (w > 0 && w <= 60 && h > 0 && h <= 60) return false;
              if (w >= 80 || h >= 80) return true;
            }
            if (href.includes('set=pcb.')) return true;
            return false;
          });
          const anchors = Array.from(art.querySelectorAll('a[href]')) as HTMLAnchorElement[];

          const timeAnchor = anchors.find((a) => {
            const aria = a.getAttribute('aria-label') || '';
            const t = a.innerText.trim();
            const hasTimeMarker =
              /\d|vừa|just|hôm qua|yesterday/i.test(aria) ||
              (t.length <= 30 && /\d|vừa|just|hôm qua|yesterday/i.test(t));
            return hasTimeMarker && !(a.href.includes('profile.php?id=') && !a.href.includes('story_fbid=') && !a.href.includes('fbid='));
          });

          let chosenItem: { url: string; loai: string } | null = null;
          if (timeAnchor) {
            chosenItem = cleanFbUrl(timeAnchor.href);
          }

          if (!chosenItem) {
            for (const a of anchors) {
              const item = cleanFbUrl(a.href);
              if (item) {
                chosenItem = item;
                break;
              }
            }
          }

          if (chosenItem && !seenUrls.has(chosenItem.url)) {
            seenUrls.add(chosenItem.url);
            results.push({
              url: chosenItem.url,
              loai: isShared ? 'Chia sẻ' : (chosenItem.loai ? chosenItem.loai : (hasVideoTag ? 'Video' : hasImageTag ? 'Hình ảnh' : 'Bài viết')),
              hasImage: hasImageTag,
              hasVideo: hasVideoTag,
              isShared,
            });
          }
        }

        return results;
      });
    } catch {
      return [];
    }
  }

  public extractStoriesFromObject(obj: any, results: any[] = []): any[] {
    if (!obj || typeof obj !== 'object') return results;

    const rawUrlCandidate = obj.permalink_url || obj.wwwURL || obj.url;
    let urlCandidate = '';
    if (rawUrlCandidate && typeof rawUrlCandidate === 'string') {
      urlCandidate = rawUrlCandidate;
    } else if (obj.story_fbid && obj.actors?.[0]?.id) {
      urlCandidate = `https://www.facebook.com/permalink.php?story_fbid=${obj.story_fbid}&id=${obj.actors[0].id}`;
    }

    if (urlCandidate) {
      const pUrl = String(urlCandidate).replace(/\\\//g, '/');
      if (!this.isPostPermalink(pUrl)) {
        for (const k of Object.keys(obj)) {
          this.extractStoriesFromObject(obj[k], results);
        }
        return results;
      }
      const msg =
        obj.message?.text ||
        obj.comet_sections?.content?.story?.message?.text ||
        '';
      const author = obj.actors?.[0]?.name || '';
      const authorId = obj.actors?.[0]?.id || '';

      let attachedReelUrl = '';
      let attachedVideoId = '';
      let attachedAuthor = '';
      const attached =
        obj.attached_story ||
        obj.comet_sections?.attached_story ||
        obj.comet_sections?.content?.story?.attached_story;
      if (attached) {
        if (attached.permalink_url) {
          attachedReelUrl = String(attached.permalink_url).replace(/\\\//g, '/');
          const mId = attachedReelUrl.match(/(?:reel\/|videos\/|\?v=)(\d+)/);
          if (mId) attachedVideoId = mId[1];
        }
        if (!attachedVideoId && attached.attachments) {
          const att = attached.attachments[0];
          const media = att?.media || att?.styles?.attachment?.media;
          if (media?.id) attachedVideoId = String(media.id);
          if (media?.url) attachedReelUrl = String(media.url).replace(/\\\//g, '/');
          else if (att?.url) attachedReelUrl = String(att.url).replace(/\\\//g, '/');
        }
        if (!attachedReelUrl && attachedVideoId) {
          attachedReelUrl = `https://www.facebook.com/reel/${attachedVideoId}/`;
        }
        attachedAuthor = attached.actors?.[0]?.name || '';
      }

      let creation_time =
        obj.creation_time ||
        attached?.creation_time ||
        obj.comet_sections?.content?.story?.creation_time ||
        0;
      if (typeof creation_time === 'string') {
        creation_time = parseInt(creation_time, 10) || 0;
      }

      let reaction_count = 0;
      let comment_count = 0;
      let share_count = 0;

      const feedbackPaths = [
        obj.feedback,
        obj.comet_sections?.feedback?.story?.story_ufi_container?.story?.feedback_context?.feedback_target_with_context?.ufi_renderer?.feedback,
        obj.comet_sections?.feedback?.story?.feedback_context?.feedback_target_with_context?.ufi_renderer?.feedback,
        obj.comet_sections?.feedback?.story?.comet_feed_ufi_container?.story?.feedback_context?.feedback_target_with_context?.ufi_renderer?.feedback,
        obj.comet_sections?.content?.story?.feedback,
        obj.story?.feedback_context?.feedback_target_with_context?.ufi_renderer?.feedback,
        obj.feedback_context?.feedback_target_with_context?.ufi_renderer?.feedback,
      ];

      for (const fb of feedbackPaths) {
        if (!fb || typeof fb !== 'object') continue;

        if (!reaction_count) {
          reaction_count =
            fb.reaction_count?.count ||
            fb.unified_reactors?.count ||
            fb.top_reactions?.count ||
            fb.reactors?.count ||
            0;
          if (!reaction_count && fb.i18n_reaction_count) {
            const mR = String(fb.i18n_reaction_count).match(/(\d+([,.]\d+)?)\s*([kKmM]|nghìn|triệu)?/);
            if (mR) {
              let n = parseFloat(mR[1].replace(',', '.'));
              const unit = (mR[3] || '').toLowerCase();
              if (unit === 'k' || unit === 'nghìn') n *= 1000;
              else if (unit === 'm' || unit === 'triệu') n *= 1000000;
              reaction_count = Math.round(n);
            }
          }
        }

        if (!comment_count) {
          comment_count =
            fb.total_comment_count ||
            fb.comment_count?.total_count ||
            fb.comment_rendering_instance?.comments?.total_count ||
            fb.comments_count_summary_to_context?.count ||
            0;
          if (!comment_count && fb.i18n_comment_count) {
            const mC = String(fb.i18n_comment_count).match(/(\d+([,.]\d+)?)\s*([kKmM]|nghìn|triệu)?/);
            if (mC) {
              let n = parseFloat(mC[1].replace(',', '.'));
              const unit = (mC[3] || '').toLowerCase();
              if (unit === 'k' || unit === 'nghìn') n *= 1000;
              else if (unit === 'm' || unit === 'triệu') n *= 1000000;
              comment_count = Math.round(n);
            }
          }
        }

        if (!share_count) {
          share_count = fb.share_count?.count || 0;
          if (!share_count && fb.i18n_share_count) {
            const mS = String(fb.i18n_share_count).match(/(\d+([,.]\d+)?)\s*([kKmM]|nghìn|triệu)?/);
            if (mS) {
              let n = parseFloat(mS[1].replace(',', '.'));
              const unit = (mS[3] || '').toLowerCase();
              if (unit === 'k' || unit === 'nghìn') n *= 1000;
              else if (unit === 'm' || unit === 'triệu') n *= 1000000;
              share_count = Math.round(n);
            }
          }
        }

        if (reaction_count || comment_count || share_count) break;
      }

      results.push({
        permalink_url: pUrl,
        msg,
        author,
        authorId,
        isShared:
          obj.is_shared === true ||
          obj.is_reshare === true ||
          obj.is_share_story === true ||
          String(obj.story_type || '').toUpperCase() === 'RESHARE',
        attachedReelUrl,
        attachedVideoId,
        attachedAuthor,
        creation_time: Number(creation_time) || 0,
        reaction_count,
        comment_count,
        share_count,
      });
    }

    for (const k of Object.keys(obj)) {
      this.extractStoriesFromObject(obj[k], results);
    }
    return results;
  }

  public isPostPermalink(url: string): boolean {
    if (!url || url === 'N/A') return false;
    const u = url.trim().toLowerCase();

    if (
      u.includes('/hashtag/') ||
      u.includes('/login') ||
      u.includes('/sharer.php') ||
      u.includes('/recover/') ||
      u.includes('/messages/') ||
      u.includes('/friends') ||
      u.includes('/notifications') ||
      u.includes('/about/') ||
      u.includes('/privacy') ||
      u.includes('/p/') ||
      u.includes('/people/')
    ) {
      return false;
    }

    if (u.includes('profile.php') && !u.includes('story_fbid=') && !u.includes('fbid=')) {
      return false;
    }

    return (
      u.includes('permalink.php') ||
      u.includes('story.php') ||
      u.includes('/posts/') ||
      u.includes('/reel/') ||
      u.includes('/reels/') ||
      u.includes('/watch') ||
      u.includes('/videos/') ||
      u.includes('fbid=')
    );
  }

  public parseGraphQLStories(text: string): any[] {
    const stories: any[] = [];
    const lines = text.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        this.extractStoriesFromObject(parsed, stories);
      } catch {}
    }
    return stories;
  }

  public cleanTextForMatching(str: string): string {
    if (!str) return '';
    return str
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  public extractPostIdFromUrl(url: string): string | null {
    if (!url || url === 'N/A') return null;
    if (!this.isPostPermalink(url)) return null;

    const mFbid = url.match(/(?:story_fbid|fbid)=(pfbid[a-zA-Z0-9]+|\d+)/);
    if (mFbid) return mFbid[1];

    const mPost = url.match(/\/posts\/(pfbid[a-zA-Z0-9]+|\d{8,})/);
    if (mPost) return mPost[1];

    const mReel = url.match(/\/reels?\/([a-zA-Z0-9_-]+)/);
    if (mReel && mReel[1] !== 'watch' && mReel[1] !== 'videos') return mReel[1];

    const mVid = url.match(/(?:videos\/|\?v=)(\d+)/);
    if (mVid) return mVid[1];

    return null;
  }

  public parseFacebookDate(raw: any): { dateObj: Date | null; timestamp: number; formatted: string } {
    if (!raw) return { dateObj: null, timestamp: 0, formatted: 'Gần đây' };

    if (typeof raw === 'number' || /^\d{9,13}$/.test(String(raw).trim())) {
      let num = typeof raw === 'number' ? raw : parseInt(String(raw).trim(), 10);
      if (num > 100000000000) num = Math.floor(num / 1000);
      const d = new Date(num * 1000);
      if (!isNaN(d.getTime())) {
        return {
          dateObj: d,
          timestamp: d.getTime(),
          formatted: this.formatDate(d),
        };
      }
    }

    const str = String(raw).trim();
    const now = new Date();

    if (/^(vừa xong|vừa|mới đây|gần đây|just now|today|hôm nay)$/i.test(str)) {
      return {
        dateObj: now,
        timestamp: now.getTime(),
        formatted: this.formatDate(now),
      };
    }

    const mMin = str.match(/(\d+)\s*(?:phút|mins?|m\b)/i);
    if (mMin) {
      const d = new Date(now.getTime() - parseInt(mMin[1], 10) * 60 * 1000);
      return { dateObj: d, timestamp: d.getTime(), formatted: `${this.formatDate(d)} (${str})` };
    }

    const mHour = str.match(/(\d+)\s*(?:giờ|hours?|h\b)/i);
    if (mHour) {
      const d = new Date(now.getTime() - parseInt(mHour[1], 10) * 3600 * 1000);
      return { dateObj: d, timestamp: d.getTime(), formatted: `${this.formatDate(d)} (${str})` };
    }

    const mYesterday = str.match(/(?:hôm qua|yesterday)(?:\s*(?:lúc|at)?\s*(\d{1,2}):(\d{2}))?/i);
    if (mYesterday) {
      const d = new Date(now.getTime() - 86400 * 1000);
      if (mYesterday[1] && mYesterday[2]) {
        d.setHours(parseInt(mYesterday[1], 10), parseInt(mYesterday[2], 10), 0, 0);
      }
      return { dateObj: d, timestamp: d.getTime(), formatted: `${this.formatDate(d)} (${str})` };
    }

    const mDay = str.match(/(\d+)\s*(?:ngày|days?|d\b)/i);
    if (mDay) {
      const d = new Date(now.getTime() - parseInt(mDay[1], 10) * 86400 * 1000);
      return { dateObj: d, timestamp: d.getTime(), formatted: `${this.formatDate(d)} (${str})` };
    }

    const mWeek = str.match(/(\d+)\s*(?:tuần|weeks?|w\b)/i);
    if (mWeek) {
      const d = new Date(now.getTime() - parseInt(mWeek[1], 10) * 7 * 86400 * 1000);
      return { dateObj: d, timestamp: d.getTime(), formatted: `${this.formatDate(d)} (${str})` };
    }

    const mMonth = str.match(/(\d+)\s*(?:tháng|months?)\s*(?:trước|ago)?$/i);
    if (mMonth && !str.includes('lúc')) {
      const d = new Date(now.getTime() - parseInt(mMonth[1], 10) * 30 * 86400 * 1000);
      return { dateObj: d, timestamp: d.getTime(), formatted: `${this.formatDate(d)} (${str})` };
    }

    const mYear = str.match(/(\d+)\s*(?:năm|years?)\s*(?:trước|ago)?$/i);
    if (mYear && !str.includes('lúc')) {
      const d = new Date(now.getTime() - parseInt(mYear[1], 10) * 365 * 86400 * 1000);
      return { dateObj: d, timestamp: d.getTime(), formatted: `${this.formatDate(d)} (${str})` };
    }

    const mVnDate = str.match(/(\d{1,2})\s+tháng\s+(\d{1,2})(?:[,\s]+(\d{4}))?(?:\s*(?:lúc|at)?\s*(\d{1,2}):(\d{2}))?/i);
    if (mVnDate) {
      const day = parseInt(mVnDate[1], 10);
      const month = parseInt(mVnDate[2], 10) - 1;
      let year = mVnDate[3] ? parseInt(mVnDate[3], 10) : now.getFullYear();
      if (!mVnDate[3] && month > now.getMonth()) {
        year -= 1;
      }
      const hasTime = Boolean(mVnDate[4]);
      const hour = hasTime ? parseInt(mVnDate[4], 10) : 0;
      const min = hasTime ? parseInt(mVnDate[5], 10) : 0;
      const d = new Date(year, month, day, hour, min, 0);
      return {
        dateObj: d,
        timestamp: d.getTime(),
        formatted: hasTime ? this.formatDate(d) : this.formatDate(d, false),
      };
    }

    const mStd = str.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/);
    if (mStd) {
      const hasTime = Boolean(mStd[4]);
      const d = new Date(
        parseInt(mStd[1], 10),
        parseInt(mStd[2], 10) - 1,
        parseInt(mStd[3], 10),
        hasTime ? parseInt(mStd[4], 10) : 0,
        hasTime ? parseInt(mStd[5], 10) : 0,
        0
      );
      return { dateObj: d, timestamp: d.getTime(), formatted: hasTime ? this.formatDate(d) : this.formatDate(d, false) };
    }
    const mDmy = str.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T]+(\d{1,2}):(\d{2}))?/);
    if (mDmy) {
      const hasTime = Boolean(mDmy[4]);
      const d = new Date(
        parseInt(mDmy[3], 10),
        parseInt(mDmy[2], 10) - 1,
        parseInt(mDmy[1], 10),
        hasTime ? parseInt(mDmy[4], 10) : 0,
        hasTime ? parseInt(mDmy[5], 10) : 0,
        0
      );
      return { dateObj: d, timestamp: d.getTime(), formatted: hasTime ? this.formatDate(d) : this.formatDate(d, false) };
    }

    const enMonths: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const mEn = str.match(/([a-zA-Z]{3,9})\s+(\d{1,2})(?:[,\s]+(\d{4}))?/i);
    if (mEn) {
      const mStr = mEn[1].slice(0, 3).toLowerCase();
      if (enMonths[mStr] !== undefined) {
        const month = enMonths[mStr];
        const day = parseInt(mEn[2], 10);
        const year = mEn[3] ? parseInt(mEn[3], 10) : now.getFullYear();
        const d = new Date(year, month, day);
        return { dateObj: d, timestamp: d.getTime(), formatted: this.formatDate(d, false) };
      }
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return { dateObj: d, timestamp: d.getTime(), formatted: this.formatDate(d) };
    }

    return { dateObj: null, timestamp: 0, formatted: str };
  }

  public formatDate(d: Date, includeTime = true): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const YYYY = d.getFullYear();
    const MM = pad(d.getMonth() + 1);
    const DD = pad(d.getDate());
    if (!includeTime) return `${YYYY}-${MM}-${DD}`;
    const HH = pad(d.getHours());
    const mm = pad(d.getMinutes());
    return `${YYYY}-${MM}-${DD} ${HH}:${mm}`;
  }

  public isDateInRange(
    timestamp: number | undefined,
    startTimestamp: number | null,
    endTimestamp: number | null
  ): boolean {
    if (!startTimestamp && !endTimestamp) return true;
    if (!timestamp || timestamp === 0) return true;
    if (startTimestamp && timestamp < startTimestamp) return false;
    if (endTimestamp && timestamp > endTimestamp) return false;
    return true;
  }
}
