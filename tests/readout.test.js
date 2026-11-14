import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekIndex, createReadout } from '../assets/js/hud/readout.js';
import { buildDataset } from '../assets/js/data.js';
import { DATASETS } from '../assets/js/config.js';
import { createEvents } from '../assets/js/events.js';
import { loadFixtures } from './helpers.js';

test( '週の位置：範囲内に丸める', () => {

	assert.equal( weekIndex( 0, 10 ), 0 );
	assert.equal( weekIndex( 3.99, 10 ), 3 );
	assert.equal( weekIndex( 9, 10 ), 9 );
	assert.equal( weekIndex( 9.5, 10 ), 9 );
	assert.equal( weekIndex( - 0.2, 10 ), 0 );

} );

// ---- createReadout：最小の DOM の代用品で、表示する文字列を確かめる ----

const IDS = [ 'year-display', 'ro-month', 'ro-day', 'ro-value', 'ro-unit', 'ro-label', 'ro-change', 'ro-change-full', 'ro-change-short' ];

function withDom( fn ) {

	const original = globalThis.document;
	const elements = Object.fromEntries( IDS.map( ( id ) => [ id, { id, textContent: '', dataset: {} } ] ) );
	globalThis.document = { getElementById: ( id ) => elements[ id ] ?? null };
	try {

		return fn( elements );

	} finally {

		globalThis.document = original;

	}

}

function readoutFor( id, series, elements ) {

	const def = DATASETS[ id ];
	const dataset = buildDataset( series, 4, undefined, def );
	const ctx = { dataset, events: createEvents(), ui: { slots: {}, announce() {} } };
	const readout = createReadout( ctx );
	const show = ( index ) => readout.update( { point: dataset.raw[ index ], dataIndex: index } );
	return { dataset, readout, show, text: ( key ) => elements[ key ].textContent };

}

test( '現在値の帯（ドル円）：値は小数2桁、単位は円、ラベルは週次・1ドルあたり、前週比は円安・円高つき', () => {

	const { usdjpy } = loadFixtures();
	withDom( ( el ) => {

		const r = readoutFor( 'usdjpy', usdjpy, el );
		// 最初の週（1971-01-04、357.82）：前週比なし
		assert.equal( r.text( 'year-display' ), '1971' );
		assert.equal( r.text( 'ro-month' ), '年1月' );
		assert.equal( r.text( 'ro-day' ), '4日の週' );
		assert.equal( r.text( 'ro-value' ), '357.82' );
		assert.equal( r.text( 'ro-unit' ), '円' );
		assert.equal( r.text( 'ro-label' ), '週次・1ドルあたり' );
		assert.equal( r.text( 'ro-change-full' ), '前週比 —' );
		assert.equal( el[ 'ro-change' ].dataset.direction, 'none' );

		// 2 週目（1971-01-11、358.40）：円安方向。最大級の値が 6 文字で収まる
		r.show( 1 );
		assert.equal( r.text( 'ro-value' ), '358.40' );
		assert.equal( r.text( 'ro-change-full' ), '前週比 ▲0.58円安（+0.2%）' );
		assert.equal( r.text( 'ro-change-short' ), '▲0.58円安' );
		assert.equal( el[ 'ro-change' ].dataset.direction, 'up' );

	} );

} );

test( '現在値の帯（金利）：マイナスは U+2212、単位は %、前週比はポイント', () => {

	const { jgb10 } = loadFixtures();
	const negative = jgb10.findIndex( ( d, i ) => i > 0 && d.close < 0 && jgb10[ i - 1 ].close < 0 );
	assert.ok( negative > 0 );
	withDom( ( el ) => {

		const r = readoutFor( 'jgb10', jgb10, el );
		assert.equal( r.text( 'ro-label' ), '週次・利回り' );
		assert.equal( r.text( 'ro-unit' ), '%' );
		r.show( negative );
		assert.match( r.text( 'ro-value' ), /^−0\.\d{3}$/ );
		assert.match( r.text( 'ro-change-full' ), /^前週比 [▲▼]\d\.\d{3}ポイント$/ );
		assert.ok( ! r.text( 'ro-change-full' ).includes( '%' ) );

	} );

} );

