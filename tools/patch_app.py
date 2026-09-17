"""app/index.html を2版ビルド対応にするための一度きりの手直し"""
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(ROOT, 'app', 'index.html')
s = io.open(p, encoding='utf-8').read()
done = []

# 1) 保存層をマーカーに置き換える
if '/*INLINE-JS:STORE*/' not in s:
    a = s.index('/* ============================================================\n   保存層')
    b = s.index('/* ============================================================\n   日付など')
    s = s[:a] + '/*INLINE-JS:STORE*/\n\n' + s[b:]
    done.append('保存層をマーカー化')

# 2) CSV 書き出しを saveFile 経由にする
if 'claude.use("downloads")' in s:
    a = s.index('async function exportCSV(){')
    b = s.index('function showText(){')
    new = ('async function exportCSV(){\n'
           '  const csv = "\\ufeff" + buildCSV();\n'
           '  const ok = await saveFile("training-" + TODAY + ".csv", csv);\n'
           '  if(!ok) showText();          /* 保存できない環境では画面に出す */\n'
           '}\n')
    s = s[:a] + new + s[b:]
    done.append('CSV書き出しを保存層経由に')

# 3) 履歴タブの書き出しカードに保存層ごとのボタンを足す
mark = '        <button data-act="txt">テキストで表示</button>\n      </div>\n'
if 'storeButtons' not in s:
    assert mark in s
    s = s.replace(mark, mark + '      ${typeof storeButtons === "function" ? storeButtons() : ""}\n')
    done.append('バックアップボタンの差し込み口')

# 4) バックアップ操作のイベント
mark2 = '      else if(a==="txt"){ showText(); }\n'
if 'a==="backup"' not in s:
    assert mark2 in s
    s = s.replace(mark2, mark2 +
                  '      else if(a==="backup" && typeof backupSave === "function"){ backupSave(); }\n'
                  '      else if(a==="restore" && typeof backupLoad === "function"){ backupLoad(); }\n'
                  '      else if(a==="restorepaste" && typeof backupPaste === "function"){ backupPaste(); }\n')
    done.append('バックアップ操作のイベント')

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('patched:', ' / '.join(done) if done else '変更なし')
