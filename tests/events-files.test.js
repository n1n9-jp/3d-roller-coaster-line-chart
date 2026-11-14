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

test( 'data/events/nikkei.json：指数の水準を示す数値（4 桁以上の数字 + 円、カンマ区切り、「5万円台」のような数字 + 万円、終値の数値）を含まない', () => {

	const text = JSON.stringify( readJson( 'data/events/nikkei.json' ) );
	assert.doesNotMatch( text, /\d{4,}(?:\.\d+)?円/, '4 桁以上の数字に「円」が続く' );
	assert.doesNotMatch( text, /\d{1,3},\d{3}/, 'カンマ区切りの数' );
	assert.doesNotMatch( text, /[0-9０-９一二三四五六七八九十百千]+(?:\.\d+)?万/, '「5万円」「7万円台」のような、数字 + 万（指数の水準）' );
	assert.doesNotMatch( text, /[0-9０-９]+(?:\.\d+)?億/, '数字 + 億' );
	assert.doesNotMatch( text, /"(?:close|closeDate|value)"/, 'close / closeDate / value の項目' );
	assert.doesNotMatch( text, /\d+(?:\.\d+)?%/, '日経平均の値動きの割合は書かない' );

	for ( const e of readJson( 'data/events/nikkei.json' ) ) {

		assert.doesNotMatch( e.title + e.note, /\d{5,}|\d{4}\.\d+/, e.date );

	}

} );

test( '水準の検出：「5万円」「7万円台」の形（数字 + 万円）と、直す前の日経平均のファイルを見つける', () => {

	// 上のテストと同じ正規表現。4 桁以上の数字 + 円、カンマ区切りだけでは、これらがすり抜けていた
	const level = /[0-9０-９一二三四五六七八九十百千]+(?:\.\d+)?万/;
	for ( const text of [ '初の5万円台', '終値が初めて5万円を超えた', '7万円台で終値の最高値', '6月18日に初の7万円台', '３万円台', '2.5万円', '五万円台' ] ) assert.match( text, level, text );
	for ( const text of [ '節目の水準を初めて超える', '終値の最高値を更新', '万一の備え' ] ) assert.doesNotMatch( text, level, text );

} );

test( 'data/events/*.json：ドル円と国債金利のファイルにも、日経平均の値（数値の列）を書いていない', () => {

	for ( const id of [ 'usdjpy', 'jgb10' ] ) {

		for ( const e of readJson( `data/events/${id}.json` ) ) assert.doesNotMatch( e.title, /\d{4,}円/, `${id} ${e.date}` );

	}

} );

// ---- 見出しと補足の主張（最安値・最高値・初めて・○年ぶり・○円台・○%台・○万円台など）が、そのデータの週の値で成り立つ ----
//
// キャプションの「当時 ○○」は、出来事の日付を含む週の、週の最終営業日の値。日次の最高値・最安値は、週の値では成り立たない。
// 主張の言葉を含む出来事は、下の表に検証（check）か、データでは確かめられない理由（external）を書くまで、テストが落ちる。

const CLAIM_WORDS = /最安値|最高値|最低|最高|最も|最大|初めて|初の|ぶり|以来|当時の|圏|\d+(?:\.\d+)?(?:〜\d+(?:\.\d+)?)?(?:円|%|万円)台/;

const minRow = ( rows ) => rows.reduce( ( a, b ) => ( b.close < a.close ? b : a ) );
const maxRow = ( rows ) => rows.reduce( ( a, b ) => ( b.close > a.close ? b : a ) );
const inYear = ( series, year ) => series.filter( ( r ) => r.date.slice( 0, 4 ) === year );
const upTo = ( series, row ) => series.slice( 0, row + 1 );
/** 週の値が、その値より前の全部の週より（厳密に）高い（最高値の更新）。 */
const isRecordHigh = ( series, row ) => series.slice( 0, row ).every( ( r ) => r.close < series[ row ].close );
const isRecordLow = ( series, row ) => series.slice( 0, row ).every( ( r ) => r.close > series[ row ].close );
const inRange = ( value, low, high ) => value >= low && value < high;

