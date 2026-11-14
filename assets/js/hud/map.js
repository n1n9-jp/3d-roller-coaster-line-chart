// 螺旋の図（右下のパネル）：上から見たコースの小さな地図。機能モジュール（createMap( ctx )）。
// canvas は #mapCanvas、見出しと「いま：○年」は #hud-map の中（index.html）。
//
// 座標は 3D と同じ XZ（x が東、z が南）。画面は北が上、時計回り。螺旋の中心（原点）を canvas の中心に置く。
// 静的な部分（これからの螺旋、北のスポーク、起点）は、大きさ・devicePixelRatio が変わったときだけ描く（layer.js）。
// 毎フレームは、走行済みの線・年代のラベル・現在位置だけを描く。位置が動いていないときは描き直さない。
//
// 描画に依存しない計算（螺旋の標本、canvas への収め方、年代のラベルの位置と間引き、走行済みの範囲）は、
// 関数として export する（tests/map.test.js、tests/hud-scales.test.js）。

import { HUD_COLORS, FONT_SANS } from '../config.js';
import { createHudLayer } from './layer.js';

const COLORS = { spoke: '#52659a', ...HUD_COLORS }; // spoke は config.js の HUD_COLORS.spoke（--c-spoke）があればそちら

/** 螺旋を引く点の数（1 周あたり）。弧長で等間隔。 */
export const POINTS_PER_TURN = 96;
/** canvas の縁と螺旋の外端の間（現在位置の点と白い輪のはみ出し）。 */
export const EDGE_INSET = 7;
/** スポークが螺旋のいちばん北の点より外へ延びる長さ（px）。 */
export const SPOKE_OVERSHOOT = 4;
/** 年代のラベルの上下の隙間（px。縁取り込みで、隣のラベルとの間に最低限あける）。 */
export const LABEL_GAP = 3;
/** 数字の高さ ÷ フォントの大きさ。 */
const DIGIT_HEIGHT = 0.72;
/** この canvas の大きさ（CSS px）より小さいときは、線と文字を一段小さくする（S・短い横長）。 */
export const COMPACT_BELOW = 150;

/** 走行済みの線の終わりの位置（progress）。走り終えたときは終点（1）まで。 */
export function riddenEnd( progress, finished ) {

	const t = finished ? 1 : progress;
	return Math.min( 1, Math.max( 0, t ) );

}

/** 進行位置 → 表示する年（整数）。 */
export function yearAt( curve, progress ) {

	return Math.floor( curve.progressToYear( Math.min( 1, Math.max( 0, progress ) ) ) );

}

/** 螺旋を弧長で等間隔に標本化した点の列（XZ）。count 個の区間 = count + 1 点。 */
export function spiralSamples( curve, perTurn = POINTS_PER_TURN ) {

	const count = Math.max( 64, Math.ceil( curve.turns * perTurn ) );
	const points = [];
	for ( let i = 0; i <= count; i ++ ) {

		const p = curve.arcCurve.getPointAt( i / count );
		points.push( { x: p.x, z: p.z } );

	}

	return { points, count };

}

/**
 * 螺旋の点の列を canvas（width × height、CSS px）の座標へ収める。縦横比を保ち、中心（原点）を canvas の中心に置く。
 * 外端と canvas の縁の間に inset（現在位置の点・ラベルのはみ出し）を残す最大の拡大率にする。
 * northExtent：螺旋がいちばん北へ延びる位置の、中心からの距離（px。スポークの長さの基準）。
 * @returns {{ scale: number, cx: number, cy: number, northExtent: number, toCanvas: ( x: number, z: number ) => { x: number, y: number } }}
 */
export function fitSpiral( points, width, height, inset = EDGE_INSET ) {

	let maxX = 0, maxZ = 0, north = 0;
	for ( const p of points ) {

		maxX = Math.max( maxX, Math.abs( p.x ) );
		maxZ = Math.max( maxZ, Math.abs( p.z ) );
		north = Math.max( north, - p.z );

	}

	const scale = Math.min( ( width / 2 - inset ) / Math.max( maxX, 1e-9 ), ( height / 2 - inset ) / Math.max( maxZ, 1e-9 ) );
	const cx = width / 2;
	const cy = height / 2;
	return { scale, cx, cy, northExtent: north * scale, toCanvas: ( x, z ) => ( { x: cx + x * scale, y: cy + z * scale } ) };

}

