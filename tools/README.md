# tools/ の検査・道具一覧

`python tools/check_all.py` で、ビルドしてから下記「自動で回す検査」を順番に回せる。
個別に回す場合の使い方は各ファイルの見出しコメントを参照。

起動した Edge・サーバーは、失敗やタイムアウトが起きても check_all.py が確実に後片付けする
（プロファイル名に実行ごとの印を付けて、その印を含む Edge をすべて終了し、一時フォルダも最後に消し直す。
v4_update_e2e.py が固定で使う 8871/9479番ポートも念のため空ける）。`v4_update_e2e.py` は内部で `build.py site` を走らせて
`docs/` を書き換えるので、その前後で `docs/` を控えて書き戻す（`docs/` は GitHub Pages の公開用で
コミットするものなので、`git checkout` で戻すと未コミットのビルドまで消えてしまう）。

## 自動で回す検査（bun / 動き・同期）

`cd tools && bun <ファイル名>` で単体実行できる。`src/motion.js` 系を直接読み込むので `python tools/build.py` は不要（sync_test.js のみ `mock_github.py` を自分で子プロセスとして起動する）。

| ファイル | 確かめること | 合格の条件 |
|---|---|---|
| `diag.js` | 全モーションの可動域・床/道具への貫通・接地ずれ・なめらかさ | 可動域超過なし・道具貫通0・床抜け0（`sideplank`/`sideplank_leg`（下側の上腕）の14mmのみ既知として許容） |
| `db_clash.js` | ダンベルと体の接触 | 「ぶつかりなし/ダンベルなし」以外が出ないこと（`rdl`/`row2`/`sidebend` と、その「止める」版 `rdl_hold`/`row2_hold`/`sidebend_hold` の小さな接触＝ダンベルが脚をこする設計どおりの分のみ既知として許容） |
| `grip_check.js` | 手のひらの向きが解説文と合っているか | 「手の向きが合わない箇所」0件 |
| `joint_audit.js` | 荷重時の関節角が現実的な範囲か | 指摘が出るのは `row`/`triext`/`pushup`/`split`/`splitfloor`/`pushupknee`/`triext_one` と、「止める」版 `row_hold`/`triext_hold`/`split_hold`/`splitfloor_hold`/`pushupknee_hold` の12種目のみ（既知。「止める」版は元の動きと同じ関節・同じ角度）。それ以外で指摘が出たら不合格 |
| `form_check.js` | フォームの要点（ACE/NASM準拠）が数値どおりか | 「合わない項目」0件 |
| `phase_check.js` | 動作の場面ラベルと実際の姿勢が合っているか | 「合っていない場面」0件 |
| `anim_check.js` | ラベルと動きの食い違い | 「ラベルと動きが食い違う場面」0件 |
| `variant_check.js` | 組み方の名前（一番下で2秒止める等）どおりの動きになっているか | 「名前どおりになっていない組み方」0件 |
| `content_check.js` | data.js / variants.js の中身どうしの食い違い（大変な組み方が標準と同じ・回数が解説の幅の外・動きの登録漏れなど） | 「合わない項目」0件 |
| `sync_test.js` | sync-github.js の単体・結合テスト | `failed` 0（`process.exit` の終了コードで判定） |
| `export_test.js` | CSV・テキストの書き出し（式として読まれない・メモだけの日も出る） | `failed` 0（終了コードで判定） |

## 自動で回す検査（ブラウザ内）

`python tools/cdp_shot.py "file:///…/dist/local/training-log.html" out.png --eval tools/<ファイル名> --ready window.__ready --dump window.__result --log out.json --port <9531-9539> --profile <毎回別の絶対パス>` の形で1回開いて評価する。`v3_ui_common.js` が要るものは先に連結する。`check_all.py` はこれを自動でやる。

