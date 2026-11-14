// レールの色分け（rail-colors.js）。three.js のレンダラは使わず、同梱の RollerCoasterGeometry を小さな分割数で実際に作って確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { TrackCurve } from '../assets/js/track.js';
import { buildDataset } from '../assets/js/data.js';
import { PALETTE } from '../assets/js/config.js';
import { Color, DynamicDrawUsage } from '../assets/js/three.core.js';
import {
	PART, RAIL_STATE,
	segmentStartIndex, railVertexCount, riddenSegmentCount,
	buildRailColorMap, createRailPainter, createRailColors,
	RUN_UP_SEGMENTS, runUpCurve, railDrawStart
} from '../assets/js/rail-colors.js';
import { series1990 as makeSeries1990, stretchedSeries, readJson } from './helpers.js';

// 同梱の RollerCoaster.js は bare の 'three' を import する（ブラウザでは importmap が解決する）。
// Node では 'three' を three.core.js へ向ける（ジオメトリの生成に必要なクラスはすべて core にある）。
const CORE_URL = new URL( '../assets/js/three.core.js', import.meta.url ).href;
register( 'data:text/javascript,' + encodeURIComponent( `
	export async function resolve( specifier, context, next ) {
		if ( specifier === 'three' ) return { url: ${JSON.stringify( CORE_URL )}, shortCircuit: true };
		return next( specifier, context );
	}
` ) );
const { RollerCoasterGeometry, RollerCoasterShadowGeometry } = await import( '../assets/jsm/misc/RollerCoaster.js' );

const series1990 = makeSeries1990();
const dataset = buildDataset( series1990 );

const D = 40; // 小さな分割数（偶数）
const D_ODD = 41;

const track = new TrackCurve( dataset.smoothed );

// レールは、弧長で引ける曲線（track.arcCurve）で作る（rail.js と同じ）。curve は区間の位置を確かめるための arcCurve
function makeGeometry( divisions ) {

	const curve = track.arcCurve;
	return { curve, geometry: new RollerCoasterGeometry( curve, divisions ) };

}

const lin = ( hex ) => {

	const c = new Color( hex );
	return [ c.r, c.g, c.b ];

};

const COLOR = {
	[ RAIL_STATE.AHEAD ]: [ lin( PALETTE.railAheadYellow ), lin( PALETTE.railAheadWhite ) ],
	[ RAIL_STATE.RIDDEN ]: [ lin( PALETTE.railRiddenYellow ), lin( PALETTE.railRiddenWhite ) ]
};

function colorAt( geometry, vi ) {

	const a = geometry.getAttribute( 'color' ).array;
	return [ a[ vi * 3 ], a[ vi * 3 + 1 ], a[ vi * 3 + 2 ] ];

}

/** 全頂点が期待の状態の色か。stateOf( s ) が区間 s の期待の状態。 */
function assertColors( geometry, map, stateOf, label = '' ) {

	for ( let vi = 0; vi < map.vertexCount; vi ++ ) {

		const s = map.segmentOf( vi );
		const part = map.partOf( vi );
		const isRail = part === PART.RAIL_RIGHT || part === PART.RAIL_LEFT;
		const expected = COLOR[ stateOf( s ) ][ isRail ? 1 : 0 ];
		const got = colorAt( geometry, vi );
		if ( got[ 0 ] !== Math.fround( expected[ 0 ] ) || got[ 1 ] !== Math.fround( expected[ 1 ] ) || got[ 2 ] !== Math.fround( expected[ 2 ] ) ) {

			assert.fail( `${label} 頂点 ${vi}（区間 ${s}、部位 ${part}）の色 ${got} が期待 ${expected}（状態 ${stateOf( s )}）と違う` );

		}

	}

}

test( '頂点数：102·D + 12·floor(D/2)（偶数・奇数の分割数、56 年分の約 6100）', () => {

	for ( const divisions of [ D, D_ODD ] ) {

		const { geometry } = makeGeometry( divisions );
		assert.equal( geometry.getAttribute( 'color' ).count, railVertexCount( divisions ) );
		assert.equal( geometry.getAttribute( 'position' ).count, railVertexCount( divisions ) );

	}

	assert.equal( railVertexCount( 1500 ), 162000 );
	assert.equal( railVertexCount( 6124 ), 661392 );

} );

