// 定数の置き場。数値の意味をここに集め、他のモジュールには直書きしない。

// ---- 時間 ----
// 速度・補間係数はすべて「60fps の 1 フレーム」を基準に決めた値を、
// ミリ秒あたりに換算して使う。
export const FRAME_MS = 1000 / 60;
// タブ復帰などで delta が大きくなったときの飛びを防ぐ上限
export const MAX_DELTA_MS = 100;

// ---- データ ----
// 値の書式・目盛り・文言は、ここの定義だけから作る（assets/js/format.js の createFormatter( def )。直書きしない）。
// 既定は同梱のドル円。URL の ?data=usdjpy | jgb10 | nikkei で選ぶ（知らない値は既定。旧 ?data=local は nikkei。data.js）。
// nikkei は、npm run fetch-nikkei で作った data/local/ を読む（git に入らない。提供元の規約で値を同梱できない）。
//   dataUrl / metaUrl：週次データ（[ { date, close } ]）とメタ情報のパス
//   name：長い名前（タイトル・説明・aria）、short：短い名前、chartTitle：ミニグラフの見出し、readoutLabel：現在値の帯のラベル
//   unit：単位、decimals：小数の桁数、group：3桁区切りにするか
//   step：目盛りの刻み（ミニグラフ・3D 共通）、stepCompact：狭い画面用の粗い刻み
//   statLabels：終了画面の最高値・最安値のラベル
//   changeMode：前週比の書き方（'yen-fx'：円安・円高つきの円、'point'：ポイント、'percent'：円と％）
//   eventsUrl：主要な出来事の注釈（data/events/*.json。events-data.js）。値は書かず、キャプションの値は表示中のデータから引く
export const DEFAULT_DATASET = 'usdjpy';
export const DATASETS = {
	usdjpy: {
		id: 'usdjpy',
		dataUrl: './data/usdjpy.json',
		metaUrl: './data/usdjpy.meta.json',
		name: 'ドル円の為替レート',
		short: 'ドル円',
		chartTitle: 'ドル円レートの推移',
		readoutLabel: '週次・1ドルあたり',
		unit: '円',
		decimals: 2,
		group: false,
		step: 50,
		stepCompact: 100,
		// 3D の等高線で強く描く線の間隔（100円・200円・300円）
		strongEvery: 100,
		statLabels: { max: '最高値（最も円安）', min: '最安値（最も円高）' },
		changeMode: 'yen-fx',
		chips: [ '高さ＝1ドルの円の値段', '高いほど円安' ],
		creditShort: '米連邦準備制度理事会（FRB）「H.10」',
		eventsUrl: './data/events/usdjpy.json'
	},
	jgb10: {
		id: 'jgb10',
		dataUrl: './data/jgb10.json',
		metaUrl: './data/jgb10.meta.json',
		name: '10年国債の金利',
		short: '国債金利',
		chartTitle: '10年国債の金利の推移',
		readoutLabel: '週次・利回り',
		unit: '%',
		decimals: 3,
		group: false,
		step: 1,
		stepCompact: 2,
		// 強く描く線は 0% の線だけ（0 の線は、どのデータでも範囲にあれば強く描く。scale.js）
		strongEvery: null,
		statLabels: { max: '最も高い金利', min: '最も低い金利' },
		changeMode: 'point',
		chips: [ '高さ＝10年国債の金利', '長期金利の代表的な指標' ],
		creditShort: '財務省「国債金利情報」を加工して作成',
		eventsUrl: './data/events/jgb10.json'
	},
	nikkei: {
		id: 'nikkei',
		dataUrl: './data/local/nikkei225.json',
		metaUrl: './data/local/meta.json',
		name: '日経平均株価',
		short: '日経平均',
		chartTitle: '日経平均株価の推移',
		readoutLabel: '週次終値',
		unit: '円',
		decimals: 0,
		group: true,
		step: 10000,
		stepCompact: 20000,
		// 5万円の線を強く描く
		strongEvery: 50000,
		statLabels: { max: '最高値', min: '最安値' },
		changeMode: 'percent',
		chips: [ '高さ＝株価（週次終値）', '手元で取得したデータ' ],
		creditShort: '日本経済新聞社「日経平均株価」（手元で取得）',
		eventsUrl: './data/events/nikkei.json',
		localOnly: true
	}
};
// レール形状に使う移動平均の窓（週数）。HUD の表示値は移動平均をかけない生データ。
export const MOVING_AVERAGE_WINDOW = 4;

// ---- 座標とコース（螺旋） ----
// ワールド座標は x：東、z：南（北は −z）。コースはアルキメデスの螺旋で、上から見て時計回りに内側（古い）から外側（新しい）へ進む。
//   角度：暦で決める。yearsPerTurn 年で 1 周し、西暦が yearsPerTurn の倍数の年（1980、1990、2000…）の 1 月 1 日が北（角度 0）を向く。
//   半径：データの最初の日付で innerRadius。そこから経過年数に比例して広がり、1 周ごとに turnGap ずつ外へ出る。
// 進行位置 t（0..1）は時間に比例する（t = 0 が最初の週の日付、t = 1 が最後の週の日付）。track.js の TrackCurve。
export const SPIRAL = {
	yearsPerTurn: 10,
	innerRadius: 16,
	turnGap: 13
};
// 内側の半径 16：最初の周で前方 20 先（デスクトップ）・10 先（モバイル）が画面に入る（12 では外れる）。
// 間隔 13：56 年分（5.6 周）で外側の半径 約 89。出来事のアーチ（直径 6.4）との余裕 6.6。

