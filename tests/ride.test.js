import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRide } from '../assets/js/ride.js';
import { Vector3, Quaternion } from '../assets/js/three.core.js';
import { createEvents } from '../assets/js/events.js';
import { TrackCurve } from '../assets/js/track.js';
import { buildDataset } from '../assets/js/data.js';
import {
	FRAME_MS, MAX_DELTA_MS, SPEED_MIN, SPEED_MAX, START_PROGRESS
} from '../assets/js/config.js';
import { loadFixtures } from './helpers.js';

const { nikkei, stations } = loadFixtures();
const dataset = buildDataset( nikkei );

// 連絡区間なし（linkFraction: 0）の周回で確かめる。連絡区間ありの走行は tests/link.test.js と下の専用のテストで確かめる。
const NO_LINK = { linkFraction: 0 };

function newRide() {

	const ride = createRide( new TrackCurve( stations, dataset.smoothed, NO_LINK ) );
	ride.started = true;
	return ride;

}

function run( ride, stepMs, totalMs ) {

	const steps = Math.round( totalMs / stepMs );
	for ( let i = 0; i < steps; i ++ ) ride.update( stepMs );
	return ride;

}

test( '開始位置は progress = 0（1990 年 1 月）、初速は下限', () => {

	const ride = newRide();
	assert.equal( ride.progress, START_PROGRESS );
	assert.equal( ride.progress, 0 );
	assert.equal( dataset.rawAt( ride.progress ).date, '1990-01-01' );
	assert.equal( ride.velocity, SPEED_MIN );

} );

test( '60fps 相当と 120fps 相当で、同じ時間だけ進めた progress がほぼ一致する', () => {

	const totalMs = 60 * 1000;
	const at60 = run( newRide(), FRAME_MS, totalMs );
	const at120 = run( newRide(), FRAME_MS / 2, totalMs );
	const at30 = run( newRide(), FRAME_MS * 2, totalMs );

	assert.ok( at60.progress > 0.01, `progress=${at60.progress}` ); // 実際に進んでいる
	assert.ok( Math.abs( at60.progress - at120.progress ) < 1e-3, `${at60.progress} vs ${at120.progress}` );
	assert.ok( Math.abs( at60.progress - at30.progress ) < 2e-3, `${at60.progress} vs ${at30.progress}` );
	assert.ok( Math.abs( at60.velocity - at120.velocity ) < SPEED_MAX * 0.05 );

} );

test( '進行量は速度の下限・上限から計算できる範囲に収まる', () => {

	const ride = newRide();
	run( ride, FRAME_MS, 100 * 1000 );
	// 勾配による加減速があるので厳密には比べず、下限〜上限の範囲に収まることを見る
	assert.ok( ride.progress >= SPEED_MIN * 100 * 1000 - 1e-9 );
	assert.ok( ride.progress <= SPEED_MAX * 100 * 1000 + 1e-9 );
	assert.ok( ride.velocity >= SPEED_MIN && ride.velocity <= SPEED_MAX );

} );

test( '一時停止中・開始前は進まない', () => {

	const ride = newRide();
	ride.paused = true;
	run( ride, FRAME_MS, 5000 );
	assert.equal( ride.progress, 0 );

	const idle = createRide( new TrackCurve( stations, dataset.smoothed ) );
	run( idle, FRAME_MS, 5000 );
	assert.equal( idle.progress, 0 );

} );

test( 'delta には上限があり、長い中断でも飛ばない', () => {

	const jumped = newRide();
	jumped.update( 60 * 1000 );
	const capped = newRide();
	capped.update( MAX_DELTA_MS );
	assert.equal( jumped.progress, capped.progress );

	const negative = newRide();
	negative.update( - 50 );
	assert.equal( negative.progress, 0 );

} );

test( 'progress は折り返さず、1 に達したところで止まって finished になる', () => {

	const ride = newRide();
	ride.progress = 0.99999;
	ride.velocity = SPEED_MAX;
	ride.update( FRAME_MS );
	assert.equal( ride.progress, 1 );
	assert.equal( ride.finished, true );

	ride.update( FRAME_MS );
	assert.equal( ride.progress, 1 );

} );

test( '向きの補間も時間基準：60fps と 120fps で車体の向きが一致する', () => {

	const a = run( newRide(), FRAME_MS, 3000 );
	const b = run( newRide(), FRAME_MS / 2, 3000 );
	assert.ok( a.quaternion.angleTo( b.quaternion ) < 0.02 );

} );