test( '区間の開始位置の式：start(s) = 102·s + 12·floor(s/2)。偶数区間 102、奇数区間 114 頂点', () => {

	assert.equal( segmentStartIndex( 0 ), 0 );
	assert.equal( segmentStartIndex( 1 ), 102 );
	assert.equal( segmentStartIndex( 2 ), 216 );
	assert.equal( segmentStartIndex( 3 ), 318 );
	for ( let s = 0; s < 100; s ++ ) {

		assert.equal( segmentStartIndex( s + 1 ) - segmentStartIndex( s ), s % 2 === 0 ? 102 : 114, `区間 ${s}` );

	}

} );

test( '頂点 → 区間と部位：同梱ファイルの元の色（枕木・中央の管 = 黄、レール = 白）と、位置の連続性に一致する', () => {

	// 区間の長さが本番に近い分割数（全長 約 890 / 3000 ≒ 0.3）。区間の中でレールがほぼまっすぐになる
	const DD = 3000;
	const { geometry } = makeGeometry( DD );
	const map = buildRailColorMap( geometry, DD );
	const pos = geometry.getAttribute( 'position' );

	const counts = Array.from( { length: DD }, () => [ 0, 0, 0, 0 ] );
	for ( let vi = 0; vi < map.vertexCount; vi ++ ) {

		const s = map.segmentOf( vi );
		const part = map.partOf( vi );
		counts[ s ][ part ] ++;
		assert.ok( vi >= map.segmentStart[ s ] && vi < map.segmentStart[ s + 1 ], `頂点 ${vi} が区間 ${s} の範囲外` );

		// 元の色：レール 2 本は白 (1,1,1)、枕木と中央の管は黄 (1,1,0)
		const [ , , b ] = colorAt( geometry, vi );
		const isRail = part === PART.RAIL_RIGHT || part === PART.RAIL_LEFT;
		assert.equal( b, isRail ? 1 : 0, `頂点 ${vi}（区間 ${s}、部位 ${part}）の元の色` );

	}

	for ( let s = 0; s < DD; s ++ ) {

		assert.deepEqual( counts[ s ], [ s % 2 === 1 ? 12 : 0, 30, 36, 36 ], `区間 ${s} の部位ごとの頂点数` );
		// 構造部（枕木 + 中央の管）が先、レールが後ろ
		assert.equal( map.structureEnd[ s ] - map.segmentStart[ s ], ( s % 2 === 1 ? 12 : 0 ) + 30 );

	}

	// 区間 s の頂点は、曲線上の弧長の割合 s/D 〜 (s+1)/D の点の近く（レールの断面は 0.3 以内）にある
	const curve = track.arcCurve;
	const p = { x: 0, y: 0, z: 0 };
	for ( let vi = 0; vi < map.vertexCount; vi += 37 ) {

		const s = map.segmentOf( vi );
		p.x = pos.getX( vi ); p.y = pos.getY( vi ); p.z = pos.getZ( vi );
		const a = curve.getPointAt( s / DD ).clone(), b = curve.getPointAt( ( s + 1 ) / DD ).clone(); // 戻り値は使い回しなので複製
		const near = Math.min(
			Math.hypot( p.x - a.x, p.y - a.y, p.z - a.z ),
			Math.hypot( p.x - b.x, p.y - b.y, p.z - b.z )
		);
		assert.ok( near < 0.3, `頂点 ${vi}（区間 ${s}）が区間の端点から ${near.toFixed( 3 )} 離れている` );

	}

	// 右レール（+0.2）と左レール（−0.2）の間隔。区間 2 の頂点の重心で比べる
	const centroid = ( part ) => {

		let x = 0, z = 0, n = 0;
		for ( let vi = map.segmentStart[ 2 ]; vi < map.segmentStart[ 3 ]; vi ++ ) {

			if ( map.partOf( vi ) !== part ) continue;
			x += pos.getX( vi ); z += pos.getZ( vi ); n ++;

		}

		return { x: x / n, z: z / n };

	};

	const r = centroid( PART.RAIL_RIGHT ), l = centroid( PART.RAIL_LEFT );
	assert.ok( Math.abs( Math.hypot( r.x - l.x, r.z - l.z ) - 0.4 ) < 0.02, '左右のレールの間隔は 0.4' );

} );

