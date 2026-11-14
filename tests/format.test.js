import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFormatter, parseDate, formatWeek, formatYearMonth, weeksBetween, MINUS } from '../assets/js/format.js';
import { DATASETS } from '../assets/js/config.js';
import { loadFixtures } from './helpers.js';

const usd = createFormatter( DATASETS.usdjpy );
const jgb = createFormatter( DATASETS.jgb10 );
const nik = createFormatter( DATASETS.nikkei );

// ---- 値 ----

test( '値：単位つき（ドル円は小数2桁、金利は小数3桁でマイナスは U+2212、日経平均は3桁区切りの整数）', () => {

	assert.equal( usd.value( 152.344 ), '152.34円' );
	assert.equal( usd.value( 358.4 ), '358.40円' );
	assert.equal( usd.value( 75.72 ), '75.72円' );
	assert.equal( jgb.value( 1.2344 ), '1.234%' );
	assert.equal( jgb.value( - 0.2934 ), '−0.293%' );
	assert.equal( jgb.value( 8.105 ), '8.105%' );
	assert.equal( nik.value( 38275.3 ), '38,275円' );
	assert.equal( nik.value( 71250 ), '71,250円' );
	assert.equal( nik.value( 7054.98 ), '7,055円' );
	assert.equal( MINUS, '−' );

} );

test( '値：単位なし（現在値の帯・終了画面の数字）', () => {

	assert.equal( usd.number( 152.344 ), '152.34' );
	assert.equal( jgb.number( - 0.2934 ), '−0.293' );
	assert.equal( nik.number( 38275.3 ), '38,275' );
	assert.equal( nik.number( 999.5 ), '1,000' );
	assert.equal( usd.unit, '円' );
	assert.equal( jgb.unit, '%' );
	assert.equal( nik.unit, '円' );
	assert.equal( usd.decimals, 2 );
	assert.equal( jgb.decimals, 3 );
	assert.equal( nik.decimals, 0 );

} );

test( '値：表示の桁で 0 になる負の値に「−」を付けない', () => {

	assert.equal( jgb.value( - 0.0004 ), '0.000%' );
	assert.equal( usd.value( - 0.001 ), '0.00円' );
	assert.equal( nik.value( - 0.2 ), '0円' );
	assert.equal( jgb.value( - 0.0006 ), '−0.001%' );

} );

test( '値：桁があふれない最大級の値（ドル円 358.40円、金利 −0.293%、日経平均 71,250円）', () => {

	// 現在値の帯（L：40px の数字）に入る文字数の目安：どれも 8 文字以内
	for ( const text of [ usd.value( 358.4 ), jgb.value( - 0.293 ), nik.value( 71250 ) ] ) assert.ok( text.length <= 8, text );

} );

test( '短い形（compact）：目盛りやラベル用。ドル円 150円、金利 2%、日経平均 2万円', () => {

	assert.equal( usd.compact( 150 ), '150円' );
	assert.equal( usd.compact( 100 ), '100円' );
	assert.equal( jgb.compact( 2 ), '2%' );
	assert.equal( jgb.compact( 0 ), '0%' );
	assert.equal( jgb.compact( - 1 ), '−1%' );
	assert.equal( nik.compact( 20000 ), '2万円' );
	assert.equal( nik.compact( 70000 ), '7万円' );
	assert.equal( nik.compact( 0 ), '0円' );

} );

test( '目盛りの値ラベル（label）：ドル円 150円、金利 2%、日経平均 20,000円（万にしない）', () => {

	assert.equal( usd.label( 150 ), '150円' );
	assert.equal( jgb.label( 2 ), '2%' );
	assert.equal( jgb.label( - 1 ), '−1%' );
	assert.equal( nik.label( 20000 ), '20,000円' );
	assert.equal( nik.label( 0 ), '0円' );

} );

