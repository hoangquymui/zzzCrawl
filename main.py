import asyncio
import datetime
import re
import sqlite3
import yt_dlp
from playwright.async_api import async_playwright

# 1. Khởi tạo Database SQLite
def init_db():
    conn = sqlite3.connect("video_metrics.db")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS metrics_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            stt INTEGER,
            link TEXT,
            caption TEXT,
            loai TEXT,
            nguoiDang TEXT,
            ngayDang TEXT,
            SoLuongNguoiShare INTEGER,
            DanhSachShare TEXT,
            LuotXem TEXT,
            LuotLike INTEGER,
            LuotComment INTEGER
        )
    """)
    conn.commit()
    conn.close()

def save_metric(data):
    conn = sqlite3.connect("video_metrics.db")
    cursor = conn.cursor()
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
        INSERT INTO metrics_history (
            timestamp, stt, link, caption, loai, nguoiDang, ngayDang,
            SoLuongNguoiShare, DanhSachShare, LuotXem, LuotLike, LuotComment
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        now, data["STT"], data["link"], data["caption"], data["loai"],
        data["nguoiDang"], data["ngayDang"], data["SoLuongNguoiShare"],
        data["DanhSachShare"], str(data["LuotXem"]), data["LuotLike"], data["LuotComment"]
    ))
    conn.commit()
    conn.close()

def parse_count(text):
    if not text:
        return 0
    text = str(text).upper().strip()
    match = re.search(r'([\d\.,]+)\s*([KM]?)', text)
    if not match:
        return 0
    val_str, unit = match.groups()
    val = float(val_str.replace(',', ''))
    if unit == 'K':
        return int(val * 1000)
    elif unit == 'M':
        return int(val * 1000000)
    return int(val)

# 2. Bóc tách dữ liệu TikTok
def get_tiktok_stats(url, stt):
    ydl_opts = {'quiet': True, 'skip_download': True}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        upload_date = info.get('upload_date')
        formatted_date = f"{upload_date[6:8]}/{upload_date[4:6]}/{upload_date[0:4]}" if upload_date else ""

        return {
            "STT": stt,
            "link": url,
            "caption": (info.get('description') or info.get('title') or '').strip(),
            "loai": "TikTok Video",
            "nguoiDang": info.get('uploader') or info.get('channel') or '',
            "ngayDang": formatted_date,
            "SoLuongNguoiShare": info.get('repost_count', 0),
            "DanhSachShare": "Không hỗ trợ (bị ẩn)",
            "LuotXem": info.get('view_count', 0),
            "LuotLike": info.get('like_count', 0),
            "LuotComment": info.get('comment_count', 0)
        }

# 3. Bóc tách dữ liệu Facebook (Tối ưu hóa cho cả Video và Reel)
async def get_fb_stats(page, url, stt):
    await page.goto(url, wait_until="domcontentloaded", timeout=35000)
    await page.wait_for_timeout(4000)

    # Đóng popup đăng nhập nếu có
    try:
        close_btn = await page.query_selector('div[aria-label="Đóng"], div[aria-label="Close"], [role="button"]:has-text("✕")')
        if close_btn:
            await close_btn.click()
            await page.wait_for_timeout(1000)
    except Exception:
        pass

    # Lấy Tên người đăng
    author = ""
    author_elem = (
        await page.query_selector('h2 span') or 
        await page.query_selector('strong span') or 
        await page.query_selector('a[role="link"] strong')
    )
    if author_elem:
        author = (await author_elem.inner_text()).strip()

    # Lấy Caption
    caption = ""
    caption_elem = (
        await page.query_selector('div[dir="auto"][style*="text-align"]') or
        await page.query_selector('div[style*="line-height"] span[dir="auto"]') or
        await page.query_selector('meta[property="og:description"]') or
        await page.query_selector('meta[name="description"]')
    )
    if caption_elem:
        caption = await caption_elem.get_attribute('content') if await caption_elem.get_attribute('content') else await caption_elem.inner_text()

    likes, comments, shares, views = 0, 0, 0, "N/A"

    # Kiểm tra nếu là Facebook Reel (quét các nút tương tác dọc bên phải)
    action_buttons = await page.query_selector_all('div[role="button"]')
    reel_numbers = []
    for btn in action_buttons:
        text = (await btn.inner_text()).strip()
        # Lấy những nút chỉ chứa số (ví dụ: 159, 13, 6 hoặc 1.2K)
        if re.match(r'^[\d\.,]+[KM]?$', text):
            reel_numbers.append(text)

    if len(reel_numbers) >= 2:
        # Thứ tự chuẩn trên giao diện Facebook Reel bên phải: [0] Like, [1] Comment, [2] Share
        likes = parse_count(reel_numbers[0])
        comments = parse_count(reel_numbers[1])
        shares = parse_count(reel_numbers[2]) if len(reel_numbers) >= 3 else 0
    else:
        # Fallback quét toàn bộ text trang nếu là Video thường dạng feed
        body_text = await page.inner_text("body")
        def parse_regex(pattern):
            m = re.search(pattern, body_text, re.IGNORECASE)
            return m.group(1) if m else "0"

        likes = parse_count(parse_regex(r'([\d\.,]+[KM]?)\s*(lượt thích|likes)'))
        comments = parse_count(parse_regex(r'([\d\.,]+[KM]?)\s*(bình luận|comments)'))
        shares = parse_count(parse_regex(r'([\d\.,]+[KM]?)\s*(lượt chia sẻ|shares)'))
        view_str = parse_regex(r'([\d\.,]+[KM]?)\s*(lượt xem|views)')
        views = parse_count(view_str) if view_str != "0" else "N/A"

    return {
        "STT": stt,
        "link": url,
        "caption": caption.strip(),
        "loai": "Facebook Reel" if "/reel/" in url else "Facebook Video",
        "nguoiDang": author,
        "ngayDang": "Xem trực tiếp bài viết",
        "SoLuongNguoiShare": shares,
        "DanhSachShare": "Quyền riêng tư (bị ẩn)",
        "LuotXem": views,
        "LuotLike": likes,
        "LuotComment": comments
    }

# 4. Job quét danh sách link
async def run_scrape_batch(urls, playwright_instance):
    current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n==================== CẬP NHẬT LÚC: {current_time} ====================")
    
    has_fb = any("facebook.com" in u or "fb.watch" in u for u in urls)
    browser = None
    page = None

    if has_fb:
        browser = await playwright_instance.chromium.launch(headless=True)
        # Giả lập context giống trình duyệt người dùng thật để tránh bị Facebook chặn hiển thị
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800}
        )
        page = await context.new_page()

    for idx, url in enumerate(urls, start=1):
        data = None
        try:
            if "tiktok.com" in url:
                data = await asyncio.to_thread(get_tiktok_stats, url, idx)
            elif "facebook.com" in url or "fb.watch" in url:
                data = await get_fb_stats(page, url, idx)
            else:
                print(f"[{idx}] Link không hợp lệ: {url}")
                continue

            if data:
                save_metric(data)
                print(f"""