test( '頂点数が合わないジオメトリでは例外を投げる', () => {

	const { geometry } = makeGeometry( D );
	assert.throws( () => buildRailColorMap( geometry, D + 1 ), /頂点数/ );

} );

test( '走行済みの区間数：(s+1)/D <= 弧長の割合 の区間', () => {

	assert.equal( riddenSegmentCount( 0, D ), 0 );
	assert.equal( riddenSegmentCount( 0.5 / D, D ), 0 );
	assert.equal( riddenSegmentCount( 1 / D, D ), 1 );
	assert.equal( riddenSegmentCount( 0.5, D ), D / 2 );
	assert.equal( riddenSegmentCount( 1, D ), D ); // 最後まで走って止まったとき、全部が走行済み
	assert.equal( riddenSegmentCount( 1.2, D ), D );
	assert.equal( riddenSegmentCount( - 0.1, D ), 0 );
	assert.equal( riddenSegmentCount( 0.3, 10 ), 3 ); // 0.3 * 10 の丸め誤差（2.9999…）で 2 にならない

} );

test( '全体の塗り：linear の値（THREE.Color を通した値）で書き、hex/255 ではない', () => {

	const { geometry } = makeGeometry( D );
	const painter = createRailPainter( geometry, D );
	painter.paintAll( 0 );
	const map = painter.map;
	assertColors( geometry, map, () => RAIL_STATE.AHEAD, '初回' );

	// 白レールの linear 値は sRGB の hex/255 より小さい（0xe6 / 255 = 0.902 → linear 0.791）
	const vi = map.structureEnd[ 0 ];
	assert.ok( Math.abs( colorAt( geometry, vi )[ 0 ] - 0xe6 / 255 ) > 0.05 );

	// 全体の塗りのあとは転送範囲なし（= 全体を転送）
	const attr = painter.attribute;
	assert.equal( attr.updateRanges.length, 0 );
	assert.ok( attr.version > 0 );

} );

test( '初回の塗りに現在位置まで含める：paintAll( progress ) は走行済みまで一度で塗る', () => {

	const { geometry } = makeGeometry( D );
	const painter = createRailPainter( geometry, D );
	painter.paintAll( 0.25 );
	assertColors( geometry, painter.map, ( s ) => s < D / 4 ? RAIL_STATE.RIDDEN : RAIL_STATE.AHEAD );

	// 直後の update では、差分があっても転送範囲を足さない（全体の転送が控えている）
	const r = painter.update( 0.3 );
	assert.equal( r.segments, 2 );
	assert.equal( painter.attribute.updateRanges.length, 0 );
	assertColors( geometry, painter.map, ( s ) => s < 12 ? RAIL_STATE.RIDDEN : RAIL_STATE.AHEAD );

} );

