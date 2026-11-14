import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	parseDate, formatWeekLabel, formatMonthLabel, formatYen, formatPercent, formatChange, weekIndex
} from '../assets/js/hud/readout.js';

test( '年月：デスクトップは「1990年1月8日の週」、モバイルは「1990年1月」', () => {

	assert.equal( formatWeekLabel( '1990-01-08' ), '1990年1月8日の週' );
	assert.equal( formatMonthLabel( '1990-01-08' ), '1990年1月' );
	// 先頭の 0 は付けない。月末・年末も Date を通さずそのまま読む
	assert.equal( formatWeekLabel( '2008-09-15' ), '2008年9月15日の週' );
	assert.equal( formatMonthLabel( '2025-12-29' ), '2025年12月' );
	assert.deepEqual( parseDate( '2026-11-09' ), { year: 2026, month: 11, day: 9 } );

} );

test( '値：3桁区切りの整数、小数は四捨五入', () => {

	assert.equal( formatYen( 38791.29 ), '38,791' );
	assert.equal( formatYen( 38791.5 ), '38,792' );
	assert.equal( formatYen( 7081.55 ), '7,082' );
	assert.equal( formatYen( 71300.4 ), '71,300' );
	assert.equal( formatYen( 999.5 ), '1,000' );
	assert.equal( formatYen( 100000 ), '100,000' );
	assert.equal( formatYen( 0 ), '0' );

} );

test( '％：小数1桁、符号は付けない', () => {

	assert.equal( formatPercent( 0.2 ), '0.2' );
	assert.equal( formatPercent( - 1.234 ), '1.2' );
	assert.equal( formatPercent( 12 ), '12.0' );
	assert.equal( formatPercent( 0.04 ), '0.0' );

} );

test( '前週比：上げ', () => {

	const change = formatChange( 38000, 38380 );
	assert.equal( change.direction, 'up' );
	assert.equal( change.amount, '380' );
	assert.equal( change.percent, '1.0' );
	assert.equal( change.full, '前週比 ▲380円（+1.0%）' );
	assert.equal( change.short, '▲1.0%' );

} );

test( '前週比：下げ（符号は U+2212 の −）', () => {

	const change = formatChange( 38852.92, 38791.29 );
	assert.equal( change.direction, 'down' );
	assert.equal( change.amount, '62' );
	assert.equal( change.full, '前週比 ▼62円（−0.2%）' );
	assert.equal( change.short, '▼0.2%' );

	// 1,000 円以上の差は3桁区切り
	assert.equal( formatChange( 70000, 68765 ).full, '前週比 ▼1,235円（−1.8%）' );

} );

test( '前週比：変化なし', () => {

	const same = formatChange( 20000, 20000 );
	assert.equal( same.direction, 'flat' );
	assert.equal( same.full, '前週比 ±0円' );
	assert.equal( same.short, '±0%' );

	// 四捨五入して 0 円になる差も「変化なし」
	assert.equal( formatChange( 20000, 20000.4 ).direction, 'flat' );
	assert.equal( formatChange( 20000, 19999.4 ).direction, 'down' );
	assert.equal( formatChange( 20000, 19998 ).direction, 'down' );
	assert.equal( formatChange( 20000, 19999.6 ).direction, 'flat' );

} );

test( '前週比：最初の週は「—」', () => {

	for ( const previous of [ undefined, NaN, null ] ) {

		const change = formatChange( previous, 38852.92 );
		assert.equal( change.direction, 'none' );
		assert.equal( change.full, '前週比 —' );
		assert.equal( change.short, '—' );

	}

} );

test( '週の位置：範囲内に丸める', () => {

	assert.equal( weekIndex( 0, 10 ), 0 );
	assert.equal( weekIndex( 3.99, 10 ), 3 );
	assert.equal( weekIndex( 9, 10 ), 9 );
	assert.equal( weekIndex( 9.5, 10 ), 9 );
	assert.equal( weekIndex( - 0.2, 10 ), 0 );

} );
