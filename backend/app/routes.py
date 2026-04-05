import io
import re
from fastapi import APIRouter, File, UploadFile, Form
from fastapi.responses import Response
from PIL import Image
from .processor import (
    crop_image, process_raster, process_ico, process_icns, process_svg, remove_background
)

router = APIRouter()


@router.post("/process")
async def process(
    template: UploadFile = File(...),
    new_image: UploadFile = File(...),
    fit_mode: str = Form("contain"),
    crop_x: float = Form(0),
    crop_y: float = Form(0),
    crop_w: float = Form(0),
    crop_h: float = Form(0),
    remove_bg: str = Form("false"),
):
    template_bytes = await template.read()
    new_bytes = await new_image.read()

    new_img = Image.open(io.BytesIO(new_bytes)).convert("RGBA")

    if crop_w > 0 and crop_h > 0:
        new_img = crop_image(new_img, {"x": crop_x, "y": crop_y, "w": crop_w, "h": crop_h})

    if remove_bg.lower() not in ("false", ""):
        new_img = remove_background(new_img, bg=remove_bg.lower())

    # 获取原版格式
    filename = template.filename or "output"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "png"

    # 按格式处理
    if ext == "svg":
        # 从 SVG 解析尺寸
        svg_str = template_bytes.decode("utf-8", errors="replace")
        w_match = re.search(r'<svg[^>]+\bwidth=["\'](\d+)', svg_str)
        h_match = re.search(r'<svg[^>]+\bheight=["\'](\d+)', svg_str)
        vb_match = re.search(r'viewBox=["\'][^"\']*\s+[^"\']*\s+(\d+)\s+(\d+)', svg_str)
        if vb_match:
            tw, th = int(vb_match.group(1)), int(vb_match.group(2))
        elif w_match and h_match:
            tw, th = int(w_match.group(1)), int(h_match.group(1))
        else:
            tw, th = 512, 512
        result = process_svg(template_bytes, new_img, tw, th, fit_mode)
        media_type = "image/svg+xml"
    elif ext == "ico":
        result = process_ico(template_bytes, new_img, fit_mode)
        media_type = "image/x-icon"
    elif ext == "icns":
        result = process_icns(template_bytes, new_img, fit_mode)
        media_type = "image/icns"
    else:
        result = process_raster(template_bytes, ext, new_img, fit_mode)
        media_type = f"image/{ext}" if ext not in ("jpg",) else "image/jpeg"

    out_filename = filename.rsplit(".", 1)[0] + "_output." + ext
    from urllib.parse import quote
    return Response(
        content=result,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(out_filename)}"}
    )


@router.post("/preview")
async def preview(
    new_image: UploadFile = File(...),
    fit_mode: str = Form("contain"),
    crop_x: float = Form(0),
    crop_y: float = Form(0),
    crop_w: float = Form(0),
    crop_h: float = Form(0),
    preview_w: int = Form(256),
    preview_h: int = Form(256),
    remove_bg: str = Form("false"),
):
    """实时预览：返回适配后的 PNG 缩略图"""
    from .processor import fit_image
    new_bytes = await new_image.read()
    new_img = Image.open(io.BytesIO(new_bytes)).convert("RGBA")

    if crop_w > 0 and crop_h > 0:
        new_img = crop_image(new_img, {"x": crop_x, "y": crop_y, "w": crop_w, "h": crop_h})

    if remove_bg.lower() not in ("false", ""):
        new_img = remove_background(new_img, bg=remove_bg.lower())

    fitted = fit_image(new_img, preview_w, preview_h, fit_mode)
    buf = io.BytesIO()
    fitted.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")
