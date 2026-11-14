// 定数の置き場。数値の意味をここに集め、他のモジュールには直書きしない。

// ---- 時間 ----
// 速度・補間係数はすべて「60fps の 1 フレーム」を基準に決めた値を、
// ミリ秒あたりに換算して使う。
export const FRAME_MS = 1000 / 60;
// タブ復帰などで delta が大きくなったときの飛びを防ぐ上限
export const MAX_DELTA_MS = 100;

// ---- データ ----
// 既定は同梱のサンプルデータ（合成。実際の日経平均ではない）。
// URL に ?data=local を付けると、npm run fetch-data で作った実データ（data/local/）を読む。
export const DATA_SOURCES = {
	sample: {
		nikkei: './data/nikkei225.json',
		meta: './data/nikkei225.meta.json'
	},
	local: {
		nikkei: './data/local/nikkei225.json',
		meta: './data/local/meta.json'
	}
};
export const YAMANOTE_URL = './data/train-yamanote.json';
// レール形状に使う移動平均の窓（週数）。HUD の表示値は移動平均をかけない生データ。
export const MOVING_AVERAGE_WINDOW = 4;

// ---- 座標 ----
// 山手線の経緯度を three.js のワールド座標（x：東、z：南）へ写す
export const GEO_CENTER = { lon: 139.739138, lat: 35.678777 };
export const GEO_SCALE = 1500;

// レールの高さ（ワールド座標の y）の範囲。移動平均後の系列の最小・最大に対応する。
export const Y_MIN = 3;
export const Y_MAX = 35;

// ---- 走行 ----
// progress は 0..1（1 周 = 1）。以下は 1 ミリ秒あたりの progress の増分。
// 元の値（60fps の 1 フレームあたり）を FRAME_MS で割って換算している。
export const SPEED_MIN = 0.00006 / FRAME_MS; // 3.6e-6 /ms（1 周 約 278 秒）
export const SPEED_MAX = 0.0003 / FRAME_MS; // 1.8e-5 /ms
export const SPEED_INITIAL = SPEED_MIN;
// 速度は、勾配から決まる「目標の速度」へ一次遅れで近づく（ride.js）。
//   目標 = SPEED_CRUISE × exp( - GRAVITY × 高さ勾配 )（SPEED_MIN..上限に収める）
//   速度 ← 目標 + ( 速度 - 目標 ) × exp( - delta / SPEED_RESPONSE_MS )
// 平らなところで SPEED_CRUISE、下り（勾配が負）で速く、上りで遅くなる。勾配はデータの週ごとの揺れで細かく変わるので、
// 一次遅れでならし、長い下り・上りでだけ速度がはっきり変わるようにする（1 周 約 150〜160 秒）。
export const SPEED_CRUISE = 5e-6; // /ms（平らなところの速度）
// 高さ勾配 dy/dt（ワールドの y / progress）1 あたりの、目標の速度の対数の変化。勾配 ±230（中央値くらい）で 約 2 倍 / 半分
export const GRAVITY = 0.003;
// 一次遅れの時定数（ms）。この時間で目標との差が 1/e になる
export const SPEED_RESPONSE_MS = 1000;
// 向きの補間：60fps で 1 フレームあたり 8% 目標へ近づく
export const ORIENTATION_BLEND_PER_FRAME = 0.08;
// 開始位置（0 = 大崎、1990 年 1 月）
export const START_PROGRESS = 0;
// 車体の傾き：レールの実際の勾配（dy / 水平の長さ = 高さ勾配 / 周長 curve.seg.totalLength）に対する比率。
// 1 でレールと同じ傾き。小さくすると、急な上り下りで前方のレールが画面の上下へ外れる
export const RAIL_SLOPE_RATIO = 0.7;
// 車体の傾きに使う勾配：進行位置の前後この長さ（水平。ワールドの単位）の弦の勾配
export const RAIL_SLOPE_WINDOW = 5;

// ---- カメラ ----
// 画角・カメラの位置・俯瞰の視点は SCENE（下）にある
export const TRAIN_RAIL_OFFSET = 0.3; // レール上面から車体の位置までの高さ

// ---- ジオメトリの分割数 ----
export const RAIL_DIVISIONS = 1500;
export const LIFTER_DIVISIONS = 100;
export const SHADOW_DIVISIONS = 500;

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
	railDeadheadWhite: 0x6c7899, // レール：回送、白レール
	railDeadheadYellow: 0x3e4a6b, // レール：回送、黄色部
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

