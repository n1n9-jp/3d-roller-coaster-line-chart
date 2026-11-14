// 一人称の視点：急な坂でも前方のレールが画面に入ること、回る速さに上限があること、ゆるやかな区間の見え方は変わらないこと。
// レンダラなしで、カメラの位置・向き・画角から投影を計算する（view.js が置いたカメラを、そのまま Vector3.project に使う）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRide, rideCameraProgress } from '../assets/js/ride.js';
import { createView } from '../assets/js/view.js';
import { TrackCurve } from '../assets/js/track.js';
import { buildDataset } from '../assets/js/data.js';
import { Scene, PerspectiveCamera, Object3D, Vector3, Quaternion } from '../assets/js/three.core.js';
import { FRAME_MS, SCENE, MOTION, TRAIN_RAIL_OFFSET } from '../assets/js/config.js';
import { readJson } from './helpers.js';

const DATA = [ [ 'ドル円', readJson( 'data/usdjpy.json' ) ], [ '10年国債の金利', readJson( 'data/jgb10.json' ) ] ];
const localUrl = new URL( '../data/local/nikkei225.json', import.meta.url );
if ( existsSync( localUrl ) ) DATA.push( [ '日経平均', JSON.parse( readFileSync( localUrl, 'utf8' ) ) ] );
const CURVES = DATA.map( ( [ name, data ] ) => [ name, new TrackCurve( buildDataset( data ).smoothed ) ] );

// デスクトップ 1440x900（縦の画角 55°）とモバイル 390x844（縦の画角 80°）
const SCREENS = [ [ 'デスクトップ', 1440 / 900, 55 ], [ 'モバイル', 390 / 844, 80 ] ];
const MOTIONS = [ [ '通常', {} ], [ 'reduced', MOTION.reducedRide ] ];

/** 進行位置のレールの点から、レールに沿って 3D の長さ lengths（昇順）先の点（水平 0.01 刻みの折れ線で測る）。届かない点は null。 */
function pointsAlongRail( curve, t, lengths ) {

	const dt = 0.01 / curve.lengthPerProgressAt( t );
	const prev = new Vector3().copy( curve.getPointAt( t ) );
	const next = new Vector3();
	const out = lengths.map( () => null );
	let total = 0;
	let k = 0;
	for ( let s = t; k < lengths.length && s < 1; ) {

		s = Math.min( 1, s + dt );
		next.copy( curve.getPointAt( s ) );
		const step = next.distanceTo( prev );
		while ( k < lengths.length && total + step >= lengths[ k ] ) {

			out[ k ] = prev.clone().lerp( next, ( lengths[ k ] - total ) / step );
			k ++;

		}

		total += step;
		prev.copy( next );

	}

	return out;

}

function inView( point, camera ) {

	const v = point.clone().project( camera );
	return Math.abs( v.x ) <= 1 && Math.abs( v.y ) <= 1 && v.z < 1;

}

/** 最初から最後まで 60fps で走らせ、毎フレームのカメラで前方の点（レールに沿って 4・8 先）が画面に入るかを数える。 */
function rideThrough( curve, aspect, motion ) {

	const camera = new PerspectiveCamera( 60, aspect, 0.1, 2000 );
	const train = new Object3D();
	const ride = createRide( curve, null, motion );
	const view = createView( { scene: new Scene(), camera, train, curve, ride } );
	view.update( { nowMs: 0 } ); // 縦横比を走行に渡す
	ride.updatePose( 1 );
	ride.started = true;
	const previous = new Quaternion();
	let frames = 0;
	let now = 0;
	let maxTurn = 0;
	const outDates = [];
	while ( ! ride.finished ) {

		previous.copy( camera.quaternion );
		ride.update( FRAME_MS );
		now += FRAME_MS;
		train.position.copy( ride.position );
		train.quaternion.copy( ride.quaternion );
		view.update( { nowMs: now } );
		camera.updateMatrixWorld();
		frames ++;
		if ( frames > 1 ) maxTurn = Math.max( maxTurn, previous.angleTo( camera.quaternion ) );
		const points = pointsAlongRail( curve, ride.progress, [ 4, 8 ] ).filter( Boolean );
		if ( points.length > 0 && ! points.some( ( p ) => inView( p, camera ) ) ) outDates.push( new Date( curve.timeAt( ride.progress ) ).toISOString().slice( 0, 10 ) );

	}

	return { frames, outDates, maxTurnDegPerSec: maxTurn / ( FRAME_MS / 1000 ) * 180 / Math.PI };

}