// ---- 操作 API（pause / resume / togglePause / restart / finish）と events ----

function newRideWithEvents( curveOptions = NO_LINK ) {

	const events = createEvents();
	const log = [];
	for ( const name of [ 'start', 'pause', 'resume', 'restart', 'finish' ] ) events.on( name, ( payload ) => log.push( { name, payload } ) );
	const ride = createRide( new TrackCurve( stations, dataset.smoothed, curveOptions ), events );
	ride.start();
	return { ride, log, names: () => log.map( e => e.name ) };

}

test( 'start() は started にして、「start」を 1 回だけ発行する', () => {

	const { ride, names } = newRideWithEvents();
	ride.start();
	assert.equal( ride.started, true );
	assert.deepEqual( names(), [ 'start' ] );

} );

test( 'togglePause：一時停止と再生を交互に切り替え、止まっているあいだは進まず、イベントは遷移のときだけ', () => {

	const { ride, names } = newRideWithEvents();
	run( ride, FRAME_MS, 1000 );
	const moved = ride.progress;
	assert.ok( moved > 0 );

	ride.togglePause();
	assert.equal( ride.paused, true );
	run( ride, FRAME_MS, 1000 );
	assert.equal( ride.progress, moved );

	ride.pause(); // すでに一時停止中：何も起きない
	ride.togglePause();
	assert.equal( ride.paused, false );
	run( ride, FRAME_MS, 1000 );
	assert.ok( ride.progress > moved );

	ride.resume(); // すでに再生中：何も起きない
	assert.deepEqual( names(), [ 'start', 'pause', 'resume' ] );

} );

test( '一周（progress が dataEnd に達する）で止まり、finished になり、「finish」は 1 回だけ発行される', () => {

	const { ride, names, log } = newRideWithEvents();
	ride.progress = 0.9999;
	ride.velocity = SPEED_MAX;
	run( ride, FRAME_MS, 2000 );

	assert.equal( ride.finished, true );
	assert.equal( ride.progress, 1 );
	assert.equal( names().filter( n => n === 'finish' ).length, 1 );
	assert.equal( log.find( e => e.name === 'finish' ).payload.progress, 1 );

	ride.finish(); // 二重に呼んでも発行しない
	run( ride, FRAME_MS, 1000 );
	assert.equal( names().filter( n => n === 'finish' ).length, 1 );
	assert.equal( ride.progress, 1 );

} );

test( '連絡区間があるときは、データ区間の終わり（dataEnd）で止まる', () => {

	const { ride, names } = newRideWithEvents( { linkFraction: 0.03 } );
	ride.progress = 0.9699;
	ride.velocity = SPEED_MAX;
	run( ride, FRAME_MS, 2000 );

	assert.equal( ride.finished, true );
	assert.equal( ride.progress, 0.97 );
	assert.equal( names().filter( n => n === 'finish' ).length, 1 );

} );

test( 'finish() を直接呼ぶと、その位置で止まる', () => {

	const { ride, names } = newRideWithEvents();
	run( ride, FRAME_MS, 500 );
	const at = ride.progress;
	ride.finish();
	run( ride, FRAME_MS, 500 );
	assert.equal( ride.progress, at );
	assert.deepEqual( names(), [ 'start', 'finish' ] );

} );

test( 'restart：progress が 0 に戻り、終了・一時停止が解除され、「restart」を発行して再び進む', () => {

	const { ride, names } = newRideWithEvents();
	ride.progress = 0.9999;
	ride.velocity = SPEED_MAX;
	run( ride, FRAME_MS, 500 );
	assert.equal( ride.finished, true );
	ride.pause();

	ride.restart();
	assert.equal( ride.progress, 0 );
	assert.equal( ride.velocity, SPEED_MIN );
	assert.equal( ride.finished, false );
	assert.equal( ride.paused, false );
	assert.equal( ride.started, true );
	assert.equal( names().filter( n => n === 'restart' ).length, 1 );

	run( ride, FRAME_MS, 1000 );
	assert.ok( ride.progress > 0 );
	assert.equal( ride.finished, false );

} );

test( 'restart は START 前なら started にしない（START 前は進まないまま）', () => {

	const ride = createRide( new TrackCurve( stations, dataset.smoothed ) );
	ride.restart();
	assert.equal( ride.started, false );
	run( ride, FRAME_MS, 1000 );
	assert.equal( ride.progress, 0 );

} );

