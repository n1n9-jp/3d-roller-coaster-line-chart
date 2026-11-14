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
export const CAMERA_FOV = 50;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 500;
export const TRAIN_RAIL_OFFSET = 0.3; // レール上面から車体の位置までの高さ
export const CAMERA_HEIGHT = 0.3; // 車体からカメラまでの高さ
export const OVERVIEW_POSITION = { x: 0, y: 200, z: 0 };

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

// ---- HUD（2D canvas）----
export const HUD = {
	size: 200, // CSS px
	panelBackground: '#ffffff',
	graphLine: '#0066cc',
	graphGrid: '#eee',
	mapLine: '#00aa00',
	marker: '#ff3333',
	text: '#333',
	font: '10px "Noto Sans", sans-serif'
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
export const LOOP = { linkFraction: 0 };

// ---- 以下は空の節。各担当が自分の節にだけ値を足す ----

// SCENE：3D シーンの定数（fog の near/far、背景グラデーション、ライトの強さ、一人称・俯瞰の画角と距離など）。担当：シーン。
export const SCENE = {};

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
export const CONTOUR = {};

// ANNOT：イベント注釈の定数（目印の大きさ、キャプションの表示時間、イベント一覧の置き場所など）。担当：イベント注釈。
export const ANNOT = {};

// MOTION：動きの定数（視点切り替えの補間時間、脈動の周期、reduced-motion 時の係数など）。担当：シーン・操作。
export const MOTION = {};