// レールの高さ（ワールド座標の y）の範囲。移動平均後の系列の最小・最大に対応する。
export const Y_MIN = 3;
export const Y_MAX = 35;

// ---- 走行 ----
// progress は 0..1（データの最初の週 = 0、最後の週 = 1。時間に比例）。
// 速度は「データの 1 年を何秒で走るか」の逆数（年/秒）で持ち、データの期間 T 年で progress/ms に換算する（ride.js）：
//   基準の速さ base( r ) = yearsPerSecond × ( r / referenceRadius )^(−radiusExponent)   [年/秒]
//   倍率       m        = clamp( exp( − gravityPerYear × 1 年あたりの高さの変化 dy/dτ ), minFactor, maxFactor )
//                         dy/dτ は進行位置の前後 gradientWindowYears 年の弦の勾配
//   目標の速さ          = base( r ) × m。速さはこれへ一次遅れ（SPEED_RESPONSE_MS）で近づき、base × minFactor .. base × maxFactor に収める
//   progress / ms       = 年/秒 ÷ ( T × 1000 )
// 平らなところで base、下り（勾配が負）で速く、上りで遅くなる。勾配は年あたりなので、期間の違うデータでも同じ効き方になる。
// 半径による補正：螺旋は外側の周ほど 1 年あたりの距離が長く、補正なし（radiusExponent = 0。データの時間あたり一定）では
// 外側の見た目の速さが内側の 4〜5 倍になる。0.25 で内側を速め・外側を抑える（試作の計測。scratchpad/specs/spiral-params.md）。
// 所要時間の見込み：56 年分 約 271 秒、40 年分 約 186 秒、37 年分 約 173 秒。
export const SPEED = {
	yearsPerSecond: 0.26,
	referenceRadius: 16,
	radiusExponent: 0.25,
	gravityPerYear: 0.08, // 1 年あたりの高さの変化（ワールドの y / 年）1 あたりの、倍率の対数の変化
	// 倍率に使う勾配は、進行位置の前後この年数の弦の勾配（1 日の差分は、週ごとの細かい揺れが速さに乗って、起伏との対応が弱い）
	gradientWindowYears: 0.25,
	minFactor: 0.85,
	maxFactor: 2.5,
	// 年数を持たない曲線（テスト用）の期間
	fallbackYears: 36
};
// 一次遅れの時定数（ms）。この時間で目標との差が 1/e になる
export const SPEED_RESPONSE_MS = 1000;

/**
 * 期間 years 年のデータで、1 フレーム（MAX_DELTA_MS）に進みうる progress の最大（内側の周、下りの上限の倍率）。
 * 出来事のキャプションの「位置が飛んだ」の判定（events-data.js の captionStepLimit。ANNOT.caption.stepMargin 倍）に使う。
 */
export function maxProgressPerFrame( years ) {

	const yearsPerSecond = SPEED.yearsPerSecond * Math.pow( SPIRAL.innerRadius / SPEED.referenceRadius, - SPEED.radiusExponent ) * SPEED.maxFactor;
	return MAX_DELTA_MS * yearsPerSecond / ( years * 1000 );

}

// 向きの補間：60fps で 1 フレームあたり 8% 目標へ近づく
export const ORIENTATION_BLEND_PER_FRAME = 0.08;
// 開始位置（0 = データの最初の週）
export const START_PROGRESS = 0;
// 車体の傾き：レールの実際の勾配（dy / 水平の長さ = 高さ勾配 dy/dt / その位置の t あたりの水平距離 ds/dt）に対する比率。
// 1 でレールと同じ傾き。小さくすると、急な上り下りで前方のレールが画面の上下へ外れる
export const RAIL_SLOPE_RATIO = 0.7;
// 車体の傾きに使う勾配：進行位置の前後この長さ（水平。ワールドの単位）の弦の勾配
export const RAIL_SLOPE_WINDOW = 5;

// ---- カメラ ----
// 画角・カメラの位置・俯瞰の視点は SCENE（下）にある
export const TRAIN_RAIL_OFFSET = 0.3; // レール上面から車体の位置までの高さ

// ---- ジオメトリの分割 ----
// レール・支柱・足跡・カーテンは、曲線を弧長（水平）で等間隔に標本化する（curve.arcCurve）。
// 分割数は全長 / 区間の長さ（切り上げ）。rail-colors.js・curtain.js はレールと同じ分割数を使う。
export const TRACK_SAMPLING = {
	railSegment: 0.3, // レールの 1 区間の長さ（枕木は 2 区間に 1 本）
	lifterSpacing: 4.7, // 支柱の間隔
	shadowSegment: 0.94 // 床の足跡の 1 区間の長さ
};

/** 全長 length のときの分割数（区間の長さ segment）。 */
export function divisionsFor( length, segment ) {

	return Math.max( 2, Math.ceil( length / segment ) );

}

// =====================================================================
// ステージ2：デザインの共有定数。各節は機能担当が中身を足す場所。
// CSS 側の同じ値は assets/css/tokens.css（値を変えるときは両方そろえる）。
// =====================================================================

