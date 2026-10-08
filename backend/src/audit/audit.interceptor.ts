import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';

interface AuditRequestBody {
  ids?: string[];
  username?: string;
  role?: string;
  urls?: string[];
  url?: string;
  profileUrl?: string;
  word?: string;
  name?: string;
  key?: string;
  [key: string]: unknown;
}

interface AuditResponsePayload {
  data?: { id?: string | number; STT?: string | number; loai?: string; nguoiDang?: string; link?: string };
  count?: number;
  message?: string;
  deletedCount?: number;
  [key: string]: unknown;
}

type Req = {
  method: string;
  route?: { path?: string };
  originalUrl?: string;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: AuditRequestBody;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  user?: { username?: string };
  socket?: { remoteAddress?: string };
};

interface RuleResult {
  action: string;
  details?: string;
  targetId?: string;
}

type Rule = (req: Req, res?: AuditResponsePayload) => RuleResult | null;

const short = (v: unknown, max = 200): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v ?? '');
  return s.length > max ? s.slice(0, max) + '…' : s;
};

/**
 * Bảng ánh xạ "METHOD /đường-dẫn" -> loại hành động trong nhật ký.
 * Trả về null nghĩa là bỏ qua (không ghi log), dùng cho các thao tác chỉ đọc / kiểm tra.
 * KHÔNG BAO GIỜ ghi nội dung cookie, mật khẩu hay file import vào nhật ký.
 */
