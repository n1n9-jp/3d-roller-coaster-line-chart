import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	rectsOverlap, collidesAny, insideViewport, overlappingPairs, placeByPriority, placeLabels, spreadAxis, createLabelBoard, getLabelBoard, createHudReader
} from '../assets/js/labels.js';

const r = ( x, y, w = 40, h = 20 ) => ( { x, y, w, h } );

test( '衝突判定：重なる・接する・離れる、margin の分だけ広げて判定する', () => {

	assert.equal( rectsOverlap( r( 0, 0 ), r( 30, 10 ) ), true );
	// ちょうど接する（x の距離 40 = 幅の和の半分）は重ならない
	assert.equal( rectsOverlap( r( 0, 0 ), r( 40, 0 ) ), false );
	assert.equal( rectsOverlap( r( 0, 0 ), r( 40, 0 ), 1 ), true );
	// x は重なるが y が離れている
	assert.equal( rectsOverlap( r( 0, 0 ), r( 10, 25 ) ), false );
	assert.equal( rectsOverlap( r( 0, 0 ), r( 10, 25 ), 6 ), true );
	assert.equal( collidesAny( r( 0, 0 ), [ r( 100, 0 ), r( 10, 5 ) ] ), true );
	assert.equal( collidesAny( r( 0, 0 ), [] ), false );

} );

test( '衝突判定：画面の内側、重なっている組の一覧', () => {

	const viewport = { width: 200, height: 100 };
	assert.equal( insideViewport( r( 100, 50 ), viewport ), true );
	assert.equal( insideViewport( r( 15, 50 ), viewport ), false );
	assert.equal( insideViewport( r( 25, 50 ), viewport, 6 ), false );
	assert.deepEqual( overlappingPairs( [ r( 0, 0 ), r( 100, 0 ), r( 20, 5 ), r( 110, 10 ) ] ), [ [ 0, 2 ], [ 1, 3 ] ] );

} );

test( '優先順位つきの配置：重なるときは優先順位の低い方が退く（入力の順によらない）', () => {

	const viewport = { width: 400, height: 400 };
	const low = { priority: 1, rects: [ r( 200, 200 ) ] };
	const high = { priority: 3, rects: [ r( 210, 205 ) ] };
	const result = placeByPriority( [ low, high ], { viewport } );
	assert.equal( result[ 1 ].placed, true );
	assert.equal( result[ 0 ].placed, false );
	assert.equal( result[ 0 ].rect, null );

} );

test( '優先順位つきの配置：低い方は、次の候補の位置へ動いて置ける', () => {

	const viewport = { width: 400, height: 400 };
	const result = placeByPriority( [
		{ priority: 1, rects: [ r( 200, 200 ), r( 200, 260 ) ] }, // 1 つ目の位置は高い方と重なる → 2 つ目へ
		{ priority: 2, rects: [ r( 205, 200 ) ] }
	], { viewport, margin: 4 } );
	assert.deepEqual( result.map( ( x ) => [ x.placed, x.choice ] ), [ [ true, 1 ], [ true, 0 ] ] );

} );

test( '優先順位つきの配置：障害物（HUD）・画面の外を避け、同じ優先順位なら入力の順', () => {

	const viewport = { width: 400, height: 400 };
	const result = placeByPriority( [
		{ priority: 2, rects: [ r( 50, 50 ), r( 300, 300 ) ] }, // HUD に重なる → 2 つ目
		{ priority: 2, rects: [ r( 305, 305 ) ] }, // 同じ優先順位で先の 1 つ目と重なる → 隠れる
		{ priority: 2, rects: [ r( 5, 200 ) ] } // 画面の外
	], { viewport, obstacles: [ r( 50, 50, 100, 60 ) ] } );
	assert.deepEqual( result.map( ( x ) => x.placed ), [ true, false, false ] );
	assert.equal( result[ 0 ].choice, 1 );

} );

test( '間引き（placeLabels）：前から順に置き、重なるもの・画面の外・HUD に重なるものを除く', () => {

	const viewport = { width: 400, height: 400 };
	const rect = ( x, y ) => ( { x, y, w: 100, h: 30 } );
	const result = placeLabels( [ rect( 200, 200 ), rect( 220, 210 ), rect( 40, 200 ), rect( 200, 40 ), rect( 200, 300 ) ], [ { x: 200, y: 40, w: 200, h: 60 } ], viewport, 4 );
	assert.deepEqual( result, [ true, false, false, false, true ] );

} );

function assertSpread( out, ys, minGap ) {

	assert.equal( out.length, ys.length );
	for ( let i = 1; i < out.length; i ++ ) assert.ok( out[ i ] - out[ i - 1 ] >= minGap - 1e-9, `間隔 ${out[ i ] - out[ i - 1 ]} < ${minGap}` );

}

test( '軸の間隔：離れているものは動かさない', () => {

	const ys = [ 100, 140, 200 ];
	assert.deepEqual( spreadAxis( ys, 30 ), ys );

} );

