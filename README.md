# 日経平均株価 3D ジェットコースター

日経平均株価の週次終値をレールの高さに、山手線一周を水平の経路に割り当てた、3D のジェットコースターです。1990 年 1 月の大崎駅を出発し、山手線を外回りに一周するあいだに、株価の上げ下げを乗り物として体感できます。

- 高さ：その週の日経平均株価。高いところを走っているときは、株価が高い時期です。
- 一周：データの期間（1990 年 1 月から最後の週まで）です。山手線のどこを走っているかが、そのまま時期に対応します。
- 画面には、現在の週と終値、全期間のミニグラフ、山手線の路線図、3D 空間の等高線が出ます。

three.js（同梱）で描画しています。ビルドは不要で、依存パッケージもありません。静的ファイルをそのまま配信します。

## 起動方法

ES Modules を使うため、`file://` で開いても動きません。リポジトリ直下で静的サーバを立てます。

```sh
npm start
```

`npm start` は、次のコマンドを実行するだけです。Node がなくても、Python 3 があれば起動できます。

```sh
python3 -m http.server 8000
```

ブラウザで http://localhost:8000/ を開き、「乗車する」を押すと走り出します。

そのままで動くのは、同梱の**サンプルデータ（合成）**です。実際の日経平均株価ではありません。実データで動かすには、後ろの「データ」を見てください。

## 操作

画面のボタン（広い画面では右上、スマートフォンでは画面の下）とキーボードで操作できます。スマートフォンでは、画面のボタンを使います。

| 画面のボタン | キー | 動作 |
|---|---|---|
| 一時停止／再生 | `Space` | 走行を止める、再び走らせる。 |
| 俯瞰／一人称 | `W` | `W` は押している間だけ俯瞰で、離すと元の視点に戻ります。ボタンは押すたびに俯瞰と一人称を切り替えます。 |
| 最初から | `R` | 1990 年 1 月の大崎駅へ戻って、走り直します。一時停止中でも、走行が再開します。 |
| 情報 | `I` | 情報パネル（操作、データ出典、クレジット）を開きます。もう一度 `I`、`Esc`、閉じるボタン、パネルの外側のクリックで閉じます。 |

- 情報パネルを開いているあいだは、走行が止まります。閉じると再開します（開く前から止まっていたときは、止まったままです）。パネルの表示中は、`W` と `R` は効きません。
- 乗車前の `Space` と `R` は、何もしません。一周して止まったあとの `Space` も、何もしません（`R` で最初から走り直せます）。
- 画面のボタンやリンクにフォーカスがあるとき、`Space` は、そのボタンを押す動作になります。
- `Ctrl`・`Cmd`・`Alt` を押しながらのキーは、無視します。
- 走行の速さは、レールの勾配で変わります。下りで速く、上りで遅くなります。

一周して止まると、終了画面が出ます。「もう一度乗る」で最初から走り直し、「俯瞰で全体を見る」（`Esc` でも同じ）で、画面を閉じて俯瞰に切り替えます。

## 画面の見かた

- **現在値の帯**（左上。スマートフォンでは上端）：いま走っている週の日付と終値、前の週との差です。表示する値は、移動平均をかけていない実際の終値です。
- **ミニグラフ**（左下。スマートフォンでは下段の左）：全期間の終値の折れ線です。走行済みの部分と現在位置が重なって出ます。実データのときは、出来事の位置に目盛りが付きます。
- **路線図**（右下。スマートフォンでは下段の右）：山手線の輪と現在位置です。「いま：○○付近」で最寄りの駅名を示します。
- **3D の等高線**：線路の脇に、1 万円ごとの高さを示す輪と、値のラベルがあります。いま何万円のあたりを走っているかが読めます。
- **カーテン**：レールの真下に、床からレールまで張った半透明の面です。折れ線グラフを立体にした面積グラフのように見えます。
- **俯瞰**：南から見下ろす視点です。山手線の輪と、レールの形（株価の上げ下げ）を一度に見渡せます。レールの上端に帯が出て、凡例（走行済み・これから・現在地。実データのときは「出来事」も）と駅名が出ます。
- **連絡区間**：レールは、最後の高さから出発点の高さへ戻って、輪として閉じています。この短い区間にデータはなく、走行はその手前で終わります。
- **出来事の注釈**：実データのときだけ出ます。3D 空間のアーチと、画面下のキャプションで、主要な出来事を知らせます。
- **終了画面**：一周したときに出ます。最初の週、最後の週、最高値、最安値と、期間の変化を示します。

