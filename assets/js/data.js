// データの読み込みと、系列に対する純粋な計算（three.js に依存しない）。
//
// 系列は { date: 'YYYY-MM-DD', close: number } の配列。
// - raw      : 取得したままの週次終値。HUD の表示値とグラフに使う。
// - smoothed : 移動平均後の系列。レールの形状に使う。

import { DATA_SOURCES, YAMANOTE_URL, MOVING_AVERAGE_WINDOW } from './config.js';

import { progressToIndex } from './loop.js';

/** ?data=local なのに data/local/ のファイルが無いときのエラー。 */
export class LocalDataMissingError extends Error {

	constructor( url ) {

		super( `${url} が見つかりません。npm run fetch-data を実行して、実データを取得してください。` );
		this.name = 'LocalDataMissingError';
		this.url = url;

	}

}

/** URL の検索部（?data=local など）から、使うデータの種類（'sample' | 'local'）を決める。 */
export function dataModeFromSearch( search ) {

	return new URLSearchParams( search ).get( 'data' ) === 'local' ? 'local' : 'sample';

}

async function fetchJson( url, { missingIsLocal = false } = {} ) {

	const response = await fetch( url );
	if ( ! response.ok ) {

		if ( missingIsLocal && response.status === 404 ) throw new LocalDataMissingError( url );
		throw new Error( `${url} の取得に失敗しました（HTTP ${response.status}）` );

	}

	return response.json();

}

/**
 * 日経平均の週次データ・そのメタ情報と、山手線の駅一覧を取得する。
 * search：URL の検索部（省略時は現在のページの ?data=）。
 * 戻り値の meta は { kind: 'sample' | 'real', label, ... }。
 */
export async function loadData( search = globalThis.location?.search ?? '' ) {

	const mode = dataModeFromSearch( search );
	const source = DATA_SOURCES[ mode ];
	const options = { missingIsLocal: mode === 'local' };

	const [ nikkei, meta, yamanote ] = await Promise.all( [
		fetchJson( source.nikkei, options ),
		fetchJson( source.meta, options ),
		fetchJson( YAMANOTE_URL )
	] );

	const stations = yamanote?.[ 0 ]?.station_l;

	if ( ! Array.isArray( nikkei ) || nikkei.length < 2 ) {

		throw new Error( `${source.nikkei} の形式が正しくありません` );

	}

	if ( meta?.kind !== 'real' && meta?.kind !== 'sample' ) {

		throw new Error( `${source.meta} の形式が正しくありません` );

	}

	if ( ! Array.isArray( stations ) || stations.length < 2 ) {

		throw new Error( `${YAMANOTE_URL} の形式が正しくありません` );

	}

	return { nikkei, stations, meta };

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

/**
 * 日付 'YYYY-MM-DD' が指す系列上の位置（小数の添字）。
 * 前後のデータ点の間は日数で線形補間する（間隔が 7 日でなくてもよい）。範囲外は両端に張り付く。
 * 位置を t（0..1）にするには、結果を ( dataset.raw.length - 1 ) で割る。
 */
export function dateToIndex( dataset, date ) {

	const series = dataset.raw;
	const last = series.length - 1;
	const target = Date.parse( `${date}T00:00:00Z` );

	if ( Number.isNaN( target ) ) throw new Error( `日付の形式が正しくありません：${date}` );
	if ( target <= Date.parse( `${series[ 0 ].date}T00:00:00Z` ) ) return 0;
	if ( target >= Date.parse( `${series[ last ].date}T00:00:00Z` ) ) return last;

	// date 以前で最後のデータ点を二分探索（lo の日付 <= target < hi の日付）
	let lo = 0;
	let hi = last;
	while ( hi - lo > 1 ) {

		const mid = ( lo + hi ) >> 1;
		if ( Date.parse( `${series[ mid ].date}T00:00:00Z` ) <= target ) lo = mid;
		else hi = mid;

	}

	const t0 = Date.parse( `${series[ lo ].date}T00:00:00Z` );
	const t1 = Date.parse( `${series[ hi ].date}T00:00:00Z` );
	return lo + ( target - t0 ) / ( t1 - t0 );

}

/**
 * 生データから、表示用（raw）とレール用（smoothed）の系列と範囲をまとめる。
 * meta：データのメタ情報（loadData の meta）。dataset.meta.kind === 'real' で実データと判定できる。
 * 省略時はサンプルデータ扱い。
 */
export function buildDataset( raw, windowSize = MOVING_AVERAGE_WINDOW, meta = { kind: 'sample' } ) {

	const smoothed = applyMovingAverage( raw, windowSize );

	return {
		raw,
		smoothed,
		meta,
		rawRange: closeRange( raw ),
		smoothedRange: closeRange( smoothed ),
		/** t に対応する生データの点（日付と終値）。 */
		rawAt: ( t ) => raw[ indexAt( raw, t ) ]
	};

}
