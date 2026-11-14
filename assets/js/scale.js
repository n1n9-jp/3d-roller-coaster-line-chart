// 3D の目盛り：等高線と値ラベル（一人称）、目盛りの壁と値ラベルの軸（俯瞰）、年代のスポークとラベル。
// 機能モジュール（createScale( ctx )）。
//
// 刻みはデータの書式（ctx.dataset.format）が決める：format.ticks( min, max, { compact } ) と format.compact( v )（ラベルの文字列）。
// 書式がまだ無いとき（日経平均）は FALLBACK_FORMAT（1 万円刻み、「2万円」）。書式が後から入れ替わったら作り直す。
//
// ■ 一人称
//   等高線：螺旋の中心線を外側（半径が増える向き）へ CONTOUR.offset ずらした線を、各刻みの高さ（curve.valueToY）に引く。
//           出すのは、いまの位置の近く（弧長で前方 CONTOUR.window.ahead、後方 behind）だけで、端に向かって薄くする。
//           隣の周・その先の周の線は出さない（螺旋では視界を何本も横切り、どれがいまのレールの脇の線か分からなくなる）。
//           1 本の LineSegments に、弧長の順（区間ごとに全刻み）に並べておき、毎フレーム、範囲の分の頂点の alpha だけを
//           書き換えて（addUpdateRange）、描画範囲（drawRange）を動かす。俯瞰へ向かうと薄くして消す。
//   値ラベル：いまの値を挟む上下の等高線に 1 つずつ。等高線を出している前方の範囲の、読みやすい場所（近すぎず遠すぎない）に
//           置き、線と一緒に薄くする。いつも手前に描く。
//   年代のラベル：前方の次の境目（北のスポーク）だけ、レールの上に出す。通過する手前で消す。
// ■ 俯瞰
//   目盛りの壁：西のスポーク上（CONTOUR.wall）。各刻みの高さの横線・両端の柱・薄い面（はしごの形）。1 本の LineSegments と 1 枚の面。
//   値ラベルの軸：壁の外側の端から、各横線の高さで左へ引き出し線を出し、ラベルを下から上へ並べる（labels.js の spreadAxis）。
//                 縦長の狭い画面（axisModeFor が 'above'）では、列を螺旋の左の外ではなく、壁の外側の端の上（外周より上の
//                 空いている左上）に置く（横幅を食わないので、螺旋を画面の幅いっぱいに映せる）。
//                 狭い画面では粗い刻み（ticks の compact）。壁とラベルの列の点は、俯瞰の構図に足す点として view に渡す
//                 （ctx.view.setOverviewExtras( 'scale', points )。口が無いときは何もしない）。俯瞰の構図のカメラ
//                 （view.overviewFit）で列の位置を見積もり、画面の大きさや視点が変わったときに、俯瞰に入る前から収まりを付けておく。
//   年代のスポーク：床の上の細い線（中心から北へ）。一人称でも出す（fog で霞む）。
//   年代のラベル：スポークと各周の交点の床に「1990年」。隣と重なるときは左右交互、それでも重なるときは 20 年ごと。
//
// 俯瞰の重なり（labels.js の掲示板）：優先順位は「値ラベルの軸 ＞ 年代のラベル ＞ 出来事の年ラベル（markers.js）」。
// モジュールの登録順（main.js）は scale.js → markers.js なので、ここで軸（HUD を避ける）→ 年代（HUD と軸を避ける）を置き、
// 'axis'・'axis-leader'・'decade' の層に登録する。markers.js はそれと HUD を避けて年ラベルを置く。
//
// ラベルの大きさは固定の倍率を持たず、実行時のカメラ（位置・画角）と表示サイズから「画面上の文字の高さ」で決める。
// 描画に依存しない計算は export して、tests/scale.test.js で確かめる。

import {
	Group, LineSegments, Line, LineBasicMaterial, BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial,
	Sprite, SpriteMaterial, CanvasTexture, SRGBColorSpace, Vector2, Vector3, MathUtils, Color, DoubleSide,
	DynamicDrawUsage, PerspectiveCamera
} from './three.core.js';
import { CONTOUR, PALETTE, HUD_COLORS, FONT_SANS } from './config.js';
import { overviewFov } from './view.js';
import { spreadAxis, collidesAny, insideViewport, rectsOverlap, placeByPriority, getLabelBoard } from './labels.js';

const DEG = Math.PI / 180;
const EPS = 1e-9;

// ---- 書式（ctx.dataset.format が無いときの代わり） ----

/** 日経平均向けの最小限の書式：1 万円刻み（compact は 2 万円）、ラベルは「2万円」。 */
export const FALLBACK_FORMAT = {
	strongEvery: 50000,
	ticks( min, max, { compact = false } = {} ) {

		const step = compact ? 20000 : 10000;
		const axisMin = Math.floor( min / step + EPS ) * step;
		const axisMax = Math.ceil( max / step - EPS ) * step;
		const values = [];
		for ( let v = axisMin; v <= axisMax + step * EPS; v += step ) values.push( v );
		return { step, axisMin, axisMax, values, labelEvery: values.length > 7 ? 2 : 1 };

	},
	compact( v ) {

		const man = Math.round( v ) / 10000;
		return `${Number.isInteger( man ) ? man : man.toFixed( 1 )}万円`;

	}
};

/** データの書式：ctx.dataset.format があればそれ、無ければ FALLBACK_FORMAT。 */
export function resolveFormat( dataset ) {

	const f = dataset?.format;
	return f && typeof f.ticks === 'function' && typeof f.compact === 'function' ? f : FALLBACK_FORMAT;

}

/**
 * 3D の目盛りの値：format.ticks の値のうち、データの範囲（min..max）の内側だけ（線は範囲の外に引かない）。
 * labeled：俯瞰の軸でラベルを付けるか（maxLabels 本を超えるときは、値が 2 × step の倍数の線だけ）。
 * zeroIndex：値 0 の線の番号（無ければ −1）。strong：強い線か（format.strongEvery の倍数。0 は除く。0 の線は zeroIndex で別に扱う）。
 */
export function contourTicks( format, range, { compact = false, maxLabels = CONTOUR.wall.maxLabels } = {} ) {

	const { step, values: all } = format.ticks( range.min, range.max, { compact } );
	const tol = Math.abs( step ) * 1e-6;
	const values = all.filter( ( v ) => v >= range.min - tol && v <= range.max + tol ).map( ( v ) => ( Math.abs( v ) < tol ? 0 : v ) );
	const every = values.length > maxLabels ? 2 : 1;
	const isMultiple = ( v, m ) => Math.abs( v / m - Math.round( v / m ) ) < 1e-6;
	const labeled = values.map( ( v ) => every === 1 || isMultiple( v, step * every ) );
	const strongEvery = format.strongEvery ?? null;
	const strong = values.map( ( v ) => !! strongEvery && v !== 0 && isMultiple( v, strongEvery ) );
	return { step, values, labeled, strong, zeroIndex: values.indexOf( 0 ) };

}

// ---- 螺旋の外側の線 ----

/** 上から見て時計回りの角度（北 = 0、ラジアン）と半径 → 水平位置 { x, z }（x：東、z：南）。 */
export function polarToXZ( angle, radius ) {

	return { x: radius * Math.sin( angle ), z: - radius * Math.cos( angle ) };

}

/** 進行位置 t の螺旋の点を、外側（半径が増える向き）へ offset ずらした水平位置。 */
export function spiralOffsetPoint( curve, t, offset ) {

	return polarToXZ( curve.angleAt( t ), curve.radiusAt( t ) + offset );

}

/**
 * 外側へ offset ずらした螺旋を、元の螺旋の弧長でほぼ segment ごとに標本化した点列。
 * 戻り値：{ xz: Float32Array（x, z の組）, count（点の数）, spacing（元の螺旋の弧長での間隔） }。
 */
export function offsetSpiralPath( curve, offset, segment ) {

	const n = Math.max( 2, Math.ceil( curve.totalLength / segment ) );
	const xz = new Float32Array( ( n + 1 ) * 2 );
	for ( let k = 0; k <= n; k ++ ) {

		const p = spiralOffsetPoint( curve, curve.progressAtArcFraction( k / n ), offset );
		xz[ 2 * k ] = p.x;
		xz[ 2 * k + 1 ] = p.z;

	}

	return { xz, count: n + 1, spacing: curve.totalLength / n };

}

// ---- 一人称の等高線の範囲 ----

/**
 * 一人称で等高線を出す範囲（元の螺旋の弧長）：いまの位置 s0 から前方 ahead、後方 behind。
 * 前方は、その位置の 1 周の長さ（2π × 等高線の半径）の lapFraction までに縮める。
 */
export function contourWindow( curve, progress, { ahead = CONTOUR.window.ahead, behind = CONTOUR.window.behind, lapFraction = CONTOUR.window.lapFraction, offset = CONTOUR.offset } = {} ) {

	const s0 = curve.arcFractionAt( progress ) * curve.totalLength;
	const lap = 2 * Math.PI * ( curve.radiusAt( progress ) + offset );
	return { s0, ahead: Math.min( ahead, lap * lapFraction ), behind };

}