## データ

### 同梱のサンプルデータ（合成）

`data/nikkei225.json` は、日経平均株価のおおまかな水準に似せて作った**合成データ**です。各週の値は、実際の終値と一致しません。メタ情報は `data/nikkei225.meta.json`（`kind: "sample"`）にあります。

サンプルのときは、スタート画面、現在値の帯（バッジ）、終了画面に、その旨が出ます。出来事の注釈は出ません（出来事の日付と値が、合成データと合わないためです）。

### 実データで動かす

実データはリポジトリに含めていません。取得スクリプトを手元で実行します。Node 22 以降が必要です。

```sh
npm run fetch-data   # data/local/ に実データを書き出す
npm start
```

ブラウザで http://localhost:8000/?data=local を開きます。`data/local/` がないときは、スタート画面に「実データがまだありません」と出ます。`?data=local` を外すと、サンプルデータで動きます。

- 取得元：米セントルイス連邦準備銀行 FRED の系列 NIKKEI225（日次終値）。`https://fred.stlouisfed.org/graph/fredgraph.csv?id=NIKKEI225&cosd=1990-01-01`
- 週次への集計：月曜始まりの週ごとに、その週の最終営業日の終値をとります（営業日のない週は行を作りません）。日付は週の月曜日です。
- 出力：`data/local/nikkei225.json`（週次終値）と `data/local/meta.json`（出典などのメタ情報）。どちらも git の管理外です。
- 取得に失敗するときは、上の URL を開いて CSV を保存し、次のコマンドを実行します。

```sh
node scripts/fetch-nikkei.mjs --from-file 保存したファイル
```

出来事の注釈（`data/events.json`）は、実データのとき（`<html data-kind="real">`）だけ出ます。

### データ出典

実データの出典表記：

> 出典：日本経済新聞社「日経平均株価」（©日本経済新聞社）。米セントルイス連邦準備銀行 FRED（系列 NIKKEI225）経由で取得。週次値は各週の最終営業日の終値。

`data/events.json` の注釈（主要な出来事の日付と、その日の日経平均株価の終値）は、FRED（系列 NIKKEI225）と、日本銀行・金融庁・気象庁の公表資料で確認した事実に基づきます。

- 駅の位置（`data/train-yamanote.json`）は、駅データ.jp（https://ekidata.jp/）のデータを加工したものです。
- 画面の情報パネル（「データ出典」）にも、出典を表示します。文言は、サンプルか実データかに応じて、`assets/js/ui/texts.js` が作ります。

### 日経平均株価の値を公開する場合の注意

日経平均株価の値を第三者へ提供すること（実データのファイルを公開の場所に置く、実データの画面を公開するなど）には、日本経済新聞社の利用許諾の手続きが必要になる場合があります。取得したデータは手元での利用にとどめてください。公開する場合は、各自で規約を確認してください。

- 日経平均株価の利用規約：https://indexes.nikkei.co.jp/nkave/archives/file/license_agreement_jp.pdf
- FRED の利用条件：https://fred.stlouisfed.org/legal/

## アクセシビリティと対応環境

- キーボードだけで操作できます（「操作」の表のとおり）。情報パネルと終了画面は、開いているあいだ、フォーカスをパネルの中に閉じ込めます。情報パネルを閉じると、開いたボタンへフォーカスを戻します。終了画面を閉じると、「もう一度乗る」のときは一時停止のボタンへ、「俯瞰で全体を見る」と `Esc` のときは視点のボタンへ戻します（一周して止まったあとは、一時停止のボタンが使えないためです）。
- ボタンには、キーの案内を含む `aria-label` が付いています。年が変わるたびに年を読み上げ、出来事のキャプションは `aria-live` の領域に出します。ミニグラフと路線図の canvas は、現在の位置を `aria-label` で伝えます。
- `prefers-reduced-motion: reduce` のときは、次のように動きを抑えます。
  - 乗車すると、俯瞰の視点から始まります。
  - 一人称では、車体の傾きを小さくし、向きの変化と速度の上限をゆるやかにします。
  - 視点の切り替えは、補間せずにすぐ切り替わります。
  - 現在位置マーカーの脈動と、出来事の目印の回転を止めます。画面の出入りは、移動や拡大をやめて、150ms の透明度の変化だけにします。
  - 出来事のキャプションは、通常より長く表示します。
