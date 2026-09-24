import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import type { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { VideoItem } from '../videos/interfaces/video.interface';
import { UserProfileItem } from '../videos/interfaces/profile-management.interface';
import { UserPayload } from '../auth/auth.service';

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
    if (process.cwd().endsWith('backend')) {
      return path.join(process.cwd(), 'database.sqlite');
    }
    const backendPath = path.join(process.cwd(), 'backend', 'database.sqlite');
    if (fs.existsSync(path.join(process.cwd(), 'backend'))) {
      return backendPath;
    }
    return path.join(process.cwd(), 'database.sqlite');
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
    this.migrateFromLegacyJson();
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
        originalPostUrl TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_videos_postId ON videos(postId);
      CREATE INDEX IF NOT EXISTS idx_videos_nguoiDang ON videos(nguoiDang);
    `);

    // Migration an toàn cho các cột mới nếu bảng videos đã tồn tại từ trước
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
  }

  private migrateFromLegacyJson(): void {
    // 1. Di chuyển videos_data.json nếu bảng videos đang rỗng
    const videoCount = (this.db.prepare('SELECT COUNT(*) as count FROM videos').get() as { count: number }).count;
    if (videoCount === 0) {
      const candidates = [
        path.join(process.cwd(), 'backend', 'videos_data.json'),
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
        path.join(process.cwd(), 'backend', 'profiles_data.json'),
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
        path.join(process.cwd(), 'backend', 'cookies.json'),
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

  public getVideoByStt(stt: number): VideoItem | null {
    const row = this.db.prepare('SELECT * FROM videos WHERE STT = ?').get(stt) as any;
    return row ? this.mapRowToVideo(row) : null;
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
        STT, link, caption, loai, nguoiDang, authorUid, authorUrl, ngayDang,
        SoLuongNguoiShare, LuotXem, LuotLike, LuotComment, lastUpdated, postId,
        isShared, originalAuthor, originalAuthorUrl, originalPostUrl
      ) VALUES (
        @STT, @link, @caption, @loai, @nguoiDang, @authorUid, @authorUrl, @ngayDang,
        @SoLuongNguoiShare, @LuotXem, @LuotLike, @LuotComment, @lastUpdated, @postId,
        @isShared, @originalAuthor, @originalAuthorUrl, @originalPostUrl
      )
      ON CONFLICT(STT) DO UPDATE SET
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
        originalPostUrl = excluded.originalPostUrl
    `);
    stmt.run({
      STT: v.STT,
      link: v.link || '',
      caption: v.caption || '',
      loai: v.loai || '',
      nguoiDang: v.nguoiDang || '',
      authorUid: v.authorUid || null,
      authorUrl: v.authorUrl || null,
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
    });
  }

  public saveAllVideos(videos: VideoItem[]): void {
    const upsertStmt = this.db.prepare(`
      INSERT INTO videos (
        STT, link, caption, loai, nguoiDang, authorUid, authorUrl, ngayDang,
        SoLuongNguoiShare, LuotXem, LuotLike, LuotComment, lastUpdated, postId,
        isShared, originalAuthor, originalAuthorUrl, originalPostUrl
      ) VALUES (
        @STT, @link, @caption, @loai, @nguoiDang, @authorUid, @authorUrl, @ngayDang,
        @SoLuongNguoiShare, @LuotXem, @LuotLike, @LuotComment, @lastUpdated, @postId,
        @isShared, @originalAuthor, @originalAuthorUrl, @originalPostUrl
      )
      ON CONFLICT(STT) DO UPDATE SET
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
        originalPostUrl = excluded.originalPostUrl
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
          STT: v.STT,
          link: v.link || '',
          caption: v.caption || '',
          loai: v.loai || '',
          nguoiDang: v.nguoiDang || '',
          authorUid: v.authorUid || null,
          authorUrl: v.authorUrl || null,
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
        });
      }
    });

    transaction(videos);
  }

  public deleteVideo(stt: number): boolean {
    const result = this.db.prepare('DELETE FROM videos WHERE STT = ?').run(stt);
    return result.changes > 0;
  }

  private mapRowToVideo(row: any): VideoItem {
    return {
      STT: row.STT,
      link: row.link,
      caption: row.caption || '',
      loai: row.loai || '',
      nguoiDang: row.nguoiDang || '',
      authorUid: row.authorUid || undefined,
      authorUrl: row.authorUrl || undefined,
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
      profileUrl: p.profileUrl,
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
          profileUrl: p.profileUrl,
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
  }

  public deleteProfile(id: string): boolean {
    const result = this.db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private mapRowToProfile(row: any): UserProfileItem {
    return {
      id: row.id,
      profileUrl: row.profileUrl,
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

  // ===========================================================================
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
}
