"""モデルの動き（../mmd-avatar）を docs/mmd/ へ写す。

  python tools/sync_mmd.py [mmd-avatar の場所]

写すもの: 骨と種目と物理（exrig・exlib・exphys・exskirt）、three.js と MMD の読み込み、モデルと画像。
- import の 'three'・'three/addons/' は相対パスに書き換える（importmap を使わずに済ませる）
- 画像は PMX が読むものだけを、一辺 1024 に縮めて写す（もとは 4096。スマホの描画メモリに収まらない）
docs/mmd/player.js は src/mmd/player.js から build.py（site）が写す。
"""
import io
import os
import re
import shutil
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), 'mmd-avatar')
DST = os.path.join(ROOT, 'docs', 'mmd')
TEX_MAX = 1024

JS = [
    'exrig.js', 'exlib.js', 'exphys.js', 'exskirt.js',
    'vendor/three/three.module.js',
    'vendor/jsm/loaders/MMDLoader.js', 'vendor/jsm/loaders/TGALoader.js',
    'vendor/jsm/shaders/MMDToonShader.js', 'vendor/jsm/libs/mmdparser.module.js',
    'vendor/jsm/animation/MMDPhysics.js', 'vendor/jsm/effects/OutlineEffect.js',
]
RAW = ['vendor/jsm/libs/ammo.wasm.js', 'vendor/jsm/libs/ammo.wasm.wasm']
PMX = 'model/SakurabaEma_ByPOWER.pmx'


def rel(frm, to):
    p = os.path.relpath(to, os.path.dirname(frm)).replace('\\', '/')
    return p if p.startswith('.') else './' + p


def rewrite(path, text):
    three = rel(path, 'vendor/three/three.module.js')
    text = re.sub(r"(from\s+)'three'", lambda m: m.group(1) + "'" + three + "'", text)
    text = re.sub(r"(from\s+)'three/addons/([^']+)'", lambda m: m.group(1) + "'" + rel(path, 'vendor/jsm/' + m.group(2)) + "'", text)
    return text


def put(path):
    dst = os.path.join(DST, path)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    return dst


if os.path.isdir(DST):
    keep = os.path.join(DST, 'player.js')
    for name in os.listdir(DST):
        p = os.path.join(DST, name)
        if p == keep:
            continue
        shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)

for f in JS:
    text = io.open(os.path.join(SRC, f), encoding='utf-8').read()
    io.open(put(f), 'w', encoding='utf-8', newline='\n').write(rewrite(f, text))
for f in RAW + [PMX]:
    shutil.copyfile(os.path.join(SRC, f), put(f))

# PMX が名前を挙げている画像だけ
names = sorted(set(re.findall(r'[\w./\\-]+\.(?:png|tga|bmp|jpg)', open(os.path.join(SRC, PMX), 'rb').read().decode('utf-16-le', errors='ignore'))))
total = 0
for n in names:
    n = n.replace('\\', '/')
    src = os.path.join(SRC, 'model', n)
    if not os.path.isfile(src):
        print('無い画像:', n)
        continue
    im = Image.open(src)
    if max(im.size) > TEX_MAX:
        im = im.resize((TEX_MAX * im.size[0] // max(im.size), TEX_MAX * im.size[1] // max(im.size)), Image.LANCZOS)
    dst = put('model/' + n)
    im.save(dst, optimize=True)
    total += os.path.getsize(dst)

size = sum(os.path.getsize(os.path.join(b, f)) for b, _d, fs in os.walk(DST) for f in fs)
print('docs/mmd: 画像 %d 枚 %.1fMB / 全体 %.1fMB' % (len(names), total / 1e6, size / 1e6))
