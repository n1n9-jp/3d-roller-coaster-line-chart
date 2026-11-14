// 3D の目盛り（scale.js）のうち、レンダラに依存しない計算：刻みの値と線の高さ、螺旋の外側の線、目盛りの壁、
// 年代のラベルの位置と並べ方、値ラベルの軸、ラベルの大きさ。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	FALLBACK_FORMAT, resolveFormat, contourTicks, polarToXZ, spiralOffsetPoint, offsetSpiralPath, wallGeometry,
	decadeMarks, decadeLabel, layoutDecadeRects, layoutAxisColumn, leaderDots, labelWorldHeight, screenTextPx, isCompactViewport,
	contourWindow, contourFade, contourLevelWeight, axisModeFor, layoutAxisAbove, polylineDots
} from '../assets/js/scale.js';
import { createFormatter } from '../assets/js/format.js';
import { DATASETS } from '../assets/js/config.js';
import { overlappingPairs, collidesAny } from '../assets/js/labels.js';
import { TrackCurve } from '../assets/js/track.js';
import { buildDataset } from '../assets/js/data.js';
import { CONTOUR, SPIRAL, Y_MIN, Y_MAX } from '../assets/js/config.js';
import { readJson, stretchedSeries, rescaleSeries } from './helpers.js';

const usd = readJson( 'data/usdjpy.json' );
const jgb = readJson( 'data/jgb10.json' );
const nikkei = usd; // 1990 年始まりの系列の土台（同梱のドル円の値を引き伸ばし、値を日経平均らしい範囲へ写して使う）

function curveFor( raw ) {

	const ds = buildDataset( raw );
	return { ds, curve: new TrackCurve( ds.smoothed ) };

}

const usdC = curveFor( usd ); // 1971〜2026（約 5.6 周）
const jgbC = curveFor( jgb ); // 1986 年 7 月〜2026（約 4 周）
// 1990 年 1 月〜2026（約 3.7 周）。値は 7,000〜72,000（元の値のままだと 75〜358 で、1 万円刻みの目盛りが 1 本も入らない）
const nk37 = curveFor( rescaleSeries( stretchedSeries( nikkei, '1990-01-01', '2026-11-09' ), 7000, 72000 ) );

// 書式の仮のもの（データの担当が ctx.dataset.format に入れるものと同じ形）
const fmt = ( step, compactStep, unit ) => ( {
	ticks( min, max, { compact = false } = {} ) {

		const s = compact ? compactStep : step;
		const axisMin = Math.floor( min / s ) * s;
		const axisMax = Math.ceil( max / s ) * s;
		const values = [];
		for ( let k = Math.round( axisMin / s ); k <= Math.round( axisMax / s ); k ++ ) values.push( k * s );
		return { step: s, axisMin, axisMax, values, labelEvery: 1 };

	},
	compact: ( v ) => `${v}${unit}`
} );
const USD_FORMAT = fmt( 50, 100, '円' );
const JGB_FORMAT = fmt( 1, 2, '%' );

test( '書式：ctx.dataset.format があればそれを使い、無ければ日経平均向けの代わり（1 万円刻み、「2万円」）', () => {

	assert.equal( resolveFormat( {} ), FALLBACK_FORMAT );
	assert.equal( resolveFormat( null ), FALLBACK_FORMAT );
	assert.equal( resolveFormat( { format: USD_FORMAT } ), USD_FORMAT );
	assert.equal( resolveFormat( { format: { ticks: 1 } } ), FALLBACK_FORMAT );
	assert.equal( FALLBACK_FORMAT.compact( 20000 ), '2万円' );
	assert.equal( FALLBACK_FORMAT.compact( 15000 ), '1.5万円' );
	const t = FALLBACK_FORMAT.ticks( 7055, 72366 );
	assert.equal( t.step, 10000 );
	assert.equal( t.axisMin, 0 );
	assert.equal( t.axisMax, 80000 );
	assert.equal( FALLBACK_FORMAT.ticks( 7055, 72366, { compact: true } ).step, 20000 );

} );