test( 'ミニグラフの Y 軸のラベル（tick）：単位なし。ドル円 100、金利 −1・0・2、日経平均 2万', () => {

	assert.equal( usd.tick( 100 ), '100' );
	assert.equal( usd.tick( 400 ), '400' );
	assert.equal( jgb.tick( - 1 ), '−1' );
	assert.equal( jgb.tick( 0 ), '0' );
	assert.equal( jgb.tick( 8 ), '8' );
	assert.equal( nik.tick( 0 ), '0' );
	assert.equal( nik.tick( 20000 ), '2万' );
	assert.equal( nik.tick( 80000 ), '8万' );

} );

// ---- 前週比 ----

test( '前週比（ドル円）：上がれば円安、下がれば円高（150 → 151.2 で「▲1.20円安」）', () => {

	const up = usd.change( 151.2, 150 );
	assert.equal( up.direction, 'up' );
	assert.equal( up.text, '前週比 ▲1.20円安（+0.8%）' );
	assert.equal( up.compactText, '▲1.20円安' );

	const down = usd.change( 149.15, 150 );
	assert.equal( down.direction, 'down' );
	assert.equal( down.text, '前週比 ▼0.85円高（−0.6%）' );
	assert.equal( down.compactText, '▼0.85円高' );

	assert.equal( usd.change( 358.4, 357.82 ).text, '前週比 ▲0.58円安（+0.2%）' );

} );

test( '前週比：前の行が 2 週以上前のときは、何週前との比較かを書く（短い形にも付ける）', () => {

	// ドル円の 1971-08-30：前の行は 3 週前の 08-09（値のない週の行はない）
	const gap = usd.change( 340.99, 358.2, 3 );
	assert.equal( gap.text, '3週前比 ▼17.21円高（−4.8%）' );
	assert.equal( gap.compactText, '3週前比 ▼17.21円高' );
	assert.equal( gap.direction, 'down' );

	assert.equal( usd.change( 151.2, 150, 2 ).text, '2週前比 ▲1.20円安（+0.8%）' );
	assert.equal( jgb.change( 1.2, 1.1, 2 ).text, '2週前比 ▲0.100ポイント' );
	assert.equal( jgb.change( 1.2, 1.1, 2 ).compactText, '2週前比 ▲0.100ポイント' );
	assert.equal( nik.change( 20380, 20000, 2 ).text, '2週前比 ▲380円（+1.9%）' );
	assert.equal( nik.change( 20380, 20000, 2 ).compactText, '2週前比 ▲1.9%' );
	assert.equal( usd.change( 150, 150, 2 ).text, '2週前比 ±0.00円' );
	assert.equal( nik.change( 20000, 20000, 2 ).compactText, '2週前比 ±0%' );
	assert.deepEqual( usd.change( 100, NaN, 2 ), { text: '2週前比 —', compactText: '2週前比 —', direction: 'none' } );

	// 1 週前（省略、1、不正な値）は、今までどおり「前週比」
	for ( const weeks of [ undefined, 1, 0, NaN, null ] ) {

		assert.equal( usd.change( 151.2, 150, weeks ).text, '前週比 ▲1.20円安（+0.8%）', String( weeks ) );
		assert.equal( usd.change( 151.2, 150, weeks ).compactText, '▲1.20円安', String( weeks ) );

	}

} );

test( '週の間隔：日付の差を 7 日 = 1 週で数える（1 以上）', () => {

	assert.equal( weeksBetween( '1971-08-09', '1971-08-30' ), 3 );
	assert.equal( weeksBetween( '1971-08-23', '1971-08-30' ), 1 );
	assert.equal( weeksBetween( '2019-04-22', '2019-05-06' ), 2 );
	assert.equal( weeksBetween( '1987-01-05', '1987-01-05' ), 1 );
	assert.equal( weeksBetween( '2019-12-30', '2020-01-06' ), 1, '年をまたぐ' );

} );