| ファイル | 確かめること | 合格の条件 |
|---|---|---|
| `v4_progress_eval.js` | 伸ばし方（ダブルプログレッション）・組み直し・外す/戻す・軽い週・記録ボタン・日付の区切り | `__result.fail` が空 |
| `v3_extra_item_eval.js` | 「種目を追加」がメニューと同じ組み方になるか | `__result.mismatch` が空 |
| `v3_fig_eval.js`＊ | 図のダンベル本数が実際に使う本数と合っているか | `__result.mismatch` が空 |
| `v3_logic_eval.js` | 今日のメニュー決定・部位の負荷上限・持っているダンベルで作れない重さの案内がないか | `dupPatterns`/`recoverOnPlan`/`recoverViolations`/`dayCapViolations`/`sessionCapViolations`/`weekCapViolations`/`unowned`/`optionErrors`/`sweep` が全て空。記録やダンベルを入れ替えるたびに `planMemo` と `progMemo`（`resetProg()`）を空にする（空にしないと前の場面の結果が返り、作れない重さの誤検出が出る） |
| `v3_newex_eval.js`＊ | 追加した種目に図・解説・持ち方・日用品案内・カタログ登録が揃っているか | `missing`/`noFigure`/`noDetail`/`noHold`/`noHouse`/`noMotion`/`noPattern`/`notInCatalog`/`badLevel`/`exWithoutLevel` が全て空 |
| `v3_partial_eval.js` | 途中までの日も「手を付けた」扱いになり、翌日は別の動きになるか | `repeatedNextDay`/`dupPatterns`/`recoverOnPlan`/`emptyDays` が全て空 |
| `v3_stable_eval.js` | 種目の選び方が気分で入れ替わらないか（軽すぎ→難しく、限界続き→やさしく、据え置き） | `settled8`/`settled6`/`settled96`/`harderWhenEasy`/`easierWhenHard`/`sameTwice` が全て true |
| `v3_swap_add_eval.js`＊ | 段の持ち替え・おまかせ追加・種目を選んで追加 | `afterSwap.swappedIn`/`.oldGone`/`.samePattern`・`noSwapAfterRecord`・`pickerHasShrug` が true、`auto.dupPattern`/`repeated.dupPattern` が false |
| `v3_ui_fix_eval.js`＊ | 規定セット後のロック→修正→削除→再記録の流れ | 実行が完了すること（目視用の詳細値も `__result` に出る） |
| `v3_variant_eval.js` | 楽/大変の組み方候補・段の広がり・セット間のダンベル増減提案 | 実行が完了すること（値は目視で確認） |
| `v3_volume_eval.js` | 頻度別（毎日/週4/週3）のメニュー量・時間の目安 | 実行が完了すること（値は目視で確認） |
| `v5_balance_eval.js` | 毎日・週4・週3・1日おきで35日分メニューを組み、主役にした部位を中1日で主役にしていないか・1回の上限内か。部位ごとの週のセット（weekly）と、目標から遠い部位（low）も出す | `recoverViolations`・`capViolations` が空 |
| `v3_dayroll_eval.js` | 日付をまたいだら今日のメニューが切り替わるか（既定の操作確認モード） | 実行が完了すること（値は目視で確認） |
| `v3_update_eval.js` | 更新ボタン：同じ版・取得失敗時・ラベルの戻り | 実行が完了すること（値は目視で確認） |
| `v3_persist_eval.js` | ダンベル設定と今日のメニューが再読み込み後も残るか | write→read の2段階とも実行が完了すること |
| `v3_timer_eval.js`＊ | 休憩タイマー（+30秒・追いつき・止める・重ねて始める）と合図の予約・合図のWAV | 各場面の `ok` が true、止めたら合図が残らない、WAV の長さと中身が合う |
| `v4_views_eval.js` | 種目を選ぶシート・からだ・履歴タブ（日付シート・過去の日を足す・自己ベスト・推移） | 途中で止まらず `__result.failCount` が0 |

＊ は `v3_ui_common.js` を先に連結して実行する。

`v3_ui_common.js` の `T.recordAll()` は、記録すると始まる休憩タイマーと二重押し防止(`lastAddAt`)の
どちらも「記録」を無効化するため、ループ内で毎回 `stopRest()` と `lastAddAt[id]=0` をしないと
1セットしか記録できなかった（今回のバグ）。直したので、これを使う検査は全て複数セットの完了まで進む。

### 手動で回す検査（check_all には含めない）

同期まわりは偽GitHub（`mock_github.py`）を常駐させた上で複数プロファイル・複数段階を手で合わせる必要があり、実行に数十秒かかる上タイミング依存で不安定になりやすいため、自動一括からは外している。中身は現行のAPI（`todayItems`/`entryFor`/`syncStatusText`/`setGearItems` 等）を使っており有効。

