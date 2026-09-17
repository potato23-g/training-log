"""app/index.html から3つの版を作る。

  python tools/build.py           Artifact 版  → dist/training-log.html
  python tools/build.py local     単一ファイル版 → dist/local/training-log.html
                                  （three.js を埋め込み、外部通信ゼロ、保存はこの端末）
  python tools/build.py site      GitHub Pages 版 → docs/
                                  （local と同じ埋め込みに加え、PWA化。ホーム画面に追加して
                                   オフラインで使える。docs/ がそのまま Pages の公開フォルダ）
"""
import hashlib
import io
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = (sys.argv[1] if len(sys.argv) > 1 else 'artifact').lower()


def read(rel):
    return io.open(os.path.join(ROOT, rel), encoding='utf-8').read()


def embed_common(src, target):
    """保存層の差し替えと <!--INLINE:...--> の展開。全ターゲット共通。"""
    store = 'src/store-local.js' if target in ('local', 'site') else 'src/store-artifact.js'
    src = src.replace('/*INLINE-JS:STORE*/', read(store))
    src = re.sub(r'<!--INLINE:(.+?)-->', lambda m: '<script>\n' + read(m.group(1)) + '\n</script>', src)
    return src


def embed_offline(src):
    """three.js を埋め込み、外部フォント参照を外す（local / site 共通）。"""
    three_tag = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.158.0/three.min.js"></script>'
    src = src.replace(three_tag, '<script>\n' + read('vendor/three.min.js') + '\n</script>')
    for line in ['<link rel="preconnect" href="https://fonts.googleapis.com">',
                 '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
                 '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&display=swap"'
                 ' rel="stylesheet">']:
        src = src.replace(line + '\n', '')
    return src


def add_pwa_tags(src):
    """マニフェスト・アイコン・SW登録など、ホーム画面追加とオフライン化に要るタグを足す。"""
    head_extra = (
        '<link rel="manifest" href="./manifest.json">\n'
        '<meta name="theme-color" content="#EFEFE9">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n'
        '<meta name="apple-mobile-web-app-title" content="トレ記録">\n'
        '<link rel="icon" href="./icons/favicon-32.png" sizes="32x32">\n'
        '<link rel="icon" href="./icons/favicon-16.png" sizes="16x16">\n'
        '<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">\n'
    )
    src = src.replace('<title>トレーニング記録</title>', '<title>トレーニング記録</title>\n' + head_extra)
    sw_register = (
        '<script>\n'
        "if('serviceWorker' in navigator){\n"
        "  navigator.serviceWorker.register('./service-worker.js').catch(function(){});\n"
        "  navigator.serviceWorker.addEventListener('controllerchange', function(){\n"
        "    if(!window.__swReloaded){ window.__swReloaded = true; location.reload(); }\n"
        "  });\n"
        "}\n"
        '</script>\n'
    )
    src = src.replace('</body>', sw_register + '</body>')
    return src


if TARGET == 'artifact':
    src = embed_common(read(os.path.join('app', 'index.html')), TARGET)
    dst = os.path.join(ROOT, 'dist', 'training-log.html')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    io.open(dst, 'w', encoding='utf-8', newline='\n').write(src)

elif TARGET == 'local':
    src = embed_common(read(os.path.join('app', 'index.html')), TARGET)
    src = embed_offline(src)
    dst = os.path.join(ROOT, 'dist', 'local', 'training-log.html')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    io.open(dst, 'w', encoding='utf-8', newline='\n').write(src)

elif TARGET == 'site':
    src = embed_common(read(os.path.join('app', 'index.html')), TARGET)
    src = embed_offline(src)
    src = add_pwa_tags(src)

    out_dir = os.path.join(ROOT, 'docs')
    icons_src = os.path.join(out_dir, 'icons')          # tools/make_icons.py が既に書き込み済み
    if not os.path.isdir(icons_src):
        raise SystemExit('アイコンが無い。先に python tools/make_icons.py を実行すること')

    index_path = os.path.join(out_dir, 'index.html')
    io.open(index_path, 'w', encoding='utf-8', newline='\n').write(src)

    version = hashlib.sha1(src.encode('utf-8')).hexdigest()[:10]
    sw = read('src/service-worker.js').replace('__CACHE_VERSION__', version)
    io.open(os.path.join(out_dir, 'service-worker.js'), 'w', encoding='utf-8', newline='\n').write(sw)

    shutil.copyfile(os.path.join(ROOT, 'src', 'manifest.json'), os.path.join(out_dir, 'manifest.json'))

    # ルート直下に来ると GitHub Pages の 404 対策になる、程度の軽い .nojekyll
    io.open(os.path.join(out_dir, '.nojekyll'), 'w', encoding='utf-8').write('')

    dst = index_path

else:
    raise SystemExit('unknown target: ' + TARGET)

ext = sorted(set(re.findall(r'https?://[^"\')\s]+', src)))
print('built', TARGET, '->', dst, len(src), 'chars / 外部参照', len(ext), ext[:4])
