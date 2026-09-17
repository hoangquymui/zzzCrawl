import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Save,
  Trash2,
  RotateCcw,
  Key,
  FileCode,
  Info,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Activity,
  Clock,
  User,
} from 'lucide-react';
import { cookieApi, CookieInfo, CookieCheckResult } from '../services/cookie.service';

export const CookiePage: React.FC = () => {
  const [cookieInfo, setCookieInfo] = useState<CookieInfo | null>(null);
  const [rawInput, setRawInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CookieCheckResult | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [isCopied, setIsCopied] = useState(false);

  const fetchCookieInfo = async () => {
    try {
      setIsLoading(true);
      const data = await cookieApi.getCookieInfo();
      setCookieInfo(data);
      setRawInput(data.rawCookie || '');
      if (data.lastCheck) {
        setCheckResult(data.lastCheck);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Lỗi khi tải thông tin cookie' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCookieInfo();
  }, []);

  const handleCheckCookie = async () => {
    try {
      setIsChecking(true);
      setFeedback(null);
      const result = await cookieApi.checkCookie();
      setCheckResult(result);
      if (result.isValid) {
        setFeedback({
          type: 'success',
          message: result.message,
        });
      } else {
        setFeedback({
          type: 'error',
          message: result.message,
        });
      }
      const data = await cookieApi.getCookieInfo();
      setCookieInfo(data);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Lỗi khi kiểm tra cookie' });
    } finally {
      setIsChecking(false);
    }
  };

  const handleSave = async () => {
    if (!rawInput.trim()) {
      setFeedback({ type: 'error', message: 'Vui lòng nhập hoặc dán nội dung cookie.' });
      return;
    }
    try {
      setIsSaving(true);
      setFeedback(null);
      setCheckResult(null);
      const updated = await cookieApi.saveCookie(rawInput);
      setCookieInfo(updated);
      setFeedback({
        type: 'success',
        message: `Đã lưu thành công vào cookies.json (${updated.cookieCount} cookies hợp lệ). Hãy bấm "Kiểm tra Cookie" để xác thực phiên đăng nhập.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Lỗi khi lưu cookie' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa toàn bộ cookie trong cookies.json?')) return;
    try {
      setIsClearing(true);
      setFeedback(null);
      setCheckResult(null);
      const updated = await cookieApi.clearCookie();
      setCookieInfo(updated);
      setRawInput('');
      setFeedback({
        type: 'success',
        message: 'Đã xóa toàn bộ cookie thành công. Trạng thái hiện tại: Chưa nạp.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Lỗi khi xóa cookie' });
    } finally {
      setIsClearing(false);
    }
  };

  const handleCopyRaw = () => {
    if (!rawInput) return;
    navigator.clipboard.writeText(rawInput).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const hasCookie = Boolean(cookieInfo && cookieInfo.hasCookie && cookieInfo.cookieCount > 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl shrink-0">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Quản lý Cookie
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Dán cookie tài khoản Facebook vào đây để lưu vào file <code>cookies.json</code> dùng chung cho toàn bộ hệ thống cào dữ liệu.
            </p>
          </div>
        </div>

        {/* Action Controls & Status Badge */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Status Badge */}
          {checkResult?.isValid ? (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold border shadow-xs bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>Cookie: Còn hạn (Live)</span>
              <ShieldCheck className="w-4 h-4 text-emerald-500 ml-0.5" />
            </div>
          ) : checkResult && !checkResult.isValid ? (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold border shadow-xs bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span>Cookie: Hết hạn (Die)</span>
              <ShieldAlert className="w-4 h-4 text-rose-500 ml-0.5" />
            </div>
          ) : hasCookie ? (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold border shadow-xs bg-blue-500/10 border-blue-500/25 text-blue-600 dark:text-blue-400">
              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              <span>Cookie: Đã nạp</span>
              <ShieldCheck className="w-4 h-4 text-blue-500 ml-0.5" />
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold border shadow-xs bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span>Cookie: Chưa nạp</span>
              <ShieldAlert className="w-4 h-4 text-rose-500 ml-0.5" />
            </div>
          )}

          {/* Button: Kiểm tra Cookie */}
          <button
            type="button"
            onClick={handleCheckCookie}
            disabled={isChecking || !hasCookie}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 active:scale-98 text-white shadow-xs disabled:opacity-40 transition cursor-pointer"
            title="Kiểm tra xem cookie còn hạn hay đã bị Facebook đăng xuất"
          >
            <Activity className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Đang kiểm tra...' : 'Kiểm tra Cookie'}</span>
          </button>

          {/* Button: Refresh */}
          <button
            type="button"
            onClick={fetchCookieInfo}
            disabled={isLoading || isChecking}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition cursor-pointer shadow-xs"
            title="Tải lại trạng thái"
          >
            <RotateCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI / Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div
            className={`p-3 rounded-xl shrink-0 ${
              checkResult?.isValid
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : checkResult && !checkResult.isValid
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                : hasCookie
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}
          >
            {checkResult?.isValid ? (
              <ShieldCheck className="w-6 h-6" />
            ) : (
              <ShieldAlert className="w-6 h-6" />
            )}
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Trạng thái phiên</p>
            <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-0.5">
              {checkResult?.isValid
                ? 'Còn hạn (Live)'
                : checkResult && !checkResult.isValid
                ? 'Đã hết hạn / Lỗi'
                : hasCookie
                ? 'Đã nạp (Chưa check)'
                : 'Chưa nạp'}
            </p>
          </div>
        </div>

        {/* Count */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
            <FileCode className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Số lượng Cookie</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
              {cookieInfo ? cookieInfo.cookieCount : 0}
            </p>
          </div>
        </div>

        {/* c_user & Tên tài khoản */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
            <User className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Tài khoản Facebook</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 truncate">
              {checkResult?.userName || cookieInfo?.detectedCookies?.c_user || 'Chưa nhận diện'}
            </p>
            {cookieInfo?.detectedCookies?.c_user && (
              <p className="text-[11px] font-mono text-slate-400 truncate">
                UID: {cookieInfo.detectedCookies.c_user}
              </p>
            )}
          </div>
        </div>

        {/* Lần kiểm tra cuối */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Kiểm tra gần nhất</p>
            <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white mt-0.5 truncate">
              {checkResult?.checkedAt
                ? `${new Date(checkResult.checkedAt).toLocaleTimeString('vi-VN')} ${new Date(checkResult.checkedAt).toLocaleDateString('vi-VN')}`
                : 'Chưa kiểm tra'}
            </p>
            {!checkResult && hasCookie && (
              <button
                type="button"
                onClick={handleCheckCookie}
                disabled={isChecking}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium mt-0.5"
              >
                Bấm kiểm tra ngay
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Check Result Banner */}
      {checkResult && (
        <div
          className={`p-4 rounded-2xl border flex items-start gap-3.5 transition animate-in fade-in duration-200 ${
            checkResult.isValid
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-900 dark:text-emerald-200'
              : 'bg-rose-500/10 border-rose-500/25 text-rose-900 dark:text-rose-200'
          }`}
        >
          {checkResult.isValid ? (
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="text-xs sm:text-sm space-y-1">
            <p className="font-bold">
              {checkResult.isValid ? 'Cookie đang hoạt động tốt!' : 'Cảnh báo: Cookie đã hết hạn hoặc không hợp lệ!'}
            </p>
            <p className="opacity-90">{checkResult.message}</p>
            {!checkResult.isValid && (
              <p className="text-xs font-semibold pt-1">
                👉 Vui lòng đăng nhập lại Facebook trên trình duyệt, copy toàn bộ JSON Cookie mới và dán vào ô bên dưới, sau đó bấm <strong>Lưu Cookie</strong>.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Main Textarea Form Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Key className="w-4 h-4 text-blue-500" />
            Nội dung Cookie (JSON Array hoặc chuỗi text c_user=...; xs=...)
          </label>

          {rawInput && (
            <button
              type="button"
              onClick={handleCopyRaw}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
            >
              {isCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 font-semibold">Đã sao chép</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Sao chép</span>
                </>
              )}
            </button>
          )}
        </div>

        <textarea
          rows={12}
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder={`[&#10;  {&#10;    "domain": ".facebook.com",&#10;    "name": "c_user",&#10;    "value": "61594031320050",&#10;    "path": "/"&#10;  },&#10;  {&#10;    "domain": ".facebook.com",&#10;    "name": "xs",&#10;    "value": "...",&#10;    "path": "/"&#10;  }&#10;]&#10;Hoặc chuỗi dạng: c_user=61594031320050; xs=...; fr=...`}
          className="w-full text-xs font-mono p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/70 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition resize-y leading-relaxed"
        />

        {feedback && (
          <div
            className={`flex items-center gap-2.5 p-3.5 rounded-xl border text-xs font-medium animate-in fade-in duration-200 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Đường dẫn lưu file: <code className="font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">backend/cookies.json</code>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleClear}
              disabled={isClearing || isSaving}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 disabled:opacity-40 transition cursor-pointer shadow-xs"
            >
              <Trash2 className="w-4 h-4 text-rose-500" />
              Xóa Cookie
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isClearing}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-98 text-white shadow-md shadow-blue-500/20 disabled:opacity-50 transition cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Đang lưu...' : 'Lưu Cookie'}
            </button>
          </div>
        </div>
      </div>

      {/* Guide Card */}
      <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 text-xs text-slate-600 dark:text-slate-400 space-y-2.5">
        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-sm">
          <Info className="w-4 h-4 text-blue-500" />
          Hướng dẫn lấy Cookie Facebook
        </h3>
        <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed">
          <li>Đăng nhập tài khoản Facebook của bạn trên trình duyệt Chrome / Edge.</li>
          <li>
            Sử dụng tiện ích mở rộng như <strong>J2TEAM Cookies</strong> hoặc <strong>EditThisCookie</strong> hoặc <strong>Cookie-Editor</strong> để xuất toàn bộ Cookie dưới dạng JSON (Export JSON).
          </li>
          <li>Sao chép toàn bộ chuỗi JSON vừa xuất và dán vào ô bên trên.</li>
          <li>
            Nhấn nút <strong>"Lưu Cookie"</strong>. Hệ thống sẽ tự động phân tích và lưu vào <code>cookies.json</code> để phục vụ cào trang cá nhân, video, reel tự động.
          </li>
        </ol>
      </div>
    </div>
  );
};