test( '刻みの値：データの範囲の内側だけ。ドル円 100〜350 の 6 本、金利 0〜8 の 9 本（ラベルは 2% ごと）、日経平均 1〜7 万', () => {

	const u = contourTicks( USD_FORMAT, { min: 75.72, max: 358.44 } );
	assert.deepEqual( u.values, [ 100, 150, 200, 250, 300, 350 ] );
	assert.ok( u.labeled.every( Boolean ) );
	assert.equal( u.zeroIndex, - 1 );
	assert.ok( ! u.strong.some( Boolean ) );

	const j = contourTicks( JGB_FORMAT, { min: - 0.297, max: 8.105 } );
	assert.deepEqual( j.values, [ 0, 1, 2, 3, 4, 5, 6, 7, 8 ] );
	assert.deepEqual( j.values.filter( ( v, i ) => j.labeled[ i ] ), [ 0, 2, 4, 6, 8 ] );
	assert.equal( j.zeroIndex, 0 );

	const n = contourTicks( FALLBACK_FORMAT, { min: 7055, max: 72366 } );
	assert.deepEqual( n.values, [ 10000, 20000, 30000, 40000, 50000, 60000, 70000 ] );
	assert.ok( n.labeled.every( Boolean ) );
	assert.deepEqual( n.values.filter( ( v, i ) => n.strong[ i ] ), [ 50000 ] );

	// 狭い画面の粗い刻み
	assert.deepEqual( contourTicks( USD_FORMAT, { min: 75.72, max: 358.44 }, { compact: true } ).values, [ 100, 200, 300 ] );
	assert.deepEqual( contourTicks( JGB_FORMAT, { min: - 0.297, max: 8.105 }, { compact: true } ).values, [ 0, 2, 4, 6, 8 ] );
	assert.deepEqual( contourTicks( FALLBACK_FORMAT, { min: 7055, max: 72366 }, { compact: true } ).values, [ 20000, 40000, 60000 ] );

	// 範囲の端にちょうど乗る値は含める
	assert.deepEqual( contourTicks( FALLBACK_FORMAT, { min: 10000, max: 50000 } ).values, [ 10000, 20000, 30000, 40000, 50000 ] );

} );

test( '線の高さ：目盛りの値 → valueToY。値の順に高く、Y_MIN..Y_MAX の内側。週の値のレールは、その値を挟む 2 本の線の間', () => {

	for ( const [ { ds, curve }, format ] of [ [ usdC, USD_FORMAT ], [ jgbC, JGB_FORMAT ], [ nk37, FALLBACK_FORMAT ] ] ) {

		const { values } = contourTicks( format, ds.rawRange );
		// 目盛りが範囲の中に何本もあること（0 本だと、下のループが何も確かめない）：ドル円 6 本、金利 9 本、日経平均 7 本
		assert.ok( values.length >= 5, `目盛りが ${values.length} 本` );
		const ys = values.map( ( v ) => curve.valueToY( v ) );
		for ( let i = 1; i < ys.length; i ++ ) assert.ok( ys[ i ] > ys[ i - 1 ] );
		// 生データの範囲は移動平均の範囲より少し広いので、線は Y_MIN..Y_MAX を少しはみ出しうる（端の 1 刻みぶん以内）
		for ( const y of ys ) assert.ok( y > Y_MIN - ( Y_MAX - Y_MIN ) * 0.2 && y < Y_MAX + ( Y_MAX - Y_MIN ) * 0.2 );
		let checked = 0;
		for ( const p of ds.raw.filter( ( _, i ) => i % 97 === 0 ) ) {

			checked ++;
			const below = values.filter( ( v ) => v <= p.close ).pop();
			const above = values.find( ( v ) => v > p.close );
			const y = curve.valueToY( p.close );
			if ( below !== undefined ) assert.ok( curve.valueToY( below ) <= y );
			if ( above !== undefined ) assert.ok( curve.valueToY( above ) > y );

		}

		assert.ok( checked >= 15, `確かめた週が ${checked} 件` );

	}

	assert.deepEqual( contourTicks( FALLBACK_FORMAT, nk37.ds.rawRange ).values, [ 10000, 20000, 30000, 40000, 50000, 60000, 70000 ] );

} );

