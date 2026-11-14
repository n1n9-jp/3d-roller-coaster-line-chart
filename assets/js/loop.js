// 周回の位置（progress、0..1）とデータ系列の位置（index、小数）の変換。three.js に依存しない。
//
// データ区間は progress 0 .. dataEnd（= 1 - linkFraction）で、系列の先頭から末尾（index 0 .. n - 1）に対応する。
// dataEnd より先は連絡区間（系列に対応する位置がない）。linkFraction が 0 のときは連絡区間なしで、
// progress * ( n - 1 ) と同じになる。

import { LOOP } from './config.js';

export function dataEndOf( linkFraction = LOOP.linkFraction ) {

	return 1 - linkFraction;

}

export function isLink( t, linkFraction = LOOP.linkFraction ) {

	return t > dataEndOf( linkFraction );

}

/** progress → 系列上の位置（小数）。連絡区間では null。範囲外の負数は 0 に丸める。 */
export function progressToIndex( t, n, linkFraction = LOOP.linkFraction ) {

	const dataEnd = dataEndOf( linkFraction );
	if ( t > dataEnd ) return null;
	return Math.max( 0, t ) / dataEnd * ( n - 1 );

}

/** 系列上の位置（小数）→ progress。 */
export function indexToProgress( u, n, linkFraction = LOOP.linkFraction ) {

	return u / ( n - 1 ) * dataEndOf( linkFraction );

}

/** 系列上の位置（小数）が指すデータ点（切り捨て、範囲に丸める）。 */
export function pointAtIndex( series, u ) {

	return series[ Math.min( series.length - 1, Math.max( 0, Math.floor( u ) ) ) ];

}

// ---- 連絡区間の高さ（3 次エルミート補間） ----

/**
 * 3 次エルミート補間。s は 0..1（区間内の正規化位置）、h は区間の長さ（progress 単位）、
 * m0 / m1 は両端の勾配（dy/dt、progress あたり）。戻り値は { y, dy }（dy は dy/dt）。
 */
export function hermite( y0, m0, y1, m1, h, s ) {

	const s2 = s * s;
	const s3 = s2 * s;
	const y = ( 2 * s3 - 3 * s2 + 1 ) * y0 + ( s3 - 2 * s2 + s ) * h * m0 + ( - 2 * s3 + 3 * s2 ) * y1 + ( s3 - s2 ) * h * m1;
	const dy = ( ( 6 * s2 - 6 * s ) * y0 + ( 3 * s2 - 4 * s + 1 ) * h * m0 + ( - 6 * s2 + 6 * s ) * y1 + ( 3 * s2 - 2 * s ) * h * m1 ) / h;
	return { y, dy };

}

/** エルミート曲線の勾配 |dy/dt| の区間内の最大値（解析解。勾配は s の 2 次式なので、候補は両端と頂点）。 */
export function hermiteMaxAbsGradient( y0, m0, y1, m1, h ) {

	const candidates = [ 0, 1 ];
	const A = 6 * y0 + 3 * h * m0 - 6 * y1 + 3 * h * m1;
	const B = - 6 * y0 - 4 * h * m0 + 6 * y1 - 2 * h * m1;
	if ( Math.abs( A ) > 1e-15 ) {

		const vertex = - B / ( 2 * A );
		if ( vertex > 0 && vertex < 1 ) candidates.push( vertex );

	}

	return Math.max( ...candidates.map( s => Math.abs( hermite( y0, m0, y1, m1, h, s ).dy ) ) );

}

/**
 * 連絡区間の両端の勾配を決める（単調制限）。δ = ( y1 - y0 ) / h を連絡区間の平均勾配とし、
 * データ側の片側勾配が δ と同じ向きならそのまま使い（大きさは 1.5 |δ| で頭打ち）、逆向きなら 0 にする。
 * これで連絡区間の高さは単調になり、y0 と y1 の間に収まる。
 * maxSlope（dy/dt の絶対値）を渡すと、連絡区間の最大勾配がそれを超えるとき、両端の勾配を平均勾配 δ へ近づけて
 * （δ のとき直線で、最大勾配は |δ|）超えないようにする。|δ| が maxSlope を超えるときは直線にする。
 * 近づけるだけなので、両端の勾配は 0 .. 1.5 δ の間に収まり、単調は保たれる。
 * @param m0Data 連絡区間の始まり（最新の週）でのデータ側の勾配（左側）
 * @param m1Data 連絡区間の終わり（1990 年 1 月）でのデータ側の勾配（右側）
 */
export function linkEndSlopes( { y0, y1, m0Data, m1Data, h, maxSlope = Infinity } ) {

	const delta = ( y1 - y0 ) / h;
	const cap = 1.5 * Math.abs( delta );
	const limit = ( m ) => ( m * delta > 0 ? Math.sign( m ) * Math.min( Math.abs( m ), cap ) : 0 );
	const a = limit( m0Data );
	const b = limit( m1Data );
	const max = ( lambda ) => hermiteMaxAbsGradient( y0, delta + ( a - delta ) * lambda, y1, delta + ( b - delta ) * lambda, h );
	if ( max( 1 ) <= maxSlope ) return { m0: a, m1: b };

	// λ = 1 がデータ側の勾配、λ = 0 が直線。超えない最大の λ を二分探索する。
	let lo = 0;
	let hi = 1;
	for ( let i = 0; i < 40; i ++ ) {

		const mid = ( lo + hi ) / 2;
		if ( max( mid ) <= maxSlope ) lo = mid;
		else hi = mid;

	}

	return { m0: delta + ( a - delta ) * lo, m1: delta + ( b - delta ) * lo };

}
