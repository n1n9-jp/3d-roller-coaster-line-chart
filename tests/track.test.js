import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geoToXZ, xzToGeo, buildStationSegments, getXZAt, TrackCurve } from '../assets/js/track.js';
import { Y_MIN, Y_MAX } from '../assets/js/config.js';
import { loadFixtures } from './helpers.js';

const { nikkei, stations } = loadFixtures();

test( 'geoToXZ と xzToGeo は往復で元に戻る', () => {

	for ( const s of stations ) {

		const { x, z } = geoToXZ( s.lon, s.lat );
		const { lon, lat } = xzToGeo( x, z );
		assert.ok( Math.abs( lon - s.lon ) < 1e-9, `lon ${s.station_name}` );
		assert.ok( Math.abs( lat - s.lat ) < 1e-9, `lat ${s.station_name}` );

	}

	const center = geoToXZ( 139.739138, 35.678777 );
	assert.ok( Math.abs( center.x ) < 1e-9 && Math.abs( center.z ) < 1e-9 );

} );

test( '弧長の正規化：segTStart は 0 から 1 へ単調増加する', () => {

	const seg = buildStationSegments( stations );
	const { segTStart, points, segLengths } = seg;
	assert.equal( segTStart.length, stations.length + 1 );
	assert.equal( points.length, stations.length + 1 );
	assert.deepEqual( points.at( - 1 ), points[ 0 ] ); // ループが閉じている
	assert.equal( segTStart[ 0 ], 0 );
	assert.equal( segTStart.at( - 1 ), 1 );
	for ( let i = 1; i < segTStart.length; i ++ ) {

		assert.ok( segTStart[ i ] > segTStart[ i - 1 ], `index ${i}` );

	}

	// 区間の長さに比例して t が進む
	const total = segLengths.reduce( ( a, b ) => a + b, 0 );
	assert.ok( Math.abs( total - seg.totalLength ) < 1e-9 );
	for ( let i = 0; i < segLengths.length - 1; i ++ ) {

		assert.ok( Math.abs( ( segTStart[ i + 1 ] - segTStart[ i ] ) - segLengths[ i ] / total ) < 1e-12 );

	}

} );

test( 'getXZAt：t = 0 は最初の駅、各区間の開始位置は対応する駅、t = 1 で始点に戻る', () => {

	const seg = buildStationSegments( stations );
	const first = geoToXZ( stations[ 0 ].lon, stations[ 0 ].lat );
	const at0 = getXZAt( 0, seg );
	assert.ok( Math.abs( at0.x - first.x ) < 1e-9 && Math.abs( at0.z - first.z ) < 1e-9 );

	for ( let i = 0; i < stations.length; i ++ ) {

		const expected = geoToXZ( stations[ i ].lon, stations[ i ].lat );
		const actual = getXZAt( seg.segTStart[ i ], seg );
		assert.ok( Math.abs( actual.x - expected.x ) < 1e-6, `x ${i}` );
		assert.ok( Math.abs( actual.z - expected.z ) < 1e-6, `z ${i}` );

	}

} );

test( 'TrackCurve：t = 0 は 1990 年 1 月のデータ点の高さ、範囲は Y_MIN..Y_MAX', () => {

	const curve = new TrackCurve( stations, nikkei );
	const p0 = curve.getPointAt( 0 );
	assert.ok( Math.abs( p0.y - curve.valueToY( nikkei[ 0 ].close ) ) < 1e-9 );
	assert.equal( nikkei[ 0 ].date, '1990-01-01' );
	assert.ok( Math.abs( curve.valueToY( curve.closeMin ) - Y_MIN ) < 1e-9 );
	assert.ok( Math.abs( curve.valueToY( curve.closeMax ) - Y_MAX ) < 1e-9 );

	for ( let i = 0; i <= 200; i ++ ) {

		const y = curve.getPointAt( i / 200 ).y;
		assert.ok( y >= Y_MIN - 1e-9 && y <= Y_MAX + 1e-9 );

	}

} );

test( 'TrackCurve：接線は水平な単位ベクトル、t は周期 1', () => {

	const curve = new TrackCurve( stations, nikkei );
	for ( const t of [ 0, 0.13, 0.5, 0.999 ] ) {

		const tangent = curve.getTangentAt( t );
		assert.equal( tangent.y, 0 );
		assert.ok( Math.abs( tangent.length() - 1 ) < 1e-9 );

	}

	const a = curve.getPointAt( 0.25 ).clone();
	const b = curve.getPointAt( 1.25 ).clone();
	assert.ok( a.distanceTo( b ) < 1e-9 );

} );