test( '螺旋の外側の線：外へずらした点は元の螺旋より外（半径が offset 大きい）で、同じ角度。隣の周には届かない', () => {

	const { curve } = usdC;
	for ( const t of [ 0, 0.01, 0.3, 0.77, 1 ] ) {

		const p = curve.getXZAt( t );
		const q = spiralOffsetPoint( curve, t, CONTOUR.offset );
		const rp = Math.hypot( p.x, p.z );
		const rq = Math.hypot( q.x, q.z );
		assert.ok( Math.abs( rq - rp - CONTOUR.offset ) < 1e-9, `t=${t}` );
		assert.ok( Math.abs( Math.atan2( p.x, - p.z ) - Math.atan2( q.x, - q.z ) ) < 1e-9 );
		// 次の周（外側）のレールまでは turnGap − offset 以上離れる（カーテン・アーチと重ならない）
		assert.ok( SPIRAL.turnGap - CONTOUR.offset - CONTOUR.label.extraOffset > 6 );

	}

	const path = offsetSpiralPath( curve, CONTOUR.offset, CONTOUR.segment );
	assert.ok( Math.abs( path.spacing - CONTOUR.segment ) < 0.1 );
	assert.equal( path.xz.length, path.count * 2 );
	// 点列の各点は、元の螺旋の対応する点より外
	for ( let k = 0; k < path.count; k += 97 ) {

		const t = curve.progressAtArcFraction( k / ( path.count - 1 ) );
		const p = curve.getXZAt( t );
		assert.ok( Math.hypot( path.xz[ 2 * k ], path.xz[ 2 * k + 1 ] ) > Math.hypot( p.x, p.z ) + CONTOUR.offset - 1e-3 );

	}

	// 隣り合う点の間隔はほぼ一定（外側の周でも粗くならない）
	const d = ( k ) => Math.hypot( path.xz[ 2 * k + 2 ] - path.xz[ 2 * k ], path.xz[ 2 * k + 3 ] - path.xz[ 2 * k + 1 ] );
	assert.ok( d( 0 ) < 2.5 && d( path.count - 2 ) < 2.5 );

} );

test( '目盛りの壁：西（270°）のスポーク上、内側の半径 − 3 から外径 + 4。横線の両端・柱・面', () => {

	const { curve, ds } = usdC;
	const outer = curve.radiusAtYear( curve.endYear );
	assert.ok( outer > 86 && outer < 91 ); // ドル円 5.6 周で外径 約 89
	const ticks = contourTicks( USD_FORMAT, ds.rawRange );
	const ys = ticks.values.map( ( v ) => curve.valueToY( v ) );
	const w = wallGeometry( {
		angleDeg: CONTOUR.wall.angleDeg, innerRadius: curve.innerRadius - CONTOUR.wall.innerInset, outerRadius: outer + CONTOUR.wall.outerInset,
		ys, labeled: ticks.labeled, zeroIndex: ticks.zeroIndex
	} );
	assert.equal( w.lines.length, 6 );
	for ( const [ i, l ] of w.lines.entries() ) {

		assert.ok( Math.abs( l.a.x - - 13 ) < 1e-9 && Math.abs( l.a.z ) < 1e-9, '内側の端は x = −13、z = 0' );
		assert.ok( Math.abs( l.b.x - - ( outer + 4 ) ) < 1e-9 && Math.abs( l.b.z ) < 1e-9, '外側の端は x = −(外径 + 4)' );
		assert.equal( l.a.y, ys[ i ] );
		assert.equal( l.b.y, ys[ i ] );
		assert.equal( l.kind, 'labeled' );

	}

	assert.equal( w.top, ys[ 5 ] );
	assert.equal( w.bottom, ys[ 0 ] );
	assert.deepEqual( w.posts.map( ( p ) => [ p.a.y, p.b.y ] ), [ [ 0, ys[ 5 ] ], [ 0, ys[ 5 ] ] ] );
	assert.equal( w.fill.length, 4 );

	// 金利：0 の線は別の種類（色を変える）。ラベルの無い線もある
	const j = contourTicks( JGB_FORMAT, jgbC.ds.rawRange );
	const wj = wallGeometry( { angleDeg: 270, innerRadius: 13, outerRadius: 70, ys: j.values.map( ( v ) => jgbC.curve.valueToY( v ) ), labeled: j.labeled, zeroIndex: j.zeroIndex } );
	assert.deepEqual( wj.lines.map( ( l ) => l.kind ), [ 'zero', 'line', 'labeled', 'line', 'labeled', 'line', 'labeled', 'line', 'labeled' ] );

	// 角度：北 0、時計回り（東 90 は +x、西 270 は −x）
	const east = polarToXZ( Math.PI / 2, 10 );
	assert.ok( Math.abs( east.x - 10 ) < 1e-9 && Math.abs( east.z ) < 1e-9 );
	const north = polarToXZ( 0, 10 );
	assert.ok( Math.abs( north.z + 10 ) < 1e-9 );

} );

