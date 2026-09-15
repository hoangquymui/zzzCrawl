import React, { useState } from 'react';
import { X, Lock, User, ShieldCheck, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginModal: React.FC = () => {
  const { isLoginModalOpen, closeLoginModal, login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLoginModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Vui lòng nhập đầy đủ tên tài khoản và mật khẩu.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await login(username.trim(), password.trim());
      setUsername('');
      setPassword('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Tài khoản hoặc mật khẩu không chính xác.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickLogin = async (userChoice: 'admin' | 'user') => {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const u = userChoice === 'admin' ? 'admin' : 'user';
      const p = userChoice === 'admin' ? 'admin' : 'user';
      await login(u, p);
      setUsername('');
      setPassword('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Đăng nhập thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={closeLoginModal}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Header decoration bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500" />

        <div className="p-6">
          {/* Close button */}
          <button
            type="button"
            onClick={closeLoginModal}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Title & Icon */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shadow-xs">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Đăng nhập hệ thống
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chọn vai trò hoặc đăng nhập bằng tài khoản của bạn
              </p>
            </div>
          </div>

          {/* Quick Demo Login Buttons */}
          <div className="space-y-2 mb-5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              Đăng nhập nhanh 1 chạm (Demo)
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleQuickLogin('admin')}
                className="flex flex-col items-start p-3 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/30 hover:bg-indigo-100/70 dark:hover:bg-indigo-900/40 transition text-left cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </div>
                <span className="text-[10px] text-indigo-600/80 dark:text-indigo-400/80 mt-0.5">
                  Toàn quyền quản trị &amp; Cookie
                </span>
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleQuickLogin('user')}
                className="flex flex-col items-start p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/30 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40 transition text-left cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
                  <User className="w-3.5 h-3.5" />
                  <span>User</span>
                </div>
                <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                  Chỉ xem, không sửa đổi dữ liệu
                </span>
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-800" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-white dark:bg-slate-900 px-2 text-slate-400 font-semibold tracking-wider">
                hoặc điền thông tin
              </span>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tài khoản (Username)
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin hoặc user"
                  className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mật khẩu (Password)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs transition flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 disabled:opacity-50 cursor-pointer"
            >
              <span>{isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Hint */}
          <div className="mt-4 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            <p>
              • <strong>Admin</strong>: Xem và quản trị toàn bộ dữ liệu, cào dữ liệu, nạp cookie.
            </p>
            <p className="mt-0.5">
              • <strong>User</strong>: Chỉ xem dữ liệu, không có các nút thêm/sửa/xóa, ẩn trang Cookie.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
