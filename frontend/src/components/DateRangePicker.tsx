import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  RotateCcw,
} from "lucide-react";

interface DateRangePickerProps {
  startDate: string; // Format: 'YYYY-MM-DD'
  endDate: string; // Format: 'YYYY-MM-DD'
  onChange: (range: { startDate: string; endDate: string }) => void;
  placeholder?: string;
}

const DAYS_OF_WEEK = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

const toDateString = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
};

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  placeholder = "Chọn khoảng ngày đăng...",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [selectingStart, setSelectingStart] = useState<string | null>(null);

  // Month being viewed in the floating calendar popover
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (startDate) {
      const [y, m] = startDate.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date();
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSelectingStart(null);
        setHoverDate(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setSelectingStart(null);
        setHoverDate(null);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Sync viewDate when popover opens and startDate exists
  useEffect(() => {
    if (isOpen && startDate) {
      const [y, m] = startDate.split("-").map(Number);
      setViewDate(new Date(y, m - 1, 1));
    }
  }, [isOpen, startDate]);

  // Month navigation controls
  const prevMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Compute days in current month grid
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Monday-based index: Mon=0 ... Sun=6
    const firstDayOfWeek = (firstDay.getDay() + 6) % 7;
    const totalDaysInMonth = lastDay.getDate();

    const days: Array<{
      date: Date;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    // Days from previous month (fill prefix)
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      days.push({
        date: d,
        dateStr: toDateString(d),
        isCurrentMonth: false,
        isToday: false,
      });
    }

    // Days in current month
    const todayStr = toDateString(new Date());
    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const dateStr = toDateString(dateObj);
      days.push({
        date: dateObj,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
      });
    }

    // Fill remaining to complete multiple of 7
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const dateObj = new Date(year, month + 1, d);
      days.push({
        date: dateObj,
        dateStr: toDateString(dateObj),
        isCurrentMonth: false,
        isToday: false,
      });
    }

    return days;
  }, [viewDate]);

  // Handle day click for range picking
  const handleDayClick = (dayStr: string) => {
    if (!selectingStart) {
      // First click: sets range_start
      setSelectingStart(dayStr);
      setHoverDate(null);
    } else {
      // Second click: sets range_end
      if (dayStr >= selectingStart) {
        onChange({ startDate: selectingStart, endDate: dayStr });
        setSelectingStart(null);
        setHoverDate(null);
        setIsOpen(false);
      } else {
        // If clicked earlier date, reset start to that date
        setSelectingStart(dayStr);
        setHoverDate(null);
      }
    }
  };

  // Fast presets
  const handlePreset = (
    type: "today" | "7days" | "30days" | "thisMonth" | "1year" | "all",
  ) => {
    const today = new Date();
    const todayStr = toDateString(today);

    if (type === "today") {
      onChange({ startDate: todayStr, endDate: todayStr });
    } else if (type === "7days") {
      const past = new Date(today);
      past.setDate(past.getDate() - 6);
      onChange({ startDate: toDateString(past), endDate: todayStr });
    } else if (type === "30days") {
      const past = new Date(today);
      past.setDate(past.getDate() - 29);
      onChange({ startDate: toDateString(past), endDate: todayStr });
    } else if (type === "1year") {
      const past = new Date(today);
      past.setFullYear(past.getFullYear() - 1);
      onChange({ startDate: toDateString(past), endDate: todayStr });
    } else if (type === "thisMonth") {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      onChange({ startDate: toDateString(first), endDate: toDateString(last) });
    } else if (type === "all") {
      onChange({ startDate: "", endDate: "" });
    }

    setSelectingStart(null);
    setHoverDate(null);
    setIsOpen(false);
  };

  // Active range calculation for rendering (range_start, range_end, range_middle)
  const activeStart = selectingStart || startDate;
  const activeEnd = selectingStart
    ? hoverDate && hoverDate >= selectingStart
      ? hoverDate
      : selectingStart
    : endDate;

  const isRangeActive = Boolean(startDate || endDate);

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* 1. The Trigger Field (The field is the trigger) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer shadow-sm ${
          isRangeActive
            ? "bg-blue-50 dark:bg-blue-600/15 border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-600/25"
            : "bg-slate-50 dark:bg-slate-950/80 border-slate-300 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-900"
        }`}
        title="Chọn khoảng ngày đăng"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <CalendarIcon
          className={`w-4 h-4 ${isRangeActive ? "text-blue-500 dark:text-blue-400" : "text-slate-400"}`}
        />

        <span className="select-none">
          {startDate && endDate ? (
            `${formatDisplayDate(startDate)} — ${formatDisplayDate(endDate)}`
          ) : startDate ? (
            `Từ ${formatDisplayDate(startDate)}`
          ) : endDate ? (
            `Đến ${formatDisplayDate(endDate)}`
          ) : (
            <span className="text-slate-400 dark:text-slate-500">
              {placeholder}
            </span>
          )}
        </span>

        {/* Clear Button */}
        {isRangeActive && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onChange({ startDate: "", endDate: "" });
              setSelectingStart(null);
              setHoverDate(null);
            }}
            className="p-0.5 rounded-full hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-500 dark:text-blue-300 hover:text-blue-700 dark:hover:text-white transition"
            title="Xóa khoảng ngày"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}

        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* 2. The Floating Calendar Popover (The floating month is the calendar popover) */}
      {isOpen && (
        <div
          className="absolute left-0 mt-1.5 z-50 w-[380px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/90 rounded-2xl shadow-xl p-3.5 animate-in fade-in zoom-in-95 duration-150"
          role="dialog"
          aria-label="Bộ chọn khoảng ngày"
        >
          {/* Quick Presets Bar - 5 nút chia đều 5 cột trên cùng 1 hàng */}
          <div className="grid grid-cols-5 gap-1 pb-2.5 border-b border-slate-200 dark:border-slate-800 text-[11px]">
            <button
              type="button"
              onClick={() => handlePreset("today")}
              className="py-1.5 px-0.5 rounded-lg text-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium transition cursor-pointer whitespace-nowrap"
            >
              Hôm nay
            </button>
            <button
              type="button"
              onClick={() => handlePreset("7days")}
              className="py-1.5 px-0.5 rounded-lg text-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium transition cursor-pointer whitespace-nowrap"
            >
              7 ngày
            </button>
            <button
              type="button"
              onClick={() => handlePreset("30days")}
              className="py-1.5 px-0.5 rounded-lg text-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium transition cursor-pointer whitespace-nowrap"
            >
              30 ngày
            </button>
            <button
              type="button"
              onClick={() => handlePreset("1year")}
              className="py-1.5 px-0.5 rounded-lg text-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium transition cursor-pointer whitespace-nowrap"
            >
              1 năm qua
            </button>
            <button
              type="button"
              onClick={() => handlePreset("all")}
              className="py-1.5 px-0.5 rounded-lg text-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium transition cursor-pointer whitespace-nowrap"
            >
              Tất cả
            </button>
          </div>

          {/* Month & Year Navigation */}
          <div className="flex items-center justify-between py-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
              title="Tháng trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
              Tháng {viewDate.getMonth() + 1}, {viewDate.getFullYear()}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
              title="Tháng sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Prompt banner when selecting */}
          <div className="text-xs text-center text-slate-500 dark:text-slate-400 pb-1.5">
            {selectingStart ? (
              <span className="text-blue-600 dark:text-blue-400 font-semibold">
                Chọn ngày kết thúc
              </span>
            ) : (
              <span>Chọn ngày bắt đầu &amp; kết thúc</span>
            )}
          </div>

          {/* 3. The Grid of Days (role="grid" whose chosen day carries aria-selected) */}
          <div role="grid" aria-readonly="true" className="w-full">
            {/* Header: Days of week */}
            <div
              role="row"
              className="grid grid-cols-7 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1"
            >
              {DAYS_OF_WEEK.map((dw) => (
                <div key={dw} role="columnheader" className="py-0.5">
                  {dw}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-y-1">
              {calendarDays.map((item) => {
                const { dateStr, isCurrentMonth, isToday, date } = item;
                const isStart = activeStart === dateStr;
                const isEnd = activeEnd === dateStr;
                const isSelected = isStart || isEnd;
                const isMiddle =
                  activeStart &&
                  activeEnd &&
                  dateStr > activeStart &&
                  dateStr < activeEnd;

                return (
                  <div
                    key={dateStr}
                    role="gridcell"
                    aria-selected={isSelected || isMiddle ? "true" : "false"}
                    className={`relative py-0.5 flex items-center justify-center ${
                      /* range_middle: tinted stripe between range_start and range_end */
                      isMiddle
                        ? "bg-blue-500/15 dark:bg-blue-600/20 text-blue-700 dark:text-blue-100"
                        : ""
                    } ${
                      /* Tinted span connecting start to right if range is open */
                      isStart && activeEnd && activeStart !== activeEnd
                        ? "rounded-l-lg bg-gradient-to-r from-transparent via-blue-500/15 dark:via-blue-600/20 to-blue-500/15 dark:to-blue-600/20"
                        : ""
                    } ${
                      /* Tinted span connecting left to end */
                      isEnd && activeStart && activeStart !== activeEnd
                        ? "rounded-r-lg bg-gradient-to-l from-transparent via-blue-500/15 dark:via-blue-600/20 to-blue-500/15 dark:to-blue-600/20"
                        : ""
                    }`}
                    onMouseEnter={() => {
                      if (selectingStart) {
                        setHoverDate(dateStr);
                      }
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleDayClick(dateStr)}
                      className={`w-8 h-8 rounded-lg text-xs flex items-center justify-center transition-all cursor-pointer relative z-10 ${
                        isSelected
                          ? "bg-blue-600 text-white font-bold shadow-md shadow-blue-500/30 scale-105"
                          : isMiddle
                            ? "text-blue-700 dark:text-blue-100 font-semibold hover:bg-blue-500/20"
                            : isCurrentMonth
                              ? "text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white font-medium"
                              : "text-slate-400 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800/60 font-normal"
                      } ${
                        isToday && !isSelected
                          ? "ring-1.5 ring-blue-500 font-bold text-blue-600 dark:text-blue-400"
                          : ""
                      }`}
                    >
                      {date.getDate()}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer status / close button */}
          <div className="pt-2.5 mt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="truncate pr-2">
              {activeStart && activeEnd ? (
                <span className="text-slate-800 dark:text-slate-200 font-semibold whitespace-nowrap">
                  {formatDisplayDate(activeStart)} →{" "}
                  {formatDisplayDate(activeEnd)}
                </span>
              ) : activeStart ? (
                <span className="text-blue-600 dark:text-blue-400 font-semibold whitespace-nowrap">
                  Từ: {formatDisplayDate(activeStart)}
                </span>
              ) : (
                "Chưa chọn ngày"
              )}
            </span>

            <div className="flex items-center gap-1.5 shrink-0">
              {isRangeActive && (
                <button
                  type="button"
                  onClick={() => handlePreset("all")}
                  className="px-2.5 py-1 rounded-md bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 font-medium transition flex items-center gap-1 cursor-pointer text-xs whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Xóa lọc</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setSelectingStart(null);
                  setHoverDate(null);
                }}
                className="px-3 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white font-medium transition cursor-pointer text-xs whitespace-nowrap"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
