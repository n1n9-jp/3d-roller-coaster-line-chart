// 終了画面の要約（assets/js/summary.js）の確かめ。値の書式は format.js（tests/format.test.js）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, summaryTexts, lastPassedEvent, lastEventTexts, WORD_JOINER } from '../assets/js/summary.js';
import { buildDataset } from '../assets/js/data.js';
import { DATASETS } from '../assets/js/config.js';
import { loadFixtures } from './helpers.js';

const J = WORD_JOINER;
const pt = ( date, close ) => ( { date, close } );
const datasetOf = ( id, raw ) => buildDataset( raw, 4, undefined, DATASETS[ id ] );

test( '要約：最初と最後の週、週数、期間、終了年月', () => {

	const s = summarize( [ pt( '1990-01-01', 100 ), pt( '1990-01-08', 120 ), pt( '1990-01-15', 90 ), pt( '1990-02-05', 110 ) ] );
	assert.equal( s.weeks, 4 );
	assert.deepEqual( s.first, pt( '1990-01-01', 100 ) );
	assert.deepEqual( s.last, pt( '1990-02-05', 110 ) );
	assert.equal( s.startLabel, '1990年1月' );
	assert.equal( s.endLabel, '1990年2月' );
	assert.equal( s.endYear, 1990 );

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
	assert.equal( one.turns, 0 );

	assert.equal( summarize( [] ), null );
	assert.equal( summarize( null ), null );

} );

test( '要約：周数は、期間の年数 ÷ 10（10 年で 1 周）', () => {

	assert.ok( Math.abs( summarize( [ pt( '1990-01-01', 1 ), pt( '2000-01-01', 1 ) ] ).turns - 1 ) < 0.001 );
	assert.ok( Math.abs( summarize( [ pt( '1990-01-01', 1 ), pt( '1995-01-01', 1 ) ] ).turns - 0.5 ) < 0.001 );

} );

test( '文言（ドル円）：見出し・リード・統計・変化の一行が仕様どおり', () => {

	const { usdjpy } = loadFixtures();
	const t = summaryTexts( summarize( usdjpy ), datasetOf( 'usdjpy', usdjpy ) );

	assert.equal( t.title, '2026年11月に到着しました' );
	assert.equal( t.lead, `1971年1月から、らせんを約5.6周、2,912${J}週${J}分のドル円の為替レートを走りました。` );
	assert.deepEqual( t.stats.first, { label: '最初の週', value: '357.82', unit: '円', date: '1971年1月4日の週' } );
	assert.deepEqual( t.stats.last, { label: '最後の週', value: '158.23', unit: '円', date: '2026年11月2日の週' } );
	assert.deepEqual( t.stats.max, { label: '最高値（最も円安）', value: '358.40', unit: '円', date: '1971年1月11日の週' } );
	assert.deepEqual( t.stats.min, { label: '最安値（最も円高）', value: '75.72', unit: '円', date: '2011年10月24日の週' } );
	assert.equal( t.change, '最初の週と比べて ▼199.59円の円高（−55.8%）' );
	assert.equal( t.changeDirection, 'down' );
	assert.equal( t.restartLabel, '1971年1月からもう一度乗る' );

} );

test( '文言（金利）：マイナスの最安値は U+2212、変化はポイント', () => {

	const { jgb10 } = loadFixtures();
	const t = summaryTexts( summarize( jgb10 ), datasetOf( 'jgb10', jgb10 ) );

	assert.equal( t.title, '2026年11月に到着しました' );
	assert.equal( t.lead, `1986年6月から、らせんを約4.0周、2,105${J}週${J}分の10年国債の金利を走りました。` );
	assert.deepEqual( t.stats.max, { label: '最も高い金利', value: '8.105', unit: '%', date: '1990年9月24日の週' } );
	assert.deepEqual( t.stats.min, { label: '最も低い金利', value: '−0.293', unit: '%', date: '2016年7月4日の週' } );
	assert.equal( t.stats.first.value, '5.103' );
	assert.equal( t.stats.last.value, '2.841' );
	assert.equal( t.change, '最初の週と比べて ▼2.262ポイント' );
	assert.equal( t.restartLabel, '1986年6月からもう一度乗る' );

} );

