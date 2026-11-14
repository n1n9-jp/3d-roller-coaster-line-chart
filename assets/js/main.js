// 起動処理：データ読み込み → 共有 ctx の作成 → 機能モジュールの生成 → ループ開始。
// ここは「ctx を作る」「MODULES を順に生成する」「毎フレーム update を呼ぶ」だけ。機能のロジックは書かない。
// ctx / state / モジュールのフックの決まりは README の「開発」を参照。

import * as config from './config.js';
import { MAX_DELTA_MS, MOVING_AVERAGE_WINDOW } from './config.js';
import { loadData, buildDataset, datasetIdFromSearch, LocalDataMissingError, pointAtIndex } from './data.js';
import { TrackCurve } from './track.js';
import { createEvents } from './events.js';
import { createScene } from './scene.js';
import { createRide } from './ride.js';
import { createView } from './view.js';
import { createStartScreen } from './ui/start.js';
import { createSoundPref } from './sound-pref.js';
import { chooseDemoRange, demoStillProgress } from './demo.js';

import { createEnvironment } from './environment.js';
import { createRail } from './rail.js';
import { createRailColors } from './rail-colors.js';
import { createCurtain } from './curtain.js';
import { createScale } from './scale.js';
import { createMarkers } from './markers.js';
import { createReadout } from './hud/readout.js';
import { createLegend } from './hud/legend.js';
import { createChart } from './hud/chart.js';
import { createMap } from './hud/map.js';
import { createAnnotations } from './hud/annotations.js';
import { createButtons } from './ui/buttons.js';
import { createEndScreen } from './ui/endscreen.js';
import { createInfoPanel } from './ui/infopanel.js';
import { createControls } from './controls.js';
import { createSound } from './sound.js';

// 機能モジュールの登録。1 モジュール 1 行。上から順に create( ctx ) を呼び、毎フレーム同じ順に update( state ) を呼ぶ。
// 他のモジュールが作る scene のオブジェクトを使うモジュールは、それより下に置く。
const MODULES = [
	createEnvironment, // 3D：地形・木・空
	createRail, // 3D：レール・支柱・影・現在位置マーカー（scene の 'rail' など）
	createRailColors, // 3D：レールの色分け
	createCurtain, // 3D：レールの下のカーテンと、俯瞰のときのレール上端の帯（俯瞰の構図の点も view に渡す）
	createScale, // 3D：等高線と値ラベル
	createMarkers, // 3D：イベントの目印
	createReadout, // HUD：現在値の帯
	createLegend, // HUD：凡例
	createChart, // HUD：ミニグラフ
	createMap, // HUD：螺旋の図
	createAnnotations, // HUD：イベントのキャプション
	createButtons, // UI：操作ボタン
	createEndScreen, // UI：終了画面
	createInfoPanel, // UI：情報パネル
	createControls, // キーボード
	createSound // 音：データに連動するアンビエントサウンド（Web Audio）
];

// 起動の途中で例外が出たときに、スタート画面へエラーを出すための参照（boot の外の catch が使う）
let startScreen = null;
let sceneParts = null;

