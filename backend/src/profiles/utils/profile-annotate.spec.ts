import { VideosService } from '../../videos/videos.service';
import { VideoItem } from '../../videos/interfaces/video.interface';
import { UserProfileItem } from '../interfaces/profile-management.interface';

describe('Mục 3 — profile-annotate', () => {
  let videosService: VideosService;
  let mockProfileService: any;
  let mockStorageService: any;
  let mockScraperService: any;
  let mockGateway: any;
  let mockDb: any;
  let mockCookieService: any;

  beforeEach(() => {
    mockProfileService = {
      listProfiles: jest.fn(),
    };
    mockStorageService = {
      loadVideos: jest.fn().mockReturnValue([]),
      saveVideos: jest.fn(),
    };
    mockScraperService = {
      sanitizeUrl: (u: string) => u,
      isBoilerplateCaption: () => false,
      detectPlatform: () => 'facebook',
    };
    mockGateway = {
      emitVideoAdded: jest.fn(),
      emitVideoUpdated: jest.fn(),
      emitVideosUpdated: jest.fn(),
    };
    mockDb = {
      getSetting: jest.fn().mockReturnValue('3'),
    };
    mockCookieService = {};

    videosService = new VideosService(
      mockStorageService,
      mockScraperService,
      mockGateway,
      mockDb,
      mockCookieService,
      mockProfileService
    );
  });

  const createProfile = (overrides: Partial<UserProfileItem>): UserProfileItem => ({
    id: 'prof_1',
    name: 'Profile',
    profileUrl: 'https://fb.com/p',
    crawledAt: '2026-09-01',
    status: 'SUCCESS',
    ...overrides,
  });

  it('video có profileId do "name" và nay có profile khớp uid -> đổi sang profile uid, profileMatchedBy="uid"', () => {
    const profiles: UserProfileItem[] = [
      createProfile({ id: 'prof_name', name: 'Công an phường Phú Hội', profileUrl: 'https://fb.com/p1' }),
      createProfile({ id: 'prof_uid', name: 'Khác', profileUrl: 'https://fb.com/p2', uid: '99999' }),
    ];
    mockProfileService.listProfiles.mockReturnValue(profiles);

    const video: VideoItem = {
      STT: 1,
      link: 'https://fb.com/post1',
      caption: 'cap',
      loai: 'Facebook',
      nguoiDang: 'Công an phường Phú Hội',
      authorUid: '99999',
      ngayDang: '2026-09-01',
      LuotLike: 0,
      LuotComment: 0,
      SoLuongNguoiShare: 0,
      LuotXem: 0,
      profileId: 'prof_name',
      profileName: 'Công an phường Phú Hội',
      profileMatchedBy: 'name',
    };

    videosService.annotateVideo(video);

    expect(video.profileId).toBe('prof_uid');
    expect(video.profileMatchedBy).toBe('uid');
  });

  it('video có profileMatchedBy="manual" không bị đổi', () => {
    const profiles: UserProfileItem[] = [
      createProfile({ id: 'prof_uid', name: 'Khác', profileUrl: 'https://fb.com/p2', uid: '99999' }),
    ];
    mockProfileService.listProfiles.mockReturnValue(profiles);

    const video: VideoItem = {
      STT: 1,
      link: 'https://fb.com/post1',
      caption: 'cap',
      loai: 'Facebook',
      nguoiDang: 'Khác',
      authorUid: '99999',
      ngayDang: '2026-09-01',
      LuotLike: 0,
      LuotComment: 0,
      SoLuongNguoiShare: 0,
      LuotXem: 0,
      profileId: 'prof_manual_id',
      profileName: 'Manual Profile',
      profileMatchedBy: 'manual',
    };

    videosService.annotateVideo(video);

    expect(video.profileId).toBe('prof_manual_id');
    expect(video.profileMatchedBy).toBe('manual');
  });

  it('video "name" không còn khớp -> bị xóa profileId', () => {
    const profiles: UserProfileItem[] = [
      createProfile({ id: 'prof_1', name: 'Nguyễn Văn An Khang', profileUrl: 'https://fb.com/p1' }),
    ];
    mockProfileService.listProfiles.mockReturnValue(profiles);

    const video: VideoItem = {
      STT: 1,
      link: 'https://fb.com/post1',
      caption: 'cap',
      loai: 'Facebook',
      nguoiDang: 'Nguyễn Văn An',
      ngayDang: '2026-09-01',
      LuotLike: 0,
      LuotComment: 0,
      SoLuongNguoiShare: 0,
      LuotXem: 0,
      profileId: 'prof_1',
      profileName: 'Nguyễn Văn An Khang',
      profileMatchedBy: 'name',
    };

    videosService.annotateVideo(video);

    expect(video.profileId).toBeUndefined();
    expect(video.profileName).toBeUndefined();
    expect(video.profileMatchedBy).toBeUndefined();
  });
});
