// ミニグラフ：日経平均の週次終値（生データ）の折れ線と現在位置。
// 機能モジュール（createChart( ctx )）。担当：ミニグラフ。canvas は #graphCanvas（#hud-chart の中）。

import { HUD } from '../config.js';
import { createHudLayer } from './layer.js';

const PADDING = 10;

export function createChart( ctx ) {

	const canvas = document.getElementById( 'graphCanvas' );
	const series = ctx.dataset.raw;
	const { min, max } = ctx.dataset.rawRange;
	const last = series.length - 1;

	let W = 0;
	let H = 0;
	const xAt = ( u ) => PADDING + u / last * ( W - PADDING * 2 );
	const yAt = ( close ) => PADDING + ( 1 - ( close - min ) / ( max - min ) ) * ( H - PADDING * 2 );

	const layer = createHudLayer( canvas, ( c, w, h ) => {

		W = w;
		H = h;

		c.fillStyle = HUD.panelBackground;
		c.fillRect( 0, 0, w, h );

		c.strokeStyle = HUD.graphGrid;
		c.lineWidth = 1;
		c.beginPath();
		c.moveTo( 0, h / 2 );
		c.lineTo( w, h / 2 );
		c.stroke();

		c.strokeStyle = HUD.graphLine;
		c.lineWidth = 1.5;
		c.beginPath();
		for ( let i = 0; i < series.length; i ++ ) {

			const x = xAt( i );
			const y = yAt( series[ i ].close );
			if ( i === 0 ) c.moveTo( x, y );
			else c.lineTo( x, y );

		}

		c.stroke();

		c.fillStyle = HUD.text;
		c.font = HUD.font;
		c.textAlign = 'center';
		c.textBaseline = 'middle';
		c.fillText( 'Nikkei 225', w / 2, h / 2 );

	} );

	let lastIndex = 0; // 連絡区間では最後に描いた位置のまま

	return {
		update( state ) {

			if ( ! state.started || ! layer.width ) return;

			const c = layer.begin();
			if ( state.dataIndex !== null ) lastIndex = state.dataIndex;
			const u = Math.min( last, lastIndex );
			const close = series[ Math.floor( u ) ].close;

			c.fillStyle = HUD.marker;
			c.beginPath();
			c.arc( xAt( u ), yAt( close ), 4, 0, Math.PI * 2 );
			c.fill();

		},
		onReset() {

			lastIndex = 0;

		}
	};

}
