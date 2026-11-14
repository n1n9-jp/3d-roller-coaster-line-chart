// ミニグラフ：日経平均の週次終値（生データ）の折れ線と現在位置。

import { HUD } from '../config.js';
import { indexAt } from '../data.js';
import { createHudLayer } from './layer.js';

const PADDING = 10;

export function createChart( canvas, dataset ) {

	const series = dataset.raw;
	const { min, max } = dataset.rawRange;
	const size = HUD.size;
	const graphW = size - PADDING * 2;
	const graphH = size - PADDING * 2;

	const xAt = ( t ) => PADDING + t * graphW;
	const yAt = ( close ) => PADDING + ( 1 - ( close - min ) / ( max - min ) ) * graphH;

	const layer = createHudLayer( canvas, size, ( ctx ) => {

		ctx.fillStyle = HUD.panelBackground;
		ctx.fillRect( 0, 0, size, size );

		ctx.strokeStyle = HUD.graphGrid;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo( 0, size / 2 );
		ctx.lineTo( size, size / 2 );
		ctx.stroke();

		ctx.strokeStyle = HUD.graphLine;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		for ( let i = 0; i < series.length; i ++ ) {

			const x = xAt( i / ( series.length - 1 ) );
			const y = yAt( series[ i ].close );
			if ( i === 0 ) ctx.moveTo( x, y );
			else ctx.lineTo( x, y );

		}

		ctx.stroke();

		ctx.fillStyle = HUD.text;
		ctx.font = HUD.font;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'Nikkei 225', size / 2, size / 2 );

	} );

	return {
		draw( progress ) {

			const ctx = layer.begin();
			const close = series[ indexAt( series, progress ) ].close;

			ctx.fillStyle = HUD.marker;
			ctx.beginPath();
			ctx.arc( xAt( progress ), yAt( close ), 4, 0, Math.PI * 2 );
			ctx.fill();

		}
	};

}
