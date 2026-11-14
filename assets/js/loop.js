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
