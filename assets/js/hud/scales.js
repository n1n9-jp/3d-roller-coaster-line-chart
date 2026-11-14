// ミニグラフと路線図の、描画に依存しない計算（Node のテストからもそのまま読める）。
// 軸の上限と目盛り、ラベルの間引き、年の目盛りの位置、現在位置に最も近い駅。

import { dateToIndex } from '../data.js';

/** 1 万円。Y 軸の目盛りの刻みは常にこれ（3D の等高線と同じ刻み）。 */
export const YEN_STEP = 10000;

/** グリッド線がこの本数を超えると、ラベルを間引く（仕様：実データの 8 本は間引き、サンプルの 5 本は間引かない）。 */
export const DENSE_GRID_COUNT = 6;

/** 縦に並ぶラベルの最小の間隔（CSS px）。11〜12px の文字が重ならない値。 */
export const MIN_LABEL_PITCH = 16;

/**
 * Y 軸。0 から「最高値を 1 万円単位で切り上げた値」まで、1 万円ごと。
 * @returns {{ top: number, count: number, ticks: number[] }} count は 0 を除く目盛りの本数（= top / 1 万円）
 */
export function yAxis( max, step = YEN_STEP ) {

	const count = Math.max( 1, Math.ceil( max / step ) );
	const ticks = [];
	for ( let k = 0; k <= count; k ++ ) ticks.push( k * step );
	return { top: count * step, count, ticks };

}

/**
 * ラベルを何本おきに付けるか（1 = 1 万円ごと、2 = 2 万円ごと…）。
 * グリッド線が多いとき（6 本を超える）は 2 以上。描画域が低くて、ラベルの間隔が minPitch に足りないときは、足りるまで間引く。
 */
export function labelStep( count, plotHeight, minPitch = MIN_LABEL_PITCH ) {

	let step = count > DENSE_GRID_COUNT ? 2 : 1;
	const pitch = plotHeight / count;
	for ( const candidate of [ 1, 2, 5, 10, 20, 50 ] ) {

		if ( candidate < step ) continue;
		step = candidate;
		if ( pitch * step >= minPitch ) break;

	}

	return step;

}

/** ラベルを付ける目盛りの番号（0 は基線。step の倍数）。 */
export function labelIndices( count, step ) {

	const result = [];
	for ( let k = 0; k <= count; k += step ) result.push( k );
	return result;

}

/** 目盛りのラベル。0 は「0」、それ以外は「1万」「2万」…（1 万円の倍数）。 */
export function formatYenTick( value ) {

	if ( value === 0 ) return '0';
	return `${value / YEN_STEP}万`;

}

/**
 * 年の目盛り。系列の日付から、10 年ごと（1990・2000…）の 1 月 1 日が指す系列上の位置を返す。
 * 位置は日付で補間するので、週が抜けている箇所があっても年の位置は日付どおりになる。
 * 系列より後の年は出さない（最初の年は、1 月 8 日の週から始まっていても、系列の左端に置く）。
 * @returns {{ year: number, index: number }[]}
 */
export function yearTicks( dataset, everyYears = 10 ) {

	const series = dataset.raw;
	if ( ! series.length ) return [];

	const first = Date.parse( `${series[ 0 ].date}T00:00:00Z` );
	const last = Date.parse( `${series[ series.length - 1 ].date}T00:00:00Z` );
	const startYear = Math.ceil( new Date( first ).getUTCFullYear() / everyYears ) * everyYears;
	const ticks = [];

	for ( let year = startYear; ; year += everyYears ) {

		const time = Date.parse( `${year}-01-01T00:00:00Z` );
		if ( time > last ) break;
		ticks.push( { year, index: dateToIndex( dataset, `${year}-01-01` ) } );

	}

	return ticks;

}

/** 現在位置（x, z）に最も近い駅の番号。points は { x, z } の配列。空なら -1。 */
export function nearestStationIndex( points, x, z ) {

	let best = - 1;
	let bestDistance = Infinity;
	for ( let i = 0; i < points.length; i ++ ) {

		const dx = points[ i ].x - x;
		const dz = points[ i ].z - z;
		const d = dx * dx + dz * dz;
		if ( d < bestDistance ) {

			bestDistance = d;
			best = i;

		}

	}

	return best;

}

/** 'YYYY-MM-DD' → 「2025年12月」。 */
export function formatYearMonth( date ) {

	return `${Number( date.substring( 0, 4 ) )}年${Number( date.substring( 5, 7 ) )}月`;

}

/** 整数にして桁区切り：12214.4 → '12,214'。 */
export function formatYen( value ) {

	return Math.round( value ).toLocaleString( 'en-US' );

}