/**
 * 刻みの向きの濃さ（0..1）：線の値 v と、いまの値 value の差が、刻み step で levelFull 以内なら 1。
 * そこから 1 刻みごとに levelPer ずつ薄くし、levelMin を下回らない。value が数でないときは 1。
 */
export function contourLevelWeight( v, value, step, { levelFull = CONTOUR.window.levelFull, levelPer = CONTOUR.window.levelPer, levelMin = CONTOUR.window.levelMin } = {} ) {

	if ( ! Number.isFinite( value ) || ! ( step > 0 ) ) return 1;
	const levels = Math.abs( v - value ) / step;
	return Math.max( levelMin, Math.min( 1, 1 - ( levels - levelFull ) * levelPer ) );

}

/** いまの位置からの弧長 d（前方が正）の等高線の濃さ（0..1）。前方は ahead × fadeFrom から ahead へ、後方は −behind から 0 へ。 */
export function contourFade( d, ahead, behind, fadeFrom = CONTOUR.window.fadeFrom ) {

	if ( d < 0 ) return behind > 0 ? MathUtils.smoothstep( d, - behind, 0 ) : 0;
	return 1 - MathUtils.smoothstep( d, ahead * fadeFrom, ahead );

}

// ---- 目盛りの壁 ----

/**
 * 目盛りの壁の形（ワールド座標）。angleDeg のスポーク上、半径 innerRadius..outerRadius。
 * ys：横線の高さ（下から順）。戻り値の lines は横線（kind：'labeled' | 'line' | 'zero'）、posts は両端の柱、
 * fill は面の 4 隅（内下・外下・外上・内上）。
 */
export function wallGeometry( { angleDeg, innerRadius, outerRadius, ys, labeled = [], zeroIndex = - 1 } ) {

	const a = angleDeg * DEG;
	const inner = polarToXZ( a, innerRadius );
	const outer = polarToXZ( a, outerRadius );
	const lines = ys.map( ( y, i ) => ( {
		a: { x: inner.x, y, z: inner.z },
		b: { x: outer.x, y, z: outer.z },
		kind: i === zeroIndex ? 'zero' : ( labeled[ i ] ? 'labeled' : 'line' )
	} ) );
	const bottom = ys.length ? Math.min( ...ys ) : 0;
	const top = ys.length ? Math.max( ...ys ) : 0;
	const posts = [ inner, outer ].map( ( p ) => ( { a: { x: p.x, y: 0, z: p.z }, b: { x: p.x, y: top, z: p.z } } ) );
	const fill = [
		{ x: inner.x, y: bottom, z: inner.z }, { x: outer.x, y: bottom, z: outer.z },
		{ x: outer.x, y: top, z: outer.z }, { x: inner.x, y: top, z: inner.z }
	];
	return { inner, outer, lines, posts, fill, bottom, top };

}

// ---- 年代の境目 ----

/**
 * 年代のラベルを置く点：curve.decadeBoundaries()（各周で北を通る点）に、データの起点がちょうど年代の始まり
 * （1990 年 1 月の最初の週など、startSlackYears 以内）なら起点を足したもの。古い順。
 * 戻り値：{ year, progress, x, z, radius }。
 */
export function decadeMarks( curve, { startSlackYears = 0.05 } = {} ) {

	const marks = curve.decadeBoundaries().map( ( b ) => ( { ...b } ) );
	const P = curve.yearsPerTurn;
	const startDecade = Math.floor( curve.startYear / P ) * P;
	if ( curve.startYear - startDecade <= startSlackYears && ! marks.some( ( m ) => m.year === startDecade ) ) {

		marks.unshift( { year: startDecade, progress: 0 } );

	}

	return marks.map( ( m ) => {

		const { x, z } = curve.getXZAt( m.progress );
		return { year: m.year, progress: m.progress, x, z, radius: Math.hypot( x, z ) };

	} );

}

/** 年代のラベルの文字列：1990 → 「1990年」。 */
export function decadeLabel( year ) {

	return `${year}年`;

}

/**
 * 俯瞰の年代のラベルの並べ方（画面の px）。items：古い順の { year, x, y, w, h }（x, y は交点の画面上の位置）。
 * 1. 交点に中心を合わせる（center）。隣どうしが gapPx 以内に近づくなら、
 * 2. 左右交互（alternate。年代の番号が偶数（1980・2000・2020）は左、奇数は右。スポークから sideGapPx 離す）。それでも近いなら、
 * 3. 最新の年代から 20 年ごと（thin）に間引き、残したものどうしで左右交互にする（最新は左）。
 * 戻り値：{ mode, rects（items と同じ順。間引いたものは null）, alternates（ほかの位置の候補。HUD などを避けるときに使う） }。
 */
export function layoutDecadeRects( items, { gapPx = CONTOUR.decade.gapPx, sideGapPx = CONTOUR.decade.sideGapPx } = {} ) {

	const centered = items.map( ( it ) => ( { x: it.x, y: it.y, w: it.w, h: it.h } ) );
	const sideOf = ( it ) => ( Math.round( it.year / 10 ) % 2 === 0 ? - 1 : 1 );
	const sided = ( it, side ) => ( { x: it.x + side * ( it.w / 2 + sideGapPx ), y: it.y, w: it.w, h: it.h } );
	const crowded = ( rects ) => {

		const list = rects.filter( Boolean );
		for ( let i = 0; i < list.length; i ++ ) for ( let j = i + 1; j < list.length; j ++ ) if ( rectsOverlap( list[ i ], list[ j ], gapPx ) ) return true;
		return false;

	};

	if ( ! crowded( centered ) ) return { mode: 'center', rects: centered, alternates: items.map( ( it ) => [ sided( it, sideOf( it ) ), sided( it, - sideOf( it ) ) ] ) };

	const alternate = items.map( ( it ) => sided( it, sideOf( it ) ) );
	const alternates = items.map( ( it ) => [ sided( it, - sideOf( it ) ) ] );
	if ( ! crowded( alternate ) ) return { mode: 'alternate', rects: alternate, alternates };

	// 残したもの（20 年ごと）どうしで左右交互にする
	const latest = items.length ? items[ items.length - 1 ].year : 0;
	const thin = items.map( ( it ) => {

		const k = Math.round( ( latest - it.year ) / 10 );
		return k % 2 === 0 ? sided( it, ( k / 2 ) % 2 === 0 ? - 1 : 1 ) : null;

	} );
	return { mode: 'thin', rects: thin, alternates: items.map( () => [] ) };

}

// ---- 俯瞰の値ラベルの軸 ----

/**
 * 値ラベルの列（画面の px）。anchors：壁の外側の端の、各横線の画面上の位置（下から順）。widths：各ラベルの幅。
 * 列はアンカーのいちばん左から leaderPx 左を右端にして、右寄せで並べる（画面の左端からはみ出すときは内側へ寄せる）。
 * 縦は、望ましい位置（アンカーの高さ）から spreadAxis で pillPx + gapPx 以上の間隔に広げ、HUD（hard）を避けて
 * shiftPx 刻みで上下にずらす（最初に重ならなくなったずらし。どれも重なるときは重なりの最も少ないもの）。
 * 戻り値：{ rects（anchors と同じ順）, spread（各ラベルの y）, edge（列の右端の x）, shift, collisions, desiredLeft（寄せる前の左端） }。
 */
export function layoutAxisColumn( anchors, widths, {
	pillPx, leaderPx, gapPx = CONTOUR.axis.gapPx, viewport, hard = [], insetPx = CONTOUR.axis.insetPx,
	margin = CONTOUR.axis.margin, shiftPx = CONTOUR.axis.shiftPx, shiftSteps = CONTOUR.axis.shiftSteps
} ) {

	const n = anchors.length;
	if ( n === 0 ) return { rects: [], spread: [], edge: 0, shift: 0, collisions: 0, desiredLeft: 0 };
	const maxW = Math.max( ...widths );
	const minAnchorX = Math.min( ...anchors.map( ( a ) => a.x ) );
	const desiredEdge = minAnchorX - leaderPx;
	const desiredLeft = desiredEdge - maxW;
	const edge = Math.max( desiredEdge, insetPx + maxW );

	// 上から（y の小さい順 = 値の大きい順）に並べて広げる
	const ys = anchors.map( ( a ) => a.y ).reverse();
	const bounds = { min: insetPx + pillPx / 2, max: viewport.height - insetPx - pillPx / 2 };
	const base = spreadAxis( ys, pillPx + gapPx, bounds ).reverse();

	const shifts = [ 0 ];
	for ( let k = 1; k <= shiftSteps; k ++ ) shifts.push( - k * shiftPx, k * shiftPx );
	let best = null;
	for ( const shift of shifts ) {

		const spread = base.map( ( y ) => y + shift );
		const rects = spread.map( ( y, k ) => ( { x: edge - widths[ k ] / 2, y, w: widths[ k ], h: pillPx } ) );
		let collisions = 0;
		for ( const r of rects ) if ( ! insideViewport( r, viewport, insetPx ) || collidesAny( r, hard, margin ) ) collisions ++;
		if ( ! best || collisions < best.collisions ) best = { rects, spread, edge, shift, collisions, desiredLeft };
		if ( collisions === 0 ) break;

	}

	return best;

}

