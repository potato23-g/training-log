/* ============================================================
   ボタンと入力欄の登録口
   画面の data-act="名前" のボタンは、wire() が知らない名前なら ACTIONS[名前](要素, イベント) を呼ぶ。
   入力欄など、描画のたびに結び直したいものは WIRES に (view) => {...} を足す。
   それぞれの機能のファイルから登録すれば、wire() を書き換えなくてよい。
   ============================================================ */
const ACTIONS = {};
const WIRES = [];
/* 折りたたみ（2026-10-11 本人の要望: 提案タブの各項目と、設定タブの縦に長い項目は、初めは閉じておく）。
   開いたかどうかは foldOpen に覚え、描き直しても開いたままにする（アプリを開き直すと閉じた状態に戻る） */
const foldOpen = {};
function fold(id, title, body, defOpen){
  const on = id in foldOpen ? foldOpen[id] : !!defOpen;
  return `<details class="fold" data-fold="${id}"${on ? " open" : ""}><summary>${title}</summary>${body}</details>`;
}
/* 「<h3 class="sec">見出し</h3> 中身」の形のカードを、見出しを押して開く形にする */
function foldSec(id, html, defOpen){
  const m = /^\s*<h3 class="sec">([\s\S]*?)<\/h3>/.exec(html);
  return m ? fold(id, m[1], html.slice(m[0].length), defOpen) : html;
}
WIRES.push(v => v.querySelectorAll("details[data-fold]").forEach(d => { d.ontoggle = () => { foldOpen[d.dataset.fold] = d.open; }; }));
