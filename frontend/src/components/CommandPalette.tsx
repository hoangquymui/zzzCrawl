import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Users,
  FileText,
  Video,
  Compass,
  Sun,
  Moon,
  ChevronRight,
  Sparkles,
  X,
  BarChart3,
  Cookie as CookieIcon,
  Database,
  Activity,
} from 'lucide-react';
import { VideoItem } from '../types/video';
import { UserProfileItem } from '../types/profile-management';
import { useTheme } from '../context/ThemeContext';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  videos: VideoItem[];
  profiles: UserProfileItem[];
  onSelectProfile?: (profileId: string) => void;
  onSelectPost?: (post: VideoItem) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  videos,
  profiles,
  onSelectProfile,
  onSelectPost,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  // Tự động focus ô tìm kiếm khi mở modal
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Điều hướng hệ thống
  const navItems = useMemo(
    () => [
      { id: 'nav-home', title: 'Trang chủ Dashboard', path: '/', icon: Compass, category: 'Điều hướng' },
      { id: 'nav-posts', title: 'Quản lý bài viết (3 Cột)', path: '/post-management', icon: FileText, category: 'Điều hướng' },
      { id: 'nav-data', title: 'Kho bài viết (Post Library)', path: '/link', icon: Database, category: 'Điều hướng' },
      { id: 'nav-profiles', title: 'Trang cá nhân & Quét profile', path: '/profile-management', icon: Users, category: 'Điều hướng' },
      { id: 'nav-analytics', title: 'Thống kê & Biểu đồ', path: '/analytics', icon: BarChart3, category: 'Điều hướng' },
      { id: 'nav-audit', title: 'Nhật ký hoạt động hệ thống (Audit Logs)', path: '/audit-logs', icon: Activity, category: 'Điều hướng' },
      { id: 'nav-cookie', title: 'Quản lý Cookie hệ thống', path: '/cookie', icon: CookieIcon, category: 'Điều hướng' },
      { id: 'nav-theme', title: `Chuyển giao diện sang: ${theme === 'dark' ? 'Chế độ Sáng' : 'Chế độ Tối'}`, action: 'toggleTheme', icon: theme === 'dark' ? Sun : Moon, category: 'Hệ thống' },
    ],
    [theme]
  );

  // Lọc dữ liệu kết quả tìm kiếm
  const filteredProfiles = useMemo(() => {
    if (!query.trim()) return profiles.slice(0, 5);
    const q = query.toLowerCase().trim();
    return profiles
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.uid && p.uid.toLowerCase().includes(q)) ||
          (p.profileUrl && p.profileUrl.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [profiles, query]);

  const filteredPosts = useMemo(() => {
    if (!query.trim()) return videos.slice(0, 5);
    const q = query.toLowerCase().trim();
    return videos
      .filter(
        (v) =>
          (v.caption && v.caption.toLowerCase().includes(q)) ||
          (v.nguoiDang && v.nguoiDang.toLowerCase().includes(q)) ||
          (v.link && v.link.toLowerCase().includes(q)) ||
          (v.id && v.id.toLowerCase().includes(q)) ||
          (v.STT && String(v.STT).includes(q))
      )
      .slice(0, 8);
  }, [videos, query]);

  const filteredNav = useMemo(() => {
    if (!query.trim()) return navItems;
    const q = query.toLowerCase().trim();
    return navItems.filter((item) => item.title.toLowerCase().includes(q));
  }, [navItems, query]);

  // Tạo danh sách tổng hợp để điều hướng bàn phím
  const allSelectableItems = useMemo(() => {
    type SelectableItem =
      | { type: 'profile'; data: UserProfileItem; id: string }
      | { type: 'post'; data: VideoItem; id: string }
      | { type: 'nav'; data: (typeof navItems)[number]; id: string };

    const list: SelectableItem[] = [];

    filteredProfiles.forEach((p) => list.push({ type: 'profile', data: p, id: p.id }));
    filteredPosts.forEach((post) => list.push({ type: 'post', data: post, id: post.id || String(post.STT) }));
    filteredNav.forEach((item) => list.push({ type: 'nav', data: item, id: item.id }));

    return list;
  }, [filteredProfiles, filteredPosts, filteredNav, navItems]);

  // Giữ selectedIndex trong khoảng hợp lệ
  useEffect(() => {
    if (selectedIndex >= allSelectableItems.length) {
      setSelectedIndex(Math.max(0, allSelectableItems.length - 1));
    }
  }, [allSelectableItems.length, selectedIndex]);

  // Tự động cuộn theo phần tử được chọn
  useEffect(() => {
    const activeEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Xử lý thực hiện lựa chọn
  const handleExecute = (item: (typeof allSelectableItems)[0]) => {
    if (!item) return;

    if (item.type === 'profile') {
      const prof = item.data as UserProfileItem;
      if (onSelectProfile) {
        onSelectProfile(prof.id);
      }
      navigate('/post-management');
      onClose();
    } else if (item.type === 'post') {
      const post = item.data as VideoItem;
      if (onSelectPost) {
        onSelectPost(post);
      }
      navigate('/post-management');
      onClose();
    } else if (item.type === 'nav') {
      const nav = item.data;
      if (nav.action === 'toggleTheme') {
        toggleTheme();
      } else if (nav.path) {
        navigate(nav.path);
      }
      onClose();
    }
  };

  // Bắt phím điều hướng bàn phím
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < allSelectableItems.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : allSelectableItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allSelectableItems[selectedIndex]) {
        handleExecute(allSelectableItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  let runningItemIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-slate-950/60 backdrop-blur-sm transition-all"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Thanh tìm kiếm trên cùng */}
        <div className="relative border-b border-slate-100 dark:border-slate-800 flex items-center px-4 py-3 bg-slate-50/50 dark:bg-slate-950/40">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Tìm trang, bài viết, hoặc gõ lệnh điều hướng..."
            className="w-full pl-3 pr-8 py-1.5 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">
              ESC
            </kbd>
          )}
        </div>

        {/* Danh sách kết quả cuộn */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-4 text-xs">
          {allSelectableItems.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="font-semibold">Không tìm thấy kết quả nào phù hợp</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Thử tìm với tên người đăng, UID hoặc từ khóa khác
              </p>
            </div>
          ) : (
            <>
              {/* Nhóm 1: Trang cá nhân & Profile */}
              {filteredProfiles.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-blue-500" />
                    <span>Trang cá nhân & Đơn vị theo dõi</span>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {filteredProfiles.map((p) => {
                      const itemIdx = runningItemIndex++;
                      const isSelected = selectedIndex === itemIdx;
                      return (
                        <div
                          key={p.id}
                          data-index={itemIdx}
                          onClick={() => handleExecute({ type: 'profile', data: p, id: p.id })}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                              {p.avatarUrl ? (
                                <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                              ) : (
                                <Users className="w-3.5 h-3.5 opacity-60" />
                              )}
                            </div>
                            <div className="truncate">
                              <span className="font-semibold text-xs">{p.name}</span>
                              <span
                                className={`ml-2 text-[10px] font-mono ${
                                  isSelected ? 'text-blue-100' : 'text-slate-400'
                                }`}
                              >
                                {p.uid ? `UID: ${p.uid}` : ''}
                              </span>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] shrink-0 font-medium px-2 py-0.5 rounded-md ${
                              isSelected
                                ? 'bg-blue-500/40 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            Xem bài viết
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Nhóm 2: Bài viết & Video */}
              {filteredPosts.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <FileText className="w-3 h-3 text-indigo-500" />
                    <span>Bài viết & Video gần đây</span>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {filteredPosts.map((post) => {
                      const itemIdx = runningItemIndex++;
                      const isSelected = selectedIndex === itemIdx;
                      const isVid = (post.loai || '').toLowerCase().includes('video') || (post.link || '').includes('video') || (post.link || '').includes('tiktok');
                      return (
                        <div
                          key={post.id || post.STT}
                          data-index={itemIdx}
                          onClick={() => handleExecute({ type: 'post', data: post, id: post.id || String(post.STT) })}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div
                              className={`p-1 rounded-lg shrink-0 ${
                                isSelected
                                  ? 'bg-white/20 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                              }`}
                            >
                              {isVid ? <Video className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                            </div>
                            <div className="truncate flex-1 min-w-0">
                              <p className="font-semibold truncate">
                                {post.caption || '(Không có tiêu đề)'}
                              </p>
                              <p
                                className={`text-[10px] truncate ${
                                  isSelected ? 'text-blue-100' : 'text-slate-400'
                                }`}
                              >
                                {post.nguoiDang ? `${post.nguoiDang} • ` : ''}
                                {post.ngayDang || 'Mới cập nhật'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <span
                              className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${
                                isSelected
                                  ? 'bg-blue-700 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              👍 {post.LuotLike || 0}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Nhóm 3: Điều hướng & Tác vụ nhanh */}
              {filteredNav.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Compass className="w-3 h-3 text-emerald-500" />
                    <span>Điều hướng & Tác vụ</span>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {filteredNav.map((nav) => {
                      const itemIdx = runningItemIndex++;
                      const isSelected = selectedIndex === itemIdx;
                      const Icon = nav.icon;
                      return (
                        <div
                          key={nav.id}
                          data-index={itemIdx}
                          onClick={() => handleExecute({ type: 'nav', data: nav, id: nav.id })}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon className="w-4 h-4 shrink-0 opacity-70" />
                            <span className="font-semibold">{nav.title}</span>
                          </div>
                          <span
                            className={`text-[10px] font-mono ${
                              isSelected ? 'text-blue-100' : 'text-slate-400'
                            }`}
                          >
                            Enter ↵
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer phím tắt */}
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono text-[9px]">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono text-[9px]">
                ↓
              </kbd>
              <span>Di chuyển</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono text-[9px]">
                ↵
              </kbd>
              <span>Chọn</span>
            </span>
          </div>
          <span>Phím tắt: <strong>Ctrl + K</strong></span>
        </div>
      </div>
    </div>
  );
};