test( 'update：進む・戻る・最初から。書き換えるのは差分の区間だけ（範囲と頂点数）', () => {

	const { geometry } = makeGeometry( D );
	const painter = createRailPainter( geometry, D );
	const attr = painter.attribute;
	const map = painter.map;
	painter.paintAll( 0 );
	painter.update( 0 ); // 最初のフレーム（全体の転送）
	attr.clearUpdateRanges(); // レンダラが転送後に行うのと同じ

	// 区間が変わらないあいだは何もしない
	const v0 = attr.version;
	assert.deepEqual( painter.update( 0.5 / D ), { segments: 0, vertices: 0 } );
	assert.equal( attr.version, v0 );
	assert.equal( attr.updateRanges.length, 0 );

	// 進む：区間 0..4 → 区間 [0, 5) だけを塗る
	const before = Float32Array.from( attr.array );
	let r = painter.update( 5.2 / D );
	assert.deepEqual( r, { segments: 5, vertices: segmentStartIndex( 5 ) } );
	assert.deepEqual( attr.updateRanges, [ { start: 0, count: segmentStartIndex( 5 ) * 3 } ] );
	assert.ok( attr.version > v0 );
	assertColors( geometry, map, ( s ) => s < 5 ? RAIL_STATE.RIDDEN : RAIL_STATE.AHEAD, '進む' );
	// 範囲の外は 1 つも変わっていない
	for ( let i = segmentStartIndex( 5 ) * 3; i < before.length; i ++ ) assert.equal( attr.array[ i ], before[ i ] );
	attr.clearUpdateRanges();

	// さらに 1 区間：区間 5 だけ（奇数区間なので 114 頂点）
	r = painter.update( 6 / D );
	assert.deepEqual( r, { segments: 1, vertices: 114 } );
	assert.deepEqual( attr.updateRanges, [ { start: segmentStartIndex( 5 ) * 3, count: 114 * 3 } ] );
	attr.clearUpdateRanges();

	// 先へ飛ぶ（デバッグの setProgress）
	r = painter.update( 0.8 );
	assert.equal( r.segments, 32 - 6 );
	assert.deepEqual( attr.updateRanges, [ { start: segmentStartIndex( 6 ) * 3, count: ( segmentStartIndex( 32 ) - segmentStartIndex( 6 ) ) * 3 } ] );
	assertColors( geometry, map, ( s ) => s < 32 ? RAIL_STATE.RIDDEN : RAIL_STATE.AHEAD, '先へ飛ぶ' );
	attr.clearUpdateRanges();

	// 戻る：区間 [10, 32) を「これから」に戻す
	r = painter.update( 10.5 / D );
	assert.equal( r.segments, 22 );
	assert.deepEqual( attr.updateRanges, [ { start: segmentStartIndex( 10 ) * 3, count: ( segmentStartIndex( 32 ) - segmentStartIndex( 10 ) ) * 3 } ] );
	assertColors( geometry, map, ( s ) => s < 10 ? RAIL_STATE.RIDDEN : RAIL_STATE.AHEAD, '戻る' );
	attr.clearUpdateRanges();

	// 一周の終わり（progress = 1）：全区間が走行済み
	painter.update( 1 );
	assertColors( geometry, map, () => RAIL_STATE.RIDDEN, '終わり' );
	attr.clearUpdateRanges();

	// 最初から：全体を「これから」に塗り直し、範囲なし（全体を転送）
	attr.addUpdateRange( 0, 3 ); // 前のフレームの残りがあっても消える
	painter.paintAll( 0 );
	assert.equal( attr.updateRanges.length, 0 );
	assert.equal( painter.riddenCount, 0 );
	assertColors( geometry, map, () => RAIL_STATE.AHEAD, '最初から' );

} );

test( 'createRailColors：最初の描画より前に DynamicDrawUsage を設定し、ride の位置まで塗る。update と onReset', () => {

	const divisions = D;
	const curve = track;
	const geometry = new RollerCoasterGeometry( curve.arcCurve, divisions );
	const rail = { name: 'rail', geometry, userData: { divisions } };
	const ride = { progress: 0.5 };
	const scene = { getObjectByName: ( name ) => name === 'rail' ? rail : undefined };
	const module = createRailColors( { scene, curve, ride } );
	const attr = geometry.getAttribute( 'color' );
	const map = buildRailColorMap( geometry, divisions );
	// 進行位置（時間に比例）は、弧長の割合に直してから区間を決める。内側の周が短いので、弧長の割合は進行位置より小さい
	const count = ( progress ) => Math.floor( curve.arcFractionAt( progress ) * D );
	assert.ok( count( 0.5 ) < D / 2 );

	assert.equal( attr.usage, DynamicDrawUsage );
	assertColors( geometry, map, ( s ) => s < count( 0.5 ) ? RAIL_STATE.RIDDEN : RAIL_STATE.AHEAD, '生成時' );

	module.update( { progress: 0.5 } );
	attr.clearUpdateRanges();
	module.update( { progress: 0.75 } );
	assertColors( geometry, map, ( s ) => s < count( 0.75 ) ? RAIL_STATE.RIDDEN : RAIL_STATE.AHEAD, 'update' );
	assert.equal( rail.userData.colorStats.vertices, segmentStartIndex( count( 0.75 ) ) - segmentStartIndex( count( 0.5 ) ) );

	// 最後まで走ると全部
	module.update( { progress: 1 } );
	assertColors( geometry, map, () => RAIL_STATE.RIDDEN, '最後' );

	ride.progress = 0;
	module.onReset();
	assertColors( geometry, map, () => RAIL_STATE.AHEAD, 'onReset' );
	assert.equal( attr.updateRanges.length, 0 );

} );


// ---- 始点の助走（同梱の RollerCoasterGeometry / RollerCoasterShadowGeometry は、最初の区間の始端を東向きで作る）----

