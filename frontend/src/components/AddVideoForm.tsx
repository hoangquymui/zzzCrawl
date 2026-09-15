import React, { useState } from 'react';
import { Plus, Link as LinkIcon, Loader2 } from 'lucide-react';
import { FacebookIcon, TikTokIcon } from './Icons';
import { sanitizeVideoUrl } from '../utils/formatters';

interface AddVideoFormProps {
  onAddVideo: (url: string) => Promise<boolean>;
  crawlStatus: string | null;
}

export const AddVideoForm: React.FC<AddVideoFormProps> = ({ onAddVideo, crawlStatus }) => {
  const [url, setUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = sanitizeVideoUrl(url);
    if (!cleanUrl) return;

    setIsSubmitting(true);
    const success = await onAddVideo(cleanUrl);
    setIsSubmitting(false);

    if (success) {
      setUrl('');
    }
  };

  const handleFillSample = (type: 'fb' | 'tiktok') => {
    if (type === 'fb') {
      setUrl('https://www.facebook.com/watch/?v=10153231379946729');
    } else {
      setUrl(
        'https://www.tiktok.com/@muoivangot/video/7661067511688940821?is_from_webapp=1&sender_device=pc'
      );
    }
  };

  return (
    <div id="add-video-form" className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm dark:shadow-xl transition-colors scroll-mt-20">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
          Thêm link video cần theo dõi (Facebook Reel, Facebook Video hoặc TikTok):
        </label>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
              <LinkIcon className="w-4 h-4" />
            </span>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Dán đường link Facebook hoặc TikTok vào đây (ví dụ: https://www.facebook.com/reel/...)"
              className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-700/80 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !url.trim()}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-blue-500/25 transition flex items-center justify-center gap-2 min-w-[170px] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang cào...</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Thêm theo dõi</span>
              </>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleFillSample('fb')}
              className="text-xs text-blue-400 hover:text-blue-300 transition flex items-center gap-1.5 cursor-pointer"
            >
              <FacebookIcon className="w-3.5 h-3.5 text-blue-400" /> Link mẫu FB
            </button>
            <button
              type="button"
              onClick={() => handleFillSample('tiktok')}
              className="text-xs text-pink-400 hover:text-pink-300 transition flex items-center gap-1.5 cursor-pointer"
            >
              <TikTokIcon className="w-3.5 h-3.5 text-pink-400" /> Link mẫu TikTok
            </button>
          </div>

          {crawlStatus && (
            <div className="text-xs text-blue-400 font-medium flex items-center gap-2 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{crawlStatus}</span>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};
