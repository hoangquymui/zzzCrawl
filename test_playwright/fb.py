"""
fb.py - Công cụ crawl thông tin video Facebook (Video thường & Reel)
Các trường dữ liệu trích xuất:
- STT
- link
- caption
- loai
- nguoiDang
- ngayDang
- SoLuongNguoiShare
- LuotXem
- LuotLike
- LuotComment
"""

import sys
import os
import re
import json
import html
import datetime
import asyncio
from playwright.async_api import async_playwright

# Đảm bảo mã hóa UTF-8 khi in ra màn hình console Windows
sys.stdout.reconfigure(encoding='utf-8')


def parse_number(text) -> int:
    """Chuyển đổi chuỗi số (ví dụ: '2,8 triệu', '1,3K', '2.8M', '2,823,400', '950') thành số nguyên."""
    if text is None:
        return 0
    if isinstance(text, (int, float)):
        return int(text)
        
    text = str(text).strip().replace('\xa0', ' ').replace('&nbsp;', ' ')
    # Bóc tách số và đơn vị đi kèm
    m = re.search(r'([\d\.,]+)\s*(triệu|tr|nghìn|ngàn|tỷ|[kKmMbB])?(?=\s|[^\w]|$)', text, re.I)
    if not m:
        return 0
        
    num_str, unit = m.groups()
    num_str = num_str.strip()
    unit = (unit or '').lower()

    if ',' in num_str and '.' in num_str:
        if num_str.rfind(',') > num_str.rfind('.'):
            num_str = num_str.replace('.', '').replace(',', '.')
        else:
            num_str = num_str.replace(',', '')
    elif ',' in num_str:
        parts = num_str.split(',')
        if len(parts) == 2 and len(parts[1]) in (1, 2) and unit:
            num_str = parts[0] + '.' + parts[1]
        else:
            num_str = num_str.replace(',', '')
    elif '.' in num_str:
        parts = num_str.split('.')
        if len(parts) == 2 and len(parts[1]) == 3 and not unit:
            num_str = num_str.replace('.', '')

    try:
        val = float(num_str)
    except ValueError:
        return 0

    if unit in ('k', 'nghìn', 'ngàn'):
        return int(val * 1_000)
    elif unit in ('m', 'triệu', 'tr'):
        return int(val * 1_000_000)
    elif unit in ('b', 'tỷ'):
        return int(val * 1_000_000_000)
    return int(val)


def parse_timestamp(val) -> str:
    """Chuyển đổi UNIX timestamp sang định dạng ngày tháng 'YYYY-MM-DD HH:MM:SS'."""
    if not val:
        return ""
    try:
        ts = int(val)
        if ts > 100_000_000_000:  # timestamp dạng milliseconds
            ts = ts // 1000
        dt = datetime.datetime.fromtimestamp(ts)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return str(val)


def fix_mojibake(text: str) -> str:
    """Tự động khôi phục nếu chuỗi bị lỗi encoding (UTF-8 bị giải mã sai thành latin-1 / windows-1252)."""
    if not text:
        return ""
    mojibake_indicators = ['áº', 'á»', 'Ã¡', 'Ã ', 'Ã¢', 'Ã£', 'Ã¨', 'Ã©', 'Ãª', 'Ã¬', 'Ã­', 'Ã²', 'Ã³', 'Ã´', 'Ãµ', 'Ã¹', 'Ãº', 'Ã½', 'Ä‘', 'Ä']
    if any(ind in text for ind in mojibake_indicators):
        for enc in ['latin1', 'cp1252']:
            try:
                fixed = text.encode(enc).decode('utf-8')
                return fixed
            except Exception:
                continue
    return text


