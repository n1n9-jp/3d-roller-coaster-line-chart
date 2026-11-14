import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRide, baseYearsPerSecond, speedFactor, speedFactorRange, curveYears } from '../assets/js/ride.js';
import { Vector3, Quaternion } from '../assets/js/three.core.js';
import { createEvents } from '../assets/js/events.js';
import { TrackCurve } from '../assets/js/track.js';
import { buildDataset } from '../assets/js/data.js';
import {
	FRAME_MS, MAX_DELTA_MS, START_PROGRESS, SPEED, SPIRAL, ANNOT, maxProgressPerFrame
} from '../assets/js/config.js';
import { series1990 as makeSeries1990, stretchedSeries } from './helpers.js';

const series1990 = makeSeries1990();
const dataset = buildDataset( series1990 );


function newRide() {

	const ride = createRide( new TrackCurve( dataset.smoothed ) );
	ride.started = true;
	return ride;

}

function run( ride, stepMs, totalMs ) {

	const steps = Math.round( totalMs / stepMs );
	for ( let i = 0; i < steps; i ++ ) ride.update( stepMs );
	return ride;

}

test( '開始位置は progress = 0（最初の週。1990 年 1 月始まりのデータなら 1990 年 1 月）、初速は下限', () => {

	const ride = newRide();
	assert.equal( ride.progress, START_PROGRESS );
	assert.equal( ride.progress, 0 );
	assert.equal( dataset.rawAt( ride.progress ).date, '1990-01-01' );
	assert.ok( Math.abs( ride.velocity / ride.speedRange().min - 1 ) < 1e-12 );
	assert.ok( Math.abs( ride.factor - SPEED.minFactor ) < 1e-12 );

} );

test( '60fps 相当と 120fps 相当で、同じ時間だけ進めた progress がほぼ一致する', () => {

	const totalMs = 60 * 1000;
	const at60 = run( newRide(), FRAME_MS, totalMs );
	const at120 = run( newRide(), FRAME_MS / 2, totalMs );
	const at30 = run( newRide(), FRAME_MS * 2, totalMs );

	assert.ok( at60.progress > 0.01, `progress=${at60.progress}` ); // 実際に進んでいる
	assert.ok( Math.abs( at60.progress - at120.progress ) < 1e-3, `${at60.progress} vs ${at120.progress}` );
	assert.ok( Math.abs( at60.progress - at30.progress ) < 2e-3, `${at60.progress} vs ${at30.progress}` );
	assert.ok( Math.abs( at60.velocity - at120.velocity ) < at60.speedRange().max * 0.05 );

} );

test( '進行量は速度の下限・上限から計算できる範囲に収まる', () => {

	const ride = newRide();
	const start = ride.speedRange( 0 );
	run( ride, FRAME_MS, 100 * 1000 );
	// 勾配による加減速があるので厳密には比べず、下限〜上限の範囲に収まることを見る（基準の速さは外側ほど遅い）
	assert.ok( ride.progress >= ride.speedRange().min * 100 * 1000 - 1e-9 );
	assert.ok( ride.progress <= start.max * 100 * 1000 + 1e-9 );
	assert.ok( ride.factor >= SPEED.minFactor - 1e-12 && ride.factor <= SPEED.maxFactor + 1e-12 );

} );

