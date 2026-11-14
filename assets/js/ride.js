// 走行状態（進行度・速度・一時停止・開始済み・終了）と、1 フレーム分の更新。
//
// 走行を操作するのは次の API だけ：start() / pause() / resume() / togglePause() / restart() / finish()。
// 状態が変わると events（省略可）へ 'start' 'pause' 'resume' 'restart' 'finish' を発行する。
// START 前・一時停止中・終了後は進まない。progress が curve.dataEnd に達したら止まって 'finish' を 1 回発行する。
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
	GRAVITY,
	ORIENTATION_BLEND_PER_FRAME,
	START_PROGRESS,
	RAIL_SLOPE_VISUAL_SCALE,
	TRAIN_RAIL_OFFSET
} from './config.js';

/**
 * @param curve getPointAt / getTangentAt / getHeightGradientAt と dataEnd を持つ曲線（TrackCurve）
 * @param events on / emit を持つ発行器（events.js）。省略すると何も発行しない。
 */
export function createRide( curve, events = null ) {

	const tangent = new Vector3();
	const railDirection = new Vector3();
	const lookAtTarget = new Vector3();
	const targetObject = new Object3D();
	const targetQuaternion = new Quaternion();

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

		/** 現在の progress に合わせて position と目標の向きを計算する。blend は向きを目標へ近づける割合（1 以上で即座に合わせる）。 */
		updatePose( blend ) {

			// progress が 1 に達した（一周し終えた）ときも、始点ではなく終点側の姿勢にしておく
			const t = Math.min( ride.progress, 1 - 1e-6 );

			ride.position.copy( curve.getPointAt( t ) );
			ride.position.y += TRAIN_RAIL_OFFSET;

			tangent.copy( curve.getTangentAt( t ) );
			const heightGradient = curve.getHeightGradientAt( t );

			// レール方向（傾斜を含む）に合わせる
			railDirection.set( tangent.x, heightGradient * RAIL_SLOPE_VISUAL_SCALE, tangent.z ).normalize();

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
			const blend = 1 - Math.pow( 1 - ORIENTATION_BLEND_PER_FRAME, delta / FRAME_MS );
			const heightGradient = ride.updatePose( blend );

			// 高さの勾配から速度を調整（重力効果）。下りで速く、上りで遅くなる。
			ride.velocity -= heightGradient * GRAVITY * delta;
			ride.velocity = Math.max( SPEED_MIN, Math.min( SPEED_MAX, ride.velocity ) );

			// データ区間の終わりに着いたら止まる
			if ( ride.progress >= end ) ride.finish();

		}
	};

	ride.reset();

	return ride;

}
