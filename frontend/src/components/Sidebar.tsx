import React, { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import {
  Compass,
  BarChart3,
  Users,
  Link2,
  Video,
  FileText,
  Settings,
  HelpCircle,
  MoreVertical,
  Activity,
  X,
  User,
  UserCheck,
  ShieldCheck,
  Lock,
  LogOut,
  Layers,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem {
  key: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  adminOnly?: boolean;
}

const HOME_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Trang chủ', path: '/', icon: Compass },
  { key: 'post_management', label: 'Quản lý bài viết', path: '/post-management', icon: Layers },
  { key: 'analytics', label: 'Biểu đồ', path: '/analytics', icon: BarChart3 },
];

const DOCUMENT_ITEMS: NavItem[] = [
  { key: 'link', label: 'Dữ liệu', path: '/link', icon: Link2 },
  { key: 'video_profile', label: 'Thu thập dữ liệu cá nhân', path: '/video-profile', icon: Video },
  { key: 'profile_management', label: 'Trang cá nhân', path: '/profile-management', icon: UserCheck },
  { key: 'reports', label: 'Báo cáo', path: '/reports', icon: FileText },
  { key: 'cookie', label: 'Cookie', path: '/cookie', icon: ShieldCheck },
];

const ADMIN_ITEMS: NavItem[] = [
  { key: 'users', label: 'Quản lý tài khoản', path: '/users', icon: Users, adminOnly: true },
];

const BOTTOM_ITEMS: NavItem[] = [
  { key: 'settings', label: 'Cài đặt', path: '/settings', icon: Settings },
  { key: 'get_help', label: 'Trợ Giúp', path: '/help', icon: HelpCircle },
];

export const Sidebar: React.FC<SidebarProps> = ({
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const { user, isAuthenticated, isAdmin, openLoginModal, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const isPathActive = (path: string) => {
    if (path === '/' || path === '/dashboard') {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    if (path === '/link') {
      return location.pathname === '/link' || location.pathname === '/data-library' || location.pathname === '/video-link';
    }
    if (path === '/profile-management') {
      return location.pathname === '/profile-management' || location.pathname === '/profile';
    }
    if (path === '/post-management') {
      return location.pathname === '/post-management' || location.pathname === '/quan-ly-bai-viet';
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const handleItemClick = (item: NavItem) => {
    navigate(item.path);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const renderNavList = (items: NavItem[]) => (
    <ul className="space-y-0.5">
      {items
        .filter((item) => !item.adminOnly || isAdmin)
        .map((item) => {
        const Icon = item.icon;
        const isActive = isPathActive(item.path);

        return (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => handleItemClick(item)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 cursor-pointer select-none text-left group ${
                isActive
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 transition-colors ${
                  isActive
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200'
                }`}
              />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-medium bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  {item.badge}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const sidebarContent = (
    <div className="h-full flex flex-col justify-between p-3.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 select-none">
      {/* Top Brand / Org Name */}
      <div>
        <div className="flex items-center justify-between px-2.5 py-2 mb-3">
          <Link
            to="/"
            onClick={() => {
              if (onCloseMobile) onCloseMobile();
            }}
            className="flex items-center gap-2.5 group cursor-pointer"
            title="Quản lý thông tin"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Quản lý thông tin
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate leading-tight">
                Realtime Crawler
              </span>
            </div>
          </Link>

          {/* Close button on mobile */}
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Đóng menu"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Group 1: Trang chủ (Khi chưa đăng nhập chỉ hiện Trang chủ) */}
        <div className="mb-4">
          <div className="px-3 pb-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider">
            Trang chủ
          </div>
          {renderNavList(isAuthenticated ? HOME_ITEMS : [HOME_ITEMS[0]])}
        </div>

        {/* Group 2: Dữ liệu (Chỉ hiện khi đã đăng nhập; User bị ẩn trang Cookie và Thu thập dữ liệu cá nhân) */}
        {isAuthenticated && (
          <div className="mb-4">
            <div className="px-3 pb-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider">
              Dữ liệu
            </div>
            {renderNavList(
              isAdmin
                ? DOCUMENT_ITEMS
                : DOCUMENT_ITEMS.filter(
                    (item) => item.key !== 'cookie' && item.key !== 'video_profile'
                  )
            )}
          </div>
        )}

        {/* Group 3: Quản trị (Chỉ hiện khi là Admin) */}
        {isAuthenticated && isAdmin && (
          <div className="mb-4">
            <div className="px-3 pb-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider">
              Quản trị
            </div>
            {renderNavList(ADMIN_ITEMS)}
          </div>
        )}

        {/* Guest prompt card nếu chưa đăng nhập */}
        {!isAuthenticated && (
          <div className="mx-1 my-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
              <Lock className="w-3.5 h-3.5 text-blue-500" />
              <span>Chế độ Khách</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Bạn đang ở chế độ chỉ xem Dashboard. Đăng nhập để mở khóa các trang quản lý.
            </p>
            <button
              type="button"
              onClick={openLoginModal}
              className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Đăng nhập</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Section: Settings, Help & User Profile / Login */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
        {/* Secondary Links (Chỉ hiện khi đã đăng nhập) */}
        {isAuthenticated && <div>{renderNavList(BOTTOM_ITEMS)}</div>}

        {/* Chân sidebar: Nút Đăng nhập cho Khách hoặc Card Profile cho Admin/User */}
        {!isAuthenticated ? (
          <button
            type="button"
            onClick={openLoginModal}
            className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-md shadow-blue-500/20 transition cursor-pointer"
          >
            <Lock className="w-4 h-4" />
            <span>Đăng nhập hệ thống</span>
          </button>
        ) : (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-left group"
            >
              {/* Avatar thumbnail */}
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-xs overflow-hidden shrink-0 ring-1 ${
                  isAdmin
                    ? 'bg-gradient-to-tr from-indigo-600 to-purple-600 ring-indigo-300 dark:ring-indigo-700'
                    : 'bg-gradient-to-tr from-emerald-600 to-teal-600 ring-emerald-300 dark:ring-emerald-700'
                }`}
              >
                <span>{isAdmin ? 'AD' : 'US'}</span>
              </div>

              {/* Name & Role */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white truncate leading-tight">
                    {user?.name || (isAdmin ? 'Quản trị viên' : 'Người xem')}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span
                    className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold ${
                      isAdmin
                        ? 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                        : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    }`}
                  >
                    {isAdmin ? 'ADMIN' : 'USER'}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">@{user?.username}</span>
                </div>
              </div>

              {/* More Options Icon */}
              <MoreVertical className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 shrink-0" />
            </button>

            {/* Quick Profile Popover Menu */}
            {isProfileMenuOpen && (
              <div className="absolute bottom-full left-0 mb-1.5 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-1.5 z-50 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
                <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-1">
                  <div className="font-semibold text-slate-900 dark:text-white flex items-center justify-between">
                    <span>{user?.name}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                        isAdmin
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
                      }`}
                    >
                      {isAdmin ? 'Admin' : 'User'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">@{user?.username}</div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    navigate('/profile-management');
                    setIsProfileMenuOpen(false);
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Hồ sơ cá nhân</span>
                </button>

                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    setIsProfileMenuOpen(false);
                    navigate('/');
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer font-medium"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar (sticky on left) */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0 border-r border-slate-200 dark:border-slate-800/90 z-30 transition-colors">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Backdrop & Off-canvas Sidebar */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={onCloseMobile}
            aria-hidden="true"
          />

          {/* Sliding drawer panel */}
          <div className="relative w-64 max-w-[80vw] h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