test( '前週比（金利）：ポイントで書く。％の変化率は出さない', () => {

	const up = jgb.change( 1.012, 1 );
	assert.equal( up.direction, 'up' );
	assert.equal( up.text, '前週比 ▲0.012ポイント' );
	assert.equal( up.compactText, '▲0.012ポイント' );
	assert.equal( jgb.change( 0.95, 1 ).text, '前週比 ▼0.050ポイント' );
	assert.equal( jgb.change( 0.95, 1 ).direction, 'down' );

	// マイナスの金利：差の向きは値の上下（−0.300 → −0.293 は上がった）
	assert.equal( jgb.change( - 0.293, - 0.3 ).text, '前週比 ▲0.007ポイント' );
	// 前の値が 0 でも書ける（％の変化率を出さないので）
	assert.equal( jgb.change( 0.1, 0 ).text, '前週比 ▲0.100ポイント' );
	assert.equal( jgb.change( 0.5, - 0.5 ).text, '前週比 ▲1.000ポイント' );

} );

test( '前週比（日経平均）：今までどおり（円と％。コンパクトは％だけ）', () => {

	const up = nik.change( 38380, 38000 );
	assert.equal( up.text, '前週比 ▲380円（+1.0%）' );
	assert.equal( up.compactText, '▲1.0%' );
	assert.equal( up.direction, 'up' );
	assert.equal( nik.change( 38791.29, 38852.92 ).text, '前週比 ▼62円（−0.2%）' );
	assert.equal( nik.change( 68765, 70000 ).text, '前週比 ▼1,235円（−1.8%）' ); // 3桁区切り

} );

test( '前週比：変化なし（表示の桁で 0）は flat', () => {

	assert.deepEqual( usd.change( 150, 150 ), { text: '前週比 ±0.00円', compactText: '±0.00円', direction: 'flat' } );
	assert.equal( usd.change( 150.004, 150 ).direction, 'flat' );
	assert.equal( usd.change( 150.006, 150 ).direction, 'up' );
	assert.deepEqual( jgb.change( 1, 1 ), { text: '前週比 ±0.000ポイント', compactText: '±0.000ポイント', direction: 'flat' } );
	assert.equal( jgb.change( 1.0004, 1 ).direction, 'flat' );
	assert.deepEqual( nik.change( 20000, 20000 ), { text: '前週比 ±0円', compactText: '±0%', direction: 'flat' } );
	// 四捨五入して 0 円になる差も「変化なし」
	assert.equal( nik.change( 20000.4, 20000 ).direction, 'flat' );
	assert.equal( nik.change( 19999.4, 20000 ).direction, 'down' );

} );

test( '前週比：最初の週（前の値がない）は「—」', () => {

	for ( const f of [ usd, jgb, nik ] ) {

		for ( const previous of [ undefined, NaN, null ] ) {

			assert.deepEqual( f.change( 100, previous ), { text: '前週比 —', compactText: '—', direction: 'none' } );

		}

	}

	// 前の値が 0 のとき、％の変化率は決まらない（円・為替）
	assert.equal( nik.change( 5, 0 ).direction, 'none' );
	assert.equal( usd.change( 5, 0 ).direction, 'none' );

} );

test( '前週比：同梱データの全週で、direction と文言が整合する（数値以外・NaN・桁あふれがない）', () => {

	const { usdjpy, jgb10 } = loadFixtures();
	for ( const [ f, series ] of [ [ usd, usdjpy ], [ jgb, jgb10 ] ] ) {

		let widest = 0;
		for ( let i = 1; i < series.length; i ++ ) {

			const c = f.change( series[ i ].close, series[ i - 1 ].close );
			assert.ok( [ 'up', 'down', 'flat' ].includes( c.direction ), `${i}` );
			assert.ok( ! /NaN|undefined|Infinity/.test( c.text + c.compactText ), `${i}: ${c.text}` );
			assert.equal( c.text.includes( '▲' ), c.direction === 'up' );
			assert.equal( c.text.includes( '▼' ), c.direction === 'down' );
			widest = Math.max( widest, c.text.length );

		}

		// 「前週比 ▲10.50円安（+3.1%）」のような長さに収まる
		assert.ok( widest <= 20, `${widest}` );

	}

} );