// ---- 3D の色（仕様 1-2。three.js にそのまま渡せる数値）----
export const PALETTE = {
	skyTop: 0x050b1c, // 空の上端
	skyHorizon: 0x142650, // 空の地平線・fog
	floor: 0x0a1530, // 床
	gridFine: 0x172a52, // グリッド（細）
	gridBold: 0x23396b, // グリッド（太）
	railAheadWhite: 0xe6ecf8, // レール：これから、白レール（2 本の細管）
	railAheadYellow: 0x8d9bbf, // レール：これから、黄色部（中央管・枕木）
	railRiddenWhite: 0xf2b84b, // レール：走行済み、白レール
	railRiddenYellow: 0xc98500, // レール：走行済み、黄色部
	pillar: 0x2c3b61, // 支柱
	shadow: 0x1d335f, // 影（床の足跡）
	marker: 0xe86a9a, // 現在位置マーカー
	markerRing: 0xffffff, // マーカーの輪・高さ線
	event: 0x45b4f0, // イベントの目印
	contour: 0x6d8ccf, // 等高線
	decadeSpoke: 0x9aa8cc, // 年代のスポーク（北。不透明度 0.7）
	hemisphereSky: 0xcdd8ff, // 半球光（空）
	hemisphereGround: 0x1a2b55, // 半球光（地）
	directional: 0xffffff, // 平行光
	railEmissive: 0x0b1226 // レール材質の emissive
};

// ---- フォント（canvas と Sprite 用。tokens.css の --font-sans と同じ文字列）----
// 使い方：ctx.font = `600 12px ${FONT_SANS}`
export const FONT_SANS = 'system-ui, -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", "Noto Sans JP", "Noto Sans CJK JP", sans-serif';

// ---- canvas に描く 2D の色（tokens.css の同名の変数と同じ値）----
export const HUD_COLORS = {
	bg1: '#0b1733',
	panel: 'rgba(11, 23, 51, 0.90)',
	panelBorder: 'rgba(150, 170, 220, 0.22)',
	text1: '#eef2fb',
	text2: '#b4bfd9',
	text3: '#96a3c4', // 軸目盛り・脚注（これより暗い文字色は作らない）
	ridden: '#c98500', // 走行済み
	ahead: '#7080a8', // これから（文脈線）
	marker: '#d55181', // 現在位置（白い輪 1.5px を必ず付ける）
	markerRing: '#ffffff',
	event: '#2f97d8', // イベント注釈の目印
	plotGrid: '#24365f', // グラフのグリッド（細線）
	plotAxis: '#3a4b75', // 基線
	contourLabel: '#dbe4f7',
	contourLabelBg: 'rgba(11, 23, 51, 0.72)',
	spoke: '#52659a', // 右下の螺旋の図の年代のスポーク（破線）
	decadeLabelBg: 'rgba(28, 44, 85, 0.92)' // 3D の年代のラベルの地（文字は text1）
};

// ---- 以下は空の節。各担当が自分の節にだけ値を足す ----

