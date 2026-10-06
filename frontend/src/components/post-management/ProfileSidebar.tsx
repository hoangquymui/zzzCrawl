import React from 'react';
import { Users, Search, User, Layers } from 'lucide-react';
import { UserProfileItem } from '../../types/profile-management';
import { VideoItem } from '../../types/video';
import { ResizeHandle } from '../ResizeHandle';

export interface ProfileSidebarProps {
  profiles: UserProfileItem[];
  selectedUserId: string;
  onSelectUser: (id: string) => void;
  userSearchTerm: string;
  onUserSearchChange: (value: string) => void;
  profilePostMap: Map<string, VideoItem[]>;
  otherPostsCount: number;
  width?: number;
  onResize?: (e: React.MouseEvent) => void;
}

export const ProfileSidebar: React.FC<ProfileSidebarProps> = ({
  profiles,
  selectedUserId,
  onSelectUser,
  userSearchTerm,
  onUserSearchChange,
  profilePostMap,
  otherPostsCount,
  width,
  onResize,
}) => {
  return (
    <div
      style={{
        width: typeof window !== 'undefined' && window.innerWidth >= 1024 && width ? `${width}px` : undefined,
      }}
      className="w-full lg:shrink-0 relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col min-h-[580px] max-h-[780px] overflow-hidden"
    >
      {/* Header Cột 1 */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-500" />
          <span>Danh sách người dùng:</span>
        </h2>

        {/* Ô tìm kiếm người dùng */}
        <div className="relative mt-2.5">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={userSearchTerm}
            onChange={(e) => onUserSearchChange(e.target.value)}
            placeholder="Tìm tên hoặc UID..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none focus:border-blue-500 transition"
          />
        </div>
      </div>

      {/* Danh sách cuộn Người dùng */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {profiles.length === 0 && userSearchTerm && (
          <div className="py-8 text-center text-slate-400 text-xs">
            Không tìm thấy profile nào phù hợp.
          </div>
        )}

        {profiles.map((p) => {
          const isSelected = selectedUserId === p.id;
          const postCount = profilePostMap.get(p.id)?.length || 0;

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectUser(p.id)}
              className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                isSelected
                  ? 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100 shadow-xs'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent text-slate-700 dark:text-slate-300'
              }`}
            >
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-slate-200 dark:bg-slate-800 flex items-center justify-center border border-slate-200/80 dark:border-slate-700">
                {p.avatarUrl ? (
                  <img
                    src={p.avatarUrl}
                    alt={p.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <User className="w-4 h-4 text-slate-400" />
                )}
              </div>

              {/* Thông tin tên & UID */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-xs truncate">{p.name}</p>
                <p className="text-[10px] text-slate-400 font-mono truncate">
                  {p.uid ? `UID: ${p.uid}` : p.profileUrl?.replace('https://www.facebook.com/', '')}
                </p>
              </div>

              {/* Số lượng bài viết */}
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                  postCount > 0
                    ? isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    : 'bg-slate-100 dark:bg-slate-800/40 text-slate-400'
                }`}
              >
                {postCount}
              </span>
            </button>
          );
        })}

        {/* Mục cố định: BÀI VIẾT KHÁC */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 my-1">
          <button
            type="button"
            onClick={() => onSelectUser('__OTHER__')}
            className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all cursor-pointer ${
              selectedUserId === '__OTHER__'
                ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100 shadow-xs'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 text-slate-700 dark:text-slate-300 bg-slate-50/40 dark:bg-slate-950/30'
            }`}
          >
            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-800">
              <Layers className="w-4 h-4" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-bold text-xs truncate">Bài viết khác</p>
              <p className="text-[10px] text-slate-400 truncate">Người đăng ngoài profile</p>
            </div>

            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                otherPostsCount > 0
                  ? selectedUserId === '__OTHER__'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}
            >
              {otherPostsCount}
            </span>
          </button>
        </div>
      </div>

      {/* ResizeHandle cho Cột 1 (Desktop) */}
      {onResize && (
        <ResizeHandle
          onMouseDown={onResize}
          className="hidden lg:flex"
        />
      )}
    </div>
  );
};
