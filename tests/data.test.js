import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMovingAverage, buildDataset, closeRange, indexAt, interpolateClose } from '../assets/js/data.js';
import { loadFixtures } from './helpers.js';

const series = ( closes ) => closes.map( ( close, i ) => ( { date: `2000-01-${String( i + 1 ).padStart( 2, '0' )}`, close } ) );

test( '移動平均：窓 4 は前 2・後 2 の範囲（端は切り詰め）で平均する', () => {

	const result = applyMovingAverage( series( [ 10, 20, 30, 40, 50 ] ), 4 );
	// i=0: [0,2) → 15, i=1: [0,3) → 20, i=2: [0,4) → 25, i=3: [1,5) → 35, i=4: [2,5) → 40
	assert.deepEqual( result.map( d => d.close ), [ 15, 20, 25, 35, 40 ] );

} );

test( '移動平均：日付など終値以外は保たれ、入力は変更されない', () => {

	const input = series( [ 1, 2, 3 ] );
	const result = applyMovingAverage( input, 2 );
	assert.deepEqual( result.map( d => d.date ), input.map( d => d.date ) );
	assert.deepEqual( input.map( d => d.close ), [ 1, 2, 3 ] );

} );

test( '移動平均：定数列は変わらない', () => {

	const result = applyMovingAverage( series( [ 7, 7, 7, 7, 7, 7 ] ), 4 );
	assert.ok( result.every( d => d.close === 7 ) );

} );

test( 'closeRange / indexAt / interpolateClose', () => {

	const s = series( [ 5, 1, 9, 3 ] );
	assert.deepEqual( closeRange( s ), { min: 1, max: 9 } );
	assert.equal( indexAt( s, 0 ), 0 );
	assert.equal( indexAt( s, 1 ), 3 );
	assert.equal( indexAt( s, 0.5 ), 1 );
	assert.equal( interpolateClose( s, 0 ), 5 );
	assert.equal( interpolateClose( s, 1 ), 3 );
	assert.equal( interpolateClose( s, 1 / 6 ), 3 ); // 5 と 1 の中点
	assert.equal( interpolateClose( s, 1 / 3 ), 1 );

} );

test( 't = 0 は 1990 年 1 月 1 日のデータ点、t = 1 は最後のデータ点', () => {

	const { nikkei } = loadFixtures();
	const dataset = buildDataset( nikkei );
	assert.equal( dataset.rawAt( 0 ).date, '1990-01-01' );
	assert.equal( dataset.rawAt( 1 ).date, nikkei.at( - 1 ).date );
	assert.equal( dataset.raw, nikkei );

} );

test( '実データ：表示用は生データ、レール用は移動平均で、範囲は平均後の方が狭い', () => {

	const { nikkei } = loadFixtures();
	const dataset = buildDataset( nikkei );
	assert.equal( dataset.smoothed.length, dataset.raw.length );
	assert.ok( dataset.smoothedRange.min >= dataset.rawRange.min );
	assert.ok( dataset.smoothedRange.max <= dataset.rawRange.max );
	assert.ok( dataset.smoothedRange.max < dataset.rawRange.max || dataset.smoothedRange.min > dataset.rawRange.min );

} );

test( 'buildDataset を既定の引数で呼ぶと、移動平均は窓 4（前 2・後 2）になる', () => {

	const closes = [ 10, 20, 30, 40, 50, 60, 70 ];
	const dataset = buildDataset( series( closes ) );
	// i=0: [0,2) 15, i=1: [0,3) 20, i=2: [0,4) 25, i=3: [1,5) 35, i=4: [2,6) 45, i=5: [3,7) 55, i=6: [4,7) 60
	const expected = applyMovingAverage( series( closes ), 4 ).map( d => d.close );
	assert.deepEqual( dataset.smoothed.map( d => d.close ), expected );
	assert.deepEqual( dataset.smoothed.map( d => d.close ), [ 15, 20, 25, 35, 45, 55, 60 ] );

} );

test( '実データ：buildDataset の既定の平滑化は、窓 4 の移動平均と一致する', () => {

	const { nikkei } = loadFixtures();
	const dataset = buildDataset( nikkei );
	const expected = applyMovingAverage( nikkei, 4 );
	assert.equal( dataset.smoothed.length, expected.length );
	for ( let i = 0; i < expected.length; i ++ ) {

		assert.ok( Math.abs( dataset.smoothed[ i ].close - expected[ i ].close ) < 1e-9, `index ${i}` );

	}

	// 先頭は [0,2) の平均
	assert.ok( Math.abs( dataset.smoothed[ 0 ].close - ( nikkei[ 0 ].close + nikkei[ 1 ].close ) / 2 ) < 1e-9 );

} );