test( '年代のラベルの位置：北のスポーク上（x = 0、z = −半径）。3.7 周・4 周・5.6 周', () => {

	const cases = [
		[ nk37.curve, [ 1990, 2000, 2010, 2020 ] ], // 1990 年 1 月始まり：起点も年代の始まり
		[ jgbC.curve, [ 1990, 2000, 2010, 2020 ] ], // 1986 年 7 月始まり（約 4 周）
		[ usdC.curve, [ 1980, 1990, 2000, 2010, 2020 ] ] // 1971 年始まり（約 5.6 周）
	];
	for ( const [ curve, years ] of cases ) {

		const marks = decadeMarks( curve );
		assert.deepEqual( marks.map( ( m ) => m.year ), years );
		for ( const m of marks ) {

			assert.ok( Math.abs( m.x ) < 0.05, `${m.year} は北（x ≒ 0）: ${m.x}` );
			assert.ok( m.z < 0 );
			assert.ok( Math.abs( m.radius - curve.radiusAtYear( m.year ) ) < 0.05 );

		}

		// 隣の年代は 1 周（turnGap）ずつ外
		for ( let i = 1; i < marks.length; i ++ ) {

			if ( marks[ i - 1 ].progress === 0 && curve.startYear > marks[ i - 1 ].year ) continue;
			assert.ok( Math.abs( marks[ i ].radius - marks[ i - 1 ].radius - curve.turnGap ) < 0.1 );

		}

	}

	assert.equal( decadeLabel( 1990 ), '1990年' );
	assert.equal( decadeMarks( nk37.curve )[ 0 ].progress, 0 );

} );

test( '年代のラベルの並べ方：広ければ中央、詰まれば左右交互、さらに詰まれば 20 年ごと（最新を残す）', () => {

	const items = ( gap ) => [ 1980, 1990, 2000, 2010, 2020 ].map( ( year, i ) => ( { year, x: 200, y: 300 - i * gap, w: 50, h: 24 } ) );

	const wide = layoutDecadeRects( items( 40 ) );
	assert.equal( wide.mode, 'center' );
	assert.ok( wide.rects.every( ( r ) => r.x === 200 ) );
	assert.deepEqual( overlappingPairs( wide.rects ), [] );

	// モバイル（間隔 17px ＜ 高さ 24 + 3）：左右交互。1980 は左、1990 は右
	const mid = layoutDecadeRects( items( 17 ) );
	assert.equal( mid.mode, 'alternate' );
	assert.ok( mid.rects[ 0 ].x < 200 && mid.rects[ 1 ].x > 200 && mid.rects[ 4 ].x < 200 );
	assert.ok( mid.rects.every( ( r ) => Math.abs( Math.abs( r.x - 200 ) - ( 25 + CONTOUR.decade.sideGapPx ) ) < 1e-9 ) );
	assert.deepEqual( overlappingPairs( mid.rects ), [] );

	// さらに狭い（間隔 8px）：20 年ごと。2020（最新）は残す
	const narrow = layoutDecadeRects( items( 8 ) );
	assert.equal( narrow.mode, 'thin' );
	assert.deepEqual( narrow.rects.map( ( r ) => !! r ), [ true, false, true, false, true ] );
	assert.deepEqual( overlappingPairs( narrow.rects.filter( Boolean ) ), [] );

} );

