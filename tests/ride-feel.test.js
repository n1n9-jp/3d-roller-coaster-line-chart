// 走行の乗り心地と視点：一人称のカメラの高さ、速度の変わり方、フレームレートによる差（本番の設定）、俯瞰の構図の枠。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRide } from '../assets/js/ride.js';
import { createView, rideCameraPosition, overviewMode, overviewFrame, fitOverview, overviewFov } from '../assets/js/view.js';
import { TrackCurve } from '../assets/js/track.js';
import { buildDataset } from '../assets/js/data.js';
import { overviewSubjectPoints } from '../assets/js/curtain.js';
import { Scene, PerspectiveCamera, Object3D } from '../assets/js/three.core.js';
import {
	FRAME_MS, SPEED_MIN, SPEED_MAX, LOOP, SCENE, MOTION, TRAIN_RAIL_OFFSET
} from '../assets/js/config.js';
import { loadFixtures } from './helpers.js';

const { nikkei, stations } = loadFixtures();

// サンプル（同梱）と、手元にあれば実データ（data/local/。git には入らない）
const SERIES = [ [ 'サンプル', nikkei ] ];
const localUrl = new URL( '../data/local/nikkei225.json', import.meta.url );
if ( existsSync( localUrl ) ) SERIES.push( [ '実データ', JSON.parse( readFileSync( localUrl, 'utf8' ) ) ] );

const curves = SERIES.map( ( [ name, data ] ) => [ name, new TrackCurve( stations, buildDataset( data ).smoothed ) ] );
const MOTIONS = [ [ '通常', {} ], [ 'reduced', MOTION.reducedRide ] ];
const CAMERA_LIFT = TRAIN_RAIL_OFFSET + SCENE.ride.height;

/** 点 p の真下（水平の距離が最小）のレールの高さ。t の近くを粗く探してから細かく探す。 */
function railHeightBelow( curve, p, t ) {

	let best = t;
	let bestD = Infinity;
	const scan = ( from, to, step ) => {

		for ( let s = Math.max( 0, from ); s <= Math.min( curve.dataEnd, to ); s += step ) {

			const q = curve.getPointAt( s );
			const d = Math.hypot( q.x - p.x, q.z - p.z );
			if ( d < bestD ) {

				bestD = d;
				best = s;

			}

		}

	};

	scan( t - 0.004, t + 0.004, 2e-5 );
	scan( best - 4e-5, best + 4e-5, 1e-7 );
	return { y: curve.getPointAt( best ).y, distance: bestD };

}

test( '一人称のカメラ：全区間で、真下のレールとの高さの差が一定（レール面 + 車体 + カメラの高さ）', () => {

	for ( const [ name, curve ] of curves ) {

		for ( const [ label, motion ] of MOTIONS ) {

			const scene = new Scene();
			const camera = new PerspectiveCamera( 60, 16 / 9, 0.1, 1000 );
			const train = new Object3D();
			const ride = createRide( curve, null, motion );
			const view = createView( { scene, camera, train, curve, ride } );

			let min = Infinity;
			let max = - Infinity;
			for ( let t = 0; t < curve.dataEnd; t += 0.0007 ) {

				ride.progress = t;
				ride.updatePose( 1 );
				train.position.copy( ride.position );
				train.quaternion.copy( ride.quaternion );
				view.update( { nowMs: 0 } );

				const below = railHeightBelow( curve, camera.position, t );
				assert.ok( below.distance < 0.02, `${name} ${label} t=${t}: 真下にレールがない（${below.distance}）` );
				const gap = camera.position.y - below.y;
				min = Math.min( min, gap );
				max = Math.max( max, gap );

			}

			assert.ok( Math.abs( min - CAMERA_LIFT ) < 0.02 && Math.abs( max - CAMERA_LIFT ) < 0.02, `${name} ${label}: 高さの差 ${min.toFixed( 3 )}〜${max.toFixed( 3 )}（${CAMERA_LIFT} のはず）` );

		}

	}

} );

test( '一人称のカメラ：進行位置よりレールに沿って back だけ後ろ。始点の近くでは 0 で止める', () => {

	const [ , curve ] = curves[ 0 ];
	const out = { x: 0, y: 0, z: 0 };
	// 始点：0 より前には戻らない
	rideCameraPosition( curve, 0, out );
	const p0 = curve.getPointAt( 0 );
	assert.ok( Math.hypot( out.x - p0.x, out.z - p0.z ) < 1e-9 );
	assert.ok( Math.abs( out.y - ( p0.y + CAMERA_LIFT ) ) < 1e-9 );

	// 途中：カメラの真下の点と進行位置の点の 3D の距離が back（曲がり角では、水平に back 戻った点が back より近いことがあり、そこで止める）
	let exact = 0;
	let count = 0;
	for ( let t = 0.01; t < curve.dataEnd; t += 0.002 ) {

		rideCameraPosition( curve, t, out );
		const train = curve.getPointAt( t ).clone();
		const d = Math.hypot( train.x - out.x, train.y - ( out.y - CAMERA_LIFT ), train.z - out.z );
		assert.ok( d <= SCENE.ride.back + 1e-3 && d > SCENE.ride.back * 0.8, `t=${t} d=${d}` );
		if ( Math.abs( d - SCENE.ride.back ) < 1e-3 ) exact ++;
		count ++;

	}

	assert.ok( exact > count * 0.8, `${exact} / ${count}` );

} );