const CLAIMS = {
	usdjpy: {
		'1994-06-29': { check: ( s, row ) => {

			assert.equal( s.findIndex( ( r ) => r.close < 100 ), row, '週の値が初めて 100 円を割る週' );

		} },
		'1995-04-19': { check: ( s, row ) => {

			assert.ok( inRange( s[ row ].close, 82, 85 ), '82〜84 円台' );
			assert.equal( minRow( upTo( s, row ) ).close, s[ row ].close, 'それまででいちばん円高の週' );
			const nineties = minRow( s.filter( ( r ) => r.date >= '1990' && r.date < '2000' ) );
			assert.equal( nineties.date, '1995-05-22', '5 月の週が 1990 年代で最も円高' );

		} },
		'2011-10-28': { check: ( s, row ) => {

			assert.equal( minRow( s ).date, s[ row ].date, 'この統計で最も円高な週' );
			assert.ok( inRange( s[ row ].close, 75, 76 ), '75 円台' );

		} },
		'2022-09-22': { external: '介入の額と「1998年以来」は財務省の公表。週次データでは確かめられない' },
		'2024-06-28': { check: ( s, row ) => {

			assert.ok( inRange( s[ row ].close, 160, 161 ), '160 円台' );
			assert.equal( s.filter( ( r ) => r.date < '2024-01-01' && r.close >= s[ row ].close ).at( - 1 ).date.slice( 0, 4 ), '1986', '1986 年以来' );

		} },
		'2026-07-24': { check: ( s, row ) => {

			assert.ok( inRange( s[ row ].close, 163, 164 ), '163 円台' );
			assert.equal( s.filter( ( r ) => r.date < '2024-01-01' && r.close >= s[ row ].close ).at( - 1 ).date.slice( 0, 4 ), '1986', '1986 年以来' );

		} }
	},
	jgb10: {
		'1990-09-28': { check: ( s, row ) => {

			assert.equal( maxRow( s ).date, s[ row ].date, 'この統計の最高の週' );
			assert.ok( inRange( s[ row ].close, 8, 9 ), '8% 台' );

		} },
		'2003-06-12': { check: ( s, row ) => {

			assert.ok( inRange( s[ row ].close, 0.4, 0.5 ), '0.4% 台' );
			assert.equal( minRow( upTo( s, row ) ).close, s[ row ].close, 'それまででいちばん低い週（当時の最低水準）' );
			assert.ok( s.slice( row + 1 ).filter( ( r ) => r.date < '2003-11-01' ).some( ( r ) => inRange( r.close, 1.5, 1.6 ) ), '9 月ごろに 1.5% 台' );

		} },
		'2025-12-19': { check: ( s, row ) => {

			assert.ok( inRange( s[ row ].close, 2, 3 ), '2% 台' );
			assert.equal( s.filter( ( r, i ) => i < row && r.close >= 2 ).at( - 1 ).date.slice( 0, 4 ), '1999', '1999 年以来' );

		} },
		'2026-09-25': { check: ( s, row ) => {

			assert.ok( inRange( s[ row ].close, 3, 4 ), '3% 台' );
			assert.ok( s[ row - 1 ].close < 3, '3% 以上になった最初の週' );
			assert.equal( s.filter( ( r, i ) => i < row && r.close >= 3 ).at( - 1 ).date.slice( 0, 4 ), '1996', '約 30 年ぶり（最後に 3% 以上だったのは 1996 年）' );

		} }
	},
	nikkei: {
		'1990-01-04': { external: '前年末（1989 年）の最高値は、データの期間（1990 年〜）の前で、確かめられない', check: ( s, row ) => {

			assert.equal( row, 0, 'データの最初の週（前年末の直後）' );
			assert.ok( minRow( inYear( s, '1990' ) ).close < s[ row ].close * 0.8, '1990 年は大きく下落した' );

		} },
		'1992-08-14': { external: '日次の終値の最安値（8月18日）は、週次データでは確かめられない', check: ( s, row ) => {

			assert.equal( minRow( inYear( s, '1992' ) ).date, s[ row ].date, '週の終値で 1992 年の最安値の週' );

		} },
		'2000-04-12': { check: ( s, row ) => {

			assert.equal( maxRow( inYear( s, '2000' ) ).date, s[ row ].date, '週の終値で 2000 年の最高値の週' );
			assert.ok( minRow( s.filter( ( r ) => r.date > s[ row ].date && r.date < '2001' ) ).close < s[ row ].close, '年末にかけて下落' );

		} },
		'2003-04-25': { external: '日次の終値の最安値（4月28日）は、週次データでは確かめられない', check: ( s, row ) => {

			assert.ok( isRecordLow( s, row ), '週の終値で、それまででいちばん低い（バブル後の最安値）' );
			assert.ok( minRow( s.slice( row + 1 ) ).close < s[ row ].close, '当時の最安値（のちに更新される）' );

		} },
		'2009-03-04': { external: '日次の終値の最安値（3月10日）は、週次データでは確かめられない', check: ( s, row ) => {

			assert.equal( minRow( s ).date, s[ row ].date, '週の終値で、バブル後の最安値の週（終了画面の最安値と同じ週）' );

		} },
		'2020-03-19': { check: ( s, row ) => {

			assert.equal( minRow( inYear( s, '2020' ) ).date, s[ row ].date, '週の終値で 2020 年の最安値の週' );
			assert.ok( s[ row + 1 ].close > s[ row ].close, '以後は反発' );

		} },
		'2024-02-22': { external: '1989年12月29日の終値（データの期間の前）を上回った、は確かめられない', check: ( s, row ) => {

			assert.ok( isRecordHigh( s, row ), '週の終値が、データの最初からの最高値' );
			assert.equal( Number( s[ row ].date.slice( 0, 4 ) ) - 1990, 34, '34 年ぶり' );

		} },
		'2024-08-05': { external: '1 日の下落幅は日次のデータ。週の値は反発後なので、値は出さない', check: ( s, row, e ) => {

			assert.equal( e.showValue, false, '日次の主張は、週の値を出さない' );

		} },
		'2025-10-27': { check: ( s, row ) => {

			assert.ok( isRecordHigh( s, row ), '最高値を更新' );
			const before = maxRow( s.slice( 0, row ) ).close;
			assert.ok( Math.floor( s[ row ].close / 10000 ) > Math.floor( before / 10000 ), '1 万円刻みの節目を初めて超えた' );

		} },
		'2026-06-18': { check: ( s, row ) => {

			assert.ok( isRecordHigh( s, row ), '最高値を更新' );
			assert.equal( maxRow( s ).date, s[ row ].date, '2026 年 11 月時点で最高値（終了画面の最高値と同じ週）' );
			const before = maxRow( s.slice( 0, row ) ).close;
			assert.ok( Math.floor( s[ row ].close / 10000 ) > Math.floor( before / 10000 ), '1 万円刻みの節目を初めて超えた' );

		} }
	}
};

