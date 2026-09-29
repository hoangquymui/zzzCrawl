import React, { useState, useMemo } from 'react';
import {
  HelpCircle,
  ChevronDown,
  Key,
  Video,
  UserCheck,
  ShieldAlert,
  FileSpreadsheet,
  Search,
  Sparkles,
  Layers,
} from 'lucide-react';

interface FaqItem {
  id: string;
  category: 'cookie' | 'video' | 'scanner' | 'rules' | 'backup';
  question: string;
  answer: React.ReactNode;
}

export const HelpPage: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [openIds, setOpenIds] = useState<Set<string>>(
    new Set(['cookie-status-dots', 'cookie-browser-login'])
  );

  const toggleAccordion = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setOpenIds(new Set(faqs.map((f) => f.id)));
  };

  const handleCollapseAll = () => {
    setOpenIds(new Set());
  };

  const faqs: FaqItem[] = [
    // -------------------------------------------------------------------------
    // 1. QUẢN LÝ COOKIE & ĐĂNG NHẬP FACEBOOK
    // -------------------------------------------------------------------------
    {
      id: 'cookie-status-dots',
      category: 'cookie',
      question: 'Ý nghĩa các màu chấm trạng thái trên từng Tab Cookie là gì?',
      answer: (
        <div className="space-y-3">
          <p>
            Mỗi tab từ <strong>Cookie 1</strong> đến <strong>Cookie 5</strong> đều có một chấm màu hiển thị trạng thái hoạt động theo thời gian thực:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-start gap-2.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0 mt-0.5" />
              <div>
                <strong className="text-emerald-700 dark:text-emerald-400">🟢 Chấm xanh lá (Live):</strong>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5">Cookie đang <strong>BẬT</strong> và phiên Facebook còn hạn sử dụng tốt.</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0 mt-0.5" />
              <div>
                <strong className="text-blue-700 dark:text-blue-400">🔵 Chấm xanh lam (Active):</strong>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5">Cookie đang <strong>BẬT</strong> và đã nạp dữ liệu (chưa bấm kiểm tra).</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0 mt-0.5" />
              <div>
                <strong className="text-rose-700 dark:text-rose-400">🔴 Chấm đỏ (Die):</strong>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5">Cookie đang <strong>BẬT</strong> nhưng phiên đã bị Facebook hủy hoặc hết hạn.</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-3 h-3 rounded-full bg-slate-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-700 dark:text-slate-300">⚪ Chấm xám (Off / Empty):</strong>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5">Cookie đang <strong>TẮT</strong> hoặc chưa được nạp dữ liệu vào slot.</p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'cookie-browser-login',
      category: 'cookie',
      question: 'Làm thế nào để lấy Cookie Facebook tự động bằng trình duyệt thật?',
      answer: (
        <div className="space-y-2.5">
          <p>
            Hệ thống cung cấp tính năng <strong>Đăng nhập Facebook bằng trình duyệt thật</strong> giúp bạn lấy cookie an toàn 100% mà không sợ bị checkpoint hay khóa nick:
          </p>
          <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed">
            <li>Vào trang <strong>Quản lý Cookie</strong>, chọn tab Cookie muốn nạp (ví dụ <code>Cookie 1</code>).</li>
            <li>Bấm nút màu tím <strong>"Đăng nhập Facebook"</strong> ở góc phải.</li>
            <li>Một cửa sổ trình duyệt <strong>Chrome thật</strong> sẽ xuất hiện trên màn hình máy tính của bạn và vào sẵn trang Facebook.</li>
            <li>Bạn tự tay gõ <strong>Tài khoản &amp; Mật khẩu</strong> (và mã 2FA nếu có) như lướt web thông thường.</li>
            <li>
              <strong>Tự động 100%:</strong> Ngay khi đăng nhập thành công vào trang chủ Facebook, hệ thống sẽ tự động bóc tách toàn bộ cookie, lưu vào tab Cookie đó, kích hoạt BẬT và tự động đóng cửa sổ Chrome lại!
            </li>
          </ol>
        </div>
      ),
    },
    {
      id: 'cookie-round-robin',
      category: 'cookie',
      question: 'Tại sao hệ thống có 5 tab Cookie và cơ chế Luân phiên (Round-Robin) hoạt động ra sao?',
      answer: (
        <div className="space-y-2">
          <p>
            Facebook thường giới hạn tần suất (Rate Limit) nếu một tài khoản gửi quá nhiều yêu cầu cào dữ liệu trong thời gian ngắn (gây lỗi <em>"You’re Temporarily Blocked"</em>).
          </p>
          <p>
            Để giải quyết triệt để vấn đề này, hệ thống hỗ trợ <strong>5 Cookie độc lập</strong> và áp dụng thuật toán <strong>Round-Robin (Luân phiên tự động)</strong>:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>Mỗi lượt cào video, quét bài viết hoặc tải thông tin cá nhân sẽ lần lượt xoay vòng qua các Cookie đang BẬT: <code>Cookie 1 ➔ Cookie 2 ➔ Cookie 3 ➔ ...</code></li>
            <li>Nhờ đó, khối lượng công việc được chia đều cho nhiều tài khoản, giúp mỗi tài khoản chỉ chịu tải nhẹ và không bao giờ bị Facebook gắn cờ spam.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'cookie-duplicate',
      category: 'cookie',
      question: 'Các Cookie có được dùng chung một tài khoản Facebook không?',
      answer: (
        <div className="space-y-2">
          <p>
            <strong>KHÔNG.</strong> Các tab Cookie bắt buộc phải là các tài khoản Facebook khác nhau.
          </p>
          <p>
            Hệ thống có bộ lọc tự động trích xuất mã định danh người dùng Facebook (<code>c_user</code> / UID). Nếu bạn vô tình dán hoặc đăng nhập trùng tài khoản với tab khác, hệ thống sẽ <strong>từ chối lưu và cảnh báo lỗi màu đỏ ngay lập tức</strong> để đảm bảo hiệu quả của cơ chế luân phiên.
          </p>
        </div>
      ),
    },
    {
      id: 'cookie-persistence',
      category: 'cookie',
      question: 'Sau khi đóng cửa sổ trình duyệt thì Cookie có còn dùng được không?',
      answer: (
        <div className="space-y-2">
          <p>
            <strong>CÒN NGUYÊN VẸN VÀ DÙNG ĐƯỢC RẤT LÂU (hàng tuần hoặc hàng tháng).</strong>
          </p>
          <p>
            Đóng trình duyệt chỉ là tắt ứng dụng trên máy tính của bạn. Chuỗi Cookie (chứng chỉ phiên) được Facebook cấp có hạn sử dụng dài hạn trên máy chủ Facebook. Chỉ khi bạn chủ động vào Facebook bấm nút <strong>"Đăng xuất" (Log out)</strong> hoặc <strong>Đổi mật khẩu</strong> thì Cookie mới bị vô hiệu hóa.
          </p>
        </div>
      ),
    },
    {
      id: 'cookie-manual',
      category: 'cookie',
      question: 'Làm thế nào để xuất Cookie thủ công bằng tiện ích trình duyệt?',
      answer: (
        <div className="space-y-2">
          <p>Nếu bạn muốn dán cookie thủ công thay vì mở trình duyệt tự động:</p>
          <ol className="list-decimal list-inside space-y-1.5 pl-1">
            <li>Cài tiện ích <strong>J2TEAM Cookies</strong> hoặc <strong>Cookie-Editor</strong> trên Chrome/Edge.</li>
            <li>Mở Facebook, bấm vào tiện ích và chọn <strong>Export JSON</strong>.</li>
            <li>Dán toàn bộ đoạn mã JSON vừa copy vào ô nội dung của tab Cookie tương ứng rồi bấm <strong>"Lưu Cookie"</strong>.</li>
          </ol>
        </div>
      ),
    },

    // -------------------------------------------------------------------------
    // 2. THEO DÕI VIDEO & REEL
    // -------------------------------------------------------------------------
    {
      id: 'video-add',
      category: 'video',
      question: 'Làm thế nào để thêm video Facebook hoặc TikTok vào theo dõi?',
      answer: (
        <div className="space-y-2">
          <p>Tại trang <strong>Dashboard</strong> hoặc <strong>Data Library</strong>:</p>
          <ol className="list-decimal list-inside space-y-1.5 pl-1">
            <li>Dán đường link bài viết/video vào ô nhập URL ở thanh trên cùng.</li>
            <li>
              Hệ thống hỗ trợ tất cả các định dạng:
              <ul className="list-disc list-inside pl-4 mt-1 space-y-1 font-mono text-xs">
                <li>Facebook Reel: https://www.facebook.com/reel/123456789...</li>
                <li>Facebook Video: https://www.facebook.com/watch/?v=123456789...</li>
                <li>Facebook Post: https://www.facebook.com/[user]/posts/...</li>
                <li>TikTok Video: https://www.tiktok.com/@user/video/123456789...</li>
                <li>TikTok Photo: https://www.tiktok.com/@user/photo/123456789...</li>
              </ul>
            </li>
            <li>Bấm <strong>"Thêm video"</strong>. Hệ thống sẽ cào tự động và hiển thị số liệu tức thì.</li>
          </ol>
        </div>
      ),
    },
    {
      id: 'video-refresh-interval',
      category: 'video',
      question: 'Hệ thống cập nhật dữ liệu video bao lâu một lần?',
      answer: (
        <div className="space-y-2">
          <p>
            Hệ thống có tiến trình chạy nền tự động quét lại toàn bộ danh sách video theo chu kỳ <strong>mỗi 3 phút một lần</strong>.
          </p>
          <p>
            Ngoài ra, bạn có thể:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>Bấm nút <strong>"Làm mới tất cả"</strong> trên thanh công cụ để quét toàn bộ ngay lập tức.</li>
            <li>Bấm biểu tượng <strong>Làm mới (Refresh)</strong> ở từng hàng video để cập nhật riêng video đó.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'video-shared-detection',
      category: 'video',
      question: 'Hệ thống nhận diện video chia sẻ (Shared Post) và bài gốc như thế nào?',
      answer: (
        <div className="space-y-2">
          <p>
            Đối với các bài đăng dạng chia sẻ (Share) trên Facebook, hệ thống tự động:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>Gắn nhãn huy hiệu <strong>"Được chia sẻ"</strong> trên bảng dữ liệu.</li>
            <li>Trích xuất chính xác <strong>Người đăng ban đầu (Original Author)</strong> và đường link bài đăng gốc.</li>
            <li>Lấy đúng số liệu tương tác thực tế của nội dung gốc.</li>
          </ul>
        </div>
      ),
    },

    // -------------------------------------------------------------------------
    // 3. QUÉT TRANG CÁ NHÂN / FANPAGE (PROFILE SCANNER)
    // -------------------------------------------------------------------------
    {
      id: 'scanner-usage',
      category: 'scanner',
      question: 'Tính năng Quét trang cá nhân (Profile Scanner) hoạt động ra sao?',
      answer: (
        <div className="space-y-2">
          <p>
            Trang <strong>Quét trang cá nhân</strong> cho phép bạn cào hàng loạt bài viết từ một hoặc nhiều Facebook Profile / Fanpage:
          </p>
          <ol className="list-decimal list-inside space-y-1.5 pl-1">
            <li>Nhập đường link trang cá nhân hoặc Fanpage cần quét.</li>
            <li>Thiết lập số lần cuộn trang (Max Scrolls) và bộ lọc thời gian nếu cần.</li>
            <li>Bấm <strong>"Bắt đầu quét"</strong>. Trình duyệt ngầm sẽ tự động lướt trang, bóc tách toàn bộ bài viết, video, reel, lượt like, comment, share và ngày đăng.</li>
            <li>Bạn có thể chọn các bài viết ưng ý rồi bấm <strong>"Thêm vào thư viện"</strong> để đưa vào theo dõi realtime.</li>
          </ol>
        </div>
      ),
    },
    {
      id: 'scanner-date-filter',
      category: 'scanner',
      question: 'Làm thế nào để lọc bài viết theo khoảng ngày (Từ ngày - Đến ngày)?',
      answer: (
        <div className="space-y-2">
          <p>
            Tại thanh cấu hình quét của Profile Scanner:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>Chọn <strong>Từ ngày (Start Date)</strong>: Bỏ qua các bài viết cũ hơn mốc này.</li>
            <li>Chọn <strong>Đến ngày (End Date)</strong>: Bỏ qua các bài viết mới hơn mốc này.</li>
            <li>Hệ thống hỗ trợ phân tích định dạng ngày chuẩn tiếng Việt (ví dụ: <em>"12 giờ trước"</em>, <em>"Hôm qua lúc 14:00"</em>, <em>"25 Tháng 9"</em>) để đối chiếu chính xác.</li>
          </ul>
        </div>
      ),
    },

    // -------------------------------------------------------------------------
    // 4. BỘ TỪ KHÓA & QUY TẮC VI PHẠM (VOCABULARY RULES)
    // -------------------------------------------------------------------------
    {
      id: 'rules-vocabulary',
      category: 'rules',
      question: 'Bộ từ khóa vi phạm (Vocabulary / Violation Rules) dùng để làm gì?',
      answer: (
        <div className="space-y-2">
          <p>
            Tính năng <strong>Từ khóa vi phạm</strong> giúp bạn phát hiện tự động các bài viết có nội dung xấu, vi phạm tiêu chuẩn hoặc chứa các từ ngữ nhạy cảm:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>Bạn có thể thêm các từ cấm, phân loại theo mức độ nghiêm trọng (Nhẹ, Trung bình, Nghiêm trọng).</li>
            <li>Khi quét bài viết hoặc cập nhật video, hệ thống tự động đối soát nội dung caption.</li>
            <li>Nếu phát hiện từ vi phạm, bài viết sẽ được gắn cờ đỏ cảnh báo và hiển thị lý do vi phạm rõ ràng.</li>
          </ul>
        </div>
      ),
    },

    // -------------------------------------------------------------------------
    // 5. XUẤT DỮ LIỆU & SAO LƯU (BACKUP & EXPORT)
    // -------------------------------------------------------------------------
    {
      id: 'export-excel-csv',
      category: 'backup',
      question: 'Làm thế nào để xuất dữ liệu ra file Excel hoặc CSV chuẩn tiếng Việt?',
      answer: (
        <div className="space-y-2">
          <p>Tại trang <strong>Data Library</strong> hoặc <strong>Báo cáo</strong>:</p>
          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>Bấm vào nút <strong>"Xuất Excel"</strong>: Tạo file bảng tính <code>.xlsx</code> với đầy đủ cột dữ liệu, định dạng số và công thức đẹp mắt.</li>
            <li>Bấm nút <strong>"Xuất CSV"</strong>: Tạo file <code>.csv</code> có chèn mã <strong>UTF-8 BOM</strong>, đảm bảo khi mở bằng Microsoft Excel tiếng Việt không bị lỗi font chữ.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'backup-database',
      category: 'backup',
      question: 'Dữ liệu của hệ thống được lưu ở đâu và làm sao để sao lưu an toàn?',
      answer: (
        <div className="space-y-2">
          <p>
            Toàn bộ dữ liệu của hệ thống được lưu trữ tập trung trong thư mục <code>backend/data/</code>:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li><code>database.sqlite</code>: Cơ sở dữ liệu SQLite chứa toàn bộ danh sách video, tài khoản, cấu hình và lịch sử.</li>
            <li><code>cookies.json</code>: Tệp lưu trữ cookie Facebook dùng chung.</li>
            <li><code>avatars/</code>: Thư mục chứa ảnh đại diện của các kênh/hồ sơ đã tải về máy.</li>
          </ul>
          <p className="text-slate-500 text-xs">
            👉 Bạn chỉ việc copy thư mục <code>data/</code> để sao lưu toàn bộ hệ thống sang máy tính khác bất kỳ lúc nào.
          </p>
        </div>
      ),
    },
  ];

  // Lọc theo chuyên mục và từ khóa tìm kiếm
  const filteredFaqs = useMemo(() => {
    return faqs.filter((item) => {
      const matchCategory =
        activeCategory === 'all' || item.category === activeCategory;
      const matchSearch =
        !searchQuery.trim() ||
        item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (typeof item.answer === 'string' &&
          item.answer.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCategory && matchSearch;
    });
  }, [faqs, activeCategory, searchQuery]);

  return (
    <div className="space-y-6 pb-12">
      {/* 1. TOP HEADER BANNER */}
      <div className="bg-gradient-to-r from-blue-600/10 via-indigo-600/5 to-purple-600/10 border border-blue-200/80 dark:border-blue-900/50 rounded-2xl p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <div className="p-3.5 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl shrink-0 shadow-md shadow-blue-500/20">
              <HelpCircle className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  Trung Tâm Trợ Giúp &amp; Hướng Dẫn
                </h1>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  <Sparkles className="w-3 h-3 mr-1" /> Vận hành chi tiết
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
                Giải đáp câu hỏi thường gặp, hướng dẫn quản lý 5 Cookie Facebook, cào video tự động và quản trị hệ thống.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <button
              type="button"
              onClick={handleExpandAll}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 transition cursor-pointer shadow-2xs"
            >
              Mở tất cả
            </button>
            <button
              type="button"
              onClick={handleCollapseAll}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 transition cursor-pointer shadow-2xs"
            >
              Thu gọn
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm câu hỏi (ví dụ: cookie, màu chấm, facebook, cào video, excel...)..."
            className="w-full text-xs sm:text-sm pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 absolute right-3.5 top-1/2 -translate-y-1/2 font-medium cursor-pointer"
            >
              Xóa
            </button>
          )}
        </div>
      </div>

      {/* 2. CATEGORY TABS */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer border ${
            activeCategory === 'all'
              ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Tất cả ({faqs.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('cookie')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer border ${
            activeCategory === 'cookie'
              ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Key className="w-3.5 h-3.5 text-amber-500" />
          <span>Quản lý Cookie ({faqs.filter((f) => f.category === 'cookie').length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('video')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer border ${
            activeCategory === 'video'
              ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Video className="w-3.5 h-3.5 text-blue-500" />
          <span>Theo dõi Video &amp; Reel ({faqs.filter((f) => f.category === 'video').length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('scanner')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer border ${
            activeCategory === 'scanner'
              ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
          <span>Quét Profile / Fanpage ({faqs.filter((f) => f.category === 'scanner').length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('rules')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer border ${
            activeCategory === 'rules'
              ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
          <span>Từ khóa vi phạm ({faqs.filter((f) => f.category === 'rules').length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('backup')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer border ${
            activeCategory === 'backup'
              ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
          <span>Xuất file &amp; Sao lưu ({faqs.filter((f) => f.category === 'backup').length})</span>
        </button>
      </div>

      {/* 3. ACCORDION FAQ LIST */}
      <div className="space-y-3">
        {filteredFaqs.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-2">
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Không tìm thấy câu hỏi nào phù hợp với từ khóa "<strong>{searchQuery}</strong>".
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('all');
              }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
            >
              Xem tất cả câu hỏi
            </button>
          </div>
        ) : (
          filteredFaqs.map((faq) => {
            const isOpen = openIds.has(faq.id);

            // Icon tương ứng category
            let CatIcon = Key;
            let catColor = 'text-amber-500 bg-amber-500/10';
            let catName = 'Cookie';

            if (faq.category === 'video') {
              CatIcon = Video;
              catColor = 'text-blue-500 bg-blue-500/10';
              catName = 'Video & Reel';
            } else if (faq.category === 'scanner') {
              CatIcon = UserCheck;
              catColor = 'text-indigo-500 bg-indigo-500/10';
              catName = 'Profile Scanner';
            } else if (faq.category === 'rules') {
              CatIcon = ShieldAlert;
              catColor = 'text-rose-500 bg-rose-500/10';
              catName = 'Quy tắc vi phạm';
            } else if (faq.category === 'backup') {
              CatIcon = FileSpreadsheet;
              catColor = 'text-emerald-500 bg-emerald-500/10';
              catName = 'Xuất & Sao lưu';
            }

            return (
              <div
                key={faq.id}
                className={`bg-white dark:bg-slate-900 border rounded-2xl transition shadow-xs overflow-hidden ${
                  isOpen
                    ? 'border-blue-300 dark:border-blue-900/60 ring-1 ring-blue-500/10'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {/* Header câu hỏi (Click để xổ xuống / thu lại) */}
                <button
                  type="button"
                  onClick={() => toggleAccordion(faq.id)}
                  className="w-full text-left p-4 sm:p-5 flex items-center justify-between gap-4 cursor-pointer transition select-none"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={`p-2 rounded-xl shrink-0 ${catColor}`}>
                      <CatIcon className="w-4 h-4" />
                    </div>

                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                        {catName}
                      </span>
                      <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white leading-snug">
                        {faq.question}
                      </h3>
                    </div>
                  </div>

                  <div className="shrink-0 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    <ChevronDown
                      className={`w-5 h-5 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''
                      }`}
                    />
                  </div>
                </button>

                {/* Nội dung câu trả lời (Xổ xuống từ câu hỏi) */}
                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800/80 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="pt-3">{faq.answer}</div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
