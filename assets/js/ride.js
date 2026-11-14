// 走行状態（進行度・速度・一時停止・開始済み・終了）と、1 フレーム分の更新。
//
// 走行を操作するのは次の API だけ：start() / pause() / resume() / togglePause() / restart() / finish()。
// 状態が変わると events（省略可）へ 'start' 'pause' 'resume' 'restart' 'finish' を発行する。
// START 前・一時停止中・終了後は進まない。progress が 1（最後の週）に達したら止まって 'finish' を 1 回発行する。
//
// ■ 速度
//   速さは「年/秒」（ride.speed）で持ち、データの期間 T 年で progress / ms（ride.velocity = speed / ( T × 1000 )）に換算する。
//   目標の速さ = 基準の速さ base( r ) × 勾配による倍率。base( r ) = SPEED.yearsPerSecond × ( r / 基準の半径 )^(−radiusExponent)。
//   倍率 = clamp( exp( − gravityPerYear × dy/dτ ), minFactor, maxFactor )。dy/dτ は 1 年あたりの高さの変化（前後 SPEED.gradientWindowYears 年の弦の勾配）。
//   これで、期間の違うデータでも、1 年あたりの秒数と勾配の効き方がそろう（config.js の SPEED）。

// 走行の「穏やかさ」に関わる係数（傾き・向きの補間・速度の上限・勾配の効き・速度の追従の速さ）は、createRide の options で渡せる。
// 省略すると config.js の既定の値で動く。実行中は ride.setMotion( overrides ) で差し替える
// （prefers-reduced-motion の一人称では ui/buttons.js が MOTION.reducedRide を渡す）。
//
// three.js のレンダラには依存しない（ベクトルとクォータニオンの計算のみ）ので、
// update( deltaMs ) を Node から直接呼んでテストできる。

import { Vector3, Quaternion, Object3D } from './three.core.js';
import {
	MAX_DELTA_MS,
	FRAME_MS,
	SPEED,
	SPEED_RESPONSE_MS,
	ORIENTATION_BLEND_PER_FRAME,
	START_PROGRESS,
	RAIL_SLOPE_RATIO,
	RAIL_SLOPE_WINDOW,
	TRAIN_RAIL_OFFSET
} from './config.js';

const MOTION_KEYS = [ 'railSlopeRatio', 'orientationBlendPerFrame', 'speedMaxFactor', 'gravityFactor', 'speedResponseMs' ];

/** 速さの倍率の範囲 [ 下限, 上限 ]。上限は speedMaxFactor を掛け、下限より下げない。 */
export function speedFactorRange( motion = defaultMotion() ) {

	return [ SPEED.minFactor, Math.max( SPEED.minFactor, SPEED.maxFactor * motion.speedMaxFactor ) ];

}

/**
 * 勾配による速さの倍率。平らなところで 1、下りで大きく、上りで小さい。speedFactorRange に収める。
 * @param gradientPerYear 1 年あたりの高さの変化 dy/dτ
 * @param motion { speedMaxFactor, gravityFactor }
 */
export function speedFactor( gradientPerYear, motion = defaultMotion() ) {

	const [ lo, hi ] = speedFactorRange( motion );
	const m = Math.exp( - SPEED.gravityPerYear * motion.gravityFactor * gradientPerYear );
	return Math.max( lo, Math.min( hi, m ) );

}

/** 半径による基準の速さ（年/秒）：yearsPerSecond × ( r / referenceRadius )^(−radiusExponent)。半径がない（テスト用の曲線）ときは yearsPerSecond。 */
export function baseYearsPerSecond( radius, speed = SPEED ) {

	if ( ! ( radius > 0 ) || ! speed.radiusExponent ) return speed.yearsPerSecond;
	return speed.yearsPerSecond * Math.pow( radius / speed.referenceRadius, - speed.radiusExponent );

}

/** 曲線の期間（年）。年数を持たない曲線（テスト用）では SPEED.fallbackYears。 */
export function curveYears( curve ) {

	return curve?.years > 0 ? curve.years : SPEED.fallbackYears;

}

