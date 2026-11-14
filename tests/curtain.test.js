// カーテンと上端の帯（curtain.js）、俯瞰の構図（view.js の fitOverview）。three.js のレンダラは使わない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrackCurve } from '../assets/js/track.js';
import { buildDataset } from '../assets/js/data.js';
import { PALETTE, RAIL } from '../assets/js/config.js';
import { Color } from '../assets/js/three.core.js';
import { RAIL_STATE } from '../assets/js/rail-colors.js';
import {
	VERTS_PER_SEGMENT, TRIANGLES_PER_SEGMENT,
	createCurtainGeometry, createTopBandGeometry, createCurtainPainter,
	curtainPaletteFrom, topBandPaletteFrom, overviewSubjectPoints
} from '../assets/js/curtain.js';
import { fitOverview, overviewMode } from '../assets/js/view.js';
import { loadFixtures } from './helpers.js';

const { nikkei, stations } = loadFixtures();
const dataset = buildDataset( nikkei );
const D = 60;
const EPS = 1e-4;

const makeCurve = ( linkFraction = 0 ) => new TrackCurve( stations, dataset.smoothed, { linkFraction } );

const lin = ( hex ) => {

	const c = new Color( hex );
	return [ c.r, c.g, c.b ];

};

function rgbaAt( geometry, v ) {

	const a = geometry.getAttribute( 'color' ).array;
	return [ a[ v * 4 ], a[ v * 4 + 1 ], a[ v * 4 + 2 ], a[ v * 4 + 3 ] ];

}

function assertRgb( actual, expected, msg ) {

	for ( let i = 0; i < 3; i ++ ) assert.ok( Math.abs( actual[ i ] - expected[ i ] ) < 1e-6, `${msg}: ${actual} != ${expected}` );

}

test( '頂点数・三角形の数・index', () => {

	const g = createCurtainGeometry( makeCurve(), D );
	assert.equal( g.getAttribute( 'position' ).count, VERTS_PER_SEGMENT * D );
	assert.equal( g.getAttribute( 'color' ).count, VERTS_PER_SEGMENT * D );
	assert.equal( g.getAttribute( 'color' ).itemSize, 4 );
	assert.equal( g.index.count, TRIANGLES_PER_SEGMENT * 3 * D );
	// 区間 s の三角形は区間 s の頂点だけを使う
	const idx = g.index.array;
	for ( let s = 0; s < D; s ++ ) {

		for ( let k = 0; k < 6; k ++ ) {

			const v = idx[ 6 * s + k ];
			assert.ok( v >= 4 * s && v < 4 * s + 4 );

		}

	}

} );

test( '上端は curve.getPointAt と一致し、下端は床（y = 0）', () => {

	const curve = makeCurve();
	const g = createCurtainGeometry( curve, D );
	const pos = g.getAttribute( 'position' );
	for ( let s = 0; s < D; s ++ ) {

		for ( let k = 0; k < 2; k ++ ) {

			const p = curve.getPointAt( ( s + k ) / D );
			const top = 4 * s + 2 * k, bottom = top + 1;
			assert.ok( Math.abs( pos.getX( top ) - p.x ) < EPS );
			assert.ok( Math.abs( pos.getY( top ) - p.y ) < EPS );
			assert.ok( Math.abs( pos.getZ( top ) - p.z ) < EPS );
			assert.ok( Math.abs( pos.getX( bottom ) - p.x ) < EPS );
			assert.equal( pos.getY( bottom ), 0 );
			assert.ok( Math.abs( pos.getZ( bottom ) - p.z ) < EPS );

		}

	}

	// 隣の区間と切れ目なくつながる（区間 s の終わり = 区間 s+1 の始まり）
	for ( let s = 0; s + 1 < D; s ++ ) {

		for ( const c of [ 'getX', 'getY', 'getZ' ] ) assert.ok( Math.abs( pos[ c ]( 4 * s + 2 ) - pos[ c ]( 4 * ( s + 1 ) ) ) < EPS );

	}

} );

