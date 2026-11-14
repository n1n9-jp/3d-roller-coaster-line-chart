# 為替と金利の 3D ジェットコースター

時系列データ（週次の値）をレールの高さにした、3D のジェットコースターです。コースはらせん形で、10 年で 1 周します。上げ下げを乗り物として体感しながら、チャートとして値も読めます。

- 高さ：その週の値です。高いところを走っているときは、値が高い時期です。
- コース：上から見て時計回りに、内側（古い）から外側（新しい）へ進むらせんです。10 年で 1 周し、年代の境目（1980 年 1 月、1990 年 1 月…）は、どのデータでも北に揃います。
- データ：自由に再配布できる公的なデータを同梱しています（ドル円の為替レート、10 年国債の金利）。スタート画面で切り替えます。日経平均株価は、手元で取得したときだけ選べます。
- 走り通す時間：ドル円は約 4.5 分（1971 年から約 5.6 周）、10 年国債の金利は約 3 分（1986 年から約 4 周）です。

three.js（同梱）で描画しています。ビルドは不要で、依存パッケージもありません。静的ファイルをそのまま配信します。為替・金利・株価の動きを体感するためのもので、投資の助言ではありません。

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

## データ

スタート画面の「データを選ぶ」か、URL の `?data=` で切り替えます。選ぶとその URL で開き直します。指定がないとき、知らない値のときは、ドル円です。

| 見たいデータ | URL | 同梱 |
|---|---|---|
| ドル円の為替レート（既定） | `/` または `/?data=usdjpy` | はい |
| 10 年国債の金利 | `/?data=jgb10` | はい |
| 日経平均株価 | `/?data=nikkei` | いいえ（手元で取得） |

日経平均株価の項目は、手元のデータを読み込めたときだけ、スタート画面の切り替えに出ます。以前の `?data=local` は、`?data=nikkei` と同じ扱いです。

### ドル円の為替レート

`data/usdjpy.json`（週次の値）と `data/usdjpy.meta.json`（メタ情報）です。1971 年 1 月 4 日の週から 2026 年 11 月 2 日の週まで、2,912 週です。

- 出所：米連邦準備制度理事会（FRB）統計 H.10「Foreign Exchange Rates」（日本円。ニューヨーク市場の正午の買値、1 ドルあたり）。https://www.federalreserve.gov/releases/h10/hist/
- 規約：FRB ウェブサイトの利用条件（特記のない限りパブリックドメイン。出典を示す）。https://www.federalreserve.gov/disclaimer.htm
- 出典表記：

  > 出典：米連邦準備制度理事会（FRB）「Foreign Exchange Rates - H.10」（https://www.federalreserve.gov/releases/h10/hist/）を加工して作成

- 加工：FRB が公表する日次の値（ニューヨーク市場の正午の買値）のうち、値のある日を、月曜始まりの週ごとに、その週の最終営業日の値へまとめました（日付は週の月曜日、単位は円、小数 2 桁）。
- 取得日：2026 年 11 月 14 日。
- 更新：`npm run fetch-usdjpy`（Node 22 以降）。FRB の 3 つのページ（`dat89_ja.htm`、`dat96_ja.htm`、`dat00_ja.htm`）を取得して、`data/usdjpy.json` と `data/usdjpy.meta.json` を書き換えます。取得に失敗するときは、3 つのページをブラウザで保存して、フォルダを指定します。

```sh
npm run fetch-usdjpy
node scripts/fetch-usdjpy.mjs --from-dir 保存したフォルダ
```

`--from-file` でファイルを 1 つずつ渡すこともできます（`--from-file` は繰り返せます）。

### 10 年国債の金利

`data/jgb10.json` と `data/jgb10.meta.json` です。1986 年 6 月 30 日の週から 2026 年 11 月 9 日の週まで、2,105 週です。金利にはマイナスの値があります。

- 出所：財務省「国債金利情報」（10 年物。単位は %）。https://www.mof.go.jp/jgbs/reference/interest_rate/index.htm
- 規約：公共データ利用規約（第 1.0 版）PDL1.0。https://www.digital.go.jp/resources/open_data/public_data_license_v1.0
- 出典表記：

  > 出典：財務省「国債金利情報」（https://www.mof.go.jp/jgbs/reference/interest_rate/index.htm）、PDL1.0（https://www.digital.go.jp/resources/open_data/public_data_license_v1.0）を加工して作成

