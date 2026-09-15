import React from "react";
import { useLocation } from "react-router-dom";
import { Sun, Moon, Menu, LogIn, LogOut, ShieldCheck, User } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

interface HeaderProps {
  isConnected: boolean;
  onOpenMobileSidebar?: () => void;
}

const PATH_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/lifecycle": "Lifecycle",
  "/analytics": "Analytics",
  "/users": "Users",
  "/cookie": "Cookie",
  "/link": "Video Link",
  "/data-library": "Video Link",
  "/video-link": "Video Link",
  "/video-profile": "Video Profile",
  "/profile-management": "Profile",
  "/profile": "Profile",
  "/reports": "Reports",
  "/more": "Documents",
  "/settings": "Settings",
  "/help": "Get Help",
  "/search": "Search",
};

export const Header: React.FC<HeaderProps> = ({
  isConnected,
  onOpenMobileSidebar,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { user, isAuthenticated, isAdmin, openLoginModal, logout } = useAuth();
  const location = useLocation();

  const currentTitle = PATH_TITLES[location.pathname] || "Documents";

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-20 px-4 sm:px-6 py-3 transition-colors">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Mobile Menu Button & Breadcrumb */}
        <div className="flex items-center gap-3">
          {/* Mobile Hamburger Toggle Button */}
          {onOpenMobileSidebar && (
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Mở menu"
              aria-label="Mở thanh điều hướng"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {/* Breadcrumb Title */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
              {currentTitle}
            </span>
          </div>
        </div>

        {/* Right: Socket Connection Status, Theme Toggle & Auth Controls */}
        <div className="flex items-center space-x-2 sm:space-x-3 text-xs">
          {/* Socket Connection Status */}
          <div
            className={`hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full font-medium border transition-colors ${
              isConnected
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400"
            }`}
          >
            <span className="relative flex h-2 w-2">
              {isConnected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isConnected
                    ? "bg-emerald-500 dark:bg-emerald-400"
                    : "bg-rose-500 dark:bg-rose-400"
                }`}
              ></span>
            </span>
            <span className="font-semibold">
              {isConnected ? "Realtime" : "Mất kết nối"}
            </span>
          </div>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-700/80 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-amber-400 transition cursor-pointer shadow-sm"
            title={
              theme === "dark"
                ? "Chuyển sang giao diện Sáng"
                : "Chuyển sang giao diện Tối"
            }
            aria-label="Chuyển đổi giao diện sáng và tối"
          >
            {theme === "dark" ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px] font-semibold text-slate-300">
                  Sáng
                </span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-600" />
                <span className="text-[11px] font-semibold text-slate-700">
                  Tối
                </span>
              </>
            )}
          </button>

          {/* Authentication Badge or Login Button */}
          {!isAuthenticated ? (
            <button
              type="button"
              onClick={openLoginModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold transition cursor-pointer shadow-sm shadow-blue-500/25"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Đăng nhập</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-bold border text-[11px] ${
                  isAdmin
                    ? "bg-indigo-50 dark:bg-indigo-950/70 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300"
                    : "bg-emerald-50 dark:bg-emerald-950/70 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                }`}
                title={`Đang đăng nhập dưới vai trò ${isAdmin ? "Quản trị viên (Admin)" : "Người xem (User)"}`}
              >
                {isAdmin ? (
                  <ShieldCheck className="w-3.5 h-3.5" />
                ) : (
                  <User className="w-3.5 h-3.5" />
                )}
                <span>{isAdmin ? "ADMIN" : "USER"}</span>
                <span className="hidden md:inline font-normal text-slate-500">
                  ({user?.username})
                </span>
              </div>

              <button
                type="button"
                onClick={logout}
                className="p-1.5 rounded-full text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-800 transition cursor-pointer"
                title="Đăng xuất"
                aria-label="Đăng xuất"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