test( '上端の帯：幅 width、高さは上端 + lift、床と平行', () => {

	const curve = makeCurve();
	const width = 2, lift = 0.15;
	const g = createTopBandGeometry( curve, D, { width, lift } );
	const pos = g.getAttribute( 'position' );
	assert.equal( pos.count, 4 * D );
	for ( let s = 0; s < D; s += 7 ) {

		const p = curve.getPointAt( s / D );
		const a = 4 * s, b = a + 1;
		assert.ok( Math.abs( pos.getY( a ) - ( p.y + lift ) ) < EPS );
		assert.ok( Math.abs( pos.getY( b ) - ( p.y + lift ) ) < EPS );
		assert.ok( Math.abs( Math.hypot( pos.getX( a ) - pos.getX( b ), pos.getZ( a ) - pos.getZ( b ) ) - width ) < EPS );
		// 中点がレールの点
		assert.ok( Math.abs( ( pos.getX( a ) + pos.getX( b ) ) / 2 - p.x ) < EPS );
		assert.ok( Math.abs( ( pos.getZ( a ) + pos.getZ( b ) ) / 2 - p.z ) < EPS );

	}

} );

test( '塗り：上端が濃く床が薄い。走行済みの範囲が進む・戻る・最初から', () => {

	const g = createCurtainGeometry( makeCurve(), D );
	const colors = curtainPaletteFrom();
	const painter = createCurtainPainter( g, { colors } );
	const ahead = lin( PALETTE.contour ), ridden = lin( PALETTE.railRiddenYellow );

	painter.paintAll( 0 );
	assert.equal( painter.riddenCount, 0 );
	for ( let s = 0; s < D; s ++ ) {

		assertRgb( rgbaAt( g, 4 * s ), ahead, `s=${s}` );
		assert.equal( rgbaAt( g, 4 * s )[ 3 ], Math.fround( RAIL.curtain.topAlpha ) );
		assert.equal( rgbaAt( g, 4 * s + 1 )[ 3 ], Math.fround( RAIL.curtain.bottomAlpha ) );
		assert.ok( RAIL.curtain.topAlpha > RAIL.curtain.bottomAlpha );

	}

	// 進む：区間 0..9 を通り過ぎた
	let r = painter.update( 10 / D );
	assert.deepEqual( r, { segments: 10, vertices: 40 } );
	for ( let s = 0; s < D; s ++ ) assertRgb( rgbaAt( g, 4 * s + 3 ), s < 10 ? ridden : ahead, `進む s=${s}` );
	// 転送範囲は変わった区間だけ（paintAll 直後のフレームは全体転送なので範囲なし）
	assert.equal( g.getAttribute( 'color' ).updateRanges.length, 0 );

	r = painter.update( 12.5 / D );
	assert.deepEqual( r, { segments: 2, vertices: 8 } );
	assert.deepEqual( g.getAttribute( 'color' ).updateRanges.at( - 1 ), { start: 10 * 4 * 4, count: 8 * 4 } );

	// 変わらないフレームは何もしない
	assert.deepEqual( painter.update( 12.7 / D ), { segments: 0, vertices: 0 } );

	// 戻る
	r = painter.update( 5 / D );
	assert.deepEqual( r, { segments: 7, vertices: 28 } );
	for ( let s = 0; s < D; s ++ ) assertRgb( rgbaAt( g, 4 * s ), s < 5 ? ridden : ahead, `戻る s=${s}` );

	// 最初から
	painter.paintAll( 0 );
	assert.equal( painter.riddenCount, 0 );
	for ( let s = 0; s < D; s ++ ) assertRgb( rgbaAt( g, 4 * s ), ahead, `最初から s=${s}` );

} );