- 加工：財務省が公表する日次の国債金利（10 年物）のうち、値のある日を、月曜始まりの週ごとに、その週の最終営業日の値へまとめました（日付は週の月曜日、単位は %、小数 3 桁）。和暦の日付は西暦に直しています。
- 取得日：2026 年 11 月 14 日。
- 更新：`npm run fetch-jgb10`（Node 22 以降）。全期間の CSV（`jgbcm_all.csv`）と当月分の CSV（`jgbcm.csv`）を取得してつなぎ、`data/jgb10.json` と `data/jgb10.meta.json` を書き換えます。CSV は Shift_JIS で、日付は和暦です。取得に失敗するときは、2 つの CSV を保存して、ファイルを指定します。

```sh
npm run fetch-jgb10
node scripts/fetch-jgb10.mjs --from-file jgbcm_all.csv --from-file jgbcm.csv
```

### 日経平均株価（手元で取得）

日経平均株価は、提供元の規約で値をリポジトリに置けないため、同梱していません。使いたいときは、手元で取得します（Node 22 以降）。

```sh
npm run fetch-nikkei   # data/local/ に書き出す
npm start
```

ブラウザで http://localhost:8000/?data=nikkei を開きます。`data/local/` がないときは、スタート画面に「日経平均株価のデータがありません」と取得コマンドが出ます（上の切り替えから、ほかのデータを選べます）。

- 取得元：米セントルイス連邦準備銀行 FRED の系列 NIKKEI225（日次終値、1990 年 1 月から）。`https://fred.stlouisfed.org/graph/fredgraph.csv?id=NIKKEI225&cosd=1990-01-01`
- 週次への集計：同梱の 2 つと同じで、月曜始まりの週ごとに、その週の最終営業日の値をとります（営業日のない週は行を作りません）。日付は週の月曜日です。
- 出力：`data/local/nikkei225.json`（週次の値）と `data/local/meta.json`（出典などのメタ情報）。どちらも git の管理外です。
- 出典表記（`data/local/meta.json` の `attribution`）：出典：日本経済新聞社「日経平均株価」（FRED の系列 NIKKEI225 経由、https://fred.stlouisfed.org/series/NIKKEI225）を加工して作成
- 取得に失敗するときは、上の URL を開いて CSV を保存し、次のコマンドを実行します。

```sh
node scripts/fetch-nikkei.mjs --from-file 保存したファイル
```

出来事の注釈（`data/events/nikkei.json`）は同梱しています。日経平均株価の値は書いていないので、同梱できます。

#### 日経平均株価の値を公開する場合の注意

日経平均株価の値を第三者へ提供すること（実データのファイルを公開の場所に置く、実データの画面を公開するなど）には、日本経済新聞社の利用許諾の手続きが必要になる場合があります。取得したデータは手元での利用にとどめてください。公開する場合は、各自で規約を確認してください。

- 日経平均株価の利用規約：https://indexes.nikkei.co.jp/nkave/archives/file/license_agreement_jp.pdf
- FRED の利用条件：https://fred.stlouisfed.org/legal/

### 画面での出典の表示

スタート画面の下端に出典の短い形（取得日つき）が、情報パネルの「データ出典」に、メタ情報の `attribution`・加工の内容・取得日・利用条件が出ます。出来事の注釈があるときは、日付の出所のホスト名も出ます。文言は `assets/js/ui/texts.js` が作ります。

## 画面の見かた