test( '助走の曲線：標本 i（i / (D+1)）は、i = 0 が始点の手前 1 区間分（接線の逆向き）、i >= 1 が元の f = (i-1)/D の点。接線は始点のものを延ばす', () => {

	const arc = track.arcCurve;
	const wrapped = runUpCurve( arc, D );
	const total = D + RUN_UP_SEGMENTS;
	const p0 = arc.getPointAt( 0 ).clone();
	const p1 = arc.getPointAt( 1 / D ).clone();
	const tangent0 = arc.getTangentAt( 0 ).clone();

	const back = wrapped.getPointAt( 0 ).clone();
	assert.ok( Math.abs( Math.hypot( back.x - p0.x, back.z - p0.z ) - arc.totalLength / D ) < 1e-9, '助走は 1 区間の長さ' );
	// 向き：始点の接線の逆
	assert.ok( ( p0.x - back.x ) * tangent0.x + ( p0.z - back.z ) * tangent0.z > 0.999999 * arc.totalLength / D );
	// 高さ：最初の区間の勾配のまま延ばす
	assert.ok( Math.abs( ( p0.y - back.y ) - ( p1.y - p0.y ) ) < 1e-9 );

	for ( let i = 1; i <= total; i ++ ) {

		const a = wrapped.getPointAt( i / total ).clone();
		const b = arc.getPointAt( ( i - 1 ) / D ).clone();
		assert.ok( a.distanceTo( b ) < 1e-9, `標本 ${i}` );
		const ta = wrapped.getTangentAt( i / total ).clone();
		assert.ok( ta.distanceTo( arc.getTangentAt( ( i - 1 ) / D ) ) < 1e-9, `接線 ${i}` );

	}

	assert.ok( wrapped.getTangentAt( 0 ).clone().distanceTo( tangent0 ) < 1e-9 );
	assert.equal( wrapped.totalLength, arc.totalLength );

} );

/** 水平の a → b の向き（ラジアン）と、2 つの向きの差の絶対値（0..π）。 */
const angleOf = ( a, b ) => Math.atan2( b.z - a.z, b.x - a.x );
const angleDiff = ( a, b ) => {

	let d = a - b;
	while ( d > Math.PI ) d -= 2 * Math.PI;
	while ( d < - Math.PI ) d += 2 * Math.PI;
	return Math.abs( d );

};

/** RollerCoasterGeometry のある区間（頂点番号 v0 から）の、右レールの始端・終端の断面の重心と、左レールのそれ。 */
function railCentroids( geometry, map, s ) {

	const pos = geometry.getAttribute( 'position' );
	const out = {};
	for ( const [ part, name ] of [ [ PART.RAIL_RIGHT, 'right' ], [ PART.RAIL_LEFT, 'left' ] ] ) {

		const start = { x: 0, z: 0 }, end = { x: 0, z: 0 };
		let n = 0;
		for ( let vi = map.segmentStart[ s ]; vi < map.segmentStart[ s + 1 ]; vi ++ ) {

			if ( map.partOf( vi ) !== part ) continue;
			const k = ( vi - map.segmentStart[ s ] ) % 6; // 面（三角形 2 つ = 6 頂点）の中の位置：0 v1、1 v2、3 v2 が終端、2 v4、4 v3、5 v4 が始端
			const target = k === 0 || k === 1 || k === 3 ? end : start;
			target.x += pos.getX( vi ); target.z += pos.getZ( vi );
			if ( k === 0 ) n ++;

		}

		out[ name ] = { start: { x: start.x / ( 3 * n ), z: start.z / ( 3 * n ) }, end: { x: end.x / ( 3 * n ), z: end.z / ( 3 * n ) } };

	}

	return out;

}