/** 引き出し線の折れ線（画面の px）：アンカー → 左へ短い横線 → ラベルの高さへ斜め → ラベルの右端の手前。 */
export function leaderPolyline( anchor, y, edge, stubPx = CONTOUR.axis.stubPx ) {

	const end = edge + 3;
	return [ { x: anchor.x, y: anchor.y }, { x: anchor.x - stubPx, y: anchor.y }, { x: end + stubPx, y }, { x: end, y } ];

}

/** 引き出し線を、数 px おきの小さな矩形の列にする（重なりの判定用）。 */
export function leaderDots( anchors, spread, edge ) {

	const dots = [];
	anchors.forEach( ( a, k ) => {

		const line = leaderPolyline( a, spread[ k ], edge );
		for ( let j = 0; j < line.length - 1; j ++ ) {

			const p = line[ j ];
			const q = line[ j + 1 ];
			const n = Math.max( 1, Math.ceil( Math.hypot( q.x - p.x, q.y - p.y ) / 4 ) );
			for ( let t = 0; t <= n; t ++ ) dots.push( { x: p.x + ( q.x - p.x ) * t / n, y: p.y + ( q.y - p.y ) * t / n, w: 2, h: 2 } );

		}

	} );
	return dots;

}

/** 折れ線（画面の px）の列を、数 px おきの小さな矩形の列にする（重なりの判定用）。 */
export function polylineDots( lines ) {

	const dots = [];
	for ( const line of lines ) {

		for ( let j = 0; j < line.length - 1; j ++ ) {

			const p = line[ j ];
			const q = line[ j + 1 ];
			const n = Math.max( 1, Math.ceil( Math.hypot( q.x - p.x, q.y - p.y ) / 4 ) );
			for ( let t = 0; t <= n; t ++ ) dots.push( { x: p.x + ( q.x - p.x ) * t / n, y: p.y + ( q.y - p.y ) * t / n, w: 2, h: 2 } );

		}

	}

	return dots;

}

/**
 * 値ラベルの軸の置き方：縦長の狭い画面（幅 compactMaxWidth 以下で縦長）は 'above'（壁の外側の端の上に列）、
 * それ以外は 'side'（螺旋の左の外に列）。
 */
export function axisModeFor( width, height ) {

	return width <= CONTOUR.compactMaxWidth && height > width ? 'above' : 'side';

}

/**
 * 'above' の値ラベルの列（画面の px）。anchors：壁の外側の端の、各横線の画面上の位置（下から順）。widths：各ラベルの幅。
 * 列の左端は、アンカーのいちばん左から fanPx 右（画面の端から insetPx 以上）。ラベルは左寄せで、下から上へ pillPx + gapPx ごと。
 * 列の下端は、ceiling( x0, x1 )（列の幅の範囲で、それより下に螺旋がある画面の y。無ければ Infinity）と、
 * いちばん上のアンカーより liftPx 上の、高い方。HUD（hard）や画面の上端に掛かるときは、shiftPx 刻みで下へずらす
 * （最初に重ならなくなったずらし。どれも重なるときは重なりの最も少ないもの）。
 * 引き出し線：アンカー → ラベルの高さで、ラベルの左端の stubPx 手前（斜め）→ ラベルの左端（横）。
 * 戻り値：{ rects（anchors と同じ順）, spread（各ラベルの y）, left（列の左端）, right（列の右端）, shift, collisions, leaders }。
 */
export function layoutAxisAbove( anchors, widths, {
	pillPx, gapPx = CONTOUR.axis.gapPx, viewport, hard = [], ceiling = () => Infinity,
	fanPx = CONTOUR.axis.above.fanPx, stubPx = CONTOUR.axis.above.stubPx, liftPx = CONTOUR.axis.above.liftPx,
	insetPx = CONTOUR.axis.insetPx, margin = CONTOUR.axis.margin, shiftPx = CONTOUR.axis.shiftPx, shiftSteps = CONTOUR.axis.shiftSteps
} ) {

	const n = anchors.length;
	if ( n === 0 ) return { rects: [], spread: [], left: 0, right: 0, shift: 0, collisions: 0, leaders: [] };
	const maxW = Math.max( ...widths );
	const minAnchorX = Math.min( ...anchors.map( ( a ) => a.x ) );
	const topAnchorY = Math.min( ...anchors.map( ( a ) => a.y ) );
	const left = Math.max( insetPx + stubPx, minAnchorX + fanPx );
	const right = left + maxW;
	const bottom = Math.min( topAnchorY - liftPx, ceiling( left, right ) );
	const pitch = pillPx + gapPx;

	let best = null;
	for ( let k = 0; k <= shiftSteps; k ++ ) {

		const shift = k * shiftPx;
		const spread = anchors.map( ( a, i ) => bottom + shift - pillPx / 2 - i * pitch );
		const rects = spread.map( ( y, i ) => ( { x: left + widths[ i ] / 2, y, w: widths[ i ], h: pillPx } ) );
		let collisions = 0;
		for ( const r of rects ) if ( ! insideViewport( r, viewport, insetPx ) || collidesAny( r, hard, margin ) ) collisions ++;
		if ( ! best || collisions < best.collisions ) best = { rects, spread, left, right, shift, collisions };
		if ( collisions === 0 ) break;

	}

	best.leaders = anchors.map( ( a, i ) => {

		const y = best.spread[ i ];
		return [ { x: a.x, y: a.y }, { x: left - stubPx, y }, { x: left - 1, y } ];

	} );
	return best;

}

// ---- 大きさ ----

/**
 * 画面上の文字の高さが textPx になる、ラベルのワールドでの高さ。
 * distance：カメラからの奥行き、fovDeg：縦の画角（度）、viewportHeight：表示の高さ（CSS px）。
 * pillHeight と fontPx は、テクスチャの高さと、その中の文字の大きさ（CONTOUR.label）。
 */
export function labelWorldHeight( { distance, fovDeg, viewportHeight, textPx, pillHeight = CONTOUR.label.pillHeight, fontPx = CONTOUR.label.fontPx } ) {

	const worldPerPx = 2 * Math.max( distance, 1e-3 ) * Math.tan( fovDeg * DEG / 2 ) / viewportHeight;
	return textPx * ( pillHeight / fontPx ) * worldPerPx;

}

/** labelWorldHeight の逆：ワールドの高さ worldHeight のラベルの、画面上の文字の高さ（px）。 */
export function screenTextPx( { worldHeight, distance, fovDeg, viewportHeight, pillHeight = CONTOUR.label.pillHeight, fontPx = CONTOUR.label.fontPx } ) {

	const worldPerPx = 2 * Math.max( distance, 1e-3 ) * Math.tan( fovDeg * DEG / 2 ) / viewportHeight;
	return worldHeight / worldPerPx * ( fontPx / pillHeight );

}

/** 狭い画面か（俯瞰の壁を粗い刻みにする）。 */
export function isCompactViewport( width, height ) {

	return width <= CONTOUR.compactMaxWidth || height <= CONTOUR.compactMaxHeight;

}

// ---- テクスチャ（canvas） ----

const hex = ( c ) => `#${c.toString( 16 ).padStart( 6, '0' )}`;

/** ピル型の値ラベル（枠あり）。 */
function createPillTexture( text ) {

	const { pillHeight, radius, border, fontPx, padding } = CONTOUR.label;
	const canvas = document.createElement( 'canvas' );
	canvas.height = pillHeight;
	const g = canvas.getContext( '2d' );
	const font = `700 ${fontPx}px ${FONT_SANS}`;
	g.font = font;
	canvas.width = Math.ceil( g.measureText( text ).width + padding * 2 );
	g.font = font; // canvas の大きさを変えると状態が戻る

	const w = canvas.width;
	const r = Math.min( radius, pillHeight / 2, w / 2 );
	const inset = border / 2;
	g.beginPath();
	g.moveTo( r, inset );
	g.lineTo( w - r, inset );
	g.arc( w - r, pillHeight / 2, r - inset, - Math.PI / 2, Math.PI / 2 );
	g.lineTo( r, pillHeight - inset );
	g.arc( r, pillHeight / 2, r - inset, Math.PI / 2, Math.PI * 1.5 );
	g.closePath();
	g.fillStyle = HUD_COLORS.contourLabelBg;
	g.fill();
	g.lineWidth = border;
	g.strokeStyle = hex( PALETTE.contour );
	g.stroke();

	g.fillStyle = HUD_COLORS.contourLabel;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillText( text, w / 2, pillHeight / 2 + 2 );

	const texture = new CanvasTexture( canvas );
	texture.colorSpace = SRGBColorSpace;
	return texture;

}