// SCENE：3D シーンの定数（仕様 4）。担当：シーン。
export const SCENE = {
	clearColor: PALETTE.skyTop,
	// 背景：縦グラデーション（0 = 画面の上端、1 = 下端）。地平線の色を fog と同じにして継ぎ目を消す
	// horizonAt：地平線を置く位置（この色の位置を、画面に映る地平線の高さへ毎フレーム合わせる。view.js）
	sky: {
		width: 2,
		horizonAt: 0.6,
		height: 256,
		stops: [
			[ 0, PALETTE.skyTop ],
			[ 0.45, 0x0d1d44 ],
			[ 0.6, PALETTE.skyHorizon ],
			[ 1, PALETTE.skyHorizon ]
		]
	},
	// 一人称の fog。俯瞰では near / far をカメラ距離の倍数へ遠ざけ、レールを霞ませない（床の端だけ地平線の色へ溶かす）
	fog: { color: PALETTE.skyHorizon, near: 30, far: 220 },
	fogOverview: { nearPerDistance: 1.25, farPerDistance: 2.4 },
	hemisphereIntensity: 2.4,
	directional: { intensity: 1.0, position: { x: 80, y: 160, z: 60 } },
	// 床：螺旋の外側の半径は最大 約 89。俯瞰の縦長の画面（S）ではカメラが 約 350 離れるので、床の奥の端が fog に溶けきるよう広めに。
	// polygonOffset：俯瞰の距離（200〜350）では深度の分解能がグリッドの浮き（0.01）より粗く、グリッドが床に負けて
	// 横の線だけが途切れ途切れに残る（縦の線が消える）。床を深度で少し奥へずらす
	floor: { size: 1600, polygonOffsetFactor: 1, polygonOffsetUnits: 4 },
	// グリッドを 2 枚：細 10 単位ごと、太 50 単位ごと（divisions = size / 間隔）
	gridFine: { divisions: 160, y: 0.01 },
	gridBold: { divisions: 32, y: 0.02 },
	gridOpacity: 0.8,
	// グリッドの線を区切る長さ（environment.js の createGridGeometry）
	gridSegment: 50,
	camera: { near: 0.1, far: 2000 },
	// 一人称：縦の画角 = min( fovMax, max( fovMin, 2·atan( tan( minHorizontalFov / 2 ) / aspect ) ) )
	ride: {
		fovMin: 55,
		fovMax: 80,
		minHorizontalFov: 60,
		// 車体（レール上面 + TRAIN_RAIL_OFFSET）から見たカメラの位置。後ろへ下げて、中央の管が足元に来ないようにする
		height: 1.1, // 上へ
		back: 1.6, // 後ろへ
		pitchDeg: - 6, // 下向きが負
		// 縦長の画面では、HUD（上の帯と下のパネル・ボタン）に挟まれた見える範囲が画面の中央より上にあるので、もう少し下を向いて前方を持ち上げる
		pitchDegPortrait: - 14
	},
	// 俯瞰：南（+z）から仰角 elevationDeg で見下ろす。
	// 構図は view.js の fitOverview が、螺旋の点（curtain.js が view.setOverviewSubject で渡す、レールの上端と床の点）と
	// 追加の点（view.setOverviewExtras。目盛りの壁と値ラベルの軸など）を画面に投影して決める：
	//   1. 画面の端から edge（px）内側の範囲に、点の外接矩形を、幅 maxWidth・高さ maxHeight（画面に対する割合）まで大きく収める。
	//   2. 点の投影の凸包が、HUD のパネルの矩形（gapPx 広げたもの）と重ならない範囲で、最も大きくなる大きさと位置を探す。
	//      螺旋はほぼ楕円に写るので、四隅のパネル（ミニグラフ・螺旋の図）の脇まで広げられる。
	//   HUD の矩形は、実行時に DOM（hudSelectors の要素の getBoundingClientRect）から読む。キャプション（captionSelector）は
	//   そのデータに出来事の注釈があるとき（'eventsready' の件数が 1 以上）だけ、スロットの端から高さ captionReservePx を確保する。
	//   キャプションは出来事を通るときだけ出るので、構図はそれを避けるが、縦の位置は「キャプションを除いた HUD の間の空き」の
	//   中央に寄せる（fitOverview の softObstacles）。
	//   DOM が無いとき（テスト）は hudFallback（hud.css・readout.css・annotations.css の値。safe-area は 0）。
	//   モードは hud.css と同じ：short（高さ 520 以下かつ横長）／ narrow（幅 720 以下）／ medium（721〜1023。M）／ wide（L）。
	// 仰角：40° / 48° / 55° を、56 年分（5.6 周）と 37 年分（3.7 周）で見比べて決めた。
	//   低いほど手前の周の壁が奥の周に重なり（40° では内側の高い壁が次の周の北側を隠す）、高いほど壁（= 値）が縦に潰れる。
	//   横長の画面は高さで大きさが決まるので、48°（壁の高さ 35 が約 150px、周の間が南で 40px 前後）。
	//   縦長の S は横幅で大きさが決まり、縦に余りがあるので、55°（大きさは変わらず、南北の周の間が広がって詰まりにくい）。
	// 螺旋の点がまだ無いときは、従来の式（target から距離 radius / sin( min( vfov, hfov ) / 2 )）。
	overview: {
		target: { x: 0, y: 15, z: 0 },
		elevationDeg: 48,
		elevationByMode: { narrow: 55 },
		radius: 110,
		fovLandscape: 50, // 横長の画面の縦画角
		fovPortrait: 65, // 縦長の画面の縦画角
		frame: {
			// 画面の端の余白（hud.css の --hud-m に合わせる）
			edge: { wide: 24, medium: 24, narrow: 12, short: 12 },
			// 螺旋と HUD のパネルの間
			gapPx: 10,
			// 大きさの上限（画面に対する割合）。縦長の S は横幅で決まるので、ほぼいっぱいまで
			maxWidth: { wide: 0.9, medium: 0.94, narrow: 0.94, short: 0.9 },
			maxHeight: { wide: 0.8, medium: 0.8, narrow: 0.9, short: 0.94 },
			// どこにも置けない（極端に小さい画面）ときは、この割合まで縮めてあきらめ、HUD を無視する
			minScale: 0.3,
			hudSelectors: [ '#hud-readout', '#hud-readout .ro-badge', '#hud-legend', '#hud-controls', '#hud-chart', '#hud-map' ],
			captionSelector: '#hud-caption',
			captionReservePx: 100,
			// DOM が無いときの HUD の矩形（CSS の配置と同じ書き方）。common はどのデータでも、legend は凡例、
			// caption は出来事のキャプション（注釈があるデータだけ。高さ captionReservePx。width・height の関数でもよい）
			hudFallback: {
				wide: {
					common: [
						{ left: 24, top: 24, width: 360, height: 84 }, // 現在値の帯
						{ right: 24, top: 24, width: 580, height: 44 }, // 操作ボタン
						{ left: 24, bottom: 24, width: 320, height: 188 }, // ミニグラフ
						{ right: 24, bottom: 24, width: 224, height: 280 } // 螺旋の図（正方形の図 192 を含むパネルの見込み）
					],
					legend: [ { left: 24, top: 116, width: 240, height: 28 } ],
					caption: ( w ) => {

						const cw = Math.min( 560, Math.max( 320, w - 736 ) );
						return { left: ( w - cw ) / 2, width: cw, bottom: 24, height: 100 };

					}
				},
				medium: {
					common: [
						{ left: 24, top: 24, width: 360, height: 84 },
						{ right: 24, top: 24, width: 380, height: 44 },
						{ left: 24, bottom: 24, width: 280, height: 168 },
						{ right: 24, bottom: 24, width: 200, height: 244 }
					],
					legend: [ { left: 24, top: 116, width: 240, height: 28 } ],
					// 俯瞰のあいだは凡例の下（annotations.css）
					caption: ( w ) => ( { left: 24, top: 152, width: Math.min( 560, w - 48 ), height: 100 } )
				},
				narrow: {
					common: [
						{ left: 12, right: 12, top: 12, height: 72 },
						{ left: 12, right: 12, bottom: 12, height: 48 },
						{ left: 12, right: 140, bottom: 68, height: 128 },
						{ right: 12, bottom: 68, width: 120, height: 128 }
					],
					legend: [ { left: 12, top: 90, width: 215, height: 20 } ],
					caption: { left: 12, right: 12, bottom: 204, height: 100 }
				},
				short: {
					common: [
						{ left: 24, top: 24, width: 360, height: 56 },
						{ right: 24, top: 24, width: 200, height: 44 },
						{ left: 24, bottom: 24, width: 220, height: 112 },
						{ right: 24, bottom: 24, width: 104, height: 112 }
					],
					legend: [ { left: 24, top: 88, width: 240, height: 28 } ],
					// 俯瞰のあいだは左の列（凡例の下）
					caption: { left: 24, top: 124, width: 220, height: 100 }
				}
			}
		}
	}
};

