// 出来事のデータファイル（data/events/*.json）の形式と、同梱データとの整合。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readJson } from './helpers.js';
import { DATASETS } from '../assets/js/config.js';
import { TITLE_MAX, NOTE_MAX, validateEvents, weekRowIndex } from '../assets/js/events-data.js';

const DAY_MS = 86400000;
const days = ( a, b ) => ( Date.parse( `${b}T00:00:00Z` ) - Date.parse( `${a}T00:00:00Z` ) ) / DAY_MS;

const hasNikkei = existsSync( new URL( '../data/local/nikkei225.json', import.meta.url ) );
const FILES = {
	usdjpy: { list: readJson( 'data/events/usdjpy.json' ), series: () => readJson( 'data/usdjpy.json' ), minCount: 12, minGapDays: 180 },
	jgb10: { list: readJson( 'data/events/jgb10.json' ), series: () => readJson( 'data/jgb10.json' ), minCount: 10, minGapDays: 180 },
	// 日経平均は、前の版から引き継いだ 14 件（2 組だけ半年に少し足りない）
	nikkei: { list: readJson( 'data/events/nikkei.json' ), series: () => readJson( 'data/local/nikkei225.json' ), minCount: 12, minGapDays: 150, skip: ! hasNikkei && '手元のデータ（data/local/nikkei225.json）がない' }
};

test( 'DATASETS：どのデータも、出来事のファイルのパスを持つ', () => {

	for ( const [ id, def ] of Object.entries( DATASETS ) ) {

		assert.equal( def.eventsUrl, `./data/events/${id}.json`, id );
		assert.ok( existsSync( new URL( `../${def.eventsUrl.slice( 2 )}`, import.meta.url ) ), `${id} のファイルがない` );

	}

	assert.ok( ! existsSync( new URL( '../data/events.json', import.meta.url ) ), '旧 data/events.json は削除する' );

} );

for ( const [ id, spec ] of Object.entries( FILES ) ) {

	const { list } = spec;

	test( `data/events/${id}.json：形式（必須の項目、日付の書式と昇順、見出しと補足の長さ、URL）`, () => {

		assert.ok( list.length >= spec.minCount && list.length <= 16, `件数 ${list.length}` );
		assert.deepEqual( validateEvents( list ), [] );

		for ( const e of list ) {

			assert.deepEqual( Object.keys( e ).filter( ( k ) => ! [ 'date', 'title', 'note', 'source', 'showValue' ].includes( k ) ), [], `${e.date}：余分な項目（値は書かない）` );
			assert.match( e.date, /^\d{4}-\d{2}-\d{2}$/ );
			assert.ok( [ ...e.title ].length <= TITLE_MAX, e.title );
			assert.ok( [ ...e.note ].length <= NOTE_MAX, e.note );
			assert.match( e.source, /^https:\/\/\S+$/, e.date );

		}

		const dates = list.map( ( e ) => e.date );
		assert.deepEqual( dates, [ ...dates ].sort() );
		assert.equal( new Set( dates ).size, dates.length );

	} );

	test( `data/events/${id}.json：隣り合う出来事は ${spec.minGapDays} 日以上あいている`, () => {

		for ( let i = 1; i < list.length; i ++ ) {

			const gap = days( list[ i - 1 ].date, list[ i ].date );
			assert.ok( gap >= spec.minGapDays, `${list[ i - 1 ].date} と ${list[ i ].date} は ${gap} 日` );

		}

	} );

	test( `data/events/${id}.json：各出来事の日付は、データの期間に入り、値のある週に当たる`, { skip: spec.skip }, () => {

		const series = spec.series();
		const first = series[ 0 ].date;
		const last = series.at( - 1 ).date;

		for ( const e of list ) {

			assert.ok( e.date >= first && e.date <= last, `${e.date} はデータの期間（${first}〜${last}）の外` );
			const row = weekRowIndex( series, e.date );
			assert.notEqual( row, null, `${e.date} を含む週の行がない` );
			assert.ok( Number.isFinite( series[ row ].close ), e.date );

		}

	} );

	test( `data/events/${id}.json：見出しと補足の数値と、同梱データの値が矛盾しない（「N円台」「N%台」）`, { skip: spec.skip }, () => {

		const series = spec.series();
		// 見出しは、その週の前後 1 週。補足は前後 16 週のどこかの週の値で成り立つこと
		const pattern = /(\d+(?:\.\d+)?)(?:〜(\d+(?:\.\d+)?))?(円|%)台/g;

		for ( const e of list ) {

			const row = weekRowIndex( series, e.date );
			for ( const [ field, radius ] of [ [ 'title', 1 ], [ 'note', 16 ] ] ) {

				for ( const m of e[ field ].matchAll( pattern ) ) {

					const decimals = ( m[ 2 ] ?? m[ 1 ] ).split( '.' )[ 1 ]?.length ?? 0;
					const unit = 10 ** - decimals;
					const low = Number( m[ 1 ] );
					const high = Number( m[ 2 ] ?? m[ 1 ] ) + unit;
					const window = series.slice( Math.max( 0, row - radius ), row + radius + 1 ).map( ( r ) => r.close );
					assert.ok( window.some( ( v ) => v >= low - 1e-9 && v < high - 1e-9 ), `${e.date} ${field}「${m[ 0 ]}」に当たる週の値が、前後 ${radius} 週にない` );

				}

			}

		}

	} );

}

// ---- 個別の主張（見出しと補足の事実を、同梱データで確かめる）----

const fx = () => readJson( 'data/usdjpy.json' );
const jgb = () => readJson( 'data/jgb10.json' );
const rowOf = ( series, date ) => series[ weekRowIndex( series, date ) ];