for ( const [ id, spec ] of Object.entries( FILES ) ) {

	test( `data/events/${id}.json：主張の言葉（最安値・最高値・初めて・○年ぶり・○円台…）を含む出来事は、すべて検証の表にある`, () => {

		const claims = CLAIMS[ id ];
		const dates = spec.list.map( ( e ) => e.date );
		for ( const date of Object.keys( claims ) ) assert.ok( dates.includes( date ), `表の ${date} は、ファイルにない出来事（日付を直したら、表も直す）` );

		for ( const e of spec.list ) {

			const hit = `${e.title}${e.note}`.match( CLAIM_WORDS );
			if ( hit ) assert.ok( claims[ e.date ], `${e.date}「${e.title}」の主張（${hit[ 0 ]}）を、検証していない` );

		}

		for ( const [ date, claim ] of Object.entries( claims ) ) assert.ok( claim.check || claim.external, `${date}：check か external が必要` );

	} );

	test( `data/events/${id}.json：見出しと補足の主張が、そのデータの週の値で成り立つ`, { skip: spec.skip }, () => {

		const series = spec.series();
		for ( const e of spec.list ) {

			const claim = CLAIMS[ id ][ e.date ];
			if ( ! claim?.check ) continue;
			const row = weekRowIndex( series, e.date );
			assert.notEqual( row, null, `${e.date} を含む週の行がない` );

			try {

				claim.check( series, row, e );

			} catch ( error ) {

				error.message = `${e.date}「${e.title}」：${error.message}`;
				throw error;

			}

		}

	} );

}
