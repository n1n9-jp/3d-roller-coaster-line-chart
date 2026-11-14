// 走行状態（進行度・速度・一時停止・開始済み・終了）と、1 フレーム分の更新。
//
// 走行を操作するのは次の API だけ：start() / pause() / resume() / togglePause() / restart() / finish()。
// 状態が変わると events（省略可）へ 'start' 'pause' 'resume' 'restart' 'finish' を発行する。
// START 前・一時停止中・終了後は進まない。progress が curve.dataEnd に達したら止まって 'finish' を 1 回発行する。
//
// 走行の「穏やかさ」に関わる係数（傾き・向きの補間・速度の上限・勾配の効き・速度の追従の速さ）は、createRide の options で渡せる。
// 省略すると config.js の従来の値で動く。実行中は ride.setMotion( overrides ) で差し替える
// （prefers-reduced-motion の一人称では ui/buttons.js が MOTION.reducedRide を渡す）。
//
// three.js のレンダラには依存しない（ベクトルとクォータニオンの計算のみ）ので、
// update( deltaMs ) を Node から直接呼んでテストできる。

import { Vector3, Quaternion, Object3D } from './three.core.js';
import {
	MAX_DELTA_MS,
	FRAME_MS,
	SPEED_MIN,
	SPEED_MAX,
	SPEED_INITIAL,
	SPEED_CRUISE,
	GRAVITY,
	SPEED_RESPONSE_MS,
	ORIENTATION_BLEND_PER_FRAME,
	START_PROGRESS,
	RAIL_SLOPE_RATIO,
	RAIL_SLOPE_WINDOW,
	TRAIN_RAIL_OFFSET
} from './config.js';

const MOTION_KEYS = [ 'railSlopeRatio', 'orientationBlendPerFrame', 'speedMaxFactor', 'gravityFactor', 'speedResponseMs' ];

/**
 * 勾配から決まる目標の速度（/ms）。平らなところで SPEED_CRUISE、下りで速く、上りで遅い。[ SPEED_MIN, speedMax ] に収める。
 * @param heightGradient 高さ勾配 dy/dt
 * @param motion { speedMaxFactor, gravityFactor }
 */
export function targetVelocity( heightGradient, motion = defaultMotion() ) {

	const speedMax = Math.max( SPEED_MIN, SPEED_MAX * motion.speedMaxFactor );
	const target = SPEED_CRUISE * Math.exp( - GRAVITY * motion.gravityFactor * heightGradient );
	return Math.max( SPEED_MIN, Math.min( speedMax, target ) );

}

/** 従来の値（config.js）。 */
export function defaultMotion() {

	return {
		/** 車体の傾き：レールの実際の勾配に対する比率（1 でレールと同じ傾き）。 */
		railSlopeRatio: RAIL_SLOPE_RATIO,
		/** 向きの補間：60fps で 1 フレームあたり目標へ近づく割合。 */
		orientationBlendPerFrame: ORIENTATION_BLEND_PER_FRAME,
		/** SPEED_MAX に掛ける係数（速度の上限）。 */
		speedMaxFactor: 1,
		/** GRAVITY に掛ける係数（勾配による目標の速度の変わり方）。 */
		gravityFactor: 1,
		/** 速度が目標へ近づく一次遅れの時定数（ms）。 */
		speedResponseMs: SPEED_RESPONSE_MS
	};

}

/** 走行の係数だけを取り出す（数値でないものは無視する）。 */
function pickMotion( source ) {

	const picked = {};
	if ( ! source ) return picked;
	for ( const key of MOTION_KEYS ) {

		if ( Number.isFinite( source[ key ] ) ) picked[ key ] = source[ key ];

	}

	return picked;

}

/**
 * @param curve getPointAt / getTangentAt / getHeightGradientAt と dataEnd を持つ曲線（TrackCurve）
 * @param events on / emit を持つ発行器（events.js）。省略すると何も発行しない。
 *        発行器ではなく options のオブジェクトを渡してもよい（events キーで発行器を渡せる）。
 * @param options 走行の係数 { railSlopeRatio, orientationBlendPerFrame, speedMaxFactor, gravityFactor, speedResponseMs }。
 *        MOTION.reducedRide をそのまま渡せる。省略した係数は従来の値。
 */
