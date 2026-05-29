"""
Генерация иконок расширения: icon48.png и icon128.png.
Запуск: python scripts/gen_icons.py (из корня проекта).
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")
os.makedirs(OUT, exist_ok=True)

BG = (111, 66, 193)   # #6f42c1
FG = (255, 255, 255)

def make_icon(size):
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)
    text = "{}"
    font_size = max(14, size // 2)
    font = None
    for name in ("arial.ttf", "Arial.ttf", "DejaVuSans.ttf"):
        try:
            font = ImageFont.truetype(name, font_size)
            break
        except Exception:
            pass
    if font is None:
        font = ImageFont.load_default()
    bbox = d.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) // 2
    y = (size - th) // 2
    d.text((x, y), text, fill=FG, font=font)
    return img

for s in (48, 128):
    make_icon(s).save(os.path.join(OUT, f"icon{s}.png"), "PNG")
print("Icons saved to", OUT)
