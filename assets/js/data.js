// データの読み込みと、系列に対する純粋な計算（three.js に依存しない）。
//
// 系列は { date: 'YYYY-MM-DD', close: number } の配列。
// - raw      : 取得したままの週次終値。HUD の表示値とグラフに使う。
// - smoothed : 移動平均後の系列。レールの形状に使う。

import { DATASETS, DEFAULT_DATASET, MOVING_AVERAGE_WINDOW } from './config.js';
import { createFormatter } from './format.js';

/** ?data=nikkei なのに data/local/ のファイルが無いときのエラー（取得コマンドを案内する）。 */
export class LocalDataMissingError extends Error {

	constructor( url ) {

		super( `${url} が見つかりません。npm run fetch-nikkei を実行して、日経平均株価のデータを取得してください。` );
		this.name = 'LocalDataMissingError';
		this.url = url;

	}

}

/**
 * URL の検索部（?data=usdjpy など）から、使うデータの id（'usdjpy' | 'jgb10' | 'nikkei'）を決める。
 * 指定がないとき、知らない値のときは既定（usdjpy）。以前の ?data=local は nikkei と同じ扱い。
 */
export function datasetIdFromSearch( search ) {

	const value = new URLSearchParams( search ).get( 'data' );
	if ( value === 'local' ) return 'nikkei';
	return typeof value === 'string' && Object.hasOwn( DATASETS, value ) ? value : DEFAULT_DATASET;

}

/** 以前の名前（datasetIdFromSearch と同じ）。 */
export const dataModeFromSearch = datasetIdFromSearch;

async function fetchJson( url, { missingIsLocal = false } = {} ) {

	const response = await fetch( url );
	if ( ! response.ok ) {

		if ( missingIsLocal && response.status === 404 ) throw new LocalDataMissingError( url );
		throw new Error( `${url} の取得に失敗しました（HTTP ${response.status}）` );

	}

	return response.json();

}

/**
 * メタ情報を整える。古い data/local/meta.json（id・unit などが無い）でも読めるよう、足りない項目は定義から補う。
 * 同梱の meta は id・label・valueLabel・unit・decimals・attribution・processing・fetchedAt などを持つ（scripts/lib/output.mjs）。
 */
function normalizeMeta( meta, def ) {

	return {
		id: def.id,
		kind: 'real',
		label: def.name,
		valueLabel: '週の最終営業日の値',
		unit: def.unit,
		decimals: def.decimals,
		...meta
	};

}

/**
 * 選んだデータの週次データとメタ情報を取得する。
 * search：URL の検索部（省略時は現在のページの ?data=）。
 * 戻り値：{ id, def, series, meta }。series は [ { date, close } ]、def は config.js の DATASETS の 1 件。
 */
export async function loadData( search = globalThis.location?.search ?? '' ) {

	const id = datasetIdFromSearch( search );
	const def = DATASETS[ id ];
	const options = { missingIsLocal: Boolean( def.localOnly ) };

	const [ series, meta ] = await Promise.all( [
		fetchJson( def.dataUrl, options ),
		fetchJson( def.metaUrl, options )
	] );

	if ( ! Array.isArray( series ) || series.length < 2 ) {

		throw new Error( `${def.dataUrl} の形式が正しくありません` );

	}

	if ( ! meta || typeof meta !== 'object' || ( meta.id !== undefined && meta.id !== def.id ) ) {

		throw new Error( `${def.metaUrl} の形式が正しくありません` );

	}

	return { id, def, series, meta: normalizeMeta( meta, def ) };

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
 * meta：データのメタ情報（loadData の meta）。def：データの定義（config.js の DATASETS の 1 件。省略時は既定のドル円）。
 * dataset.id・dataset.def・dataset.meta・dataset.format（値の書式。format.js）を持つ。
 */
export function buildDataset( raw, windowSize = MOVING_AVERAGE_WINDOW, meta = undefined, def = DATASETS[ DEFAULT_DATASET ] ) {

	const smoothed = applyMovingAverage( raw, windowSize );

	return {
		id: def.id,
		def,
		meta: meta ?? normalizeMeta( {}, def ),
		format: createFormatter( def ),
		raw,
		smoothed,
		rawRange: closeRange( raw ),
		smoothedRange: closeRange( smoothed ),
		/** t に対応する生データの点（日付と終値）。 */
		rawAt: ( t ) => raw[ indexAt( raw, t ) ]
	};

}