// 回る速さの上限（SCENE.ride.maxTurnDegPerSec）を守ると、10年国債の金利の 1987 年〜1988 年 2 月（最初の周で、数週間のうちに垂直に近く下って上る谷）だけは、
// 前方の点が一時的に画面の外に出る。そこは全体の 0.5% 以下、そのほかの区間とデータでは 0
const EXCEPTION = { name: '10年国債の金利', from: '1987-01-01', to: '1988-03-01', maxShare: 0.005 };

for ( const [ name, curve ] of CURVES ) {

	for ( const [ screen, aspect, fov ] of SCREENS ) {

		for ( const [ label, motion ] of MOTIONS ) {

			test( `一人称：${name}・${screen}・${label}で、全区間、レールに沿って 4 か 8 先の点が縦と横の画角の内側にあり、回る速さは上限以下`, () => {

				const camera = new PerspectiveCamera( 60, aspect, 0.1, 2000 );
				createView( { scene: new Scene(), camera, train: new Object3D() } ).update( { nowMs: 0 } );
				assert.equal( camera.fov, fov ); // 画角はこの画面の値

				const r = rideThrough( curve, aspect, motion );
				const exception = name === EXCEPTION.name;
				const outside = r.outDates.filter( ( d ) => ! exception || d < EXCEPTION.from || d >= EXCEPTION.to );
				assert.deepEqual( outside.slice( 0, 10 ), [], `${r.outDates.length} / ${r.frames} フレームで前方の点が画面の外` );
				if ( exception ) assert.ok( r.outDates.length <= r.frames * EXCEPTION.maxShare, `1987 年〜1988 年 2 月：${r.outDates.length} / ${r.frames} フレーム` );
				assert.ok( r.maxTurnDegPerSec <= SCENE.ride.maxTurnDegPerSec + 0.5, `回る速さの最大 ${r.maxTurnDegPerSec.toFixed( 1 )}°/s` );

			} );

		}

	}

}

test( '一人称：ゆるやかな区間（ドル円の 2000 年代、10年国債の金利の 2010 年代）では、補正のない向き・位置と同じ', () => {

	for ( const [ name, from, to ] of [ [ 'ドル円', '2000-01-01', '2010-01-01' ], [ '10年国債の金利', '2010-01-01', '2020-01-01' ] ] ) {

		const curve = CURVES.find( ( [ n ] ) => n === name )[ 1 ];
		for ( const [ , aspect ] of SCREENS ) {

			const camera = new PerspectiveCamera( 60, aspect, 0.1, 2000 );
			const framed = createRide( curve );
			createView( { scene: new Scene(), camera, train: new Object3D(), curve, ride: framed } ).update( { nowMs: 0 } );
			const plain = createRide( curve ); // 補正なし（setFraming を呼ばない）
			const t1 = curve.dateToProgress( from );
			const t2 = curve.dateToProgress( to );
			let count = 0;
			for ( let t = t1; t <= t2; t += ( t2 - t1 ) / 400 ) {

				framed.progress = plain.progress = t;
				framed.updatePose( 1 );
				plain.updatePose( 1 );
				assert.ok( framed.quaternion.angleTo( plain.quaternion ) < 1e-6, `${name} t=${t}` );
				assert.ok( framed.cameraPosition.distanceTo( plain.cameraPosition ) < 1e-9, `${name} t=${t}` );
				// 急な上りの補正（カメラを後ろへ倒す）もほとんど効かない：足元の点の真上 1.4 から 0.1 以内
				const foot = new Vector3().copy( curve.getPointAt( rideCameraProgress( curve, t ) ) );
				foot.y += TRAIN_RAIL_OFFSET + SCENE.ride.height;
				assert.ok( framed.cameraPosition.distanceTo( foot ) < 0.1, `${name} t=${t}` );
				count ++;

			}

			assert.ok( count >= 400 );

		}

	}

} );

test( '一人称：カメラの位置は進むにつれてなめらかに動く（1 フレームの移動は、車体の移動の 2 倍 + 0.05 以下）', () => {

	for ( const [ name, curve ] of CURVES ) {

		const ride = createRide( curve );
		ride.started = true;
		const camera = new Vector3().copy( ride.cameraPosition );
		const train = new Vector3().copy( ride.position );
		while ( ! ride.finished ) {

			ride.update( FRAME_MS );
			const move = camera.distanceTo( ride.cameraPosition );
			const trainMove = train.distanceTo( ride.position );
			assert.ok( move <= 2 * trainMove + 0.05, `${name} ${new Date( curve.timeAt( ride.progress ) ).toISOString().slice( 0, 10 )}: ${move} (車体 ${trainMove})` );
			camera.copy( ride.cameraPosition );
			train.copy( ride.position );

		}

	}

} );
