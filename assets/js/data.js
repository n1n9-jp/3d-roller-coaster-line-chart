// データの読み込みと、系列に対する純粋な計算（three.js に依存しない）。
//
// 系列は { date: 'YYYY-MM-DD', close: number } の配列。
// - raw      : 取得したままの週次終値。HUD の表示値とグラフに使う。
// - smoothed : 移動平均後の系列。レールの形状に使う。

import { DATA_SOURCES, MOVING_AVERAGE_WINDOW } from './config.js';

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
 * 日経平均の週次データとそのメタ情報を取得する。
 * search：URL の検索部（省略時は現在のページの ?data=）。
 * 戻り値の meta は { kind: 'sample' | 'real', label, ... }。
 */
export async function loadData( search = globalThis.location?.search ?? '' ) {

	const mode = dataModeFromSearch( search );
	const source = DATA_SOURCES[ mode ];
	const options = { missingIsLocal: mode === 'local' };

	const [ nikkei, meta ] = await Promise.all( [
		fetchJson( source.nikkei, options ),
		fetchJson( source.meta, options )
	] );

	if ( ! Array.isArray( nikkei ) || nikkei.length < 2 ) {

		throw new Error( `${source.nikkei} の形式が正しくありません` );

	}

	if ( meta?.kind !== 'real' && meta?.kind !== 'sample' ) {

		throw new Error( `${source.meta} の形式が正しくありません` );

	}

	return { nikkei, meta };

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

// ---- 日付と系列上の位置 ----
// 進行位置 t（0..1）は時間に比例する（t = 0 が最初の日付、t = 1 が最後の日付。track.js）。
// 系列上の位置（小数の添字）とは、前後のデータ点の間を日数で線形補間して対応させる（週が抜けていてもよい）。

/** 'YYYY-MM-DD'（UTC の 0 時）→ ミリ秒。数値はそのまま返す。 */
export function toTime( date ) {

	if ( typeof date === 'number' ) return date;
	const ms = Date.parse( `${date}T00:00:00Z` );
	if ( Number.isNaN( ms ) ) throw new Error( `日付の形式が正しくありません：${date}` );
	return ms;

}

const timesCache = new WeakMap();

/** 系列の各点の日付（ms）。系列ごとに 1 回だけ作る。 */
export function seriesTimes( series ) {

	let times = timesCache.get( series );
	if ( ! times || times.length !== series.length ) {

		times = Float64Array.from( series, ( item ) => toTime( item.date ) );
		timesCache.set( series, times );

	}

	return times;

}

/** 日時（ms）→ 系列上の位置（小数）。範囲外は両端に張り付く。 */
export function timeToIndex( times, ms ) {

	const last = times.length - 1;
	if ( ! ( ms > times[ 0 ] ) ) return 0;
	if ( ms >= times[ last ] ) return last;

	// ms 以前で最後のデータ点を二分探索（lo の日付 <= ms < hi の日付）
	let lo = 0;
	let hi = last;
	while ( hi - lo > 1 ) {

		const mid = ( lo + hi ) >> 1;
		if ( times[ mid ] <= ms ) lo = mid;
		else hi = mid;

	}

	return lo + ( ms - times[ lo ] ) / ( times[ hi ] - times[ lo ] );

}

/** 系列上の位置（小数）→ 日時（ms）。範囲外は両端に張り付く。 */
export function indexToTime( times, u ) {

	const last = times.length - 1;
	if ( ! ( u > 0 ) ) return times[ 0 ];
	if ( u >= last ) return times[ last ];
	const i = Math.floor( u );
	return times[ i ] + ( times[ i + 1 ] - times[ i ] ) * ( u - i );

}

/** 進行位置 t（0..1。時間に比例）→ 系列上の位置（小数）。 */
export function progressToSeriesIndex( series, t ) {

	const times = seriesTimes( series );
	const clamped = Math.min( 1, Math.max( 0, t ) );
	return timeToIndex( times, times[ 0 ] + clamped * ( times[ times.length - 1 ] - times[ 0 ] ) );

}

/** 系列上の位置（小数）が指すデータ点（切り捨て、範囲に丸める）。 */
export function pointAtIndex( series, u ) {

	return series[ Math.min( series.length - 1, Math.max( 0, Math.floor( u ) ) ) ];

}

/** t（0..1。時間に比例）が指すデータ点の添字（切り捨て）。 */
export function indexAt( series, t ) {

	const u = progressToSeriesIndex( series, t );
	return Math.min( series.length - 1, Math.max( 0, Math.floor( u ) ) );

}

/** t（0..1。時間に比例）における終値。前後のデータ点を日数で線形補間する。 */
export function interpolateClose( series, t ) {

	const n = series.length;
	const u = progressToSeriesIndex( series, t );
	const i0 = Math.min( n - 1, Math.max( 0, Math.floor( u ) ) );
	const i1 = Math.min( i0 + 1, n - 1 );
	const frac = u - i0;
	return series[ i0 ].close * ( 1 - frac ) + series[ i1 ].close * frac;

}

/**
 * 日付 'YYYY-MM-DD' が指す系列上の位置（小数の添字）。
 * 前後のデータ点の間は日数で線形補間する（間隔が 7 日でなくてもよい）。範囲外は両端に張り付く。
 * これは系列の添字で、進行位置 progress ではない。進行位置へは curve.indexToProgress か curve.dateToProgress で変換する。
 */
export function dateToIndex( dataset, date ) {

	return timeToIndex( seriesTimes( dataset.raw ), toTime( date ) );

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
