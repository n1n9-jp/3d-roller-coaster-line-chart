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
		statLabels: { max: '最高値（最も円安）', min: '最安値（最も円高）' },
		changeMode: 'yen-fx',
		chips: [ '高さ＝1ドルの円の値段', '高いほど円安' ],
		creditShort: '米連邦準備制度理事会（FRB）「H.10」'
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
		statLabels: { max: '最も高い金利', min: '最も低い金利' },
		changeMode: 'point',
		chips: [ '高さ＝10年国債の金利', '長期金利の代表的な指標' ],
		creditShort: '財務省「国債金利情報」を加工して作成'
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
		statLabels: { max: '最高値', min: '最安値' },
		changeMode: 'percent',
		chips: [ '高さ＝株価（週次終値）', '手元で取得したデータ' ],
		creditShort: '日本経済新聞社「日経平均株価」（手元で取得）',
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
//   目標の速さ          = base( r ) × m。速さはこれへ一次遅れ（SPEED_RESPONSE_MS）で近づき、base × minFactor .. base × maxFactor に収める
//   progress / ms       = 年/秒 ÷ ( T × 1000 )
// 平らなところで base、下り（勾配が負）で速く、上りで遅くなる。勾配は年あたりなので、期間の違うデータでも同じ効き方になる。
// 半径による補正：螺旋は外側の周ほど 1 年あたりの距離が長く、補正なし（radiusExponent = 0。データの時間あたり一定）では
// 外側の見た目の速さが内側の 4〜5 倍になる。0.25 で内側を速め・外側を抑える（試作の計測。scratchpad/specs/spiral-params.md）。
// 所要時間の見込み：56 年分 約 265 秒、40 年分 約 177 秒、37 年分 約 163 秒。
export const SPEED = {
	yearsPerSecond: 0.244,
	referenceRadius: 16,
	radiusExponent: 0.25,
	gravityPerYear: 0.08, // 1 年あたりの高さの変化（ワールドの y / 年）1 あたりの、倍率の対数の変化
	minFactor: 0.85,
	maxFactor: 2.5,
	// 年数を持たない曲線（テスト用）の期間
	fallbackYears: 36
};
// 一次遅れの時定数（ms）。この時間で目標との差が 1/e になる
export const SPEED_RESPONSE_MS = 1000;