- `v3_sync_e2e.js` — PC役・スマホ役の2プロファイルで `mock_github.py` 経由の同期を通しで確認（`window.__phase` = form/pc1/phone1/pc2）
- `v3_sync_timing_eval.js` — 同期が起きる操作・起きない操作の切り分け（`window.__phase` = setup/run、debounce待ちで長め）

### 見た目確認用（pass/fail なし、目視専用）

- `v3_look_eval.js` — `window.__look` で場面（gear/up/ex/settings/plan/desktop）を選んでスクリーンショット用の状態を作る。settings 場面は今回、右上⚙のシート（`openSettings()`）を開くよう直した（旧: ページ内見出しへのスクロールで、その見出し文言が無くなっていたため何も映らなかった）
- `v3_schedule_look_eval.js` — `window.__phase`（normal/short/rest）で今日タブの見え方を作る
- `v4_shot_seed.js` — URL の `?shot=`（body/hist/histsheet/histadd/histundo/addday/picker、末尾 `_dark` で暗い表示）で、種目を選ぶシート・からだ・履歴の見え方を作る

## 通しの検査（Python、別プロセス）

- `v4_update_e2e.py` — `python tools/v4_update_e2e.py`。`build.py site` を自動実行し（`docs/` が書き換わる）、ヘッドレスEdgeで旧版→新版の切り替え・オフライン起動を確認。終了コード0で合格

## 作業用の道具（検査ではない）

- `build.py` — `app/index.html` から artifact / local / site の3版を作る
- `cdp_shot.py` — ヘッドレスEdgeをCDPで操作してPNGを撮る共通基盤。他の全ブラウザ内検査が使う
- `mock_github.py` — 同期テスト用の偽GitHub APIサーバー
- `make_icons.py` — PWAアイコン一式を `docs/icons` に生成
- `pose_fit.js` — 狙いの姿勢（関節の向き・位置）から関節角を逆算する、新しい種目の姿勢作成補助（`bun pose_fit.js <仕様ファイル.js>`）
- `contact.html` — 全種目のコンタクトシート（複数姿勢を並べたPNG）を作る目視確認ページ
- `review.sh` — `contact.html` を4枚に分けて撮って `shots/` に保存する
- `perf.html` — 3D描画（`figure3d.js`）の1コマあたりの計算・描画時間を計測
- `pose_shot.html` — クエリ文字列（`?id=&t=&az=`）で種目・時刻・カメラ角を指定して1姿勢を確認する

## 削除した検査（役目を終えたもの）

いずれも旧い作り（分割前の単一ファイル版、2Dの `figSVG`/`DIA`、旧ルーチンA〜D固定制、旧・伸ばし方 `wantedLevel` 系、旧「提案」タブの文言）を前提にした一度きりの調べ物・チューニング用スクリプトで、今の作りには対応しておらず、現行の検査（主に `v3_logic_eval.js`・`v3_newex_eval.js`・`v4_progress_eval.js`・`v4_update_e2e.py`）が同じ観点をより厳密に見ている。

`advice_eval.js` `advice_look.js` `app_eval.js` `app_eval2.js` `app_eval3.js` `app_eval4.js` `app_eval_all.js` `app_final.js` `baseline_eval.js` `dbg_arm.js` `gate.js` `gear_eval.js` `gear2_eval.js` `local_eval1.js` `local_eval2.js` `look_eval.js` `patch_app.py` `plan_combined.js` `plan_eval.js` `plan_fresh_eval.js` `plan_goref.js` `plan_seed.js` `pwa_eval1.js` `pwa_eval2.js` `recover_check.js` `shot_eval.js` `thresh_check.js` `timer_eval.js` `tune_row.js` `tune_sp.js` `v3_replan_eval.js` `webgl_test.html`

`v3_replan_eval.js` のみ理由が異なる: 「組み直すと直前の種目を避けて全部入れ替わる」ことを前提にしていたが、今の組み直しは直前の種目を避けない（同じ記録なら同じメニューになる、`src/app/planner.js` の `replanToday`/`buildPlan` で意図的な変更）。この前提が食い違う一方、他に残っていた有効な観点（空枠の掃除・完了/途中/手動追加の種目を組み直しでも保つこと）は `v4_progress_eval.js` の B4/B5/U3/B18 がより厳密に見ているため削除した。
