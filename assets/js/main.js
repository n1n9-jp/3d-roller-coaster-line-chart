// 起動処理：データ読み込み → 各モジュールの組み立て → ループ開始。

import { loadData, buildDataset } from './data.js';
import { TrackCurve } from './track.js';
import { createScene } from './scene.js';
import { createEnvironment } from './environment.js';
import { createRail } from './rail.js';
import { createRide } from './ride.js';
import { createView } from './view.js';
import { createControls } from './controls.js';
import { createChart } from './hud/chart.js';
import { createMap } from './hud/map.js';
import { createReadout } from './hud/readout.js';
import { createStartScreen } from './start-screen.js';

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
		startScreen.showError( 'データの読み込みに失敗しました。時間をおいて再読み込みしてください。' );
		return;

	}

	const { renderer, scene, camera, train } = sceneParts;
	const { stations } = loaded;

	// 表示値・グラフは生データ（dataset.raw）、レールの形は移動平均後（dataset.smoothed）
	const dataset = buildDataset( loaded.nikkei );
	const curve = new TrackCurve( stations, dataset.smoothed );

	const environment = createEnvironment( scene );
	const { positionMarker } = createRail( scene, curve );

	const ride = createRide( curve );
	const view = createView( { scene, camera, train } );
	createControls( ( { overview, paused } ) => {

		view.setOverview( overview );
		ride.paused = paused;

	} );

	const chart = createChart( document.getElementById( 'graphCanvas' ), dataset );
	const map = createMap( document.getElementById( 'mapCanvas' ), stations, curve.seg );
	const readout = createReadout( document.getElementById( 'year-display' ), dataset );

	// 開始前も、1990 年 1 月の位置に車体を置いておく
	train.position.copy( ride.position );
	train.quaternion.copy( ride.quaternion );

	let prevTime = null;

	function frame( time ) {

		const delta = prevTime === null ? 0 : time - prevTime;
		prevTime = time;

		environment.update( time );
		ride.update( delta );

		train.position.copy( ride.position );
		train.quaternion.copy( ride.quaternion );
		positionMarker.position.copy( ride.position );
		positionMarker.visible = view.isOverview;

		renderer.render( scene, camera );

		if ( ride.started ) {

			chart.draw( ride.progress );
			map.draw( ride.progress );
			readout.update( ride.progress );

		}

	}

	// すべて組み上がってからループを始める
	renderer.setAnimationLoop( frame );

	startScreen.ready( () => {

		ride.started = true;
		// START 直後の 1 フレーム目から年表示を出す
		readout.update( ride.progress );

	} );

}

boot();