/** canvas の大きさ → 見た目の寸法。150px 未満（S・短い横長）は一段小さい。 */
export function mapMetrics( width ) {

	const compact = width < COMPACT_BELOW;
	return {
		compact,
		fontSize: compact ? 11 : 12,
		labelStroke: compact ? 2 : 3,
		aheadWidth: compact ? 1.25 : 1.5,
		riddenWidth: compact ? 1.75 : 2,
		markerRadius: compact ? 4 : 4.5
	};

}

/**
 * 年代のラベル：北のスポークと各周の交点（yearsPerTurn の倍数の年の 1 月）に置く年と位置（scale 適用前の XZ と、原点からの距離 px）。
 * 周の間隔 pitch（px）= turnGap × scale が、数字の高さ + LABEL_GAP に足りないときは、20 で割り切れる年だけにする。
 * さらに 2 × pitch でも足りないときは、いちばん外側（最新）のラベルだけにする。
 * @returns {{ year: number, progress: number, x: number, z: number, offset: number }[]}  offset：中心から北へ向かう距離（px）
 */
export function decadeLabels( curve, scale, fontSize = 12 ) {

	const minPitch = fontSize * DIGIT_HEIGHT + LABEL_GAP;
	const pitch = curve.turnGap * scale;
	let list = curve.decadeBoundaries();

	if ( pitch < minPitch ) list = list.filter( ( b ) => b.year % 20 === 0 );
	if ( pitch * 2 < minPitch ) list = list.length ? [ curve.decadeBoundaries().at( - 1 ) ] : list;

	return list.map( ( b ) => {

		const { x, z } = curve.getXZAt( b.progress );
		return { year: b.year, progress: b.progress, x, z, offset: Math.hypot( x, z ) * scale };

	} );

}

/** 走行済みの線の標本の本数：先頭から何番目の点までを使うか（その先は、現在位置の点で結ぶ）。 */
export function riddenSampleCount( curve, count, progress, finished ) {

	const end = curve.arcFractionAt( riddenEnd( progress, finished ) );
	return { end, last: Math.min( count, Math.floor( end * count ) ) };

}

/** 「いま：」の2行目の文言（年は数字、終点なら（終点）を付ける）。 */
export function nowText( year, finished ) {

	return finished ? `${year}年（終点）` : `${year}年`;

}

/** canvas の aria-label。 */
export function mapAriaLabel( startYear, year ) {

	return `上から見たらせん形のコースの図。中心が${startYear}年で、外側ほど新しく、10年で1周します。北を向く線が年代の境目です。現在は${year}年。`;

}