- **コースの形**：らせん形のレールです。上から見て時計回りに、内側（古い）から外側（新しい）へ進みます。10 年で 1 周し、年代の境目は北を向く 1 本の線に揃います。同じ向きは、どの周でも同じ時期（たとえば北向きは 1 月）です。走りは、最後の週で止まります。
- **現在値の帯**（左上。スマートフォンでは上端）：いま走っている週の日付、値、前の週との差です。値と差の書き方はデータごとに違います（ドル円は円安・円高つきの円と %、金利はポイント、日経平均は円と %）。表示する値は、移動平均をかけていない実際の値です。
- **ミニグラフ**（左下。スマートフォンでは下段の左）：全期間の折れ線です。走行済みの部分と現在位置が重なって出て、出来事の位置に目盛りが付きます。
- **年代の輪**（右下。スマートフォンでは下段の右）：上から見たらせんの図です。北を向く線の上に年代の数字が並び、走行済みの部分と「いま：○○年」が出ます。
- **3D の目盛り**：値を読むための目盛りです。一人称では、レールの脇の線と値ラベルで、いま走っている高さが読めます。俯瞰では、西側に立つ目盛りの壁と値ラベルの軸、床の年代のラベル（北へ延びる線の上）で、値と年代が読めます。
- **カーテン**：レールの真下に、床からレールまで張った半透明の面です。折れ線グラフを立体にした面積グラフのように見えます。
- **俯瞰**：南から見下ろす視点です。年代が同心の輪として並び、レールの形（値の上げ下げ）を一度に見渡せます。レールの上端に帯が出て、凡例（走行済み・これから・現在地・出来事）が出ます。
- **出来事の注釈**：主要な出来事を通過すると、3D 空間のアーチと、画面のキャプション（見出し、補足、「当時 ○○」）で知らせます。後ろの「出来事の注釈」を見てください。
- **終了画面**：最後の週まで走ると出ます。最初の週、最後の週、最高値、最安値と、最初の週と比べた変化を示します。

走る速さは、レールの勾配で変わります。下りで速く、上りで遅くなります。レールの形には 4 週の移動平均を使っています（なめらかに走るためです）。

## 操作

画面のボタン（広い画面では右上、スマートフォンでは画面の下）とキーボードで操作できます。スマートフォンでは、画面のボタンを使います。

| 画面のボタン | キー | 動作 |
|---|---|---|
| 一時停止／再生 | `Space` | 走行を止める、再び走らせる。 |
| 俯瞰／一人称 | `W` | `W` は押している間だけ俯瞰で、離すと元の視点に戻ります。ボタンは押すたびに俯瞰と一人称を切り替えます。 |
| 最初から | `R` | 最初の週へ戻って、走り直します。一時停止中でも、走行が再開します。 |
| 情報 | `I` | 情報パネル（しくみ、操作、データ出典、クレジット）を開きます。もう一度 `I`、`Esc`、閉じるボタン、パネルの外側のクリックで閉じます。 |

- 情報パネルを開いているあいだは、走行が止まります。閉じると再開します（開く前から止まっていたときは、止まったままです）。パネルの表示中は、`W` と `R` は効きません。
- 乗車前の `Space` と `R` は、何もしません。最後の週で止まったあとの `Space` は、止まったままです（`R` で最初から走り直せます）。
- 画面のボタンやリンクにフォーカスがあるとき、`Space` は、そのボタンを押す動作になります。終了画面は「もう一度乗る」にフォーカスがあるので、`Space` で最初から走り直します。
- `Ctrl`・`Cmd`・`Alt` を押しながらのキーは、無視します。

最後の週で止まると、終了画面が出ます。「もう一度乗る」で最初から走り直し、「俯瞰で全体を見る」（`Esc` でも同じ）で、画面を閉じて俯瞰に切り替えます。

## 出来事の注釈

出来事の一覧は、データごとのファイルです（`data/events/usdjpy.json`、`jgb10.json`、`nikkei.json`）。ファイルの場所は、`assets/js/config.js` の `DATASETS` の `eventsUrl` で決めます。選んだデータのファイルだけを読みます。

```json
{
	"date": "1985-09-22",
	"title": "プラザ合意",
	"note": "G5がドル高の是正で合意。翌週、円は急騰した",
	"source": "https://…"
}
```

| 項目 | 内容 |
|---|---|
| `date` | 出来事の日付（`YYYY-MM-DD`）。一覧は日付の昇順で、重複させません。 |
| `title` | 見出し。20 字まで。 |
| `note` | 補足。40 字まで。 |
| `source` | 出所の URL。 |
| `showValue` | 省略できます。`false` にすると、「当時 ○○」を出しません。 |