def clean_text(text: str) -> str:
    """Xóa bỏ ký tự HTML entities, giải mã unicode escape an toàn và chuẩn hóa khoảng trắng."""
    if not text:
        return ""
        
    # 1. Giải mã HTML entities (&amp;, &quot;, &#039;, &nbsp;, ...)
    text = html.unescape(text)
    
    # 2. Giải mã các ký tự escape \uXXXX và surrogate pairs (như emoji \ud83d\ude06)
    if '\\u' in text:
        try:
            text = re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), text)
            text = text.encode('utf-16', 'surrogatepass').decode('utf-16')
        except Exception:
            pass
            
    # 3. Giải mã các escape thông dụng khác nếu trích xuất từ chuỗi JSON raw
    text = text.replace(r'\/', '/').replace(r'\"', '"').replace(r'\r', '').replace(r'\n', ' ')
    
    # 4. Tự động sửa lỗi mojibake nếu chuỗi gốc bị lỗi font
    text = fix_mojibake(text)
    
    # 5. Chuẩn hóa khoảng trắng
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


async def crawl_fb(url: str, stt: int = 1, headless: bool = True) -> dict:
    """
    Crawl thông tin video/reel Facebook từ 1 đường link duy nhất.
    
    Tham số:
        url (str): Đường link Facebook (Video hoặc Reel)
        stt (int): Số thứ tự trong danh sách (mặc định: 1)
        headless (bool): Chạy trình duyệt ẩn danh (mặc định: True)
        
    Trả về:
        dict chứa đầy đủ 10 trường dữ liệu theo yêu cầu.
    """
    is_initial_reel = any(k in url.lower() for k in ["/reel/", "/reels/", "share/r"])
    
    result = {
        "STT": stt,
        "link": url,
        "caption": "",
        "loai": "Facebook Reel" if is_initial_reel else "Facebook Video",
        "nguoiDang": "",
        "ngayDang": "",
        "SoLuongNguoiShare": 0,
        "LuotXem": 0,
        "LuotLike": 0,
        "LuotComment": 0
    }

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            args=["--disable-blink-features=AutomationControlled"]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
            locale="vi-VN"
        )
        page = await context.new_page()

        try:
            # Điều hướng đến trang
            await page.goto(url, wait_until="domcontentloaded", timeout=40000)
            await page.wait_for_timeout(3500)

            # Tự động đóng modal đăng nhập hoặc thông báo nếu xuất hiện
            try:
                close_btn = await page.query_selector(
                    'div[aria-label="Đóng"], div[aria-label="Close"], [role="button"]:has-text("✕"), [role="button"]:has-text("Đóng")'
                )
                if close_btn:
                    await close_btn.click()
                    await page.wait_for_timeout(800)
            except Exception:
                pass

            # ==========================================
            # LỚP 1: BÓC TÁCH TỪ META TAGS CỦA TRANG
            # ==========================================
            metas = await page.evaluate('''() => {
                const res = {};
                document.querySelectorAll('meta').forEach(m => {
                    const key = m.getAttribute('property') || m.getAttribute('name');
                    if (key) res[key] = m.getAttribute('content');
                });
                return res;
            }''')

            og_title = metas.get('og:title') or ''
            og_desc = metas.get('og:description') or metas.get('description') or ''
            canonical = metas.get('og:url') or ''

            if any(k in canonical.lower() for k in ["/reel/", "/reels/"]):
                result["loai"] = "Facebook Reel"

            # Parse các số liệu từ og:title (Facebook thường định dạng: "[X] lượt xem · [Y] cảm xúc | [Caption] | Facebook")
            if og_title:
                m_view = re.search(r'([\d\.,]+\s*(?:triệu|tr|nghìn|k|m|b)?)\s*(?:lượt xem|views|plays)', og_title, re.I)
                if m_view:
                    result["LuotXem"] = parse_number(m_view.group(1))

                m_rxn = re.search(r'([\d\.,]+\s*(?:triệu|tr|nghìn|k|m|b)?)\s*(?:cảm xúc|lượt thích|likes|reactions)', og_title, re.I)
                if m_rxn:
                    result["LuotLike"] = parse_number(m_rxn.group(1))

                parts = og_title.split('|')
                if len(parts) >= 2:
                    potential_caption = parts[-2].strip()
                    if potential_caption and potential_caption != "Facebook" and not result["caption"]:
                        result["caption"] = clean_text(potential_caption)

            if og_desc and not result["caption"]:
                result["caption"] = clean_text(og_desc)

            # ==========================================
            # LỚP 2: BÓC TÁCH TỪ NGUỒN GRAPHQL / SCRIPT JSON CỦA FACEBOOK
            # ==========================================
            content = await page.content()

            # Lượt xem
            if not result["LuotXem"]:
                m_v = re.search(r'"video_view_count":\s*(\d+)', content) or re.search(r'"play_count":\s*(\d+)', content)
                if m_v:
                    result["LuotXem"] = int(m_v.group(1))

            # Lượt thích / cảm xúc
            if not result["LuotLike"]:
                m_l = re.search(r'"reaction_count":\s*\{\s*"count":\s*(\d+)', content)
                if m_l:
                    result["LuotLike"] = int(m_l.group(1))
                else:
                    m_li = re.search(r'"i18n_reaction_count":\s*"([^"]+)"', content)
                    if m_li:
                        result["LuotLike"] = parse_number(m_li.group(1))

            # Lượt bình luận
            m_c = (
                re.search(r'"total_comment_count":\s*(\d+)', content) or
                re.search(r'"comment_rendering_instance":\s*\{\s*"comments":\s*\{\s*"total_count":\s*(\d+)', content) or
                re.search(r'"comment_count":\s*\{\s*"total_count":\s*(\d+)', content)
            )
            if m_c:
                result["LuotComment"] = int(m_c.group(1))
            else:
                m_ci = re.search(r'"i18n_comment_count":\s*"([^"]+)"', content)
                if m_ci:
                    result["LuotComment"] = parse_number(m_ci.group(1))

            # Số lượng chia sẻ

            
            m_sr = re.search(r'"share_count_reduced":\s*"([^"]+)"', content)
            m_s = re.search(r'"share_count":\s*\{\s*"count":\s*(\d+)', content) or re.search(r'"share_count":\s*(\d+)', content)
            m_si = re.search(r'"i18n_share_count":\s*"([^"]+)"', content)
            m_reshare = re.search(r'"reshares":\s*\{\s*"count":\s*(\d+)', content)

            if m_sr:
                result["SoLuongNguoiShare"] = parse_number(m_sr.group(1))
            elif m_s:
                result["SoLuongNguoiShare"] = int(m_s.group(1))
            elif m_si:
                result["SoLuongNguoiShare"] = parse_number(m_si.group(1))
            elif m_reshare:
                result["SoLuongNguoiShare"] = int(m_reshare.group(1))

            # Ngày đăng (từ UNIX timestamp)
            m_t = (
                re.search(r'"creation_time":\s*(\d+)', content) or
                re.search(r'"publish_time":\s*(\d+)', content)
            )
            if m_t:
                result["ngayDang"] = parse_timestamp(m_t.group(1))

            # Người đăng
            m_author = (
                re.search(r'"owner_as_page":\s*\{\s*"name":\s*"([^"]+)"', content) or
                re.search(r'"video_owner":\s*\{\s*"__typename":\s*"User"[^}]*"name":\s*"([^"]+)"', content) or
                re.search(r'"author":\s*\{\s*"__typename":\s*"User"[^}]*"name":\s*"([^"]+)"', content)
            )
            if m_author:
                result["nguoiDang"] = clean_text(m_author.group(1))

            # Caption từ message text
            if not result["caption"]:
                m_msg = re.search(r'"message":\s*\{\s*"text":\s*"([^"]+)"', content)
                if m_msg:
                    result["caption"] = clean_text(m_msg.group(1))

            # ==========================================
            # LỚP 3: FALLBACK QUA GIAO DIỆN DOM
            # ==========================================
            if not result["nguoiDang"]:
                author_elem = (
                    await page.query_selector('h2 span') or 
                    await page.query_selector('strong span') or 
                    await page.query_selector('a[role="link"] strong') or
                    await page.query_selector('div[role="main"] h3 a')
                )
                if author_elem:
                    result["nguoiDang"] = clean_text(await author_elem.inner_text())

            # Đối với Facebook Reel: kiểm tra các nút tương tác dọc bên phải
            if result["loai"] == "Facebook Reel":
                action_buttons = await page.query_selector_all('div[role="button"]')
                reel_numbers = []
                for btn in action_buttons:
                    txt = (await btn.inner_text()).strip()
                    if re.match(r'^[\d\.,]+[a-zA-Z\s]*$', txt) and any(c.isdigit() for c in txt):
                        reel_numbers.append(txt)

                if len(reel_numbers) >= 2:
                    if not result["LuotLike"]:
                        result["LuotLike"] = parse_number(reel_numbers[0])
                    if not result["LuotComment"]:
                        result["LuotComment"] = parse_number(reel_numbers[1])
                    if len(reel_numbers) >= 3 and not result["SoLuongNguoiShare"]:
                        result["SoLuongNguoiShare"] = parse_number(reel_numbers[2])

            # Quét toàn bộ body text
            body_text = await page.inner_text("body")
            if not result["LuotComment"]:
                m_c_body = re.search(r'([\d\.,]+\s*(?:triệu|tr|nghìn|k|m)?)\s*(?:bình luận|comments)', body_text, re.I)
                if m_c_body:
                    result["LuotComment"] = parse_number(m_c_body.group(1))

            if not result["SoLuongNguoiShare"]:
                m_s_body = re.search(r'([\d\.,]+\s*(?:triệu|tr|nghìn|k|m)?)\s*(?:lượt chia sẻ|shares)', body_text, re.I)
                if m_s_body:
                    result["SoLuongNguoiShare"] = parse_number(m_s_body.group(1))

            if not result["LuotXem"]:
                m_v_body = re.search(r'([\d\.,]+\s*(?:triệu|tr|nghìn|k|m)?)\s*(?:lượt xem|views|plays)', body_text, re.I)
                if m_v_body:
                    result["LuotXem"] = parse_number(m_v_body.group(1))

            if not result["LuotLike"]:
                m_l_body = re.search(r'([\d\.,]+\s*(?:triệu|tr|nghìn|k|m)?)\s*(?:lượt thích|likes|cảm xúc)', body_text, re.I)
                if m_l_body:
                    result["LuotLike"] = parse_number(m_l_body.group(1))

        except Exception as err:
            print(f"[Cảnh báo] Lỗi trong quá trình cào dữ liệu từ {url}: {err}")
        finally:
            await browser.close()

    return result


