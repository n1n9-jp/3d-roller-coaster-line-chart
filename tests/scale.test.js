import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	contourValues, offsetRing, formatContourLabel, formatContourShort, labelWorldHeight, screenTextPx, placeLabels
} from '../assets/js/scale.js';
import { buildDataset } from '../assets/js/data.js';
import { TrackCurve, buildStationSegments } from '../assets/js/track.js';
import { CONTOUR } from '../assets/js/config.js';
import { loadFixtures } from './helpers.js';

const { nikkei, stations } = loadFixtures();

test( '等高線の値：サンプル（最安 7,081・最高 41,701）は 1 万〜4 万', () => {

	assert.deepEqual( contourValues( 7081.55, 41701.96 ), [ 10000, 20000, 30000, 40000 ] );

} );

test( '等高線の値：実データ（最安 7,173・最高 71,250）は 1 万〜7 万', () => {

	assert.deepEqual( contourValues( 7173, 71250 ), [ 10000, 20000, 30000, 40000, 50000, 60000, 70000 ] );

} );

test( '等高線の値：最高値がちょうど 50,000 のとき 5 万を含み、最安値がちょうど 10,000 のとき 1 万を含む', () => {

	assert.deepEqual( contourValues( 12000, 50000 ), [ 20000, 30000, 40000, 50000 ] );
	assert.deepEqual( contourValues( 10000, 49999.9 ), [ 10000, 20000, 30000, 40000 ] );
	assert.deepEqual( contourValues( 10000.1, 29999 ), [ 20000 ] );

} );

test( '等高線の値：1 本もないときは空', () => {

	assert.deepEqual( contourValues( 12000, 18000 ), [] );

} );

test( '等高線の値：同梱のサンプルデータは 1 万〜4 万', () => {

	const dataset = buildDataset( nikkei, 4 );
	assert.deepEqual( contourValues( dataset.rawRange.min, dataset.rawRange.max ), [ 10000, 20000, 30000, 40000 ] );

} );

function centroid( ring ) {

	return { x: ring.reduce( ( s, p ) => s + p.x, 0 ) / ring.length, z: ring.reduce( ( s, p ) => s + p.z, 0 ) / ring.length };

}

test( '輪のずらし：正方形（どちらの周り方でも）は外側へ、辺は 1 ずつ平行にずれる', () => {

	const square = [ { x: - 1, z: - 1 }, { x: 1, z: - 1 }, { x: 1, z: 1 }, { x: - 1, z: 1 } ];
	for ( const ring of [ square, [ ...square ].reverse() ] ) {

		const out = offsetRing( ring, 0.5 );
		assert.equal( out.length, 4 );
		for ( const p of out ) {

			assert.ok( Math.abs( Math.abs( p.x ) - 1.5 ) < 1e-9 );
			assert.ok( Math.abs( Math.abs( p.z ) - 1.5 ) < 1e-9 );

		}

	}

} );

test( '輪のずらし：閉じた点列（最後が最初と同じ）は重ならない', () => {

	const closed = [ { x: - 1, z: - 1 }, { x: 1, z: - 1 }, { x: 1, z: 1 }, { x: - 1, z: 1 }, { x: - 1, z: - 1 } ];
	assert.equal( offsetRing( closed, 1 ).length, 4 );

} );

test( '輪のずらし：山手線の駅の多角形を 1.5 ずらした点は、すべて元の輪の外側（輪の中心からの距離が増える）', () => {

	const { points } = buildStationSegments( stations );
	const original = points.slice( 0, - 1 );
	const out = offsetRing( points, CONTOUR.offset );
	assert.equal( out.length, original.length );
	const c = centroid( original );
	original.forEach( ( p, i ) => {

		const before = Math.hypot( p.x - c.x, p.z - c.z );
		const after = Math.hypot( out[ i ].x - c.x, out[ i ].z - c.z );
		assert.ok( after > before, `駅 ${i}：${before} → ${after}` );
		// ずれの大きさは、1.5 以上、miter の上限（2 倍）以下
		const shift = Math.hypot( out[ i ].x - p.x, out[ i ].z - p.z );
		assert.ok( shift >= CONTOUR.offset - 1e-9 && shift <= CONTOUR.offset * 2 + 1e-9, `駅 ${i} のずれ ${shift}` );

	} );

} );

test( '輪のずらし：外側の輪は、元の多角形の外にある（面積が増える）', () => {

	const { points } = buildStationSegments( stations );
	const area = ( ring ) => Math.abs( ring.reduce( ( s, a, i ) => {

		const b = ring[ ( i + 1 ) % ring.length ];
		return s + a.x * b.z - b.x * a.z;

	}, 0 ) / 2 );
	assert.ok( area( offsetRing( points, 1.5 ) ) > area( points.slice( 0, - 1 ) ) );
	assert.ok( area( offsetRing( points, 4.5 ) ) > area( offsetRing( points, 1.5 ) ) );

} );

test( 'ラベルの書式：1 万円刻みの値を、桁区切りと「円」で', () => {

	assert.equal( formatContourLabel( 10000 ), '10,000円' );
	assert.equal( formatContourLabel( 20000 ), '20,000円' );
	assert.equal( formatContourLabel( 70000 ), '70,000円' );
	assert.equal( formatContourLabel( 100000 ), '100,000円' );
	assert.equal( formatContourLabel( 999 ), '999円' );

} );

