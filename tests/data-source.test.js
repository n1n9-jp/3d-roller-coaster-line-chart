import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, buildMeta } from '../scripts/fetch-nikkei.mjs';
import { aggregateWeekly, mondayOf } from '../scripts/lib/weekly.mjs';
import {
	buildDataset, dateToIndex, datasetIdFromSearch, dataModeFromSearch, loadData, LocalDataMissingError
} from '../assets/js/data.js';
import { DATASETS, DEFAULT_DATASET } from '../assets/js/config.js';
import { createFormatter } from '../assets/js/format.js';
import { readJson } from './helpers.js';

// ---- 取得スクリプトの週次集計 ----

test( 'mondayOf：週は月曜始まり（日曜は前の月曜の週）', () => {

	assert.equal( mondayOf( '2024-01-08' ), '2024-01-08' ); // 月
	assert.equal( mondayOf( '2024-01-12' ), '2024-01-08' ); // 金
	assert.equal( mondayOf( '2024-01-14' ), '2024-01-08' ); // 日
	assert.equal( mondayOf( '2025-01-01' ), '2024-12-30' ); // 年をまたぐ
	assert.equal( mondayOf( '2024-03-01' ), '2024-02-26' ); // うるう日をまたぐ

} );

test( 'parseCsv：ヘッダ、空欄、"." の休場日は除く', () => {

	const csv = 'observation_date,NIKKEI225\n2024-01-04,33288.29\n2024-01-05,.\n2024-01-06,\n2024-01-09,33763.18\n';
	assert.deepEqual( parseCsv( csv ), [
		{ date: '2024-01-04', close: 33288.29 },
		{ date: '2024-01-09', close: 33763.18 }
	] );

} );

test( 'aggregateWeekly：週の最終営業日の終値を、週の月曜日付でとる', () => {

	const daily = [
		{ date: '2024-01-08', close: 100 },
		{ date: '2024-01-09', close: 110 },
		// 水曜は休場（行なし）
		{ date: '2024-01-11', close: 120 },
		{ date: '2024-01-12', close: 130.456 }
	];
	assert.deepEqual( aggregateWeekly( daily ), [ { date: '2024-01-08', close: 130.46 } ] );

} );

test( 'aggregateWeekly：金曜が休場なら木曜の終値、入力が逆順でも同じ', () => {

	const daily = [
		{ date: '2024-02-08', close: 20 },
		{ date: '2024-02-05', close: 10 },
		{ date: '2024-02-07', close: 15 }
	];
	assert.deepEqual( aggregateWeekly( daily ), [ { date: '2024-02-05', close: 20 } ] );

} );

test( 'aggregateWeekly：営業日のない週は行を作らない', () => {

	const daily = [
		{ date: '2024-01-05', close: 1 }, // 週 01-01
		{ date: '2024-01-12', close: 2 }, // 週 01-08
		// 01-15 の週は営業日なし
		{ date: '2024-01-22', close: 3 } // 週 01-22
	];
	const weekly = aggregateWeekly( daily );
	assert.deepEqual( weekly.map( w => w.date ), [ '2024-01-01', '2024-01-08', '2024-01-22' ] );

} );

test( 'aggregateWeekly：年をまたぐ週は、月曜日付の年に入り、翌年の営業日の終値をとる', () => {

	const daily = [
		{ date: '2024-12-27', close: 39000 }, // 週 12-23
		{ date: '2024-12-30', close: 39100 }, // 週 12-30（月曜）
		{ date: '2025-01-03', close: 39200 }, // 同じ週。年始の休場明け
		{ date: '2025-01-06', close: 39300 } // 週 01-06
	];
	assert.deepEqual( aggregateWeekly( daily ), [
		{ date: '2024-12-23', close: 39000 },
		{ date: '2024-12-30', close: 39200 },
		{ date: '2025-01-06', close: 39300 }
	] );

} );

test( 'buildMeta（日経平均）：同梱の2つのデータと同じ項目のメタ情報', () => {

	const weekly = [ { date: '1990-01-01', close: 1 }, { date: '1990-01-08', close: 2 } ];
	const meta = buildMeta( weekly, '2026-11-14' );
	assert.equal( meta.id, 'nikkei' );
	assert.equal( meta.kind, 'real' );
	assert.equal( meta.unit, '円' );
	assert.equal( meta.decimals, 0 );
	assert.equal( meta.valueLabel, '週の最終営業日の値' );
	assert.equal( meta.fetchedAt, '2026-11-14' );
	assert.equal( meta.start, '1990-01-01' );
	assert.equal( meta.end, '1990-01-08' );
	assert.equal( meta.count, 2 );
	assert.equal( meta.sourceUrl, 'https://fred.stlouisfed.org/series/NIKKEI225' );
	assert.ok( meta.attribution && meta.processing );
	// 同梱のメタ情報（ドル円）と項目の名前と順序が同じ
	assert.deepEqual( Object.keys( meta ), Object.keys( readJson( 'data/usdjpy.meta.json' ) ) );

} );