test( '現在値の帯（日経平均）：3桁区切りの整数、単位は円、ラベルは週次終値、前週比は円と％', () => {

	const { usdjpy } = loadFixtures();
	// 日経平均の定義で、桁の大きい値（ドル円の系列を 100 倍）を表示する
	const scaled = usdjpy.map( ( d ) => ( { date: d.date, close: d.close * 200 } ) );
	withDom( ( el ) => {

		const r = readoutFor( 'nikkei', scaled, el );
		assert.equal( r.text( 'ro-label' ), '週次終値' );
		assert.equal( r.text( 'ro-unit' ), '円' );
		assert.equal( r.text( 'ro-value' ), '71,564' );
		r.show( 1 );
		assert.equal( r.text( 'ro-value' ), '71,680' );
		assert.equal( r.text( 'ro-change-full' ), '前週比 ▲116円（+0.2%）' );
		assert.equal( r.text( 'ro-change-short' ), '▲0.2%' );

	} );

} );

// ---- 値のない週の行がない箇所：前の行との間隔を書く ----

/** 前の行との間隔が 7 日を超える行の位置（最初の行を除く）。 */
function gapRows( series ) {

	const rows = [];
	for ( let i = 1; i < series.length; i ++ ) {

		const days = ( Date.parse( series[ i ].date ) - Date.parse( series[ i - 1 ].date ) ) / 86400000;
		if ( days > 7 ) rows.push( { i, weeks: Math.round( days / 7 ) } );

	}

	return rows;

}

test( '現在値の帯（ドル円）：1971-08-30 の前の行は 3 週前なので、「前週比」ではなく「3週前比」', () => {

	const { usdjpy } = loadFixtures();
	const i = usdjpy.findIndex( ( d ) => d.date === '1971-08-30' );
	assert.equal( usdjpy[ i - 1 ].date, '1971-08-09' );
	withDom( ( el ) => {

		const r = readoutFor( 'usdjpy', usdjpy, el );
		r.show( i );
		assert.equal( r.text( 'ro-change-full' ), '3週前比 ▼17.21円高（−4.8%）' );
		assert.equal( r.text( 'ro-change-short' ), '3週前比 ▼17.21円高' );
		assert.equal( el[ 'ro-change' ].dataset.direction, 'down' );

		// 前の週は、1 週前（08-09 の前の行は 08-02）、後の週は 1 週前
		r.show( i - 1 );
		assert.match( r.text( 'ro-change-full' ), /^前週比 / );
		r.show( i + 1 );
		assert.match( r.text( 'ro-change-full' ), /^前週比 / );
		assert.equal( r.text( 'ro-change-short' ).startsWith( '前週比' ), false, '前週比のときは短い形で略す' );

	} );

} );

test( '現在値の帯（金利）：2 週あく箇所（1987-01-05、2019-05-06）は「2週前比」。ほかの週は「前週比」', () => {

	const { jgb10 } = loadFixtures();
	const gaps = gapRows( jgb10 );
	assert.deepEqual( gaps.map( ( g ) => jgb10[ g.i ].date ), [ '1987-01-05', '2019-05-06' ] );
	withDom( ( el ) => {

		const r = readoutFor( 'jgb10', jgb10, el );
		for ( const { i, weeks } of gaps ) {

			r.show( i );
			assert.match( r.text( 'ro-change-full' ), new RegExp( `^${weeks}週前比 [▲▼]\\d\\.\\d{3}ポイント$` ), jgb10[ i ].date );
			assert.match( r.text( 'ro-change-short' ), new RegExp( `^${weeks}週前比 ` ), jgb10[ i ].date );

		}

		// 全週：間隔が 7 日を超える行だけが「N週前比」
		const gapIndexes = new Set( gaps.map( ( g ) => g.i ) );
		for ( let i = 1; i < jgb10.length; i ++ ) {

			r.show( i );
			assert.equal( /^前週比 /.test( r.text( 'ro-change-full' ) ), ! gapIndexes.has( i ), jgb10[ i ].date );

		}

	} );

} );
