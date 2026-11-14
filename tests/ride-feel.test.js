// 走行の乗り心地と視点：一人称のカメラの高さ、速度の変わり方、フレームレートによる差（本番の設定）、俯瞰の構図の枠。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRide } from '../assets/js/ride.js';
import { createView, rideCameraPosition, overviewMode } from '../assets/js/view.js';
import { TrackCurve } from '../assets/js/track.js';
import { buildDataset } from '../assets/js/data.js';
import { Scene, PerspectiveCamera, Object3D } from '../assets/js/three.core.js';
import {
	FRAME_MS, SPEED, SCENE, MOTION, TRAIN_RAIL_OFFSET
} from '../assets/js/config.js';
import { readJson, series1990 as makeSeries1990 } from './helpers.js';

const series1990 = makeSeries1990();

// 1990 年始まり（36 年）、手元にあれば日経平均の実データ（data/local/。git には入らない）、1971 年始まり（56 年、約 5.6 周。同梱のドル円の実データそのもの）
const SERIES = [ [ '1990 年始まり', series1990 ] ];
const localUrl = new URL( '../data/local/nikkei225.json', import.meta.url );
if ( existsSync( localUrl ) ) SERIES.push( [ '実データ', JSON.parse( readFileSync( localUrl, 'utf8' ) ) ] );
SERIES.push( [ 'ドル円（1971 年始まり）', readJson( 'data/usdjpy.json' ) ] );

const curves = SERIES.map( ( [ name, data ] ) => [ name, new TrackCurve( buildDataset( data ).smoothed ) ] );
const MOTIONS = [ [ '通常', {} ], [ 'reduced', MOTION.reducedRide ] ];
const CAMERA_LIFT = TRAIN_RAIL_OFFSET + SCENE.ride.height;

/** 点 p の真下（水平の距離が最小）のレールの高さ。t より少し手前を粗く探してから細かく探す。 */
function railHeightBelow( curve, p, t ) {

	let best = t;
	let bestD = Infinity;
	const scan = ( from, to, step ) => {

		for ( let s = Math.max( 0, from ); s <= Math.min( 1, to ); s += step ) {

			const q = curve.getPointAt( s );
			const d = Math.hypot( q.x - p.x, q.z - p.z );
			if ( d < bestD ) {

				bestD = d;
				best = s;

			}

		}

	};

	// カメラは進行位置より back（1.6）だけ後ろ。内側の周では t あたりの距離が短いので、t の幅は広めに
	const width = 3 * SCENE.ride.back / curve.lengthPerProgressAt( t );
	scan( t - width, t + 1e-4, width / 300 );
	scan( best - width / 150, best + width / 150, width / 30000 );
	return { y: curve.getPointAt( best ).y, distance: bestD };

}