const RULES: Record<string, Rule> = {
  // Bài viết
  'POST /videos': (_q, r) => ({
    action: 'ADD_VIDEO',
    details: r?.data ? `Thêm bài viết (${r.data.loai || 'Bài viết'} - ${r.data.nguoiDang || 'Chưa rõ'}): ${r.data.link}` : undefined,
    targetId: r?.data ? String(r.data.id || r.data.STT || '') : undefined,
  }),
  'POST /videos/bulk-delete': (q, r) => ({
    action: 'BULK_DELETE_VIDEOS',
    details: `Xóa hàng loạt ${r?.count ?? (q.body?.ids?.length || 0)} bài viết`,
  }),
  'DELETE /videos/:id': (q) => ({ action: 'DELETE_VIDEO', details: 'Xóa bài viết', targetId: q.params?.id }),
  'POST /videos/:id/refresh': (q, r) => ({
    action: 'REFRESH_VIDEO',
    details: r?.data?.link ? `Làm mới số liệu: ${r.data.link}` : 'Làm mới số liệu bài viết',
    targetId: q.params?.id,
  }),
  'POST /videos/refresh-all': (_q, r) => ({ action: 'REFRESH_ALL', details: r?.message }),

  // Tài khoản
  'POST /auth/login': (q) => ({ action: 'LOGIN', details: `Đăng nhập: ${q.body?.username || ''}` }),
  'POST /auth/logout': () => ({ action: 'LOGOUT', details: 'Đăng xuất' }),
  'POST /auth/users': (q) => ({
    action: 'CREATE_USER',
    details: `Tạo tài khoản ${q.body?.username || ''} (quyền ${q.body?.role || ''})`,
  }),
  'DELETE /auth/users/:id': (q) => ({ action: 'DELETE_USER', details: 'Xóa tài khoản', targetId: q.params?.id }),

  // Cài đặt
  'POST /settings/interval': (q) => ({ action: 'UPDATE_SETTINGS', details: `Đổi chu kỳ quét: ${short(q.body)}` }),
  'POST /settings/concurrency': (q) => ({ action: 'UPDATE_SETTINGS', details: `Đổi số luồng: ${short(q.body)}` }),
  'POST /settings/database/import': () => ({ action: 'IMPORT_DATABASE', details: 'Nhập (thay thế) cơ sở dữ liệu từ file' }),

  // Cookie (không ghi nội dung cookie)
  'POST /cookie': () => ({ action: 'UPDATE_COOKIE', details: 'Cập nhật cookie' }),
  'DELETE /cookie': () => ({ action: 'DELETE_COOKIE', details: 'Xóa cookie' }),
  'POST /cookie/clear': () => ({ action: 'DELETE_COOKIE', details: 'Xóa cookie' }),
  'POST /cookie/slot/:id': (q) => ({ action: 'UPDATE_COOKIE', details: 'Cập nhật cookie cho ô', targetId: q.params?.id }),
  'PATCH /cookie/slot/:id/toggle': (q) => ({ action: 'UPDATE_COOKIE', details: 'Bật/tắt ô cookie', targetId: q.params?.id }),
  'POST /cookie/slot/:id/toggle': (q) => ({ action: 'UPDATE_COOKIE', details: 'Bật/tắt ô cookie', targetId: q.params?.id }),
  'DELETE /cookie/slot/:id': (q) => ({ action: 'DELETE_COOKIE', details: 'Xóa ô cookie', targetId: q.params?.id }),
  'POST /cookie/slot/:id/clear': (q) => ({ action: 'DELETE_COOKIE', details: 'Xóa cookie trong ô', targetId: q.params?.id }),
  'POST /cookie/slot/:id/browser-login': (q) => ({ action: 'UPDATE_COOKIE', details: 'Đăng nhập lấy cookie qua trình duyệt', targetId: q.params?.id }),
  'POST /cookie/check': () => null,
  'POST /cookie/slot/:id/check': () => null,
  'POST /cookie/slot/:id/cancel-login': () => null,

  // Trang cá nhân
  'POST /profile-management/crawl': (q) => ({
    action: 'CRAWL_PROFILE',
    details: `Quét thông tin trang cá nhân${Array.isArray(q.body?.urls) ? ` (${q.body.urls.length} link)` : ''}`,
  }),
  'POST /profile-management/sync-from-videos': () => ({ action: 'CRAWL_PROFILE', details: 'Đồng bộ trang cá nhân từ danh sách bài viết' }),
  'POST /profile-management/stop': () => ({ action: 'STOP_CRAWL', details: 'Dừng quét trang cá nhân' }),
  'DELETE /profile-management/clear': () => ({ action: 'DELETE_PROFILE', details: 'Xóa toàn bộ trang cá nhân' }),
  'POST /profile-management/clear': () => ({ action: 'DELETE_PROFILE', details: 'Xóa toàn bộ trang cá nhân' }),
  'DELETE /profile-management/:id': (q) => ({ action: 'DELETE_PROFILE', details: 'Xóa trang cá nhân', targetId: q.params?.id }),

  // Thu thập dữ liệu (quét video theo trang)
  'POST /profile-scanner/cookie': () => ({ action: 'UPDATE_COOKIE', details: 'Cập nhật cookie cho bộ thu thập' }),
  'POST /profile-scanner/scan': (q) => ({ action: 'CRAWL_PROFILE', details: `Thu thập bài viết từ trang: ${short(q.body?.url || q.body?.profileUrl || '', 150)}` }),
  'POST /profile-scanner/stop': () => ({ action: 'STOP_CRAWL', details: 'Dừng thu thập dữ liệu' }),
  'POST /profile-scanner/clear': () => ({ action: 'STOP_CRAWL', details: 'Xóa kết quả thu thập' }),

  // Từ ngữ vi phạm
  'POST /vocabulary/word': (q) => ({ action: 'UPDATE_VOCABULARY', details: `Thêm từ: ${short(q.body?.word ?? q.body, 100)}` }),
  'DELETE /vocabulary/word': (q) => ({ action: 'UPDATE_VOCABULARY', details: `Xóa từ: ${short(q.body?.word ?? q.body, 100)}` }),
  'POST /vocabulary/category': (q) => ({ action: 'UPDATE_VOCABULARY', details: `Thêm/sửa nhóm từ: ${short(q.body?.name || q.body?.key || '', 100)}` }),
  'DELETE /vocabulary/category/:key': (q) => ({ action: 'UPDATE_VOCABULARY', details: 'Xóa nhóm từ', targetId: q.params?.key }),
  'POST /vocabulary/category/:key/toggle': (q) => ({ action: 'UPDATE_VOCABULARY', details: 'Bật/tắt nhóm từ', targetId: q.params?.key }),
  'POST /vocabulary/raw': () => ({ action: 'UPDATE_VOCABULARY', details: 'Cập nhật toàn bộ danh sách từ' }),
  'POST /vocabulary/test': () => null,
  'POST /vocabulary/rescan': () => ({ action: 'RESCAN_VIOLATIONS', details: 'Quét lại vi phạm toàn bộ bài viết' }),

  // Nhật ký
  'DELETE /audit-logs/clear': (q, r) => ({
    action: 'CLEAR_AUDIT_LOGS',
    details: `Dọn ${r?.deletedCount ?? 0} bản ghi cũ hơn ${q.query?.days ?? 30} ngày`,
  }),
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly db: DatabaseService,
    private readonly authService: AuthService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Req>();
    const method = (req.method || '').toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next.handle();

    const routePath = (req.route?.path || '').replace(/^\/api/, '') || '';
    const key = `${method} ${routePath}`;
    const rule = RULES[key];

    return next.handle().pipe(
      tap((res) => {
        const result = rule ? rule(req, res) : { action: method, details: routePath };
        if (result) this.write(req, result);
      }),
      catchError((err) => {
        // Ghi lại đăng nhập thất bại để phát hiện dò mật khẩu
        if (key === 'POST /auth/login') {
          this.write(req, {
            action: 'LOGIN_FAILED',
            details: `Đăng nhập thất bại: ${req.body?.username || ''}`,
          });
        }
        return throwError(() => err);
      })
    );
  }

  private write(req: Req, result: RuleResult) {
    this.db.addAuditLog({
      username: this.resolveUsername(req),
      action: result.action,
      details: result.details,
      targetId: result.targetId,
      ipAddress: this.resolveIp(req),
    });
  }

  private resolveUsername(req: Req): string {
    if (req.user?.username) return req.user.username;
    try {
      const authHeader = req.headers?.['authorization'];
      const token = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      const u = token ? this.authService.verifyToken(token) : null;
      if (u?.username) return u.username;
    } catch {
      // ignore
    }
    if (req.body?.username && typeof req.body.username === 'string') return req.body.username;
    return 'khách';
  }

  private resolveIp(req: Req): string | undefined {
    const fwd = req.headers?.['x-forwarded-for'];
    const raw = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress;
    return raw ? raw.replace(/^::ffff:/, '') : undefined;
  }
}
