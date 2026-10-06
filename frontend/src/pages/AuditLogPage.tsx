import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Search,
  Trash2,
  RotateCw,
  User,
  Layers,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lock,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';
import { auditApi, AuditLogItem, AuditStatsResponse } from '../services/audit.service';
import { useAuth } from '../context/AuthContext';

export const AuditLogPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<AuditStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 30;

  // Clear modal
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [isClearing, setIsClearing] = useState(false);
  const [clearSuccessMsg, setClearSuccessMsg] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await auditApi.getStats();
      if (res && res.success) {
        setStats(res);
      }
    } catch {
      // Do not block log fetching if stats fail
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const [logsRes] = await Promise.all([
        auditApi.getLogs(PAGE_SIZE, offset, searchTerm, selectedAction),
        fetchStats(),
      ]);
      if (logsRes && logsRes.success) {
        setLogs(logsRes.logs || []);
        setTotal(logsRes.total || 0);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải nhật ký hoạt động';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [page, searchTerm, selectedAction, fetchStats]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Handle clear logs
  const handleClearLogs = async () => {
    setIsClearing(true);
    try {
      const res = await auditApi.clearOldLogs(retentionDays);
      setClearSuccessMsg(`Đã dọn dẹp ${res.deletedCount} bản ghi nhật ký cũ hơn ${retentionDays} ngày!`);
      setIsClearModalOpen(false);
      fetchLogs();
      setTimeout(() => setClearSuccessMsg(null), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi khi dọn dẹp nhật ký');
    } finally {
      setIsClearing(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Action badge renderer
  const renderActionBadge = (action: string) => {
    const act = (action || '').toUpperCase();
    if (act.includes('DELETE')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
          <Trash2 className="w-3 h-3 text-rose-500" />
          <span>{action}</span>
        </span>
      );
    }
    if (act.includes('ADD') || act.includes('CREATE')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          <span>{action}</span>
        </span>
      );
    }
    if (act.includes('REFRESH') || act.includes('CRAWL')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50">
          <RotateCw className="w-3 h-3 text-blue-500" />
          <span>{action}</span>
        </span>
      );
    }
    if (act.includes('UPDATE') || act.includes('SETTING') || act.includes('COOKIE') || act.includes('VOCABULARY')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
          <Layers className="w-3 h-3 text-amber-500" />
          <span>{action}</span>
        </span>
      );
    }
    if (act.includes('LOGIN') || act.includes('AUTH')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/50">
          <Lock className="w-3 h-3 text-indigo-500" />
          <span>{action}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
        <Activity className="w-3 h-3 text-slate-400" />
        <span>{action}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 mb-2">
            <Activity className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>NHẬT KÝ HỆ THỐNG &amp; TRUY VẾT BẢO MẬT</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Nhật Ký Hoạt Động (System Audit Logs)
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
            Lưu vết tự động toàn bộ thao tác thêm, xóa, cập nhật bài viết, quét trang cá nhân, sửa từ vựng và đăng nhập hệ thống nhằm đảm bảo tính toàn vẹn dữ liệu.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchLogs}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer shadow-xs disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
            <span>Làm mới</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setIsClearModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>Dọn dẹp nhật ký</span>
            </button>
          )}
        </div>
      </div>

      {/* Success notification */}
      {clearSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{clearSuccessMsg}</span>
        </div>
      )}

      {/* 2. Thống kê */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Tổng thao tác & Hôm nay */}
        <div className="p-4 bg-white border shadow-sm dark:bg-slate-900/80 rounded-2xl border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Tổng thao tác hệ thống</span>
            <Activity className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {stats?.total ?? total}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            <span>+{stats?.today ?? 0} thao tác hôm nay</span>
          </div>
        </div>

        {/* Card 2: Lượt xóa 7 ngày */}
        <div className="p-4 bg-white border shadow-sm dark:bg-slate-900/80 rounded-2xl border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Lượt xóa dữ liệu (7 ngày)</span>
            <Trash2 className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
            {stats?.deletes7d ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Bao gồm xóa bài &amp; xóa hàng loạt
          </div>
        </div>

        {/* Card 3: Tài khoản tích cực */}
        <div className="p-4 bg-white border shadow-sm dark:bg-slate-900/80 rounded-2xl border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Hoạt động nhiều nhất (7 ngày)</span>
            <UserCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-slate-900 dark:text-white truncate" title={stats?.topUser?.username}>
            {stats?.topUser?.username || 'Chưa ghi nhận'}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {stats?.topUser ? `${stats.topUser.count} lần thao tác` : 'Chưa có hoạt động trong 7 ngày'}
          </div>
        </div>

        {/* Card 4: Đăng nhập thất bại */}
        <div className="p-4 bg-white border shadow-sm dark:bg-slate-900/80 rounded-2xl border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Đăng nhập thất bại (7 ngày)</span>
            <AlertTriangle className={`w-4 h-4 ${stats?.loginFailed7d ? 'text-amber-500' : 'text-slate-400'}`} />
          </div>
          <div className={`mt-2 text-2xl font-bold font-mono ${stats?.loginFailed7d ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
            {stats?.loginFailed7d ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {stats?.loginFailed7d ? 'Cảnh báo dò mật khẩu / sai tài khoản' : 'Không có sự cố đăng nhập'}
          </div>
        </div>
      </div>

      {/* 3. Filter Bar */}
      <div className="p-4 bg-white border shadow-sm dark:bg-slate-900/80 rounded-2xl border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo tài khoản, đối tượng, nội dung..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Action Type Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs text-slate-500 shrink-0">Loại hành động:</span>
          <select
            value={selectedAction}
            onChange={(e) => {
              setSelectedAction(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">Tất cả hành động</option>
            <option value="ADD_VIDEO">ADD_VIDEO (Thêm bài viết)</option>
            <option value="DELETE_VIDEO">DELETE_VIDEO (Xóa bài viết)</option>
            <option value="BULK_DELETE_VIDEOS">BULK_DELETE_VIDEOS (Xóa hàng loạt)</option>
            <option value="REFRESH_ALL">REFRESH_ALL (Làm mới toàn bộ)</option>
            <option value="REFRESH_VIDEO">REFRESH_VIDEO (Làm mới một bài)</option>
            <option value="CRAWL_PROFILE">CRAWL_PROFILE (Quét thông tin profile)</option>
            <option value="LOGIN">LOGIN (Đăng nhập)</option>
            <option value="UPDATE_SETTINGS">UPDATE_SETTINGS (Cài đặt hệ thống)</option>
            <option value="UPDATE_COOKIE">UPDATE_COOKIE (Cập nhật cookie)</option>
            <option value="CLEAR_AUDIT_LOGS">CLEAR_AUDIT_LOGS (Dọn dẹp nhật ký)</option>
          </select>
        </div>
      </div>

      {/* 4. Logs Table */}
      <div className="overflow-hidden bg-white border shadow-sm dark:bg-slate-900/80 rounded-2xl border-slate-200 dark:border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70 text-slate-600 dark:text-slate-400 uppercase font-semibold tracking-wider text-[11px] select-none">
                <th className="py-3 px-3 w-16 text-center border-r border-slate-200 dark:border-slate-800">STT</th>
                <th className="py-3 px-3.5 w-44 border-r border-slate-200 dark:border-slate-800">Thời gian</th>
                <th className="py-3 px-3 w-36 border-r border-slate-200 dark:border-slate-800">Người thực hiện</th>
                <th className="py-3 px-3 w-48 border-r border-slate-200 dark:border-slate-800">Hành động</th>
                <th className="py-3 px-3.5 w-52 border-r border-slate-200 dark:border-slate-800">Đối tượng mục tiêu</th>
                <th className="py-3 px-3.5 min-w-[200px] border-r border-slate-200 dark:border-slate-800">Chi tiết thao tác</th>
                <th className="py-3 px-3 w-28 text-center">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RotateCw className="w-4 h-4 animate-spin text-blue-500" />
                      <span>Đang tải danh sách nhật ký...</span>
                    </div>
                  </td>
                </tr>
              ) : errorMessage ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-rose-500">
                    <AlertCircle className="w-6 h-6 mx-auto mb-2 text-rose-500" />
                    <span>{errorMessage}</span>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Activity className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="font-medium text-slate-700 dark:text-slate-300">Chưa có nhật ký hoạt động nào</p>
                    <p className="text-[11px] text-slate-400 mt-1">Các thao tác trên hệ thống sẽ tự động được ghi nhận tại đây.</p>
                  </td>
                </tr>
              ) : (
                logs.map((item, idx) => {
                  const stt = (page - 1) * PAGE_SIZE + idx + 1;
                  const dateStr = item.timestamp
                    ? new Date(item.timestamp).toLocaleString('vi-VN')
                    : 'N/A';

                  return (
                    <tr
                      key={item.id || idx}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition duration-150"
                    >
                      {/* STT */}
                      <td className="py-2.5 px-3 text-center font-mono font-medium text-slate-500 dark:text-slate-400 border-r border-slate-100 dark:border-slate-800/60">
                        {stt}
                      </td>

                      {/* Thời gian */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800/60 font-mono text-[11px]">
                        {dateStr}
                      </td>

                      {/* Người thực hiện */}
                      <td className="py-2.5 px-3 whitespace-nowrap border-r border-slate-100 dark:border-slate-800/60">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{item.username || 'System'}</span>
                        </div>
                      </td>

                      {/* Hành động */}
                      <td className="py-2.5 px-3 whitespace-nowrap border-r border-slate-100 dark:border-slate-800/60">
                        {renderActionBadge(item.action)}
                      </td>

                      {/* Mục tiêu */}
                      <td className="py-2.5 px-3.5 max-w-[200px] truncate text-slate-700 dark:text-slate-300 font-mono text-[11px] border-r border-slate-100 dark:border-slate-800/60" title={item.targetId}>
                        {item.targetId || '-'}
                      </td>

                      {/* Chi tiết thao tác */}
                      <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-300 leading-relaxed border-r border-slate-100 dark:border-slate-800/60">
                        <div className="line-clamp-2" title={item.details}>
                          {item.details || '-'}
                        </div>
                      </td>

                      {/* IP */}
                      <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-400">
                        {item.ipAddress || '127.0.0.1'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/40 text-xs text-slate-600 dark:text-slate-400">
            <div>
              Hiển thị <span className="font-semibold text-slate-900 dark:text-white">{(page - 1) * PAGE_SIZE + 1}</span> - <span className="font-semibold text-slate-900 dark:text-white">{Math.min(page * PAGE_SIZE, total)}</span> trong tổng số <span className="font-semibold text-slate-900 dark:text-white">{total}</span> sự kiện
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium">
                Trang {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Clear Logs Modal */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-2xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Dọn dẹp nhật ký hoạt động
                </h3>
                <p className="text-xs text-slate-400">
                  Xóa các bản ghi nhật ký cũ để tối ưu hóa dung lượng cơ sở dữ liệu.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Chọn mốc thời gian lưu giữ:
              </label>
              <div className="space-y-1.5">
                {[
                  { days: 7, label: 'Xóa nhật ký cũ hơn 7 ngày' },
                  { days: 30, label: 'Xóa nhật ký cũ hơn 30 ngày (Khuyến nghị)' },
                  { days: 90, label: 'Xóa nhật ký cũ hơn 90 ngày' },
                ].map((opt) => (
                  <label
                    key={opt.days}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                      retentionDays === opt.days
                        ? 'border-rose-400 dark:border-rose-600 bg-rose-50/40 dark:bg-rose-950/20 font-semibold'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="radio"
                      name="retention"
                      checked={retentionDays === opt.days}
                      onChange={() => setRetentionDays(opt.days)}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-slate-800 dark:text-slate-200">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsClearModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleClearLogs}
                disabled={isClearing}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20 transition cursor-pointer disabled:opacity-50"
              >
                {isClearing ? 'Đang dọn dẹp...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogPage;
