// 路線図：山手線の輪（3D と同じ XZ 座標、北が上）と現在位置。
// 機能モジュール（createMap( ctx )）。canvas は #mapCanvas（#hud-map の中）。見出しと「いま：駅名付近」は HTML。
//
// 静的な部分（これからの輪・駅の点・駅名）は、大きさが変わったときだけ描く（layer.js）。
// 毎フレームは、走行済みの弧と現在位置の点だけを描く。

import { HUD_COLORS as COLORS, FONT_SANS } from '../config.js';
import { createHudLayer } from './layer.js';
import { nearestStationIndex } from './scales.js';

/**
 * 走行済みの弧の終わりの位置（progress）。DOM に依存しない（tests/hud-scales.test.js）。
 * 一周して止まったときは、3D のレールやミニグラフと同じく、データ区間の終わり（dataEnd）まで。
 * それより先の連絡区間（品川→大崎）は、走っていないので「これから」の色のままにする。
 */
export function riddenEnd( progress, finished, dataEnd = 1 ) {

	const t = finished ? dataEnd : progress;
	return Math.min( 1, Math.max( 0, t ) );

}

// 駅名を出す駅と、駅名を置く側（l：駅の左、r：右、b：下）。大きい画面と、モバイル・短い横長
const LABELS_FULL = { 池袋: 'l', 上野: 'r', 東京: 'r', 品川: 'r', 渋谷: 'l', 新宿: 'l', 大崎: 'b' };
const LABELS_COMPACT = { 新宿: 'l', 池袋: 'l', 東京: 'r', 品川: 'r' };
const ORIGIN_LABEL = { 大崎: '大崎（起点）' };
const COMPACT_WIDTH = 130; // これより狭い canvas は、駅名を 4 つに絞って 11px にする
const EDGE = 3; // canvas の縁と、輪・駅名の間
const MARKER_PAD = 7; // 現在位置の点（r=5 + 白い輪 1.5）が輪からはみ出す分