test( '始点のねじれ：始点の向きが東以外のデータでも、助走を足したレールは最初の区間で左右のレールの向きが変わらない（足さないと大きくねじれる）', () => {

	const DD = 3000;
	// 10年国債の金利と同じ始まり（1986-06-30。始点の向きは北から約 234°）
	const series = stretchedSeries( readJson( 'data/usdjpy.json' ), '1986-06-30', '2025-12-29' );
	const curve = new TrackCurve( buildDataset( series ).smoothed );
	const arc = curve.arcCurve;
	const heading = Math.atan2( arc.getTangentAt( 0 ).x, - arc.getTangentAt( 0 ).z ) * 180 / Math.PI;
	assert.ok( Math.abs( Math.cos( ( heading - 90 ) * Math.PI / 180 ) ) < 0.9, `始点の向きが東に近い: ${heading}` ); // 東（北から 90°）に近いとねじれない

	// 足さないとき：最初の区間（s = 0）の始端は東向きの断面のまま
	const legacy = new RollerCoasterGeometry( arc, DD );
	const legacyMap = buildRailColorMap( legacy, DD );
	const c0 = railCentroids( legacy, legacyMap, 0 );
	const legacyTwist = angleDiff( angleOf( c0.left.start, c0.right.start ), angleOf( c0.left.end, c0.right.end ) );
	assert.ok( legacyTwist > 0.3, `足さないときのねじれ ${legacyTwist}` );

	// 足したとき：描く最初の区間（s = 助走の次）
	const wrapped = new RollerCoasterGeometry( runUpCurve( arc, DD ), DD + RUN_UP_SEGMENTS );
	const map = buildRailColorMap( wrapped, DD, RUN_UP_SEGMENTS );
	for ( const s of [ RUN_UP_SEGMENTS, RUN_UP_SEGMENTS + 1, RUN_UP_SEGMENTS + 2 ] ) {

		const c = railCentroids( wrapped, map, s );
		const twist = angleDiff( angleOf( c.left.start, c.right.start ), angleOf( c.left.end, c.right.end ) );
		// 1 区間 0.3 で螺旋が曲がる分（半径 16 で約 0.019）だけは変わる
		assert.ok( twist < 0.03, `区間 ${s} のねじれ ${twist}` );
		// 左右のレールの間隔は 0.4
		assert.ok( Math.abs( Math.hypot( c.right.start.x - c.left.start.x, c.right.start.z - c.left.start.z ) - 0.4 ) < 0.01 );

	}

	// 助走の区間は描かない。描画範囲は 2 区間目（実際の最初の区間）の先頭から最後まで
	assert.equal( railDrawStart(), 102 );
	assert.equal( railVertexCount( DD + RUN_UP_SEGMENTS ) - railDrawStart(), railVertexCount( DD + RUN_UP_SEGMENTS ) - segmentStartIndex( RUN_UP_SEGMENTS ) );

	// 描く最初の区間の始端は、曲線の始点（レールの断面の中心）
	const p0 = arc.getPointAt( 0 ).clone();
	const mid = { x: ( c0.left.start.x + c0.right.start.x ) / 2, z: ( c0.left.start.z + c0.right.start.z ) / 2 };
	const first = railCentroids( wrapped, map, RUN_UP_SEGMENTS );
	const midFirst = { x: ( first.left.start.x + first.right.start.x ) / 2, z: ( first.left.start.z + first.right.start.z ) / 2 };
	assert.ok( Math.hypot( midFirst.x - p0.x, midFirst.z - p0.z ) < 0.01, '描く最初の区間の始端は始点' );
	assert.ok( Math.hypot( mid.x - p0.x, mid.z - p0.z ) < 0.01 );

} );

test( '床の足跡の始点のねじれ：助走を足すと、最初の四角形の始端と終端の辺が平行（足さないと東向きの辺になる）', () => {

	const DD = 1000;
	const series = stretchedSeries( readJson( 'data/usdjpy.json' ), '1986-06-30', '2025-12-29' );
	const arc = new TrackCurve( buildDataset( series ).smoothed ).arcCurve;
	// 1 区間 = 6 頂点：[ v1(終端 −), v2(終端 +), v4(始端 −), v2, v3(始端 +), v4 ]
	const edges = ( geometry, segment ) => {

		const pos = geometry.getAttribute( 'position' );
		const at = ( k ) => ( { x: pos.getX( 6 * segment + k ), z: pos.getZ( 6 * segment + k ) } );
		return { start: angleOf( at( 2 ), at( 4 ) ), end: angleOf( at( 0 ), at( 1 ) ) };

	};

	const legacy = edges( new RollerCoasterShadowGeometry( arc, DD ), 0 );
	assert.ok( angleDiff( legacy.start, legacy.end ) > 0.3, `足さないときのねじれ ${angleDiff( legacy.start, legacy.end )}` );

	const wrapped = new RollerCoasterShadowGeometry( runUpCurve( arc, DD ), DD + RUN_UP_SEGMENTS );
	assert.equal( wrapped.getAttribute( 'position' ).count, 6 * ( DD + RUN_UP_SEGMENTS ) );
	const e = edges( wrapped, RUN_UP_SEGMENTS );
	assert.ok( angleDiff( e.start, e.end ) < 0.05, `足したときのねじれ ${angleDiff( e.start, e.end )}` );

} );

