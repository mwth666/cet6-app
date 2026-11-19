"""生成应用图标：蓝色渐变圆角方块 + 白色数字 6（需要 pillow）

    python tools/make_icon.py

产物写到 assets/icon.png 与 assets/icon.ico（16–256 七个尺寸）。
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

S, R = 1024, 232
TOP, BOT = (86, 132, 255), (39, 82, 200)

icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(icon)
for y in range(S):
    t = y / (S - 1)
    d.line([(0, y), (S, y)], fill=tuple(int(TOP[i] + (BOT[i] - TOP[i]) * t) for i in range(3)) + (255,))

mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=R, fill=255)
icon.putalpha(mask)

font = None
for p in (r"C:/Windows/Fonts/seguisb.ttf", r"C:/Windows/Fonts/segoeuib.ttf", r"C:/Windows/Fonts/arialbd.ttf"):
    try:
        font = ImageFont.truetype(p, 660)
        break
    except OSError:
        continue
assert font

d = ImageDraw.Draw(icon)
box = d.textbbox((0, 0), "6", font=font)
w, h = box[2] - box[0], box[3] - box[1]
# 按墨迹包围盒居中，别按行高居中（行高会让字看起来偏上）
d.text((S / 2 - w / 2 - box[0], S / 2 - h / 2 - box[1] + 6), "6", font=font, fill=(255, 255, 255, 255))

out = r"C:/Users/68335/Desktop/mw英语/cet6-app/assets"
icon.save(out + r"\icon.png")
icon.save(out + r"\icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("ok")
