import {
  isBoilerplateCaption,
  normalizeCaption,
  isValidAuthor,
  decodeHtmlEntities,
} from './text-normalizer';

describe('Nhóm 1 — text-normalizer', () => {
  describe('isBoilerplateCaption', () => {
    it('không loại nhầm các caption có chứa từ khóa nhưng là nội dung hợp lệ', () => {
      expect(isBoilerplateCaption('Video hài hước hôm nay')).toBe(false);
      expect(isBoilerplateCaption('Clip này hay quá xem video')).toBe(false);
      expect(isBoilerplateCaption('Facebook đang làm gì vậy')).toBe(false);
      expect(isBoilerplateCaption('Đăng nhập vào trang để xem')).toBe(false);
    });

    it('loại đúng các boilerplate caption thật sự', () => {
      expect(isBoilerplateCaption('video')).toBe(true);
      expect(isBoilerplateCaption('Video liên quan')).toBe(true);
      expect(isBoilerplateCaption('  ')).toBe(true);
      expect(isBoilerplateCaption(null)).toBe(true);
      expect(isBoilerplateCaption(undefined)).toBe(true);
      expect(isBoilerplateCaption('Video liên quan...')).toBe(true);
    });
  });

  describe('normalizeCaption', () => {
    it('không cắt xem thêm/see more nếu là nội dung hợp lệ', () => {
      expect(normalizeCaption('Chi tiết xem thêm')).toBe('Chi tiết xem thêm');
    });

    it('cắt xem thêm/see more khi có dấu .../… hoặc nằm trên dòng riêng', () => {
      expect(normalizeCaption('Nội dung dài... Xem thêm')).toBe('Nội dung dài');
      expect(normalizeCaption('Nội dung dài… Xem thêm')).toBe('Nội dung dài');
      expect(normalizeCaption('Nội dung dài\nXem thêm')).toBe('Nội dung dài');
      expect(normalizeCaption('Nội dung dài\nSee more')).toBe('Nội dung dài');
    });
  });

  describe('isValidAuthor', () => {
    it('chấp nhận tác giả hợp lệ và từ chối tác giả rác', () => {
      expect(isValidAuthor('Watch Vietnam')).toBe(true);
      expect(isValidAuthor('Watch')).toBe(false);
    });
  });

  describe('Nhóm 2 — decodeHtmlEntities (Emoji & codePoint)', () => {
    it('giải mã đúng emoji qua codePoint không bị cắt 16 bit', () => {
      const decodedHex = decodeHtmlEntities('&#x1f602;');
      expect(decodedHex.codePointAt(0)).toBe(0x1f602);
      expect(decodedHex).toBe('😂');

      const decodedDec = decodeHtmlEntities('&#128514;');
      expect(decodedDec.codePointAt(0)).toBe(0x1f602);
      expect(decodedDec).toBe('😂');

      const decodedSurrogate = decodeHtmlEntities('\\ud83d\\ude02');
      expect(decodedSurrogate).toBe('😂');
    });
  });
});