test( '値ラベルの軸：アンカーの左に右寄せで、下から上へ順に並ぶ。詰まっていれば広げ、HUD を避けて上下にずらす', () => {

	const viewport = { width: 1440, height: 900 };
	const pillPx = 15 * 96 / 56;
	// 6 本の横線が 17px 間隔（ラベルの高さ 25.7 より狭い）
	const anchors = [ 0, 1, 2, 3, 4, 5 ].map( ( i ) => ( { x: 300 - i * 0.5, y: 500 - i * 17 } ) );
	const widths = anchors.map( () => 60 );
	const col = layoutAxisColumn( anchors, widths, { pillPx, leaderPx: 30, viewport } );
	assert.equal( col.collisions, 0 );
	assert.equal( col.shift, 0 );
	assert.ok( Math.abs( col.edge - ( 297.5 - 30 ) ) < 1e-9 );
	for ( let i = 1; i < 6; i ++ ) assert.ok( col.spread[ i - 1 ] - col.spread[ i ] >= pillPx + CONTOUR.axis.gapPx - 1e-9, '下から上へ、間隔を空けて' );
	assert.deepEqual( overlappingPairs( col.rects ), [] );
	// 広げた列の中心は、もとの横線の中心のあたり
	const mean = ( a ) => a.reduce( ( s, v ) => s + v, 0 ) / a.length;
	assert.ok( Math.abs( mean( col.spread ) - mean( anchors.map( ( a ) => a.y ) ) ) < 1 );

	// HUD のパネルが列の位置にあるとき：上下にずらして避ける
	const hud = [ { x: 230, y: 470, w: 120, h: 60 } ];
	const moved = layoutAxisColumn( anchors, widths, { pillPx, leaderPx: 30, viewport, hard: hud } );
	assert.equal( moved.collisions, 0 );
	assert.notEqual( moved.shift, 0 );
	for ( const r of moved.rects ) assert.ok( ! collidesAny( r, hud, CONTOUR.axis.margin ) );

	// 画面の左端からはみ出すときは内側に寄せる（desiredLeft は寄せる前の値。構図に足す点に使う）
	const left = layoutAxisColumn( anchors.map( ( a ) => ( { x: 40, y: a.y } ) ), widths, { pillPx, leaderPx: 30, viewport } );
	assert.ok( left.rects.every( ( r ) => r.x - r.w / 2 >= CONTOUR.axis.insetPx - 1e-9 ) );
	assert.ok( left.desiredLeft < 0 );

	// 引き出し線の点は、アンカーから列の右端まで
	const dots = leaderDots( anchors, col.spread, col.edge );
	assert.ok( dots.length > 6 );
	assert.ok( dots.every( ( d ) => d.x <= 300 + 1e-9 && d.x >= col.edge ) );

} );

test( '狭い画面の判定と、ラベルの大きさ（画面上の文字の高さ ↔ ワールドの高さ）', () => {

	assert.equal( isCompactViewport( 390, 844 ), true );
	assert.equal( isCompactViewport( 844, 390 ), true );
	assert.equal( isCompactViewport( 1024, 768 ), false );
	assert.equal( isCompactViewport( 1440, 900 ), false );

	const h = labelWorldHeight( { distance: 200, fovDeg: 50, viewportHeight: 900, textPx: 15 } );
	assert.ok( Math.abs( screenTextPx( { worldHeight: h, distance: 200, fovDeg: 50, viewportHeight: 900 } ) - 15 ) < 1e-9 );
	// 距離が倍なら倍の大きさ
	assert.ok( Math.abs( labelWorldHeight( { distance: 400, fovDeg: 50, viewportHeight: 900, textPx: 15 } ) - 2 * h ) < 1e-9 );

} );

