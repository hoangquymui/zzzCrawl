import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import type { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { VideoItem } from '../videos/interfaces/video.interface';
import { UserProfileItem } from '../profiles/interfaces/profile-management.interface';
import { UserPayload } from '../auth/auth.service';
import { normalizeFacebookUrl } from '../scraper/utils/url-cleaner';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const BetterSqlite3 = require('better-sqlite3');

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private db: DatabaseType;

  constructor() {
    this.initDatabase();
  }

  public getDatabasePath(): string {
    const baseDir = process.cwd().endsWith('backend')
      ? process.cwd()
      : fs.existsSync(path.join(process.cwd(), 'backend'))
      ? path.join(process.cwd(), 'backend')
      : process.cwd();

    const dataPath = path.join(baseDir, 'data', 'database.sqlite');
    if (fs.existsSync(dataPath)) return dataPath;

    const legacyPath = path.join(baseDir, 'database.sqlite');
    if (fs.existsSync(legacyPath)) return legacyPath;

    return dataPath;
  }

  public initDatabase(): void {
    if (this.db) return;

    const dbPath = this.getDatabasePath();
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.logger.log(`[Database] Đang kết nối tới SQLite: ${dbPath}`);
    const DbConstructor = typeof BetterSqlite3 === 'function' ? BetterSqlite3 : (BetterSqlite3.default || BetterSqlite3);
    this.db = new DbConstructor(dbPath);

    // Kích hoạt chế độ WAL (Write-Ahead Logging) cho hiệu suất cao & ghi đọc đồng thời
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.initTables();
    this.cleanCorruptedUrls();
    this.migrateFromLegacyJson();
    this.syncVideoAuthorsWithProfiles();
  }

  public ensureInitialized(): void {
    if (!this.db) {
      this.initDatabase();
    }
  }

  public onModuleInit(): void {
    this.initDatabase();
  }

  public onModuleDestroy(): void {
    if (this.db) {
      this.logger.log('[Database] Đóng kết nối SQLite.');
      this.db.close();
    }
  }

  private initTables(): void {
    // 1. Bảng videos (Video & bài viết theo dõi)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS videos (
        id TEXT,
        STT INTEGER PRIMARY KEY,
        link TEXT NOT NULL UNIQUE,
        caption TEXT,
        loai TEXT,
        nguoiDang TEXT,
        authorUid TEXT,
        authorUrl TEXT,
        ngayDang TEXT,
        SoLuongNguoiShare INTEGER DEFAULT 0,
        LuotXem INTEGER DEFAULT 0,
        LuotLike INTEGER DEFAULT 0,
        LuotComment INTEGER DEFAULT 0,
        lastUpdated TEXT,
        postId TEXT,
        isShared INTEGER DEFAULT 0,
        originalAuthor TEXT,
        originalAuthorUrl TEXT,
        originalPostUrl TEXT,
        isViolation INTEGER DEFAULT 0,
        violationReason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_videos_id ON videos(id);
      CREATE INDEX IF NOT EXISTS idx_videos_postId ON videos(postId);
      CREATE INDEX IF NOT EXISTS idx_videos_nguoiDang ON videos(nguoiDang);
    `);

    // Migration an toàn cho các cột mới nếu bảng videos đã tồn tại từ trước
    try {
      this.db.exec(`ALTER TABLE videos ADD COLUMN id TEXT`);
    } catch {}
    try {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_videos_id ON videos(id)`);
    } catch {}
    try {
      this.db.exec(`
        UPDATE videos 
        SET id = CASE 
          WHEN link LIKE '%tiktok.com%' THEN 'tt-' || STT 
          ELSE 'fb-' || STT 
        END 
        WHERE id IS NULL OR id = ''
      `);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE videos ADD COLUMN authorUid TEXT`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE videos ADD COLUMN authorUrl TEXT`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE videos ADD COLUMN isShared INTEGER DEFAULT 0`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE videos ADD COLUMN originalAuthor TEXT`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE videos ADD COLUMN originalAuthorUrl TEXT`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE videos ADD COLUMN originalPostUrl TEXT`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE videos ADD COLUMN isViolation INTEGER DEFAULT 0`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE videos ADD COLUMN violationReason TEXT`);
    } catch {}

    // 2. Bảng profiles (Hồ sơ người dùng cào được)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        profileUrl TEXT NOT NULL UNIQUE,
        uid TEXT,
        name TEXT NOT NULL,
        birthday TEXT,
        birthYear TEXT,
        location TEXT,
        hometown TEXT,
        gender TEXT,
        avatarUrl TEXT,
        bio TEXT,
        work TEXT,
        education TEXT,
        relationship TEXT,
        crawledAt TEXT,
        status TEXT DEFAULT 'SUCCESS',
        errorMsg TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_profiles_uid ON profiles(uid);
      CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name);
    `);

    // 3. Bảng users (Tài khoản người dùng đăng nhập hệ thống)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        password TEXT NOT NULL
      );
    `);

    // 4. Bảng system_settings (Cấu hình hệ thống, Cookie và lịch sử kiểm tra)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updatedAt TEXT
      );
    `);

    // 5. Bảng audit_logs (Nhật ký hoạt động tác chiến của người dùng & hệ thống)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        username TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        targetId TEXT,
        ipAddress TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_username ON audit_logs(username);
    `);
  }

  private cleanCorruptedUrls(): void {
    try {
      const badProfiles = this.db.prepare('SELECT id, profileUrl FROM profiles WHERE profileUrl LIKE ?').all('%u0025%') as { id: string; profileUrl: string }[];
      if (badProfiles.length > 0) {
        this.logger.log(`[Database] Đang sửa ${badProfiles.length} profile bị lỗi mã hóa URL...`);
        const updateStmt = this.db.prepare('UPDATE profiles SET profileUrl = ? WHERE id = ?');
        for (const p of badProfiles) {
          const fixed = normalizeFacebookUrl(p.profileUrl);
          const conflict = this.db.prepare('SELECT id FROM profiles WHERE profileUrl = ? AND id != ?').get(fixed, p.id);
          if (conflict) {
            this.db.prepare('DELETE FROM profiles WHERE id = ?').run(p.id);
          } else {
            updateStmt.run(fixed, p.id);
          }
        }
      }

      const badVideos = this.db.prepare('SELECT STT, link, authorUrl FROM videos WHERE link LIKE ? OR authorUrl LIKE ?').all('%u0025%', '%u0025%') as { STT: number; link: string; authorUrl: string }[];
      if (badVideos.length > 0) {
        this.logger.log(`[Database] Đang sửa ${badVideos.length} video có URL/authorUrl bị lỗi mã hóa...`);
        const updateStmt = this.db.prepare('UPDATE videos SET link = ?, authorUrl = ? WHERE STT = ?');
        for (const v of badVideos) {
          const fixedLink = v.link && v.link.includes('u0025') ? normalizeFacebookUrl(v.link) : v.link;
          const fixedAuthorUrl = v.authorUrl && v.authorUrl.includes('u0025') ? normalizeFacebookUrl(v.authorUrl) : v.authorUrl;
          updateStmt.run(fixedLink, fixedAuthorUrl, v.STT);
        }
      }
    } catch (e: any) {
      this.logger.warn(`[Database] Lỗi khi tự động làm sạch URL: ${e?.message}`);
    }
  }

  private migrateFromLegacyJson(): void {
    const baseDir = process.cwd().endsWith('backend')
      ? process.cwd()
      : fs.existsSync(path.join(process.cwd(), 'backend'))
      ? path.join(process.cwd(), 'backend')
      : process.cwd();

    // 1. Di chuyển videos_data.json nếu bảng videos đang rỗng
    const videoCount = (this.db.prepare('SELECT COUNT(*) as count FROM videos').get() as { count: number }).count;
    if (videoCount === 0) {
      const candidates = [
        path.join(baseDir, 'data', 'videos_data.json'),
        path.join(baseDir, 'videos_data.json'),
        path.join(process.cwd(), 'videos_data.json')
      ];
      const videoJson = candidates.find((p) => fs.existsSync(p));
      if (videoJson) {
        try {
          const raw = fs.readFileSync(videoJson, 'utf-8');
          const videos = JSON.parse(raw) as VideoItem[];
          if (Array.isArray(videos) && videos.length > 0) {
            this.saveAllVideos(videos);
            this.logger.log(`[Database] Đã tự động di chuyển ${videos.length} videos từ '${videoJson}' vào SQLite.`);
          }
        } catch (e: any) {
          this.logger.error(`[Database] Lỗi khi di chuyển dữ liệu videos: ${e?.message}`);
        }
      }
    }

    // 2. Di chuyển profiles_data.json nếu bảng profiles đang rỗng
    const profileCount = (this.db.prepare('SELECT COUNT(*) as count FROM profiles').get() as { count: number }).count;
    if (profileCount === 0) {
      const candidates = [
        path.join(baseDir, 'data', 'profiles_data.json'),
        path.join(baseDir, 'profiles_data.json'),
        path.join(process.cwd(), 'profiles_data.json')
      ];
      const profileJson = candidates.find((p) => fs.existsSync(p));
      if (profileJson) {
        try {
          const raw = fs.readFileSync(profileJson, 'utf-8');
          const profiles = JSON.parse(raw) as UserProfileItem[];
          if (Array.isArray(profiles) && profiles.length > 0) {
            this.saveAllProfiles(profiles);
            this.logger.log(`[Database] Đã tự động di chuyển ${profiles.length} profiles từ '${profileJson}' vào SQLite.`);
          }
        } catch (e: any) {
          this.logger.error(`[Database] Lỗi khi di chuyển dữ liệu profiles: ${e?.message}`);
        }
      }
    }

    // 3. Khởi tạo tài khoản users mặc định nếu bảng đang rỗng
    const userCount = (this.db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
    if (userCount === 0) {
      const defaultUsers: Array<UserPayload & { password: string }> = [
        {
          id: 'usr_admin_01',
          username: 'admin',
          name: 'Quản trị viên',
          role: 'admin',
          password: 'admin',
        },
        {
          id: 'usr_admin_02',
          username: 'admin123',
          name: 'Quản trị viên',
          role: 'admin',
          password: 'admin',
        },
        {
          id: 'usr_user_01',
          username: 'user',
          name: 'Người xem (User)',
          role: 'user',
          password: 'user',
        },
        {
          id: 'usr_user_02',
          username: 'user123',
          name: 'Người xem (User)',
          role: 'user',
          password: 'user',
        },
      ];
      const insertUser = this.db.prepare(`
        INSERT INTO users (id, username, name, role, password)
        VALUES (@id, @username, @name, @role, @password)
      `);
      const insertMany = this.db.transaction((users: Array<UserPayload & { password: string }>) => {
        for (const u of users) {
          insertUser.run(u);
        }
      });
      insertMany(defaultUsers);
      this.logger.log(`[Database] Đã tạo ${defaultUsers.length} tài khoản người dùng mặc định trong SQLite.`);
    }

    // 4. Di chuyển cookie từ cookies.json nếu setting chưa có
    const existingCookie = this.getSetting('cookie');
    if (!existingCookie) {
      const candidates = [
        path.join(baseDir, 'data', 'cookies.json'),
        path.join(baseDir, 'cookies.json'),
        path.join(process.cwd(), 'cookies.json')
      ];
      const cookieJson = candidates.find((p) => fs.existsSync(p));
      if (cookieJson) {
        try {
          const raw = fs.readFileSync(cookieJson, 'utf-8').trim();
          if (raw && raw !== '[]' && raw !== '{}') {
            this.saveCookie(raw);
            this.logger.log(`[Database] Đã tự động nạp Cookie từ '${cookieJson}' vào SQLite.`);
          }
        } catch (e: any) {
          this.logger.error(`[Database] Lỗi khi nạp cookie vào SQLite: ${e?.message}`);
        }
      }
    }
  }

  // ===========================================================================
  // VIDEOS METHODS
  // ===========================================================================

  public getAllVideos(): VideoItem[] {
    const rows = this.db.prepare('SELECT * FROM videos ORDER BY STT ASC').all() as any[];
    return rows.map((r) => this.mapRowToVideo(r));
  }

  public getVideoByIdOrStt(idOrStt: string | number): VideoItem | null {
    const str = String(idOrStt);
    const num = isNaN(Number(str)) ? -1 : Number(str);
    const row = this.db.prepare('SELECT * FROM videos WHERE id = ? OR STT = ?').get(str, num) as any;
    return row ? this.mapRowToVideo(row) : null;
  }

  public getVideoByStt(stt: number): VideoItem | null {
    return this.getVideoByIdOrStt(stt);
  }

  public getVideoByLink(link: string): VideoItem | null {
    const row = this.db.prepare('SELECT * FROM videos WHERE link = ?').get(link) as any;
    return row ? this.mapRowToVideo(row) : null;
  }

  public getMaxStt(): number {
    const row = this.db.prepare('SELECT MAX(STT) as maxStt FROM videos').get() as { maxStt: number | null };
    return row && row.maxStt !== null ? row.maxStt : 0;
  }

  public upsertVideo(v: VideoItem): void {
    const stmt = this.db.prepare(`
      INSERT INTO videos (
        id, STT, link, caption, loai, nguoiDang, authorUid, authorUrl, ngayDang,
        SoLuongNguoiShare, LuotXem, LuotLike, LuotComment, lastUpdated, postId,
        isShared, originalAuthor, originalAuthorUrl, originalPostUrl,
        isViolation, violationReason
      ) VALUES (
        @id, @STT, @link, @caption, @loai, @nguoiDang, @authorUid, @authorUrl, @ngayDang,
        @SoLuongNguoiShare, @LuotXem, @LuotLike, @LuotComment, @lastUpdated, @postId,
        @isShared, @originalAuthor, @originalAuthorUrl, @originalPostUrl,
        @isViolation, @violationReason
      )
      ON CONFLICT(STT) DO UPDATE SET
        id = COALESCE(excluded.id, videos.id),
        link = excluded.link,
        caption = excluded.caption,
        loai = excluded.loai,
        nguoiDang = excluded.nguoiDang,
        authorUid = excluded.authorUid,
        authorUrl = excluded.authorUrl,
        ngayDang = excluded.ngayDang,
        SoLuongNguoiShare = excluded.SoLuongNguoiShare,
        LuotXem = excluded.LuotXem,
        LuotLike = excluded.LuotLike,
        LuotComment = excluded.LuotComment,
        lastUpdated = excluded.lastUpdated,
        postId = excluded.postId,
        isShared = excluded.isShared,
        originalAuthor = excluded.originalAuthor,
        originalAuthorUrl = excluded.originalAuthorUrl,
        originalPostUrl = excluded.originalPostUrl,
        isViolation = excluded.isViolation,
        violationReason = excluded.violationReason
    `);
    stmt.run({
      id: v.id || null,
      STT: v.STT,
      link: v.link ? normalizeFacebookUrl(v.link) : '',
      caption: v.caption || '',
      loai: v.loai || '',
      nguoiDang: v.nguoiDang || '',
      authorUid: v.authorUid || null,
      authorUrl: v.authorUrl ? normalizeFacebookUrl(v.authorUrl) : null,
      ngayDang: v.ngayDang || '',
      SoLuongNguoiShare: Number(v.SoLuongNguoiShare) || 0,
      LuotXem: Number(v.LuotXem) || 0,
      LuotLike: Number(v.LuotLike) || 0,
      LuotComment: Number(v.LuotComment) || 0,
      lastUpdated: v.lastUpdated || new Date().toISOString(),
      postId: v.postId || null,
      isShared: v.isShared ? 1 : 0,
      originalAuthor: v.originalAuthor || null,
      originalAuthorUrl: v.originalAuthorUrl || null,
      originalPostUrl: v.originalPostUrl || null,
      isViolation: v.isViolation ? 1 : 0,
      violationReason: v.violationReason || null,
    });
  }

  public saveAllVideos(videos: VideoItem[]): void {
    const upsertStmt = this.db.prepare(`
      INSERT INTO videos (
        id, STT, link, caption, loai, nguoiDang, authorUid, authorUrl, ngayDang,
        SoLuongNguoiShare, LuotXem, LuotLike, LuotComment, lastUpdated, postId,
        isShared, originalAuthor, originalAuthorUrl, originalPostUrl,
        isViolation, violationReason
      ) VALUES (
        @id, @STT, @link, @caption, @loai, @nguoiDang, @authorUid, @authorUrl, @ngayDang,
        @SoLuongNguoiShare, @LuotXem, @LuotLike, @LuotComment, @lastUpdated, @postId,
        @isShared, @originalAuthor, @originalAuthorUrl, @originalPostUrl,
        @isViolation, @violationReason
      )
      ON CONFLICT(STT) DO UPDATE SET
        id = COALESCE(excluded.id, videos.id),
        link = excluded.link,
        caption = excluded.caption,
        loai = excluded.loai,
        nguoiDang = excluded.nguoiDang,
        authorUid = excluded.authorUid,
        authorUrl = excluded.authorUrl,
        ngayDang = excluded.ngayDang,
        SoLuongNguoiShare = excluded.SoLuongNguoiShare,
        LuotXem = excluded.LuotXem,
        LuotLike = excluded.LuotLike,
        LuotComment = excluded.LuotComment,
        lastUpdated = excluded.lastUpdated,
        postId = excluded.postId,
        isShared = excluded.isShared,
        originalAuthor = excluded.originalAuthor,
        originalAuthorUrl = excluded.originalAuthorUrl,
        originalPostUrl = excluded.originalPostUrl,
        isViolation = excluded.isViolation,
        violationReason = excluded.violationReason
    `);

    const transaction = this.db.transaction((items: VideoItem[]) => {
      // Xóa các record có STT không còn trong danh sách mới
      const incomingStts = items.map((i) => i.STT);
      if (incomingStts.length > 0) {
        const placeholders = incomingStts.map(() => '?').join(',');
        this.db.prepare(`DELETE FROM videos WHERE STT NOT IN (${placeholders})`).run(...incomingStts);
      } else {
        this.db.prepare('DELETE FROM videos').run();
      }

      for (const v of items) {
        upsertStmt.run({
          id: v.id || null,
          STT: v.STT,
          link: v.link ? normalizeFacebookUrl(v.link) : '',
          caption: v.caption || '',
          loai: v.loai || '',
          nguoiDang: v.nguoiDang || '',
          authorUid: v.authorUid || null,
          authorUrl: v.authorUrl ? normalizeFacebookUrl(v.authorUrl) : null,
          ngayDang: v.ngayDang || '',
          SoLuongNguoiShare: Number(v.SoLuongNguoiShare) || 0,
          LuotXem: Number(v.LuotXem) || 0,
          LuotLike: Number(v.LuotLike) || 0,
          LuotComment: Number(v.LuotComment) || 0,
          lastUpdated: v.lastUpdated || new Date().toISOString(),
          postId: v.postId || null,
          isShared: v.isShared ? 1 : 0,
          originalAuthor: v.originalAuthor || null,
          originalAuthorUrl: v.originalAuthorUrl || null,
          originalPostUrl: v.originalPostUrl || null,
          isViolation: v.isViolation ? 1 : 0,
          violationReason: v.violationReason || null,
        });
      }
    });

    transaction(videos);
  }

  public deleteVideo(idOrStt: string | number): boolean {
    const str = String(idOrStt);
    const num = isNaN(Number(str)) ? -1 : Number(str);
    const result = this.db.prepare('DELETE FROM videos WHERE id = ? OR STT = ?').run(str, num);
    return result.changes > 0;
  }

  private mapRowToVideo(row: any): VideoItem {
    return {
      id: row.id || (row.link?.includes('tiktok.com') ? `tt-${row.STT}` : `fb-${row.STT}`),
      STT: row.STT,
      link: normalizeFacebookUrl(row.link),
      caption: row.caption || '',
      loai: row.loai || '',
      nguoiDang: row.nguoiDang || '',
      authorUid: row.authorUid || undefined,
      authorUrl: row.authorUrl ? normalizeFacebookUrl(row.authorUrl) : undefined,
      ngayDang: row.ngayDang || '',
      SoLuongNguoiShare: Number(row.SoLuongNguoiShare) || 0,
      LuotXem: Number(row.LuotXem) || 0,
      LuotLike: Number(row.LuotLike) || 0,
      LuotComment: Number(row.LuotComment) || 0,
      lastUpdated: row.lastUpdated,
      postId: row.postId || undefined,
      isShared: Boolean(row.isShared),
      originalAuthor: row.originalAuthor || undefined,
      originalAuthorUrl: row.originalAuthorUrl || undefined,
      originalPostUrl: row.originalPostUrl || undefined,
      isViolation: Boolean(row.isViolation),
      violationReason: row.violationReason || undefined,
    };
  }

  // ===========================================================================
  // PROFILES METHODS
  // ===========================================================================

  public getAllProfiles(): UserProfileItem[] {
    const rows = this.db.prepare('SELECT * FROM profiles ORDER BY crawledAt DESC').all() as any[];
    return rows.map((r) => this.mapRowToProfile(r));
  }

  public getProfileById(id: string): UserProfileItem | null {
    const row = this.db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as any;
    return row ? this.mapRowToProfile(row) : null;
  }

  public getProfileByUid(uid: string): UserProfileItem | null {
    const row = this.db.prepare('SELECT * FROM profiles WHERE uid = ?').get(uid) as any;
    return row ? this.mapRowToProfile(row) : null;
  }

  public getProfileByUrl(url: string): UserProfileItem | null {
    const row = this.db.prepare('SELECT * FROM profiles WHERE profileUrl = ?').get(url) as any;
    return row ? this.mapRowToProfile(row) : null;
  }

  public upsertProfile(p: UserProfileItem): void {
    const stmt = this.db.prepare(`
      INSERT INTO profiles (
        id, profileUrl, uid, name, birthday, birthYear, location, hometown,
        gender, avatarUrl, bio, work, education, relationship, crawledAt, status, errorMsg
      ) VALUES (
        @id, @profileUrl, @uid, @name, @birthday, @birthYear, @location, @hometown,
        @gender, @avatarUrl, @bio, @work, @education, @relationship, @crawledAt, @status, @errorMsg
      )
      ON CONFLICT(id) DO UPDATE SET
        profileUrl = excluded.profileUrl,
        uid = excluded.uid,
        name = excluded.name,
        birthday = excluded.birthday,
        birthYear = excluded.birthYear,
        location = excluded.location,
        hometown = excluded.hometown,
        gender = excluded.gender,
        avatarUrl = excluded.avatarUrl,
        bio = excluded.bio,
        work = excluded.work,
        education = excluded.education,
        relationship = excluded.relationship,
        crawledAt = excluded.crawledAt,
        status = excluded.status,
        errorMsg = excluded.errorMsg
    `);

    stmt.run({
      id: p.id,
      profileUrl: normalizeFacebookUrl(p.profileUrl),
      uid: p.uid || null,
      name: p.name,
      birthday: p.birthday || null,
      birthYear: p.birthYear || null,
      location: p.location || null,
      hometown: p.hometown || null,
      gender: p.gender || null,
      avatarUrl: p.avatarUrl || null,
      bio: p.bio || null,
      work: p.work || null,
      education: p.education || null,
      relationship: p.relationship || null,
      crawledAt: p.crawledAt || new Date().toISOString(),
      status: p.status || 'SUCCESS',
      errorMsg: p.errorMsg || null,
    });
    this.syncVideoAuthorsWithProfiles();
  }

  public saveAllProfiles(profiles: UserProfileItem[]): void {
    const upsertStmt = this.db.prepare(`
      INSERT INTO profiles (
        id, profileUrl, uid, name, birthday, birthYear, location, hometown,
        gender, avatarUrl, bio, work, education, relationship, crawledAt, status, errorMsg
      ) VALUES (
        @id, @profileUrl, @uid, @name, @birthday, @birthYear, @location, @hometown,
        @gender, @avatarUrl, @bio, @work, @education, @relationship, @crawledAt, @status, @errorMsg
      )
      ON CONFLICT(id) DO UPDATE SET
        profileUrl = excluded.profileUrl,
        uid = excluded.uid,
        name = excluded.name,
        birthday = excluded.birthday,
        birthYear = excluded.birthYear,
        location = excluded.location,
        hometown = excluded.hometown,
        gender = excluded.gender,
        avatarUrl = excluded.avatarUrl,
        bio = excluded.bio,
        work = excluded.work,
        education = excluded.education,
        relationship = excluded.relationship,
        crawledAt = excluded.crawledAt,
        status = excluded.status,
        errorMsg = excluded.errorMsg
    `);

    const transaction = this.db.transaction((items: UserProfileItem[]) => {
      const incomingIds = items.map((i) => i.id);
      if (incomingIds.length > 0) {
        const placeholders = incomingIds.map(() => '?').join(',');
        this.db.prepare(`DELETE FROM profiles WHERE id NOT IN (${placeholders})`).run(...incomingIds);
      } else {
        this.db.prepare('DELETE FROM profiles').run();
      }

      for (const p of items) {
        upsertStmt.run({
          id: p.id,
          profileUrl: normalizeFacebookUrl(p.profileUrl),
          uid: p.uid || null,
          name: p.name,
          birthday: p.birthday || null,
          birthYear: p.birthYear || null,
          location: p.location || null,
          hometown: p.hometown || null,
          gender: p.gender || null,
          avatarUrl: p.avatarUrl || null,
          bio: p.bio || null,
          work: p.work || null,
          education: p.education || null,
          relationship: p.relationship || null,
          crawledAt: p.crawledAt || new Date().toISOString(),
          status: p.status || 'SUCCESS',
          errorMsg: p.errorMsg || null,
        });
      }
    });

    transaction(profiles);
    this.syncVideoAuthorsWithProfiles();
  }

  public deleteProfile(id: string): boolean {
    const result = this.db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Chuẩn hóa tên tác giả/profile để đối chiếu so khớp
   */
  public normalizeAuthorName(name?: string): string {
    if (!name) return '';
    let s = name.normalize('NFC').toLowerCase().trim();
    s = s.replace(/\s*\|.*$/, '').trim();
    s = s.replace(/\s*-\s*(thành phố|tỉnh|tp\.?|huyện|thị xã|tt\.?|xã|quận).*$/i, '').trim();
    s = s.replace(/\s+(on|trên)\s+reels.*$/i, '').trim();
    s = s.replace(/\bantt\b/g, 'an ninh trật tự');
    s = s.replace(/\bca\b/g, 'công an');
    s = s.replace(/[,.:\-–—_]/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  public getDistinctiveTokens(norm: string): string[] {
    const common = new Set([
      'công', 'an', 'ninh', 'trật', 'tự',
      'phường', 'xã', 'thị', 'trấn', 'quận', 'huyện', 'thành', 'phố', 'tỉnh', 'tp',
      'đội', 'phòng', 'ban', 'chi'
    ]);
    return norm.split(' ').filter((w) => w && !common.has(w));
  }

  public extractSlugForMatching(rawUrl?: string): string {
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

  public isPostMatchingProfile(post: VideoItem, profile: UserProfileItem): boolean {
    const isPostTikTok = (post.link || '').includes('tiktok.com');
    const isProfileTikTok = (profile.profileUrl || '').includes('tiktok.com');
    if (isPostTikTok !== isProfileTikTok) return false;

    if (profile.uid) {
      if (post.authorUid && String(post.authorUid).trim() === String(profile.uid).trim()) return true;
      if (post.authorUrl && post.authorUrl.includes(profile.uid)) return true;
      if (post.link && post.link.includes(profile.uid)) return true;
    }

    if (profile.profileUrl && post.authorUrl) {
      const cleanProfileUrl = profile.profileUrl.replace(/\/+$/, '').toLowerCase();
      const cleanAuthorUrl = post.authorUrl.replace(/\/+$/, '').toLowerCase();
      if (cleanProfileUrl === cleanAuthorUrl) return true;
    }

    const pSlug = this.extractSlugForMatching(profile.profileUrl);
    if (pSlug) {
      const aSlug = this.extractSlugForMatching(post.authorUrl);
      if (aSlug && aSlug === pSlug) return true;
      if (pSlug.length >= 3) {
        const slugRegex = new RegExp('[/@=?&]' + pSlug + '(?:[/&?]|$)', 'i');
        if (post.authorUrl && slugRegex.test(post.authorUrl)) return true;
        if (post.link && slugRegex.test(post.link)) return true;
      }
    }

    const normAuthor = this.normalizeAuthorName(post.nguoiDang || '');
    const normName = this.normalizeAuthorName(profile.name || '');

    if (normAuthor && normName) {
      if (normAuthor === normName) return true;
      if (normAuthor.includes(normName) || normName.includes(normAuthor)) {
        const authorTokens = this.getDistinctiveTokens(normAuthor);
        const nameTokens = this.getDistinctiveTokens(normName);
        if (authorTokens.length > 0 && nameTokens.length > 0) {
          if (authorTokens.some((t) => nameTokens.includes(t))) return true;
        } else {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Tự động đồng bộ authorUid và authorUrl cho tất cả video theo danh sách profiles
   */
  public syncVideoAuthorsWithProfiles(): number {
    try {
      const videos = this.getAllVideos();
      const profiles = this.getAllProfiles();
      if (videos.length === 0 || profiles.length === 0) return 0;

      let updatedCount = 0;
      const updateStmt = this.db.prepare('UPDATE videos SET authorUid = ?, authorUrl = ? WHERE STT = ?');

      const transaction = this.db.transaction(() => {
        for (const v of videos) {
          for (const p of profiles) {
            if (this.isPostMatchingProfile(v, p)) {
              if (v.authorUid !== p.uid || v.authorUrl !== p.profileUrl) {
                updateStmt.run(p.uid || null, p.profileUrl || null, v.STT);
                v.authorUid = p.uid;
                v.authorUrl = p.profileUrl;
                updatedCount++;
              }
              break;
            }
          }
        }
      });

      transaction();
      if (updatedCount > 0) {
        this.logger.log(`[Database] Đã tự động đồng bộ authorUid / authorUrl cho ${updatedCount} bài viết theo profiles.`);
      }
      return updatedCount;
    } catch (err: any) {
      this.logger.warn(`[Database] Lỗi đồng bộ author bài viết: ${err?.message}`);
      return 0;
    }
  }

  private mapRowToProfile(row: any): UserProfileItem {
    return {
      id: row.id,
      profileUrl: normalizeFacebookUrl(row.profileUrl),
      uid: row.uid || undefined,
      name: row.name,
      birthday: row.birthday || undefined,
      birthYear: row.birthYear || undefined,
      location: row.location || undefined,
      hometown: row.hometown || undefined,
      gender: row.gender || undefined,
      avatarUrl: row.avatarUrl || undefined,
      bio: row.bio || undefined,
      work: row.work || undefined,
      education: row.education || undefined,
      relationship: row.relationship || undefined,
      crawledAt: row.crawledAt,
      status: row.status as any,
      errorMsg: row.errorMsg || undefined,
    };
  }

  // ===========================================================================
  // USERS (AUTH) METHODS
  // ===========================================================================

  public getAllUsers(): Array<UserPayload & { password: string }> {
    return this.db.prepare('SELECT * FROM users').all() as Array<UserPayload & { password: string }>;
  }

  public getUserByUsername(username: string): (UserPayload & { password: string }) | null {
    const cleanUser = (username || '').trim().toLowerCase();
    const row = this.db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(cleanUser) as any;
    return row || null;
  }

  public getUserById(id: string): (UserPayload & { password: string }) | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    return row || null;
  }

  public upsertUser(user: UserPayload & { password: string }): void {
    const stmt = this.db.prepare(`
      INSERT INTO users (id, username, name, role, password)
      VALUES (@id, @username, @name, @role, @password)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        name = excluded.name,
        role = excluded.role,
        password = excluded.password
    `);
    stmt.run(user);
  }

  public deleteUser(id: string): boolean {
    const result = this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ===========================================================================
  // SYSTEM SETTINGS & COOKIE METHODS
  // ===========================================================================

  public getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row ? row.value : null;
  }

  public getSettingWithMeta(key: string): { value: string; updatedAt: string } | null {
    const row = this.db.prepare('SELECT value, updatedAt FROM system_settings WHERE key = ?').get(key) as
      | { value: string; updatedAt: string }
      | undefined;
    return row || null;
  }

  public setSetting(key: string, value: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO system_settings (key, value, updatedAt)
      VALUES (@key, @value, @updatedAt)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updatedAt = excluded.updatedAt
    `);
    stmt.run({ key, value, updatedAt: now });
  }

  public getCookie(): string | null {
    return this.getSetting('cookie');
  }

  public getCookieWithMeta(): { value: string; updatedAt: string } | null {
    return this.getSettingWithMeta('cookie');
  }

  public saveCookie(content: string): void {
    this.setSetting('cookie', content);
  }

  public getCookieLastCheck(): any | null {
    const raw = this.getSetting('cookie_last_check');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public saveCookieLastCheck(result: any): void {
    this.setSetting('cookie_last_check', JSON.stringify(result));
  }

  public getCookieSlots(): any[] | null {
    const raw = this.getSetting('cookie_slots');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  public saveCookieSlots(slots: any[]): void {
    this.setSetting('cookie_slots', JSON.stringify(slots));
  }

  // DATABASE BACKUP, EXPORT & IMPORT METHODS
  // ===========================================================================

  public checkpoint(): void {
    if (this.db) {
      try {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
      } catch (err: any) {
        this.logger.warn(`[Database] wal_checkpoint cảnh báo: ${err?.message}`);
      }
    }
  }

  public getDatabaseStats(): {
    filePath: string;
    fileSize: number;
    videosCount: number;
    profilesCount: number;
    usersCount: number;
    lastModified: string | null;
  } {
    this.checkpoint();
    const dbPath = this.getDatabasePath();
    let fileSize = 0;
    let lastModified: string | null = null;
    if (fs.existsSync(dbPath)) {
      const stat = fs.statSync(dbPath);
      fileSize = stat.size;
      lastModified = stat.mtime.toISOString();
    }
    const videosCount = (this.db.prepare('SELECT COUNT(*) as count FROM videos').get() as { count: number }).count;
    const profilesCount = (this.db.prepare('SELECT COUNT(*) as count FROM profiles').get() as { count: number }).count;
    const usersCount = (this.db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;

    return {
      filePath: dbPath,
      fileSize,
      videosCount,
      profilesCount,
      usersCount,
      lastModified,
    };
  }

  public replaceDatabase(buffer: Buffer): void {
    // Validate SQLite magic header: "SQLite format 3\0"
    const SQLITE_HEADER = 'SQLite format 3\0';
    const header = buffer.subarray(0, 16).toString('binary');
    if (header !== SQLITE_HEADER) {
      throw new Error('Tệp tải lên không phải là cơ sở dữ liệu SQLite 3 hợp lệ.');
    }

    const dbPath = this.getDatabasePath();
    this.checkpoint();

    // Close current connection
    if (this.db) {
      try {
        this.db.close();
      } catch (err: any) {
        this.logger.warn(`[Database] Lỗi đóng kết nối DB: ${err?.message}`);
      }
      this.db = null as any;
    }

    // Backup current database.sqlite to database.sqlite.bak
    const backupPath = `${dbPath}.bak`;
    if (fs.existsSync(dbPath)) {
      try {
        fs.copyFileSync(dbPath, backupPath);
      } catch (err: any) {
        this.logger.warn(`[Database] Lỗi tạo file sao lưu: ${err?.message}`);
      }
    }

    // Clean up any existing wal / shm files
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    if (fs.existsSync(walPath)) {
      try { fs.unlinkSync(walPath); } catch {}
    }
    if (fs.existsSync(shmPath)) {
      try { fs.unlinkSync(shmPath); } catch {}
    }

    // Write new buffer
    fs.writeFileSync(dbPath, buffer);

    // Reopen database connection
    this.initDatabase();
    this.logger.log(`[Database] Đã thay thế thành công CSDL từ file tải lên.`);
  }

  /**
   * Ghi một mục nhật ký hoạt động hệ thống (Audit Log)
   */
  public addAuditLog(data: {
    username: string;
    action: string;
    details?: string;
    targetId?: string;
    ipAddress?: string;
  }): void {
    try {
      const id = 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
      const timestamp = new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO audit_logs (id, timestamp, username, action, details, targetId, ipAddress)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          timestamp,
          data.username || 'system',
          data.action,
          data.details || null,
          data.targetId || null,
          data.ipAddress || null
        );
    } catch (err: any) {
      this.logger.warn(`[Database] Lỗi ghi audit log: ${err?.message}`);
    }
  }

  /**
   * Thống kê nhanh cho trang Nhật ký hoạt động
   */
  public getAuditStats(): {
    total: number;
    today: number;
    deletes7d: number;
    loginFailed7d: number;
    topUser: { username: string; count: number } | null;
  } {
    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const count = (sql: string, ...params: any[]) =>
        ((this.db.prepare(sql).get(...params) as { c: number }) || { c: 0 }).c;

      const total = count(`SELECT COUNT(*) as c FROM audit_logs`);
      const today = count(`SELECT COUNT(*) as c FROM audit_logs WHERE timestamp >= ?`, startOfToday.toISOString());
      const deletes7d = count(
        `SELECT COUNT(*) as c FROM audit_logs WHERE timestamp >= ? AND action LIKE '%DELETE%'`,
        sevenDaysAgo
      );
      const loginFailed7d = count(
        `SELECT COUNT(*) as c FROM audit_logs WHERE timestamp >= ? AND action = 'LOGIN_FAILED'`,
        sevenDaysAgo
      );
      const top = this.db
        .prepare(
          `SELECT username, COUNT(*) as count FROM audit_logs
           WHERE timestamp >= ? AND action NOT IN ('LOGIN_FAILED')
           GROUP BY username ORDER BY count DESC LIMIT 1`
        )
        .get(sevenDaysAgo) as { username: string; count: number } | undefined;

      return { total, today, deletes7d, loginFailed7d, topUser: top || null };
    } catch (err: any) {
      this.logger.warn(`[Database] Lỗi thống kê audit logs: ${err?.message}`);
      return { total: 0, today: 0, deletes7d: 0, loginFailed7d: 0, topUser: null };
    }
  }

  /**
   * Lấy danh sách nhật ký hoạt động có phân trang và tìm kiếm
   */
  public getAuditLogs(
    limit: number = 100,
    offset: number = 0,
    search?: string,
    action?: string
  ): { logs: any[]; total: number } {
    try {
      let whereClause = '1=1';
      const params: any[] = [];

      if (action && action !== 'all') {
        whereClause += ' AND action = ?';
        params.push(action);
      }

      if (search && search.trim()) {
        whereClause += ' AND (username LIKE ? OR details LIKE ? OR targetId LIKE ?)';
        const term = `%${search.trim()}%`;
        params.push(term, term, term);
      }

      const countRow = this.db
        .prepare(`SELECT COUNT(*) as count FROM audit_logs WHERE ${whereClause}`)
        .get(...params) as { count: number };
      const total = countRow ? countRow.count : 0;

      const logs = this.db
        .prepare(`SELECT * FROM audit_logs WHERE ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset);

      return { logs, total };
    } catch (err: any) {
      this.logger.error(`[Database] Lỗi lấy danh sách audit logs: ${err?.message}`);
      return { logs: [], total: 0 };
    }
  }

  /**
   * Xóa nhật ký hoạt động cũ hơn X ngày
   */
  public clearAuditLogs(days: number = 30): number {
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const res = this.db.prepare('DELETE FROM audit_logs WHERE timestamp < ?').run(cutoff);
      return res.changes;
    } catch (err: any) {
      this.logger.error(`[Database] Lỗi dọn dẹp audit logs: ${err?.message}`);
      return 0;
    }
  }

  /**
   * Xóa hàng loạt bài viết theo danh sách STT hoặc ID
   */
  public deleteVideosBulk(ids: (string | number)[]): { deletedCount: number } {
    if (!ids || ids.length === 0) return { deletedCount: 0 };
    let deletedCount = 0;
    const deleteByStt = this.db.prepare('DELETE FROM videos WHERE STT = ?');
    const deleteById = this.db.prepare('DELETE FROM videos WHERE id = ?');

    const transaction = this.db.transaction((targets: (string | number)[]) => {
      for (const target of targets) {
        let res;
        if (typeof target === 'number' || /^\d+$/.test(String(target))) {
          res = deleteByStt.run(Number(target));
        } else {
          res = deleteById.run(String(target));
        }
        if (res && res.changes > 0) {
          deletedCount += res.changes;
        }
      }
    });

    transaction(ids);
    this.checkpoint();
    return { deletedCount };
  }
}