// ---- dateToIndex ----

const gappy = buildDataset( [
	{ date: '2000-01-03', close: 1 },
	{ date: '2000-01-10', close: 2 },
	{ date: '2000-01-17', close: 3 },
	// 01-24 と 01-31 の週が抜けている（14 日あく）
	{ date: '2000-02-07', close: 4 },
	{ date: '2000-02-14', close: 5 }
] );

test( 'dateToIndex：データ点の上では整数の添字', () => {

	assert.equal( dateToIndex( gappy, '2000-01-03' ), 0 );
	assert.equal( dateToIndex( gappy, '2000-01-10' ), 1 );
	assert.equal( dateToIndex( gappy, '2000-01-17' ), 2 );
	assert.equal( dateToIndex( gappy, '2000-02-07' ), 3 );
	assert.equal( dateToIndex( gappy, '2000-02-14' ), 4 );

} );

test( 'dateToIndex：データ点の間は日数で線形補間', () => {

	assert.ok( Math.abs( dateToIndex( gappy, '2000-01-13' ) - ( 1 + 3 / 7 ) ) < 1e-12 );
	assert.ok( Math.abs( dateToIndex( gappy, '2000-01-16' ) - ( 1 + 6 / 7 ) ) < 1e-12 );

} );

test( 'dateToIndex：間隔が抜けている箇所は、その間隔の日数で補間する', () => {

	// 01-17 → 02-07 は 21 日で添字 2 → 3
	assert.equal( dateToIndex( gappy, '2000-01-24' ), 2 + 7 / 21 );
	assert.equal( dateToIndex( gappy, '2000-01-31' ), 2 + 14 / 21 );

} );

test( 'dateToIndex：範囲外は両端に張り付く', () => {

	assert.equal( dateToIndex( gappy, '1990-01-01' ), 0 );
	assert.equal( dateToIndex( gappy, '2000-01-02' ), 0 );
	assert.equal( dateToIndex( gappy, '2000-02-15' ), 4 );
	assert.equal( dateToIndex( gappy, '2030-01-01' ), 4 );

} );

test( 'dateToIndex：同梱データでは日付の順序と添字が単調に対応する', () => {

	const dataset = buildDataset( readJson( 'data/usdjpy.json' ) );
	let prev = - 1;
	for ( const date of [ '1971-01-04', '1985-06-15', '2000-01-01', '2012-12-26', '2020-03-19', '2026-11-02' ] ) {

		const index = dateToIndex( dataset, date );
		assert.ok( index > prev, date );
		prev = index;

	}

	assert.equal( dateToIndex( dataset, '2026-11-02' ), dataset.raw.length - 1 );

} );

// ---- データの切り替え ----

test( 'datasetIdFromSearch：?data= で選ぶ。指定がないとき、知らない値のときは usdjpy', () => {

	assert.equal( DEFAULT_DATASET, 'usdjpy' );
	assert.equal( datasetIdFromSearch( '' ), 'usdjpy' );
	assert.equal( datasetIdFromSearch( '?data=usdjpy' ), 'usdjpy' );
	assert.equal( datasetIdFromSearch( '?data=jgb10' ), 'jgb10' );
	assert.equal( datasetIdFromSearch( '?data=nikkei' ), 'nikkei' );
	assert.equal( datasetIdFromSearch( '?a=1&data=jgb10' ), 'jgb10' );
	assert.equal( datasetIdFromSearch( '?data=foo' ), 'usdjpy' );
	assert.equal( datasetIdFromSearch( '?data=' ), 'usdjpy' );
	assert.equal( datasetIdFromSearch( '?data=JGB10' ), 'usdjpy' ); // 大文字小文字は区別する

} );

test( 'datasetIdFromSearch：以前の ?data=local は nikkei と同じ', () => {

	assert.equal( datasetIdFromSearch( '?data=local' ), 'nikkei' );
	assert.equal( dataModeFromSearch( '?data=local' ), 'nikkei' );

} );

test( 'datasetIdFromSearch：Object のプロパティ名（constructor など）は、データの id として扱わない', () => {

	for ( const name of [ 'constructor', 'toString', '__proto__', 'hasOwnProperty' ] ) {

		assert.equal( datasetIdFromSearch( `?data=${name}` ), 'usdjpy', name );

	}

} );