test( 'ドル円：「初めて100円を割る」「1986年以来の円安水準」「最も円高」「1990年代で最も円高」', () => {

	const s = fx();
	assert.equal( s.find( ( r ) => r.close < 100 ).date, rowOf( s, '1994-06-29' ).date, '初めて週の値が100円を割る週' );
	for ( const date of [ '2024-06-28', '2026-07-24' ] ) {

		const r = rowOf( s, date );
		const before = s.filter( ( x ) => x.date < '2024-01-01' && x.close >= r.close ).at( - 1 );
		assert.equal( before.date.slice( 0, 4 ), '1986', `${date} 以前で、これ以上の週の値は 1986 年が最後` );
		assert.equal( Math.max( ...s.filter( ( x ) => x.date.slice( 0, 4 ) === date.slice( 0, 4 ) ).map( ( x ) => x.close ) ), r.close, `${date} の週は、その年の週次の最高値` );

	}

	const min = s.reduce( ( a, b ) => ( b.close < a.close ? b : a ) );
	assert.equal( min.date, rowOf( s, '2011-10-28' ).date, '最も円高の週' );
	const nineties = s.filter( ( x ) => x.date >= '1990' && x.date < '2000' ).reduce( ( a, b ) => ( b.close < a.close ? b : a ) );
	assert.equal( nineties.date, '1995-05-22' );
	// 1995 年 4 月の週の値は 82〜84 円台
	for ( const r of s.filter( ( x ) => x.date >= '1995-04-03' && x.date <= '1995-04-24' ) ) assert.ok( r.close >= 82 && r.close < 85, r.date );

} );

test( 'ドル円：プラザ合意の翌週に円が急騰、1978 年 11 月は円高が一服、1998 年 6 月は 6 月 15 日の週に急騰、1971 年 8 月は 2 週の空白', () => {

	const s = fx();
	const plaza = rowOf( s, '1985-09-22' );
	const next = s[ s.indexOf( plaza ) + 1 ];
	assert.ok( ( plaza.close - next.close ) / plaza.close > 0.05, `${plaza.close} → ${next.close}` );
	assert.ok( rowOf( s, '1978-11-01' ).close > s[ s.indexOf( rowOf( s, '1978-11-01' ) ) - 1 ].close, '米国の発表の週は、前の週より円安（円高が一服）' );
	assert.ok( s.filter( ( x ) => x.date < '1980' ).reduce( ( a, b ) => ( b.close < a.close ? b : a ) ).date === '1978-10-23', '1970 年代の最も円高な週は発表の前の週' );
	assert.ok( rowOf( s, '1998-06-17' ).close < s[ s.indexOf( rowOf( s, '1998-06-17' ) ) - 1 ].close - 5 );
	assert.equal( rowOf( s, '1971-08-15' ).date, '1971-08-09' );
	assert.equal( weekRowIndex( s, '1971-08-20' ), null );
	assert.equal( weekRowIndex( s, '1971-08-27' ), null );

} );

test( '国債金利：最高、8%台、0.4%台と翌々月の急上昇、2%台（1999 年以来）、3%台（約 30 年ぶり）', () => {

	const s = jgb();
	const max = s.reduce( ( a, b ) => ( b.close > a.close ? b : a ) );
	assert.equal( max.date, rowOf( s, '1990-09-28' ).date );
	assert.ok( max.close >= 8 && max.close < 9 );
	const low = rowOf( s, '2003-06-12' );
	assert.ok( low.close >= 0.4 && low.close < 0.5 );
	assert.equal( s.filter( ( x ) => x.date < '2014-01-01' ).reduce( ( a, b ) => ( b.close < a.close ? b : a ) ).date, low.date, '2014 年までで最も低い' );
	assert.ok( Math.max( ...s.filter( ( x ) => x.date >= '2003-08-25' && x.date < '2003-10-01' ).map( ( x ) => x.close ) ) >= 1.5 );
	const dec = rowOf( s, '2025-12-19' );
	assert.equal( s.filter( ( x ) => x.date < dec.date && x.close >= 2 ).at( - 1 ).date.slice( 0, 4 ), '1999' );
	const sep = rowOf( s, '2026-09-25' );
	assert.ok( sep.close >= 3 );
	assert.equal( s.filter( ( x ) => x.date < sep.date && x.close >= 3 ).at( - 1 ).date.slice( 0, 4 ), '1996' );
	assert.ok( s[ s.indexOf( sep ) - 1 ].close < 3, '3% 以上になった最初の週' );

} );

// ---- 日経平均のファイルに、指数の値を書かない ----

test( 'data/events/nikkei.json：指数の値と思われる数値（4 桁以上の数字 + 円、カンマ区切り、終値の数値）を含まない', () => {

	const text = JSON.stringify( readJson( 'data/events/nikkei.json' ) );
	assert.doesNotMatch( text, /\d{4,}(?:\.\d+)?円/, '4 桁以上の数字に「円」が続く' );
	assert.doesNotMatch( text, /\d{1,3},\d{3}/, 'カンマ区切りの数' );
	assert.doesNotMatch( text, /"(?:close|closeDate|value)"/, 'close / closeDate / value の項目' );
	assert.doesNotMatch( text, /\d+(?:\.\d+)?%/, '日経平均の値動きの割合は書かない' );

	for ( const e of readJson( 'data/events/nikkei.json' ) ) {

		assert.doesNotMatch( e.title + e.note, /\d{5,}|\d{4}\.\d+/, e.date );

	}

} );

test( 'data/events/*.json：ドル円と国債金利のファイルにも、日経平均の値（数値の列）を書いていない', () => {

	for ( const id of [ 'usdjpy', 'jgb10' ] ) {

		for ( const e of readJson( `data/events/${id}.json` ) ) assert.doesNotMatch( e.title, /\d{4,}円/, `${id} ${e.date}` );

	}

} );
