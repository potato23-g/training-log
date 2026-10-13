"""キャラクターの止まった姿を描いて docs/mmd/stills/ に置く。

  python tools/sync_mmd.py        （モデルの側を直したとき）
  python tools/build.py site
  python tools/make_stills.py
  python tools/build.py site      （画像の一覧をアプリに入れる）

線の図の動き（MOTION）すべてについて、線の図の静止画と同じ時刻の姿を、ヘッドレスのブラウザで公開版を開いて描く。
背景は透かしてあるので、明るい表示・暗い表示のどちらにも同じ 1 枚を使う。ダンベルが 2 つの動きは、1 つだけ描いた絵（<id>.1.webp）も作る。
1 つでも描けなければ何も置き換えない。
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
OUT = os.path.join(ROOT, 'docs', 'mmd', 'stills')
PORT, CDP_PORT, BATCH = 8180, 9551, 20

JS = r"""
(async () => {
  const out = {index: {}, files: {}, fail: []};
  try{
    const ids = Object.keys(MOTION.motions);
    if(%(start)d === 0) out.all = ids.length;
    const p = await mmdLoad();
    for(const id of ids.slice(%(start)d, %(end)d)){
      const m = MOTION.motions[id], a = modelAt(id, m, stillTime(m));
      if(!mmdDrv(id)) out.fail.push(id + ': 線の図のどの値で動かすかが決まっていない（figmodel.js の MDRV）');
      for(const dbn of ((m.dumbbells || []).length >= 2 ? [0, 1] : [0])){
        const c = p.still(id, {dbn}, a);
        if(!c){ out.fail.push(id + ': モデルの側に姿勢が無い（exlib.js）'); break; }
        const key = id + (dbn ? '.' + dbn : '');
        out.index[key] = p.shape();
        out.files[key] = c.toDataURL('image/webp', 0.86);
      }
    }
  }catch(e){ out.fail.push(String(e && e.stack || e)); }
  window.__result = out; window.__ready = true;
})();
"""

tmp = tempfile.mkdtemp(prefix='stills_')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', os.path.join(ROOT, 'docs')],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
index, files, fail, total, start = {}, {}, [], None, 0
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
try:
    for _ in range(50):
        try:
            urllib.request.urlopen('http://127.0.0.1:%d/mmd/player.js' % PORT, timeout=2).read()
            break
        except Exception:
            time.sleep(0.2)
    while total is None or start < total:
        ev, log = os.path.join(tmp, 'ev.js'), os.path.join(tmp, 'log.json')
        io.open(ev, 'w', encoding='utf-8').write(JS % {'start': start, 'end': start + BATCH})
        if os.path.exists(log):
            os.remove(log)
        subprocess.run([sys.executable, os.path.join(TOOLS, 'cdp_shot.py'), 'http://127.0.0.1:%d/index.html' % PORT, os.path.join(tmp, 'shot.png'),
                        '--eval', ev, '--ready', 'window.__ready', '--dump', 'window.__result', '--log', log,
                        '--width', '390', '--height', '844', '--timeout', '280', '--port', str(CDP_PORT + start // BATCH),
                        '--profile', os.path.join(tmp, 'prof%d' % start)], capture_output=True)
        try:
            d = json.load(io.open(log, encoding='utf-8')).get('dump') or {}
        except Exception:
            d = {}
        if not d:
            fail.append('%d 番目からの組が描けなかった' % start)
            break
        if total is None:
            total = d.get('all', 0)
        index.update(d.get('index', {}))
        files.update(d.get('files', {}))
        fail += d.get('fail', [])
        print('  %d / %d' % (min(start + BATCH, total), total), flush=True)
        start += BATCH
finally:
    srv.terminate()
    shutil.rmtree(tmp, ignore_errors=True)

if fail or not files:
    print('FAIL - 画像は置き換えていない')
    for f in fail:
        print('  ', f)
    sys.exit(1)
if os.path.isdir(OUT):
    shutil.rmtree(OUT)
os.makedirs(OUT)
size = 0
for key, url in files.items():
    data = base64.b64decode(url.split(',', 1)[1])
    size += len(data)
    open(os.path.join(OUT, key + '.webp'), 'wb').write(data)
io.open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8', newline='\n').write(json.dumps(index, sort_keys=True, separators=(',', ':')) + '\n')
print('PASS - %d 枚 %.1f MB -> docs/mmd/stills/' % (len(files), size / 1e6))