- モバイルに対応しています。画面の幅が 720px 以下では、HUD の配置とボタンの大きさをスマートフォン向けに変え、情報パネルは画面の下から出ます。ボタンはタッチで押せます。ノッチなどの safe-area を避けます。
- 必要なブラウザの機能：ES Modules と import map、WebGL、Canvas 2D。このリポジトリでは、Chromium（Playwright）で動作を確かめています。
- WebGL が使えないときと、`file://` で開いたときは、スタート画面に理由と対処が出ます。

## 開発

### テスト

Node 22 以降が必要です。依存パッケージはありません。

```sh
npm test
```

`node:test` で、`tests/` の全ファイルを実行します。データの移動平均、経路と曲線、走行状態の更新（フレームレートによらず同じ進み方になること）、連絡区間、レールの色分け、等高線、HUD の目盛りと文言、出来事の注釈、取得スクリプトの集計などを確かめます。

### デバッグ

URL に `?debug` を付けると（実データなら `?data=local&debug`）、コンソールから `window.__coaster` を使えます。

```js
window.__coaster.getState()            // いまの状態（progress、view、paused、finished、point など）
window.__coaster.setProgress( 0.5 )    // 周回の位置（0〜1）へ移す
window.__coaster.pause()               // 一時停止（resume() で再開）
window.__coaster.restart()             // 最初から
window.__coaster.setView( 'overview' ) // 'ride'（一人称）または 'overview'（俯瞰）
```

`ride`（走行状態）と `ctx`（共有の文脈）も入っています。

### モジュールの追加のしかた

機能は、1 つずつモジュールに分かれています。モジュールは `createXxx( ctx )` を export する関数で、`assets/js/main.js` の `MODULES` 配列に 1 行で登録します。登録した順に生成し、毎フレーム同じ順に呼びます。

```js
export function createXxx( ctx ) {

	// 生成時に 1 回だけ呼ばれる。DOM の取得、3D オブジェクトの追加、イベントの購読はここで行う
	return {
		update( state ) {},        // 毎フレーム
		onViewChange( view ) {},   // 視点が変わったとき（'ride' または 'overview'）
		onReset() {},              // 最初からやり直したとき
		dispose() {}               // 後片付け（main.js は呼びませんが、書いておけます）
	};

}
```

- フックは、すべて省略できます。モジュールが例外を投げると、そのモジュールだけを以後呼ばず、他のモジュールは動き続けます。
- `ctx` は、`renderer`、`scene`、`camera`、`train`、`dataset`、`stations`、`curve`、`ride`、`view`、`ui`、`events`、`config` を持ちます。
- `state` は、`progress`、`phase`、`dataIndex`、`point`（いまの週）、`paused`、`started`、`finished`、`view` などを持ちます。走行の時間は `timeMs`、実時間は `nowMs` です（`main.js` の `makeState` を見てください）。
- モジュール間の通知は `ctx.events` で行います。`start`、`pause`、`resume`、`restart`、`finish`、`viewchange`、`yearchange` が流れます。
- 他のモジュールが作った 3D オブジェクトは、`ctx.scene.getObjectByName( 'rail' )` のように名前で取ります。
- 画面の部品は `index.html` の `<!-- [名前] -->` のブロックに書き、スタイルは `assets/css/` に足して、`main.css` から `@import` します。色や文字サイズは `tokens.css` の CSS 変数を使います。
- 定数は `assets/js/config.js` に置きます。

`track.js`・`ride.js`・`loop.js`・`events.js`・`data.js` と、文言や計算の部分（`ui/texts.js`、`summary.js`、`hud/scales.js`、`events-data.js` など）は、DOM に触れません。ブラウザと Node の両方で動くので、`tests/` から直接読んでテストしています。

### ファイル構成

