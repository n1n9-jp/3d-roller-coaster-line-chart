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

ブラウザで http://localhost:8000/ を開き、START RIDE を押します。

## テスト

Node 22 以降が必要です。依存パッケージはありません。

```sh
npm test
```

データの移動平均、経路の弧長の正規化、座標変換、走行状態の更新（フレームレートによらず同じ進み方になること）を確かめます。

## 操作

| キー | 動作 |
|---|---|
| W | 押している間は俯瞰視点。離すと一人称に戻る |
| SPACE | 押している間は停止。離すと再開 |

## ファイル構成

```
index.html                      ページ本体（スタート画面、HUD の要素、importmap）
assets/
  css/main.css                  スタイル
  js/
    main.js                     起動処理：データ読み込み、モジュールの組み立て、ループ開始
    config.js                   定数（座標、速度、カメラ、配色など）
    data.js                     データ読み込み、移動平均、データ点の参照
    track.js                    経緯度の変換、山手線の経路、レール曲線（TrackCurve）
    ride.js                     走行状態（進行度・速度・一時停止）の更新
    scene.js                    renderer、scene、ライト、カメラ、リサイズ
    environment.js              地形、木、空、回転する円柱
    rail.js                     レール、支柱、影、現在位置マーカー
    view.js                     一人称と俯瞰の切り替え
    controls.js                 キーボード入力
    start-screen.js             スタート画面（読み込み中・エラー表示、START ボタン）
    hud/
      layer.js                  HUD の canvas 共通処理（高解像度対応、静的部分の描き置き）
      chart.js                  ミニグラフ
      map.js                    路線図
      readout.js                年表示
    three.core.js
    three.module.js             three.js 本体（同梱、変更しない）
  jsm/misc/RollerCoaster.js     three.js のサンプルのレール生成（同梱、変更しない）
data/
  nikkei225.json                日経平均の週次終値
  train-yamanote.json           山手線の駅（経緯度）
tests/                          node:test によるテスト
```

`track.js` と `ride.js` は three.js のレンダラに依存せず、数学クラスだけを `three.core.js` から相対パスで読みます。このため、ブラウザと Node の両方で動きます。

## データ出典

確認中です。