/** 1 周を 60fps で走らせて、速度の分布と跳びの回数を数える。 */
function lap( curve, motion ) {

	const ride = createRide( curve, null, motion );
	ride.started = true;
	const max = Math.max( SPEED_MIN, SPEED_MAX * ( motion.speedMaxFactor ?? 1 ) );
	const eps = 1e-3 * ( max - SPEED_MIN );
	let frames = 0;
	let middle = 0;
	let jumps = 0;
	let maxStep = 0;
	let peak = 0;
	let prev = ride.velocity;
	while ( ! ride.finished && frames < 60 * 600 ) {

		ride.update( FRAME_MS );
		frames ++;
		const v = ride.velocity;
		if ( v > SPEED_MIN + eps && v < max - eps ) middle ++;
		const step = Math.abs( v - prev );
		if ( step > 0.5 * ( max - SPEED_MIN ) ) jumps ++;
		maxStep = Math.max( maxStep, step );
		peak = Math.max( peak, v );
		prev = v;

	}

	return { seconds: frames * FRAME_MS / 1000, middleShare: middle / frames, jumps, maxStep, peak, finished: ride.finished };

}

test( '速度：1 周で、上限と下限の間の跳びがほとんどなく、中間の値をとる時間が半分以上。1 周は 140〜180 秒（60fps）', () => {

	for ( const [ name, curve ] of curves ) {

		const r = lap( curve, {} );
		assert.ok( r.finished, name );
		assert.ok( r.jumps <= 3, `${name}: 跳び ${r.jumps} 回` );
		assert.ok( r.middleShare >= 0.5, `${name}: 中間の割合 ${r.middleShare}` );
		assert.ok( r.seconds >= 140 && r.seconds <= 180, `${name}: 1 周 ${r.seconds} 秒` );
		// 1 フレームの変化は、速度の範囲の 5% 未満
		assert.ok( r.maxStep < 0.05 * ( SPEED_MAX - SPEED_MIN ), `${name}: 1 フレームの最大の変化 ${r.maxStep}` );

	}

} );

test( '速度：長い下りで速く、長い上りで遅い（区間の平均の勾配と平均の速度が逆向き）', () => {

	for ( const [ name, curve ] of curves ) {

		const ride = createRide( curve );
		ride.started = true;
		// progress 0.02 ごとの区間で、平均の勾配と平均の速度を集める
		const bins = new Map();
		while ( ! ride.finished ) {

			ride.update( FRAME_MS );
			const k = Math.floor( ride.progress / 0.02 );
			const b = bins.get( k ) ?? { g: 0, v: 0, n: 0 };
			b.g += curve.getHeightGradientAt( ride.progress );
			b.v += ride.velocity;
			b.n ++;
			bins.set( k, b );

		}

		const rows = [ ...bins.values() ].map( ( b ) => ( { g: b.g / b.n, v: b.v / b.n } ) ).sort( ( a, b ) => a.g - b.g );
		const q = Math.floor( rows.length / 4 );
		const mean = ( list ) => list.reduce( ( s, r ) => s + r.v, 0 ) / list.length;
		const downhill = mean( rows.slice( 0, q ) ); // 下りの強い 1/4
		const uphill = mean( rows.slice( - q ) ); // 上りの強い 1/4
		assert.ok( downhill > uphill * 1.25, `${name}: 下り ${downhill} / 上り ${uphill}` );

	}

} );

test( '速度（reduced）：上限は半分で、通常より変化が緩やか', () => {

	for ( const [ name, curve ] of curves ) {

		const normal = lap( curve, {} );
		const gentle = lap( curve, MOTION.reducedRide );
		assert.ok( gentle.peak <= SPEED_MAX * 0.5 + 1e-15, `${name}: ${gentle.peak}` );
		assert.ok( gentle.jumps <= 3, `${name}: 跳び ${gentle.jumps} 回` );
		assert.ok( gentle.middleShare >= 0.5, `${name}: 中間の割合 ${gentle.middleShare}` );
		assert.ok( gentle.maxStep < normal.maxStep, `${name}: 1 フレームの最大の変化 ${gentle.maxStep} >= ${normal.maxStep}` );

	}

} );