export function createRide( curve, events = null, options = {} ) {

	if ( events && typeof events.emit !== 'function' ) {

		options = events;
		events = options.events ?? null;

	}

	const baseMotion = { ...defaultMotion(), ...pickMotion( options ) };
	let motion = { ...baseMotion };

	const tangent = new Vector3();
	const railDirection = new Vector3();
	const lookAtTarget = new Vector3();
	const targetObject = new Object3D();
	const targetQuaternion = new Quaternion();
	// 高さ勾配 dy/dt を、水平の長さあたりの勾配 dy/ds に直す係数（1 / 周長）。周長を持たない曲線（テスト用）では 1
	const perLength = 1 / ( curve.seg?.totalLength || 1 );
	// 車体の傾きに使う勾配は、前後 RAIL_SLOPE_WINDOW（水平の長さ）の弦の勾配（週ごとの細かい揺れで、視線が上下に振られないように）。
	// 周長を持たない曲線（テスト用）では、その点の勾配
	const slopeHalf = curve.seg?.totalLength ? RAIL_SLOPE_WINDOW * perLength : 0;
	function visualGradient( t, heightGradient ) {

		if ( ! ( slopeHalf > 0 ) ) return heightGradient;
		const t1 = Math.max( 0, t - slopeHalf );
		const t2 = Math.min( 1 - 1e-6, t + slopeHalf );
		if ( t2 <= t1 ) return heightGradient;
		const y1 = curve.getPointAt( t1 ).y;
		const y2 = curve.getPointAt( t2 ).y;
		return ( y2 - y1 ) / ( t2 - t1 );

	}

	const ride = {
		/** 0..1。山手線 1 周 = データ系列の端から端まで。 */
		progress: START_PROGRESS,
		/** 1 ミリ秒あたりの progress の増分。 */
		velocity: SPEED_INITIAL,
		/** true の間は進まない。 */
		paused: false,
		/** START を押すまで進まない。 */
		started: false,
		/** 一周して止まっている。restart() で false に戻る。 */
		finished: false,
		/** 車体の位置（レール上 + オフセット）。 */
		position: new Vector3(),
		/** 車体の向き（目標へ滑らかに補間済み）。 */
		quaternion: new Quaternion(),

		/** いま使っている走行の係数（読み取り専用。変えるときは setMotion）。 */
		get motion() {

			return motion;

		},

		/** 走行の係数を差し替える。overrides にない係数は createRide の options（なければ従来の値）に戻る。null で全部戻す。 */
		setMotion( overrides = null ) {

			motion = { ...baseMotion, ...pickMotion( overrides ) };

		},

		/** 現在の progress に合わせて position と目標の向きを計算する。blend は向きを目標へ近づける割合（1 以上で即座に合わせる）。 */
		updatePose( blend ) {

			// progress が 1 に達した（一周し終えた）ときも、始点ではなく終点側の姿勢にしておく
			const t = Math.min( ride.progress, 1 - 1e-6 );

			ride.position.copy( curve.getPointAt( t ) );
			ride.position.y += TRAIN_RAIL_OFFSET;

			tangent.copy( curve.getTangentAt( t ) );
			const heightGradient = curve.getHeightGradientAt( t );

			// レール方向（傾斜を含む）に合わせる。tangent は水平の単位ベクトルなので、y 成分が水平の長さあたりの傾き
			railDirection.set( tangent.x, visualGradient( t, heightGradient ) * perLength * motion.railSlopeRatio, tangent.z ).normalize();

			targetObject.position.copy( ride.position );
			targetObject.lookAt( lookAtTarget.copy( ride.position ).sub( railDirection ) );
			targetQuaternion.copy( targetObject.quaternion );

			if ( blend >= 1 ) ride.quaternion.copy( targetQuaternion );
			else ride.quaternion.slerp( targetQuaternion, blend );

			return heightGradient;

		},

		/** 開始位置へ戻し、向きも即座に合わせる（状態フラグと events には触れない）。 */
		reset() {

			ride.progress = START_PROGRESS;
			ride.velocity = SPEED_INITIAL;
			ride.updatePose( 1 );

		},

		/** 走行を始める（START ボタン）。'start' を発行する。 */
		start() {

			if ( ride.started ) return;
			ride.started = true;
			events?.emit( 'start' );

		},

		pause() {

			if ( ride.paused ) return;
			ride.paused = true;
			events?.emit( 'pause' );

		},

		resume() {

			if ( ! ride.paused ) return;
			ride.paused = false;
			events?.emit( 'resume' );

		},

		togglePause() {

			if ( ride.paused ) ride.resume();
			else ride.pause();

		},

		/** 1990 年 1 月へ戻して再開する（一時停止も終了も解除）。'restart' を発行する。started は変えない。 */
		restart() {

			ride.reset();
			ride.paused = false;
			ride.finished = false;
			events?.emit( 'restart' );

		},

		/** 走行を止めて終了にする。'finish' は 1 回だけ発行する。 */
		finish() {

			if ( ride.finished ) return;
			ride.finished = true;
			events?.emit( 'finish', { progress: ride.progress } );

		},

		/** deltaMs ミリ秒分だけ進める。フレームレートによらず同じ結果になるよう時間で積分する。 */
		update( deltaMs ) {

			if ( ! ride.started || ride.paused || ride.finished ) return;

			const delta = Math.min( Math.max( deltaMs, 0 ), MAX_DELTA_MS );
			const end = curve.dataEnd ?? 1;

			ride.progress = Math.min( ride.progress + ride.velocity * delta, end );

			// 60fps の 1 フレームで ORIENTATION_BLEND_PER_FRAME だけ近づく補間を、時間で換算する
			const blend = 1 - Math.pow( 1 - motion.orientationBlendPerFrame, delta / FRAME_MS );
			const heightGradient = ride.updatePose( blend );

			// 高さの勾配から目標の速度を決め、一次遅れで近づく（重力効果）。下りで速く、上りで遅くなる。
			// 1 フレームのあいだ目標は一定とみなし、指数で厳密に積分する（フレームレートによらない）
			const target = targetVelocity( heightGradient, motion );
			ride.velocity = target + ( ride.velocity - target ) * Math.exp( - delta / Math.max( 1, motion.speedResponseMs ) );
			// 上限は下限より下げない（setMotion で上限が下がったときは、すぐに収める）
			const speedMax = Math.max( SPEED_MIN, SPEED_MAX * motion.speedMaxFactor );
			ride.velocity = Math.max( SPEED_MIN, Math.min( speedMax, ride.velocity ) );

			// データ区間の終わりに着いたら止まる
			if ( ride.progress >= end ) ride.finish();

		}
	};

	ride.reset();

	return ride;

}
