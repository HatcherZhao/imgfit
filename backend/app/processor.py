import io
import struct
import zlib
from PIL import Image


def detect_bg_color(img: Image.Image) -> tuple:
    """取四个角像素投票，返回背景色 (r,g,b)"""
    w, h = img.size
    corners = [img.getpixel((0,0)), img.getpixel((w-1,0)),
               img.getpixel((0,h-1)), img.getpixel((w-1,h-1))]
    r = sum(c[0] for c in corners) // 4
    g = sum(c[1] for c in corners) // 4
    b = sum(c[2] for c in corners) // 4
    return (r, g, b)


def remove_background(img: Image.Image, bg: str = "auto", threshold: int = 30) -> Image.Image:
    """
    flood fill 去背景。
    bg: 'white'|'black'|'auto'|'#rrggbb'|'r,g,b'
    """
    from collections import deque
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size

    # 解析背景色
    if bg == "auto":
        br, bg_, bb = detect_bg_color(img)
    elif bg == "white":
        br, bg_, bb = 255, 255, 255
    elif bg == "black":
        br, bg_, bb = 0, 0, 0
    elif bg.startswith("#"):
        hex_color = bg.lstrip("#")
        br, bg_, bb = int(hex_color[0:2],16), int(hex_color[2:4],16), int(hex_color[4:6],16)
    else:
        parts = bg.split(",")
        br, bg_, bb = int(parts[0]), int(parts[1]), int(parts[2])

    def is_bg(r, g, b):
        return abs(r-br) <= threshold and abs(g-bg_) <= threshold and abs(b-bb) <= threshold

    def flood_fill(seed_pixels):
        visited = [[False]*h for _ in range(w)]
        queue = deque()
        for x, y in seed_pixels:
            r, g, b, a = pixels[x, y]
            if not visited[x][y] and is_bg(r, g, b):
                visited[x][y] = True
                queue.append((x, y))
        while queue:
            x, y = queue.popleft()
            pixels[x, y] = (pixels[x,y][0], pixels[x,y][1], pixels[x,y][2], 0)
            for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                nx, ny = x+dx, y+dy
                if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
                    r, g, b, a = pixels[nx, ny]
                    if is_bg(r, g, b):
                        visited[nx][ny] = True
                        queue.append((nx, ny))

    # 第一步：从四边 flood fill
    edge_seeds = [(x, y) for x in range(w) for y in [0, h-1]] + \
                 [(x, y) for y in range(h) for x in [0, w-1]]
    flood_fill(edge_seeds)

    # 第二步：去除内部封闭背景区域（字母内圈）
    inner_visited = [[False]*h for _ in range(w)]
    for sx in range(w):
        for sy in range(h):
            r, g, b, a = pixels[sx, sy]
            if inner_visited[sx][sy] or not is_bg(r, g, b):
                continue
            region, touches_edge = [], False
            q = deque([(sx, sy)])
            inner_visited[sx][sy] = True
            while q:
                x, y = q.popleft()
                region.append((x, y))
                if x == 0 or x == w-1 or y == 0 or y == h-1:
                    touches_edge = True
                for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < w and 0 <= ny < h and not inner_visited[nx][ny]:
                        r2, g2, b2, a2 = pixels[nx, ny]
                        if is_bg(r2, g2, b2):
                            inner_visited[nx][ny] = True
                            q.append((nx, ny))
            if not touches_edge:
                for x, y in region:
                    pixels[x, y] = (pixels[x,y][0], pixels[x,y][1], pixels[x,y][2], 0)

    return img


def crop_image(img: Image.Image, crop: dict) -> Image.Image:
    """从图片中裁剪指定区域"""
    x, y, w, h = int(crop["x"]), int(crop["y"]), int(crop["w"]), int(crop["h"])
    return img.crop((x, y, x + w, y + h))


