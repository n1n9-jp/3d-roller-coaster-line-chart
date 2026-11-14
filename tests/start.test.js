import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from './helpers.js';
import {
	parseYMD, formatYearMonth, formatDate, periodOf, kickerText, descriptionText, chipTexts,
	creditLine, metaDescription, dataSourceItems, BASE_DESCRIPTION, SAMPLE_NOTE, ERROR_TEXTS
} from '../assets/js/ui/texts.js';

const REAL_META = {
	kind: 'real',
	label: '日経平均株価（週次終値）',
	source: '日本経済新聞社「日経平均株価」',
	via: 'FRED（系列 NIKKEI225）',
	sourceUrl: 'https://fred.stlouisfed.org/series/NIKKEI225',
	fetchedAt: '2026-11-14'
};

test( '日付の読み取りと表記', () => {

	assert.deepEqual( parseYMD( '2025-12-29' ), { y: 2025, m: 12, d: 29 } );
	assert.equal( formatYearMonth( '1990-01-01' ), '1990年1月' );
	assert.equal( formatDate( '2026-11-14' ), '2026年11月14日' );
	assert.equal( formatDate( 'きのう' ), 'きのう' );
	assert.throws( () => parseYMD( 'x' ) );

} );

test( '期間はデータの最後の週から作る（サンプル）', () => {

	const series = readJson( 'data/nikkei225.json' );
	const period = periodOf( series );
	assert.equal( period.startYear, '1990年' );
	assert.equal( period.startLabel, '1990年1月' );
	assert.equal( period.endLabel, '2025年12月' );
	assert.equal( period.years, 36 );
	assert.equal( kickerText( period ), '1990年1月〜2025年12月' );
	assert.deepEqual( chipTexts( period ), [ '高さ＝株価（週次終値）', '一周＝1990年→2025年12月' ] );
	assert.match( descriptionText( period ), /^レールの高さが、その週の日経平均株価です。山手線を一周するあいだに、1990年から2025年12月までの約36年を走り抜けます。$/ );

} );

test( '期間はデータの最後の週から作る（実データの長さ）', () => {

	const period = periodOf( [ { date: '1990-01-01', close: 1 }, { date: '2026-11-09', close: 2 } ] );
	assert.equal( period.endLabel, '2026年11月' );
	assert.equal( period.years, 37 );
	assert.match( descriptionText( period ), /2026年11月までの約37年/ );

} );

test( '出典の一行：サンプルと実データ', () => {

	assert.equal( creditLine( { kind: 'sample' } ), 'データ：サンプルデータ（実際の日経平均ではありません）　描画：three.js' );
	assert.equal( creditLine( undefined ), 'データ：サンプルデータ（実際の日経平均ではありません）　描画：three.js' );
	assert.equal(
		creditLine( REAL_META ),
		'データ：日本経済新聞社「日経平均株価」（FRED（系列 NIKKEI225） 経由、2026年11月14日取得）　描画：three.js'
	);
	// 項目が欠けても括弧が壊れない
	assert.equal( creditLine( { kind: 'real', source: '出典A' } ), 'データ：出典A　描画：three.js' );
	assert.equal( creditLine( { kind: 'real', source: '出典A', fetchedAt: '2026-01-02' } ), 'データ：出典A（2026年1月2日取得）　描画：three.js' );

} );

test( 'meta description：サンプルのときだけ断り書きを付ける', () => {

	assert.equal( metaDescription( 'real' ), BASE_DESCRIPTION );
	assert.equal( metaDescription( 'sample' ), `${BASE_DESCRIPTION}（表示はサンプルデータです）` );
	assert.ok( ! BASE_DESCRIPTION.includes( '2025' ) && ! BASE_DESCRIPTION.includes( '2026' ), '期間の終わりを書かない' );

} );

test( '情報パネルのデータ出典', () => {

	const sample = dataSourceItems( { kind: 'sample' } );
	assert.equal( sample.length, 1 );
	assert.equal( sample[ 0 ].text, '同梱のデータはサンプル（合成）で、実際の日経平均株価ではありません。実データで動かす手順は README を参照してください。' );
	assert.equal( sample[ 0 ].link, undefined );

	const [ real ] = dataSourceItems( REAL_META );
	assert.match( real.text, /日本経済新聞社「日経平均株価」（©日本経済新聞社）/ );
	assert.match( real.text, /米セントルイス連邦準備銀行 FRED（系列 NIKKEI225）経由で取得（2026年11月14日取得）/ );
	assert.match( real.text, /週次値は各週の最終営業日の終値です。$/ );
	assert.equal( real.link.href, REAL_META.sourceUrl );

} );

test( 'エラーの文言は種類ごとに揃っている', () => {

	for ( const kind of [ 'data', 'local', 'webgl', 'file', 'boot' ] ) {

		const text = ERROR_TEXTS[ kind ];
		assert.ok( text.title && text.body, kind );
		assert.equal( typeof text.reload, 'boolean', kind );

	}

	assert.match( ERROR_TEXTS.local.body, /npm run fetch-data/ );
	assert.equal( ERROR_TEXTS.webgl.reload, false );
	assert.equal( ERROR_TEXTS.data.reload, true );
	assert.ok( SAMPLE_NOTE.includes( '実際の日経平均ではありません' ) );

} );

test( 'index.html のフォールバックの文言は ERROR_TEXTS と同じ（モジュールが読めないときに使う）', async () => {

	const { readFileSync } = await import( 'node:fs' );
	const html = readFileSync( new URL( '../index.html', import.meta.url ), 'utf8' );
	for ( const kind of [ 'boot', 'file' ] ) {

		assert.ok( html.includes( ERROR_TEXTS[ kind ].title ), `${kind} の見出し` );
		assert.ok( html.includes( ERROR_TEXTS[ kind ].body ), `${kind} の本文` );

	}

	assert.ok( html.includes( BASE_DESCRIPTION ), 'meta description' );

} );