test( '最初の週と比べた変化（終了画面）：ドル円は円高・円安つき、金利はポイント、日経平均は％', () => {

	assert.deepEqual( usd.overall( 157.9, 357.4 ), { text: '▼199.50円の円高（−55.8%）', direction: 'down' } );
	assert.deepEqual( usd.overall( 360, 300 ), { text: '▲60.00円の円安（+20.0%）', direction: 'up' } );
	assert.deepEqual( jgb.overall( 1.104, 3.366 ), { text: '▼2.262ポイント', direction: 'down' } );
	assert.deepEqual( nik.overall( 120, 100 ), { text: '▲20.0%', direction: 'up' } );
	assert.deepEqual( nik.overall( 80, 100 ), { text: '▼20.0%', direction: 'down' } );
	assert.deepEqual( nik.overall( 100, 100.01 ), { text: '±0.0%', direction: 'flat' } );
	assert.deepEqual( usd.overall( 100, 100 ), { text: '±0.00円', direction: 'flat' } );
	assert.deepEqual( jgb.overall( 1, 1 ), { text: '±0.000ポイント', direction: 'flat' } );
	assert.equal( usd.overall( 1, 0 ).direction, 'none' );

} );

// ---- 目盛り ----

test( '目盛り（ドル円）：下限 = floor( 最小 / 50 ) × 50、上限 = ceil( 最大 / 50 ) × 50。ラベルは 100 円ごと', () => {

	const t = usd.ticks( 75.72, 358.44 );
	assert.equal( t.step, 50 );
	assert.equal( t.axisMin, 50 );
	assert.equal( t.axisMax, 400 );
	assert.deepEqual( t.values, [ 50, 100, 150, 200, 250, 300, 350, 400 ] );
	assert.equal( t.labelEvery, 2 ); // 線が 7 本を超える
	assert.deepEqual( t.labelValues, [ 100, 200, 300, 400 ] ); // 下端の 50 には付けない

} );

test( '目盛り（金利）：マイナスがあるので下限は 0 ではない。−1〜9%、ラベルは 2% ごと', () => {

	const t = jgb.ticks( - 0.297, 8.105 );
	assert.equal( t.step, 1 );
	assert.equal( t.axisMin, - 1 );
	assert.equal( t.axisMax, 9 );
	assert.equal( t.values.length, 11 );
	assert.equal( t.values[ 0 ], - 1 );
	assert.ok( t.values.includes( 0 ) );
	assert.equal( t.labelEvery, 2 );
	assert.deepEqual( t.labelValues, [ 0, 2, 4, 6, 8 ] );

} );

test( '目盛り（日経平均）：0〜8 万円、1 万円刻み、ラベルは 2 万円ごと（0 を含む）', () => {

	const t = nik.ticks( 7055, 72366 );
	assert.equal( t.step, 10000 );
	assert.equal( t.axisMin, 0 );
	assert.equal( t.axisMax, 80000 );
	assert.equal( t.values.length, 9 );
	assert.equal( t.labelEvery, 2 );
	assert.deepEqual( t.labelValues, [ 0, 20000, 40000, 60000, 80000 ] );

} );

test( '目盛り：ちょうど刻みの倍数なら、そのまま（切り上げない・切り下げない）', () => {

	const t = nik.ticks( 10000, 40000 );
	assert.equal( t.axisMin, 10000 );
	assert.equal( t.axisMax, 40000 );
	assert.deepEqual( t.values, [ 10000, 20000, 30000, 40000 ] );
	assert.equal( t.labelEvery, 1 ); // 4 本。間引かない
	assert.deepEqual( t.labelValues, t.values );

} );