test( '連絡区間：薄い別の色で、走行済みになっても変わらない', () => {

	const curve = makeCurve( 0.1 );
	const g = createCurtainGeometry( curve, D );
	const painter = createCurtainPainter( g, { isLink: ( t ) => curve.isLink( t ), colors: curtainPaletteFrom() } );
	painter.paintAll( 1 );
	const link = lin( PALETTE.railDeadheadYellow ), ridden = lin( PALETTE.railRiddenYellow );
	let links = 0;
	for ( let s = 0; s < D; s ++ ) {

		const isLink = curve.isLink( ( s + 0.5 ) / D );
		const top = rgbaAt( g, 4 * s );
		if ( isLink ) {

			links ++;
			assertRgb( top, link, `link s=${s}` );
			assert.ok( top[ 3 ] < RAIL.curtain.topAlpha );

		} else {

			assertRgb( top, ridden, `ridden s=${s}` );

		}

	}

	assert.equal( links, 6 );

} );

test( '上端の帯の塗り：走行済みは琥珀、これからは明るい色、alpha は 1', () => {

	const g = createTopBandGeometry( makeCurve(), D );
	const painter = createCurtainPainter( g, { colors: topBandPaletteFrom() } );
	painter.paintAll( 0.5 );
	assertRgb( rgbaAt( g, 0 ), lin( PALETTE.railRiddenWhite ), 'ridden' );
	assertRgb( rgbaAt( g, 4 * ( D - 1 ) + 1 ), lin( PALETTE.railAheadWhite ), 'ahead' );
	assert.equal( rgbaAt( g, 1 )[ 3 ], 1 );
	assert.equal( topBandPaletteFrom()[ RAIL_STATE.AHEAD ].alpha[ 1 ], 1 );

} );

test( '俯瞰の構図：輪が HUD を避けた範囲の中央に、上限の大きさで収まる', () => {

	const points = overviewSubjectPoints( makeCurve( 0.03 ) );
	const insets = { top: 184, right: 24, bottom: 40, left: 24 };
	const fit = fitOverview( points, { width: 1440, height: 900, fovDeg: 50, elevationDeg: 48, insets, maxWidth: 0.9, maxHeight: 0.72 } );
	const b = fit.bounds;
	// 高さが画面の 72%（横長は高さで決まる）
	assert.ok( Math.abs( ( b.y1 - b.y0 ) / 2 - 0.72 ) < 1e-3, JSON.stringify( b ) );
	// 範囲の中に収まる
	assert.ok( b.y1 <= 1 - 2 * 184 / 900 + 1e-3 && b.y0 >= - 1 + 2 * 40 / 900 - 1e-3 );
	assert.ok( Math.abs( b.x0 + b.x1 ) < 1e-3 );
	assert.ok( fit.distance > 100 && fit.distance < 400 );

	// 縦長：幅が上限（80%）で決まる
	const m = fitOverview( points, { width: 390, height: 844, fovDeg: 65, elevationDeg: 48, insets: { top: 148, right: 12, bottom: 206, left: 12 }, maxWidth: 0.8, maxHeight: 0.9 } );
	assert.ok( Math.abs( ( m.bounds.x1 - m.bounds.x0 ) / 2 - 0.8 ) < 1e-3 );
	assert.ok( m.bounds.y1 <= 1 - 2 * 148 / 844 + 1e-3 && m.bounds.y0 >= - 1 + 2 * 206 / 844 - 1e-3 );

} );

test( 'HUD のモードの判定は hud.css と同じ', () => {

	assert.equal( overviewMode( 1440, 900 ), 'wide' );
	assert.equal( overviewMode( 1024, 768 ), 'wide' );
	assert.equal( overviewMode( 800, 600 ), 'wide' );
	assert.equal( overviewMode( 390, 844 ), 'narrow' );
	assert.equal( overviewMode( 844, 390 ), 'short' );
	assert.equal( overviewMode( 600, 500 ), 'short' );

} );