test( '速さのモデル：年/秒で持ち、データの期間で progress/ms に換算する。基準の速さは半径で、倍率は 1 年あたりの勾配で決まる', () => {

	const curve = new TrackCurve( dataset.smoothed );
	const ride = createRide( curve );
	assert.equal( curveYears( curve ), curve.years );
	assert.equal( curveYears( {} ), SPEED.fallbackYears );
	ride.speed = 0.5;
	assert.ok( Math.abs( ride.velocity - 0.5 / ( curve.years * 1000 ) ) < 1e-18 );
	ride.velocity = 1e-5;
	assert.ok( Math.abs( ride.speed - 1e-5 * curve.years * 1000 ) < 1e-12 );

	// 基準の速さ：内側の半径（16）で yearsPerSecond、半径 2 倍で 2^(−0.25) 倍
	assert.equal( SPEED.referenceRadius, SPIRAL.innerRadius );
	assert.equal( baseYearsPerSecond( SPEED.referenceRadius ), SPEED.yearsPerSecond );
	assert.ok( Math.abs( baseYearsPerSecond( 2 * SPEED.referenceRadius ) / SPEED.yearsPerSecond - Math.pow( 2, - SPEED.radiusExponent ) ) < 1e-12 );
	assert.equal( baseYearsPerSecond( 0 ), SPEED.yearsPerSecond ); // 半径を持たない曲線
	assert.equal( baseYearsPerSecond( 50, { ...SPEED, radiusExponent: 0 } ), SPEED.yearsPerSecond ); // 補正なし
	assert.ok( ride.speedRange( 0 ).cruise > ride.speedRange( 1 ).cruise ); // 外側ほど遅い（progress あたり）

	// 倍率：平らで 1、下りで大きく上りで小さい。0.85..2.5 に収まる
	assert.equal( speedFactor( 0 ), 1 );
	assert.ok( Math.abs( speedFactor( - 2 ) - Math.exp( 0.16 ) ) < 1e-12 );
	assert.equal( speedFactor( - 100 ), SPEED.maxFactor );
	assert.equal( speedFactor( 100 ), SPEED.minFactor );
	assert.deepEqual( speedFactorRange( { speedMaxFactor: 0.0001 } ), [ SPEED.minFactor, SPEED.minFactor ] );

} );

test( 'データの期間が違っても、1 年あたりの秒数と勾配の効き方は同じ', () => {

	const long = new TrackCurve( buildDataset( stretchedSeries( series1990, '1971-01-04', '2026-11-09' ) ).smoothed );
	const short = new TrackCurve( dataset.smoothed );
	// 同じ半径（始点はどちらも内側の半径）での巡航：progress/ms × 期間 が同じ
	const a = createRide( long ).speedRange( 0 ).cruise * long.years;
	const b = createRide( short ).speedRange( 0 ).cruise * short.years;
	assert.ok( Math.abs( a / b - 1 ) < 1e-12 );
	assert.ok( Math.abs( a * 1000 - SPEED.yearsPerSecond ) < 1e-12 );

} );

test( '1 フレームの進みは maxProgressPerFrame( 期間 ) 以下。出来事のキャプションの判定（ANNOT.caption.maxStepProgress）はその 2 倍以上', () => {

	for ( const data of [ series1990, stretchedSeries( series1990, '1971-01-04', '2026-11-09' ) ] ) {

		const curve = new TrackCurve( buildDataset( data ).smoothed );
		const ride = createRide( curve );
		ride.start();
		let maxStep = 0;
		while ( ! ride.finished ) {

			const before = ride.progress;
			ride.update( MAX_DELTA_MS );
			maxStep = Math.max( maxStep, ride.progress - before );

		}

		assert.ok( maxStep <= maxProgressPerFrame( curve.years ) + 1e-12, `${maxStep} > ${maxProgressPerFrame( curve.years )}` );
		assert.ok( ANNOT.caption.maxStepProgress >= 2 * maxProgressPerFrame( curve.years ) - 1e-12 );

	}

} );

