"""キャラクターの図（docs/mmd/）の通し検査。docs/ を http で配り、ヘッドレスのブラウザで実際に再生する。

  python tools/build.py site
  python tools/model_check.py

check_all.py は 1 ファイル版（dist/local）を見るので、モデルの経路は通らない。モデルまわりを触ったらこちらも流す。
"""
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
PORT, CDP_PORT = 8179, 9541

tmp = tempfile.mkdtemp(prefix='modelchk_')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', os.path.join(ROOT, 'docs')],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try:
            urllib.request.urlopen('http://127.0.0.1:%d/mmd/player.js' % PORT, timeout=2).read()
            break
        except Exception:
            time.sleep(0.2)
    log = os.path.join(tmp, 'log.json')
    subprocess.run([sys.executable, os.path.join(TOOLS, 'cdp_shot.py'), 'http://127.0.0.1:%d/index.html' % PORT, os.path.join(tmp, 'shot.png'),
                    '--eval', os.path.join(TOOLS, 'model_eval.js'), '--ready', 'window.__ready', '--dump', 'window.__result', '--log', log,
                    '--width', '390', '--height', '844', '--timeout', '170', '--port', str(CDP_PORT), '--profile', os.path.join(tmp, 'prof')],
                   capture_output=True)
    d = json.load(io.open(log, encoding='utf-8')).get('dump') or {'pass': 0, 'fail': ['結果が無い']}
finally:
    srv.terminate()
    shutil.rmtree(tmp, ignore_errors=True)

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
print('%s - model_eval.js  %d passed, %d failed' % ('PASS' if not d['fail'] else 'FAIL', d['pass'], len(d['fail'])))
for f in d['fail']:
    print('  ', f)
sys.exit(1 if d['fail'] else 0)