// RAIL：レールの定数（材質、色分けの設定、支柱・足跡の設定など）。担当：レールの色分け・シーン。
// 色はすべて PALETTE（railAhead* / railRidden* / pillar / shadow / marker / markerRing / railEmissive）。
export const RAIL = {
	// レールの材質（MeshPhongMaterial、vertexColors。emissive は PALETTE.railEmissive）
	material: { shininess: 60, specular: 0x334466 },
	// 支柱（MeshPhongMaterial、色は PALETTE.pillar）。高さ 10 を超える地点は同梱ファイルが門型にする
	pillar: { shininess: 10, y: 0.1 },
	// 床の足跡（RollerCoasterShadowGeometry、MeshBasicMaterial、色は PALETTE.shadow）
	shadow: { opacity: 0.9, y: 0.05 },
	// 現在位置マーカー（俯瞰のときだけ表示）
	marker: {
		// 俯瞰のカメラは山手線の輪から約 220（以前は 260）のときに決めた大きさ（0.85 倍）
		radius: 2.1, widthSegments: 24, heightSegments: 16, // 球
		ringInner: 2.7, ringOuter: 3.15, ringSegments: 48, // カメラに向く白い輪
		ringOpacity: 0.9, ringOpacityMin: 0.4, pulseMs: 1600, // 脈動 0.9 → 0.4 → 0.9（reduced-motion では 0.9 のまま）
		lineOpacity: 0.35 // 床までの白い縦線
	},
	// カーテン（curtain.js）：レールの真下、床からレールの高さまでの縦の面。AdditiveBlending、depthWrite: false。
	// 頂点の alpha は上端 topAlpha → 床 bottomAlpha。材質の opacity は一人称 rideOpacity、俯瞰 overviewOpacity（補間に合わせて変える）。
	// 色：これから PALETTE.contour、走行済み PALETTE.railRiddenYellow。
	// renderOrder：グリッド・足跡（0）より後に描く
	curtain: {
		topAlpha: 0.9,
		bottomAlpha: 0.06,
		rideOpacity: 0.15,
		overviewOpacity: 1,
		renderOrder: 2
	},
	// 俯瞰のときだけの、レール上端の帯（床と平行。幅 width、レールの上 lift）。
	// 色：これから PALETTE.railAheadWhite、走行済み PALETTE.railRiddenWhite。
	// 視点切り替えの補間（view.blend 0..1）が fadeFrom を超えたところから現れる
	topBand: {
		width: 1.3,
		lift: 0.15,
		fadeFrom: 0.5,
		renderOrder: 3
	}
};