test( '狭い画面の軸のラベル：「1万円」「7万円」（1 万円刻みでないときは小数 1 桁）', () => {

	assert.equal( formatContourShort( 10000 ), '1万円' );
	assert.equal( formatContourShort( 70000 ), '7万円' );
	assert.equal( formatContourShort( 15000 ), '1.5万円' );

} );

test( 'ラベルの大きさ：画面上の文字の高さが指定の px になる（往復で元に戻る）', () => {

	for ( const [ distance, fovDeg, viewportHeight, textPx ] of [ [ 260, 50, 900, 15 ], [ 260, 65, 844, 14 ], [ 30, 55, 900, 14 ], [ 30, 80, 844, 14 ] ] ) {

		const worldHeight = labelWorldHeight( { distance, fovDeg, viewportHeight, textPx } );
		const back = screenTextPx( { worldHeight, distance, fovDeg, viewportHeight } );
		assert.ok( Math.abs( back - textPx ) < 1e-9, `${back} ≠ ${textPx}` );

	}

} );

test( 'ラベルの大きさ：遠いほど、画角が広いほど大きく、表示が高いほど小さい（比例）', () => {

	const base = { distance: 100, fovDeg: 50, viewportHeight: 900, textPx: 15 };
	const h = labelWorldHeight( base );
	assert.ok( Math.abs( labelWorldHeight( { ...base, distance: 200 } ) - 2 * h ) < 1e-9 );
	assert.ok( Math.abs( labelWorldHeight( { ...base, viewportHeight: 450 } ) - 2 * h ) < 1e-9 );
	assert.ok( Math.abs( labelWorldHeight( { ...base, textPx: 30 } ) - 2 * h ) < 1e-9 );
	assert.ok( labelWorldHeight( { ...base, fovDeg: 80 } ) > h );

} );

test( 'ラベルの大きさ：俯瞰（距離 260、画角 50°、高さ 900）でピルは約 7 ワールド単位、一人称（距離 30）では約 1 前後', () => {

	const overview = labelWorldHeight( { distance: 260, fovDeg: 50, viewportHeight: 900, textPx: 15 } );
	assert.ok( overview > 6 && overview < 8, `${overview}` );
	const ride = labelWorldHeight( { distance: 30, fovDeg: 55, viewportHeight: 900, textPx: 14 } );
	assert.ok( ride > 0.8 && ride < 1.5, `${ride}` );

} );

test( 'ラベルの間引き：重なるもの・画面の外・HUD に重なるものを除き、優先順に置く', () => {

	const viewport = { width: 400, height: 400 };
	const rect = ( x, y, extra = {} ) => ( { x, y, w: 100, h: 30, ...extra } );
	const result = placeLabels( [
		rect( 200, 200 ), // 置ける
		rect( 220, 210 ), // 1 つ目に重なる
		rect( 40, 200 ), // 画面の左にはみ出す
		rect( 200, 40 ), // HUD に重なる
		rect( 200, 300 ) // 置ける
	], [ { x: 200, y: 40, w: 200, h: 60 } ], viewport, 4 );
	assert.deepEqual( result, [ true, false, false, false, true ] );

} );

test( 'ラベルの間引き：margin の分だけ隙間を空け、group ごとの上限と firstOf を守る', () => {

	const viewport = { width: 600, height: 600 };
	const rect = ( x, y, extra = {} ) => ( { x, y, w: 100, h: 30, ...extra } );
	// 縦に 32px 離れた 2 つ：margin 0 なら置け、margin 4 なら重なる
	assert.deepEqual( placeLabels( [ rect( 300, 300 ), rect( 300, 332 ) ], [], viewport, 0 ), [ true, true ] );
	assert.deepEqual( placeLabels( [ rect( 300, 300 ), rect( 300, 332 ) ], [], viewport, 4 ), [ true, false ] );
	// group の上限
	assert.deepEqual(
		placeLabels( [ rect( 100, 100, { group: 1, limit: 2 } ), rect( 300, 100, { group: 1, limit: 2 } ), rect( 500, 100, { group: 1, limit: 2 } ) ], [], viewport, 0 ),
		[ true, true, false ]
	);
	// firstOf：最初に置けた 1 つだけ（置けなかった候補は飛ばして、次を置く）
	assert.deepEqual(
		placeLabels( [ rect( 300, 300 ), rect( 310, 300, { firstOf: 'a' } ), rect( 100, 100, { firstOf: 'a' } ), rect( 500, 100, { firstOf: 'a' } ) ], [], viewport, 0 ),
		[ true, false, true, false ]
	);

} );

test( '等高線の高さ：curve.valueToY は終値に対して単調で、レールの高さと同じ尺度（上下の等高線の間に収まる）', () => {

	const dataset = buildDataset( nikkei, 4 );
	const curve = new TrackCurve( stations, dataset.smoothed );
	const values = contourValues( dataset.rawRange.min, dataset.rawRange.max );
	const ys = values.map( ( v ) => curve.valueToY( v ) );
	for ( let i = 1; i < ys.length; i ++ ) assert.ok( ys[ i ] > ys[ i - 1 ] );
	// どの週の終値でも、レールの高さは、その終値を挟む 2 本の等高線（または範囲の端）の間にある
	for ( const point of dataset.smoothed ) {

		const y = curve.valueToY( point.close );
		const below = values.filter( ( v ) => v <= point.close );
		const above = values.filter( ( v ) => v > point.close );
		if ( below.length ) assert.ok( y >= curve.valueToY( below.at( - 1 ) ) );
		if ( above.length ) assert.ok( y < curve.valueToY( above[ 0 ] ) );

	}

} );
