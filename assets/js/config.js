// 定数の置き場。数値の意味をここに集め、他のモジュールには直書きしない。

// ---- 時間 ----
// 速度・補間係数はすべて「60fps の 1 フレーム」を基準に決めた値を、
// ミリ秒あたりに換算して使う。
export const FRAME_MS = 1000 / 60;
// タブ復帰などで delta が大きくなったときの飛びを防ぐ上限
export const MAX_DELTA_MS = 100;

// ---- データ ----
export const NIKKEI_URL = './data/nikkei225.json';
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
