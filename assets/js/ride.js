// 走行状態（進行度・速度・一時停止・開始済み）と、1 フレーム分の更新。
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
 * @param curve getPointAt / getTangentAt / getHeightGradientAt を持つ曲線（TrackCurve）
 */
export function createRide( curve ) {

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
		/** 車体の位置（レール上 + オフセット）。 */
		position: new Vector3(),
		/** 車体の向き（目標へ滑らかに補間済み）。 */
		quaternion: new Quaternion(),

		/** 現在の progress に合わせて position と目標の向きを計算する。blend は向きを目標へ近づける割合（1 以上で即座に合わせる）。 */
		updatePose( blend ) {

			ride.position.copy( curve.getPointAt( ride.progress ) );
			ride.position.y += TRAIN_RAIL_OFFSET;

			tangent.copy( curve.getTangentAt( ride.progress ) );
			const heightGradient = curve.getHeightGradientAt( ride.progress );

			// レール方向（傾斜を含む）に合わせる
			railDirection.set( tangent.x, heightGradient * RAIL_SLOPE_VISUAL_SCALE, tangent.z ).normalize();

			targetObject.position.copy( ride.position );
			targetObject.lookAt( lookAtTarget.copy( ride.position ).sub( railDirection ) );
			targetQuaternion.copy( targetObject.quaternion );

			if ( blend >= 1 ) ride.quaternion.copy( targetQuaternion );
			else ride.quaternion.slerp( targetQuaternion, blend );

			return heightGradient;

		},

		/** 開始位置へ戻し、向きも即座に合わせる。 */
		reset() {

			ride.progress = START_PROGRESS;
			ride.velocity = SPEED_INITIAL;
			ride.updatePose( 1 );

		},

		/** deltaMs ミリ秒分だけ進める。フレームレートによらず同じ結果になるよう時間で積分する。 */
		update( deltaMs ) {

			if ( ! ride.started || ride.paused ) return;

			const delta = Math.min( Math.max( deltaMs, 0 ), MAX_DELTA_MS );

			ride.progress = ( ride.progress + ride.velocity * delta ) % 1;

			// 60fps の 1 フレームで ORIENTATION_BLEND_PER_FRAME だけ近づく補間を、時間で換算する
			const blend = 1 - Math.pow( 1 - ORIENTATION_BLEND_PER_FRAME, delta / FRAME_MS );
			const heightGradient = ride.updatePose( blend );

			// 高さの勾配から速度を調整（重力効果）。下りで速く、上りで遅くなる。
			ride.velocity -= heightGradient * GRAVITY * delta;
			ride.velocity = Math.max( SPEED_MIN, Math.min( SPEED_MAX, ride.velocity ) );

		}
	};

	ride.reset();

	return ride;

}