test( '一時停止中・開始前は進まない', () => {

	const ride = newRide();
	ride.paused = true;
	run( ride, FRAME_MS, 5000 );
	assert.equal( ride.progress, 0 );

	const idle = createRide( new TrackCurve( dataset.smoothed ) );
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
	ride.velocity = ride.speedRange().max;
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

function newRideWithEvents() {

	const events = createEvents();
	const log = [];
	for ( const name of [ 'start', 'pause', 'resume', 'restart', 'finish' ] ) events.on( name, ( payload ) => log.push( { name, payload } ) );
	const ride = createRide( new TrackCurve( dataset.smoothed ), events );
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

test( '最後の週（progress = 1）で止まり、finished になり、「finish」は 1 回だけ発行される', () => {

	const { ride, names, log } = newRideWithEvents();
	ride.progress = 0.9999;
	ride.velocity = ride.speedRange().max;
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

test( '最初から最後まで走ると、t = 1 で止まり、「finish」は 1 回だけ。止まったあとの姿勢は外の端（中心へ戻らない）', () => {

	const { ride, names } = newRideWithEvents();
	const curve = new TrackCurve( dataset.smoothed );
	let frames = 0;
	let prev = ride.progress;
	while ( ! ride.finished && frames < 60 * 600 ) {

		ride.update( FRAME_MS );
		assert.ok( ride.progress >= prev ); // 戻らない
		prev = ride.progress;
		frames ++;

	}

	assert.equal( ride.finished, true );
	assert.equal( ride.progress, 1 );
	assert.equal( names().filter( n => n === 'finish' ).length, 1 );
	const end = curve.getPointAt( 1 );
	assert.ok( Math.hypot( ride.position.x - end.x, ride.position.z - end.z ) < 1e-9 );
	run( ride, FRAME_MS, 1000 );
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
	ride.velocity = ride.speedRange().max;
	run( ride, FRAME_MS, 500 );
	assert.equal( ride.finished, true );
	ride.pause();

	ride.restart();
	assert.equal( ride.progress, 0 );
	assert.ok( Math.abs( ride.velocity / ride.speedRange().min - 1 ) < 1e-12 );
	assert.ok( Math.abs( ride.factor - SPEED.minFactor ) < 1e-12 );
	assert.equal( ride.finished, false );
	assert.equal( ride.paused, false );
	assert.equal( ride.started, true );
	assert.equal( names().filter( n => n === 'restart' ).length, 1 );

	run( ride, FRAME_MS, 1000 );
	assert.ok( ride.progress > 0 );
	assert.equal( ride.finished, false );

} );

test( 'restart は START 前なら started にしない（START 前は進まないまま）', () => {

	const ride = createRide( new TrackCurve( dataset.smoothed ) );
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

	// t あたりの距離（lengthPerProgressAt）を持たない曲線：車体の傾きは「勾配 × 比率」（距離 1 として扱う）

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

	const curve = new TrackCurve( dataset.smoothed );
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

	// 実データの曲線では、前後 RAIL_SLOPE_WINDOW（水平の長さ）の弦の勾配で傾く。
	// 傾きは実際の勾配（dy/dt / その位置の t あたりの水平距離）の RAIL_SLOPE_RATIO 倍
	const curve = new TrackCurve( dataset.smoothed );
	const ride = createRide( curve );
	let checked = 0;
	for ( let i = 0; i <= 400; i ++ ) {

		const progress = i / 400;
		const length = curve.lengthPerProgressAt( progress );
		const half = RAIL_SLOPE_WINDOW / length;
		const t1 = Math.max( 0, progress - half );
		const t2 = Math.min( 1, progress + half );
		const gradient = ( curve.getPointAt( t2 ).y - curve.getPointAt( t1 ).y ) / ( t2 - t1 );
		ride.progress = progress;
		ride.updatePose( 1 );
		const y = forwardOf( ride ).y;
		const expected = Math.sin( Math.atan( gradient / length * RAIL_SLOPE_RATIO ) );
		assert.ok( Math.abs( y - expected ) < 1e-6, `progress=${progress} y=${y} expected=${expected}` );
		if ( Math.abs( gradient ) < 200 ) continue;
		assert.ok( Math.sign( y ) === Math.sign( gradient ) && Math.abs( y ) > 1e-3, `progress=${progress} gradient=${gradient} y=${y}` );
		checked ++;

	}

	assert.ok( checked > 10, `検証した点が少ない: ${checked}` );

} );

const FAKE = createRide( fakeCurve() ).speedRange(); // テスト用の曲線（半径・期間なし）の速さの範囲

test( '重力：平らなところの速度（基準の速さ）から、下り（勾配が負）で増え、上り（勾配が正）で減る', () => {

	const down = fakeRide( { gradient: - 100 } ).ride;
	down.velocity = FAKE.cruise;
	down.update( FRAME_MS );
	assert.ok( down.velocity > FAKE.cruise + 1e-9, `down -> ${down.velocity}` );

	const up = fakeRide( { gradient: 100 } ).ride;
	up.velocity = FAKE.cruise;
	up.update( FRAME_MS );
	assert.ok( up.velocity < FAKE.cruise - 1e-9, `up -> ${up.velocity}` );

	// 平坦なら FAKE.cruise のまま
	const flat = fakeRide( { gradient: 0 } ).ride;
	flat.velocity = FAKE.cruise;
	flat.update( FRAME_MS );
	assert.ok( Math.abs( flat.velocity - FAKE.cruise ) < 1e-15 );

	// 同じ速度から 1 フレーム：下り > 平坦 > 上り
	assert.ok( down.velocity > flat.velocity && flat.velocity > up.velocity );

} );

test( '重力：下りが続けば上限へ、上りが続けば下限へ、なめらかに近づく', () => {

	const down = fakeRide( { gradient: - 500 } ).ride;
	let prev = down.velocity;
	for ( let i = 0; i < 60 * 8; i ++ ) {

		down.update( FRAME_MS );
		// 1 フレームの変化は、速度の範囲の 1 割未満
		assert.ok( down.velocity >= prev && down.velocity - prev < 0.1 * ( FAKE.max - FAKE.min ) );
		prev = down.velocity;

	}

	assert.ok( down.velocity > FAKE.max * 0.99 && down.velocity <= FAKE.max, `${down.velocity}` );

	const up = fakeRide( { gradient: 500 } ).ride;
	up.velocity = FAKE.max;
	run( up, FRAME_MS, 8000 );
	assert.ok( up.velocity < FAKE.min * 1.01 && up.velocity >= FAKE.min, `${up.velocity}` );

} );

/** 速さの倍率に使う勾配（dy/dt）：進行位置の前後 SPEED.gradientWindowYears 年の弦（ride.js と同じ）。 */
function windowedGradient( curve, progress ) {

	const half = SPEED.gradientWindowYears / curve.years;
	const t1 = Math.max( 0, progress - half );
	const t2 = Math.min( 1, progress + half );
	return ( curve.getPointAt( t2 ).y - curve.getPointAt( t1 ).y ) / ( t2 - t1 );

}

test( '実データの曲線：下りの区間で速度が増え、上りの区間で減る', () => {

	const curve = new TrackCurve( dataset.smoothed );
	let checkedDown = 0;
	let checkedUp = 0;

	for ( let i = 0; i < 400; i ++ ) {

		const progress = i / 400;
		const gradient = windowedGradient( curve, progress );
		if ( Math.abs( gradient ) < 100 ) continue;

		const ride = createRide( curve );
		ride.start();
		ride.progress = progress;
		ride.velocity = ride.speedRange().cruise; // 平らなところの速度から
		const before = ride.velocity;
		ride.update( FRAME_MS );
		// update は先に progress を進めるので、進めた先の勾配で調整される。符号が変わらない点だけを見る
		const after = windowedGradient( curve, ride.progress );
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

// ---- 走行の係数（reduced-motion の一人称）----

import { MOTION, RAIL_SLOPE_RATIO, RAIL_SLOPE_WINDOW, ORIENTATION_BLEND_PER_FRAME, SPEED_RESPONSE_MS } from '../assets/js/config.js';

const DEFAULT_MOTION = {
	railSlopeRatio: RAIL_SLOPE_RATIO,
	orientationBlendPerFrame: ORIENTATION_BLEND_PER_FRAME,
	speedMaxFactor: 1,
	gravityFactor: 1,
	speedResponseMs: SPEED_RESPONSE_MS
};

function newRideWithMotion( options ) {

	const ride = createRide( new TrackCurve( dataset.smoothed ), null, options );
	ride.started = true;
	return ride;

}

/** 車体の進行方向の俯仰角（ラジアン）。傾きの大きさの目安。 */
function pitchOf( ride ) {

	const forward = new Vector3( 0, 0, 1 ).applyQuaternion( ride.quaternion );
	return Math.asin( Math.max( - 1, Math.min( 1, forward.y ) ) );

}

test( 'MOTION.reducedRide：傾きは控えめ、向きの補間 0.08 → 0.04、速度の上限は半分、速度の変化は緩やか', () => {

	const r = MOTION.reducedRide;
	assert.ok( r.railSlopeRatio > 0 && r.railSlopeRatio < RAIL_SLOPE_RATIO );
	assert.equal( r.orientationBlendPerFrame, 0.04 );
	assert.equal( r.speedMaxFactor, 0.5 );
	assert.ok( r.gravityFactor > 0 && r.gravityFactor < 1 );
	assert.ok( r.speedResponseMs > SPEED_RESPONSE_MS );
	assert.equal( ORIENTATION_BLEND_PER_FRAME, 0.08 );

} );

test( '係数を渡さないときは既定と同じ結果になる（options なし・空・events だけ、のどれでも）', () => {

	const base = run( newRide(), FRAME_MS, 30 * 1000 );
	const empty = run( newRideWithMotion( {} ), FRAME_MS, 30 * 1000 );
	const withEvents = run( createRide( new TrackCurve( dataset.smoothed ), createEvents() ), FRAME_MS, 0 );
	withEvents.started = true;
	run( withEvents, FRAME_MS, 30 * 1000 );

	assert.deepEqual( base.motion, DEFAULT_MOTION );
	for ( const other of [ empty, withEvents ] ) {

		assert.equal( other.progress, base.progress );
		assert.equal( other.velocity, base.velocity );
		assert.deepEqual( other.quaternion.toArray(), base.quaternion.toArray() );

	}

} );

test( 'options は第 2 引数（発行器のかわり）でも渡せて、events キーで発行器も渡せる', () => {

	const events = createEvents();
	const names = [];
	events.on( 'pause', () => names.push( 'pause' ) );
	const ride = createRide( new TrackCurve( dataset.smoothed ), { ...MOTION.reducedRide, events } );
	assert.equal( ride.motion.speedMaxFactor, 0.5 );
	ride.pause();
	assert.deepEqual( names, [ 'pause' ] );

} );

test( 'reduced：同じ時間だけ走らせると、速さの倍率の上限は半分（minFactor より下げない）で、進みも少ない', () => {

	const normal = newRide();
	const gentle = newRideWithMotion( MOTION.reducedRide );
	const half = SPEED.maxFactor * 0.5;

	// 上限に張り付いた状態から始めて、1 回の更新で上限に収まることを見る
	normal.speed = baseYearsPerSecond( SPIRAL.innerRadius ) * SPEED.maxFactor;
	gentle.speed = normal.speed;
	normal.update( FRAME_MS );
	gentle.update( FRAME_MS );
	assert.ok( normal.factor > SPEED.maxFactor * 0.9 );
	assert.ok( gentle.factor <= half + 1e-12, `factor=${gentle.factor}` );
	assert.ok( Math.abs( gentle.speedRange().max - normal.speedRange().max * 0.5 ) < 1e-18 );

	// 走らせ続けても、倍率は上限の半分を超えない
	const longNormal = newRide();
	const longGentle = newRideWithMotion( MOTION.reducedRide );
	let peakNormal = 0;
	let peakGentle = 0;
	for ( let i = 0; i < 60 * 120; i ++ ) {

		longNormal.update( FRAME_MS );
		longGentle.update( FRAME_MS );
		peakNormal = Math.max( peakNormal, longNormal.factor );
		peakGentle = Math.max( peakGentle, longGentle.factor );

	}

	assert.ok( peakGentle <= half + 1e-12, `peakGentle=${peakGentle}` );
	assert.ok( peakNormal > half, `peakNormal=${peakNormal}` ); // 比べる相手は、半分を超えるところまで出ている
	assert.ok( longGentle.progress < longNormal.progress );
	assert.ok( longGentle.factor >= SPEED.minFactor - 1e-12 );

} );

test( 'reduced：同じ位置での車体の傾きが小さい', () => {

	const normal = newRide();
	const gentle = newRideWithMotion( MOTION.reducedRide );
	let compared = 0;
	for ( const t of [ 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9 ] ) {

		normal.progress = t;
		gentle.progress = t;
		normal.updatePose( 1 );
		gentle.updatePose( 1 );
		const a = Math.abs( pitchOf( normal ) );
		const b = Math.abs( pitchOf( gentle ) );
		assert.ok( b <= a + 1e-9, `t=${t}: ${b} > ${a}` );
		if ( a > 0.01 ) {

			compared ++;
			// 傾きの正接の比が、比率の比（reduced / 通常）
			const expected = MOTION.reducedRide.railSlopeRatio / RAIL_SLOPE_RATIO;
			assert.ok( Math.abs( Math.tan( b ) / Math.tan( a ) - expected ) < 1e-6, `t=${t}: ${Math.tan( b ) / Math.tan( a )} != ${expected}` );

		}

	}

	assert.ok( compared >= 3, `傾きのある位置が少ない：${compared}` );

} );

test( 'reduced：向きの補間がゆるやか（同じ時間でも目標への近づき方が小さい）', () => {

	function angleToTarget( options ) {

		const ride = newRideWithMotion( options );
		ride.progress = 0.3;
		ride.updatePose( 1 ); // 0.3 の姿勢へ即座に合わせる
		const before = ride.quaternion.clone();
		ride.progress = 0.31;
		ride.updatePose( 1 );
		const target = ride.quaternion.clone();
		ride.quaternion.copy( before );
		ride.progress = 0.31;
		ride.updatePose( 1 - Math.pow( 1 - ( ride.motion.orientationBlendPerFrame ), 1 ) ); // 1 フレーム分
		return { moved: before.angleTo( ride.quaternion ), full: before.angleTo( target ) };

	}

	const normal = angleToTarget( {} );
	const gentle = angleToTarget( { orientationBlendPerFrame: MOTION.reducedRide.orientationBlendPerFrame } );
	assert.ok( normal.moved > 0 );
	assert.ok( gentle.moved < normal.moved );

} );

test( 'setMotion：実行中に係数を差し替え、null で元に戻る。ほかの係数は既定の値のまま', () => {

	const ride = newRide();
	ride.setMotion( MOTION.reducedRide );
	assert.equal( ride.motion.speedMaxFactor, 0.5 );
	ride.speed = baseYearsPerSecond( SPIRAL.innerRadius ) * SPEED.maxFactor;
	ride.update( FRAME_MS );
	assert.ok( ride.factor <= SPEED.maxFactor * 0.5 + 1e-12 );

	ride.setMotion( { speedMaxFactor: 0.25 } );
	assert.equal( ride.motion.speedMaxFactor, 0.25 );
	assert.equal( ride.motion.railSlopeRatio, RAIL_SLOPE_RATIO );

	ride.setMotion( null );
	assert.deepEqual( ride.motion, DEFAULT_MOTION );

	// 数でない値は無視する
	ride.setMotion( { speedMaxFactor: 'x', railSlopeRatio: NaN } );
	assert.equal( ride.motion.speedMaxFactor, 1 );

} );

test( '速度の上限は下限を下回らない（係数が極端に小さくても止まらない）', () => {

	const ride = newRideWithMotion( { speedMaxFactor: 0.0001 } );
	run( ride, FRAME_MS, 5000 );
	assert.ok( ride.factor >= SPEED.minFactor - 1e-12 );
	assert.ok( ride.progress > 0 );

} );

// ---- デモ走行（スタート画面の背景）----

function newDemoRide() {

	const events = createEvents();
	const emitted = [];
	for ( const name of [ 'start', 'pause', 'resume', 'restart', 'finish' ] ) events.on( name, () => emitted.push( name ) );
	const ride = createRide( new TrackCurve( dataset.smoothed ), events );
	return { ride, emitted };

}

test( 'startDemo を呼ばなければ、従来どおり乗車前は進まない', () => {

	const { ride, emitted } = newDemoRide();
	assert.equal( ride.demo, false );
	run( ride, FRAME_MS, 3000 );
	assert.equal( ride.progress, START_PROGRESS );
	assert.equal( ride.started, false );
	assert.deepEqual( emitted, [] );

} );

test( 'startDemo：乗車前に from から本番と同じ速さの式で進む（started は false のまま、何も発行しない）', () => {

	const { ride, emitted } = newDemoRide();
	ride.startDemo( { from: 0.3, to: 0.5 } );
	assert.equal( ride.demo, true );
	assert.equal( ride.progress, 0.3 );
	run( ride, FRAME_MS, 2000 );
	assert.ok( ride.progress > 0.3 && ride.progress < 0.5, `progress=${ride.progress}` );
	assert.equal( ride.started, false );
	assert.deepEqual( emitted, [] );

	// 本番と同じ式：同じ位置・同じ速さから本番で進めたときと一致する
	const real = createRide( new TrackCurve( dataset.smoothed ) );
	const { ride: demo } = newDemoRide();
	demo.startDemo( { from: 0.3, to: 0.9 } );
	real.started = true;
	real.progress = demo.progress;
	real.speed = demo.speed;
	real.updatePose( 1 );
	run( demo, FRAME_MS, 1500 );
	run( real, FRAME_MS, 1500 );
	assert.ok( Math.abs( demo.progress - real.progress ) < 1e-12 );
	assert.ok( Math.abs( demo.speed - real.speed ) < 1e-9 );

} );

test( 'startDemo：to に着いたら from へ戻って繰り返す（終点の finish は発行しない）', () => {

	const { ride, emitted } = newDemoRide();
	const from = 0.40, to = 0.401;
	ride.startDemo( { from, to } );
	let wrapped = 0;
	let prev = ride.progress;
	for ( let i = 0; i < 600; i ++ ) {

		ride.update( FRAME_MS );
		assert.ok( ride.progress >= from && ride.progress < to + 1e-3, `progress=${ride.progress}` );
		if ( ride.progress < prev ) wrapped ++;
		prev = ride.progress;

	}

	assert.ok( wrapped >= 2, `wrapped=${wrapped}` );
	assert.equal( ride.finished, false );
	assert.deepEqual( emitted, [] );

	// 終点を指定しても 'finish' に届かない
	const { ride: end, emitted: endEmitted } = newDemoRide();
	end.startDemo( { from: 0.98, to: 1 } );
	run( end, FRAME_MS, 20000 );
	assert.equal( end.finished, false );
	assert.deepEqual( endEmitted, [] );

} );

test( 'startDemo：from と to が同じなら止めて見せる（prefers-reduced-motion）', () => {

	const { ride } = newDemoRide();
	ride.startDemo( { from: 0.45, to: 0.45 } );
	run( ride, FRAME_MS, 2000 );
	assert.equal( ride.progress, 0.45 );
	assert.equal( ride.demo, true );

} );

test( 'デモのあとの start()：進行位置・速さ・姿勢を最初の週の状態に戻し、started にして start を同期で 1 回だけ発行する', () => {

	const { ride, emitted } = newDemoRide();
	const fresh = createRide( new TrackCurve( dataset.smoothed ) );
	ride.startDemo( { from: 0.3, to: 0.5 } );
	run( ride, FRAME_MS, 2000 );

	ride.start();

	assert.deepEqual( emitted, [ 'start' ] );
	assert.equal( ride.started, true );
	assert.equal( ride.demo, false );
	assert.equal( ride.progress, START_PROGRESS );
	assert.ok( Math.abs( ride.speed - fresh.speed ) < 1e-12 );
	assert.ok( ride.position.distanceTo( fresh.position ) < 1e-9 );
	assert.ok( Math.abs( ride.quaternion.angleTo( fresh.quaternion ) ) < 1e-9 );

	// 2 回目は何もしない。以後は本番の走行（最初の週から進む）
	ride.start();
	assert.deepEqual( emitted, [ 'start' ] );
	run( ride, FRAME_MS, 1000 );
	fresh.started = true;
	run( fresh, FRAME_MS, 1000 );
	assert.ok( Math.abs( ride.progress - fresh.progress ) < 1e-12 );

	// 乗車後は startDemo を受け付けない
	ride.startDemo( { from: 0.6, to: 0.7 } );
	assert.equal( ride.demo, false );
	assert.ok( ride.progress < 0.1 );

} );

test( "'start' のハンドラの中で、進行位置はもう最初の週（音などが同期で読む）", () => {

	const events = createEvents();
	const ride = createRide( new TrackCurve( dataset.smoothed ), events );
	let seen = null;
	events.on( 'start', () => {

		seen = { progress: ride.progress, started: ride.started, demo: ride.demo };

	} );
	ride.startDemo( { from: 0.3, to: 0.5 } );
	run( ride, FRAME_MS, 500 );
	ride.start();
	assert.deepEqual( seen, { progress: START_PROGRESS, started: true, demo: false } );

} );