export function createMap( ctx ) {

	const canvas = document.getElementById( 'mapCanvas' );
	const nowElement = document.getElementById( 'mapNow' );
	const { curve } = ctx;
	const startYear = Math.floor( curve.startYear );

	const { points, count } = spiralSamples( curve );

	// 大きさが変わったときだけ作り直すもの
	let fit = null;
	let metrics = null;
	let labels = [];
	let canvasPoints = [];

	let progress = 0;
	let finished = false;
	let shownText = null;
	let shownLabelYear = null;
	let renderedKey = '';
	let renderedVersion = - 1;

	function stroke( c, list ) {

		c.beginPath();
		list.forEach( ( p, i ) => {

			if ( i === 0 ) c.moveTo( p.x, p.y );
			else c.lineTo( p.x, p.y );

		} );
		c.stroke();

	}

	function drawStatic( c, w, h ) {

		metrics = mapMetrics( w );
		fit = fitSpiral( points, w, h );
		canvasPoints = points.map( ( p ) => fit.toCanvas( p.x, p.z ) );
		labels = decadeLabels( curve, fit.scale, metrics.fontSize );

		// 1. 年代の境目のスポーク：中心から北へ、螺旋のいちばん北の点 + 4px まで
		c.save();
		c.lineWidth = 1;
		c.strokeStyle = COLORS.spoke;
		c.setLineDash( [ 3, 2 ] );
		c.beginPath();
		c.moveTo( fit.cx, fit.cy );
		c.lineTo( fit.cx, fit.cy - ( fit.northExtent + SPOKE_OVERSHOOT ) );
		c.stroke();
		c.restore();

		// 2. 螺旋（これから）：全体
		c.lineWidth = metrics.aheadWidth;
		c.lineJoin = 'round';
		c.lineCap = 'round';
		c.strokeStyle = COLORS.ahead;
		stroke( c, canvasPoints );

		// 3. 起点：白抜きの丸
		const start = canvasPoints[ 0 ];
		c.beginPath();
		c.arc( start.x, start.y, 2.5, 0, Math.PI * 2 );
		c.fillStyle = COLORS.bg1;
		c.lineWidth = 1.5;
		c.strokeStyle = COLORS.text3;
		c.fill();
		c.stroke();

	}

	function drawDynamic( c ) {

		if ( ! fit ) return;

		// 4. 走行済み：起点から現在位置まで（走り終えたときは終点まで）
		const { end, last } = riddenSampleCount( curve, count, progress, finished );
		const pts = canvasPoints.slice( 0, last + 1 );
		const tip = curve.arcCurve.getPointAt( end );
		pts.push( fit.toCanvas( tip.x, tip.z ) );
		if ( pts.length > 1 ) {

			c.lineWidth = metrics.riddenWidth;
			c.lineJoin = 'round';
			c.lineCap = 'round';
			c.strokeStyle = COLORS.ridden;
			stroke( c, pts );

		}

		// 5. 年代のラベル：交点に中心を合わせ、縁取りで線を切る
		c.font = `400 ${metrics.fontSize}px ${FONT_SANS}`;
		c.textAlign = 'center';
		c.textBaseline = 'alphabetic';
		c.lineJoin = 'round';
		c.lineWidth = metrics.labelStroke;
		c.strokeStyle = COLORS.bg1;
		c.fillStyle = COLORS.text3;
		for ( const label of labels ) {

			const y = fit.cy - label.offset + metrics.fontSize * DIGIT_HEIGHT / 2;
			c.strokeText( String( label.year ), fit.cx, y );
			c.fillText( String( label.year ), fit.cx, y );

		}

		// 6. 現在位置：白い輪つきの点
		const here = curve.getXZAt( Math.min( 1, Math.max( 0, progress ) ) );
		const p = fit.toCanvas( here.x, here.z );
		c.beginPath();
		c.arc( p.x, p.y, metrics.markerRadius + 0.75, 0, Math.PI * 2 );
		c.lineWidth = 1.5;
		c.strokeStyle = COLORS.markerRing;
		c.fillStyle = COLORS.marker;
		c.fill();
		c.stroke();

	}

	const layer = createHudLayer( canvas, { drawStatic, drawDynamic } );

	/** 「いま：○年」。文言が変わったときだけ DOM を書き換える。 */
	function showNow( year, isFinished ) {

		const text = nowText( year, isFinished );
		if ( text === shownText ) return;
		shownText = text;
		if ( nowElement ) nowElement.textContent = text;

	}

	/** canvas の aria-label。年が変わったときだけ書き換える。 */
	function showLabel( year ) {

		if ( year === shownLabelYear ) return;
		shownLabelYear = year;
		canvas.setAttribute( 'aria-label', mapAriaLabel( startYear, year ) );

	}

	showNow( startYear, false );
	showLabel( startYear );

	const offYear = ctx.events?.on( 'yearchange', ( { year } ) => showLabel( year ) );

	return {
		update( state ) {

			layer.syncDpr();
			if ( ! state.started ) return;

			finished = state.finished;
			progress = state.progress;
			const year = state.point ? Number( state.point.date.substring( 0, 4 ) ) : yearAt( curve, progress );
			showNow( year, finished );

			if ( ! layer.width ) return;
			const key = `${progress.toFixed( 5 )}|${finished ? 1 : 0}`;
			if ( key === renderedKey && layer.version === renderedVersion ) return;
			renderedKey = key;
			renderedVersion = layer.version;
			layer.render();

		},
		onReset() {

			progress = 0;
			finished = false;
			showNow( startYear, false );
			showLabel( startYear );
			renderedKey = '';
			if ( layer.width ) layer.render();

		},
		dispose() {

			offYear?.();
			layer.dispose();

		}
	};

}