- **値は書きません。** キャプションの「当時 ○○」は、出来事の日付を含む週の、表示中のデータの値から引いて書式にします。現在値の帯やミニグラフと必ず一致します。日経平均株価の値をファイルに書かずに済むのも、このためです。
- **出所の方針**：当局の発表やデータの値で確認できた事実に絞ります。日付と見出しは、`source` の一次資料で確かめられるものだけです。
- データの期間の外の出来事と、形式が正しくない項目は、使いません（形式の誤りはコンソールに警告が出ます）。ファイルがない、または読み込めないときは、注釈なしで走ります。
- 1 つの出来事を通過してから約 3 秒以内に出せなかったもの（走行が速くて詰まったとき）は、出しません。表示は約 6 秒です（`prefers-reduced-motion` のときは約 8 秒）。
- 読み込みが終わると、`ctx.events` に `'eventsready'`（`{ events, sources }`）が流れます。凡例の「出来事」の項目、ミニグラフの目盛り、情報パネルの出所は、これを使います。

## アクセシビリティと対応環境

- キーボードだけで操作できます（「操作」の表のとおり）。情報パネルと終了画面は、開いているあいだ、フォーカスをパネルの中に閉じ込めます。情報パネルを閉じると、開いたボタンへフォーカスを戻します。終了画面を閉じると、「もう一度乗る」のときは一時停止のボタンへ、「俯瞰で全体を見る」と `Esc` のときは視点のボタンへ戻します（最後の週で止まったあとは、一時停止のボタンが使えないためです）。
- ボタンには、キーの案内を含む `aria-label` が付いています。年が変わるたびに年を読み上げ、出来事のキャプションは `aria-live` の領域に出します。ミニグラフと年代の輪の canvas は、現在の位置を `aria-label` で伝えます。
- `prefers-reduced-motion: reduce` のときは、次のように動きを抑えます。
  - 乗車すると、俯瞰の視点から始まります。
  - 一人称では、車体の傾きを小さくし、向きの変化と速度の上限をゆるやかにします。
  - 視点の切り替えは、補間せずにすぐ切り替わります。
  - 現在位置マーカーの脈動と、出来事の目印の回転を止めます。画面の出入りは、移動や拡大をやめて、150ms の透明度の変化だけにします。
  - 出来事のキャプションは、通常より長く表示します。
- モバイルに対応しています。画面の幅が 720px 以下では、HUD の配置とボタンの大きさをスマートフォン向けに変え、情報パネルは画面の下から出ます。ボタンはタッチで押せます。ノッチなどの safe-area を避けます。
- 必要なブラウザの機能：ES Modules と import map、WebGL、Canvas 2D。このリポジトリでは、Chromium（Playwright）で動作を確かめています。
- WebGL が使えないとき、`file://` で開いたとき、データを読み込めないときは、スタート画面に理由と対処が出ます。

## 開発

### テスト

Node 22 以降が必要です。依存パッケージはありません。

```sh
npm test
```

`node:test` で、`tests/` の全ファイルを実行します。データの移動平均と日付の補間、螺旋のコース（角度、年代の境目、弧長）、走行状態の更新（フレームレートによらず同じ進み方になること）、レールの色分け、カーテン、3D の目盛り、HUD の目盛りと文言、値の書式、出来事の注釈とそのファイル、同梱データと取得スクリプトの集計（和暦、Shift_JIS、週次）などを確かめます。手元に `data/local/` があるときは、日経平均株価のデータでも確かめます。

### デバッグ

URL に `?debug` を付けると（日経平均株価なら `?data=nikkei&debug`）、コンソールから `window.__coaster` を使えます。

