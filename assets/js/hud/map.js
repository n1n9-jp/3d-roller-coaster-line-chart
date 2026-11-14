// 螺旋の図（一時的な簡素な表示）：螺旋の線（3D と同じ XZ 座標、北が上）、走行済みの線、現在位置、「いま：2008年」。
// 機能モジュール（createMap( ctx )）。canvas は #mapCanvas（#hud-map の中）。
// 年代のスポークとラベルを付けた作り直しは、別の担当が行う。
//
// 静的な部分（これからの螺旋）は、大きさが変わったときだけ描く（layer.js）。
// 毎フレームは、走行済みの線と現在位置の点だけを描く。

import { HUD_COLORS as COLORS } from '../config.js';
import { createHudLayer } from './layer.js';

/**
 * 走行済みの線の終わりの位置（progress）。DOM に依存しない（tests/hud-scales.test.js）。
 * 走り終えたときは終点（1）まで。
 */
export function riddenEnd( progress, finished ) {

	const t = finished ? 1 : progress;
	return Math.min( 1, Math.max( 0, t ) );

}

/** 進行位置 → 表示する年（整数）。 */
export function yearAt( curve, progress ) {

	return Math.floor( curve.progressToYear( Math.min( 1, Math.max( 0, progress ) ) ) );

}

const EDGE = 8; // canvas の縁と螺旋の間（現在位置の点 r=5 + 白い輪がはみ出す分を含む）
const POINTS_PER_TURN = 96;

export function createMap( ctx ) {

	const canvas = document.getElementById( 'mapCanvas' );
	const nowElement = document.getElementById( 'mapNow' );
	const { curve } = ctx;
	const baseLabel = '螺旋のコースの図。';

	// 「いま：○○付近」の「付近」は駅名のための文言なので、年だけを出す（「いま：2008年」）。見出しの HTML は別の担当が作り直す
	const nowLine = nowElement?.parentElement;
	if ( nowLine ) {

		nowLine.textContent = 'いま：';
		nowLine.append( nowElement );

	}

	// 螺旋の点（弧長で等間隔。全体の XZ の範囲も求める）
	const count = Math.max( 64, Math.ceil( curve.turns * POINTS_PER_TURN ) );
	const xz = [];
	let xMin = Infinity, xMax = - Infinity, zMin = Infinity, zMax = - Infinity;
	for ( let i = 0; i <= count; i ++ ) {

		const p = curve.arcCurve.getPointAt( i / count );
		xz.push( { x: p.x, z: p.z } );
		xMin = Math.min( xMin, p.x );
		xMax = Math.max( xMax, p.x );
		zMin = Math.min( zMin, p.z );
		zMax = Math.max( zMax, p.z );

	}

	let toCanvas = null;
	let progress = 0;
	let finished = false;
	let shownYear = null;
	let renderedKey = '';
	let renderedVersion = - 1;

	function stroke( c, points ) {

		c.beginPath();
		points.forEach( ( p, i ) => {

			if ( i === 0 ) c.moveTo( p.x, p.y );
			else c.lineTo( p.x, p.y );

		} );
		c.stroke();

	}

	function drawStatic( c, w, h ) {

		const s = Math.min( ( w - EDGE * 2 ) / ( xMax - xMin ), ( h - EDGE * 2 ) / ( zMax - zMin ) );
		const dx = ( w - ( xMax - xMin ) * s ) / 2;
		const dy = ( h - ( zMax - zMin ) * s ) / 2;
		toCanvas = ( x, z ) => ( { x: dx + ( x - xMin ) * s, y: dy + ( z - zMin ) * s } );

		c.lineWidth = 1.5;
		c.lineJoin = 'round';
		c.lineCap = 'round';
		c.strokeStyle = COLORS.ahead;
		stroke( c, xz.map( ( p ) => toCanvas( p.x, p.z ) ) );

	}

	function drawDynamic( c ) {

		if ( ! toCanvas ) return;

		// 走行済み：始点から現在位置まで（走り終えたときは終点まで）
		const end = curve.arcFractionAt( riddenEnd( progress, finished ) );
		const last = Math.floor( end * count );
		const pts = [];
		for ( let i = 0; i <= last; i ++ ) pts.push( toCanvas( xz[ i ].x, xz[ i ].z ) );
		const tip = curve.arcCurve.getPointAt( end );
		pts.push( toCanvas( tip.x, tip.z ) );
		if ( pts.length > 1 ) {

			c.lineWidth = 2.5;
			c.lineJoin = 'round';
			c.lineCap = 'round';
			c.strokeStyle = COLORS.ridden;
			stroke( c, pts );

		}

		// 現在位置：白い輪つきの点（r=5）
		const here = curve.getXZAt( Math.min( 1, Math.max( 0, progress ) ) );
		const p = toCanvas( here.x, here.z );
		c.beginPath();
		c.arc( p.x, p.y, 5 + 0.75, 0, Math.PI * 2 );
		c.lineWidth = 1.5;
		c.strokeStyle = COLORS.markerRing;
		c.fillStyle = COLORS.marker;
		c.fill();
		c.stroke();

	}

	const layer = createHudLayer( canvas, { drawStatic, drawDynamic } );

	function showYear( year ) {

		if ( year === shownYear ) return;
		shownYear = year;
		if ( nowElement ) nowElement.textContent = `${year}年`;
		canvas.setAttribute( 'aria-label', `${baseLabel}現在は${year}年。` );

	}

	showYear( yearAt( curve, 0 ) );

	return {
		update( state ) {

			layer.syncDpr();
			if ( ! state.started || ! layer.width ) return;

			finished = state.finished;
			progress = state.progress;
			showYear( yearAt( curve, progress ) );

			const key = `${progress.toFixed( 5 )}|${finished ? 1 : 0}`;
			if ( key === renderedKey && layer.version === renderedVersion ) return;
			renderedKey = key;
			renderedVersion = layer.version;
			layer.render();

		},
		onReset() {

			progress = 0;
			finished = false;
			showYear( yearAt( curve, 0 ) );
			renderedKey = '';
			if ( layer.width ) layer.render();

		},
		dispose() {

			layer.dispose();

		}
	};

}