export function createMap( ctx ) {

	const canvas = document.getElementById( 'mapCanvas' );
	const nowElement = document.getElementById( 'mapNow' );
	const { stations } = ctx;
	const seg = ctx.curve.seg;
	const n = stations.length;
	const ring = seg.points; // 駅の XZ（先頭を末尾にもう一度足した閉じた折れ線）
	const stationXZ = ring.slice( 0, n );
	const startName = stations[ 0 ].station_name;
	const baseLabel = '山手線の路線図。';

	let layout = null; // { s, ox, oz, ... }：描画の大きさに応じた、XZ → canvas の変換と駅名の位置
	let stationIndex = 0;
	let progress = 0;
	let finished = false;
	let renderedKey = '';
	let renderedVersion = - 1;

	// XZ の範囲
	let xMin = Infinity, xMax = - Infinity, zMin = Infinity, zMax = - Infinity;
	for ( const p of stationXZ ) {

		xMin = Math.min( xMin, p.x );
		xMax = Math.max( xMax, p.x );
		zMin = Math.min( zMin, p.z );
		zMax = Math.max( zMax, p.z );

	}

	/**
	 * 拡大率 s のときの、輪と駅名の位置（輪の左上を 0,0 とした相対座標）と、全体が占める範囲。
	 * 駅名は、駅から 5px 離して外側に置く（同じ側の駅名どうしが縦に重なるときは、重ならないようにずらす）。
	 */
	function place( s, c, fontSize ) {

		const names = fontSize === 11 ? LABELS_COMPACT : LABELS_FULL;
		const lineH = fontSize + 2;
		const pts = stationXZ.map( ( p ) => ( { x: ( p.x - xMin ) * s, y: ( p.z - zMin ) * s } ) );
		const labels = [];
		stations.forEach( ( st, i ) => {

			const side = names[ st.station_name ];
			if ( ! side ) return;
			const text = ORIGIN_LABEL[ st.station_name ] ?? st.station_name;
			labels.push( { index: i, side, text, w: c.measureText( text ).width, x: pts[ i ].x, y: pts[ i ].y, line: i === 0 } );

		} );

		// 同じ側の駅名が縦に近すぎるときは、離す
		for ( const side of [ 'l', 'r' ] ) {

			const list = labels.filter( ( l ) => l.side === side ).sort( ( a, b ) => a.y - b.y );
			for ( let i = 1; i < list.length; i ++ ) list[ i ].y = Math.max( list[ i ].y, list[ i - 1 ].y + lineH );

		}

		let minX = - MARKER_PAD, maxX = ( xMax - xMin ) * s + MARKER_PAD;
		let minY = - MARKER_PAD, maxY = ( zMax - zMin ) * s + MARKER_PAD;
		for ( const l of labels ) {

			if ( l.side === 'l' ) {

				l.left = l.x - 5 - l.w;
				l.right = l.x - 5;
				l.top = l.y - lineH / 2;
				l.bottom = l.y + lineH / 2;

			} else if ( l.side === 'r' ) {

				l.left = l.x + 5;
				l.right = l.x + 5 + l.w;
				l.top = l.y - lineH / 2;
				l.bottom = l.y + lineH / 2;

			} else {

				l.left = l.x - l.w / 2;
				l.right = l.x + l.w / 2;
				l.top = l.y + 7; // 駅から 4px の短い線のあとに文字
				l.bottom = l.top + lineH;

			}

			minX = Math.min( minX, l.left );
			maxX = Math.max( maxX, l.right );
			minY = Math.min( minY, l.top );
			maxY = Math.max( maxY, l.bottom );

		}

		return { pts, labels, minX, maxX, minY, maxY, lineH };

	}

	function computeLayout( c, w, h ) {

		const compact = w < COMPACT_WIDTH;
		const fontSize = compact ? 11 : 12;
		c.font = `400 ${fontSize}px ${FONT_SANS}`;

		const availW = w - EDGE * 2;
		const availH = h - EDGE * 2;
		// 駅名を含む全体が収まる最大の拡大率を、二分探索で求める（拡大率が大きいほど全体は大きくなる）
		let lo = 0.05;
		let hi = 8;
		for ( let i = 0; i < 28; i ++ ) {

			const mid = ( lo + hi ) / 2;
			const p = place( mid, c, fontSize );
			if ( p.maxX - p.minX <= availW && p.maxY - p.minY <= availH ) lo = mid;
			else hi = mid;

		}

		const placed = place( lo, c, fontSize );
		// 全体を canvas の中央に置く
		const dx = EDGE + ( availW - ( placed.maxX - placed.minX ) ) / 2 - placed.minX;
		const dy = EDGE + ( availH - ( placed.maxY - placed.minY ) ) / 2 - placed.minY;
		const toCanvas = ( x, z ) => ( { x: dx + ( x - xMin ) * lo, y: dy + ( z - zMin ) * lo } );
		return { s: lo, fontSize, compact, toCanvas, labels: placed.labels, dx, dy, lineH: placed.lineH };

	}

	function strokeRing( c, points, closePath ) {

		c.beginPath();
		points.forEach( ( p, i ) => {

			if ( i === 0 ) c.moveTo( p.x, p.y );
			else c.lineTo( p.x, p.y );

		} );
		if ( closePath ) c.closePath();
		c.stroke();

	}

	function drawStatic( c, w, h ) {

		layout = computeLayout( c, w, h );
		const { toCanvas, fontSize } = layout;
		const points = ring.slice( 0, n ).map( ( p ) => toCanvas( p.x, p.z ) );

		// これからの輪（全周。走行済みは毎フレーム、この上に重ねる）
		c.lineWidth = 2;
		c.lineJoin = 'round';
		c.lineCap = 'round';
		c.strokeStyle = COLORS.ahead;
		strokeRing( c, points, true );

		// 駅の点
		c.fillStyle = COLORS.text3;
		for ( const p of points ) {

			c.beginPath();
			c.arc( p.x, p.y, 1.5, 0, Math.PI * 2 );
			c.fill();

		}

		// 駅名：輪の外側。パネルの色の縁取りを付けて、線と重なっても読めるようにする
		c.font = `400 ${fontSize}px ${FONT_SANS}`;
		c.textBaseline = 'middle';
		c.lineWidth = 3;
		c.strokeStyle = COLORS.bg1;
		c.fillStyle = COLORS.text2;
		for ( const l of layout.labels ) {

			const p = points[ l.index ];
			let x;
			let y;
			if ( l.side === 'b' ) {

				// 起点：短い線を添えて、駅の下に置く
				c.save();
				c.lineWidth = 1.5;
				c.strokeStyle = COLORS.text3;
				c.beginPath();
				c.moveTo( p.x, p.y + 2 );
				c.lineTo( p.x, p.y + 6 );
				c.stroke();
				c.restore();
				c.textAlign = 'center';
				x = p.x;
				y = p.y + 7 + layout.lineH / 2;

			} else {

				x = l.side === 'l' ? p.x - 5 : p.x + 5;
				// 位置は place() が求めた、ずらしたあとの縦位置（輪の左上を 0,0 とした相対座標）
				y = layout.dy + l.y;
				c.textAlign = l.side === 'l' ? 'right' : 'left';

			}

			c.strokeText( l.text, x, y );
			c.fillText( l.text, x, y );

		}

	}

	function drawDynamic( c ) {

		if ( ! layout ) return;
		const { toCanvas } = layout;

		// 走行済みの弧：駅の折れ線を、現在位置まで（一周して止まったときはデータ区間の終わりまで。連絡区間は含めない）
		const here = ctx.curve.getXZAt( Math.min( 1, Math.max( 0, progress ) ) );
		const t = riddenEnd( progress, finished, ctx.curve.dataEnd );
		const { segTStart } = seg;
		const pts = [];
		for ( let i = 0; i < n && segTStart[ i ] < t; i ++ ) pts.push( toCanvas( ring[ i ].x, ring[ i ].z ) );
		const tip = t >= 1 ? ring[ 0 ] : ctx.curve.getXZAt( t );
		pts.push( toCanvas( tip.x, tip.z ) );

		if ( pts.length > 1 ) {

			c.lineWidth = 2.5;
			c.lineJoin = 'round';
			c.lineCap = 'round';
			c.strokeStyle = COLORS.ridden;
			strokeRing( c, pts, false );

		}

		// 現在位置：白い輪つきの点（r=5）。一周して止まったときも、実際の位置に置く
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

	function stationName( i ) {

		return stations[ i ].station_name;

	}

	function showStation( i ) {

		stationIndex = i;
		if ( nowElement ) nowElement.textContent = stationName( i );

	}

	// 代替テキストは、年が変わったときだけ更新する
	canvas.setAttribute( 'aria-label', `${baseLabel}現在は${startName}付近。` );
	const offYear = ctx.events?.on( 'yearchange', () => {

		// 'yearchange' は update より先に来るので、いまの位置から求め直す
		const here = ctx.curve.getXZAt( Math.min( 1, Math.max( 0, ctx.ride.progress ) ) );
		canvas.setAttribute( 'aria-label', `${baseLabel}現在は${stationName( nearestStationIndex( stationXZ, here.x, here.z ) )}付近。` );

	} );

	return {
		update( state ) {

			layer.syncDpr();
			if ( ! state.started || ! layer.width ) return;

			finished = state.finished;
			progress = state.progress;

			// 現在位置に最も近い駅（変わったときだけ HTML を更新する）
			const here = ctx.curve.getXZAt( Math.min( 1, Math.max( 0, progress ) ) );
			const nearest = nearestStationIndex( stationXZ, here.x, here.z );
			if ( nearest !== stationIndex ) showStation( nearest );

			const key = `${progress.toFixed( 5 )}|${finished ? 1 : 0}`;
			if ( key === renderedKey && layer.version === renderedVersion ) return;
			renderedKey = key;
			renderedVersion = layer.version;
			layer.render();

		},
		onReset() {

			progress = 0;
			finished = false;
			showStation( 0 );
			canvas.setAttribute( 'aria-label', `${baseLabel}現在は${startName}付近。` );
			renderedKey = '';
			if ( layer.width ) layer.render();

		},
		dispose() {

			offYear?.();
			layer.dispose();

		}
	};

}
