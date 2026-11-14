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
// ■ 一人称のカメラ（位置は ride.cameraPosition、向きは ride.quaternion。view.js が使う）
//   位置：進行位置からレールに沿って 3D の長さ SCENE.ride.back だけ後ろの点（足元の点）から、高さ lift だけ離れた点。
//         ふだんは足元の点の真上。急な上りでは、離す向きを真上から後ろへ倒し、カメラを坂の壁（支柱・カーテン）の手前に置く
//         （rideCameraPosition。倒す角度は向きと同じ割合で補間する）。
//   向き：目標の傾きは、前後 RAIL_SLOPE_WINDOW（レールに沿った 3D の長さ）の弦の勾配 × railSlopeRatio。
//         view.js が setFraming( framing ) で縦の画角とカメラの下向きの角度を渡すと、前方のレールが画面に入るように傾きを補正する
//         （値は SCENE.ride.ahead。前方の点は、進行位置からレールに沿って 3D の長さで測る）：
//           目標の傾き：lookDistances 先の点が、縦の画角の端から marginDeg 内側に入る範囲に収める
//             （ゆるやかな区間では効かない。補正が効き始めるところも、向きの補間でなめらかにつながる）。
//           補間した後の傾き：distances 先の点の少なくとも 1 つが、画角の端から hardMarginDeg 内側に入るようにする
//             （急に立ち上がる坂で、補間の遅れで外れないように）。
//           最後に、1 フレームの回転を SCENE.ride.maxTurnDegPerSec で制限する（画面に残すことより優先）。
//         framing を渡さない（テストで ride だけを使う）ときは補正も制限もしない。
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
	TRAIN_RAIL_OFFSET,
	SCENE
} from './config.js';

const DEG = Math.PI / 180;
/** レールに沿った長さを測るときの刻み（水平の長さ）。 */
const RAIL_STEP = 0.02;

// 急な上りでカメラを後ろへ倒すとき、カメラの下に空ける高さと、確かめる範囲（離す距離より先の水平の長さ）
const CLIMB_CLEARANCE = 0.5;
const CLIMB_REACH = 0.5;

const walkPoint = new Vector3();
const walkPrev = new Vector3();

/** 曲線の t あたりの水平距離（持たない曲線では 1）。 */
function lengthPerProgressOf( curve, t ) {

	return typeof curve.lengthPerProgressAt === 'function' ? curve.lengthPerProgressAt( t ) : 1;

}

/**
 * t からレールに沿って dir（+1 で前、−1 で後ろ）へ、3D の長さ length だけ進んだ点の progress。
 * 長さは水平に RAIL_STEP ずつ刻んだ折れ線で測る（週ごとの点の間は直線なので、刻みが細かければ実際の長さに近い）。
 * 曲線の端までに届かないときは null。
 */
export function progressAlongRail( curve, t, length, dir = 1 ) {

	t = Math.min( Math.max( t, 0 ), 1 );
	const dt = RAIL_STEP / lengthPerProgressOf( curve, t );
	walkPrev.copy( curve.getPointAt( t ) );
	let total = 0;
	let s = t;
	while ( dir > 0 ? s < 1 : s > 0 ) {

		const next = dir > 0 ? Math.min( 1, s + dt ) : Math.max( 0, s - dt );
		walkPoint.copy( curve.getPointAt( next ) );
		const step = walkPoint.distanceTo( walkPrev );
		if ( total + step >= length ) return s + ( next - s ) * ( step > 0 ? ( length - total ) / step : 1 );
		total += step;
		walkPrev.copy( walkPoint );
		s = next;

	}

	return null;

}

/**
 * 一人称のカメラを置くレール上の点（足元の点）の progress：progress からレールに沿って長さ back（3D。高さの変化を含む）だけ後ろ。
 * 0 より前になるときは 0 で止める。
 * （「3D の距離が back になる点」は、谷や山を挟むと進むにつれて前後に跳ぶ。レールに沿った長さなら、なめらかに動く。
 * 急な坂では、水平には back より短い距離になる）
 * @param curve getPointAt と lengthPerProgressAt（その位置での t あたりの水平距離）を持つ曲線（TrackCurve）。
 *        lengthPerProgressAt を持たない曲線では、t あたりの距離を 1 とみなす
 */
