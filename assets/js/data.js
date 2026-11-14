// データの読み込みと、系列に対する純粋な計算（three.js に依存しない）。
//
// 系列は { date: 'YYYY-MM-DD', close: number } の配列。
// - raw      : 取得したままの週次終値。HUD の表示値とグラフに使う。
// - smoothed : 移動平均後の系列。レールの形状に使う。

import { NIKKEI_URL, YAMANOTE_URL, MOVING_AVERAGE_WINDOW } from './config.js';

import { progressToIndex } from './loop.js';

async function fetchJson( url ) {

	const response = await fetch( url );
	if ( ! response.ok ) {

		throw new Error( `${url} の取得に失敗しました（HTTP ${response.status}）` );

	}

	return response.json();

}

/** 日経平均の週次データと山手線の駅一覧を取得する。 */
export async function loadData() {

	const [ nikkei, yamanote ] = await Promise.all( [
		fetchJson( NIKKEI_URL ),
		fetchJson( YAMANOTE_URL )
	] );

	const stations = yamanote?.[ 0 ]?.station_l;

	if ( ! Array.isArray( nikkei ) || nikkei.length < 2 ) {

		throw new Error( `${NIKKEI_URL} の形式が正しくありません` );

	}

	if ( ! Array.isArray( stations ) || stations.length < 2 ) {

		throw new Error( `${YAMANOTE_URL} の形式が正しくありません` );

	}

	return { nikkei, stations };

}

/** 窓幅 windowSize の移動平均。端では窓を切り詰める。 */
export function applyMovingAverage( data, windowSize ) {

	return data.map( ( item, i ) => {

		const start = Math.max( 0, i - Math.floor( windowSize / 2 ) );
		const end = Math.min( data.length, i + Math.ceil( windowSize / 2 ) );
		let sum = 0;
		for ( let j = start; j < end; j ++ ) {

			sum += data[ j ].close;

		}

		return { ...item, close: sum / ( end - start ) };

	} );

}

/** 系列の終値の最小・最大。 */
export function closeRange( series ) {

	let min = Infinity;
	let max = - Infinity;
	for ( const { close } of series ) {

		if ( close < min ) min = close;
		if ( close > max ) max = close;

	}

	return { min, max };

}

/** t（0..1）が指すデータ点の添字（切り捨て）。連絡区間（dataEnd より先）では最後の点。 */
export function indexAt( series, t, linkFraction ) {

	const u = progressToIndex( t, series.length, linkFraction ) ?? series.length - 1;
	return Math.min( series.length - 1, Math.max( 0, Math.floor( u ) ) );

}

/** t（0..1）における終値を隣り合うデータ点の線形補間で返す。連絡区間では最後の点の値。 */
export function interpolateClose( series, t, linkFraction ) {

	const n = series.length;
	const raw = progressToIndex( t, n, linkFraction ) ?? n - 1;
	const i0 = Math.min( n - 1, Math.max( 0, Math.floor( raw ) ) );
	const i1 = Math.min( i0 + 1, n - 1 );
	const frac = raw - i0;
	return series[ i0 ].close * ( 1 - frac ) + series[ i1 ].close * frac;

}

/** 生データから、表示用（raw）とレール用（smoothed）の系列と範囲をまとめる。 */
export function buildDataset( raw, windowSize = MOVING_AVERAGE_WINDOW ) {

	const smoothed = applyMovingAverage( raw, windowSize );

	return {
		raw,
		smoothed,
		rawRange: closeRange( raw ),
		smoothedRange: closeRange( smoothed ),
		/** t に対応する生データの点（日付と終値）。 */
		rawAt: ( t ) => raw[ indexAt( raw, t ) ]
	};

}