def print_formatted_result(data: dict):
    """In kết quả crawl dạng bảng thông tin dễ nhìn."""
    print("=" * 65)
    print(f"📊 KẾT QUẢ THEO DÕI VIDEO (STT: {data.get('STT', 1)})")
    print("=" * 65)
    print(f"• STT               : {data.get('STT')}")
    print(f"• link              : {data.get('link')}")
    print(f"• caption           : {data.get('caption')}")
    print(f"• loai              : {data.get('loai')}")
    print(f"• nguoiDang         : {data.get('nguoiDang')}")
    print(f"• ngayDang          : {data.get('ngayDang')}")
    print(f"• SoLuongNguoiShare : {data.get('SoLuongNguoiShare')}")
    print(f"• LuotXem           : {data.get('LuotXem'):,}" if isinstance(data.get('LuotXem'), (int, float)) else f"• LuotXem           : {data.get('LuotXem')}")
    print(f"• LuotLike          : {data.get('LuotLike'):,}" if isinstance(data.get('LuotLike'), (int, float)) else f"• LuotLike          : {data.get('LuotLike')}")
    print(f"• LuotComment       : {data.get('LuotComment'):,}" if isinstance(data.get('LuotComment'), (int, float)) else f"• LuotComment       : {data.get('LuotComment')}")
    print("=" * 65)


if __name__ == "__main__":
    default_url = "https://www.facebook.com/reel/3009140806092408"
    
    # Nhận URL từ command line argument hoặc nhập từ bàn phím
    if len(sys.argv) > 1:
        target_url = sys.argv[1].strip()
    else:
        print(f"Nhập link video Facebook cần crawl (Enter để dùng link mẫu):")
        user_input = input("> ").strip()
        target_url = user_input if user_input else default_url

    print(f"\n[+] Đang tiến hành crawl video: {target_url}...")
    stats = asyncio.run(crawl_fb(target_url, stt=1))
    
    print("\n--- DỮ LIỆU ĐÃ BÓC TÁCH ---")
    print_formatted_result(stats)

    print("\n--- DẠNG DICT / JSON NGUYÊN BẢN ---")
    print(json.dumps(stats, ensure_ascii=False, indent=2))
