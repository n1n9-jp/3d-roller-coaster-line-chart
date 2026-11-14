// ミニグラフ：週次の値（生データ）の全期間の折れ線と現在位置。値の書式・軸の範囲・見出しは、選んだデータの定義（dataset.def、dataset.format）から作る。
// 機能モジュール（createChart( ctx )）。canvas は #graphCanvas（#hud-chart の中）。見出しと単位は HTML。
//
// 静的な部分（グリッド・軸・年の目盛り・これからの線・イベントの目盛り）は、大きさが変わったときだけ描く（layer.js）。
// 毎フレームは、走行済みの線と現在位置だけを描く。軸と目盛りの計算は scales.js（描画に依存しない）。

import { HUD_COLORS as COLORS, FONT_SANS } from '../config.js';
import { createHudLayer, crisp, withAlpha } from './layer.js';
import { yAxis, labelStride, labelValues, yearTicks } from './scales.js';
import { parseDate, formatYearMonth } from '../format.js';

// 描画域の余白（CSS px）。仕様 3「ミニグラフ canvas の中身」と、モバイルの表（左 30、下 16）
const MARGIN = { left: 40, right: 8, top: 8, bottom: 18 };
const MARGIN_COMPACT = { left: 30, right: 6, top: 6, bottom: 16 };
const COMPACT_WIDTH = 230; // これより狭い canvas（モバイル、短い横長）は小さい文字と余白にする
const EVENT_TICK = { width: 2, height: 6 };