```js
window.__coaster.getState()            // いまの状態（progress、view、paused、finished、point など）
window.__coaster.setProgress( 0.5 )    // 進行位置（0〜1。時間に比例）へ移す
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
- `ctx` は、`renderer`、`scene`、`camera`、`train`、`dataset`、`curve`、`ride`、`view`、`ui`、`events`、`config` を持ちます。`dataset` は選んだデータで、`raw`（表示用の生データ）、`smoothed`（レール用の移動平均後）、`id`、`def`（`DATASETS` の 1 件）、`meta`、`format`（値の書式）を持ちます。`curve` は螺旋のコース（`TrackCurve`）です。3D のラベルの掲示板 `ctx.labels` は、`labels.js` の `getLabelBoard( ctx )` が最初に呼ばれたときに足されます。
- `state` は、`progress`、`dataIndex`、`point`（いまの週）、`paused`、`started`、`finished`、`view` などを持ちます。走行の時間は `timeMs`、実時間は `nowMs` です（`main.js` の `makeState` を見てください）。
- モジュール間の通知は `ctx.events` で行います。イベント名と payload は、`assets/js/events.js` の冒頭にあります。
- 他のモジュールが作った 3D オブジェクトは、`ctx.scene.getObjectByName( 'rail' )` のように名前で取ります。
- 画面の部品は `index.html` の `<!-- [名前] -->` のブロックに書き、スタイルは `assets/css/` に足して、`main.css` から `@import` します。色や文字サイズは `tokens.css` の CSS 変数を使います（3D と canvas の色は `config.js` の `PALETTE` と `HUD_COLORS`）。
- 定数は `assets/js/config.js` に置きます。

`track.js`・`ride.js`・`data.js`・`format.js`・`events.js`・`events-data.js`・`labels.js`・`summary.js`・`hud/scales.js`・`ui/texts.js` は、DOM にも three.js のレンダラにも触れません。ブラウザと Node の両方で動くので、`tests/` から直接読んでテストしています。

### データを足す

1. `data/` に、週次の値 `data/<id>.json` と、メタ情報 `data/<id>.meta.json` を置きます。値は `[ { "date": "YYYY-MM-DD", "close": 数値 }, … ]` で、日付の昇順です（週の月曜日の日付を想定しています）。コースの角度は日付から決まるので、開始年は自由です。
2. メタ情報の項目は、同梱の `data/usdjpy.meta.json` と同じです：`id`（`<id>` と同じにします。違うと読み込みを止めます）、`kind`（`"real"`）、`label`、`valueLabel`、`unit`、`decimals`、`source`、`sourceUrl`、`license`、`licenseUrl`、`attribution`（出典表記）、`processing`（加工の内容）、`fetchedAt`、`start`、`end`、`count`。情報パネルの「データ出典」とスタート画面の出典の行は、これを使います。
3. `assets/js/config.js` の `DATASETS` に、定義を足します。キーは `<id>` です。

   | 項目 | 内容 |
   |---|---|
   | `id`、`dataUrl`、`metaUrl` | 識別子と、2 つのファイルのパス。 |
   | `name`、`short` | 長い名前（タイトル・説明・aria）と、短い名前（スタート画面の切り替え）。 |
   | `chartTitle`、`readoutLabel` | ミニグラフの見出しと、現在値の帯のラベル。 |
   | `unit`、`decimals`、`group` | 単位、小数の桁数、3 桁区切りにするか。 |
   | `step`、`stepCompact` | 目盛りの刻み（ミニグラフと 3D 共通）と、狭い画面用の粗い刻み。 |
   | `statLabels` | 終了画面の最高値・最安値のラベル（`{ max, min }`）。 |
   | `changeMode` | 前週比の書き方：`'yen-fx'`（円安・円高つきの円）、`'point'`（ポイント）、`'percent'`（円と %）。 |
   | `chips` | スタート画面の 2 つの短い説明。 |
   | `creditShort` | 出典の短い形（スタート画面の下端）。 |
   | `eventsUrl` | 出来事の注釈のファイル（省略できます。省略すると注釈なし）。 |
   | `localOnly` | 手元のデータだけのとき `true`（切り替えの項目は、読み込めたときだけ出ます）。 |

   単位は `円` と `%` で確かめています。ほかの単位を使うときは、`format.js` の書式（`value`、`compact`、`ticks`）を確かめてください。
4. 出来事の注釈 `data/events/<id>.json` を置きます（任意。「出来事の注釈」を見てください）。
5. データごとの言い回し（`ui/texts.js` の `DATASET_TEXTS`）を足します（任意。なければ汎用の文言になります）。`index.html` の `#start-data` にも、切り替えのリンクを足します（JS が描き直すので、JS が動くときは見た目は変わりません）。
6. 取得スクリプトを `scripts/` に置き、`package.json` の `scripts` に足します（任意）。週次への集計と書き出しは、`scripts/lib/weekly.mjs` の `aggregateWeekly` と、`scripts/lib/output.mjs` の `buildRealMeta`・`writeDataset` を使います。
7. `tests/data-source.test.js`（`DATASETS` のキーの並び）と `tests/events-files.test.js`（出来事のファイル）を更新して、`npm test` を通します。
8. 規約を確かめ、このファイルの「データ」の節に、出所・規約・出典表記・加工・取得日・更新のしかたを足します。値をリポジトリに置けないデータは、`localOnly` にして、`data/local/` に作る形にします。

