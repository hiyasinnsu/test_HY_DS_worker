# NEON BARRAGE — スマホ向け弾幕シューティング

スマートフォンのブラウザでそのまま遊べる縦スクロール弾幕シューティングです。
ビルド不要の静的サイト（素の JavaScript + Canvas 2D）で、GitHub Pages にそのまま公開できます。

**公開 URL:** https://hiyasinnsu.github.io/test_HY_DS_worker/

## 遊び方

| 操作 | スマホ | キーボード |
| --- | --- | --- |
| 移動 | 画面をドラッグ（指の移動量に追従） | 矢印キー / WASD |
| 射撃 | 自動 | 自動 |
| ボム（弾消し） | 左下 BOMB ボタン / 2 本目の指でタップ | X / Space |
| 低速移動 | — | Shift 押しながら |
| ポーズ | 右上のボタン | P / Esc |

- 当たり判定は機体中央の**赤い点だけ**。見た目よりずっと小さいので、弾幕をかすめて稼ぐ「グレイズ」が狙えます。
- ドラッグは指の**相対移動**に追従するため、機体が指の下に隠れません。
- 被弾すると残機が減り、その場で無敵時間つき復帰。弾が消える救済措置つきです。
- パワーアイテム（P）を取るとショットが 1→4 段階に強化されます。

## 構成

```
index.html              エントリ（GitHub Pages のルート）
manifest.webmanifest    PWA マニフェスト（ホーム画面に追加で全画面起動）
sw.js                   オフライン用 Service Worker（https のみで登録）
assets/                 スタイル・アイコン
src/                    ゲーム本体（ES Modules、ビルドなし）
  main.js               起動・エラー表示・Service Worker 登録
  game.js               状態機械・ループ・当たり判定・描画順
  player.js  enemies.js  boss.js  bullets.js  lasers.js
  patterns.js           弾幕プリミティブ（ring / fan / spiral / delayedRing）
  stages.js  stage.js   ウェーブスケジューラ
  items.js  effects.js  background.js  sprites.js
  ui.js  input.js  audio.js  viewport.js  storage.js  config.js  util.js
scripts/serve.mjs       ローカル確認用の静的サーバー
tests/                  検証スクリプト（下記）
verification/           スクリーンショットと検証結果
```

## ローカルで動かす

ES Modules を使うので `file://` ではなく HTTP で開いてください。

```bash
node scripts/serve.mjs 8080   # http://localhost:8080/
```

## 検証

```bash
npm test                       # static-check + headless-sim + dom-boot（ブラウザ不要）
npm run test:browser           # 実ブラウザ（Chrome/Edge + puppeteer-core）でのスモークテスト
npm run test:live              # 公開中の GitHub Pages がローカル検証版と一致するか確認
npm run shots                  # 実 Canvas 実装で PNG を書き出す（要 @napi-rs/canvas）
node tests/balance.mjs         # ボスの HP を難易度別に計測（パワー1〜4で各フェーズ何秒か）
```

`tests/headless-sim.mjs` は Canvas API をスタブ化しつつ、NaN 座標や存在しない描画メソッド呼び出しを例外にします。実ブラウザを起動できない環境でも、ロジックと描画呼び出しの破綻を検出できます。

## 設計メモ

- **仮想座標**: 幅 480 のワールド座標でゲームロジックを書き、ビューポートに応じてスケール。縦横比が合わないときはレターボックス。
- **DPR 上限 2**: 高 DPI 端末で塗りつぶし負荷が跳ねないよう `devicePixelRatio` を 2 で頭打ち（設定で「標準」にすると 1.25）。
- **弾はプール**: 敵弾 1400 / 自弾 600 を事前確保して使い回す。GC スパイクによるコマ落ちを避けるため。
- **スプライト事前描画**: 弾 1 発ごとに `createRadialGradient` するとモバイルで致命的なので、種類 × 色 × サイズで 1 度だけオフスクリーンに描画して `drawImage`。
- **音はすべて合成**: 外部アセットなし。Web Audio で効果音と 4 小節ループの BGM を生成。初回タップで unlock。
- **描画順**: 敵弾は自機より**後**に描画。弾が自機の下に隠れて見えない事故を防ぐ。