test( '助走つきの色分け：実際の区間 k がジオメトリの区間 k + 1。境目は弧長の割合のまま、助走の区間も塗る、差分の転送範囲は k + 1 から', () => {

	const arc = track.arcCurve;
	const geometry = new RollerCoasterGeometry( runUpCurve( arc, D ), D + RUN_UP_SEGMENTS );
	const painter = createRailPainter( geometry, D, { runUp: RUN_UP_SEGMENTS } );
	const map = painter.map;
	const attr = painter.attribute;
	assert.equal( map.vertexCount, railVertexCount( D + RUN_UP_SEGMENTS ) );
	assert.equal( map.runUp, RUN_UP_SEGMENTS );

	// 助走を除く実際の区間 k の頂点は、弧長の割合 k/D 〜 (k+1)/D の点の近く（助走の区間は始点の手前）
	const pos = geometry.getAttribute( 'position' );
	for ( let k = 0; k < D; k += 7 ) {

		const vi = map.segmentStart[ k + RUN_UP_SEGMENTS ] + 60; // 区間の中ほどの頂点（レール）
		const near = [ k / D, ( k + 1 ) / D ].map( ( f ) => {

			const q = arc.getPointAt( f ).clone();
			return Math.hypot( pos.getX( vi ) - q.x, pos.getY( vi ) - q.y, pos.getZ( vi ) - q.z );

		} );
		// D = 40 は 1 区間が長い（約 22）ので、頂点は区間の端点のどちらかの近く（断面は 0.3 以内）
		assert.ok( Math.min( ...near ) < 0.5, `区間 ${k}: ${near}` );

	}

	painter.paintAll( 0.5 );
	const ridden = riddenSegmentCount( 0.5, D );
	assert.equal( painter.riddenCount, ridden );
	assertColors( geometry, map, ( s ) => s - RUN_UP_SEGMENTS < ridden ? RAIL_STATE.RIDDEN : RAIL_STATE.AHEAD, '助走つき' );

	// 差分：ridden 区間 → 次の区間数。転送範囲は、実際の区間 ridden（= ジオメトリの区間 ridden + 1）から
	attr.clearUpdateRanges();
	painter.update( 0.5 ); // 全体の転送が控えているフレーム：範囲は足さない
	assert.equal( attr.updateRanges.length, 0 );
	const next = riddenSegmentCount( 0.75, D );
	const result = painter.update( 0.75 );
	assert.equal( result.segments, next - ridden );
	assert.equal( attr.updateRanges.length, 1 );
	assert.equal( attr.updateRanges[ 0 ].start, map.segmentStart[ ridden + RUN_UP_SEGMENTS ] * 3 );
	assert.equal( attr.updateRanges[ 0 ].count, ( map.segmentStart[ next + RUN_UP_SEGMENTS ] - map.segmentStart[ ridden + RUN_UP_SEGMENTS ] ) * 3 );
	assertColors( geometry, map, ( s ) => s - RUN_UP_SEGMENTS < next ? RAIL_STATE.RIDDEN : RAIL_STATE.AHEAD, '助走つき update' );

	// 最初のごく小さな進行（走行済み 0 区間）では、実際の最初の区間（ジオメトリの区間 1）はこれから
	painter.paintAll( 0 );
	assert.equal( painter.riddenCount, 0 );
	assertColors( geometry, map, ( s ) => s - RUN_UP_SEGMENTS < 0 ? RAIL_STATE.RIDDEN : RAIL_STATE.AHEAD, '最初から' );

	// createRailColors は rail.userData.runUpSegments を読む
	const rail = { name: 'rail', geometry, userData: { divisions: D, runUpSegments: RUN_UP_SEGMENTS } };
	const ride = { progress: 0.5 };
	const scene = { getObjectByName: ( name ) => name === 'rail' ? rail : undefined };
	createRailColors( { scene, curve: track, ride } );
	const count = Math.floor( track.arcFractionAt( 0.5 ) * D );
	assertColors( geometry, map, ( s ) => s - RUN_UP_SEGMENTS < count ? RAIL_STATE.RIDDEN : RAIL_STATE.AHEAD, 'createRailColors' );

} );
