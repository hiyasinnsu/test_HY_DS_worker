# project.md — NEON BARRAGE

## 目的と成功条件

スマートフォンのブラウザで快適に遊べる弾幕シューティングを、`hiyasinnsu/test_HY_DS_worker` リポジトリから GitHub Pages で公開する。

成功条件:

1. スマホのブラウザ（縦持ち）でタッチ操作のみで最後まで遊べる。
2. 弾幕・被弾判定・ボス・スコア・ゲームオーバー／リトライが一通り機能する。
3. 公開 URL で実際に読み込め、コンソールエラーが出ない。
4. ビルド工程なしの静的サイトとして配信される（Pages の標準機能のみ）。

## 重要な設計判断

- **素の ESM + Canvas 2D、ビルドなし**。Pages にそのまま置けて、数年後に依存が壊れても動く。バンドラ・フレームワーク・外部アセットは使わない。
- **仮想座標 幅480**。ロジックを端末非依存にし、レターボックスで縦横比差を吸収。
- **指の相対ドラッグで移動**。指が機体を隠さない。マウスは絶対座標、キーボードは速度制御で併存。
- **描画順で敵弾を自機の上に**。可読性優先。
- **プール + 事前描画スプライト + DPR 上限2**。モバイルのフレームレート確保のため。
- **当たり判定は 3.2 ワールド単位の点**。ジャンル慣習に合わせ、グレイズ（15単位）で加点。

## 完了した主要工程

- リポジトリは空（`size: 0`, `default_branch: main`）と確認。
- ゲーム本体一式（`src/` 21 モジュール）を実装。
- ヘッドレス検証系を整備: `tests/headless-sim.mjs`（32 チェック）、`tests/render-shots.mjs`（12 PNG）、`tests/smoke.mjs`（実ブラウザ用）、`tests/static-check.mjs`。
- スクリーンショット目視で HUD 重なり（LIFE/BOMB と BOMB ボタン、ボス名と SCORE）を発見し修正。
- PWA（manifest + Service Worker）対応。
- GitHub Pages 公開（main ブランチ / root）。

## 未解決事項・次の作業

- 実機（iOS Safari / Android Chrome）でのタッチ追従感と fps は未計測。`tests/smoke.mjs` を手元の Chrome/Edge で実行すれば計測できる。
- BGM は 4 小節ループの合成音。ステージごとの曲調変化は未実装（ボス戦のみテンポと音色が変わる）。
- ステージは 3 面想定の難易度カーブだが、ボスは全ステージ同一パターン（HP と発射間隔のみスケール）。

## 再発しやすい問題と対策

- **サンドボックスで Chrome を起動できない**（`spawn EPERM` / mojo `アクセスが拒否されました`）。実ブラウザ検証は `tests/smoke.mjs` に分離し、環境依存の検証は `headless-sim`（DOM スタブ）と `render-shots`（`@napi-rs/canvas` で実描画）で代替した。
- **git の schannel が `SEC_E_NO_CREDENTIALS` で失敗**。`git -c http.sslBackend=openssl <command>` で通る。
- **npm のグローバルキャッシュが EPERM**。`npm install --cache .npm-cache` でローカルキャッシュを使う。
- **ネストしたテンプレートリテラル**は構文エラーになりやすい。フォント定義は定数 `FONT` / `MONO` に切り出した。