async function boot() {

	// 音の設定は、スタート画面（データの読み込み前）でも使うので、events と一緒に最初に作る
	const events = createEvents();
	const sound = createSoundPref( { events } );

	startScreen = createStartScreen( { sound, events } );
	// どのデータか（<html data-dataset>）。読み込みの前に、URL から決めておく（読み込み中・エラーの表示にも使える）
	document.documentElement.dataset.dataset = datasetIdFromSearch( window.location.search );
	startScreen.showLoading();

	try {

		sceneParts = createScene();

	} catch ( error ) {

		console.error( error );
		startScreen.showError( 'webgl' );
		return;

	}

	let loaded;
	try {

		loaded = await loadData();

	} catch ( error ) {

		console.error( error );
		startScreen.showError( error instanceof LocalDataMissingError ? 'local' : 'data' );
		return;

	}

	const { renderer, scene, camera, train } = sceneParts;

	// 表示値・グラフは生データ（dataset.raw）、レールの形は移動平均後（dataset.smoothed）
	// dataset.id・def（config.js の DATASETS の 1 件）・meta・format（値の書式。format.js）も持つ
	const dataset = buildDataset( loaded.series, MOVING_AVERAGE_WINDOW, loaded.meta, loaded.def );
	// コースは螺旋（角度は日付、進行位置は時間に比例。track.js）
	const curve = new TrackCurve( dataset.smoothed );

	const ride = createRide( curve, events );
	const view = createView( { scene, camera, train, events, curve, ride } );

	// どのデータか（'usdjpy' | 'jgb10' | 'nikkei'）。CSS が html[data-dataset] を見る
	document.documentElement.dataset.dataset = dataset.id;

	const liveRegion = document.getElementById( 'live-region' );
	const ui = {
		hud: document.getElementById( 'hud' ),
		slots: {
			readout: document.getElementById( 'hud-readout' ),
			legend: document.getElementById( 'hud-legend' ),
			controls: document.getElementById( 'hud-controls' ),
			chart: document.getElementById( 'hud-chart' ),
			map: document.getElementById( 'hud-map' ),
			caption: document.getElementById( 'hud-caption' )
		},
		endScreen: document.getElementById( 'end-screen' ),
		infoPanel: document.getElementById( 'info-panel' ),
		liveRegion,
		/** スクリーンリーダー向けの読み上げ（#live-region、polite）。 */
		announce( text ) {

			liveRegion.textContent = '';
			// 同じ文言でも読み上げ直されるよう、いったん空にしてから次のフレームで入れる
			requestAnimationFrame( () => {

				liveRegion.textContent = text;

			} );

		},
		startScreen
	};

	const ctx = { renderer, scene, camera, train, dataset, curve, ride, view, ui, events, config, sound };

	// ---- 状態（毎フレーム、全モジュールへ同じものを渡す）----
	let nowMs = 0;
	let deltaMs = 0;
	let timeMs = 0;
	let shownYear = null;

	// 'viewchange' と 'restart' は、モジュールの生成より前に購読する。events は登録順に呼ぶので、
	// main.js の onViewChange・onReset の配信が、各モジュールが自分で購読したハンドラより先になる。
	// 生成の途中で発行されても参照できるよう、modules は先に宣言しておく（生成が終わるまでは空）
	let modules = [];
	events.on( 'viewchange', ( { view: next } ) => callHook( 'onViewChange', next ) );
	events.on( 'restart', () => {

		timeMs = 0;
		shownYear = null;
		callHook( 'onReset' );

	} );

	modules = MODULES.map( ( create ) => {

		const entry = { name: create.name, hooks: {}, failed: false };
		try {

			entry.hooks = create( ctx ) ?? {};

		} catch ( error ) {

			console.error( `${create.name} の生成に失敗しました`, error );
			entry.failed = true;

		}

		return entry;

	} );

	/** 1 つのモジュールが例外を投げても、他のモジュールは動かし続ける（そのモジュールは以後呼ばない）。 */
	function callHook( name, ...args ) {

		for ( const entry of modules ) {

			if ( entry.failed || typeof entry.hooks[ name ] !== 'function' ) continue;
			try {

				entry.hooks[ name ]( ...args );

			} catch ( error ) {

				console.error( `${entry.name}.${name} で例外`, error );
				entry.failed = true;

			}

		}

	}

	// 乗車前は、スタート画面の背景でデモ走行を見せる（一人称。値の動きが大きい約 6 年。demo.js）。
	// 乗車すると ride.start() が最初の週へ戻してから始める。prefers-reduced-motion では、区間の途中の 1 コマで止めて見せる
	const demoRange = chooseDemoRange( curve );
	const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
	if ( reducedMotion ) {

		const still = demoStillProgress( demoRange );
		ride.startDemo( { from: still, to: still } );

	} else {

		ride.startDemo( demoRange );

	}

	// 開始前も、車体を走行の位置（デモの位置）に置いておく
	train.position.copy( ride.position );
	train.quaternion.copy( ride.quaternion );

	function makeState() {

		const progress = ride.progress;
		const dataIndex = curve.progressToIndex( progress );
		return {
			progress,
			deltaMs,
			timeMs,
			nowMs,
			paused: ride.paused,
			started: ride.started,
			finished: ride.finished,
			view: view.current,
			dataIndex,
			point: pointAtIndex( dataset.raw, dataIndex )
		};

	}

	let prevTime = null;

	function frame( time ) {

		const frameDelta = prevTime === null ? 0 : Math.min( Math.max( time - prevTime, 0 ), MAX_DELTA_MS );
		prevTime = time;

		nowMs = time;
		deltaMs = ride.started && ! ride.paused && ! ride.finished ? frameDelta : 0;
		timeMs += deltaMs;

		ride.update( frameDelta );

		train.position.copy( ride.position );
		train.quaternion.copy( ride.quaternion );

		const state = makeState();

		if ( state.started && state.point ) {

			const year = Number( state.point.date.substring( 0, 4 ) );
			if ( year !== shownYear ) {

				shownYear = year;
				events.emit( 'yearchange', { year, point: state.point, dataIndex: state.dataIndex } );

			}

		}

		callHook( 'update', state );
		renderer.render( scene, camera );

	}

	// すべて組み上がってからループを始める
	renderer.setAnimationLoop( frame );

	startScreen.ready( () => ride.start() );

	// デバッグ用の口：URL に ?debug が付いているときだけ公開する
	if ( new URLSearchParams( window.location.search ).has( 'debug' ) ) {

		window.__coaster = {
			getState: makeState,
			setProgress( t ) {

				ride.progress = t;
				ride.updatePose( 1 );

			},
			pause: () => ride.pause(),
			resume: () => ride.resume(),
			restart: () => ride.restart(),
			setView: ( v ) => view.setView( v ),
			// 音（sound.js）：getState() と検証用の engine
			sound: modules.find( ( entry ) => entry.name === 'createSound' )?.hooks.debug ?? null,
			ride,
			// デモ走行の区間（demo.js の chooseDemoRange の戻り値）
			demo: demoRange,
			ctx
		};

	}

}

// データ読み込みより後の組み立て（レールの生成など）で例外が出ても、「読み込み中」のまま止めない。
// スタート画面がまだ無いとき（createStartScreen 自体の失敗）は、そのまま投げ直して index.html のフォールバックに任せる。
boot().catch( ( error ) => {

	console.error( error );
	if ( ! startScreen ) throw error;
	sceneParts?.renderer.setAnimationLoop( null );
	startScreen.showError( 'boot' );

} );
