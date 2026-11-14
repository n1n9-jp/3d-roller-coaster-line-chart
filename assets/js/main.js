// 起動処理：データ読み込み → 共有 ctx の作成 → 機能モジュールの生成 → ループ開始。
// ここは「ctx を作る」「MODULES を順に生成する」「毎フレーム update を呼ぶ」だけ。機能のロジックは書かない。
// 契約（ctx / state / モジュールのフック）は specs/contract.md。

import * as config from './config.js';
import { MAX_DELTA_MS, MOVING_AVERAGE_WINDOW } from './config.js';
import { loadData, buildDataset, LocalDataMissingError } from './data.js';
import { TrackCurve } from './track.js';
import { pointAtIndex } from './loop.js';
import { createEvents } from './events.js';
import { createScene } from './scene.js';
import { createRide } from './ride.js';
import { createView } from './view.js';
import { createStartScreen } from './ui/start.js';

import { createEnvironment } from './environment.js';
import { createRail } from './rail.js';
import { createRailColors } from './rail-colors.js';
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

// 機能モジュールの登録。1 モジュール 1 行。上から順に create( ctx ) を呼び、毎フレーム同じ順に update( state ) を呼ぶ。
// 他のモジュールが作る scene のオブジェクトを使うモジュールは、それより下に置く。
const MODULES = [
	createEnvironment, // 3D：地形・木・空
	createRail, // 3D：レール・支柱・影・現在位置マーカー（scene の 'rail' など）
	createRailColors, // 3D：レールの色分け
	createScale, // 3D：等高線と値ラベル
	createMarkers, // 3D：イベントの目印
	createReadout, // HUD：現在値の帯
	createLegend, // HUD：凡例
	createChart, // HUD：ミニグラフ
	createMap, // HUD：路線図
	createAnnotations, // HUD：イベントのキャプション
	createButtons, // UI：操作ボタン
	createEndScreen, // UI：終了画面
	createInfoPanel, // UI：情報パネル
	createControls // キーボード
];

async function boot() {

	const startScreen = createStartScreen();
	startScreen.showLoading();

	let sceneParts;
	try {

		sceneParts = createScene();

	} catch ( error ) {

		console.error( error );
		startScreen.showError( 'お使いのブラウザでは WebGL が使えないため、表示できません。' );
		return;

	}

	let loaded;
	try {

		loaded = await loadData();

	} catch ( error ) {

		console.error( error );
		startScreen.showError( error instanceof LocalDataMissingError
			? '実データがまだありません。npm run fetch-data を実行してから、再読み込みしてください。（URL の ?data=local を外すとサンプルデータで動きます）'
			: 'データの読み込みに失敗しました。時間をおいて再読み込みしてください。' );
		return;

	}

	const { renderer, scene, camera, train } = sceneParts;
	const { stations } = loaded;

	// 表示値・グラフは生データ（dataset.raw）、レールの形は移動平均後（dataset.smoothed）
	const dataset = buildDataset( loaded.nikkei, MOVING_AVERAGE_WINDOW, loaded.meta );
	const curve = new TrackCurve( stations, dataset.smoothed );

	const events = createEvents();
	const ride = createRide( curve, events );
	const view = createView( { scene, camera, train, events } );

	// データの種類（'sample' | 'real'）。CSS が html[data-kind] を見る。meta は loadData が必ず返す
	document.documentElement.dataset.kind = dataset.meta.kind;

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

	const ctx = { renderer, scene, camera, train, dataset, stations, curve, ride, view, ui, events, config };

	const modules = MODULES.map( ( create ) => {

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

	// 開始前も、1990 年 1 月の位置に車体を置いておく
	train.position.copy( ride.position );
	train.quaternion.copy( ride.quaternion );

	// ---- 状態（毎フレーム、全モジュールへ同じものを渡す）----
	let nowMs = 0;
	let deltaMs = 0;
	let timeMs = 0;
	let shownYear = null;

	function makeState() {

		const progress = ride.progress;
		const dataIndex = curve.progressToIndex( progress );
		return {
			progress,
			phase: curve.isLink( progress ) ? 'link' : 'data',
			deltaMs,
			timeMs,
			nowMs,
			paused: ride.paused,
			started: ride.started,
			finished: ride.finished,
			view: view.current,
			dataIndex,
			point: dataIndex === null ? null : pointAtIndex( dataset.raw, dataIndex )
		};

	}

	events.on( 'viewchange', ( { view: next } ) => callHook( 'onViewChange', next ) );
	events.on( 'restart', () => {

		timeMs = 0;
		shownYear = null;
		callHook( 'onReset' );

	} );

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
			ride,
			ctx
		};

	}

}

boot();