export function createChart( ctx ) {

	const canvas = document.getElementById( 'graphCanvas' );
	const dataset = ctx.dataset;
	const series = dataset.raw;
	const last = series.length - 1;
	const format = dataset.format;
	const axis = yAxis( format, dataset.rawRange );
	const years = yearTicks( dataset );
	const endLabel = formatYearMonth( series[ last ].date );
	const baseLabel = `${parseDate( series[ 0 ].date ).year}年から${endLabel}までの${dataset.def.name}の折れ線グラフ。`;

	// 見出しと単位（HTML 側は日経平均の初期値。S では見出しの「…の」を隠して「推移」だけを出す）
	const titleFullEl = document.querySelector( '#hud-chart .chart-title__full' );
	const titleTailEl = document.querySelector( '#hud-chart .chart-title__tail' );
	const unitEl = document.querySelector( '#hud-chart .chart-unit' );
	const chartTitle = dataset.def.chartTitle;
	const titleTail = '推移';
	if ( titleFullEl && titleTailEl ) {

		const hasTail = chartTitle.endsWith( titleTail );
		titleFullEl.textContent = hasTail ? chartTitle.slice( 0, - titleTail.length ) : chartTitle;
		titleTailEl.textContent = hasTail ? titleTail : '';

	}

	if ( unitEl ) unitEl.textContent = format.unit;

	let events = []; // [ { index } ]：系列上の位置
	let plot = null; // 描画域（論理 px）と、座標の変換
	let fillGradient = null; // 走行済みの下に塗るグラデーション

	// 動的な部分の状態
	let shownIndex = 0;
	let shownFinished = false;
	let renderedKey = '';
	let renderedVersion = - 1;

	function computePlot( w, h ) {

		const compact = w < COMPACT_WIDTH;
		const m = compact ? MARGIN_COMPACT : MARGIN;
		const left = m.left;
		const right = w - m.right;
		const top = m.top;
		const bottom = h - m.bottom;
		const plotW = right - left;
		const plotH = bottom - top;
		return {
			compact,
			fontSize: compact ? 11 : 12,
			left, right, top, bottom, plotW, plotH,
			xAt: ( u ) => left + Math.min( last, Math.max( 0, u ) ) / last * plotW,
			yAt: ( close ) => bottom - ( close - axis.min ) / axis.span * plotH
		};

	}

	function drawStatic( c, w, h, dpr ) {

		plot = computePlot( w, h );
		const { left, right, top, bottom, plotH, fontSize, xAt, yAt } = plot;

		// 走行済みの下に塗るグラデーション（0.14 → 0）
		fillGradient = c.createLinearGradient( 0, top, 0, bottom );
		fillGradient.addColorStop( 0, withAlpha( COLORS.ridden, 0.14 ) );
		fillGradient.addColorStop( 1, withAlpha( COLORS.ridden, 0 ) );

		// グリッド：刻みごとに細い線（ラベルを間引いても線は全部引く。下端の線は、基線が別にあるとき（金利の 0）も引く）
		c.lineWidth = 1;
		c.strokeStyle = COLORS.plotGrid;
		c.beginPath();
		for ( const value of axis.values ) {

			if ( value === axis.baseValue ) continue;
			const y = crisp( yAt( value ), dpr );
			c.moveTo( left, y );
			c.lineTo( right, y );

		}

		c.stroke();

		// 基線：0 が軸の範囲にあれば 0 の線（金利）、なければ下端の線。少し強く描く
		c.strokeStyle = COLORS.plotAxis;
		c.beginPath();
		const zeroY = crisp( yAt( axis.baseValue ), dpr );
		c.moveTo( left, zeroY );
		c.lineTo( right, zeroY );
		c.stroke();

		// Y 軸のラベル：値の書式の短い形（'100'、'2'、'2万'。単位は見出し行の右）。多いとき、または描画域が低いときは間引く
		const stride = labelStride( axis, plotH );
		c.font = `400 ${fontSize}px ${FONT_SANS}`;
		c.fillStyle = COLORS.text3;
		c.textAlign = 'right';
		c.textBaseline = 'middle';
		for ( const value of labelValues( axis, stride ) ) {

			// 下端のラベルは、すぐ下の年の目盛りのラベルと近いので 2px 上げる
			c.fillText( format.tick( value ), left - 6, yAt( value ) - ( value === axis.min ? 2 : 0 ) );

		}

		// X 軸：10 年ごとの年の目盛り（下端から長さ 4px）とラベル
		c.strokeStyle = COLORS.plotAxis;
		c.beginPath();
		const baseY = crisp( bottom, dpr );
		for ( const { index } of years ) {

			const x = crisp( xAt( index ), dpr );
			c.moveTo( x, baseY );
			c.lineTo( x, baseY + 4 );

		}

		c.stroke();
		c.fillStyle = COLORS.text3;
		c.textAlign = 'center';
		c.textBaseline = 'top';
		for ( const { year, index } of years ) c.fillText( String( year ), xAt( index ), bottom + 5 );

		// これからの線（全期間。走行済みは毎フレーム、この上に重ねる）
		c.lineWidth = 1.5;
		c.lineJoin = 'round';
		c.lineCap = 'round';
		c.strokeStyle = COLORS.ahead;
		c.beginPath();
		for ( let i = 0; i <= last; i ++ ) {

			const x = xAt( i );
			const y = yAt( series[ i ].close );
			if ( i === 0 ) c.moveTo( x, y );
			else c.lineTo( x, y );

		}

		c.stroke();

		// イベントの目盛り：描画域の下端に、幅 2px・高さ 6px
		c.fillStyle = COLORS.event;
		for ( const { index } of events ) {

			const x = Math.round( xAt( index ) * dpr ) / dpr;
			c.fillRect( x - EVENT_TICK.width / 2, bottom - EVENT_TICK.height, EVENT_TICK.width, EVENT_TICK.height );

		}

	}

	function drawDynamic( c, w, h, dpr ) {

		const { xAt, yAt, bottom, top } = plot;
		const u = Math.min( last, Math.max( 0, shownIndex ) );
		const i0 = Math.min( last, Math.floor( u ) );
		const i1 = Math.min( last, i0 + 1 );
		const tipClose = series[ i0 ].close + ( series[ i1 ].close - series[ i0 ].close ) * ( u - i0 );
		const tipX = xAt( u );
		const tipY = yAt( tipClose );

		// 走行済み：線（琥珀 2px）と、その下の薄い面
		if ( u > 0 ) {

			c.beginPath();
			c.moveTo( xAt( 0 ), yAt( series[ 0 ].close ) );
			for ( let i = 1; i <= i0; i ++ ) c.lineTo( xAt( i ), yAt( series[ i ].close ) );
			if ( u > i0 ) c.lineTo( tipX, tipY );

			c.lineWidth = 2;
			c.lineJoin = 'round';
			c.lineCap = 'round';
			c.strokeStyle = COLORS.ridden;
			c.stroke();

			c.lineTo( tipX, bottom );
			c.lineTo( xAt( 0 ), bottom );
			c.closePath();
			c.fillStyle = fillGradient;
			c.fill();

		}

		// 現在位置：縦線（1px、text-3、不透明度 0.6）と、白い輪つきの点
		const lineX = crisp( tipX, dpr );
		c.lineWidth = 1;
		c.strokeStyle = withAlpha( COLORS.text3, 0.6 );
		c.beginPath();
		c.moveTo( lineX, top );
		c.lineTo( lineX, bottom );
		c.stroke();

		const radius = plot.compact ? 4 : 4.5;
		c.beginPath();
		c.arc( tipX, tipY, radius + 0.75, 0, Math.PI * 2 );
		c.lineWidth = 1.5;
		c.strokeStyle = COLORS.markerRing;
		c.fillStyle = COLORS.marker;
		c.fill();
		c.stroke();

	}

	canvas.setAttribute( 'aria-label', baseLabel );
	const layer = createHudLayer( canvas, { drawStatic, drawDynamic } );

	/** 外から渡すイベントの目盛り。[ { index } ]（index は系列上の位置）。渡されなければ描かない。 */
	function setEvents( list ) {

		events = ( Array.isArray( list ) ? list : [] )
			.filter( ( e ) => e && Number.isFinite( e.index ) )
			.map( ( e ) => ( { index: Math.min( last, Math.max( 0, e.index ) ) } ) );
		layer.redrawStatic();

	}

	const offEvents = ctx.events?.on( 'eventsready', ( payload ) => setEvents( payload?.events ) );

	// 代替テキストは、年が変わったときだけ更新する
	const offYear = ctx.events?.on( 'yearchange', ( { point } ) => {

		if ( ! point ) return;
		canvas.setAttribute( 'aria-label', `${baseLabel}現在は${formatYearMonth( point.date )}、${format.value( point.close )}。` );

	} );

	function render( key ) {

		renderedKey = key;
		renderedVersion = layer.version;
		layer.render();

	}

	return {
		update( state ) {

			layer.syncDpr();
			if ( ! state.started || ! layer.width ) return;

			// 連絡区間（dataIndex が null）では、最後に描いた位置のまま。一周して止まったときは終点（全体が走行済み）
			if ( state.finished ) shownIndex = last;
			else if ( state.dataIndex !== null ) shownIndex = state.dataIndex;
			shownFinished = state.finished;

			const key = `${shownIndex.toFixed( 3 )}|${shownFinished ? 1 : 0}`;
			if ( key === renderedKey && layer.version === renderedVersion ) return; // 動いていなければ描き直さない
			render( key );

		},
		onReset() {

			shownIndex = 0;
			shownFinished = false;
			canvas.setAttribute( 'aria-label', baseLabel );
			if ( layer.width ) render( '0.000|0' );

		},
		/** イベントの目盛りを渡す。[ { index } ]（index は系列上の位置） */
		setEvents,
		dispose() {

			offEvents?.();
			offYear?.();
			layer.dispose();

		}
	};

}
