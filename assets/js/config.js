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
// 速度の変化量 = 高さ勾配 × 係数 × delta（ms）。60fps のとき 1 フレームで 勾配 × 1e-7。
export const GRAVITY = 0.0000001 / FRAME_MS; // 6e-9
// 向きの補間：60fps で 1 フレームあたり 8% 目標へ近づく
export const ORIENTATION_BLEND_PER_FRAME = 0.08;
// 開始位置（0 = 大崎、1990 年 1 月）
export const START_PROGRESS = 0;
// 勾配（y / t）をレール方向ベクトルの y 成分へ変換する係数
export const RAIL_SLOPE_VISUAL_SCALE = 0.0009;

// ---- カメラ ----
// 画角・カメラの位置・俯瞰の視点は SCENE（下）にある
export const TRAIN_RAIL_OFFSET = 0.3; // レール上面から車体の位置までの高さ

// ---- ジオメトリの分割数 ----
export const RAIL_DIVISIONS = 1500;
export const LIFTER_DIVISIONS = 100;
export const SHADOW_DIVISIONS = 500;

// ---- 配色 ----
export const COLORS = {
	background: 0xf0f0ff,
	hemisphereSky: 0xfff0f0,
	hemisphereGround: 0x60606,
	ground: 0x407000,
	sky: 0xffffff,
	shadow: 0x305000,
	marker: 0xff3333,
	funfairA: 0xff8080,
	funfairB: 0x8080ff
};

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
	bg2: '#142650',
	panel: 'rgba(11, 23, 51, 0.90)',
	panelBorder: 'rgba(150, 170, 220, 0.22)',
	text1: '#eef2fb',
	text2: '#b4bfd9',
	text3: '#96a3c4', // 軸目盛り・脚注（これより暗い文字色は作らない）
	accentText: '#f2b84b',
	ridden: '#c98500', // 走行済み
	ahead: '#7080a8', // これから（文脈線）
	deadhead: '#7080a8', // 回送（破線 4/3 で区別）
	marker: '#d55181', // 現在位置（白い輪 1.5px を必ず付ける）
	markerRing: '#ffffff',
	event: '#2f97d8', // イベント注釈の目印
	plotGrid: '#24365f', // グラフのグリッド（細線）
	plotAxis: '#3a4b75', // 基線
	contour: '#6d8ccf', // 等高線
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
	// 俯瞰：target から南（+z）へ仰角 elevationDeg、距離 radius / sin( min( vfov, hfov ) / 2 )
	overview: {
		target: { x: 0, y: 15, z: 0 },
		elevationDeg: 55,
		radius: 110,
		fovLandscape: 50, // 横長の画面の縦画角（1440x900 で距離 260）
		fovPortrait: 65 // 縦長の画面の縦画角
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
		radius: 2.5, widthSegments: 24, heightSegments: 16, // 球
		ringInner: 3.2, ringOuter: 3.7, ringSegments: 48, // カメラに向く白い輪
		ringOpacity: 0.9, ringOpacityMin: 0.4, pulseMs: 1600, // 脈動 0.9 → 0.4 → 0.9（reduced-motion では 0.9 のまま）
		lineOpacity: 0.35 // 床までの白い縦線
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
		// 配置する駅の番号。等高線の輪からさらに extraOffset 外へ、y は等高線 + lift
		stations: [ 0, 5, 10, 15, 20, 25 ],
		// 俯瞰で、上の駅に置けなかった等高線のためだけに使う予備の駅（狭い画面で、7 本の等高線に 1 つずつ付けるため）
		spareStations: [ 2, 8, 13, 17, 22, 27, 3, 14 ],
		// 予備の駅のうち先頭の何か所を、一人称でも使うか（前方にラベルが途切れないよう、駅の間隔を詰める）
		rideSpareCount: 6,
		extraOffset: 3,
		lift: 0.9
	},
	// 画面上の文字の高さ（px）。実行時のカメラの距離・画角と表示サイズから、Sprite の大きさ（ワールド単位）を決める
	// ride：基準距離 rideDistance にあるラベルの文字の高さ（近づくほど大きく、遠いほど小さい。fog で霞む）
	// overview：俯瞰では距離によらずこの高さにそろえる（幅 compactMaxWidth 以下の画面は compact）
	textPx: { ride: 14, overview: 15, overviewCompact: 14 },
	rideDistance: 25,
	compactMaxWidth: 720,
	// 一人称：カメラに近いラベルは薄くして消す（hideBelow 以下で 0、fullAbove 以上で 1）
	nearFade: { hideBelow: 8, fullAbove: 18 },
	// 一人称：遠いラベルは消す（fadeStart から薄くなり、hideAbove 以上で 0。基準距離で文字が 14px なら、75 で 5px）
	farFade: { fadeStart: 45, hideAbove: 75 },
	// 俯瞰：駅名（床の高さ、輪の外側）。priority の順に置き、compact では maxCompact 個まで
	stationNames: {
		priority: [ '東京', '新宿', '池袋', '品川', '渋谷', '上野', '大崎' ],
		maxCompact: 4,
		y: 0.3,
		offset: 8
	},
	// 俯瞰：ラベル・駅名・HUD のパネルが重ならないよう、優先順に置いて重なるものを間引く
	// margin：ラベルどうし・HUD との最小の隙間（px）。maxPerLevel：1 本の等高線あたりの値ラベルの上限
	declutter: { margin: 4, maxPerLevel: 6, maxPerLevelCompact: 3 },
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
		railSlopeVisualScale: 0.0003, // RAIL_SLOPE_VISUAL_SCALE 0.0009 の代わり（傾きを 1/3 に）
		orientationBlendPerFrame: 0.04, // ORIENTATION_BLEND_PER_FRAME 0.08 の代わり
		speedMaxFactor: 0.5 // SPEED_MAX に掛ける
	}
};
