// 走行の状態 → 音のパラメータの写像（純粋関数。DOM にも AudioContext にも依存しない。Node でそのままテストできる）。
//
//   値の高さ h（データの最小〜最大を 0..1）→ 音の粒の音域の中心（音階の段）と、ローパスのカットオフ（指数で補間）
//   勾配（1 年あたりの高さの変化）           → 和音の色 color = tanh( 勾配 / slopeScale )（−1 暗い .. +1 明るい）。時定数でなめらかにする
//   速さの比 factor（ride.factor）          → 音の粒の間隔 = intervalCruise ÷ factor^speedExponent（範囲に収める）
//   出来事の通過                            → 前回と今回の進行位置の区間 ( 前回, 今回 ] にある出来事（位置が飛んだ・巻き戻ったときは返さない）
//
// 数値はすべて config.js の SOUND（引数で差し替えられる）。

import { SOUND } from '../config.js';

const clamp01 = ( x ) => Math.min( 1, Math.max( 0, x ) );

/** 値 → 0..1（データの最小〜最大）。範囲外は端に張り付く。数でない・範囲が 0 のときは 0.5。 */
export function normalizeValue( value, min, max ) {

	if ( ! Number.isFinite( value ) || ! Number.isFinite( min ) || ! Number.isFinite( max ) || max <= min ) return 0.5;
	return clamp01( ( value - min ) / ( max - min ) );

}

/** 指数の補間：h = 0 で lo、1 で hi。h は 0..1 に収める。 */
export function expLerp( lo, hi, h ) {

	const t = Number.isFinite( h ) ? clamp01( h ) : 0.5;
	return lo * Math.pow( hi / lo, t );

}

/** 音階の段 → 周波数。step k = rootHz × 2^floor( k / n ) × 2^( scale[ k mod n ] / 12 )（n は音階の音の数）。負の段も使える。 */
export function stepFrequency( step, scale, rootHz = SOUND.rootHz ) {

	const n = scale.length;
	const k = Math.round( step );
	const octave = Math.floor( k / n );
	const degree = ( ( k % n ) + n ) % n;
	return rootHz * Math.pow( 2, octave + scale[ degree ] / 12 );

}

/** 値の高さ → 音の粒の音域の中心（段。小数）。 */
export function grainCenterStep( h, grain = SOUND.grain ) {

	const t = Number.isFinite( h ) ? clamp01( h ) : 0.5;
	return grain.stepLow + t * ( grain.stepHigh - grain.stepLow );

}

/** 値の高さ → パッドのカットオフ（Hz）。 */
export function padCutoff( h, pad = SOUND.pad ) {

	return expLerp( pad.cutoffMinHz, pad.cutoffMaxHz, h );

}

/** 値の高さ → 音の粒のカットオフ（Hz）。 */
export function grainCutoff( h, grain = SOUND.grain ) {

	return expLerp( grain.cutoffMinHz, grain.cutoffMaxHz, h );

}

/** 勾配（1 年あたりの高さの変化）→ 和音の色（−1 .. +1）。上りで明るく（+）、下りで暗く（−）。数でなければ 0。 */
export function slopeColor( slopePerYear, mapping = SOUND.mapping ) {

	if ( ! Number.isFinite( slopePerYear ) ) return 0;
	return Math.tanh( slopePerYear / mapping.slopeScale );

}

/** 一次遅れでなめらかにする：dt 秒で目標との差が exp( − dt / tau ) 倍になる。dt が 0 以下なら変えない。 */
export function smoothToward( current, target, dtSeconds, tauSeconds ) {

	if ( ! Number.isFinite( current ) ) return target;
	if ( ! ( dtSeconds > 0 ) ) return current;
	if ( ! ( tauSeconds > 0 ) ) return target;
	return target + ( current - target ) * Math.exp( - dtSeconds / tauSeconds );

}