test( '文言（日経平均）：3桁区切りの整数、変化は％（今までどおり）。手元のデータの形の系列で確かめる', () => {

	const raw = [ pt( '1990-01-01', 38852.92 ), pt( '1990-01-08', 71300.4 ), pt( '2009-03-09', 7081.55 ), pt( '2026-11-09', 50000 ) ];
	const t = summaryTexts( summarize( raw ), datasetOf( 'nikkei', raw ) );

	assert.equal( t.title, '2026年11月に到着しました' );
	assert.equal( t.lead, `1990年1月から、らせんを約3.7周、4${J}週${J}分の日経平均株価を走りました。` );
	assert.deepEqual( t.stats.max, { label: '最高値', value: '71,300', unit: '円', date: '1990年1月8日の週' } );
	assert.deepEqual( t.stats.min, { label: '最安値', value: '7,082', unit: '円', date: '2009年3月9日の週' } );
	assert.equal( t.stats.last.date, '2026年11月9日の週' );
	assert.equal( t.change, '最初の週と比べて ▲28.7%' );
	assert.equal( t.changeDirection, 'up' );

} );

test( '文言：合成データの注記は無い（どのデータでも、出力の項目は同じ）', () => {

	const { usdjpy, jgb10 } = loadFixtures();
	const a = summaryTexts( summarize( usdjpy ), datasetOf( 'usdjpy', usdjpy ) );
	const b = summaryTexts( summarize( jgb10 ), datasetOf( 'jgb10', jgb10 ) );
	assert.deepEqual( Object.keys( a ), Object.keys( b ) );
	assert.ok( ! JSON.stringify( a ).includes( 'サンプル' ) );

} );

test( 'リード文：「2,912週分」の途中で折り返さない（数と「週」、「週」と「分」の間に WORD JOINER）', () => {

	const { usdjpy } = loadFixtures();
	const { lead } = summaryTexts( summarize( usdjpy ), datasetOf( 'usdjpy', usdjpy ) );
	assert.ok( lead.includes( `2,912${J}週${J}分の` ), lead );
	assert.equal( J, '⁠' );

} );

// ---- 終了画面の「最後に通った出来事」 ----

const passed = ( date, progress, valueText = null ) => ( { date, index: 0, progress, title: `${date} の出来事`, note: 'n', value: valueText === null ? null : 1, valueText } );

test( '最後に通った出来事：位置が終点の progress 以下のうち、いちばん後ろ。最後のフレームで通過したものも含む', () => {

	const list = [ passed( '2013-04-04', 0.5, '12,000円' ), passed( '2026-09-25', 0.999, '3.134%' ), passed( '2026-10-02', 1 ) ];
	assert.equal( lastPassedEvent( list, 1 ).date, '2026-10-02', '終点（1）と同じ位置の出来事も通過した' );
	assert.equal( lastPassedEvent( list, 0.9995 ).date, '2026-09-25' );
	assert.equal( lastPassedEvent( list, 0.6 ).date, '2013-04-04' );
	assert.equal( lastPassedEvent( list ).date, '2026-10-02', '省略時は終点' );
	assert.equal( lastPassedEvent( list, 0.1 ), null, '1 件も通過していない' );
	assert.equal( lastPassedEvent( [], 1 ), null, '出来事の注釈がないデータ' );
	assert.equal( lastPassedEvent( undefined, 1 ), null );

} );

test( '最後に通った出来事の文言：見出し（年月と見出し）と「当時 ○○」。値を出さない出来事は値がない。なければ null', () => {

	assert.deepEqual( lastEventTexts( passed( '2026-09-25', 1, '3.134%' ) ), { label: '最後に通った出来事', heading: '2026年9月　2026-09-25 の出来事', value: '当時 3.134%' } );
	assert.equal( lastEventTexts( passed( '2024-08-05', 1 ) ).value, null );
	assert.equal( lastEventTexts( null ), null );

} );
