#!/usr/bin/env python3
"""从官方 SVG（web/adelie-icon.svg）生成安卓桌面图标。

旧版图标（API 24–25）要方形/圆形位图；API 26+ 用自适应图标 —— 前景是那只企鹅，
背景是白色。所以同一个 SVG 出两套：位图 + 自适应图层。

需要 cairosvg 与 Pillow：shared_env/iconenv 里有。
"""
import io
import os
import sys

import cairosvg
from PIL import Image, ImageDraw

SVG = "/root/.adelie/web/adelie-icon.svg"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app/src/main/res")

DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}


def render(size: int, with_plate: bool = True) -> Image.Image:
    if with_plate:
        png = cairosvg.svg2png(url=SVG, output_width=size, output_height=size)
    else:
        # 自适应图标的前景不要那块白板：白色背景层负责它，前景只留企鹅与轨道
        svg = open(SVG, encoding="utf-8").read().replace(
            '<rect width="1024" height="1024" fill="#fefefe" />', "")
        png = cairosvg.svg2png(bytestring=svg.encode(), output_width=size, output_height=size)
    return Image.open(io.BytesIO(png)).convert("RGBA")


def rounded(img: Image.Image, radius_ratio: float = 0.24) -> Image.Image:
    """方形图标也照官方那块圆角白板裁一下，避免四角出现直角白框。"""
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=int(w * radius_ratio), fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def circle(img: Image.Image) -> Image.Image:
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, w - 1, h - 1], fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def main() -> int:
    base = render(1024)

    for density, size in DENSITIES.items():
        d = os.path.join(OUT, f"mipmap-{density}")
        os.makedirs(d, exist_ok=True)
        square = rounded(base.resize((size, size), Image.LANCZOS))
        square.save(os.path.join(d, "ic_launcher.png"))
        circle(base.resize((size, size), Image.LANCZOS)).save(os.path.join(d, "ic_launcher_round.png"))

    # 自适应图标前景：108dp 画布，中间约 72% 是安全区（企鹅本体，不含那块白板）
    os.makedirs(os.path.join(OUT, "drawable"), exist_ok=True)
    foreground = render(768, with_plate=False)
    canvas = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    mark = foreground.resize((312, 312), Image.LANCZOS)
    canvas.paste(mark, ((432 - 312) // 2, (432 - 312) // 2), mark)
    canvas.save(os.path.join(OUT, "drawable/ic_launcher_foreground.png"))

    # 启动页的图标：白底页面上不要那块白板，只要企鹅本身（透明背景）
    nodpi = os.path.join(OUT, "drawable-nodpi")
    os.makedirs(nodpi, exist_ok=True)
    render(384, with_plate=False).save(os.path.join(nodpi, "splash_icon.png"))

    print("icons written to", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