test( '軸の間隔：詰まっているものは、望ましい位置の平均を中心に、最小の間隔まで広げる（順序を保つ）', () => {

	const ys = [ 200, 205, 210, 215, 220, 225, 230 ];
	const out = spreadAxis( ys, 30 );
	assertSpread( out, ys, 30 );
	const mean = ( a ) => a.reduce( ( s, v ) => s + v, 0 ) / a.length;
	assert.ok( Math.abs( mean( out ) - mean( ys ) ) < 1e-9 );

} );

test( '軸の間隔：一部だけ詰まっているときは、そのかたまりだけ広げる', () => {

	const ys = [ 100, 102, 300 ];
	const out = spreadAxis( ys, 20 );
	assertSpread( out, ys, 20 );
	assert.deepEqual( out, [ 91, 111, 300 ] );

} );

test( '軸の間隔：広げた結果が隣のかたまりにぶつかるときは、まとめて広げる', () => {

	const ys = [ 100, 100, 100, 125, 125 ];
	const out = spreadAxis( ys, 20 );
	assertSpread( out, ys, 20 );

} );

test( '軸の間隔：同じ y がそろっていても、入力が逆順でも、順序（添字の順に昇順）を保つ', () => {

	for ( const ys of [ [ 50, 50, 50, 50 ], [ 300, 250, 200, 150 ], [ 10, 400, 12, 11 ] ] ) {

		const out = spreadAxis( ys, 25 );
		assertSpread( out, ys, 25 );

	}

} );

test( '軸の間隔：bounds の中に収める（はみ出すときは端へ寄せる。収まらないときは min から並べる）', () => {

	const out = spreadAxis( [ 5, 6, 7 ], 20, { min: 10, max: 300 } );
	assert.deepEqual( out, [ 10, 30, 50 ] );
	const bottom = spreadAxis( [ 295, 296, 297 ], 20, { min: 10, max: 300 } );
	assertSpread( bottom, [ 295, 296, 297 ], 20 );
	assert.ok( bottom[ 2 ] <= 300 );
	const tooMany = spreadAxis( [ 50, 50, 50, 50 ], 40, { min: 0, max: 60 } );
	assert.deepEqual( tooMany, [ 0, 40, 80, 120 ] );
	assert.deepEqual( spreadAxis( [], 10 ), [] );

} );

test( '掲示板：層ごとに置き換え・読み・消去。provide した関数は読むときに計算される', () => {

	const board = createLabelBoard();
	board.set( 'axis', [ r( 1, 1 ) ] );
	board.set( 'station', [ r( 2, 2 ), r( 3, 3 ) ] );
	assert.equal( board.get().length, 3 );
	assert.equal( board.get( 'station' ).length, 2 );
	let calls = 0;
	board.provide( 'event', () => {

		calls ++;
		return [ r( 9, 9 ) ];

	} );
	assert.deepEqual( board.get( 'event' ), [ r( 9, 9 ) ] );
	assert.equal( calls, 1 );
	assert.equal( board.get().length, 4 );
	board.clear( 'event' );
	assert.deepEqual( board.get( 'event' ), [] );
	assert.deepEqual( Object.keys( board.snapshot() ).sort(), [ 'axis', 'station' ] );

} );

test( '掲示板：getLabelBoard は ctx ごとに 1 つ', () => {

	const ctx = {};
	assert.equal( getLabelBoard( ctx ), getLabelBoard( ctx ) );
	assert.notEqual( getLabelBoard( {} ), getLabelBoard( ctx ) );

} );

test( 'HUD の矩形：パネルとボタンごとの矩形を読み、intervalMs の間は読み直さない（大きさが変わったとき・invalidate の後はすぐ）', () => {

	let calls = 0;
	const el = ( left, top, width, height ) => ( {
		getBoundingClientRect() {

			calls ++;
			return { left, top, right: left + width, bottom: top + height, width, height };

		}
	} );
	const slots = {
		readout: { ...el( 0, 0, 100, 50 ), querySelector: () => el( 80, 0, 20, 10 ) },
		legend: el( 0, 60, 100, 20 ),
		chart: el( 0, 300, 100, 80 ),
		map: el( 300, 300, 80, 80 ),
		caption: el( 0, 0, 0, 0 ), // 空のキャプション（大きさ 0）は除く
		controls: { children: [ el( 300, 0, 40, 30 ), el( 350, 0, 40, 30 ) ] }
	};
	const reader = createHudReader( slots, { intervalMs: 400 } );
	const first = reader.read( 1000, '400x400' );
	assert.equal( first.length, 7 );
	assert.deepEqual( first[ 0 ], { x: 50, y: 25, w: 100, h: 50 } );
	const n = calls;
	reader.read( 1200, '400x400' );
	assert.equal( calls, n );
	reader.read( 1300, '500x400' );
	assert.ok( calls > n );
	const m = calls;
	reader.invalidate();
	reader.read( 1310, '500x400' );
	assert.ok( calls > m );
	const k = calls;
	reader.read( 1750, '500x400' );
	assert.ok( calls > k );
	assert.deepEqual( createHudReader( undefined ).read( 0 ), [] );

} );
