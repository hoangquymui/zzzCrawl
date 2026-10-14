import { VideosService } from './videos.service';
import { VideoItem } from './interfaces/video.interface';
import * as profanityModule from '../vocabulary/utils/profanity-checker';

describe('Mục 6 — VideosService tests', () => {
  let videosService: VideosService;
  let mockStorageService: any;
  let mockScraperService: any;
  let mockGateway: any;
  let mockDb: any;
  let mockCookieService: any;
  let mockProfileService: any;

  beforeEach(() => {
    mockStorageService = {
      loadVideos: jest.fn().mockReturnValue([]),
      saveVideos: jest.fn(),
      upsertVideo: jest.fn(),
    };
    mockScraperService = {
      sanitizeUrl: jest.fn((u: string) => u),
      isRedirectUrl: jest.fn(() => false),
      isBoilerplateCaption: jest.fn(() => false),
      detectPlatform: jest.fn(() => 'facebook'),
      scrapeVideo: jest.fn(),
    };
    mockGateway = {
      emitCrawlStatus: jest.fn(),
      emitVideoAdded: jest.fn(),
      emitVideoUpdated: jest.fn(),
      emitVideosUpdated: jest.fn(),
      emitRefreshAllStarted: jest.fn(),
      emitRefreshAllProgress: jest.fn(),
      emitRefreshAllCompleted: jest.fn(),
    };
    mockDb = {
      getSetting: jest.fn().mockReturnValue('3'),
    };
    mockCookieService = {
      validateCookieForCrawl: jest.fn().mockResolvedValue(undefined),
      getNextActiveCookieSlot: jest.fn().mockReturnValue(null),
    };
    mockProfileService = {
      listProfiles: jest.fn().mockReturnValue([]),
      ensureProfileForAuthor: jest.fn().mockResolvedValue(null),
    };

    videosService = new VideosService(
      mockStorageService,
      mockScraperService,
      mockGateway,
      mockDb,
      mockCookieService,
      mockProfileService
    );
  });

  afterEach(() => {
    videosService.onModuleDestroy();
    jest.restoreAllMocks();
  });

  it('1. refreshVideo: scrape trả caption "Không có tiêu đề", ngayDang "" và LuotXem 0 -> giữ nguyên caption/ngày/lượt xem cũ và isViolation cũ', async () => {
    const oldVideo: VideoItem = {
      id: 'vid-1',
      STT: 1,
      link: 'https://facebook.com/1',
      caption: 'Nội dung bậy bạ đm',
      loai: 'Facebook Video',
      nguoiDang: 'Tác giả',
      ngayDang: '2026-08-01',
      LuotXem: 5000,
      LuotLike: 50,
      LuotComment: 5,
      SoLuongNguoiShare: 2,
      isViolation: true,
      violationReason: 'Chứa từ ngữ nhạy cảm',
    };
    mockStorageService.loadVideos.mockReturnValue([oldVideo]);
    videosService.onModuleInit();

    mockScraperService.scrapeVideo.mockResolvedValue({
      link: 'https://facebook.com/1',
      caption: 'Không có tiêu đề',
      ngayDang: '',
      LuotXem: 0,
      LuotLike: 0,
      LuotComment: 0,
      SoLuongNguoiShare: 0,
      crawlStatus: 'SCRAPE_SUCCESS',
    });

    const refreshed = await videosService.refreshVideo('vid-1');

    expect(refreshed.caption).toBe('Nội dung bậy bạ đm');
    expect(refreshed.ngayDang).toBe('2026-08-01');
    expect(refreshed.LuotXem).toBe(5000);
    expect(refreshed.isViolation).toBe(true);
    expect(mockStorageService.saveVideos).toHaveBeenCalled();
  });

  it('2. refreshAllVideosBatch: cùng kịch bản, upsertVideo được gọi với dữ liệu đã gộp và delay giữa các tác vụ được gọi', async () => {
    const oldVideo1: VideoItem = {
      id: 'vid-1',
      STT: 1,
      link: 'https://facebook.com/1',
      caption: 'Nội dung cũ 1',
      loai: 'Facebook Video',
      nguoiDang: 'Tác giả 1',
      ngayDang: '2026-08-01',
      LuotXem: 5000,
      LuotLike: 50,
      LuotComment: 5,
      SoLuongNguoiShare: 2,
      isViolation: false,
    };
    const oldVideo2: VideoItem = {
      id: 'vid-2',
      STT: 2,
      link: 'https://facebook.com/2',
      caption: 'Nội dung cũ 2',
      loai: 'Facebook Video',
      nguoiDang: 'Tác giả 2',
      ngayDang: '2026-08-02',
      LuotXem: 8000,
      LuotLike: 80,
      LuotComment: 8,
      SoLuongNguoiShare: 4,
      isViolation: false,
    };
    mockStorageService.loadVideos.mockReturnValue([oldVideo1, oldVideo2]);
    videosService.onModuleInit();

    mockScraperService.scrapeVideo.mockResolvedValue({
      caption: 'Không có tiêu đề',
      ngayDang: '',
      LuotXem: 0,
      LuotLike: 0,
      LuotComment: 0,
      SoLuongNguoiShare: 0,
      crawlStatus: 'SCRAPE_SUCCESS',
    });

    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    await videosService.refreshAllVideosBatch('Thủ công', 1);

    expect(mockStorageService.upsertVideo).toHaveBeenCalledTimes(2);
    const firstCallArg = mockStorageService.upsertVideo.mock.calls[0][0];
    expect(firstCallArg.caption).toBe('Nội dung cũ 1');
    expect(firstCallArg.ngayDang).toBe('2026-08-01');
    expect(firstCallArg.LuotXem).toBe(5000);

    const secondCallArg = mockStorageService.upsertVideo.mock.calls[1][0];
    expect(secondCallArg.caption).toBe('Nội dung cũ 2');
    expect(secondCallArg.ngayDang).toBe('2026-08-02');
    expect(secondCallArg.LuotXem).toBe(8000);

    expect(setTimeoutSpy).toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });

  it('3. addVideo: caption "Không có tiêu đề" không làm checkCaptionViolation bị gọi', async () => {
    mockStorageService.loadVideos.mockReturnValue([]);
    videosService.onModuleInit();

    mockScraperService.scrapeVideo.mockResolvedValue({
      link: 'https://facebook.com/123',
      caption: 'Không có tiêu đề',
      loai: 'Facebook Video',
      nguoiDang: 'Facebook',
      ngayDang: '2026-08-01',
      LuotXem: 0,
      LuotLike: 0,
      LuotComment: 0,
      SoLuongNguoiShare: 0,
      crawlStatus: 'SCRAPE_SUCCESS',
    });

    const spy = jest.spyOn(profanityModule, 'checkCaptionViolation');

    await videosService.addVideo('https://facebook.com/123');

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