export function rideCameraProgress( curve, progress, back = SCENE.ride.back ) {

	if ( progress <= 0 ) return 0;
	return progressAlongRail( curve, Math.min( progress, 1 ), back, - 1 ) ?? 0;

}

/**
 * 急な上りで、カメラを離す向きを真上から後ろへ倒す角度（rad。0 以上）：
 * 足元の点から進行位置の点を見上げる角度 α が SCENE.ride.climbStartDeg を超えた分（α − climbStartDeg）。
 * ただし、後ろへ離した先で、その手前のレール（谷の向こう側の下り坂など）にカメラが近づく（カメラの下 CLIMB_CLEARANCE より高い）ときは、
 * そうならない角度まで小さくする。
 */
export function rideCameraTilt( curve, progress, footProgress, height = SCENE.ride.height ) {

	const q = curve.getPointAt( Math.min( Math.max( progress, 0 ), 1 ) );
	const qx = q.x, qy = q.y, qz = q.z;
	const p = curve.getPointAt( footProgress );
	const fx = p.x, fy = p.y, fz = p.z;
	const alpha = Math.atan2( qy - fy, Math.hypot( qx - fx, qz - fz ) );
	const psi = Math.max( 0, alpha - SCENE.ride.climbStartDeg * DEG );
	if ( psi === 0 ) return 0;

	// 足元の点から後ろ（水平に、離す距離 + CLIMB_REACH まで）のレールの高さの最大
	const lift = TRAIN_RAIL_OFFSET + height;
	const reach = lift * Math.sin( psi ) + CLIMB_REACH;
	const dt = RAIL_STEP * 5 / lengthPerProgressOf( curve, footProgress );
	let top = - Infinity;
	for ( let s = footProgress - dt; s >= 0; s -= dt ) {

		const r = curve.getPointAt( s );
		if ( Math.hypot( r.x - fx, r.z - fz ) > reach ) break;
		top = Math.max( top, r.y );

	}

	const clear = ( angle ) => top <= fy + lift * Math.cos( angle ) - CLIMB_CLEARANCE;
	if ( clear( psi ) ) return psi;
	let lo = 0, hi = psi;
	for ( let i = 0; i < 12; i ++ ) {

		const mid = ( lo + hi ) / 2;
		if ( clear( mid ) ) lo = mid; else hi = mid;

	}

	return lo;

}

/**
 * 一人称のカメラの位置：足元の点（rideCameraProgress）から、高さ lift = TRAIN_RAIL_OFFSET + height だけ離れた点。
 * ふだんは足元の点の真上。急な上りでは、離す向きを真上から後ろへ tilt だけ倒す（上へ lift·cos tilt、水平に後ろへ lift·sin tilt）。
 * 真上のままでは、カメラが坂の壁の前（支柱やカーテンの中）に入るので、レールに座っている向きのように、坂の手前へ離す。
 * 下りでは真上のまま（前方のレールは下へ離れていく）。
 * さらに、前方のすぐ先のレールに近すぎるときは raise だけ持ち上げる（rideCameraRaise）。
 * @param out 結果を入れる {x,y,z}（Vector3 など）。そのまま返す
 * @param options { back, height, tilt, raise }。省略すると rideCameraTilt・rideCameraRaise（補間しない値）
 */
export function rideCameraPosition( curve, progress, out, { back = SCENE.ride.back, height = SCENE.ride.height, tilt, raise } = {} ) {

	const s = rideCameraProgress( curve, progress, back );
	const psi = tilt ?? rideCameraTilt( curve, progress, s, height );
	const lift = TRAIN_RAIL_OFFSET + height;
	const p = curve.getPointAt( s );
	const fy = p.y;
	const tangent = curve.getTangentAt( s );
	out.x = p.x - tangent.x * lift * Math.sin( psi );
	out.y = fy + lift * Math.cos( psi );
	out.z = p.z - tangent.z * lift * Math.sin( psi );
	out.y += raise ?? rideCameraRaise( curve, s, out );
	return out;

}

/**
 * カメラ camera（足元の点 footProgress から離した位置）を持ち上げる高さ（0 以上）：前方の水平 CLIMB_REACH 以内のレールが
 * カメラの下 CLIMB_CLEARANCE より高いとき（V 字の谷の底で、後ろへ倒しきれないとき）は、その差。足元の点の上 SCENE.ride.maxLift まで。
 */
