import React from 'react';
import { HelpCircle, CheckCircle } from 'lucide-react';

export const HelpPage: React.FC = () => {
  const faqs = [
    {
      q: 'Làm thế nào để thêm video Facebook hoặc TikTok vào theo dõi?',
      a: 'Bạn vào trang "Dashboard" hoặc "Data Library", dán đường link video (Facebook Reel, Video hoặc TikTok) vào ô nhập và bấm nút "Thêm video". Hệ thống sẽ tự động phân tích và bắt đầu cào số liệu.',
    },
    {
      q: 'Hệ thống cập nhật dữ liệu video bao lâu một lần?',
      a: 'Hệ thống chạy ngầm và tự động kích hoạt worker quét lại toàn bộ danh sách video mỗi 3 phút một lần. Bạn cũng có thể bấm nút "Làm mới tất cả" bất kỳ lúc nào để quét tức thì.',
    },
    {
      q: 'Làm thế nào để xuất dữ liệu ra file Excel hoặc CSV?',
      a: 'Tại trang "Data Library" hoặc "Báo cáo", bấm vào nút "Xuất dữ liệu" rồi chọn "Xuất file Excel (.xlsx)" hoặc "Xuất file CSV (.csv)". File xuất ra đã có mã hóa UTF-8 BOM chuẩn tiếng Việt.',
    },
    {
      q: 'Hệ thống cào dữ liệu bằng công nghệ gì?',
      a: 'Backend sử dụng NestJS kết hợp cùng Playwright Headless Browser để thu thập chính xác lượt like, share, view, comment và ngày đăng của các video.',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Trung Tâm Trợ Giúp &amp; Hướng Dẫn</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Câu hỏi thường gặp và tài liệu hướng dẫn vận hành hệ thống Video Tracker Realtime
            </p>
          </div>
        </div>
      </div>

      {/* FAQ Accordions / List */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 shadow-xs">
        {faqs.map((f, idx) => (
          <div key={idx} className="p-5">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2 mb-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
              {f.q}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 pl-6 leading-relaxed">
              {f.a}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