test( 'DATASETS：3 つのデータが、書式の定義（単位・桁数・刻み・前週比の書き方・ラベル）をそろえて持つ', () => {

	assert.deepEqual( Object.keys( DATASETS ), [ 'usdjpy', 'jgb10', 'nikkei' ] );
	for ( const [ id, def ] of Object.entries( DATASETS ) ) {

		assert.equal( def.id, id );
		for ( const key of [ 'dataUrl', 'metaUrl', 'name', 'short', 'chartTitle', 'readoutLabel', 'unit' ] ) {

			assert.equal( typeof def[ key ], 'string', `${id}.${key}` );

		}

		assert.ok( Number.isInteger( def.decimals ) && def.decimals >= 0, id );
		assert.ok( def.step > 0 && def.stepCompact > def.step, id );
		assert.ok( [ 'yen-fx', 'point', 'percent' ].includes( def.changeMode ), id );
		assert.ok( def.statLabels.max && def.statLabels.min, id );

	}

	assert.equal( DATASETS.nikkei.dataUrl, './data/local/nikkei225.json' );
	assert.equal( DATASETS.nikkei.metaUrl, './data/local/meta.json' );
	assert.equal( DATASETS.nikkei.localOnly, true );

} );

test( 'buildDataset：meta と def を持つ。dataset.id・def・meta・format（省略時はドル円）', () => {

	const raw = [ { date: '2000-01-03', close: 1 }, { date: '2000-01-10', close: 2 } ];
	const meta = { kind: 'real', id: 'jgb10' };
	const dataset = buildDataset( raw, 4, meta, DATASETS.jgb10 );
	assert.equal( dataset.meta, meta );
	assert.equal( dataset.id, 'jgb10' );
	assert.equal( dataset.def, DATASETS.jgb10 );
	assert.equal( dataset.format.unit, '%' );

	const byDefault = buildDataset( raw );
	assert.equal( byDefault.id, 'usdjpy' );
	assert.equal( byDefault.def, DATASETS.usdjpy );
	assert.equal( byDefault.format.value( 152.344 ), '152.34円' );
	assert.equal( byDefault.meta.kind, 'real' );

} );

// ---- loadData（fetch を差し替えて確かめる） ----

/** globalThis.fetch を差し替えて fn を実行する。responses：URL → { status, body }（無ければ 404）。 */
async function withFetch( responses, fn ) {

	const original = globalThis.fetch;
	const requested = [];
	globalThis.fetch = async ( url ) => {

		requested.push( url );
		const r = responses[ url ] ?? { status: 404 };
		return { ok: r.status === undefined || r.status < 400, status: r.status ?? 200, json: async () => r.body };

	};

	try {

		return await fn( requested );

	} finally {

		globalThis.fetch = original;

	}

}

const TWO_WEEKS = [ { date: '2000-01-03', close: 1 }, { date: '2000-01-10', close: 2 } ];

test( 'loadData：既定はドル円。{ id, def, series, meta } を返す', async () => {

	const responses = {
		'./data/usdjpy.json': { body: TWO_WEEKS },
		'./data/usdjpy.meta.json': { body: readJson( 'data/usdjpy.meta.json' ) }
	};
	await withFetch( responses, async ( requested ) => {

		for ( const search of [ '', '?data=foo' ] ) {

			const loaded = await loadData( search );
			assert.equal( loaded.id, 'usdjpy' );
			assert.equal( loaded.def, DATASETS.usdjpy );
			assert.equal( loaded.series, TWO_WEEKS );
			assert.equal( loaded.meta.id, 'usdjpy' );

		}

		assert.ok( requested.every( ( url ) => url.includes( 'usdjpy' ) ) );

	} );

} );

test( 'loadData：?data=jgb10 は金利のファイルを読む', async () => {

	const responses = {
		'./data/jgb10.json': { body: TWO_WEEKS },
		'./data/jgb10.meta.json': { body: readJson( 'data/jgb10.meta.json' ) }
	};
	const loaded = await withFetch( responses, () => loadData( '?data=jgb10' ) );
	assert.equal( loaded.id, 'jgb10' );
	assert.equal( loaded.meta.unit, '%' );

} );

test( 'loadData：?data=nikkei と ?data=local は data/local/ を読む。古いメタ情報（id・unit なし）は定義で補う', async () => {

	const oldMeta = { kind: 'real', label: '日経平均株価（週次終値）', fetchedAt: '2026-11-14' };
	const responses = {
		'./data/local/nikkei225.json': { body: TWO_WEEKS },
		'./data/local/meta.json': { body: oldMeta }
	};
	for ( const search of [ '?data=nikkei', '?data=local' ] ) {

		const loaded = await withFetch( responses, () => loadData( search ) );
		assert.equal( loaded.id, 'nikkei', search );
		assert.equal( loaded.meta.id, 'nikkei' );
		assert.equal( loaded.meta.unit, '円' );
		assert.equal( loaded.meta.fetchedAt, '2026-11-14' );

	}

} );