test( '終了後は、一時停止を解除しても進まない', () => {

	const { ride } = newRideWithEvents();
	ride.finish();
	ride.pause();
	ride.resume();
	run( ride, FRAME_MS, 1000 );
	assert.equal( ride.progress, 0 );

} );

// ---- 向き・勾配・速度の検証 ----

/** 車体の前方ベクトル（ローカルの -Z をワールドへ）。 */
function forwardOf( ride ) {

	return new Vector3( 0, 0, - 1 ).applyQuaternion( ride.quaternion );

}

/** 直線のテスト用曲線。tangent / gradient は後から差し替えられる。 */
function fakeCurve( { tangent = new Vector3( 1, 0, 0 ), gradient = 0 } = {} ) {

	const curve = {
		tangent,
		gradient,
		getPointAt: () => new Vector3( 0, 10, 0 ),
		getTangentAt: () => curve.tangent,
		getHeightGradientAt: () => curve.gradient
	};
	return curve;

}

function fakeRide( options ) {

	const curve = fakeCurve( options );
	const ride = createRide( curve );
	ride.start();
	return { ride, curve };

}

test( '車体の前方ベクトルの水平成分は、レールの接線と同じ向き（後ろ向きでも 90° ずれでもない）', () => {

	const curve = new TrackCurve( stations, dataset.smoothed );
	const ride = createRide( curve );

	for ( const progress of [ 0, 0.05, 0.2, 0.33, 0.5, 0.61, 0.8, 0.97 ] ) {

		ride.progress = progress;
		ride.updatePose( 1 );
		const forward = forwardOf( ride );
		const tangent = curve.getTangentAt( progress );
		const horizontal = Math.hypot( forward.x, forward.z );
		assert.ok( horizontal > 1e-6, `progress=${progress}` );
		const dot = ( forward.x * tangent.x + forward.z * tangent.z ) / horizontal;
		assert.ok( dot > 0.999999, `progress=${progress} dot=${dot}` );

	}

} );

test( '車体の前方ベクトル：テスト用曲線でも接線の向きに一致する（4 方向）', () => {

	for ( const [ x, z ] of [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ] ) {

		const { ride } = fakeRide( { tangent: new Vector3( x, 0, z ) } );
		const forward = forwardOf( ride );
		assert.ok( Math.abs( forward.x - x ) < 1e-9 && Math.abs( forward.z - z ) < 1e-9, `(${x}, ${z}) -> (${forward.x}, ${forward.z})` );

	}

} );

test( '傾斜：前方ベクトルの y 成分の符号は勾配の符号に対応する（上りは上向き、下りは下向き）', () => {

	const up = fakeRide( { gradient: 1000 } ).ride;
	const down = fakeRide( { gradient: - 1000 } ).ride;
	const flat = fakeRide( { gradient: 0 } ).ride;
	assert.ok( forwardOf( up ).y > 0.1, `up y=${forwardOf( up ).y}` );
	assert.ok( forwardOf( down ).y < - 0.1, `down y=${forwardOf( down ).y}` );
	assert.ok( Math.abs( forwardOf( flat ).y ) < 1e-9 );

	// 実データの曲線でも、勾配が十分大きい点で符号が一致する
	const curve = new TrackCurve( stations, dataset.smoothed );
	const ride = createRide( curve );
	let checked = 0;
	for ( let i = 0; i < 400; i ++ ) {

		const progress = i / 400;
		const gradient = curve.getHeightGradientAt( progress );
		if ( Math.abs( gradient ) < 200 ) continue;
		ride.progress = progress;
		ride.updatePose( 1 );
		const y = forwardOf( ride ).y;
		assert.ok( Math.sign( y ) === Math.sign( gradient ) && Math.abs( y ) > 1e-3, `progress=${progress} gradient=${gradient} y=${y}` );
		checked ++;

	}

	assert.ok( checked > 10, `検証した点が少ない: ${checked}` );

} );