```
index.html                      ページ本体（スタート画面、HUD、終了画面、情報パネル、importmap）
README.md                       このファイル
package.json                    npm start / npm run fetch-data / npm test
.gitignore                      node_modules と data/local/ などを除外
scripts/
  fetch-nikkei.mjs              FRED から実データを取得し、週次終値を data/local/ に書き出す
assets/
  favicon.svg                   ファビコン
  LICENSE-three.js.txt          three.js のライセンス
  css/
    main.css                    @import の一覧だけ
    tokens.css                  色・文字サイズ・動きのトークン（CSS 変数）
    base.css                    リセット、パネルとボタンの共通、reduced-motion
    hud.css                     HUD の各部品の配置（画面の幅と高さで切り替え）
    start.css                   スタート画面
    readout.css                 現在値の帯と凡例
    chart.css                   ミニグラフ
    map.css                     路線図
    annotations.css             出来事のキャプション
    controls.css                操作ボタン
    endscreen.css               終了画面
    infopanel.css               情報パネル
  js/
    main.js                     起動処理：データを読み、共有 ctx を作り、MODULES を生成し、毎フレーム update を呼ぶ
    config.js                   定数（座標、速度、配色、機能ごとの設定）
    data.js                     データ読み込み（サンプル／実データ）、移動平均、系列の参照
    track.js                    経緯度の変換、山手線の経路、レールの曲線（TrackCurve）
    loop.js                     周回の位置とデータ系列の位置の変換（連絡区間を含む）
    ride.js                     走行状態（進行度・速度・一時停止・終了）と操作
    view.js                     一人称と俯瞰の切り替え、カメラの置き方
    controls.js                 キーボード入力（Space・W・R）
    events.js                   小さなイベント発行器（on / emit）
    scene.js                    renderer、scene、ライト、カメラ、リサイズ
    environment.js              床とグリッド
    rail.js                     レール、支柱、床の足跡、現在位置マーカー
    rail-colors.js              レールの色分け（走行済み・これから・連絡区間）
    curtain.js                  レール下のカーテンと、俯瞰のときのレール上端の帯
    scale.js                    高さの等高線、値ラベル、俯瞰の駅名
    markers.js                  出来事の 3D の目印（実データのときだけ）
    events-data.js              data/events.json の読み込みと検証、キャプションを出す順番
    summary.js                  終了画面の要約（最高値・最安値など）
    hud/
      layer.js                  HUD の canvas の共通処理（高解像度対応、描き置き）
      scales.js                 ミニグラフと路線図の目盛りの計算
      readout.js                現在値の帯
      legend.js                 凡例
      chart.js                  ミニグラフ
      map.js                    路線図
      annotations.js            出来事のキャプション
    ui/
      start.js                  スタート画面（読み込み中・エラーの表示、乗車ボタン）
      texts.js                  スタート画面と情報パネルの文言（期間・出典）
      buttons.js                操作ボタン、reduced-motion の設定
      endscreen.js              終了画面
      infopanel.js              情報パネル
    three.core.js
    three.module.js             three.js 本体（同梱。変更しません）
  jsm/misc/RollerCoaster.js     three.js のサンプルのレール生成（同梱。変更しません）
data/
  nikkei225.json                サンプルデータ（合成。実際の日経平均ではない）
  nikkei225.meta.json           サンプルデータのメタ情報（kind: sample）
  events.json                   主要な出来事の注釈（実データのときだけ使う）
  train-yamanote.json           山手線の駅（経緯度）
  local/                        npm run fetch-data で作る実データ（git の管理外）
tests/
  helpers.js                    テスト用のデータ読み込み
  *.test.js                     node:test のテスト（ride、track、data、link、hud-scales、readout、
                                rail-colors、curtain、scale、annotations、events、summary、
                                start、buttons、data-source）
```

## ライセンスとクレジット

- 3D 描画：[three.js](https://threejs.org/)（MIT License）。`assets/js/three.core.js` と `assets/js/three.module.js` を同梱しています。ライセンス全文は `assets/LICENSE-three.js.txt` にあります。
- レールの形状：three.js のサンプル「webxr_vr_rollercoaster」（`assets/jsm/misc/RollerCoaster.js`）をもとにしています。
- 駅の位置：駅データ.jp（https://ekidata.jp/）のデータを加工しています。
- 日経平均株価：出典は「データ」の節を参照してください。