// CONTOUR：3D の目盛り（等高線・値ラベル・目盛りの壁・年代のスポークとラベル）の定数。担当：高さ目盛り。
// 刻みはデータの書式（ctx.dataset.format.ticks）が決める。色は PALETTE（contour、decadeSpoke）と
// HUD_COLORS（contourLabel、contourLabelBg、decadeLabelBg）。
export const CONTOUR = {
	// 一人称の等高線：螺旋の中心線を外側（半径が増える向き）へ offset ずらした線を、各刻みの高さに引く。
	// 弧長 segment ごとの折れ線。strong の線（書式の strongEvery の倍数。ドル円 100 円ごと、日経平均 5 万円ごと）と
	// 0 の線（範囲にあるとき。金利）だけ少し強くする
	offset: 1.5,
	segment: 1.5,
	// 近くの線だけを出すので、全長に引いていたとき（0.55・0.85）より濃くする
	line: { opacity: 0.8, strongOpacity: 1 },
	// 等高線は、いまの位置の近くだけに出す（隣の周・その先の周の線は出さない）：弧長で前方 ahead、後方 behind。
	// 前方は、その位置の 1 周の長さ（2πr）の lapFraction までに縮める（内側の小さな周で、線が回り込んで視界を横切らないように）。
	// 前方の fadeFrom（ahead に対する割合）から先と、後方は、端に向かって薄くする。前方の値ラベルは ahead の labelReach まで。
	// 毎フレーム、範囲の分の頂点の alpha だけを書き換え、描画範囲（drawRange）を動かす（移動が minStep 未満なら書き換えない）
	// 刻みの向き：いまの値から levelFull 刻みより離れた線は、1 刻みごとに levelPer ずつ薄くする（levelMin まで）。
	// 頭上の高い線や足元の低い線が、空や床を何本も横切らないように（いまの値を挟む線と、その隣がはっきり見える）
	window: { ahead: 60, behind: 6, lapFraction: 0.4, fadeFrom: 0.45, labelReach: 0.7, minStep: 0.05, levelFull: 1.2, levelPer: 0.35, levelMin: 0.25 },
	// 等高線は一人称だけ：視点の補間 blend が hideFrom..hideTo で 1 → 0 に薄くなる
	rideFade: { hideFrom: 0, hideTo: 0.5 },
	// 値ラベル（Sprite）：テクスチャは値ごとに 1 枚。fontPx は pillHeight に対する文字の大きさ（画面上の文字の高さの基準）
	label: {
		pillHeight: 96, padding: 38, radius: 48, border: 2, fontPx: 56,
		// 一人称のラベルは、等高線からさらに extraOffset 外に置く。y は等高線 + lift
		extraOffset: 3,
		lift: 0.9
	},
	// 画面上の文字の高さ（px）。実行時のカメラの距離・画角と表示サイズから、Sprite の大きさ（ワールド単位）を決める
	// ride：基準距離 rideDistance にあるラベルの文字の高さ（近づくほど大きく、遠いほど小さい）
	// overview：俯瞰では距離によらずこの高さにそろえる（compact の画面は overviewCompact）
	textPx: { ride: 14, overview: 15, overviewCompact: 14 },
	rideDistance: 25,
	// 狭い画面（幅 compactMaxWidth 以下、または高さ compactMaxHeight 以下）：俯瞰の壁は粗い刻み（ticks の compact）
	compactMaxWidth: 720,
	compactMaxHeight: 520,
	// 一人称の値ラベル：いまの値を挟む上下の等高線に 1 つずつ。置き場所の候補は、ラベルの線（等高線のさらに外）の上を
	// 弧長 sampleSpacing ごとに取った点のうち、いまの位置から前方、等高線を出す範囲（window）の labelReach まで。
	// カメラから minDistance より近い場所、maxDistance より遠い場所、画面の端から insetPx 以内は使わない。
	// 文字の高さは、距離によらず minTextPx〜maxTextPx に収める。奥行き idealDepth に近く、画面の中央に近い（centerWeight）ほど良い
	ride: {
		minTextPx: 10, maxTextPx: 18, minDistance: 7, maxDistance: 70, idealDepth: 24, centerWeight: 10, insetPx: 8,
		sampleSpacing: 2
	},
	// 俯瞰の目盛りの壁：西（angleDeg 270。上から見て時計回りの角度、北 = 0）のスポーク上に、
	// 半径 innerRadius − innerInset から 外径 + outerInset まで。高さは横線のいちばん下から上まで。
	// 横線は PALETTE.contour（ラベルを付ける線は labeledOpacity）、0 の線（範囲にあるとき）は zeroColor。
	// 両端の柱は床から最上段まで。面は両端と最下段・最上段に囲まれた矩形
	wall: {
		angleDeg: 270,
		innerInset: 3,
		outerInset: 4,
		lineOpacity: 0.75,
		labeledOpacity: 0.95,
		zeroColor: 0xdbe4f7,
		zeroOpacity: 0.9,
		postOpacity: 0.5,
		fillOpacity: 0.06,
		// 視点の補間 blend が fadeFrom を超えたところから現れる（一人称では出さない）
		fadeFrom: 0.5,
		// 横線が maxLabels 本を超えるときは、1 本おき（値が 2 × step の倍数の線）にだけラベルを付ける
		maxLabels: 7
	},
	// 俯瞰の値ラベルの軸：壁の外側の端（アンカー）から、各横線の高さで外へ（画面の左へ）引き出し線
	// （長さ leaderPx。端の横線 stubPx）を出し、ラベルを下から上へ縦に並べる。ラベルの間は gapPx 以上。
	// 画面の端から insetPx 内側。HUD との隙間 margin。列は、HUD を避けて上下に shiftPx 刻みで shiftSteps 段までずらせる
	axis: {
		leaderPx: 30, leaderPxCompact: 22, stubPx: 7, gapPx: 4, insetPx: 8, margin: 6,
		shiftPx: 12, shiftSteps: 20,
		leaderOpacity: 0.9,
		// 俯瞰の構図（view.setOverviewExtras）に足す、ラベルの列の外側の余白（px）
		extraPadPx: 10,
		// 縦長の狭い画面（幅 compactMaxWidth 以下で縦長）：列を螺旋の左の外に置くと、その分だけ螺旋が小さくなるので、
		// 列を壁の外側の端の上（螺旋の外周より上の、空いている左上）に置き、下から上へ並べる。列の左端は壁の端から fanPx 右。
		// 引き出し線は、壁の端から斜めに上がり、ラベルの手前 stubPx を横に入る。列の下端は、その幅の範囲の螺旋（レールの上端）
		// より clearPx 上、かつ壁の最上段より liftPx 上
		above: { fanPx: 16, stubPx: 6, clearPx: 10, liftPx: 6 }
	},
	// 年代のスポーク（北へ延びる床の上の細い線）：中心から 外径 + spokeExtra まで、床の上 y
	spoke: { y: 0.06, extra: 6, opacity: 0.7 },
	// 年代のラベル（「1990年」）：角丸の長方形（枠なし）。canvas は値ラベルと同じ高さ（pillHeight 96 に文字 56）
	decade: {
		radius: 32, padding: 30,
		// 俯瞰：スポークと各周の交点の床（y）に中心を合わせる。文字の高さ textPx（compact は textPxCompact）
		y: 0.3, textPx: 14, textPxCompact: 13,
		// 隣のラベルと重なるときは、左右交互（sideGapPx だけスポークから離す）。それでも重なるときは 20 年ごと
		sideGapPx: 4, gapPx: 3,
		// 一人称：前方の次の境目だけ、レールの上 lift に出す。弧長で minDistance〜maxDistance 先のとき。
		// 文字の高さは基準距離 rideDistance で textPx.ride、minTextPx〜maxTextPx に収める
		ride: { lift: 4.6, minDistance: 9, maxDistance: 75, minTextPx: 11, maxTextPx: 20 }
	},
	// 俯瞰：年代のラベル・HUD のパネルとの最小の隙間（px）
	declutter: { margin: 4 },
	// 表示・非表示の切り替えのなめらかさ（時定数 ms）
	fadeMs: 110
};