/** 既定の値（config.js）。 */
export function defaultMotion() {

	return {
		/** 車体の傾き：レールの実際の勾配に対する比率（1 でレールと同じ傾き）。 */
		railSlopeRatio: RAIL_SLOPE_RATIO,
		/** 向きの補間：60fps で 1 フレームあたり目標へ近づく割合。 */
		orientationBlendPerFrame: ORIENTATION_BLEND_PER_FRAME,
		/** 速さの上限の倍率（SPEED.maxFactor）に掛ける係数。 */
		speedMaxFactor: 1,
		/** SPEED.gravityPerYear に掛ける係数（勾配による目標の速度の変わり方）。 */
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
 * @param curve getPointAt / getTangentAt / getHeightGradientAt を持つ曲線（TrackCurve）。
 *        lengthPerProgressAt（t あたりの水平距離）・radiusAt・years があれば、傾き・速度の換算に使う
 * @param events on / emit を持つ発行器（events.js）。省略すると何も発行しない。
 *        発行器ではなく options のオブジェクトを渡してもよい（events キーで発行器を渡せる）。
 * @param options 走行の係数 { railSlopeRatio, orientationBlendPerFrame, speedMaxFactor, gravityFactor, speedResponseMs }。
 *        MOTION.reducedRide をそのまま渡せる。省略した係数は既定の値。
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
	// 高さ勾配 dy/dt を、水平の長さあたりの勾配 dy/ds に直す：その位置での t あたりの水平距離 ds/dt で割る。
	// それを持たない曲線（テスト用）では 1 として扱う
	const lengthPerProgress = typeof curve.lengthPerProgressAt === 'function'
		? ( t ) => curve.lengthPerProgressAt( t )
		: null;
	// 車体の傾きに使う勾配は、前後 RAIL_SLOPE_WINDOW（水平の長さ）の弦の勾配（週ごとの細かい揺れで、視線が上下に振られないように）。
	// t あたりの距離を持たない曲線（テスト用）では、その点の勾配
	function visualGradient( t, heightGradient, perLength ) {

		if ( ! lengthPerProgress ) return heightGradient;
		const half = RAIL_SLOPE_WINDOW * perLength;
		const t1 = Math.max( 0, t - half );
		const t2 = Math.min( 1, t + half );
		if ( t2 <= t1 ) return heightGradient;
		const y1 = curve.getPointAt( t1 ).y;
		const y2 = curve.getPointAt( t2 ).y;
		return ( y2 - y1 ) / ( t2 - t1 );

	}

	const years = curveYears( curve );
	/** 年/秒 → progress / ms の係数。 */
	const perYearPerSecond = 1 / ( years * 1000 );
	const radiusAt = typeof curve.radiusAt === 'function' ? ( t ) => curve.radiusAt( t ) : () => 0;
	const baseAt = ( t ) => baseYearsPerSecond( radiusAt( Math.min( Math.max( t, 0 ), 1 ) ) );

	// 速さの倍率に使う勾配（1 年あたりの高さの変化）：進行位置の前後 SPEED.gradientWindowYears 年の弦の勾配。
	// 1 日の差分では週ごとの細かい揺れが速さに乗り、数か月〜数年かけて下る・上るという地形の起伏と速さが対応しなくなる。
	// 水平の長さを持たない曲線（テスト用。getPointAt の高さが勾配と対応しない）では、その点の勾配
	function windowedGradientPerYear( t, heightGradient ) {

		const half = SPEED.gradientWindowYears / years;
		if ( ! lengthPerProgress || ! ( half > 0 ) ) return heightGradient / years;
		const t1 = Math.max( 0, t - half );
		const t2 = Math.min( 1, t + half );
		if ( t2 <= t1 ) return heightGradient / years;
		const y1 = curve.getPointAt( t1 ).y;
		const y2 = curve.getPointAt( t2 ).y;
		return ( y2 - y1 ) / ( ( t2 - t1 ) * years );

	}

	const ride = {
		/** 0..1。データの最初の日付から最後の日付まで（時間に比例）。 */
		progress: START_PROGRESS,
		/** 速さ（年/秒）。冒頭の説明。 */
		speed: 0,
		/** 速さを progress / ms で（speed ÷ ( T × 1000 )）。代入すると speed を換算して変える。 */
		get velocity() {

			return ride.speed * perYearPerSecond;

		},
		set velocity( value ) {

			ride.speed = value / perYearPerSecond;

		},
		/** いまの速さの、その位置の基準の速さに対する倍率（平らなところで 1。SPEED.minFactor .. maxFactor）。 */
		get factor() {

			return ride.speed / baseAt( ride.progress );

		},
		/** いまの位置での速さの範囲（progress / ms）：{ min, cruise, max }。平らなところで cruise。 */
		speedRange( t = ride.progress ) {

			const base = baseAt( t ) * perYearPerSecond;
			const [ lo, hi ] = speedFactorRange( motion );
			return { min: base * lo, cruise: base, max: base * hi };

		},
		/** true の間は進まない。 */
		paused: false,
		/** START を押すまで進まない。 */
		started: false,
		/** 最後の週まで走って止まっている。restart() で false に戻る。 */
		finished: false,
		/** 車体の位置（レール上 + オフセット）。 */
		position: new Vector3(),
		/** 車体の向き（目標へ滑らかに補間済み）。 */
		quaternion: new Quaternion(),

		/** いま使っている走行の係数（読み取り専用。変えるときは setMotion）。 */
		get motion() {

			return motion;

		},

		/** 走行の係数を差し替える。overrides にない係数は createRide の options（なければ既定の値）に戻る。null で全部戻す。 */
		setMotion( overrides = null ) {

			motion = { ...baseMotion, ...pickMotion( overrides ) };

		},

		/** 現在の progress に合わせて position と目標の向きを計算する。blend は向きを目標へ近づける割合（1 以上で即座に合わせる）。 */
		updatePose( blend ) {

			const t = Math.min( Math.max( ride.progress, 0 ), 1 );

			ride.position.copy( curve.getPointAt( t ) );
			ride.position.y += TRAIN_RAIL_OFFSET;

			tangent.copy( curve.getTangentAt( t ) );
			const heightGradient = curve.getHeightGradientAt( t );

			// レール方向（傾斜を含む）に合わせる。tangent は水平の単位ベクトルなので、y 成分が水平の長さあたりの傾き
			const perLength = lengthPerProgress ? 1 / lengthPerProgress( t ) : 1;
			railDirection.set( tangent.x, visualGradient( t, heightGradient, perLength ) * perLength * motion.railSlopeRatio, tangent.z ).normalize();

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
			// 初速は下限（基準の速さ × minFactor）
			ride.speed = baseAt( START_PROGRESS ) * SPEED.minFactor;
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

		/** 最初の週へ戻して再開する（一時停止も終了も解除）。'restart' を発行する。started は変えない。 */
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
			ride.progress = Math.min( ride.progress + ride.velocity * delta, 1 );

			// 60fps の 1 フレームで ORIENTATION_BLEND_PER_FRAME だけ近づく補間を、時間で換算する
			const blend = 1 - Math.pow( 1 - motion.orientationBlendPerFrame, delta / FRAME_MS );
			const heightGradient = ride.updatePose( blend );
			const speedGradient = windowedGradientPerYear( ride.progress, heightGradient );

			// 高さの勾配から目標の速度を決め、一次遅れで近づく（重力効果）。下りで速く、上りで遅くなる。
			// 1 フレームのあいだ目標は一定とみなし、指数で厳密に積分する（フレームレートによらない）
			// 勾配は 1 年あたりに直す（dy/dt ÷ T）
			const base = baseAt( ride.progress );
			const target = base * speedFactor( speedGradient, motion );
			ride.speed = target + ( ride.speed - target ) * Math.exp( - delta / Math.max( 1, motion.speedResponseMs ) );
			// 範囲に収める（setMotion で上限が下がったときは、すぐに収める。上限は下限より下げない）
			const [ lo, hi ] = speedFactorRange( motion );
			ride.speed = Math.max( base * lo, Math.min( base * hi, ride.speed ) );

			// 最後の週に着いたら止まる
			if ( ride.progress >= 1 ) ride.finish();

		}
	};

	ride.reset();

	return ride;

}
