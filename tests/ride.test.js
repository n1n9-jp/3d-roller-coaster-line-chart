import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRide } from '../assets/js/ride.js';
import { createEvents } from '../assets/js/events.js';
import { TrackCurve } from '../assets/js/track.js';
import { buildDataset } from '../assets/js/data.js';
import {
	FRAME_MS, MAX_DELTA_MS, SPEED_MIN, SPEED_MAX, START_PROGRESS
} from '../assets/js/config.js';
import { loadFixtures } from './helpers.js';

const { nikkei, stations } = loadFixtures();
const dataset = buildDataset( nikkei );

function newRide() {

	const ride = createRide( new TrackCurve( stations, dataset.smoothed ) );
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

function newRideWithEvents( curveOptions ) {

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
