// 路線図：山手線の駅と現在位置。

import { HUD } from '../config.js';
import { getXZAt, xzToGeo } from '../track.js';
import { createHudLayer } from './layer.js';

const PADDING = 8;

/** @param seg buildStationSegments の結果（現在位置を求めるのに使う） */
export function createMap( canvas, stations, seg ) {

	const size = HUD.size;

	const lons = stations.map( s => s.lon );
	const lats = stations.map( s => s.lat );
	const lonMin = Math.min( ...lons );
	const latMin = Math.min( ...lats );
	const lonRange = Math.max( ...lons ) - lonMin;
	const latRange = Math.max( ...lats ) - latMin;

	// 縦横比を保って canvas の中央に収める
	const maxSize = size - PADDING * 2;
	const aspect = latRange / lonRange;
	const mapW = aspect > 1 ? maxSize / aspect : maxSize;
	const mapH = aspect > 1 ? maxSize : maxSize * aspect;
	const offsetX = ( size - mapW ) / 2;
	const offsetY = ( size - mapH ) / 2;

	const toCanvas = ( lon, lat ) => ( {
		x: offsetX + ( lon - lonMin ) / lonRange * mapW,
		y: offsetY + ( 1 - ( lat - latMin ) / latRange ) * mapH
	} );

	const stationPoints = stations.map( s => toCanvas( s.lon, s.lat ) );

	const layer = createHudLayer( canvas, size, ( ctx ) => {

		ctx.fillStyle = HUD.panelBackground;
		ctx.fillRect( 0, 0, size, size );

		ctx.strokeStyle = HUD.mapLine;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		stationPoints.forEach( ( p, i ) => {

			if ( i === 0 ) ctx.moveTo( p.x, p.y );
			else ctx.lineTo( p.x, p.y );

		} );
		ctx.closePath();
		ctx.stroke();

		ctx.fillStyle = HUD.mapLine;
		for ( const p of stationPoints ) {

			ctx.beginPath();
			ctx.arc( p.x, p.y, 2, 0, Math.PI * 2 );
			ctx.fill();

		}

		ctx.fillStyle = HUD.text;
		ctx.font = HUD.font;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'Yamanote Line', size / 2, size / 2 );

	} );

	return {
		draw( progress ) {

			const ctx = layer.begin();
			const { x, z } = getXZAt( progress, seg );
			const { lon, lat } = xzToGeo( x, z );
			const p = toCanvas( lon, lat );

			ctx.fillStyle = HUD.marker;
			ctx.beginPath();
			ctx.arc( p.x, p.y, 4, 0, Math.PI * 2 );
			ctx.fill();

		}
	};

}