export function rideCameraRaise( curve, footProgress, camera ) {

	const tangent = curve.getTangentAt( footProgress );
	const tx = tangent.x, tz = tangent.z;
	const fy = curve.getPointAt( footProgress ).y;
	const dt = RAIL_STEP * 5 / lengthPerProgressOf( curve, footProgress );
	let top = - Infinity;
	for ( let u = footProgress; u <= 1; u += dt ) {

		const r = curve.getPointAt( u );
		const ahead = ( r.x - camera.x ) * tx + ( r.z - camera.z ) * tz;
		if ( ahead > CLIMB_REACH ) break;
		if ( ahead >= 0 ) top = Math.max( top, r.y );

	}

	return Math.max( 0, Math.min( top + CLIMB_CLEARANCE, fy + SCENE.ride.maxLift ) - camera.y );

}

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
	const previousQuaternion = new Quaternion();
	const turnTo = new Quaternion();
	// 高さ勾配 dy/dt を、水平の長さあたりの勾配 dy/ds に直す：その位置での t あたりの水平距離 ds/dt で割る。
	// それを持たない曲線（テスト用）では 1 として扱う
	const lengthPerProgress = typeof curve.lengthPerProgressAt === 'function'
		? ( t ) => curve.lengthPerProgressAt( t )
		: null;
	// 車体の傾きに使う勾配は、前後 RAIL_SLOPE_WINDOW（レールに沿った 3D の長さ）の弦の勾配（週ごとの細かい揺れで、視線が上下に振られないように）。
	// ゆるやかな区間では水平の長さとほぼ同じで、急な坂では水平には短い範囲になり、坂の向きについていく。
	// t あたりの距離を持たない曲線（テスト用）では、その点の勾配
	function visualGradient( t, heightGradient ) {

		if ( ! lengthPerProgress ) return heightGradient;
		const t1 = progressAlongRail( curve, t, RAIL_SLOPE_WINDOW, - 1 ) ?? 0;
		const t2 = progressAlongRail( curve, t, RAIL_SLOPE_WINDOW, 1 ) ?? 1;
		if ( t2 <= t1 ) return heightGradient;
		const y1 = curve.getPointAt( t1 ).y;
		const y2 = curve.getPointAt( t2 ).y;
		return ( y2 - y1 ) / ( t2 - t1 );

	}

	// ---- 一人称のカメラ（冒頭の「一人称のカメラ」） ----
	let framing = null;
	let cameraTilt = 0;
	let cameraRaise = 0;
	const aheadPoint = new Vector3();
	const forward = new Vector3();

	/** カメラ camera から見た点 p の仰角（rad。水平の向き heading を含む縦の面で測る）。 */
	function elevationOf( p, camera, heading ) {

		aheadPoint.copy( p ).sub( camera );
		return Math.atan2( aheadPoint.y, aheadPoint.x * heading.x + aheadPoint.z * heading.z );

	}

	const walkFrom = new Vector3();
	const walkTo = new Vector3();
	/**
	 * 前方の点の仰角：進行位置のレールの点から、レールに沿って 3D の長さ distances（昇順）先の点。届かない点は除く。
	 * 長さは水平に RAIL_STEP ずつ刻んだ折れ線で測る（progressAlongRail と同じ）。
	 * （「3D の距離が d になる最初の点」は、谷や山を挟むと進むにつれて前後に跳ぶ。レールに沿った長さなら、なめらかに動く）
	 */
	function aheadElevations( t, distances, camera = ride.cameraPosition, heading = tangent ) {

		const list = [];
		const dt = RAIL_STEP / lengthPerProgress( t );
		walkFrom.copy( curve.getPointAt( t ) );
		let total = 0;
		let s = t;
		let k = 0;
		while ( k < distances.length && s < 1 ) {

			s = Math.min( 1, s + dt );
			walkTo.copy( curve.getPointAt( s ) );
			const step = walkTo.distanceTo( walkFrom );
			while ( k < distances.length && total + step >= distances[ k ] ) {

				list.push( elevationOf( walkFrom.clone().lerp( walkTo, step > 0 ? ( distances[ k ] - total ) / step : 1 ), camera, heading ) );
				k ++;

			}

			total += step;
			walkFrom.copy( walkTo );

		}

		return list;

	}

	/**
	 * 前方の点がすべて、縦の画角の端から margin（rad）内側に入る、車体の傾きの範囲 [ lo, hi ]（rad。上向きが正）。点がないときは null。
	 * カメラの縦の画角の中心からの角度は「仰角 −（車体の傾き + カメラの下向きの角度）」。
	 * 近い点から順に範囲を狭める。ある点で範囲が空になる（谷や山を挟んで、点どうしが画角より離れている）ときは、
	 * それまでの範囲のうちその点に近い端にする（近い点を画面に残し、遠い点の方へできるだけ向ける）。
	 */
	function pitchLimits( list, margin ) {

		if ( list.length === 0 ) return null;
		const h = framing.halfVerticalFov - margin;
		let lo = - Infinity, hi = Infinity;
		for ( const elevation of list ) {

			const a = elevation - h, b = elevation + h;
			if ( a > hi ) {

				lo = hi;
				break;

			}

			if ( b < lo ) {

				hi = lo;
				break;

			}

			lo = Math.max( lo, a );
			hi = Math.min( hi, b );

		}

		return [ lo - framing.pitchOffset, hi - framing.pitchOffset ];

	}

	/** 車体の傾き pitch で、前方の点の少なくとも 1 つが縦の画角の端から margin 内側に入るように、最も近い傾きを返す。 */
	function nearestVisiblePitch( list, margin, pitch ) {

		if ( list.length === 0 ) return pitch;
		const h = framing.halfVerticalFov - margin;
		const view = pitch + framing.pitchOffset;
		let best = view;
		let bestMove = Infinity;
		for ( const elevation of list ) {

			const v = Math.max( elevation - h, Math.min( elevation + h, view ) );
			const move = Math.abs( v - view );
			if ( move < bestMove ) {

				bestMove = move;
				best = v;

			}

		}

		return best - framing.pitchOffset;

	}

	/** q（車体の向き）の傾き（rad。上向きが正）。 */
	function pitchOf( q ) {

		forward.set( 0, 0, - 1 ).applyQuaternion( q );
		return Math.asin( Math.max( - 1, Math.min( 1, forward.y ) ) );

	}

	/** q（車体の向き）の傾きを [ lo, hi ] に収める（水平の向きはそのまま）。収めたら true。 */
	function clampPitch( q, limits ) {

		const pitch = pitchOf( q );
		const clamped = Math.max( limits[ 0 ], Math.min( limits[ 1 ], pitch ) );
		if ( clamped === pitch ) return false;
		const horizontal = Math.hypot( forward.x, forward.z );
		const hx = horizontal > 1e-9 ? forward.x / horizontal : tangent.x;
		const hz = horizontal > 1e-9 ? forward.z / horizontal : tangent.z;
		railDirection.set( hx * Math.cos( clamped ), Math.sin( clamped ), hz * Math.cos( clamped ) );
		targetObject.position.copy( ride.position );
		targetObject.lookAt( lookAtTarget.copy( ride.position ).sub( railDirection ) );
		q.copy( targetObject.quaternion );
		return true;

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
		/** 車体の向き（目標へ滑らかに補間済み）。一人称のカメラの向きは、これに下向きの角度（view.js）を足したもの。 */
		quaternion: new Quaternion(),
		/** 一人称のカメラの位置（冒頭の「一人称のカメラ」）。 */
		cameraPosition: new Vector3(),

		/** いま使っている走行の係数（読み取り専用。変えるときは setMotion）。 */
		get motion() {

			return motion;

		},

		/** 走行の係数を差し替える。overrides にない係数は createRide の options（なければ既定の値）に戻る。null で全部戻す。 */
		setMotion( overrides = null ) {

			motion = { ...baseMotion, ...pickMotion( overrides ) };

		},

		/**
		 * 一人称のカメラの置き方を渡す（view.js が画面の縦横比が変わるたびに呼ぶ）。null で補正をやめる。
		 * @param value { pitchOffset（カメラの下向きの角度。rad。下向きが負）, halfVerticalFov（縦の画角の半分。rad）,
		 *        aheadDistances?, lookDistances?, marginDeg?, hardMarginDeg?, maxTurnDegPerSec? }
		 *        （省略した値は SCENE.ride.ahead と SCENE.ride.maxTurnDegPerSec）
		 */
		setFraming( value ) {

			if ( ! value ) {

				framing = null;
				return;

			}

			const ahead = SCENE.ride.ahead;
			framing = {
				aheadDistances: ahead.distances,
				lookDistances: ahead.lookDistances,
				marginDeg: ahead.marginDeg,
				hardMarginDeg: ahead.hardMarginDeg,
				maxTurnDegPerSec: SCENE.ride.maxTurnDegPerSec,
				...value
			};

		},

		/** 現在の progress に合わせて position と目標の向きを計算する。blend は向きを目標へ近づける割合（1 以上で即座に合わせる）。 */
		updatePose( blend, deltaMs = FRAME_MS ) {

			const t = Math.min( Math.max( ride.progress, 0 ), 1 );

			ride.position.copy( curve.getPointAt( t ) );
			ride.position.y += TRAIN_RAIL_OFFSET;

			tangent.copy( curve.getTangentAt( t ) );
			const heightGradient = curve.getHeightGradientAt( t );

			// カメラの位置：足元の点の上。急な上りで後ろへ倒す角度と、谷の底で持ち上げる高さは、向きと同じ割合で補間する
			const foot = rideCameraProgress( curve, t );
			const tilt = rideCameraTilt( curve, t, foot );
			cameraTilt = blend >= 1 ? tilt : cameraTilt + ( tilt - cameraTilt ) * blend;
			rideCameraPosition( curve, t, ride.cameraPosition, { tilt: cameraTilt, raise: 0 } );
			const raise = rideCameraRaise( curve, foot, ride.cameraPosition );
			cameraRaise = blend >= 1 ? raise : cameraRaise + ( raise - cameraRaise ) * blend;
			ride.cameraPosition.y += cameraRaise;

			// レール方向（傾斜を含む）に合わせる。tangent は水平の単位ベクトルなので、y 成分が水平の長さあたりの傾き
			const perLength = lengthPerProgress ? 1 / lengthPerProgress( t ) : 1;
			railDirection.set( tangent.x, visualGradient( t, heightGradient ) * perLength * motion.railSlopeRatio, tangent.z ).normalize();

			targetObject.position.copy( ride.position );
			targetObject.lookAt( lookAtTarget.copy( ride.position ).sub( railDirection ) );
			targetQuaternion.copy( targetObject.quaternion );

			const framed = framing !== null && lengthPerProgress !== null;
			if ( framed ) {

				// 前方のレールが画面に入るように、目標の傾きを、前方の点（lookDistances）が画角の端から marginDeg 内側に入る範囲に収める
				const soft = pitchLimits( aheadElevations( t, framing.lookDistances ), framing.marginDeg * DEG );
				if ( soft ) clampPitch( targetQuaternion, soft );

			}

			previousQuaternion.copy( ride.quaternion );
			if ( blend >= 1 ) ride.quaternion.copy( targetQuaternion );
			else ride.quaternion.slerp( targetQuaternion, blend );

			// 向きの補間の遅れで外れないように、補間した後の傾きでも、前方の点（aheadDistances）の少なくとも 1 つを画角の内側（hardMarginDeg）に残す
			if ( framed ) {

				const pitch = pitchOf( ride.quaternion );
				const needed = nearestVisiblePitch( aheadElevations( t, framing.aheadDistances ), framing.hardMarginDeg * DEG, pitch );
				if ( needed !== pitch ) clampPitch( ride.quaternion, [ needed, needed ] );

				// 回る速さの上限（maxTurnDegPerSec）。前方の点を画面に残すことより優先する
				if ( blend < 1 && framing.maxTurnDegPerSec > 0 ) {

					const limit = framing.maxTurnDegPerSec * DEG * deltaMs / 1000;
					const angle = previousQuaternion.angleTo( ride.quaternion );
					if ( angle > limit ) {

						turnTo.copy( ride.quaternion );
						ride.quaternion.copy( previousQuaternion ).slerp( turnTo, limit / angle );

					}

				}

			}

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
			const heightGradient = ride.updatePose( blend, delta );
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
