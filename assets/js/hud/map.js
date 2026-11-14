// 路線図：山手線の駅と現在位置。
// 機能モジュール（createMap( ctx )）。担当：路線図。canvas は #mapCanvas（#hud-map の中）。

import { HUD } from '../config.js';
import { getXZAt, xzToGeo } from '../track.js';
import { createHudLayer } from './layer.js';

const PADDING = 8;

export function createMap( ctx ) {

	const canvas = document.getElementById( 'mapCanvas' );
	const { stations } = ctx;
	const seg = ctx.curve.seg;

	const lons = stations.map( s => s.lon );
	const lats = stations.map( s => s.lat );
	const lonMin = Math.min( ...lons );
	const latMin = Math.min( ...lats );
	const lonRange = Math.max( ...lons ) - lonMin;
	const latRange = Math.max( ...lats ) - latMin;

	// 縦横比を保って canvas の中央に収める（サイズが変わるたびに計算し直す）
	let offsetX = 0;
	let offsetY = 0;
	let mapW = 0;
	let mapH = 0;

	function layout( w, h ) {

		const scale = Math.min( ( w - PADDING * 2 ) / lonRange, ( h - PADDING * 2 ) / latRange );
		mapW = lonRange * scale;
		mapH = latRange * scale;
		offsetX = ( w - mapW ) / 2;
		offsetY = ( h - mapH ) / 2;

	}

	const toCanvas = ( lon, lat ) => ( {
		x: offsetX + ( lon - lonMin ) / lonRange * mapW,
		y: offsetY + ( 1 - ( lat - latMin ) / latRange ) * mapH
	} );

	const layer = createHudLayer( canvas, ( c, w, h ) => {

		layout( w, h );
		const stationPoints = stations.map( s => toCanvas( s.lon, s.lat ) );

		c.fillStyle = HUD.panelBackground;
		c.fillRect( 0, 0, w, h );

		c.strokeStyle = HUD.mapLine;
		c.lineWidth = 1.5;
		c.beginPath();
		stationPoints.forEach( ( p, i ) => {

			if ( i === 0 ) c.moveTo( p.x, p.y );
			else c.lineTo( p.x, p.y );

		} );
		c.closePath();
		c.stroke();

		c.fillStyle = HUD.mapLine;
		for ( const p of stationPoints ) {

			c.beginPath();
			c.arc( p.x, p.y, 2, 0, Math.PI * 2 );
			c.fill();

		}

		c.fillStyle = HUD.text;
		c.font = HUD.font;
		c.textAlign = 'center';
		c.textBaseline = 'middle';
		c.fillText( 'Yamanote Line', w / 2, h / 2 );

	} );

	return {
		update( state ) {

			if ( ! state.started || ! layer.width ) return;

			const c = layer.begin();
			const { x, z } = getXZAt( Math.min( state.progress, 1 ), seg );
			const { lon, lat } = xzToGeo( x, z );
			const p = toCanvas( lon, lat );

			c.fillStyle = HUD.marker;
			c.beginPath();
			c.arc( p.x, p.y, 4, 0, Math.PI * 2 );
			c.fill();

		}
	};

}
