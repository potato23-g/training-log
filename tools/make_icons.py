"""アプリのアイコン(PWA用)をPillowで作る。外部素材なし。

配色はアプリ本体の light テーマに合わせる（--ink / --muscle）。
セーフゾーン(直径80%の円)の内側に収めて maskable としても使えるようにする。
"""
import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'icons')
os.makedirs(OUT, exist_ok=True)

INK = (26, 36, 48, 255)      # --ink
MUSCLE = (178, 58, 49, 255)  # --muscle
PAPER = (239, 239, 233, 255) # --paper


def rounded_square(size, color, radius_ratio=0.22):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=color)
    return img


def draw_dumbbell(draw, cx, cy, half_len, bar_w, plate_w, plate_h):
    """横向きのダンベルを描く(バー+左右プレート2枚ずつ)。"""
    draw.rounded_rectangle([cx - half_len, cy - bar_w / 2, cx + half_len, cy + bar_w / 2],
                           radius=bar_w / 2, fill=PAPER)
    for side in (-1, 1):
        x = cx + side * half_len
        for off, w, h in ((0, plate_w, plate_h), (plate_w * 0.62, plate_w * 0.72, plate_h * 0.72)):
            xx = x + side * off
            draw.rounded_rectangle([xx - w / 2, cy - h / 2, xx + w / 2, cy + h / 2],
                                   radius=w * 0.28, fill=MUSCLE)


def make_icon(size, safe_ratio=0.80):
    img = rounded_square(size, INK, radius_ratio=0.0 if size < 64 else 0.0)
    # マスク対応: 背景は正方形いっぱいに塗る(OS側が丸くくり抜く)
    img = Image.new('RGBA', (size, size), INK)
    d = ImageDraw.Draw(img)
    safe = size * safe_ratio
    half_len = safe * 0.30
    bar_w = safe * 0.075
    plate_w = safe * 0.10
    plate_h = safe * 0.34
    draw_dumbbell(d, size / 2, size / 2, half_len, bar_w, plate_w, plate_h)
    return img


def make_favicon_style(size):
    """通常アイコン(角丸・透過あり)。ブラウザタブや通常表示向け。"""
    img = rounded_square(size, INK, radius_ratio=0.22)
    d = ImageDraw.Draw(img)
    half_len = size * 0.235
    bar_w = size * 0.060
    plate_w = size * 0.080
    plate_h = size * 0.270
    draw_dumbbell(d, size / 2, size / 2, half_len, bar_w, plate_w, plate_h)
    return img


sizes_maskable = [192, 512]
for s in sizes_maskable:
    make_icon(s).save(os.path.join(OUT, f'icon-maskable-{s}.png'))

sizes_any = [192, 512]
for s in sizes_any:
    make_favicon_style(s).save(os.path.join(OUT, f'icon-{s}.png'))

# iOS の apple-touch-icon は角丸なしの正方形が推奨(OS側で丸める)
make_icon(180, safe_ratio=0.86).save(os.path.join(OUT, 'apple-touch-icon.png'))

# favicon(小さいサイズ)
make_favicon_style(32).save(os.path.join(OUT, 'favicon-32.png'))
make_favicon_style(16).save(os.path.join(OUT, 'favicon-16.png'))

print('icons written to', OUT)
print(os.listdir(OUT))