def fit_image(src: Image.Image, target_w: int, target_h: int, mode: str) -> Image.Image:
    """
    mode: 'stretch' | 'contain' | 'cover'
    返回 RGBA 图像，尺寸为 target_w x target_h
    """
    if mode == "stretch":
        return src.resize((target_w, target_h), Image.LANCZOS).convert("RGBA")

    src_ratio = src.width / src.height
    tgt_ratio = target_w / target_h

    if mode == "contain":
        if src_ratio > tgt_ratio:
            new_w, new_h = target_w, int(target_w / src_ratio)
        else:
            new_w, new_h = int(target_h * src_ratio), target_h
        resized = src.resize((new_w, new_h), Image.LANCZOS).convert("RGBA")
        canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
        canvas.paste(resized, ((target_w - new_w) // 2, (target_h - new_h) // 2))
        return canvas

    if mode == "cover":
        if src_ratio > tgt_ratio:
            new_h = target_h
            new_w = int(target_h * src_ratio)
        else:
            new_w = target_w
            new_h = int(target_w / src_ratio)
        resized = src.resize((new_w, new_h), Image.LANCZOS).convert("RGBA")
        left = (new_w - target_w) // 2
        top = (new_h - target_h) // 2
        return resized.crop((left, top, left + target_w, top + target_h))

    return src.resize((target_w, target_h), Image.LANCZOS).convert("RGBA")


def process_raster(template_bytes: bytes, template_ext: str,
                   new_img: Image.Image, fit_mode: str, compress: bool = False) -> bytes:
    """处理 PNG/JPG/WebP/BMP/TIFF/GIF 等位图格式"""
    tmpl = Image.open(io.BytesIO(template_bytes))
    w, h = tmpl.size
    fitted = fit_image(new_img, w, h, fit_mode)

    out = io.BytesIO()
    ext = template_ext.lower().lstrip(".")

    if ext in ("jpg", "jpeg"):
        fitted = fitted.convert("RGB")
        fitted.save(out, format="JPEG", quality=85 if compress else 95)
    elif ext == "webp":
        if compress:
            fitted.save(out, format="WEBP", quality=85)
        else:
            fitted.save(out, format="WEBP", lossless=True)
    elif ext == "gif":
        fitted.convert("P", palette=Image.ADAPTIVE).save(out, format="GIF")
    else:
        if compress:
            # 转为索引色（最多256色），大幅减少PNG文件体积
            quantized = fitted.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
            quantized.save(out, format="PNG", optimize=True)
        else:
            fitted.save(out, format="PNG", compress_level=6)

    return out.getvalue()


def process_ico(template_bytes: bytes, new_img: Image.Image, fit_mode: str) -> bytes:
    """处理 ICO：保留原始所有尺寸层"""
    tmpl = Image.open(io.BytesIO(template_bytes))
    sizes = []
    if hasattr(tmpl, "ico") and hasattr(tmpl.ico, "images"):
        sizes = list({img.size for img in tmpl.ico.images})
    elif hasattr(tmpl, "ico") and callable(getattr(tmpl.ico, "sizes", None)):
        sizes = list(tmpl.ico.sizes())
    if not sizes:
        sizes = [(16, 16), (32, 32), (48, 48), (256, 256)]

    frames = []
    for (w, h) in sizes:
        frames.append(fit_image(new_img, w, h, fit_mode))

    out = io.BytesIO()
    frames[0].save(out, format="ICO", sizes=[(f.width, f.height) for f in frames],
                   append_images=frames[1:])
    return out.getvalue()


def process_icns(template_bytes: bytes, new_img: Image.Image, fit_mode: str) -> bytes:
    """处理 ICNS：生成标准 macOS 图标尺寸"""
    try:
        import icnsutil
        sizes = [16, 32, 64, 128, 256, 512, 1024]
        img_set = icnsutil.IcnsFile()
        for s in sizes:
            fitted = fit_image(new_img, s, s, fit_mode)
            buf = io.BytesIO()
            fitted.save(buf, format="PNG")
            key = icnsutil.IcnsFile.size_to_key(s)
            if key:
                img_set.add_media(key, data=buf.getvalue())
        out = io.BytesIO()
        img_set.write(out)
        return out.getvalue()
    except Exception:
        # fallback: 返回 PNG
        fitted = fit_image(new_img, 512, 512, fit_mode)
        out = io.BytesIO()
        fitted.save(out, format="PNG")
        return out.getvalue()


def process_svg(template_bytes: bytes, new_img: Image.Image,
                target_w: int, target_h: int, fit_mode: str) -> bytes:
    """将新图片嵌入 SVG <image> 标签，保留原 viewBox/尺寸"""
    import base64, re

    fitted = fit_image(new_img, target_w, target_h, fit_mode)
    buf = io.BytesIO()
    fitted.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()

    svg_str = template_bytes.decode("utf-8", errors="replace")

    # 提取 viewBox 和 width/height
    vb_match = re.search(r'viewBox=["\']([^"\']+)["\']', svg_str)
    w_match = re.search(r'<svg[^>]+\bwidth=["\']([^"\']+)["\']', svg_str)
    h_match = re.search(r'<svg[^>]+\bheight=["\']([^"\']+)["\']', svg_str)

    vb = vb_match.group(1) if vb_match else f"0 0 {target_w} {target_h}"
    parts = vb.split()
    vw, vh = (parts[2], parts[3]) if len(parts) == 4 else (str(target_w), str(target_h))

    image_tag = f'<image href="data:image/png;base64,{b64}" x="0" y="0" width="{vw}" height="{vh}"/>'

    # 替换 SVG 内容：清空 body，插入 image
    new_svg = re.sub(r'(<svg[^>]*>).*?(</svg>)', rf'\1{image_tag}\2', svg_str, flags=re.DOTALL)
    return new_svg.encode("utf-8")