### ファイル構成

```
index.html                      ページ本体（スタート画面、HUD、終了画面、情報パネル、importmap）
README.md                       このファイル
package.json                    npm start / npm test / npm run fetch-usdjpy・fetch-jgb10・fetch-nikkei
.gitignore                      node_modules と data/local/ などを除外
scripts/
  fetch-usdjpy.mjs              FRB の H.10 から、ドル円の週次データ（data/usdjpy.json など）を作る
  fetch-jgb10.mjs               財務省の CSV から、10 年国債の金利の週次データ（data/jgb10.json など）を作る
  fetch-nikkei.mjs              FRED から、日経平均株価の週次データを data/local/ に作る
  lib/
    weekly.mjs                  日次の値を、月曜始まりの週ごとの値にまとめる（3 つの取得スクリプトの共通部分）
    output.mjs                  メタ情報の組み立てと、データの書き出し、ネットワーク取得
    frb.mjs                     FRB の H.10 のページ（HTML）の読み取り
    jgb.mjs                     財務省の CSV の読み取り（Shift_JIS、和暦 → 西暦）
assets/
  favicon.svg                   ファビコン
  og.png                        OGP 画像（1200x630）
  LICENSE-three.js.txt          three.js のライセンス
  css/
    main.css                    @import の一覧だけ
    tokens.css                  色・文字サイズ・動きのトークン（CSS 変数）
    base.css                    リセット、パネルとボタンの共通、reduced-motion
    hud.css                     HUD の各部品の配置（画面の幅と高さで切り替え）
    start.css                   スタート画面
    readout.css                 現在値の帯と凡例
    chart.css                   ミニグラフ
    map.css                     年代の輪（螺旋の図）
    annotations.css             出来事のキャプション
    controls.css                操作ボタン
    endscreen.css               終了画面
    infopanel.css               情報パネル
  js/
    main.js                     起動処理：データを読み、共有 ctx を作り、MODULES を生成し、毎フレーム update を呼ぶ
    config.js                   定数（データの定義 DATASETS、螺旋、走行、配色、機能ごとの設定）
    data.js                     データの読み込み、移動平均、日付と系列上の位置の換算
    format.js                   値の書式（単位・桁数・前週比・目盛りの刻み）をデータの定義から作る
    track.js                    螺旋のコース（TrackCurve：日付 → 角度と半径、進行位置と弧長の対応）
    ride.js                     走行状態（進行度・速度・一時停止・終了）と操作
    view.js                     一人称と俯瞰の切り替え、カメラの置き方、俯瞰の構図
    controls.js                 キーボード入力（Space・W・R）
    events.js                   小さなイベント発行器（on / emit）と、イベント名の一覧
    scene.js                    renderer、scene、ライト、カメラ、リサイズ
    environment.js              床とグリッド
    rail.js                     レール、支柱、床の足跡、現在位置マーカー
    rail-colors.js              レールの色分け（走行済み・これから）
    curtain.js                  レール下のカーテンと、俯瞰のときのレール上端の帯
    scale.js                    3D の目盛り（一人称の等高線と値ラベル、俯瞰の目盛りの壁、年代のスポークとラベル）
    labels.js                   3D のラベルの画面上の矩形の登録と、重なりの判定
    markers.js                  出来事の 3D の目印
    events-data.js              出来事の読み込みと検証、キャプションを出す順番
    summary.js                  終了画面の要約（最高値・最安値など）
    hud/
      layer.js                  HUD の canvas の共通処理（高解像度対応、描き置き）
      scales.js                 ミニグラフの目盛りの計算
      readout.js                現在値の帯
      legend.js                 凡例
      chart.js                  ミニグラフ
      map.js                    年代の輪（螺旋の図）
      annotations.js            出来事のキャプション
    ui/
      start.js                  スタート画面（読み込み中・エラーの表示、データの切り替え、乗車ボタン）
      texts.js                  スタート画面と情報パネルの文言（期間・出典・エラー）
      buttons.js                操作ボタン、reduced-motion の設定
      endscreen.js              終了画面
      infopanel.js              情報パネル
    three.core.js
    three.module.js             three.js 本体（同梱。変更しません）
  jsm/misc/RollerCoaster.js     three.js のサンプルのレール生成（同梱。変更しません）
data/
  usdjpy.json                   ドル円の週次データ（同梱）
  usdjpy.meta.json              ドル円のメタ情報（出所・規約・出典表記・加工・取得日）
  jgb10.json                    10 年国債の金利の週次データ（同梱）
  jgb10.meta.json               10 年国債の金利のメタ情報
  events/
    usdjpy.json                 ドル円の出来事の注釈
    jgb10.json                  10 年国債の金利の出来事の注釈
    nikkei.json                 日経平均株価の出来事の注釈（値は書いていない）
  local/                        npm run fetch-nikkei で作る日経平均株価のデータ（git の管理外）
tests/
  helpers.js                    テスト用のデータ読み込みと、仮の系列の作成
  annotations.test.js           出来事の読み込み・検証・位置の計算、キャプションを出す順番
  buttons.test.js               操作ボタンの表示と、reduced-motion の係数
  curtain.test.js               カーテンと上端の帯、俯瞰の構図
  data-source.test.js           データの定義と読み込み、日経平均株価の取得スクリプト（集計とメタ情報）
  data.test.js                  移動平均、日付と系列上の位置の換算
  endscreen.test.js             終了画面を閉じたあとのフォーカスの移し先
  events-files.test.js          data/events/*.json の形式と、同梱データとの整合
  events.test.js                イベント発行器
  format.test.js                値の書式
  hud-scales.test.js            ミニグラフの目盛り
  labels.test.js                3D のラベルの重なりの判定と配置
  main-order.test.js            main.js の購読の順序
  map.test.js                   年代の輪の計算
  overview-frame.test.js        俯瞰の構図（HUD を避けて収める）
  rail-colors.test.js           レールの色分け
  readout.test.js               現在値の帯の文言
  real-data.test.js             同梱データの取得スクリプト（和暦、FRB、財務省の CSV、週次への集計）
  ride-feel.test.js             走行の乗り心地と視点（3 つのデータ）
  ride.test.js                  走行状態の更新
  scale.test.js                 3D の目盛りの計算
  start.test.js                 スタート画面と情報パネルの文言
  summary.test.js               終了画面の要約
  track.test.js                 螺旋のコース
```

## ライセンスとクレジット

- 3D 描画：[three.js](https://threejs.org/)（MIT License）。`assets/js/three.core.js` と `assets/js/three.module.js` を同梱しています。ライセンス全文は `assets/LICENSE-three.js.txt` にあります。
- レールの形状：three.js のサンプル「webxr_vr_rollercoaster」（`assets/jsm/misc/RollerCoaster.js`）をもとにしています。
- ドル円の為替レート：米連邦準備制度理事会（FRB）「Foreign Exchange Rates - H.10」を加工して作成しています（出典表記と規約は「データ」の節を参照）。
- 10 年国債の金利：財務省「国債金利情報」を、公共データ利用規約（第 1.0 版）PDL1.0 に従って加工して作成しています（出典表記と規約は「データ」の節を参照）。
- 日経平均株価：手元で取得して使うときの出典は、「データ」の節を参照してください。