// ANNOT：イベント注釈の定数（目印の大きさ、キャプションの表示時間、イベント一覧の置き場所など）。担当：イベント注釈。
export const ANNOT = {
	// 出来事の一覧はデータごと（DATASETS[ id ].eventsUrl）。選んだデータの分だけ読む
	// キャプション（時間はすべて ride の時間 state.timeMs。一時停止中は進まない）
	caption: {
		showMs: 6000, // 表示時間
		showMsReduced: 8000, // prefers-reduced-motion: reduce のとき
		minShowMs: 3000, // 表示中に次の出来事が来たとき、入れ替えるまでに最低限見せる時間
		maxWaitMs: 3000, // 通過してからこれ以上待たされた出来事は、画面の位置と合わなくなるので出さない
		outMs: 180, // 出（入れ替えるとき、次を出す前にフェードアウトを待つ時間。実時間）
		// 「位置が飛んだ」の判定：1 フレームで進みうる progress の最大（maxProgressPerFrame( curve.years )）の stepMargin 倍を超える変化。
		// progress あたりの速さはデータの期間で変わるので、データごとに求める（events-data.js の captionStepLimit）
		stepMargin: 2,
		// 期間を持たない曲線（テスト用）や、スケジューラの既定値：想定する最も短いデータ（30 年）での値（短いほど大きい = 判定がゆるい側）
		maxStepProgress: 2 * maxProgressPerFrame( 30 )
	},
	// 3D の目印（長さはワールド座標の単位。レールの高さは 3〜35）
	marker: {
		// アーチ：レール（中心線）をまたぐ半円。カメラは中心線の 0〜2.6 上を通るので、その内側に収まる半径にする
		archRadius: 3.2,
		archTube: 0.1,
		archSegments: 48,
		archTubeSegments: 8,
		// ひし形：アーチの頂点の上 diamondGap に置き、毎秒 diamondSpin rad で回す（reduced-motion では回さない）
		diamondRadius: 0.7,
		diamondGap: 1.6,
		diamondSpin: 0.6,
		lineOpacity: 0.5, // 床からレールまでの縦線
		archLineOpacity: 0.9, // 俯瞰で使う細い線のアーチ
		// 俯瞰：カメラの距離と画角に依らず、画面上でこの大きさ（CSS px）になるように毎フレーム決める
		overview: {
			diamondPx: 10, // ひし形の高さ
			labelTextPx: 14, // 年ラベルの文字の高さ
			archMinPx: 9, // アーチの半径の下限
			labelGapPx: 8, // ひし形の上端と年ラベルの下端の間
			labelPad: 4 // 年ラベルどうしの重なりを判定するときの余白（px）
		},
		label: { fontPx: 56, padX: 22, padY: 14, border: 3 } // 年ラベルの canvas（文字の高さ fontPx に対する余白）
	}
};

// MOTION：動きの定数（仕様 5）。担当：シーン・操作。
export const MOTION = {
	// 視点の切り替え：カメラを 500ms、ease-in-out（--ease-in-out と同じ cubic-bezier）で補間する。reduced では瞬時
	viewTransitionMs: 500,
	viewEase: [ 0.4, 0, 0.2, 1 ],
	// prefers-reduced-motion: reduce のときの一人称の値（穏やかな設定）。ride.js が使う
	reducedRide: {
		railSlopeRatio: 0.45, // RAIL_SLOPE_RATIO 0.7 の代わり（傾きを控えめに。前方のレールは画面に残る範囲）
		orientationBlendPerFrame: 0.04, // ORIENTATION_BLEND_PER_FRAME 0.08 の代わり
		speedMaxFactor: 0.5, // 速さの上限の倍率（SPEED.maxFactor）に掛ける（minFactor より下げない）
		gravityFactor: 0.5, // SPEED.gravityPerYear に掛ける（勾配による速度の変わり方を半分に）
		speedResponseMs: 2000 // SPEED_RESPONSE_MS 1000 の代わり（速度の変化をよりゆっくりに）
	}
};

