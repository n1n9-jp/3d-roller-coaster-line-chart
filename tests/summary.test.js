// 終了画面の要約（assets/js/summary.js）の確かめ。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, formatYen, formatWeek, formatYearMonth, parseDate, describeChange, summarize, summaryTexts } from '../assets/js/summary.js';
import { loadFixtures } from './helpers.js';

const pt = ( date, close ) => ( { date, close } );

test( '数の書式：四捨五入してカンマ区切り', () => {

	assert.equal( formatNumber( 41701.96 ), '41,702' );
	assert.equal( formatNumber( 7081.55 ), '7,082' );
	assert.equal( formatNumber( 999.4 ), '999' );
	assert.equal( formatNumber( 71300.2 ), '71,300' );
	assert.equal( formatNumber( 1000000 ), '1,000,000' );
	assert.equal( formatYen( 7081.55 ), '7,082円' );

} );

test( '日付の書式：月日の 0 を付けない', () => {

	assert.deepEqual( parseDate( '2009-03-09' ), { year: 2009, month: 3, day: 9 } );
	assert.equal( formatWeek( '2009-03-09' ), '2009年3月9日の週' );
	assert.equal( formatWeek( '2024-12-30' ), '2024年12月30日の週' );
	assert.equal( formatYearMonth( '2025-12-29' ), '2025年12月' );
	assert.equal( formatYearMonth( '1990-01-01' ), '1990年1月' );
	assert.throws( () => parseDate( '2024/07/01' ) );

} );

test( '変化率：上げ・下げ・小数 1 桁', () => {

	assert.deepEqual( describeChange( 100, 150 ), { direction: 'up', percent: '50.0', text: '▲50.0%' } );
	assert.deepEqual( describeChange( 200, 150 ), { direction: 'down', percent: '25.0', text: '▼25.0%' } );
	assert.equal( describeChange( 38852.92, 71300 ).text, '▲83.5%' );
	assert.equal( describeChange( 100, 100.04 ).direction, 'flat' );
	assert.equal( describeChange( 100, 100.04 ).text, '±0.0%' );
	assert.equal( describeChange( 100, 99.96 ).text, '±0.0%' );
	assert.equal( describeChange( 100, 100.06 ).text, '▲0.1%' );

} );

test( '要約：最初と最後の週、週数、期間', () => {

	const s = summarize( [ pt( '1990-01-01', 100 ), pt( '1990-01-08', 120 ), pt( '1990-01-15', 90 ), pt( '1990-02-05', 110 ) ] );
	assert.equal( s.weeks, 4 );
	assert.deepEqual( s.first, pt( '1990-01-01', 100 ) );
	assert.deepEqual( s.last, pt( '1990-02-05', 110 ) );
	assert.equal( s.startLabel, '1990年1月' );
	assert.equal( s.endLabel, '1990年2月' );
	assert.equal( s.change.text, '▲10.0%' );

} );

test( '要約：最高値・最安値は同じ値が複数あれば最初の週', () => {

	const s = summarize( [ pt( '2000-01-03', 50 ), pt( '2000-01-10', 80 ), pt( '2000-01-17', 20 ), pt( '2000-01-24', 80 ), pt( '2000-01-31', 20 ), pt( '2000-02-07', 60 ) ] );
	assert.deepEqual( s.max, pt( '2000-01-10', 80 ) );
	assert.deepEqual( s.min, pt( '2000-01-17', 20 ) );

} );

test( '要約：最初や最後の週が最高値・最安値になる場合と、1 点・空の系列', () => {

	const s = summarize( [ pt( '2000-01-03', 10 ), pt( '2000-01-10', 20 ), pt( '2000-01-17', 30 ) ] );
	assert.deepEqual( s.min, s.first );
	assert.deepEqual( s.max, s.last );

	const one = summarize( [ pt( '2000-01-03', 10 ) ] );
	assert.equal( one.weeks, 1 );
	assert.equal( one.change.direction, 'flat' );

	assert.equal( summarize( [] ), null );
	assert.equal( summarize( null ), null );

} );

test( '文言：仕様の書式どおり', () => {

	const t = summaryTexts( summarize( [ pt( '1990-01-01', 38852.92 ), pt( '1990-01-08', 71300.4 ), pt( '2026-11-09', 50000 ) ] ) );
	assert.equal( t.lead, '1990年1月から2026年11月まで、3週分の日経平均株価を走りました。' );
	assert.deepEqual( t.stats.max, { label: '最高値', value: '71,300', unit: '円', date: '1990年1月8日の週' } );
	assert.equal( t.stats.last.date, '2026年11月9日の週' );
	assert.equal( t.change, '最初の週と比べて ▲28.7%' );
	assert.equal( t.restartLabel, '1990年1月からもう一度乗る' );

} );

test( 'サンプルデータ（data/nikkei225.json）：最高値・最安値・週数・期間', () => {

	const { nikkei } = loadFixtures();
	const s = summarize( nikkei );
	assert.equal( s.weeks, 1879 );
	assert.deepEqual( s.max, pt( '2024-07-01', 41701.96 ) );
	assert.deepEqual( s.min, pt( '2009-03-09', 7081.55 ) );
	assert.equal( s.first.date, '1990-01-01' );
	assert.equal( s.last.date, '2025-12-29' );
	assert.equal( s.endLabel, '2025年12月' );

	const t = summaryTexts( s );
	assert.equal( t.lead, '1990年1月から2025年12月まで、1879週分の日経平均株価を走りました。' );
	assert.equal( t.stats.max.value, '41,702' );
	assert.equal( t.stats.max.date, '2024年7月1日の週' );
	assert.equal( t.stats.min.value, '7,082' );
	assert.equal( t.stats.min.date, '2009年3月9日の週' );

} );
