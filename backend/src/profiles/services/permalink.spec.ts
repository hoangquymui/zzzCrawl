import { ProfileDomParser } from './profile-dom-parser';

describe('Nhóm 7 — permalink.spec.ts', () => {
  let parser: ProfileDomParser;

  beforeEach(() => {
    parser = new ProfileDomParser({} as any);
  });

  it('nhận diện đúng post permalink khi slug chứa từ nằm trong danh sách loại trừ (như friendsofhue)', () => {
    const postUrl = 'https://www.facebook.com/friendsofhue/posts/1234567890';
    expect(parser.isPostPermalink(postUrl)).toBe(true);
  });

  it('loại trừ chính xác các đường dẫn hệ thống không phải post', () => {
    expect(parser.isPostPermalink('https://www.facebook.com/friends')).toBe(false);
    expect(parser.isPostPermalink('https://www.facebook.com/friends/suggestions')).toBe(false);
    expect(parser.isPostPermalink('https://www.facebook.com/about/overview')).toBe(false);
    expect(parser.isPostPermalink('https://www.facebook.com/privacy/policy')).toBe(false);
    expect(parser.isPostPermalink('https://www.facebook.com/login/')).toBe(false);
  });
});