// SOUND：データに連動するアンビエントサウンド（Web Audio でその場で合成。assets/js/audio/、sound.js）。担当：サウンド。
// 音の調整はこの節の値だけで済むようにしている。時間は秒、周波数は Hz、音量は 0..1 の線形の倍率。
// 音の高さは「音階の段（step）」で指定する：step k = rootHz × 2^( floor( k / 5 ) ) × 2^( scale[ k mod 5 ] / 12 )（5 音の音階を 1 オクターブ 5 段で数える）。
export const SOUND = {
	// マスター音量（コンプレッサの後）。書き出した波形のピークが −6 dBFS 程度に収まる値（検証：OfflineAudioContext で書き出して計測）
	masterVolume: 0.75,
	// フェード：一時停止・終了・音のオフでの消音（outSeconds）と、開始・再開・音のオンでの立ち上がり（inSeconds）
	fade: { outSeconds: 0.5, inSeconds: 0.8 },
	// 基音（A2）。パッドの根音で、音の粒・鐘・終わりの和音の音階もここから数える
	rootHz: 110,
	// 5 音の音階（基音からの半音）。上り（明るい）と下り（暗い）。音の粒は勾配の色に応じた確率でどちらかから選ぶ
	scales: { bright: [ 0, 2, 4, 7, 9 ], dark: [ 0, 3, 5, 7, 10 ] },
	// 写像：値の高さ（データの最小〜最大を 0..1）、勾配（1 年あたりの高さの変化）、速さ（ride.factor = 速さ ÷ 基準の速さ）
	mapping: {
		slopeScale: 6, // 勾配 → 和音の色：color = tanh( 勾配 / slopeScale )（−1 暗い .. +1 明るい）。小さいほど少しの上り下りで色が変わる
		slopeWindowYears: 0.5, // 勾配は進行位置の前後この年数の弦で測る（週ごとの揺れで色が揺れないように）
		colorSmoothingSeconds: 2.5, // 色の切り替わりの時定数（大きいほどゆっくり変わる）
		paramGlideSeconds: 0.6, // フィルタのカットオフなど、音のパラメータが目標へ近づく時定数
		paramUpdateSeconds: 0.1 // パラメータを AudioParam へ書く間隔（毎フレーム書かない）
	},
	// 持続音のパッド：根音・5 度・3 度（長 3 度と短 3 度を色で混ぜる）・9 度。各音は detuneCents だけずらした 2 つの発振器
	pad: {
		level: 0.16,
		// [ 基音からの半音, 波形, 音量の比 ]。third は色で長短を混ぜる
		voices: {
			root: [ 0, 'sawtooth', 0.55 ],
			fifth: [ 19, 'triangle', 0.7 ], // 1 オクターブ上の 5 度（E4）
			majorThird: [ 28, 'triangle', 0.45 ], // 2 オクターブ上の長 3 度（C#5）
			minorThird: [ 27, 'triangle', 0.45 ], // 2 オクターブ上の短 3 度（C5）
			ninth: [ 14, 'sine', 0.5 ] // 9 度（B3）
		},
		detuneCents: 7,
		// ローパスのカットオフ：値の高さ 0 → cutoffMinHz、1 → cutoffMaxHz（指数で補間）
		cutoffMinHz: 320,
		cutoffMaxHz: 2000,
		q: 0.8,
		lfoHz: 0.05, // カットオフのゆっくりした揺れ（周期 20 秒）
		lfoDepthHz: 140,
		ampLfoHz: 0.083, // 音量のゆっくりした揺れ（周期 12 秒）
		ampLfoDepth: 0.2, // level に対する割合
		delaySend: 0.12,
		reverbSend: 0.45
	},
	// 音の粒：音階から選ぶ短い音（正弦波を少し FM）。値の高さで音域、速さで間隔が変わる
	grain: {
		level: 0.13,
		// 音域：値の高さ 0 → 中心 stepLow、1 → 中心 stepHigh（段は上の音階の数え方）。中心から ±spread 段の範囲で選ぶ
		stepLow: 6, // B3 付近
		stepHigh: 20, // A6 付近
		spread: 2,
		attackSeconds: 0.05,
		decaySeconds: 2.4, // 指数の減衰（音量が 1/1000 になるまで）
		fmRatio: 2,
		fmIndex: 0.7,
		// 間隔：基準の速さ（ride.factor = 1）で intervalCruise 秒、interval = intervalCruise ÷ factor^speedExponent を [ intervalMin, intervalMax ] に収める
		intervalCruise: 1.5,
		intervalMin: 0.4,
		intervalMax: 2.6,
		speedExponent: 1.2,
		jitter: 0.25, // 間隔の揺らぎ（± 割合）
		restProbability: 0.18, // 休符（粒を鳴らさない）の確率
		// 粒のローパス：値の高さで cutoffMinHz → cutoffMaxHz
		cutoffMinHz: 1500,
		cutoffMaxHz: 6500,
		pan: 0.6, // 左右の広がり（± 最大）
		lookaheadSeconds: 0.3, // 先読み：この先までの粒を予約する
		delaySend: 0.45,
		reverbSend: 0.6
	},
	// 出来事の鐘（FM）。音の高さは出来事の位置の値の高さで stepLow..stepHigh
	bell: {
		level: 0.12,
		stepLow: 15,
		stepHigh: 22,
		modRatio: 1.41, // 非整数比で鐘らしい倍音
		modIndex: 4, // 打った瞬間の変調の深さ（modDecaySeconds で 0 へ）
		modDecaySeconds: 1.2,
		decaySeconds: 5,
		minGapSeconds: 0.35, // 続けて通過したときの、鐘どうしの最小の間隔
		delaySend: 0.35,
		reverbSend: 0.8
	},
	// 終点に着いたときの終わりの和音（長調の add9）。鳴らし終えたら fadeOutSeconds かけてマスターを 0 へ
	finish: {
		level: 0.1,
		semitones: [ 12, 19, 26, 28, 31 ], // A3・E4・B4・C#5・E5
		strumSeconds: 0.12, // 下から順に少しずつずらして鳴らす
		attackSeconds: 1.2,
		holdSeconds: 2,
		releaseSeconds: 4.5,
		fadeOutSeconds: 2,
		reverbSend: 0.7
	},
	// ディレイ：左右で長さの違う 2 本。フィードバックの経路にローパス（反復ごとに少しずつ暗くなる）
	delay: { leftSeconds: 0.62, rightSeconds: 0.93, feedback: 0.38, toneHz: 2600, returnLevel: 0.5 },
	// 残響：インパルス応答はコードで生成（左右で独立なノイズに指数の減衰。seconds で −60 dB）
	reverb: { seconds: 5, preDelaySeconds: 0.02, toneHz: 5000, returnLevel: 0.55, seed: 7 },
	// 最後のコンプレッサ
	compressor: { thresholdDb: - 20, kneeDb: 12, ratio: 3, attackSeconds: 0.02, releaseSeconds: 0.4 }
};