// ---- 周回 ----
// linkFraction：周回の最後に置く連絡区間（回送）が progress 全体に占める割合。
// 0 のあいだは連絡区間なし。連絡区間の担当が 0.03 にする。
// データ区間は progress 0 .. 1 - linkFraction（TrackCurve の dataEnd）。
// maxLinkPitchDeg：連絡区間の最大の傾斜角（度）の目標。超えるときは、両端の勾配をデータ側の勾配から直線の勾配へ近づけて収める
// （段差が大きすぎて直線でも超える場合は、直線にする）。
export const LOOP = { linkFraction: 0.03, maxLinkPitchDeg: 45 };

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
	// 構図は view.js が、輪の点（curtain.js が view.setOverviewSubject で渡す、レールの上端と床の点）を画面に投影して決める：
	//   画面から HUD を避けた余白（px）を引いた範囲に、輪の外接矩形を収める（中央に置く）。
	//   ただし輪の幅・高さは画面の maxWidth・maxHeight（割合）まで。
	//   モードは hud.css と同じ：short（高さ 520 以下かつ横長）／ narrow（幅 720 以下）／ medium（721〜1023。M）／ wide（L）。
	//   余白は、サンプルデータでは frame.insets[ モード ]、実データ（dataset.meta.kind === 'real'）では
	//   出来事のキャプションを避けた frame.captionInsets[ モード ]（キャプションは実データのときだけ出る）。
	// 輪の点がまだ無いときは、従来の式（target から距離 radius / sin( min( vfov, hfov ) / 2 )）。
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
// 色はすべて PALETTE（railAhead* / railRidden* / railDeadhead* / pillar / shadow / marker / markerRing / railEmissive）。
export const RAIL = {
	// レールの材質（MeshPhongMaterial、vertexColors。emissive は PALETTE.railEmissive）
	material: { shininess: 60, specular: 0x334466 },
	// 支柱（MeshPhongMaterial、色は PALETTE.pillar）。高さ 10 を超える地点は同梱ファイルが門型にする
	pillar: { shininess: 10, y: 0.1 },
	// 床の足跡（RollerCoasterShadowGeometry、MeshBasicMaterial、色は PALETTE.shadow）
	shadow: { opacity: 0.9, y: 0.05 },
	// 現在位置マーカー（俯瞰のときだけ表示）
	marker: {
		// 俯瞰のカメラは輪から約 220（以前は 260）。画面上の大きさを以前と同じにするため 0.85 倍にした
		radius: 2.1, widthSegments: 24, heightSegments: 16, // 球
		ringInner: 2.7, ringOuter: 3.15, ringSegments: 48, // カメラに向く白い輪
		ringOpacity: 0.9, ringOpacityMin: 0.4, pulseMs: 1600, // 脈動 0.9 → 0.4 → 0.9（reduced-motion では 0.9 のまま）
		lineOpacity: 0.35 // 床までの白い縦線
	},
	// カーテン（curtain.js）：レールの真下、床からレールの高さまでの縦の面。AdditiveBlending、depthWrite: false。
	// 頂点の alpha は上端 topAlpha → 床 bottomAlpha。材質の opacity は一人称 rideOpacity、俯瞰 overviewOpacity（補間に合わせて変える）。
	// 色：これから PALETTE.contour、走行済み PALETTE.railRiddenYellow、連絡区間 PALETTE.railDeadheadYellow（alpha × linkAlphaFactor）。
	// renderOrder：グリッド・足跡（0）より後に描く
	curtain: {
		topAlpha: 0.9,
		bottomAlpha: 0.06,
		linkAlphaFactor: 0.35,
		rideOpacity: 0.15,
		overviewOpacity: 1,
		renderOrder: 2
	},
	// 俯瞰のときだけの、レール上端の帯（床と平行。幅 width、レールの上 lift）。
	// 色：これから PALETTE.railAheadWhite、走行済み PALETTE.railRiddenWhite、連絡区間 PALETTE.railDeadheadWhite。
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
		// 1 フレームで進みうる progress の最大（MAX_DELTA_MS × SPEED_MAX）の 2 倍。これより大きい変化は「位置が飛んだ」とみなし、飛び越えた出来事を出さない
		maxStepProgress: 2 * MAX_DELTA_MS * SPEED_MAX
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
		speedMaxFactor: 0.5, // SPEED_MAX に掛ける
		gravityFactor: 0.5, // GRAVITY に掛ける（勾配による速度の変わり方を半分に）
		speedResponseMs: 2000 // SPEED_RESPONSE_MS 1000 の代わり（速度の変化をよりゆっくりに）
	}
};