test( '一人称の等高線の範囲：前方 ahead（内側の周では 1 周の lapFraction まで）と後方 behind。端に向かって薄くなる', () => {

	const W = CONTOUR.window;
	for ( const { curve } of [ usdC, jgbC, nk37 ] ) {

		for ( const t of [ 0, 0.02, 0.3, 0.6, 0.99 ] ) {

			const win = contourWindow( curve, t );
			const lap = 2 * Math.PI * ( curve.radiusAt( t ) + CONTOUR.offset );
			assert.ok( win.ahead <= W.ahead + 1e-9 && win.ahead <= lap * W.lapFraction + 1e-9 );
			// 隣の周まで回り込まない（前方は 1 周の半分未満）
			assert.ok( win.ahead < lap / 2 );
			assert.ok( Math.abs( win.s0 - curve.arcFractionAt( t ) * curve.totalLength ) < 1e-9 );
			assert.equal( win.behind, W.behind );

		}

		// 外側の周では ahead いっぱい
		assert.equal( contourWindow( curve, 0.99 ).ahead, W.ahead );

	}

	const { ahead, behind } = { ahead: 60, behind: 6 };
	assert.equal( contourFade( 0, ahead, behind ), 1 );
	assert.equal( contourFade( ahead * W.fadeFrom, ahead, behind ), 1 );
	assert.equal( contourFade( ahead, ahead, behind ), 0 );
	assert.equal( contourFade( ahead + 5, ahead, behind ), 0 );
	assert.equal( contourFade( - behind, ahead, behind ), 0 );
	assert.ok( contourFade( - behind / 2, ahead, behind ) > 0 && contourFade( - behind / 2, ahead, behind ) < 1 );
	// 前方は、遠いほど薄い（単調）
	let prev = 1;
	for ( let d = 0; d <= ahead; d += 2 ) {

		const f = contourFade( d, ahead, behind );
		assert.ok( f <= prev + 1e-12 );
		prev = f;

	}

	// 前方の値ラベルを置く範囲（labelReach）では、線はまだ見える濃さ
	assert.ok( contourFade( ahead * W.labelReach, ahead, behind ) > 0.4 );

} );

test( '等高線の刻みの向きの濃さ：いまの値を挟む線と隣は 1、離れるほど薄く（下限 levelMin）', () => {

	const W = CONTOUR.window;
	assert.equal( contourLevelWeight( 150, 151.2, 50 ), 1 );
	assert.equal( contourLevelWeight( 200, 151.2, 50 ), 1 );
	assert.equal( contourLevelWeight( 100, 151.2, 50 ), 1 ); // 1.02 刻み
	assert.ok( contourLevelWeight( 250, 151.2, 50 ) < 1 );
	assert.ok( contourLevelWeight( 350, 151.2, 50 ) < contourLevelWeight( 250, 151.2, 50 ) );
	assert.equal( contourLevelWeight( 1000, 151.2, 50 ), W.levelMin );
	assert.equal( contourLevelWeight( 1000, NaN, 50 ), 1 ); // 値が無いとき
	assert.equal( contourLevelWeight( 0, 1, 0 ), 1 );

} );

