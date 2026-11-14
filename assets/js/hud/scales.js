// ミニグラフの、描画に依存しない計算（Node のテストからもそのまま読める）。
// Y 軸（値の書式 dataset.format の目盛りから作る）、ラベルの間引き、年の目盛りの位置。

import { dateToIndex } from '../data.js';

/** 縦に並ぶラベルの最小の間隔（CSS px）。11〜12px の文字が重ならない値。 */
export const MIN_LABEL_PITCH = 16;

/**
 * Y 軸。値の書式（dataset.format）の目盛り（ticks）から作る。範囲は表示する生データの最小・最大。
 * 下限 = floor( 最小 / 刻み ) × 刻み、上限 = ceil( 最大 / 刻み ) × 刻み（金利はマイナスがあるので、下限は 0 とは限らない）。
 * @returns {{ min: number, max: number, span: number, count: number, values: number[], step: number, labelEvery: number, baseValue: number }}
 *   count は下限から上限までの刻みの数。baseValue は基線の値（0 が範囲にあれば 0、なければ下限）。
 */
export function yAxis( format, range ) {

	const { axisMin, axisMax, values, step, labelEvery } = format.ticks( range.min, range.max );
	const baseValue = axisMin <= 0 && axisMax >= 0 ? 0 : axisMin;
	return { min: axisMin, max: axisMax, span: axisMax - axisMin, count: values.length - 1, values, step, labelEvery, baseValue };

}

/**
 * ラベルを付ける線の間隔（刻みの何本おきか）。
 * 基本は axis.labelEvery（線が 7 本を超えるとき 2）。描画域が低くて、ラベルの間隔が minPitch に足りないときは、足りるまで 2 倍にする。
 * ラベルは、値が step × 間隔の倍数の線に付く（labelValues）。ドル円（50 刻み、下限 50）なら 100・200・300・400。
 */
export function labelStride( axis, plotHeight, minPitch = MIN_LABEL_PITCH ) {

	let stride = axis.labelEvery;
	const pitch = plotHeight / axis.count;
	while ( pitch * stride < minPitch && stride < axis.count * 2 ) stride *= 2;
	return stride;

}

/** ラベルを付ける目盛りの値（stride は labelStride の戻り値）。 */
export function labelValues( axis, stride ) {

	return axis.values.filter( ( v ) => Math.round( v / axis.step ) % stride === 0 );

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