/**
 * 期間 years 年のデータで、1 フレーム（MAX_DELTA_MS）に進みうる progress の最大（内側の周、下りの上限の倍率）。
 * 出来事のキャプションの「位置が飛んだ」の判定（ANNOT.caption.maxStepProgress）に使う。
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
	contourLabelBg: 'rgba(11, 23, 51, 0.72)'
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
	floor: { size: 800 },
	// GridHelper を 2 枚：細 10 単位ごと、太 50 単位ごと
	gridFine: { divisions: 80, y: 0.01 },
	gridBold: { divisions: 16, y: 0.02 },
	gridOpacity: 0.8,
	camera: { near: 0.1, far: 1000 },
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
	// 構図は view.js が、螺旋の点（curtain.js が view.setOverviewSubject で渡す、レールの上端と床の点）を画面に投影して決める：
	//   画面から HUD を避けた余白（px）を引いた範囲に、螺旋の外接矩形を収める（中央に置く）。
	//   ただし螺旋の幅・高さは画面の maxWidth・maxHeight（割合）まで。
	//   モードは hud.css と同じ：short（高さ 520 以下かつ横長）／ narrow（幅 720 以下）／ medium（721〜1023。M）／ wide（L）。
	//   余白は、サンプルデータでは frame.insets[ モード ]、実データ（dataset.meta.kind === 'real'）では
	//   出来事のキャプションを避けた frame.captionInsets[ モード ]（キャプションは実データのときだけ出る）。
	// 螺旋の点がまだ無いときは、従来の式（target から距離 radius / sin( min( vfov, hfov ) / 2 )）。
	overview: {
		target: { x: 0, y: 15, z: 0 },
		elevationDeg: 48,
		radius: 110,
		fovLandscape: 50, // 横長の画面の縦画角
		fovPortrait: 65, // 縦長の画面の縦画角
		frame: {
			// サンプルデータ（キャプションなし。帯の下にバッジがある）
			insets: {
				// L/M：上は凡例（サンプルのバッジ込みで 176）の下、下は端から少しだけ（ミニグラフと路線図は左右の隅で、輪の下端は細い）
				wide: { top: 184, right: 24, bottom: 40, left: 24 },
				medium: { top: 184, right: 24, bottom: 40, left: 24 },
				// S：上は帯 + バッジ + 凡例（138）、下はミニグラフ・路線図（下から 196）の上
				narrow: { top: 148, right: 12, bottom: 206, left: 12 },
				// 短い横長：上は帯（80）の下。左右のパネルは隅にあり、輪の上端の幅は中央の空きに収まる
				short: { top: 88, right: 24, bottom: 12, left: 24 }
			},
			// 実データ（バッジなし。出来事のキャプションが出る。キャプションの位置は hud.css と annotations.css）
			captionInsets: {
				// L：上は凡例（144）の下。下は下中央のキャプション（下から 24 + 高さ最大 約 96）の上
				wide: { top: 152, right: 24, bottom: 136, left: 24 },
				// M：俯瞰のあいだ、キャプションは凡例の下（上から 152、高さ最大 約 92。annotations.css）へ移るので、上をその下に
				medium: { top: 256, right: 24, bottom: 40, left: 24 },
				// S：上は帯 + 凡例（110）の下。下はキャプション（下から 204 + 高さ最大 約 100）の上
				narrow: { top: 118, right: 12, bottom: 312, left: 12 },
				// 短い横長：俯瞰のあいだ、キャプションは左の列（凡例の下、ミニグラフの上。幅 220。annotations.css）へ移るので、左を空ける
				short: { top: 88, right: 24, bottom: 12, left: 260 }
			},
			maxWidth: { wide: 0.9, medium: 0.9, narrow: 0.8, short: 0.9 },
			maxHeight: { wide: 0.72, medium: 0.72, narrow: 0.9, short: 0.9 }
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

// CONTOUR：等高線と値ラベルの定数（刻み、外側へのずらし、ラベルの大きさ・配置の駅番号など）。担当：高さ目盛り。
// 色は PALETTE.contour と HUD_COLORS（contourLabel、contourLabelBg）。
export const CONTOUR = {
	// 等高線：1 万円刻み。駅の多角形を外側へ offset ずらした輪。5 万円の倍数の線だけ少し強くする
	stepYen: 10000,
	offset: 1.5,
	line: { opacity: 0.55, strongOpacity: 0.85, strongEveryYen: 50000 },
	// 値ラベル（Sprite）：テクスチャは値ごとに 1 枚。fontPx は pillHeight に対する文字の大きさ（画面上の文字の高さの基準）
	label: {
		// ピルの幅は文字の幅 + 左右の padding（狭い画面でも置けるよう、仕様の 384 固定より詰める）
		pillHeight: 96, padding: 38, radius: 48, border: 2, fontPx: 56,
		// 一人称のラベルは、等高線の輪からさらに extraOffset 外の輪に置く。y は等高線 + lift
		extraOffset: 3,
		lift: 0.9
	},
	// 画面上の文字の高さ（px）。実行時のカメラの距離・画角と表示サイズから、Sprite の大きさ（ワールド単位）を決める
	// ride：基準距離 rideDistance にあるラベルの文字の高さ（近づくほど大きく、遠いほど小さい。fog で霞む）
	// overview：俯瞰では距離によらずこの高さにそろえる（幅 compactMaxWidth 以下の画面は compact）
	textPx: { ride: 14, overview: 15, overviewCompact: 14 },
	rideDistance: 25,
	compactMaxWidth: 720,
	// 一人称：カメラに近いラベル（駅名など。値ラベルは ride.minDistance）は薄くして消す（hideBelow 以下で 0、fullAbove 以上で 1）
	nearFade: { hideBelow: 8, fullAbove: 18 },
	// 一人称：遠いラベル（駅名など。値ラベルは ride.maxDistance）は消す（fadeStart から薄くなり、hideAbove 以上で 0）
	farFade: { fadeStart: 45, hideAbove: 75 },
	// 俯瞰：駅名（床の高さ、輪の外側）。priority の順に置き、compact では maxCompact 個まで
	stationNames: {
		priority: [ '東京', '新宿', '池袋', '品川', '渋谷', '上野', '大崎' ],
		maxCompact: 4,
		y: 0.3,
		offset: 8
	},
	// 一人称の値ラベル：いまの高さを挟む上下の等高線に 1 つずつ。置き場所の候補は、ラベルの輪の各辺を subdivisions 等分した点。
	// カメラから minDistance より近い場所、maxDistance より遠い場所、画面の端から insetPx 以内は使わない。
	// 文字の高さは、距離によらず minTextPx〜maxTextPx に収める（遠くても 10px 未満にしない、近くても大きくしすぎない）。
	// 奥行き idealDepth に近く、画面の中央に近い（centerWeight）ほど良い
	ride: { minTextPx: 10, maxTextPx: 18, minDistance: 7, maxDistance: 70, subdivisions: 6, idealDepth: 24, centerWeight: 10, insetPx: 8 },
	// 俯瞰の値ラベルの軸：輪の 1 点（アンカー）から、各等高線へ引き出し線（長さ leaderPx + leaderExtraPx のどれか。端の横線 stubPx）を出し、
	// ラベルを縦に並べる。ラベルの間は gapPx 以上。画面の端から insetPx 内側。HUD・年ラベルとの隙間 margin。
	// 列は、空いた場所を探して上下に shiftPx 刻みで shiftSteps 段までずらせる。選ぶときの重み：
	//   shiftWeight：ずらした 1px あたり（ラベル 1 つごと）、extraWeight：引き出し線を延ばした 1px あたり、
	//   preferUpper：アンカーが画面の下にあるほど、inwardPenalty：列を輪の内側へ出すとき、railWeight：レールにかぶる点 1 つあたり
	axis: {
		leaderPx: 34, leaderPxCompact: 24, leaderExtraPx: [ 0, 40, 90 ], stubPx: 7, gapPx: 4, insetPx: 8, margin: 6,
		shiftPx: 16, shiftSteps: 16,
		shiftWeight: 0.5, extraWeight: 1, preferUpper: 400, inwardPenalty: 300, railWeight: 60,
		leaderOpacity: 0.9
	},
	// 俯瞰：駅名・HUD のパネルとの最小の隙間（px）
	declutter: { margin: 4 },
	// 表示・非表示の切り替えのなめらかさ（時定数 ms）
	fadeMs: 110
};

// ANNOT：イベント注釈の定数（目印の大きさ、キャプションの表示時間、イベント一覧の置き場所など）。担当：イベント注釈。
export const ANNOT = {
	// 出来事の一覧（data/events.json）。実データ（dataset.meta.kind === 'real'）のときだけ読む
	eventsUrl: './data/events.json',
	// キャプション（時間はすべて ride の時間 state.timeMs。一時停止中は進まない）
	caption: {
		showMs: 6000, // 表示時間
		showMsReduced: 8000, // prefers-reduced-motion: reduce のとき
		minShowMs: 3000, // 表示中に次の出来事が来たとき、入れ替えるまでに最低限見せる時間
		maxWaitMs: 3000, // 通過してからこれ以上待たされた出来事は、画面の位置と合わなくなるので出さない
		outMs: 180, // 出（入れ替えるとき、次を出す前にフェードアウトを待つ時間。実時間）
		// 1 フレームで進みうる progress の最大の 2 倍。これより大きい変化は「位置が飛んだ」とみなし、飛び越えた出来事を出さない。
		// progress あたりの速さはデータの期間で変わるので、データごとに maxProgressPerFrame( curve.years ) × 2 を使うのが正しい。
		// この既定値は、想定する最も短いデータ（30 年）の値（短いほど大きい = 判定がゆるい側）
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