--- [STT: {data['STT']}] ---
• link             : {data['link']}
• caption          : {data['caption'][:80]}{'...' if len(data['caption']) > 80 else ''}
• loai             : {data['loai']}
• nguoiDang        : {data['nguoiDang']}
• ngayDang         : {data['ngayDang']}
• SoLuongNguoiShare: {data['SoLuongNguoiShare']}
• DanhSachShare    : {data['DanhSachShare']}
• LuotXem          : {data['LuotXem']}
• LuotLike         : {data['LuotLike']}
• LuotComment      : {data['LuotComment']}""")
        except Exception as e:
            print(f"Lỗi khi cào link [{url}]: {e}")

    if browser:
        await browser.close()

# 5. Vòng lặp Realtime
async def main():
    init_db()

    print("Nhập danh sách link video (TikTok hoặc Facebook).")
    print("Mỗi dòng 1 link. Nhấn Enter 2 lần (để trống dòng) để bắt đầu chạy:\n")

    input_urls = []
    while True:
        line = input().strip()
        if not line:
            break
        input_urls.append(line)

    if not input_urls:
        print("Không có link nào được nhập. Đã thoát.")
        return

    delay_seconds = 120  # Chu kỳ cập nhật: 120 giây (2 phút)

    async with async_playwright() as p:
        while True:
            await run_scrape_batch(input_urls, p)
            print(f"\n[Chờ {delay_seconds} giây cho lượt cập nhật tiếp theo...]")
            await asyncio.sleep(delay_seconds)

if __name__ == "__main__":
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(main())
    except RuntimeError:
        asyncio.run(main())