test( 'フレームレート：本番の設定（連絡区間あり）で、30・60・120fps で 60 秒走らせた進行位置の差が小さい', () => {

	assert.ok( LOOP.linkFraction > 0 );
	for ( const [ name, data ] of SERIES ) {

		for ( const [ label, motion ] of MOTIONS ) {

			const progress = [ FRAME_MS * 2, FRAME_MS, FRAME_MS / 2 ].map( ( step ) => {

				const ride = createRide( new TrackCurve( stations, buildDataset( data ).smoothed ), null, motion );
				ride.started = true;
				const n = Math.round( 60000 / step );
				for ( let i = 0; i < n; i ++ ) ride.update( step );
				return ride.progress;

			} );

			const spread = Math.max( ...progress ) - Math.min( ...progress );
			assert.ok( progress[ 1 ] > 0.2, `${name} ${label}: ${progress}` );
			assert.ok( spread < 1e-3, `${name} ${label}: ${progress.join( ' / ' )}` );

		}

	}

} );

// ---- 俯瞰の構図の枠 ----

test( 'HUD のモード：M（721〜1023px）は medium', () => {

	assert.equal( overviewMode( 1024, 768 ), 'wide' );
	assert.equal( overviewMode( 1023, 768 ), 'medium' );
	assert.equal( overviewMode( 800, 900 ), 'medium' );
	assert.equal( overviewMode( 721, 900 ), 'medium' );
	assert.equal( overviewMode( 720, 900 ), 'narrow' );
	assert.equal( overviewMode( 844, 390 ), 'short' );

} );

test( '俯瞰の枠：サンプルは従来の余白のまま、実データはキャプションを避けた余白', () => {

	// サンプル：従来の値（輪の大きさを変えない）
	assert.deepEqual( overviewFrame( 'wide', 'sample' ).insets, { top: 184, right: 24, bottom: 40, left: 24 } );
	assert.deepEqual( overviewFrame( 'medium', 'sample' ).insets, { top: 184, right: 24, bottom: 40, left: 24 } );
	assert.deepEqual( overviewFrame( 'narrow', 'sample' ).insets, { top: 148, right: 12, bottom: 206, left: 12 } );
	assert.deepEqual( overviewFrame( 'short', 'sample' ).insets, { top: 88, right: 24, bottom: 12, left: 24 } );
	assert.deepEqual( overviewFrame( 'wide', null ).insets, overviewFrame( 'wide', 'sample' ).insets );

	for ( const mode of [ 'wide', 'medium', 'narrow', 'short' ] ) {

		assert.notDeepEqual( overviewFrame( mode, 'real' ).insets, overviewFrame( mode, 'sample' ).insets, mode );

	}

} );

// 実データのキャプションが出る場所（CSS px。hud.css と annotations.css。高さは長い見出しでの実測より少し大きく）
//   L：下中央、下から 24、高さ 96 まで／ M（俯瞰）：凡例の下、上から 152、高さ 92 まで
//   S：ミニグラフの上、下から 204、高さ 100 まで／ 短い横長（俯瞰）：左の列、左から 24、幅 220
const CAPTION = {
	wide: ( w, h ) => ( { top: h - 24 - 96, bottom: h - 24, left: 0, right: w } ),
	medium: ( w ) => ( { top: 152, bottom: 152 + 92, left: 24, right: 24 + Math.min( 560, w - 48 ) } ),
	narrow: ( w, h ) => ( { top: h - 204 - 100, bottom: h - 204, left: 0, right: w } ),
	short: ( w, h ) => ( { top: 0, bottom: h, left: 24, right: 24 + 220 } )
};

test( '俯瞰の構図（実データ）：輪が、キャプションの出る場所と重ならない', () => {

	const points = overviewSubjectPoints( curves[ curves.length - 1 ][ 1 ] );
	for ( const [ w, h ] of [ [ 1440, 900 ], [ 1024, 768 ], [ 800, 900 ], [ 390, 844 ], [ 844, 390 ] ] ) {

		const mode = overviewMode( w, h );
		const frame = overviewFrame( mode, 'real' );
		const fit = fitOverview( points, { width: w, height: h, fovDeg: overviewFov( w / h ), elevationDeg: SCENE.overview.elevationDeg, ...frame } );
		const b = fit.bounds;
		// NDC → CSS px
		const ring = { left: ( b.x0 + 1 ) / 2 * w, right: ( b.x1 + 1 ) / 2 * w, top: ( 1 - b.y1 ) / 2 * h, bottom: ( 1 - b.y0 ) / 2 * h };
		const c = CAPTION[ mode ]( w, h );
		const overlaps = ring.left < c.right && ring.right > c.left && ring.top < c.bottom && ring.bottom > c.top;
		assert.ok( ! overlaps, `${w}x${h}（${mode}）: 輪 ${JSON.stringify( ring )} とキャプション ${JSON.stringify( c )}` );
		// 輪が小さくなりすぎない（画面の短い辺の 4 割以上）
		assert.ok( Math.max( ring.right - ring.left, ring.bottom - ring.top ) > 0.4 * Math.min( w, h ), `${w}x${h}: ${JSON.stringify( ring )}` );

	}

} );