test( '強い線：データの書式の strongEvery（ドル円 100 円、日経平均 5 万円）。金利は無し（0 の線は zeroIndex）', () => {

	const usdF = createFormatter( DATASETS.usdjpy );
	const usdT = contourTicks( usdF, { min: 75.6, max: 358.4 } );
	assert.deepEqual( usdT.values.filter( ( v, i ) => usdT.strong[ i ] ), [ 100, 200, 300 ] );
	const jgbF = createFormatter( DATASETS.jgb10 );
	const jgbT = contourTicks( jgbF, { min: - 0.293, max: 8.1 } );
	assert.ok( jgbT.strong.every( ( s ) => ! s ) );
	assert.equal( jgbT.values[ jgbT.zeroIndex ], 0 );
	const nikF = createFormatter( DATASETS.nikkei );
	const nikT = contourTicks( nikF, { min: 7054, max: 52000 } );
	assert.deepEqual( nikT.values.filter( ( v, i ) => nikT.strong[ i ] ), [ 50000 ] );

} );

test( '値ラベルの軸の置き方：縦長の狭い画面だけ above（壁の端の上）、ほかは side（螺旋の左の外）', () => {

	assert.equal( axisModeFor( 390, 844 ), 'above' );
	assert.equal( axisModeFor( 430, 760 ), 'above' );
	assert.equal( axisModeFor( 844, 390 ), 'side' );
	assert.equal( axisModeFor( 800, 900 ), 'side' );
	assert.equal( axisModeFor( 1024, 768 ), 'side' );
	assert.equal( axisModeFor( 1440, 900 ), 'side' );

} );

test( '値ラベルの軸（above）：壁の端の上に、螺旋より上から下から上へ並べる。引き出し線は交わらず、ラベルを通らない', () => {

	const viewport = { width: 390, height: 844 };
	const pillPx = 14 * 96 / 56;
	const A = CONTOUR.axis.above;
	// 壁の外側の端（画面の左端の近く）、5 本の横線が 8px 間隔
	const anchors = [ 0, 1, 2, 3, 4 ].map( ( i ) => ( { x: 16, y: 420 - i * 8 } ) );
	const widths = anchors.map( () => 50 );
	// 列の幅の範囲では、螺旋の上端が y = 330
	const col = layoutAxisAbove( anchors, widths, { pillPx, viewport, ceiling: () => 330 } );
	assert.equal( col.collisions, 0 );
	assert.equal( col.left, 16 + A.fanPx );
	assert.ok( Math.abs( col.rects[ 0 ].y + pillPx / 2 - 330 ) < 1e-9, '列の下端は螺旋の上' );
	for ( let i = 1; i < 5; i ++ ) assert.ok( col.spread[ i - 1 ] - col.spread[ i ] >= pillPx + CONTOUR.axis.gapPx - 1e-9, '下から上へ' );
	assert.ok( col.rects.every( ( r ) => Math.abs( r.x - r.w / 2 - col.left ) < 1e-9 ), '左寄せ' );
	assert.deepEqual( overlappingPairs( col.rects ), [] );
	// 螺旋が無ければ、壁の最上段より liftPx 上から
	const free = layoutAxisAbove( anchors, widths, { pillPx, viewport } );
	assert.ok( Math.abs( free.rects[ 0 ].y + pillPx / 2 - ( 388 - A.liftPx ) ) < 1e-9 );
	// 引き出し線：アンカーから、ラベルの左端まで。ラベルの左端より左だけを通る
	assert.equal( col.leaders.length, 5 );
	col.leaders.forEach( ( line, i ) => {

		assert.deepEqual( line[ 0 ], { x: anchors[ i ].x, y: anchors[ i ].y } );
		assert.ok( Math.abs( line[ line.length - 1 ].y - col.spread[ i ] ) < 1e-9 );
		assert.ok( line.every( ( p ) => p.x < col.left ) );

	} );
	// 上の HUD に掛かるときは下へずらす
	const hud = [ { x: 195, y: 200, w: 366, h: 200 } ];
	const moved = layoutAxisAbove( anchors, widths, { pillPx, viewport, hard: hud, ceiling: () => 330 } );
	assert.equal( moved.collisions, 0 );
	assert.ok( moved.shift > 0 );
	// 折れ線の点
	const dots = polylineDots( col.leaders );
	assert.ok( dots.length > 10 );
	assert.ok( dots.every( ( d ) => d.x <= col.left ) );

} );
