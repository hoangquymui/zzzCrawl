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
  Layers,
  ArrowRightLeft,
  Sparkles,
  Globe,
  Loader2,
  X,
} from 'lucide-react';
import {
  cookieApi,
  CookieSlot,
  CookieCheckResult,
} from '../services/cookie.service';
import { socket } from '../services/socket';

export const CookiePage: React.FC = () => {
  const [slots, setSlots] = useState<CookieSlot[]>([]);
  const [activeTab, setActiveTab] = useState<number>(1);
  const [activeCount, setActiveCount] = useState<number>(0);
  const [rawInput, setRawInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isToggling, setIsToggling] = useState<boolean>(false);
  const [isBrowserLoggingIn, setIsBrowserLoggingIn] = useState<boolean>(false);
  const [loginModalStatus, setLoginModalStatus] = useState<string>('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Lấy slot hiện tại theo activeTab
  const currentSlot: CookieSlot | undefined = slots.find(
    (s) => s.id === activeTab
  );

  // Tải danh sách các slot cookie từ backend
  const fetchSlots = async (selectSlotId?: number) => {
    try {
      setIsLoading(true);
      const data = await cookieApi.getCookieSlots();
      setSlots(data.slots || []);
      setActiveCount(data.activeCount || 0);

      const targetId = selectSlotId !== undefined ? selectSlotId : activeTab;
      const targetSlot =
        (data.slots || []).find((s) => s.id === targetId) || data.slots[0];
      if (targetSlot) {
        setActiveTab(targetSlot.id);
        setRawInput(targetSlot.rawCookie || '');
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Lỗi khi tải thông tin cookie từ hệ thống',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSlots(1);
  }, []);

  // Lắng nghe sự kiện WebSocket khi đăng nhập trình duyệt
  useEffect(() => {
    const handleLoginStatus = (data: {
      slotId: number;
      status: 'OPENING' | 'WAITING_LOGIN' | 'SUCCESS' | 'ERROR' | 'CANCELLED';
      message: string;
      slot?: CookieSlot;
      error?: string;
    }) => {
      if (data.slotId === activeTab || isBrowserLoggingIn) {
        setLoginModalStatus(data.message);

        if (data.status === 'SUCCESS') {
          setIsBrowserLoggingIn(false);
          if (data.slot) {
            setSlots((prev) =>
              prev.map((s) => (s.id === data.slot!.id ? data.slot! : s))
            );
            if (data.slot.id === activeTab) {
              setRawInput(data.slot.rawCookie || '');
            }
          }
          fetchSlots(activeTab);
          setFeedback({ type: 'success', message: data.message });
        } else if (data.status === 'ERROR') {
          setIsBrowserLoggingIn(false);
          setFeedback({ type: 'error', message: data.message });
        } else if (data.status === 'CANCELLED') {
          setIsBrowserLoggingIn(false);
          setFeedback({ type: 'warning', message: data.message });
        }
      }
    };

    socket.on('cookie_login_status', handleLoginStatus);
    return () => {
      socket.off('cookie_login_status', handleLoginStatus);
    };
  }, [activeTab, isBrowserLoggingIn]);

  // Xử lý chuyển tab
  const handleSelectTab = (slotId: number) => {
    setActiveTab(slotId);
    setFeedback(null);
    const targetSlot = slots.find((s) => s.id === slotId);
    setRawInput(targetSlot?.rawCookie || '');
  };

  // Helper trích xuất UID c_user từ chuỗi raw
  const extractUidFromRaw = (text: string): string | null => {
    const clean = (text || '').trim();
    if (!clean) return null;
    try {
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) {
        const item = parsed.find((c) => c && c.name === 'c_user');
        if (item && item.value) return String(item.value).trim();
      }
    } catch {}

    const match = clean.match(/(?:^|;\s*)c_user=([^;]+)/);
    if (match && match[1]) {
      return match[1].trim();
    }
    return null;
  };

  // Bật / Tắt Cookie hiện tại
  const handleToggle = async () => {
    if (!currentSlot) return;
    const newEnabledState = !currentSlot.enabled;

    try {
      setIsToggling(true);
      setFeedback(null);
      const updated = await cookieApi.toggleCookieSlot(
        currentSlot.id,
        newEnabledState
      );

      // Cập nhật lại state local
      setSlots((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      );
      setActiveCount((prev) =>
        newEnabledState ? prev + 1 : Math.max(0, prev - 1)
      );

      setFeedback({
        type: newEnabledState ? 'success' : 'warning',
        message: `Đã ${newEnabledState ? 'BẬT' : 'TẮT'} Cookie ${currentSlot.id}. ${
          newEnabledState
            ? 'Cookie này sẽ được đưa vào danh sách luân phiên tự động.'
            : 'Cookie này sẽ tạm dừng và không được dùng để cào dữ liệu.'
        }`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message:
          err.message || `Lỗi khi thay đổi trạng thái Cookie ${currentSlot.id}`,
      });
    } finally {
      setIsToggling(false);
    }
  };

  // Mở trình duyệt thật để người dùng tự đăng nhập và hệ thống tự lấy Cookie
  const handleStartBrowserLogin = async () => {
    try {
      setIsBrowserLoggingIn(true);
      setLoginModalStatus(
        `Đang khởi chạy cửa sổ Chrome cho Cookie ${activeTab}... Vui lòng đợi trong giây lát.`
      );
      setFeedback(null);
      await cookieApi.startBrowserLogin(activeTab);
    } catch (err: any) {
      setIsBrowserLoggingIn(false);
      setFeedback({
        type: 'error',
        message: err.message || `Không thể mở trình duyệt cho Cookie ${activeTab}`,
      });
    }
  };

  // Hủy phiên đăng nhập trình duyệt
  const handleCancelBrowserLogin = async () => {
    try {
      await cookieApi.cancelBrowserLogin(activeTab);
    } catch {}
    setIsBrowserLoggingIn(false);
    setFeedback({
      type: 'warning',
      message: `Đã hủy phiên đăng nhập Cookie ${activeTab}.`,
    });
  };

  // Lưu Cookie cho slot hiện tại (nhập tay hoặc dán)
  const handleSave = async () => {
    if (!rawInput.trim()) {
      setFeedback({
        type: 'error',
        message: 'Vui lòng nhập hoặc dán nội dung cookie.',
      });
      return;
    }

    // 1. Kiểm tra trùng lặp với các slot khác ngay tại client
    const newUid = extractUidFromRaw(rawInput);
    if (newUid) {
      const duplicateSlot = slots.find(
        (s) =>
          s.id !== activeTab &&
          s.detectedCookies?.c_user &&
          String(s.detectedCookies.c_user).trim() === newUid
      );
      if (duplicateSlot) {
        setFeedback({
          type: 'error',
          message: `❌ Trùng lặp: Tài khoản Facebook này (UID: ${newUid}) đã được sử dụng ở Cookie ${duplicateSlot.id}. Các cookie không được trùng nhau!`,
        });
        return;
      }
    }

    try {
      setIsSaving(true);
      setFeedback(null);

      // Lưu slot với enabled mặc định là true
      const updated = await cookieApi.saveCookieSlot(activeTab, rawInput, true);

      // Cập nhật lại slots
      setSlots((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      );
      const newActiveCount = slots.filter((s) =>
        s.id === updated.id ? true : s.enabled && s.rawCookie
      ).length;
      setActiveCount(newActiveCount);

      setFeedback({
        type: 'success',
        message: `Đã lưu thành công Cookie ${activeTab} (${updated.cookieCount} cookies hợp lệ, UID: ${
          updated.detectedCookies?.c_user || 'N/A'
        }). Cookie đã được BẬT sẵn sàng luân phiên! Hãy bấm "Kiểm tra Cookie" để xác thực phiên đăng nhập.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || `Lỗi khi lưu Cookie ${activeTab}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Kiểm tra tính hợp lệ của Cookie slot hiện tại
  const handleCheckCookie = async () => {
    if (!currentSlot) return;
    try {
      setIsChecking(true);
      setFeedback(null);

      const result: CookieCheckResult = await cookieApi.checkCookieSlot(activeTab);

      // Cập nhật slot với kết quả lastCheck mới
      setSlots((prev) =>
        prev.map((s) => (s.id === activeTab ? { ...s, lastCheck: result } : s))
      );

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
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || `Lỗi khi kiểm tra Cookie ${activeTab}`,
      });
    } finally {
      setIsChecking(false);
    }
  };

  // Xóa nội dung Cookie của slot hiện tại
  const handleClear = async () => {
    if (!currentSlot) return;
    if (
      !window.confirm(
        `Bạn có chắc chắn muốn xóa toàn bộ nội dung của Cookie ${activeTab}? Cookie này sẽ được chuyển về trạng thái Tắt.`
      )
    ) {
      return;
    }

    try {
      setIsClearing(true);
      setFeedback(null);

      const updated = await cookieApi.clearCookieSlot(activeTab);

      setSlots((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      );
      setRawInput('');
      setActiveCount((prev) => Math.max(0, prev - 1));

      setFeedback({
        type: 'success',
        message: `Đã xóa sạch nội dung Cookie ${activeTab}. Trạng thái hiện tại: Chưa nạp (Đã tắt).`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || `Lỗi khi xóa Cookie ${activeTab}`,
      });
    } finally {
      setIsClearing(false);
    }
  };

  // Sao chép nội dung raw
  const handleCopyRaw = () => {
    if (!rawInput) return;
    navigator.clipboard.writeText(rawInput).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const hasCookie = Boolean(
    currentSlot && currentSlot.rawCookie && currentSlot.cookieCount > 0
  );
  const isEnabled = Boolean(currentSlot?.enabled);
  const lastCheck = currentSlot?.lastCheck;

  return (
    <div className="space-y-6 pb-12">
      {/* ======================================================================= */}
      {/* 1. Ô CƠ CHẾ LUÂN PHIÊN TỰ ĐỘNG (ROUND-ROBIN) - TRÊN ĐẦU TRANG */}
      {/* ======================================================================= */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-600/10 via-indigo-600/5 to-purple-600/10 dark:from-blue-500/15 dark:via-indigo-500/10 dark:to-purple-500/15 border border-blue-200/80 dark:border-blue-900/60 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl shrink-0 shadow-md shadow-blue-500/20">
              <ArrowRightLeft className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Cơ chế luân phiên tự động (Round-Robin)
                </h2>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  <Sparkles className="w-3 h-3 mr-1" /> Tối ưu cào dữ liệu
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Hệ thống đang <strong>BẬT {activeCount}/5 Cookie</strong>. Các tác vụ cào bài viết, quét trang cá nhân và tải video sẽ tự động xoay tua lần lượt qua các Cookie đang bật để giảm tải và tránh bị Facebook checkpoint/khóa tài khoản.
              </p>
            </div>
          </div>

          {/* Badge đếm + Mini Slots Tracker trực quan */}
          <div className="flex items-center sm:self-center gap-3 shrink-0">
            {/* Visual 5 Mini Dots */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">Pool:</span>
              {[1, 2, 3, 4, 5].map((slotId) => {
                const s = slots.find((item) => item.id === slotId);
                const isSlotActive = Boolean(
                  s && s.enabled && s.rawCookie && s.cookieCount > 0
                );
                return (
                  <span
                    key={slotId}
                    title={`Cookie ${slotId}: ${isSlotActive ? 'Đang bật' : 'Đang tắt'}`}
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold transition ${
                      isSlotActive
                        ? 'bg-emerald-500 text-white shadow-xs'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                    }`}
                  >
                    {slotId}
                  </span>
                );
              })}
            </div>

            {/* Badge tổng số cookie sẵn sàng */}
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs text-slate-800 dark:text-slate-200">
              <span
                className={`w-2 h-2 rounded-full ${
                  activeCount > 0 ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'
                }`}
              />
              <span>{activeCount} Cookie sẵn sàng</span>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================================= */}
      {/* 2. 5 TABS COOKIE SLOTS (Cookie 1 -> Cookie 5) */}
      {/* ======================================================================= */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-xs">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-2.5">
          {[1, 2, 3, 4, 5].map((slotId) => {
            const slot = slots.find((s) => s.id === slotId);
            const isSelected = activeTab === slotId;
            const slotHasCookie = Boolean(
              slot && slot.rawCookie && slot.cookieCount > 0
            );
            const slotEnabled = Boolean(slot?.enabled);
            const slotCheck = slot?.lastCheck;

            // Xác định trạng thái màu sắc của dot và text
            let statusDotClass = 'bg-slate-300 dark:bg-slate-700';
            let statusText = 'Chưa nạp';

            if (!slotHasCookie) {
              statusDotClass = 'bg-slate-300 dark:bg-slate-600';
              statusText = 'Chưa nạp';
            } else if (!slotEnabled) {
              statusDotClass = 'bg-slate-400 dark:bg-slate-500';
              statusText = 'Đang tắt';
            } else if (slotCheck?.isValid === true) {
              statusDotClass = 'bg-emerald-500 shadow-xs shadow-emerald-500/50';
              statusText = 'Còn hạn (Live)';
            } else if (slotCheck && !slotCheck.isValid) {
              statusDotClass = 'bg-rose-500 shadow-xs shadow-rose-500/50';
              statusText = 'Hết hạn (Die)';
            } else {
              statusDotClass = 'bg-blue-500';
              statusText = 'Đã nạp';
            }

            return (
              <button
                key={slotId}
                type="button"
                onClick={() => handleSelectTab(slotId)}
                className={`relative flex flex-col items-start p-3 sm:p-3.5 rounded-xl text-left transition duration-150 cursor-pointer border ${
                  isSelected
                    ? 'bg-blue-50/90 dark:bg-blue-950/40 border-blue-500 text-blue-950 dark:text-blue-50 shadow-xs ring-2 ring-blue-500/20'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                }`}
              >
                {/* Header hàng: Tên Cookie + Badge BẬT/TẮT */}
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDotClass}`} />
                    <span className="font-bold text-xs sm:text-sm tracking-tight">
                      Cookie {slotId}
                    </span>
                  </div>

                  {slotHasCookie ? (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        slotEnabled
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {slotEnabled ? 'BẬT' : 'TẮT'}
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-slate-400">Trống</span>
                  )}
                </div>

                {/* Subtext: UID hoặc trạng thái */}
                <div className="mt-1.5 w-full flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                  {slot?.detectedCookies?.c_user ? (
                    <span
                      className="truncate font-semibold"
                      title={`UID: ${slot.detectedCookies.c_user}`}
                    >
                      UID: {slot.detectedCookies.c_user}
                    </span>
                  ) : (
                    <span className="opacity-75 text-[10px] font-sans">
                      {statusText}
                    </span>
                  )}
                  {slotHasCookie && (
                    <span className="text-[10px] font-sans opacity-70 ml-1 shrink-0">
                      {slot?.cookieCount} keys
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ======================================================================= */}
      {/* 3. MAIN HEADER CARD WITH DYNAMIC TITLE, LOGIN BUTTON & BẬT/TẮT */}
      {/* ======================================================================= */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        {/* Bên trái: Icon + Tiêu đề Cookie {activeTab} */}
        <div className="flex items-start sm:items-center gap-4">
          <div className="p-3.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl shrink-0">
            <Key className="w-7 h-7" />
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              Cookie {activeTab}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Quản lý tài khoản Facebook riêng biệt cho <strong>Cookie {activeTab}</strong>. Các cookie giữa các tab không được trùng tài khoản.
            </p>
          </div>
        </div>

        {/* Bên phải: Cụm điều khiển 2 hàng */}
        <div className="flex flex-col items-start lg:items-end gap-3 shrink-0">
          {/* HÀNG TRÊN: Badge trạng thái + Nút Đăng nhập FB + Nút Kiểm tra + Nút Refresh */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Status Badge */}
            {lastCheck?.isValid ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border shadow-xs bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span>Còn hạn (Live)</span>
                <ShieldCheck className="w-4 h-4 text-emerald-500 ml-0.5" />
              </div>
            ) : lastCheck && !lastCheck.isValid ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border shadow-xs bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                <span>Hết hạn (Die)</span>
                <ShieldAlert className="w-4 h-4 text-rose-500 ml-0.5" />
              </div>
            ) : hasCookie ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border shadow-xs bg-blue-500/10 border-blue-500/25 text-blue-600 dark:text-blue-400">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <span>Đã nạp</span>
                <ShieldCheck className="w-4 h-4 text-blue-500 ml-0.5" />
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border shadow-xs bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                <span>Chưa nạp</span>
                <ShieldAlert className="w-4 h-4 text-rose-500 ml-0.5" />
              </div>
            )}

            {/* Button: Đăng nhập Facebook (Mở trình duyệt thật tự lấy cookie) */}
            <button
              type="button"
              onClick={handleStartBrowserLogin}
              disabled={isBrowserLoggingIn || isLoading}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white shadow-xs disabled:opacity-40 transition cursor-pointer"
              title={`Mở cửa sổ Chrome thật để đăng nhập Facebook cho Cookie ${activeTab}. Hệ thống sẽ tự động bắt cookie và đóng lại khi thành công.`}
            >
              <Globe className={`w-3.5 h-3.5 ${isBrowserLoggingIn ? 'animate-spin' : ''}`} />
              <span>{isBrowserLoggingIn ? 'Đang mở Facebook...' : 'Đăng nhập Facebook'}</span>
            </button>

            {/* Button: Kiểm tra Cookie */}
            <button
              type="button"
              onClick={handleCheckCookie}
              disabled={isChecking || !hasCookie || isBrowserLoggingIn}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 active:scale-98 text-white shadow-xs disabled:opacity-40 transition cursor-pointer"
              title={`Kiểm tra tính hợp lệ của Cookie ${activeTab}`}
            >
              <Activity className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Đang kiểm tra...' : 'Kiểm tra Cookie'}</span>
            </button>

            {/* Button: Refresh */}
            <button
              type="button"
              onClick={() => fetchSlots(activeTab)}
              disabled={isLoading || isChecking || isBrowserLoggingIn}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition cursor-pointer shadow-xs"
              title="Tải lại trạng thái Cookie này"
            >
              <RotateCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* HÀNG DƯỚI: NÚT BẬT / TẮT COOKIE */}
          <div className="flex items-center justify-end gap-3 w-full pt-0.5">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Trạng thái hoạt động:
            </span>

            {/* Toggle Switch */}
            <button
              type="button"
              onClick={handleToggle}
              disabled={isToggling || (!hasCookie && !isEnabled) || isBrowserLoggingIn}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-40 shadow-inner ${
                isEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
              }`}
              role="switch"
              aria-checked={isEnabled}
              title={
                !hasCookie
                  ? 'Vui lòng dán hoặc bấm Đăng nhập Facebook trước khi bật'
                  : isEnabled
                  ? `Bấm để TẮT Cookie ${activeTab}`
                  : `Bấm để BẬT Cookie ${activeTab}`
              }
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  isEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>

            {/* Badge ĐANG BẬT / ĐANG TẮT */}
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-lg border transition ${
                isEnabled
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}
            >
              {isEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}
            </span>
          </div>
        </div>
      </div>

      {/* ======================================================================= */}
      {/* MODAL / OVERLAY TRẠNG THÁI: KHI ĐANG MỞ TRÌNH DUYỆT ĐĂNG NHẬP FACEBOOK */}
      {/* ======================================================================= */}
      {isBrowserLoggingIn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            {/* Header Modal */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                  <Globe className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Đăng nhập Facebook (Cookie {activeTab})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cửa sổ Chrome thật đã mở trên máy tính của bạn
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCancelBrowserLogin}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title="Hủy bỏ phiên đăng nhập"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body Hướng dẫn & Loading Animation */}
            <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900/50 rounded-2xl p-4.5 space-y-3">
              <div className="flex items-center gap-3 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>Đang chờ bạn đăng nhập trên cửa sổ Chrome...</span>
              </div>

              <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-2 list-decimal list-inside pl-1 leading-relaxed">
                <li>
                  Vui lòng chuyển sang cửa sổ trình duyệt <strong>Chrome</strong> vừa xuất hiện trên màn hình máy tính của bạn.
                </li>
                <li>
                  Tự tay nhập <strong>Tài khoản</strong> và <strong>Mật khẩu Facebook</strong> (hoặc xác thực 2FA).
                </li>
                <li>
                  <strong>Tự động 100%:</strong> Ngay khi đăng nhập thành công vào Facebook, cửa sổ sẽ <strong>tự động đóng lại</strong> và toàn bộ Cookie sẽ được lưu ngay vào <strong>Cookie {activeTab}</strong>!
                </li>
              </ol>

              {loginModalStatus && (
                <div className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 pt-1 border-t border-indigo-200/60 dark:border-indigo-900/40 truncate">
                  ⚡ {loginModalStatus}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={handleCancelBrowserLogin}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                Hủy bỏ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* 4. KPI GRID FOR CURRENT SLOT */}
      {/* ======================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div
            className={`p-3 rounded-xl shrink-0 ${
              lastCheck?.isValid
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : lastCheck && !lastCheck.isValid
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                : hasCookie
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}
          >
            {lastCheck?.isValid ? (
              <ShieldCheck className="w-6 h-6" />
            ) : (
              <ShieldAlert className="w-6 h-6" />
            )}
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Trạng thái phiên
            </p>
            <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-0.5">
              {lastCheck?.isValid
                ? 'Còn hạn (Live)'
                : lastCheck && !lastCheck.isValid
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
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Số lượng Cookie
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
              {currentSlot ? currentSlot.cookieCount : 0}
            </p>
          </div>
        </div>

        {/* c_user & Tên tài khoản */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
            <User className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Tài khoản Facebook
            </p>
            <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 truncate">
              {lastCheck?.userName ||
                currentSlot?.detectedCookies?.c_user ||
                'Chưa nhận diện'}
            </p>
            {currentSlot?.detectedCookies?.c_user && (
              <p className="text-[11px] font-mono text-slate-400 truncate">
                UID: {currentSlot.detectedCookies.c_user}
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
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Kiểm tra gần nhất
            </p>
            <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white mt-0.5 truncate">
              {lastCheck?.checkedAt
                ? `${new Date(lastCheck.checkedAt).toLocaleTimeString('vi-VN')} ${new Date(
                    lastCheck.checkedAt
                  ).toLocaleDateString('vi-VN')}`
                : 'Chưa kiểm tra'}
            </p>
            {!lastCheck && hasCookie && (
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

      {/* ======================================================================= */}
      {/* 5. LIVE CHECK RESULT BANNER */}
      {/* ======================================================================= */}
      {lastCheck && (
        <div
          className={`p-4 rounded-2xl border flex items-start gap-3.5 transition animate-in fade-in duration-200 ${
            lastCheck.isValid
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-900 dark:text-emerald-200'
              : 'bg-rose-500/10 border-rose-500/25 text-rose-900 dark:text-rose-200'
          }`}
        >
          {lastCheck.isValid ? (
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="text-xs sm:text-sm space-y-1">
            <p className="font-bold">
              {lastCheck.isValid
                ? `Cookie ${activeTab} đang hoạt động tốt!`
                : `Cảnh báo: Cookie ${activeTab} đã hết hạn hoặc không hợp lệ!`}
            </p>
            <p className="opacity-90">{lastCheck.message}</p>
            {!lastCheck.isValid && (
              <p className="text-xs font-semibold pt-1">
                👉 Bạn có thể bấm nút <strong>"Đăng nhập Facebook"</strong> bên trên để đăng nhập lại bằng Chrome thật, hoặc dán JSON mới vào ô bên dưới.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* 6. MAIN TEXTAREA FORM CARD FOR CURRENT SLOT */}
      {/* ======================================================================= */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Key className="w-4 h-4 text-blue-500" />
            Nội dung Cookie {activeTab} (JSON Array hoặc chuỗi text c_user=...; xs=...)
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
          placeholder={`[&#10;  {&#10;    "domain": ".facebook.com",&#10;    "name": "c_user",&#10;    "value": "61594031320050",&#10;    "path": "/"&#10;  },&#10;  {&#10;    "domain": ".facebook.com",&#10;    "name": "xs",&#10;    "value": "...",&#10;    "path": "/"&#10;  }&#10;]&#10;Hoặc bấm nút "Đăng nhập Facebook" bên trên để hệ thống tự động điền vào đây!`}
          className="w-full text-xs font-mono p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/70 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition resize-y leading-relaxed"
        />

        {/* Feedback message banner */}
        {feedback && (
          <div
            className={`flex items-center gap-2.5 p-3.5 rounded-xl border text-xs font-medium animate-in fade-in duration-200 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : feedback.type === 'warning'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle
                className={`w-4 h-4 shrink-0 ${
                  feedback.type === 'warning' ? 'text-amber-500' : 'text-rose-500'
                }`}
              />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Trạng thái hiện tại:{' '}
            <span
              className={`font-bold ${
                isEnabled
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500'
              }`}
            >
              {isEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}
            </span>{' '}
            • Quản lý độc lập cho Cookie {activeTab}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleClear}
              disabled={isClearing || isSaving || isBrowserLoggingIn}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 disabled:opacity-40 transition cursor-pointer shadow-xs"
            >
              <Trash2 className="w-4 h-4 text-rose-500" />
              Xóa Cookie {activeTab}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isClearing || isBrowserLoggingIn}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-98 text-white shadow-md shadow-blue-500/20 disabled:opacity-50 transition cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Đang lưu...' : `Lưu Cookie ${activeTab}`}
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================================= */}
      {/* 7. GUIDE CARD */}
      {/* ======================================================================= */}
      <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 text-xs text-slate-600 dark:text-slate-400 space-y-3.5">
        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-sm">
          <Info className="w-4 h-4 text-blue-500" />
          Hướng dẫn lấy &amp; quản lý Cookie Facebook
        </h3>

        {/* Ý nghĩa các chấm màu trạng thái */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2">
          <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">
            Ý nghĩa các màu chấm trạng thái trên từng Tab Cookie:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <span><strong>🟢 Chấm xanh lá (Live):</strong> Cookie đang BẬT và phiên Facebook còn hạn.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
              <span><strong>🔵 Chấm xanh lam (Active):</strong> Cookie đang BẬT và đã nạp dữ liệu.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
              <span><strong>🔴 Chấm đỏ (Die):</strong> Cookie đang BẬT nhưng phiên đã hết hạn.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
              <span><strong>⚪ Chấm xám (Off / Empty):</strong> Cookie đang TẮT hoặc chưa nạp.</span>
            </div>
          </div>
        </div>

        <ul className="list-disc list-inside space-y-2 pl-1 leading-relaxed">
          <li>
            <strong>Cách 1 (Nhanh nhất):</strong> Bấm nút <strong>"Đăng nhập Facebook"</strong> ở trên. Hệ thống sẽ mở một cửa sổ Chrome thật trên máy tính của bạn. Bạn chỉ việc nhập tài khoản &amp; mật khẩu, hệ thống sẽ tự động bắt cookie, lưu vào Cookie {activeTab} và tự đóng cửa sổ lại.
          </li>
          <li>
            <strong>Cách 2 (Thủ công):</strong> Đăng nhập tài khoản Facebook trên trình duyệt Chrome thông thường, dùng tiện ích <strong>J2TEAM Cookies</strong> hoặc <strong>Cookie-Editor</strong> để xuất JSON, dán vào ô bên trên rồi bấm <strong>Lưu Cookie</strong>.
          </li>
          <li>
            <strong>Quy tắc chống trùng lặp:</strong> Mỗi tab Cookie 1..5 phải là một tài khoản Facebook khác nhau. Nếu trùng UID với tab khác, hệ thống sẽ tự động cảnh báo và từ chối lưu.
          </li>
          <li>
            <strong>Nút Bật / Tắt:</strong> Bật hoặc tắt từng cookie bằng nút gạt switch ngay bên dưới cụm nút Kiểm tra Cookie.
          </li>
          <li>
            <strong>Cơ chế xoay vòng:</strong> Toàn bộ các tiến trình cào dữ liệu sẽ tự động luân phiên Round-Robin qua các Cookie đang BẬT.
          </li>
        </ul>
      </div>
    </div>
  );
};