test( 'loadData：nikkei のファイルが無い（404）ときは、取得コマンドを案内する LocalDataMissingError', async () => {

	await assert.rejects( withFetch( {}, () => loadData( '?data=nikkei' ) ), ( error ) => {

		assert.ok( error instanceof LocalDataMissingError );
		assert.match( error.message, /npm run fetch-data/ );
		return true;

	} );

} );

test( 'loadData：同梱のデータの 404 や、形式の誤りは、ふつうの Error（LocalDataMissingError ではない）', async () => {

	await assert.rejects( withFetch( {}, () => loadData( '' ) ), ( error ) => {

		assert.ok( ! ( error instanceof LocalDataMissingError ) );
		assert.match( error.message, /404/ );
		return true;

	} );

	const bad = {
		'./data/usdjpy.json': { body: [ { date: '2000-01-03', close: 1 } ] }, // 1 週しかない
		'./data/usdjpy.meta.json': { body: {} }
	};
	await assert.rejects( withFetch( bad, () => loadData( '' ) ), /形式が正しくありません/ );

	const wrongId = {
		'./data/usdjpy.json': { body: TWO_WEEKS },
		'./data/usdjpy.meta.json': { body: { id: 'jgb10' } }
	};
	await assert.rejects( withFetch( wrongId, () => loadData( '' ) ), /形式が正しくありません/ );

} );

// ---- 同梱の実データ ----

for ( const [ id, count, first, last ] of [ [ 'usdjpy', 2912, '1971-01-04', '2026-11-02' ], [ 'jgb10', 2105, '1986-06-30', '2026-11-09' ] ] ) {

	test( `同梱データ（${id}）：{ date, close } だけの ${count} 件で、メタ情報と一致し、定義と単位・桁数がそろう`, () => {

		const series = readJson( `data/${id}.json` );
		const meta = readJson( `data/${id}.meta.json` );
		const def = DATASETS[ id ];

		assert.equal( series.length, count );
		assert.equal( series[ 0 ].date, first );
		assert.equal( series.at( - 1 ).date, last );
		for ( const row of series ) {

			assert.deepEqual( Object.keys( row ).sort(), [ 'close', 'date' ] );
			assert.equal( typeof row.close, 'number' );

		}

		assert.equal( meta.id, id );
		assert.equal( meta.kind, 'real' );
		assert.equal( meta.start, series[ 0 ].date );
		assert.equal( meta.end, series.at( - 1 ).date );
		assert.equal( meta.count, series.length );
		assert.equal( meta.unit, def.unit );
		assert.equal( meta.decimals, def.decimals );
		assert.equal( meta.label, def.name );
		for ( const key of [ 'valueLabel', 'attribution', 'processing', 'fetchedAt' ] ) assert.ok( meta[ key ], key );

	} );

	test( `同梱データ（${id}）：読み込んだあとの dataset は、id・meta・def・format を持つ`, async () => {

		const responses = {
			[ DATASETS[ id ].dataUrl ]: { body: readJson( `data/${id}.json` ) },
			[ DATASETS[ id ].metaUrl ]: { body: readJson( `data/${id}.meta.json` ) }
		};
		const loaded = await withFetch( responses, () => loadData( `?data=${id}` ) );
		const dataset = buildDataset( loaded.series, 4, loaded.meta, loaded.def );

		assert.equal( dataset.id, id );
		assert.equal( dataset.meta.id, id );
		assert.equal( dataset.meta.attribution, readJson( `data/${id}.meta.json` ).attribution );
		assert.equal( dataset.def, DATASETS[ id ] );
		assert.equal( dataset.format.unit, DATASETS[ id ].unit );
		assert.equal( dataset.raw.length, count );

		// 範囲は書式の軸の規則に収まる
		const { axisMin, axisMax } = dataset.format.ticks( dataset.rawRange.min, dataset.rawRange.max );
		assert.ok( axisMin <= dataset.rawRange.min && axisMax >= dataset.rawRange.max );

	} );

}

test( 'createFormatter：buildDataset の format は、定義から作ったものと同じ書式', () => {

	const dataset = buildDataset( TWO_WEEKS, 4, undefined, DATASETS.jgb10 );
	const direct = createFormatter( DATASETS.jgb10 );
	assert.equal( dataset.format.value( - 0.2934 ), direct.value( - 0.2934 ) );

} );