/** 色 → パッドの長 3 度・短 3 度の音量（合計の電力が一定になるよう平方根で混ぜる）。 */
export function thirdMix( color ) {

	const c = Number.isFinite( color ) ? Math.max( - 1, Math.min( 1, color ) ) : 0;
	const major = ( 1 + c ) / 2;
	return { major: Math.sqrt( major ), minor: Math.sqrt( 1 - major ) };

}

/** 速さの比（ride.factor。基準の速さで 1）→ 音の粒の間隔（秒）。比が数でない・0 以下のときは基準の間隔。 */
export function grainInterval( speedRatio, grain = SOUND.grain ) {

	const ratio = Number.isFinite( speedRatio ) && speedRatio > 0 ? speedRatio : 1;
	const interval = grain.intervalCruise / Math.pow( ratio, grain.speedExponent );
	return Math.min( grain.intervalMax, Math.max( grain.intervalMin, interval ) );

}

/**
 * 次の音の粒を決める（休符なら null）。random は 0..1 の乱数を返す関数（テストで差し替える）。
 * 音階は色の確率で選ぶ（color = +1 で必ず明るい音階、−1 で必ず暗い音階）。段は音域の中心 ±spread。
 * 戻り値 { step, scale, frequency, pan }
 */
export function pickGrain( { h, color }, random = Math.random, sound = SOUND ) {

	const grain = sound.grain;
	if ( random() < grain.restProbability ) return null;
	const c = Number.isFinite( color ) ? Math.max( - 1, Math.min( 1, color ) ) : 0;
	const scale = random() < ( 1 + c ) / 2 ? sound.scales.bright : sound.scales.dark;
	const center = grainCenterStep( h, grain );
	const step = Math.round( center + ( random() * 2 - 1 ) * grain.spread );
	return {
		step,
		scale,
		frequency: stepFrequency( step, scale, sound.rootHz ),
		pan: ( random() * 2 - 1 ) * grain.pan
	};

}

/** 出来事の位置の値の高さ → 鐘の周波数（明るい音階の stepLow..stepHigh）。 */
export function bellFrequency( h, sound = SOUND ) {

	const { stepLow, stepHigh } = sound.bell;
	const t = Number.isFinite( h ) ? clamp01( h ) : 0.5;
	return stepFrequency( Math.round( stepLow + t * ( stepHigh - stepLow ) ), sound.scales.bright, sound.rootHz );

}

/**
 * 出来事の通過：前回 previous から今回 current までに進んだ区間 ( previous, current ] に progress がある出来事を、位置の順に返す。
 * 1 回の進みが maxStep を超える（位置が飛んだ）、巻き戻った、進んでいない、previous がない（null）ときは空の配列。
 * しきい値は events-data.js の createCaptionScheduler（maxStepProgress = captionStepLimit( curve.years )）と同じ考え方。
 */
export function passedEvents( previous, current, events, maxStep ) {

	if ( ! Number.isFinite( previous ) || ! Number.isFinite( current ) || ! Array.isArray( events ) ) return [];
	const step = current - previous;
	if ( ! ( step > 0 ) || step > maxStep ) return [];
	return events
		.filter( ( event ) => Number.isFinite( event?.progress ) && event.progress > previous && event.progress <= current )
		.sort( ( a, b ) => a.progress - b.progress );

}

/**
 * 1 回分の音のパラメータ（エンジンへ渡す）。
 * @param h 値の高さ 0..1
 * @param color なめらかにした和音の色 −1..+1
 * @param speedRatio ride.factor
 */
export function soundParams( { h, color, speedRatio }, sound = SOUND ) {

	return {
		h: Number.isFinite( h ) ? clamp01( h ) : 0.5,
		color: Number.isFinite( color ) ? Math.max( - 1, Math.min( 1, color ) ) : 0,
		padCutoff: padCutoff( h, sound.pad ),
		grainCutoff: grainCutoff( h, sound.grain ),
		interval: grainInterval( speedRatio, sound.grain ),
		third: thirdMix( color )
	};

}