test( '一人称のカメラ：全区間（内側の周でも外側の周でも）で、真下のレールとの高さの差が一定（レール面 + 車体 + カメラの高さ）', () => {

	for ( const [ name, curve ] of curves ) {

		for ( const [ label, motion ] of MOTIONS ) {

			const scene = new Scene();
			const camera = new PerspectiveCamera( 60, 16 / 9, 0.1, 1000 );
			const train = new Object3D();
			const ride = createRide( curve, null, motion );
			const view = createView( { scene, camera, train, curve, ride } );

			let min = Infinity;
			let max = - Infinity;
			const firstTurn = 1 / curve.turns;
			let inner = 0;
			let outer = 0;
			for ( let t = 0; t <= 1; t += 0.0015 ) {

				if ( t < firstTurn ) inner ++;
				if ( t > 1 - firstTurn ) outer ++;

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
			assert.ok( inner > 50 && outer > 50, `${name}: 内側 ${inner} 点、外側 ${outer} 点` );

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
	for ( let t = 0.01; t <= 1; t += 0.002 ) {

		rideCameraPosition( curve, t, out );
		const train = curve.getPointAt( t ).clone();
		const d = Math.hypot( train.x - out.x, train.y - ( out.y - CAMERA_LIFT ), train.z - out.z );
		assert.ok( d <= SCENE.ride.back + 1e-3 && d > SCENE.ride.back * 0.8, `t=${t} d=${d}` );
		if ( Math.abs( d - SCENE.ride.back ) < 1e-3 ) exact ++;
		count ++;

	}

	assert.ok( exact > count * 0.8, `${exact} / ${count}` );

} );

/** 最初から最後まで 60fps で走らせて、速さの倍率（その位置の基準の速さに対する倍率）の分布と跳びの回数を数える。 */
function lap( curve, motion ) {

	const ride = createRide( curve, null, motion );
	ride.started = true;
	const min = SPEED.minFactor;
	const max = Math.max( min, SPEED.maxFactor * ( motion.speedMaxFactor ?? 1 ) );
	const eps = 1e-3 * ( max - min );
	let frames = 0;
	let middle = 0;
	let jumps = 0;
	let maxStep = 0;
	let peak = 0;
	let prev = ride.factor;
	while ( ! ride.finished && frames < 60 * 600 ) {

		ride.update( FRAME_MS );
		frames ++;
		const v = ride.factor;
		if ( v > min + eps && v < max - eps ) middle ++;
		const step = Math.abs( v - prev );
		if ( step > 0.5 * ( max - min ) ) jumps ++;
		maxStep = Math.max( maxStep, step );
		peak = Math.max( peak, v );
		prev = v;

	}

	return { seconds: frames * FRAME_MS / 1000, middleShare: middle / frames, jumps, maxStep, peak, finished: ride.finished };

}

test( '速度：最初から最後まで、上限と下限の間の跳びがほとんどなく、中間の値をとる時間が半分以上。所要時間は 36 年分で 150〜200 秒、56 年分で 230〜300 秒（60fps）', () => {

	for ( const [ name, curve ] of curves ) {

		const r = lap( curve, {} );
		assert.ok( r.finished, name );
		assert.ok( r.jumps <= 3, `${name}: 跳び ${r.jumps} 回` );
		assert.ok( r.middleShare >= 0.5, `${name}: 中間の割合 ${r.middleShare}` );
		const [ lo, hi ] = curve.years > 50 ? [ 230, 300 ] : [ 150, 200 ];
		assert.ok( r.seconds >= lo && r.seconds <= hi, `${name}: ${curve.years.toFixed( 1 )} 年分で ${r.seconds} 秒` );
		// 1 フレームの変化は、倍率の範囲の 5% 未満
		assert.ok( r.maxStep < 0.05 * ( SPEED.maxFactor - SPEED.minFactor ), `${name}: 1 フレームの最大の変化 ${r.maxStep}` );

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
			b.v += ride.factor; // その位置の基準の速さに対する倍率（基準の速さは外側ほど遅いので、倍率で比べる）
			b.n ++;
			bins.set( k, b );

		}

		const rows = [ ...bins.values() ].map( ( b ) => ( { g: b.g / b.n, v: b.v / b.n } ) ).sort( ( a, b ) => a.g - b.g );
		const q = Math.floor( rows.length / 4 );
		const mean = ( list ) => list.reduce( ( s, r ) => s + r.v, 0 ) / list.length;
		const downhill = mean( rows.slice( 0, q ) ); // 下りの強い 1/4
		const uphill = mean( rows.slice( - q ) ); // 上りの強い 1/4
		// 倍率の範囲（0.85〜2.5）と勾配の効き（年あたり 0.08）は控えめなので、差は 15% 以上を目安にする
		assert.ok( downhill > uphill * 1.15, `${name}: 下り ${downhill} / 上り ${uphill}` );

	}

} );

test( '速度（reduced）：上限は半分で、通常より変化が緩やか', () => {

	for ( const [ name, curve ] of curves ) {

		const normal = lap( curve, {} );
		const gentle = lap( curve, MOTION.reducedRide );
		assert.ok( gentle.peak <= SPEED.maxFactor * 0.5 + 1e-12, `${name}: ${gentle.peak}` );
		assert.ok( gentle.jumps <= 3, `${name}: 跳び ${gentle.jumps} 回` );
		assert.ok( gentle.middleShare >= 0.5, `${name}: 中間の割合 ${gentle.middleShare}` );
		assert.ok( gentle.maxStep < normal.maxStep, `${name}: 1 フレームの最大の変化 ${gentle.maxStep} >= ${normal.maxStep}` );

	}

} );

test( 'フレームレート：本番の設定で、30・60・120fps で 60 秒走らせた進行位置の差が小さい', () => {

	for ( const [ name, data ] of SERIES ) {

		for ( const [ label, motion ] of MOTIONS ) {

			const progress = [ FRAME_MS * 2, FRAME_MS, FRAME_MS / 2 ].map( ( step ) => {

				const ride = createRide( new TrackCurve( buildDataset( data ).smoothed ), null, motion );
				ride.started = true;
				const n = Math.round( 60000 / step );
				for ( let i = 0; i < n; i ++ ) ride.update( step );
				return ride.progress;

			} );

			const spread = Math.max( ...progress ) - Math.min( ...progress );
			assert.ok( progress[ 1 ] > 0.1, `${name} ${label}: ${progress}` );
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

// 俯瞰の構図（HUD を避ける・追加の点・大きさの下限）は tests/overview-frame.test.js
