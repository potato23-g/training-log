"""からだの図（キャラクターの素体と部位の形）を描いて docs/mmd/body/ に置く。

  python tools/build.py site
  python tools/make_bodyfig.py [--preview 見本.jpg]
  python tools/build.py site      （部位の形をアプリに入れる）

公開版をヘッドレスのブラウザで開き、tools/bodyfig_make.js を流す。置くもの:
  front.png / back.png  シルエット（白・背景は透かす）。アプリでは形だけ使い、色は CSS の --neutral-fill で塗る
  fig.json              viewBox と、部位の形（data-m と path）・腹直筋の線
描けなければ何も置き換えない。--preview を付けると、部位ごとに塗った見本も書く。
"""
import base64
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, 'tools')
OUT = os.path.join(ROOT, 'docs', 'mmd', 'body')
PORT, CDP_PORT = 8181, 9581

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
tmp = tempfile.mkdtemp(prefix='bodyfig_')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', os.path.join(ROOT, 'docs')],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
d = {}
try:
    for _ in range(50):
        try:
            urllib.request.urlopen('http://127.0.0.1:%d/mmd/player.js' % PORT, timeout=2).read()
            break
        except Exception:
            time.sleep(0.2)
    log = os.path.join(tmp, 'log.json')
    subprocess.run([sys.executable, os.path.join(TOOLS, 'cdp_shot.py'), 'http://127.0.0.1:%d/index.html' % PORT, os.path.join(tmp, 'shot.png'),
                    '--eval', os.path.join(TOOLS, 'bodyfig_make.js'), '--ready', 'window.__ready', '--dump', 'window.__result', '--log', log,
                    '--width', '390', '--height', '844', '--timeout', '200', '--port', str(CDP_PORT),
                    '--profile', os.path.join(tmp, 'prof')], capture_output=True)
    try:
        d = json.load(io.open(log, encoding='utf-8')).get('dump') or {}
    except Exception:
        d = {}
finally:
    srv.terminate()
    shutil.rmtree(tmp, ignore_errors=True)

fail = d.get('fail', ['描けなかった']) if d else ['描けなかった']
if fail or not d.get('front') or not d.get('back'):
    print('FAIL - 何も置き換えていない')
    for f in fail:
        print('  ', f)
    sys.exit(1)
png = lambda url: base64.b64decode(url.split(',', 1)[1])
if preview:
    open(preview, 'wb').write(png(d['preview']))
if os.path.isdir(OUT):
    shutil.rmtree(OUT)
os.makedirs(OUT)
fig = {'vb': d['vb']}
for side in ('front', 'back'):
    open(os.path.join(OUT, side + '.png'), 'wb').write(png(d[side]['png']))
    fig[side] = {'regions': d[side]['regions'], 'lines': d[side]['lines']}
io.open(os.path.join(OUT, 'fig.json'), 'w', encoding='utf-8', newline='\n').write(json.dumps(fig, ensure_ascii=False, separators=(',', ':')) + '\n')
print('PASS - %d + %d 部位 -> docs/mmd/body/' % (len(fig['front']['regions']), len(fig['back']['regions'])))
