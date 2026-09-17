# 動作の作り方（motion 定義の書式）

このリポジトリの図解は **人体骨格モデル + 順運動学 + 接地IK + 重心バランス** で作る。
座標を手で置くのではなく、**関節角度と接地点**を書く。

## 座標系と単位

- `X` = 体の正面（人は既定で +X を向く）、`Y` = 上、`Z` = 体の右。単位はメートル、床は `y=0`
- 角度はすべて度。休め姿勢（直立・両腕を体側に垂らす）が全関節 0
- 身長 1.758m / 体重 62kg。骨長は `src/motion.js` の `BONES` を見ること

## ボーン

`pelvis`（根） → `spineL`(腰) → `spineT`(胸下) → `spineC`(胸上) → `neck` → `head`
`clavR/L`（肩甲帯） → `upperarmR/L` → `forearmR/L` → `handR/L`
`thighR/L` → `shankR/L` → `footR/L` → `toesR/L`

## ドライバ（キーフレームに書く値）

| 名前 | 意味 |
|---|---|
| `pelvis.x/y/z` | 骨盤の位置（m）。`balance` や `anchor` がある種目では自動で決まるので書かない |
| `pelvis.pitch` | 骨盤の前傾（+ が前に倒れる） |
| `pelvis.roll` / `pelvis.yaw` | 側屈 / 右回りのひねり |
| `<脊柱>.flex` | + が屈曲（丸まる）、− が伸展（反る） |
| `<脊柱>.abd` / `.rot` | 右への側屈 / 右へのひねり |
| `thighX.flex` | 股関節屈曲（+ で脚が前へ）。`.abd` は外転、`.rot` は内旋 |
| `shankX.flex` | 膝屈曲（+ で曲がる。0 が伸びきり） |
| `footX.flex` | 足首（+ 背屈＝つま先が上、− 底屈） |
| `toesX.flex` | 母趾球の関節（+ が伸展＝つま先が反る） |
| `clavX.elev` / `.prot` | 肩甲帯の挙上 / 前方突出（− で後ろに引く＝肩甲骨を寄せる） |
| `upperarmX.flex` | 肩の屈曲（+ で腕が前へ）。`.abd` 外転（+ で体の外へ）、`.rot` 内旋 |
| `forearmX.flex` | 肘屈曲。`.rot` は回内（+ 90 で手のひらが体側、+180 で手のひらが後ろ） |
| `handX.flex` | 手首（+ 掌屈、− 背屈）。`.abd` は橈屈/尺屈 |

**重要**: 関節角は親ボーン基準。体幹を前に倒した姿勢で腕を真下に垂らすには
`upperarmX.flex ≒ 体幹の前傾角` を入れる（ロウの例を見ること）。

## 種目の定義

```js
M.register({
  id: 'ex_id',
  view: { az: 38, el: 10, dist: 3.5, target: [0.05, 0.85, 0] },  // カメラ（az=0 は右真横、90 は正面）
  props: [{ type:'box', id:'bed', min:[x,y,z], max:[x,y,z], label:'ベッド' }],
  phases: [{ t: 0, label: '立つ' }, { t: 0.5, label: '下ろす 3秒' }, ...],  // 画面に出す説明
  feet:  { R: <接地スペック>, L: <接地スペック> },   // 書いた側は IK で解く。書かない側は角度(FK)
  hands: { R: <接地スペック>, L: ... },
  anchor: { bone:'shankL', local:[0.075,0,0], at:[0.10,0.45,-0.26] },  // 骨盤を動かして接地を合わせる
  contacts: [{ name:'kneeL', bone:'shankL', local:[0.075,0,0], weight:1 }],  // 支持面に数える点
  dumbbells: [{ grip:'handR', kg:5 }, { grip:'both', axis:'vertical', kg:5, offset:[0,0.075,0] }],
  balance: { axes:['x'] },        // 重心を支持面の中心に載せる（立位で使う。支えのある種目では書かない）
  base: { ...全キー共通の値... },
  keys: [ { t:0, hold:true, d:{...} }, { t:1.2, d:{...} }, ... ]   // t は秒。最後は最初と同じ値
});
```

### 接地スペック

```js
{ at: [x,y,z],              // 接する世界座標（または { bone:'spineC', local:[..] } でボーンに追従）
  local: [x,y,z],           // その点のボーン局所座標（足なら FOOT.ball など、手なら HAND.palmSurf）
  yaw/pitch/roll: 度,        // 末端の向き（数値のほか 'ドライバ名' を書くと補間値を読む）
  align: 'surface', normal: [0,-1,0],   // 手のひらを面に密着させる場合はこちら（yaw/pitch は不要）
  pins: [ ... ],             // 支持面に数える局所点（足は既定で踵と母趾球）
  pole: [x,y,z] }            // 肘・膝を向ける方向（世界座標）
```

- 足の局所点: `FOOT.heel [-0.058,-0.075,0]` / `FOOT.ball [0.135,-0.075,0]` / `sole [0,-0.075,0]`
- 手の局所点: `HAND.palm [0,-0.075,0]` / `HAND.palmSurf [0.042,-0.075,0]`（手のひら表面）/ `HAND.grip`
- 肘の極ベクトル: 腕立て等で肘を後ろに向けるなら `[-1,-0.3,0.3]` のように書く

### テンポ

`original.html` の `DETAIL[種目].tempo` に書いてある秒数をそのまま使う（例「下ろす3秒 → 一番下で0〜1秒 → 立ち上がる1秒」）。
キーの `t` をその秒数に合わせ、静止の前後は `hold: true` を付けて止まって見せる。

## 検査（必ず通すこと）

```bash
bun tools/diag.js <id>            # 可動域・床抜け・道具貫通・接地ずれ・重心・コマ飛び
LANDMARKS=1 bun tools/diag.js <id>  # 主要関節の位置（配置合わせ用）
```

合格条件: **可動域超過なし / 床抜け 0 / 道具貫通 0 / 接地ずれ 10mm 未満 / 重心はみ出し 0**。

## 目で見る（これが本番の合否）

```bash
python tools/cdp_shot.py "file:///C:/claude%20code/training-log/tools/contact.html?ids=<id>&n=6&w=300&h=360&views=default,front,side" shots/<id>.png --ready "window.__ready===true" --width 2000 --height 1200 --full --port <9340以降の空き番号>
```

撮った PNG を Read して、**中間フレームを含めて**次を確認する。

- 人としてありえない関節の向きになっていないか
- 接地しているはずの部位が浮いていないか／床や台にめり込んでいないか
- 手足が胴体を突き抜けていないか、ダンベルが体に埋まっていないか
- 動作の意味が伝わるか（その種目に見えるか）

## 触ってはいけないもの

- `original.html` の `DETAIL` / `EX` の `how` `ng` `up`、`ROUTINES`、`adjust()`
- 他の担当者が書いている `src/motions_*.js`