test( '重力：下り（勾配が負）で速度が増え、上り（勾配が正）で減る', () => {

	const down = fakeRide( { gradient: - 100 } ).ride;
	down.velocity = ( SPEED_MIN + SPEED_MAX ) / 2;
	const downBefore = down.velocity;
	down.update( FRAME_MS );
	assert.ok( down.velocity > downBefore + 1e-8, `down ${downBefore} -> ${down.velocity}` );

	const up = fakeRide( { gradient: 100 } ).ride;
	up.velocity = ( SPEED_MIN + SPEED_MAX ) / 2;
	const upBefore = up.velocity;
	up.update( FRAME_MS );
	assert.ok( up.velocity < upBefore - 1e-8, `up ${upBefore} -> ${up.velocity}` );

	// 平坦なら変わらない
	const flat = fakeRide( { gradient: 0 } ).ride;
	flat.velocity = ( SPEED_MIN + SPEED_MAX ) / 2;
	const flatBefore = flat.velocity;
	flat.update( FRAME_MS );
	assert.equal( flat.velocity, flatBefore );

} );

test( '重力：下りが続けば上限まで加速し、上りが続けば下限まで減速する', () => {

	const down = fakeRide( { gradient: - 500 } ).ride;
	run( down, FRAME_MS, 5000 );
	assert.equal( down.velocity, SPEED_MAX );

	const up = fakeRide( { gradient: 500 } ).ride;
	up.velocity = SPEED_MAX;
	run( up, FRAME_MS, 5000 );
	assert.equal( up.velocity, SPEED_MIN );

} );

test( '実データの曲線：下りの区間で速度が増え、上りの区間で減る', () => {

	const curve = new TrackCurve( stations, dataset.smoothed );
	let checkedDown = 0;
	let checkedUp = 0;

	for ( let i = 0; i < 400; i ++ ) {

		const progress = i / 400;
		const gradient = curve.getHeightGradientAt( progress );
		if ( Math.abs( gradient ) < 100 ) continue;

		const ride = createRide( curve );
		ride.start();
		ride.progress = progress;
		ride.velocity = ( SPEED_MIN + SPEED_MAX ) / 2;
		const before = ride.velocity;
		ride.update( FRAME_MS );
		// update は先に progress を進めるので、進めた先の勾配で調整される。符号が変わらない点だけを見る
		const after = curve.getHeightGradientAt( ride.progress );
		if ( Math.sign( after ) !== Math.sign( gradient ) ) continue;

		if ( gradient < 0 ) {

			assert.ok( ride.velocity > before, `progress=${progress}` );
			checkedDown ++;

		} else {

			assert.ok( ride.velocity < before, `progress=${progress}` );
			checkedUp ++;

		}

	}

	assert.ok( checkedDown > 5 && checkedUp > 5, `down=${checkedDown} up=${checkedUp}` );

} );

test( '向きの補間は指数的な時間換算：33.33ms を 1 回と 16.667ms を 2 回で向きが一致する', () => {

	const make = () => {

		const { ride, curve } = fakeRide( { tangent: new Vector3( 1, 0, 0 ) } );
		// 初期の向きを目標からずらす（接線を 120° 回して、そこへ補間させる）
		curve.tangent = new Vector3( Math.cos( 2 * Math.PI / 3 ), 0, Math.sin( 2 * Math.PI / 3 ) );
		return ride;

	};

	const once = make();
	once.update( FRAME_MS * 2 );
	const twice = make();
	twice.update( FRAME_MS );
	twice.update( FRAME_MS );
	assert.ok( once.quaternion.angleTo( twice.quaternion ) < 1e-6, `angle=${once.quaternion.angleTo( twice.quaternion )}` );

	// 動いている（目標に到達していない）ことも確かめる
	const target = make();
	target.updatePose( 1 );
	const start = make().quaternion.clone();
	const full = start.angleTo( target.quaternion );
	assert.ok( full > 1, `full=${full}` );
	const moved = start.angleTo( once.quaternion );
	assert.ok( moved > 0.01 && moved < full, `moved=${moved} full=${full}` );

} );

test( '向きの補間：1 フレーム（FRAME_MS）で目標との角度が 8% 縮む', () => {

	const { ride, curve } = fakeRide();
	curve.tangent = new Vector3( 0, 0, 1 );
	const start = ride.quaternion.clone();
	const target = new Quaternion();
	{

		const probe = fakeRide( { tangent: new Vector3( 0, 0, 1 ) } ).ride;
		target.copy( probe.quaternion );

	}

	const full = start.angleTo( target );
	ride.update( FRAME_MS );
	const remaining = ride.quaternion.angleTo( target );
	assert.ok( Math.abs( remaining - full * 0.92 ) < 1e-6, `remaining=${remaining} full=${full}` );

} );