/** 年代のラベル（角丸の長方形、枠なし）。 */
function createDecadeTexture( text ) {

	const { pillHeight, fontPx } = CONTOUR.label;
	const { radius, padding } = CONTOUR.decade;
	const canvas = document.createElement( 'canvas' );
	canvas.height = pillHeight;
	const g = canvas.getContext( '2d' );
	const font = `700 ${fontPx}px ${FONT_SANS}`;
	g.font = font;
	canvas.width = Math.ceil( g.measureText( text ).width + padding * 2 );
	g.font = font;
	g.beginPath();
	g.roundRect( 0, 0, canvas.width, pillHeight, radius );
	g.fillStyle = HUD_COLORS.decadeLabelBg;
	g.fill();
	g.fillStyle = HUD_COLORS.text1;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillText( text, canvas.width / 2, pillHeight / 2 + 2 );
	const texture = new CanvasTexture( canvas );
	texture.colorSpace = SRGBColorSpace;
	return texture;

}

// ---- モジュール ----

export function createScale( ctx ) {

	const { scene, camera, renderer, curve, dataset } = ctx;
	const board = getLabelBoard( ctx );
	const W = CONTOUR.wall;
	const A = CONTOUR.axis;
	const D = CONTOUR.decade;

	const group = new Group();
	group.name = 'scale';
	scene.add( group );

	const range = dataset?.rawRange ?? { min: curve.closeMin, max: curve.closeMax };
	const outerRadius = curve.radiusAtYear( curve.endYear );
	const wallInner = curve.innerRadius - W.innerInset;
	const wallOuter = outerRadius + W.outerInset;

	// 共有の点列：等高線（外へ offset）と、一人称の値ラベルの候補（さらに extraOffset 外）
	const contourPath = offsetSpiralPath( curve, CONTOUR.offset, CONTOUR.segment );
	const labelPath = offsetSpiralPath( curve, CONTOUR.offset + CONTOUR.label.extraOffset, CONTOUR.ride.sampleSpacing );

	// ---- テクスチャ（値ごと・年ごとに 1 枚。書式が変わったら作り直す） ----
	let format = null;
	const valueTextures = new Map(); // 値 → テクスチャ
	function valueTexture( v ) {

		if ( ! valueTextures.has( v ) ) valueTextures.set( v, createPillTexture( format.compact( v ) ) );
		return valueTextures.get( v );

	}

	function makeSprite( texture, parent ) {

		// いつも手前に描く（カーテン・レール・支柱・等高線に切られない。霧もかけない）
		const material = new SpriteMaterial( { map: texture, transparent: true, depthWrite: false, depthTest: false, fog: false, opacity: 0 } );
		const sprite = new Sprite( material );
		sprite.visible = false;
		sprite.renderOrder = 10;
		parent.add( sprite );
		return { sprite, material };

	}

	const lineColor = new Color();
	/** 頂点色（rgba）つきの LineSegments の属性を作る。segments：{ a, b, color, alpha } の配列。 */
	function writeSegments( geometry, segments ) {

		const pos = new Float32Array( segments.length * 6 );
		const col = new Float32Array( segments.length * 8 );
		segments.forEach( ( s, i ) => {

			pos.set( [ s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z ], i * 6 );
			lineColor.setHex( s.color );
			col.set( [ lineColor.r, lineColor.g, lineColor.b, s.alpha, lineColor.r, lineColor.g, lineColor.b, s.alpha ], i * 8 );

		} );
		geometry.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
		geometry.setAttribute( 'color', new Float32BufferAttribute( col, 4 ) );
		geometry.computeBoundingSphere();

	}

	// ---- 一人称の等高線（1 本の LineSegments。弧長の区間ごとに、全刻みの線分を並べる） ----
	const contourGeometry = new BufferGeometry();
	const contourMaterial = new LineBasicMaterial( { vertexColors: true, transparent: true, depthWrite: false, opacity: 1 } );
	const contours = new LineSegments( contourGeometry, contourMaterial );
	contours.name = 'contour-lines';
	group.add( contours );
	let contourBase = []; // 刻みごとの濃さ（強い線・0 の線は strongOpacity）
	// いま出している範囲（区間の番号 kA..kB）と、そのときの位置。stats は直近の書き換えの量と時間（検証用）
	const contourState = { s0: NaN, value: NaN, ahead: NaN, behind: NaN, kA: 0, kB: 0, stats: { vertices: 0, floats: 0, ms: 0, frames: 0 } };

	// ---- 一人称の値ラベル ----
	const rideGroup = new Group();
	rideGroup.name = 'contour-labels';
	group.add( rideGroup );
	let rideTicks = null;
	let rideYs = [];
	let rideEntries = [];

	// ---- 俯瞰の目盛りの壁（横線・柱をまとめた LineSegments と、薄い面） ----
	const wallGroup = new Group();
	wallGroup.name = 'scale-wall';
	wallGroup.visible = false;
	group.add( wallGroup );
	const wallGeometryBuf = new BufferGeometry();
	const wallMaterial = new LineBasicMaterial( { vertexColors: true, transparent: true, depthWrite: false, opacity: 0 } );
	const wallLines = new LineSegments( wallGeometryBuf, wallMaterial );
	wallLines.name = 'scale-wall-lines';
	wallLines.renderOrder = 4;
	const fillGeometry = new BufferGeometry();
	const fillMaterial = new MeshBasicMaterial( { color: PALETTE.contour, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide } );
	const wallFill = new Mesh( fillGeometry, fillMaterial );
	wallFill.name = 'scale-wall-fill';
	wallFill.renderOrder = 4;
	wallGroup.add( wallFill, wallLines );

	// ---- 値ラベルの軸（引き出し線と、値ごとのラベル） ----
	const axisGroup = new Group();
	axisGroup.name = 'contour-axis';
	group.add( axisGroup );
	const leaderGeometry = new BufferGeometry();
	const leaderMaterial = new LineBasicMaterial( { color: PALETTE.contour, transparent: true, opacity: 0, depthTest: false, depthWrite: false } );
	const leaders = new LineSegments( leaderGeometry, leaderMaterial );
	leaders.name = 'contour-axis-leaders';
	leaders.renderOrder = 9;
	leaders.frustumCulled = false;
	leaders.visible = false;
	axisGroup.add( leaders );
	let wallCompact = null;
	let wallTicks = null;
	let wallInfo = null;
	let axisEntries = []; // ラベルを付ける横線ごと（下から順）
	let axisShow = 0;

	// ---- 年代のスポークとラベル ----
	const marks = decadeMarks( curve );
	const spokeGeometry = new BufferGeometry();
	{

		const end = polarToXZ( 0, outerRadius + CONTOUR.spoke.extra );
		spokeGeometry.setAttribute( 'position', new Float32BufferAttribute( [ 0, CONTOUR.spoke.y, 0, end.x, CONTOUR.spoke.y, end.z ], 3 ) );

	}

	const spokeMaterial = new LineBasicMaterial( { color: PALETTE.decadeSpoke, transparent: true, opacity: CONTOUR.spoke.opacity, depthWrite: false } );
	const spoke = new Line( spokeGeometry, spokeMaterial );
	spoke.name = 'decade-spoke';
	spoke.renderOrder = 1;
	group.add( spoke );

	const decadeGroup = new Group();
	decadeGroup.name = 'decade-labels';
	group.add( decadeGroup );
	const decadeTextures = [];
	const decadeEntries = marks.map( ( m ) => {

		const texture = createDecadeTexture( decadeLabel( m.year ) );
		decadeTextures.push( texture );
		const aspect = texture.image.width / texture.image.height;
		const over = makeSprite( texture, decadeGroup );
		const ride = makeSprite( texture, decadeGroup );
		over.sprite.userData.year = m.year;
		ride.sprite.userData.year = m.year;
		return {
			mark: m, aspect,
			railY: curve.getPointAt( m.progress ).y,
			arc: curve.arcFractionAt( m.progress ) * curve.totalLength,
			over: { ...over, show: 0, wanted: false, rect: null },
			ride: { ...ride, show: 0, wanted: false, rect: null, near: 1 }
		};

	} );

	// ---- 視点：補間の値は view.blend（0＝一人称、1＝俯瞰） ----
	let currentView = ctx.view?.current ?? 'ride';
	const viewBlend = () => {

		const b = ctx.view?.blend;
		return Number.isFinite( b ) ? b : ( currentView === 'overview' ? 1 : 0 );

	};

	let blend = viewBlend();
	let lastNowMs = 0;
	let obstacles = [];
	let layout = null;
	let layoutKey = '';
	let decadeLayout = null;

	// ---- 作り直し（書式・画面の狭さが変わったとき） ----

	function buildRide() {

		for ( const e of rideEntries ) {

			rideGroup.remove( e.sprite );
			e.material.dispose();

		}

		rideTicks = contourTicks( format, range );
		rideYs = rideTicks.values.map( ( v ) => curve.valueToY( v ) );
		contourBase = rideTicks.values.map( ( v, i ) => ( rideTicks.strong[ i ] || i === rideTicks.zeroIndex ? CONTOUR.line.strongOpacity : CONTOUR.line.opacity ) );

		// 区間 k の刻み i の線分が、頂点 ( k × 刻みの数 + i ) × 2 と、その次。alpha は最初 0（範囲の分だけ毎フレーム書く）
		const { xz, count } = contourPath;
		const nT = rideYs.length;
		const segs = count - 1;
		const pos = new Float32Array( segs * nT * 6 );
		const col = new Float32Array( segs * nT * 8 );
		lineColor.setHex( PALETTE.contour );
		for ( let k = 0; k < segs; k ++ ) {

			for ( let i = 0; i < nT; i ++ ) {

				const y = rideYs[ i ];
				const o = ( k * nT + i ) * 6;
				pos[ o ] = xz[ 2 * k ]; pos[ o + 1 ] = y; pos[ o + 2 ] = xz[ 2 * k + 1 ];
				pos[ o + 3 ] = xz[ 2 * k + 2 ]; pos[ o + 4 ] = y; pos[ o + 5 ] = xz[ 2 * k + 3 ];
				const c = ( k * nT + i ) * 8;
				col[ c ] = col[ c + 4 ] = lineColor.r;
				col[ c + 1 ] = col[ c + 5 ] = lineColor.g;
				col[ c + 2 ] = col[ c + 6 ] = lineColor.b;

			}

		}

		contourGeometry.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
		const colorAttribute = new Float32BufferAttribute( col, 4 );
		colorAttribute.setUsage( DynamicDrawUsage );
		contourGeometry.setAttribute( 'color', colorAttribute );
		contourGeometry.computeBoundingSphere();
		contourGeometry.setDrawRange( 0, 0 );
		contourState.s0 = NaN;
		contourState.kA = contourState.kB = 0;

		rideEntries = rideTicks.values.map( ( v, level ) => {

			const texture = valueTexture( v );
			const { sprite, material } = makeSprite( texture, rideGroup );
			sprite.userData.value = v;
			return {
				level, value: v, y: rideYs[ level ] + CONTOUR.label.lift, sprite, material,
				aspect: texture.image.width / texture.image.height,
				anchor: - 1, pending: false, show: 0, wanted: false, near: 1, rect: null, textPx: 0
			};

		} );

	}

	function buildWall( compact ) {

		wallCompact = compact;
		wallTicks = contourTicks( format, range, { compact } );
		const ys = wallTicks.values.map( ( v ) => curve.valueToY( v ) );
		wallInfo = wallGeometry( { angleDeg: W.angleDeg, innerRadius: wallInner, outerRadius: wallOuter, ys, labeled: wallTicks.labeled, zeroIndex: wallTicks.zeroIndex } );
		wallInfo.ys = ys;
		const segments = wallInfo.lines.map( ( l ) => ( {
			a: l.a, b: l.b,
			color: l.kind === 'zero' ? W.zeroColor : PALETTE.contour,
			alpha: l.kind === 'zero' ? W.zeroOpacity : ( l.kind === 'labeled' ? W.labeledOpacity : W.lineOpacity )
		} ) );
		for ( const p of wallInfo.posts ) segments.push( { a: p.a, b: p.b, color: PALETTE.contour, alpha: W.postOpacity } );
		writeSegments( wallGeometryBuf, segments );

		const f = wallInfo.fill;
		fillGeometry.setAttribute( 'position', new Float32BufferAttribute( [
			f[ 0 ].x, f[ 0 ].y, f[ 0 ].z, f[ 1 ].x, f[ 1 ].y, f[ 1 ].z, f[ 2 ].x, f[ 2 ].y, f[ 2 ].z,
			f[ 0 ].x, f[ 0 ].y, f[ 0 ].z, f[ 2 ].x, f[ 2 ].y, f[ 2 ].z, f[ 3 ].x, f[ 3 ].y, f[ 3 ].z
		], 3 ) );
		fillGeometry.computeBoundingSphere();
		wallFill.visible = ys.length > 1;

		for ( const a of axisEntries ) {

			axisGroup.remove( a.sprite );
			a.material.dispose();

		}

		axisEntries = [];
		wallTicks.values.forEach( ( v, i ) => {

			if ( ! wallTicks.labeled[ i ] ) return;
			const texture = valueTexture( v );
			const { sprite, material } = makeSprite( texture, axisGroup );
			sprite.userData.value = v;
			axisEntries.push( { value: v, y: ys[ i ], sprite, material, aspect: texture.image.width / texture.image.height, rect: null } );

		} );
		leaderGeometry.setAttribute( 'position', new Float32BufferAttribute( new Float32Array( Math.max( 1, axisEntries.length ) * 3 * 2 * 3 ), 3 ) );
		layout = null;
		layoutKey = '';
		needSettle = true;

	}

	function rebuild( nextFormat ) {

		format = nextFormat;
		for ( const t of valueTextures.values() ) t.dispose();
		valueTextures.clear();
		buildRide();
		buildWall( wallCompact ?? false );
		needSettle = true;

	}

	// ---- 俯瞰の構図に足す点（壁と、値ラベルの列） ----
	let extrasKey = '';
	let extrasTries = 0;
	let needSettle = true;
	let lastExtras = null;
	/** 構図に足す点を view に渡す。前回とほぼ同じ（0.5 未満の差）なら渡さない。戻り値：渡したか。 */
	function setExtras( points ) {

		const prev = lastExtras;
		if ( prev && prev.length === points.length && prev.every( ( p, i ) => Math.hypot( p.x - points[ i ].x, p.y - points[ i ].y, p.z - points[ i ].z ) < 0.5 ) ) return false;
		lastExtras = points;
		ctx.view?.setOverviewExtras?.( 'scale', points );
		return true;

	}

	/** 壁の外側の端の点（床と最上段）。 */
	function wallPoints() {

		return [
			{ x: wallInfo.inner.x, y: 0, z: wallInfo.inner.z }, { x: wallInfo.outer.x, y: 0, z: wallInfo.outer.z },
			{ x: wallInfo.outer.x, y: wallInfo.top, z: wallInfo.outer.z }
		];

	}

	function initialExtras() {

		// 最初の見積もり：ラベルの列の幅を、外径の 2 割ほど（構図が決まった後に、画面上の実際の幅で直す）
		const far = polarToXZ( W.angleDeg * DEG, wallOuter + Math.max( 12, outerRadius * 0.2 ) );
		return [ ...wallPoints(), { x: far.x, y: wallInfo.bottom, z: far.z }, { x: far.x, y: wallInfo.top, z: far.z } ];

	}

	const reducedQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
		? window.matchMedia( '(prefers-reduced-motion: reduce)' )
		: null;
	let reducedMotion = reducedQuery?.matches ?? false;
	const onReducedChange = ( e ) => {

		reducedMotion = e.matches;

	};

	reducedQuery?.addEventListener?.( 'change', onReducedChange );

	function onViewChange( next ) {

		if ( next === currentView ) return;
		currentView = next;
		board.hud.invalidate();
		layoutKey = '';
		if ( next === 'overview' ) {

			needSettle = true;
			extrasTries = 0;

		}

	}

	// ---- 画面との変換 ----
	const size = new Vector2();
	const viewPosition = new Vector3();
	const cameraPosition = new Vector3();
	const worldPosition = new Vector3();
	const ndc = new Vector3();

	// 投影に使うカメラ。ふだんは camera。俯瞰に入る前に構図を見積もるときだけ、俯瞰の構図のカメラ（overviewCamera）
	let projCam = camera;

	function toScreen( x, y, z, width, height ) {

		ndc.set( x, y, z ).project( projCam );
		return { x: ( ndc.x + 1 ) / 2 * width, y: ( 1 - ndc.y ) / 2 * height, z: ndc.z };

	}

	function toWorld( sx, sy, ndcZ, width, height, target ) {

		return target.set( sx / width * 2 - 1, 1 - sy / height * 2, ndcZ ).unproject( projCam );

	}

	/** 画面の矩形 r（px）の中心に、奥行き ndcZ で Sprite を置き、画面上で r の大きさにする。 */
	function placeSpriteAt( sprite, r, ndcZ, width, height ) {

		toWorld( r.x, r.y, ndcZ, width, height, worldPosition );
		sprite.position.copy( worldPosition );
		viewPosition.copy( worldPosition ).applyMatrix4( camera.matrixWorldInverse );
		const pxPerWorld = height / ( 2 * Math.max( - viewPosition.z, 1e-3 ) * Math.tan( camera.fov * DEG / 2 ) );
		sprite.scale.set( r.w / pxPerWorld, r.h / pxPerWorld, 1 );

	}

	// ---- 俯瞰の配置 ----

	// 螺旋のレールの上端の点（'above' の列の下端を、螺旋より上にするため。弧長およそ 2 ごと）
	const silhouette = ( () => {

		const n = Math.max( 64, Math.ceil( curve.totalLength / 2 ) );
		const pts = new Float32Array( ( n + 1 ) * 3 );
		for ( let i = 0; i <= n; i ++ ) {

			const p = curve.getPointAt( curve.progressAtArcFraction( i / n ) );
			pts[ 3 * i ] = p.x;
			pts[ 3 * i + 1 ] = p.y;
			pts[ 3 * i + 2 ] = p.z;

		}

		return pts;

	} )();

	/** 画面の x0..x1 の範囲にある螺旋（レールの上端）のうち、いちばん上の画面の y から clearPx 上（範囲に無ければ Infinity）。 */
	function ceilingOver( x0, x1, width, height ) {

		let top = Infinity;
		for ( let i = 0; i < silhouette.length; i += 3 ) {

			const q = toScreen( silhouette[ i ], silhouette[ i + 1 ], silhouette[ i + 2 ], width, height );
			if ( q.x >= x0 - A.above.clearPx && q.x <= x1 + A.above.clearPx && q.y < top ) top = q.y;

		}

		return top - A.above.clearPx;

	}

	function computeOverview( width, height, compact, hud, axisMode = 'side' ) {

		const viewport = { width, height };
		const pillPx = ( compact ? CONTOUR.textPx.overviewCompact : CONTOUR.textPx.overview ) * CONTOUR.label.pillHeight / CONTOUR.label.fontPx;
		const outer = wallInfo.outer;

		// 値ラベルの軸（HUD を避ける）。'side' は螺旋の左の外、'above' は壁の外側の端の上
		const anchors = axisEntries.map( ( a ) => toScreen( outer.x, a.y, outer.z, width, height ) );
		const widths = axisEntries.map( ( a ) => pillPx * a.aspect );
		let column;
		let leaderLines;
		if ( axisMode === 'above' ) {

			column = layoutAxisAbove( anchors, widths, { pillPx, viewport, hard: hud, ceiling: ( x0, x1 ) => ceilingOver( x0, x1, width, height ) } );
			leaderLines = column.leaders;

		} else {

			const leaderPx = compact ? A.leaderPxCompact : A.leaderPx;
			column = layoutAxisColumn( anchors, widths, { pillPx, leaderPx, viewport, hard: hud } );
			leaderLines = anchors.map( ( a, k ) => leaderPolyline( a, column.spread[ k ], column.edge ) );

		}

		const dots = polylineDots( leaderLines );

		// 年代のラベル（HUD と軸を避ける。重なるときは古いものから隠す）
		const textPx = compact ? D.textPxCompact : D.textPx;
		const h = textPx * CONTOUR.label.pillHeight / CONTOUR.label.fontPx;
		const items = decadeEntries.map( ( e ) => {

			const s = toScreen( e.mark.x, D.y, e.mark.z, width, height );
			return { year: e.mark.year, x: s.x, y: s.y, z: s.z, w: h * e.aspect, h };

		} );
		const arranged = layoutDecadeRects( items );
		const placed = placeByPriority(
			items.map( ( it, i ) => ( {
				priority: it.year,
				rects: arranged.rects[ i ] ? [ arranged.rects[ i ], ...( arranged.mode === 'thin' ? [] : arranged.alternates[ i ] ) ] : []
			} ) ),
			{ obstacles: [ ...hud, ...column.rects, ...dots ], viewport, margin: CONTOUR.declutter.margin }
		);
		return { anchors, column, leaderLines, dots, compact, axisMode, pillPx, items, decade: { mode: arranged.mode, placed } };

	}

	function writeLeaders( lay, width, height ) {

		const positions = leaderGeometry.attributes.position.array;
		const p = new Vector3();
		let o = 0;
		const put = ( v ) => {

			positions[ o ++ ] = v.x;
			positions[ o ++ ] = v.y;
			positions[ o ++ ] = v.z;

		};

		lay.anchors.forEach( ( a, k ) => {

			const line = lay.leaderLines[ k ];
			for ( let j = 0; j < line.length - 1; j ++ ) {

				put( toWorld( line[ j ].x, line[ j ].y, a.z, width, height, p ) );
				put( toWorld( line[ j + 1 ].x, line[ j + 1 ].y, a.z, width, height, p ) );

			}

		} );
		leaderGeometry.setDrawRange( 0, o / 3 );
		leaderGeometry.attributes.position.needsUpdate = true;

	}

	function applyOverview( lay, width, height ) {

		writeLeaders( lay, width, height );
		axisEntries.forEach( ( a, k ) => {

			a.rect = lay.column.rects[ k ];
			placeSpriteAt( a.sprite, a.rect, lay.anchors[ k ].z, width, height );

		} );
		decadeEntries.forEach( ( e, i ) => {

			const r = lay.decade.placed[ i ];
			e.over.wanted = r.placed && lay.items[ i ].z < 1;
			e.over.rect = e.over.wanted ? r.rect : null;
			if ( e.over.rect ) placeSpriteAt( e.over.sprite, e.over.rect, lay.items[ i ].z, width, height );

		} );

		// 俯瞰の構図に、壁とラベルの列の点を足す（ラベルが画面の端で切れないように）。構図が変わるので、何度か直して収める
		if ( extrasTries < 4 && lay.anchors.length ) {

			extrasTries ++;
			setExtras( extrasFromLayout( lay, width, height ) );

		}

	}

	/** 配置 lay（投影は projCam）から、俯瞰の構図に足す点：壁と、ラベルの列の外側の角（余白 extraPadPx）。 */
	function extrasFromLayout( lay, width, height ) {

		const pad = A.extraPadPx;
		const top = lay.anchors[ lay.anchors.length - 1 ];
		const bottom = lay.anchors[ 0 ];
		const spread = lay.column.spread;
		const highest = spread[ spread.length - 1 ] - lay.pillPx / 2 - pad;
		const at = ( x, y, z ) => {

			const p = toWorld( x, y, z, width, height, new Vector3() );
			return { x: p.x, y: p.y, z: p.z };

		};

		if ( lay.axisMode === 'above' ) {

			return [ ...wallPoints(), at( lay.column.left - A.above.stubPx - pad, highest, top.z ), at( lay.column.right + pad, highest, top.z ) ];

		}

		const left = lay.column.desiredLeft - pad;
		return [
			...wallPoints(),
			at( left, Math.min( top.y, highest + pad ), top.z ),
			at( left, Math.max( bottom.y, spread[ 0 ] + lay.pillPx / 2 ), bottom.z )
		];

	}

	// 俯瞰の構図のカメラ（view.overviewFit から。俯瞰に入る前に、ラベルの列の位置を見積もるため）
	const overviewCam = new PerspectiveCamera( 50, 1, 0.1, 5000 );
	function overviewCamera( width, height ) {

		const fit = ctx.view?.overviewFit;
		if ( ! fit ) return null;
		overviewCam.fov = overviewFov( width / height );
		overviewCam.aspect = width / height;
		overviewCam.updateProjectionMatrix();
		overviewCam.position.set( fit.position.x, fit.position.y, fit.position.z );
		overviewCam.lookAt( fit.target.x, fit.target.y, fit.target.z );
		overviewCam.updateMatrixWorld();
		return overviewCam;

	}

	/**
	 * 俯瞰の構図に足す点を、俯瞰の構図のカメラで見積もって収める（画面の大きさ・軸の置き方・書式・視点が変わったとき）。
	 * 構図は足す点で変わるので、変わらなくなるまで（最大 maxRounds 回）繰り返す。
	 */
	function settleExtras( width, height, compact, axisMode, hud, maxRounds = 5 ) {

		if ( ! axisEntries.length || typeof ctx.view?.setOverviewExtras !== 'function' ) return;
		for ( let i = 0; i < maxRounds; i ++ ) {

			const cam = overviewCamera( width, height );
			if ( ! cam ) return;
			projCam = cam;
			let points;
			try {

				points = extrasFromLayout( computeOverview( width, height, compact, hud, axisMode ), width, height );

			} finally {

				projCam = camera;

			}

			if ( ! setExtras( points ) ) return;

		}

	}

	// ---- 一人称の等高線の範囲 ----

	let win = { s0: 0, ahead: CONTOUR.window.ahead, behind: CONTOUR.window.behind };

	/** いまの位置の近くの区間だけを描き、その頂点の alpha を、範囲の端に向かって薄くなるように書き換える。 */
	function updateContourWindow() {

		const CW = CONTOUR.window;
		const st = contourState;
		const value = Number.isFinite( win.value ) ? win.value : NaN;
		if ( Math.abs( win.s0 - st.s0 ) < CW.minStep && Math.abs( win.ahead - st.ahead ) < CW.minStep
			&& ( value === st.value || Math.abs( value - st.value ) < rideTicks.step * 0.01 ) ) return;
		const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
		const nT = rideYs.length;
		const segs = contourPath.count - 1;
		const sp = contourPath.spacing;
		const kA = MathUtils.clamp( Math.floor( ( win.s0 - win.behind ) / sp ), 0, segs );
		const kB = MathUtils.clamp( Math.ceil( ( win.s0 + win.ahead ) / sp ), kA, segs );
		const attribute = contourGeometry.attributes.color;
		const col = attribute.array;
		const base = contourBase.map( ( b, i ) => b * contourLevelWeight( rideTicks.values[ i ], value, rideTicks.step ) );
		for ( let k = kA; k < kB; k ++ ) {

			const fa = contourFade( k * sp - win.s0, win.ahead, win.behind );
			const fb = contourFade( ( k + 1 ) * sp - win.s0, win.ahead, win.behind );
			for ( let i = 0; i < nT; i ++ ) {

				const c = ( k * nT + i ) * 8;
				col[ c + 3 ] = base[ i ] * fa;
				col[ c + 7 ] = base[ i ] * fb;

			}

		}

		attribute.clearUpdateRanges();
		if ( kB > kA ) attribute.addUpdateRange( kA * nT * 8, ( kB - kA ) * nT * 8 );
		attribute.needsUpdate = true;
		contourGeometry.setDrawRange( kA * nT * 2, ( kB - kA ) * nT * 2 );
		st.s0 = win.s0;
		st.value = value;
		st.ahead = win.ahead;
		st.behind = win.behind;
		st.kA = kA;
		st.kB = kB;
		st.stats.vertices = ( kB - kA ) * nT * 2;
		st.stats.floats = ( kB - kA ) * nT * 8;
		st.stats.ms = ( typeof performance !== 'undefined' ? performance.now() : 0 ) - t0;
		st.stats.frames ++;

	}

	/** 一人称の値ラベルの候補 k（labelPath の点）が、等高線を出している前方の範囲の中か。 */
	function inLabelReach( k ) {

		const d = k * labelPath.spacing - win.s0;
		return d >= 0 && d <= win.ahead * CONTOUR.window.labelReach;

	}

	// ---- 一人称の値ラベル ----

	/** 一人称で、値ラベル e を候補 k（labelPath の点）に置いたときの画面上の矩形と評価。置けないときは null。 */
	function evaluateRideSample( e, k, width, height, placed ) {

		const R = CONTOUR.ride;
		if ( ! inLabelReach( k ) ) return null;
		const xz = labelPath.xz;
		worldPosition.set( xz[ 2 * k ], e.y, xz[ 2 * k + 1 ] );
		const d = worldPosition.distanceTo( cameraPosition );
		if ( d < R.minDistance || d > R.maxDistance ) return null;
		viewPosition.copy( worldPosition ).applyMatrix4( camera.matrixWorldInverse );
		const depth = - viewPosition.z;
		if ( depth <= 0.1 ) return null;
		const textPx = MathUtils.clamp( CONTOUR.textPx.ride * CONTOUR.rideDistance / depth, R.minTextPx, R.maxTextPx );
		const pxPerWorld = height / ( 2 * depth * Math.tan( camera.fov * DEG / 2 ) );
		const h = textPx * CONTOUR.label.pillHeight / CONTOUR.label.fontPx;
		const rect = { x: width / 2 + viewPosition.x * pxPerWorld, y: height / 2 - viewPosition.y * pxPerWorld, w: h * e.aspect, h };
		if ( ! insideViewport( rect, { width, height }, R.insetPx ) ) return null;
		if ( collidesAny( rect, obstacles, 4 ) || collidesAny( rect, placed, 4 ) ) return null;
		const score = - Math.abs( depth - R.idealDepth ) - Math.abs( rect.x - width / 2 ) / width * R.centerWeight;
		return { rect, score };

	}

	/** いまの値を挟む上下の等高線の番号（範囲の外なら近い 1 本）。 */
	function bracketLevels( value ) {

		const levels = new Set();
		const values = rideTicks.values;
		let below = - 1;
		for ( let i = 0; i < values.length; i ++ ) if ( values[ i ] <= value ) below = i;
		if ( below >= 0 ) levels.add( below );
		if ( below + 1 < values.length ) levels.add( below + 1 );
		return levels;

	}

	/**
	 * 一人称：いまの値を挟む上下の等高線に、値ラベルを 1 つずつ置く。置いた場所は、読めなくなる（近すぎる・遠すぎる・
	 * 画面の外・HUD に重なる）まで動かさない。読めなくなったらいったん消し、消えきってから前方の読みやすい場所へ置き直す。
	 * 戻り値：置いたラベルの画面上の矩形。
	 */
	function chooseRideAnchors( state, width, height ) {

		const value = state.point?.close;
		const wanted = Number.isFinite( value ) ? bracketLevels( value ) : new Set();
		// 候補は、等高線を出している前方の範囲（隣の周には置かない。線の無いところに値ラベルだけ浮かないように）
		const k0 = Math.max( 0, Math.ceil( win.s0 / labelPath.spacing ) );
		const k1 = Math.min( labelPath.count - 1, Math.floor( ( win.s0 + win.ahead * CONTOUR.window.labelReach ) / labelPath.spacing ) );
		const placed = [];
		for ( const e of rideEntries ) {

			if ( ! wanted.has( e.level ) ) {

				e.pending = e.anchor >= 0;
				if ( e.show === 0 ) e.anchor = - 1;
				continue;

			}

			if ( e.anchor >= 0 ) {

				const current = evaluateRideSample( e, e.anchor, width, height, placed );
				if ( current && ! e.pending ) {

					placed.push( current.rect );
					continue;

				}

				e.pending = true;
				if ( e.show > 0 ) continue;

			}

			// 前方のいまの周の上から選ぶ
			let best = null;
			let bestIndex = - 1;
			const search = ( from, to, step ) => {

				for ( let k = from; k <= to; k += step ) {

					const c = evaluateRideSample( e, k, width, height, placed );
					if ( c && ( ! best || c.score > best.score ) ) {

						best = c;
						bestIndex = k;

					}

				}

			};

			search( k0, k1, 1 );

			e.anchor = bestIndex;
			e.pending = false;
			if ( best ) placed.push( best.rect );

		}

		return placed;

	}

	/** 一人称の値ラベルの大きさと位置。 */
	function placeRideLabels( width, height ) {

		const R = CONTOUR.ride;
		const tanHalf = Math.tan( camera.fov * DEG / 2 );
		for ( const e of rideEntries ) {

			if ( e.anchor < 0 ) {

				e.rect = null;
				continue;

			}

			worldPosition.set( labelPath.xz[ 2 * e.anchor ], e.y, labelPath.xz[ 2 * e.anchor + 1 ] );
			e.sprite.position.copy( worldPosition );
			viewPosition.copy( worldPosition ).applyMatrix4( camera.matrixWorldInverse );
			const depth = Math.max( - viewPosition.z, 0.1 );
			const textPx = MathUtils.clamp( CONTOUR.textPx.ride * CONTOUR.rideDistance / depth, R.minTextPx, R.maxTextPx );
			const h = labelWorldHeight( { distance: depth, fovDeg: camera.fov, viewportHeight: height, textPx } );
			e.sprite.scale.set( h * e.aspect, h, 1 );
			const d = worldPosition.distanceTo( cameraPosition );
			// 近すぎるときと、等高線が薄くなる範囲の端では、線と一緒に薄くする
			e.near = MathUtils.smoothstep( d, R.minDistance * 0.6, R.minDistance )
				* contourFade( e.anchor * labelPath.spacing - win.s0, win.ahead, win.behind );
			const pxPerWorld = height / ( 2 * depth * tanHalf );
			e.rect = { x: width / 2 + viewPosition.x * pxPerWorld, y: height / 2 - viewPosition.y * pxPerWorld, w: h * e.aspect * pxPerWorld, h: h * pxPerWorld };
			e.textPx = textPx;

		}

	}

	/** 一人称：前方の次の年代の境目のラベル（値ラベル・HUD と重なるときは出さない）。 */
	function placeRideDecade( state, width, height, placedValues ) {

		const RD = D.ride;
		const s0 = curve.arcFractionAt( state.progress ) * curve.totalLength;
		const next = decadeEntries.find( ( e ) => e.arc > s0 + 0.5 );
		const tanHalf = Math.tan( camera.fov * DEG / 2 );
		for ( const e of decadeEntries ) {

			const r = e.ride;
			r.wanted = false;
			if ( e !== next ) continue;
			const ahead = e.arc - s0;
			if ( ahead < RD.minDistance * 0.6 || ahead > RD.maxDistance ) continue;
			worldPosition.set( e.mark.x, e.railY + RD.lift, e.mark.z );
			viewPosition.copy( worldPosition ).applyMatrix4( camera.matrixWorldInverse );
			const depth = - viewPosition.z;
			if ( depth <= 0.5 ) continue;
			const textPx = MathUtils.clamp( CONTOUR.textPx.ride * CONTOUR.rideDistance / depth, RD.minTextPx, RD.maxTextPx );
			const h = labelWorldHeight( { distance: depth, fovDeg: camera.fov, viewportHeight: height, textPx } );
			r.sprite.position.copy( worldPosition );
			r.sprite.scale.set( h * e.aspect, h, 1 );
			const pxPerWorld = height / ( 2 * depth * tanHalf );
			r.rect = { x: width / 2 + viewPosition.x * pxPerWorld, y: height / 2 - viewPosition.y * pxPerWorld, w: h * e.aspect * pxPerWorld, h: h * pxPerWorld };
			r.near = MathUtils.smoothstep( ahead, RD.minDistance * 0.6, RD.minDistance ) * ( 1 - MathUtils.smoothstep( ahead, RD.maxDistance - 15, RD.maxDistance ) );
			if ( ! insideViewport( r.rect, { width, height }, CONTOUR.ride.insetPx ) ) continue;
			if ( collidesAny( r.rect, obstacles, 4 ) || collidesAny( r.rect, placedValues, 4 ) ) continue;
			r.wanted = true;

		}

	}

	// ---- 毎フレーム ----

	function update( state ) {

		const nowMs = state.nowMs;
		const dt = Math.min( Math.max( nowMs - lastNowMs, 0 ), 500 );
		lastNowMs = nowMs;

		const nextFormat = resolveFormat( ctx.dataset );
		if ( nextFormat !== format ) rebuild( nextFormat );

		if ( state.view !== currentView ) onViewChange( state.view );
		blend = viewBlend();

		renderer.getSize( size );
		const width = size.x;
		const height = size.y;
		if ( ! ( width > 0 && height > 0 ) ) return;

		const compact = isCompactViewport( width, height );
		if ( compact !== wallCompact ) buildWall( compact );

		const axisMode = axisModeFor( width, height );
		const sizeKey = `${width}x${height}`;
		if ( sizeKey !== extrasKey ) {

			extrasKey = sizeKey;
			extrasTries = 0;
			needSettle = true;

		}

		const overviewing = currentView === 'overview';
		camera.updateMatrixWorld();
		cameraPosition.setFromMatrixPosition( camera.matrixWorld );
		// HUD のパネル（キャプションを含む）。読み直しは 400ms ごと（labels.js の createHudReader。年ラベルと共有）
		obstacles = board.hud.read( nowMs, sizeKey );

		// 俯瞰の構図に足す点を、俯瞰に入る前（画面の大きさ・書式が変わったとき、俯瞰へ切り替えた直後）に収めておく
		if ( needSettle ) {

			needSettle = false;
			settleExtras( width, height, compact, axisMode, obstacles );

		}

		// 一人称の等高線：いまの位置の近くだけ。俯瞰へ向かうと薄くする
		const rideK = 1 - MathUtils.smoothstep( blend, CONTOUR.rideFade.hideFrom, CONTOUR.rideFade.hideTo );
		contourMaterial.opacity = rideK;
		contours.visible = rideK > 0.01;
		win = contourWindow( curve, Number.isFinite( state.progress ) ? state.progress : 0 );
		win.value = state.point?.close;
		if ( contours.visible ) updateContourWindow();

		// 一人称の値ラベルと年代のラベル
		for ( const e of rideEntries ) e.wanted = false;
		if ( ! overviewing ) {

			const placed = chooseRideAnchors( state, width, height );
			placeRideLabels( width, height );
			for ( const e of rideEntries ) e.wanted = e.anchor >= 0 && e.pending !== true;
			placeRideDecade( state, width, height, placed );

		} else {

			for ( const e of rideEntries ) e.pending = e.anchor >= 0;
			for ( const e of decadeEntries ) e.ride.wanted = false;

		}

		// 俯瞰：軸 → 年代のラベル（補間が終わってから置く）。カメラ・画面・HUD が変わったときだけ計算し直す
		let axisWanted = false;
		if ( overviewing && blend >= 1 ) {

			const m = camera.matrixWorld.elements;
			const key = [ width, height, compact, ...Array.from( camera.projectionMatrix.elements, ( x ) => x.toFixed( 4 ) ), ...Array.from( m, ( x ) => x.toFixed( 3 ) ),
				...obstacles.map( ( r ) => `${r.x.toFixed( 0 )},${r.y.toFixed( 0 )},${r.w.toFixed( 0 )},${r.h.toFixed( 0 )}` ) ].join( '|' );
			if ( key !== layoutKey || ! layout ) {

				layoutKey = key;
				layout = computeOverview( width, height, compact, obstacles, axisMode );
				applyOverview( layout, width, height );
				decadeLayout = layout.decade;

			}

			axisWanted = axisEntries.length > 0;
			board.set( 'axis', layout.column.rects );
			board.set( 'axis-leader', layout.dots );
			board.set( 'decade', decadeEntries.filter( ( e ) => e.over.wanted ).map( ( e ) => e.over.rect ) );

		} else {

			for ( const e of decadeEntries ) e.over.wanted = false;
			board.set( 'axis', [] );
			board.set( 'axis-leader', [] );
			board.set( 'decade', [] );
			layoutKey = '';

		}

		// 壁：blend が fadeFrom を超えたところから
		const wallK = MathUtils.smoothstep( blend, W.fadeFrom, 1 );
		wallMaterial.opacity = wallK;
		fillMaterial.opacity = wallK * W.fillOpacity;
		wallGroup.visible = wallK > 0.01;

		// 表示のなめらかな切り替え（時定数 fadeMs）。reduced-motion では即座に
		const k = reducedMotion ? 1 : 1 - Math.exp( - dt / CONTOUR.fadeMs );
		const approach = ( value, goal ) => {

			const next = value + ( goal - value ) * k;
			return Math.abs( next - goal ) < 0.02 ? goal : next;

		};

		for ( const e of rideEntries ) {

			e.show = approach( e.show, e.wanted ? 1 : 0 );
			const opacity = e.show * e.near * ( 1 - blend );
			e.material.opacity = opacity;
			e.sprite.visible = opacity > 0.02;

		}

		for ( const e of decadeEntries ) {

			const r = e.ride;
			r.show = approach( r.show, r.wanted ? 1 : 0 );
			r.material.opacity = r.show * r.near * ( 1 - blend );
			r.sprite.visible = r.material.opacity > 0.02;
			// 俯瞰の年代のラベルは、置けなくなったらすぐに消す。出すときだけなめらかに
			const o = e.over;
			o.show = o.wanted ? approach( o.show, 1 ) : 0;
			o.material.opacity = o.show;
			o.sprite.visible = o.show > 0.02;

		}

		axisShow = approach( axisShow, axisWanted ? 1 : 0 );
		for ( const a of axisEntries ) {

			a.material.opacity = axisShow;
			a.sprite.visible = axisShow > 0.02 && !! layout;

		}

		leaderMaterial.opacity = axisShow * A.leaderOpacity;
		leaders.visible = axisShow > 0.02 && !! layout;

	}

	// 最初の組み立て（書式・壁）と、俯瞰の構図に足す点の見積もり
	rebuild( resolveFormat( dataset ) );
	setExtras( initialExtras() );

	/** 検証用：値・配置・画面上の矩形。 */
	function debug() {

		return {
			values: rideTicks.values,
			ys: rideYs,
			wall: { compact: wallCompact, values: wallTicks.values, labeled: wallTicks.labeled, ys: wallInfo.ys, inner: wallInfo.inner, outer: wallInfo.outer },
			blend,
			ride: rideEntries.map( ( e ) => ( { value: e.value, anchor: e.anchor, visible: e.sprite.visible, opacity: e.material.opacity, textPx: e.textPx, rect: e.rect } ) ),
			axis: axisEntries.map( ( a ) => ( { value: a.value, visible: a.sprite.visible, rect: a.rect } ) ),
			decades: decadeEntries.map( ( e ) => ( {
				year: e.mark.year,
				over: { visible: e.over.sprite.visible, rect: e.over.rect },
				ride: { visible: e.ride.sprite.visible, rect: e.ride.rect }
			} ) ),
			decadeMode: decadeLayout?.mode ?? null,
			axisMode: layout?.axisMode ?? null,
			contour: { kA: contourState.kA, kB: contourState.kB, s0: contourState.s0, ahead: contourState.ahead, segments: contourState.kB - contourState.kA, drawCount: contourGeometry.drawRange.count, ...contourState.stats },
			extras: lastExtras,
			board: board.snapshot()
		};

	}

	group.userData.debug = debug;

	return {
		contours,
		wall: wallGroup,
		axis: axisGroup,
		debug,
		update,
		onViewChange,
		onReset() {},
		dispose() {

			scene.remove( group );
			reducedQuery?.removeEventListener?.( 'change', onReducedChange );
			for ( const e of [ ...rideEntries, ...axisEntries ] ) e.material.dispose();
			for ( const e of decadeEntries ) {

				e.over.material.dispose();
				e.ride.material.dispose();

			}

			for ( const g of [ contourGeometry, wallGeometryBuf, fillGeometry, leaderGeometry, spokeGeometry ] ) g.dispose();
			for ( const m of [ contourMaterial, wallMaterial, fillMaterial, leaderMaterial, spokeMaterial ] ) m.dispose();
			for ( const t of [ ...valueTextures.values(), ...decadeTextures ] ) t.dispose();
			board.set( 'axis', [] );
			board.set( 'axis-leader', [] );
			board.set( 'decade', [] );

		}
	};

}