test( '目盛り：線が 7 本までなら間引かない、8 本で 2 本おき', () => {

	assert.equal( nik.ticks( 0, 60000 ).values.length, 7 );
	assert.equal( nik.ticks( 0, 60000 ).labelEvery, 1 );
	assert.equal( nik.ticks( 0, 70000 ).values.length, 8 );
	assert.equal( nik.ticks( 0, 70000 ).labelEvery, 2 );

} );

test( '目盛り：最小と最大が同じ値でも、軸に幅がある', () => {

	const t = nik.ticks( 20000, 20000 );
	assert.ok( t.axisMax > t.axisMin );
	assert.deepEqual( t.values, [ 20000, 30000 ] );

} );

test( '目盛り：狭い画面用の粗い刻み（compact）', () => {

	const u = usd.ticks( 75.72, 358.44, { compact: true } );
	assert.equal( u.step, 100 );
	assert.deepEqual( [ u.axisMin, u.axisMax ], [ 0, 400 ] );
	assert.deepEqual( u.values, [ 0, 100, 200, 300, 400 ] );

	const j = jgb.ticks( - 0.297, 8.105, { compact: true } );
	assert.equal( j.step, 2 );
	assert.deepEqual( [ j.axisMin, j.axisMax ], [ - 2, 10 ] );

	const n = nik.ticks( 7055, 72366, { compact: true } );
	assert.equal( n.step, 20000 );
	assert.deepEqual( n.values, [ 0, 20000, 40000, 60000, 80000 ] );

} );

test( '目盛り：同梱データの範囲は、必ず軸の中に収まる', () => {

	const { usdjpy, jgb10 } = loadFixtures();
	for ( const [ f, series ] of [ [ usd, usdjpy ], [ jgb, jgb10 ] ] ) {

		const closes = series.map( ( d ) => d.close );
		const min = Math.min( ...closes );
		const max = Math.max( ...closes );
		for ( const compact of [ false, true ] ) {

			const t = f.ticks( min, max, { compact } );
			assert.ok( t.axisMin <= min && t.axisMax >= max, `${f.unit} compact=${compact}` );
			assert.ok( t.axisMin > min - t.step && t.axisMax < max + t.step );

		}

	}

	// 同梱データの実際の範囲
	assert.deepEqual( [ usd.ticks( ...range( usdjpy ) ).axisMin, usd.ticks( ...range( usdjpy ) ).axisMax ], [ 50, 400 ] );
	assert.deepEqual( [ jgb.ticks( ...range( jgb10 ) ).axisMin, jgb.ticks( ...range( jgb10 ) ).axisMax ], [ - 1, 9 ] );

} );

function range( series ) {

	const closes = series.map( ( d ) => d.close );
	return [ Math.min( ...closes ), Math.max( ...closes ) ];

}

// ---- 日付 ----

test( '日付：年月・週の文言。Date を通さない', () => {

	assert.deepEqual( parseDate( '2026-11-09' ), { year: 2026, month: 11, day: 9 } );
	assert.equal( formatWeek( '1990-01-08' ), '1990年1月8日の週' );
	assert.equal( formatYearMonth( '1990-01-08' ), '1990年1月' );
	assert.equal( formatYearMonth( '2025-12-29' ), '2025年12月' );
	assert.throws( () => parseDate( 'x' ) );
	assert.throws( () => parseDate( '2024-1-1' ) );

} );

test( '強く描く線の間隔（3D の等高線）：ドル円 100 円、金利は無し（0 の線だけ。scale.js）、日経平均 5 万円', () => {

	assert.equal( usd.strongEvery, 100 );
	assert.equal( jgb.strongEvery, null );
	assert.equal( nik.strongEvery, 50000 );
	// 定義に無ければ null
	assert.equal( createFormatter( { unit: '円', decimals: 0, step: 10, changeMode: 'percent' } ).strongEvery, null );

} );
