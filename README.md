# 日経平均株価 3D ジェットコースター

日経平均株価の週次終値をレールの高さに、山手線一周を水平の経路に割り当てた 3D ジェットコースターです。1990 年 1 月の大崎駅から乗り、山手線を一周しながら、株価の上下を体感できます。

- 高さ：日経平均の週次終値（4 週の移動平均をかけて滑らかにしたもの）
- 水平の経路：山手線の駅を結んだ多角形（経路上の位置とデータ系列の位置が対応）
- HUD：ミニグラフと年表示は移動平均をかけていない生データ。路線図は現在位置

three.js（同梱）で描画しています。ビルドは不要で、静的ファイルをそのまま配信します。

## 起動方法

ES Modules を使うため、`file://` では動きません。リポジトリ直下で静的サーバを立ててください。

```sh
npm start
# または
python3 -m http.server 8000
```

ブラウザで http://localhost:8000/ を開き、START RIDE を押します。URL に `?debug` を付けると、コンソールから `window.__coaster`（状態の取得や進行度の設定）を使えます。

## テスト

Node 22 以降が必要です。依存パッケージはありません。

```sh
npm test
```

データの移動平均、経路の弧長の正規化、座標変換、走行状態の更新（フレームレートによらず同じ進み方になること）を確かめます。

## 操作

| キー | 動作 |
|---|---|
| W | 押している間は俯瞰視点。離すと戻る |
| SPACE | 一時停止と再生のトグル |
| R | 最初から（1990 年 1 月へ戻る） |

## ファイル構成

```
index.html                      ページ本体（スタート画面、HUD のスロット、終了画面、情報パネル、importmap）
scripts/
  fetch-nikkei.mjs              FRED から実データを取得し、週次終値を data/local/ に書き出す
assets/
  LICENSE-three.js.txt          three.js のライセンス
  css/
    main.css                    @import の一覧だけ
    tokens.css                  色・フォント・文字サイズ・動きのトークン（CSS 変数）
    base.css                    リセット、body、パネル・ボタンの共通、reduced-motion
    hud.css                     HUD のスロットの配置（L / M / S / 短い横長）
    start.css readout.css chart.css map.css annotations.css
    controls.css endscreen.css infopanel.css   機能ごとのスタイル
  js/
    main.js                     起動処理：共有 ctx を作り、機能モジュールを登録順に生成し、毎フレーム update を呼ぶ
    config.js                   定数（座標、速度、カメラ、配色 PALETTE / HUD_COLORS、機能ごとの節）
    events.js                   小さなイベント発行器（on / emit）
    loop.js                     progress とデータ系列の位置の変換（連絡区間の割合を考慮）
    data.js                     データ読み込み（サンプル／実データの切り替え）、移動平均、データ点の参照
    track.js                    経緯度の変換、山手線の経路、レール曲線（TrackCurve）
    ride.js                     走行状態（進行度・速度・一時停止・開始・終了）と操作 API
    scene.js                    renderer、scene、ライト、カメラ、リサイズ
    environment.js              地形、木、空、回転する円柱
    rail.js                     レール、支柱、影、現在位置マーカー
    rail-colors.js              レールの色分け（スタブ）
    scale.js                    等高線と値ラベル（スタブ）
    markers.js                  イベントの 3D の目印（スタブ）
    view.js                     一人称と俯瞰の切り替え
    controls.js                 キーボード入力
    ui/
      start.js                  スタート画面（読み込み中・エラー表示、START ボタン）
      buttons.js endscreen.js infopanel.js   操作ボタン・終了画面・情報パネル（スタブ）
    hud/
      layer.js                  HUD の canvas 共通処理（高解像度対応、静的部分の描き置き、サイズ追従）
      chart.js                  ミニグラフ
      map.js                    路線図
      readout.js                現在値の帯（いまは年表示）
      annotations.js legend.js  イベントのキャプション・凡例（スタブ）
    three.core.js
    three.module.js             three.js 本体（同梱、変更しない）
  jsm/misc/RollerCoaster.js     three.js のサンプルのレール生成（同梱、変更しない）
data/
  nikkei225.json                サンプルデータ（合成。実際の日経平均ではない）
  nikkei225.meta.json           サンプルデータのメタ情報（kind: sample）
  local/                        npm run fetch-data で作る実データ（git の管理外）
  train-yamanote.json           山手線の駅（経緯度）
tests/                          node:test によるテスト
```

`track.js`・`ride.js`・`loop.js`・`events.js` は three.js のレンダラに依存せず、数学クラスだけを `three.core.js` から相対パスで読みます。このため、ブラウザと Node の両方で動きます。

## データ出典

### 同梱のサンプルデータ（実際の日経平均ではありません）

`data/nikkei225.json` は、日経平均株価のおおまかな水準に似せて作った**合成データ**です。各週の値は実際の終値と一致しません。説明は `data/nikkei225.meta.json`（`kind: "sample"`）にあります。リポジトリを取得してそのまま動かしたときは、このサンプルデータで動きます。

### 実データで動かす

実データはリポジトリに含めていません。取得スクリプトを手元で実行すると、実データで動きます。Node 22 以降が必要です。

```sh
npm run fetch-data      # data/local/ に実データを書き出す
npm start
```

ブラウザで http://localhost:8000/?data=local を開きます。`data/local/` は git の管理外です。

- 取得元：米セントルイス連邦準備銀行 FRED の系列 NIKKEI225（日次終値）。`https://fred.stlouisfed.org/graph/fredgraph.csv?id=NIKKEI225&cosd=1990-01-01`
- 週次への集計：月曜始まりの週ごとに、その週の最終営業日の終値をとります（営業日のない週は行を作りません）。日付は週の月曜日です。
- 取得に失敗するときは、上の URL を開いて CSV を保存し、`node scripts/fetch-nikkei.mjs --from-file 保存したファイル` を実行してください。

実データの出典表記：

> 出典：日本経済新聞社「日経平均株価」（©日本経済新聞社）。米セントルイス連邦準備銀行 FRED（系列 NIKKEI225）経由で取得。週次値は各週の最終営業日の終値。

### 取得したデータの扱いについて

日経平均株価の値を第三者へ提供すること（実データのファイルを公開の場所に置く、実データの画面を公開するなど）には、日本経済新聞社の利用許諾の手続きが必要になる場合があります。取得したデータは手元での利用にとどめてください。公開する場合は、各自で規約を確認してください。

- 日経平均株価の利用規約：https://indexes.nikkei.co.jp/nkave/archives/file/license_agreement_jp.pdf
- FRED の利用条件：https://fred.stlouisfed.org/legal/

### その他

- 駅の位置（`data/train-yamanote.json`）は、駅データ.jp（https://ekidata.jp/）のデータを加工したものです。
- three.js は MIT License です。ライセンス全文は `assets/LICENSE-three.js.txt` にあります。
