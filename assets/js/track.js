// 山手線の経路（水平）と日経平均（高さ）から、ジェットコースターのレール曲線を作る。
//
// t（0..1）は「山手線を 1 周した距離の割合」であり、同時に「データ系列の位置」でもある。
// three.js のレンダラには依存しないので、Node からもそのまま読み込める。
// （Vector3 だけは three.core.js から相対パスで読む。ブラウザの importmap が指す
//  three.module.js は three.core.js を再エクスポートしているので、同じクラスになる。）

import { Vector3 } from './three.core.js';
import { GEO_CENTER, GEO_SCALE, Y_MIN, Y_MAX } from './config.js';
import { closeRange, interpolateClose } from './data.js';

/** 経緯度 → ワールド座標の水平位置。 */
export function geoToXZ( lon, lat ) {

	return {
		x: ( lon - GEO_CENTER.lon ) * GEO_SCALE,
		z: - ( lat - GEO_CENTER.lat ) * GEO_SCALE
	};

}

/** geoToXZ の逆変換。 */
export function xzToGeo( x, z ) {

	return {
		lon: x / GEO_SCALE + GEO_CENTER.lon,
		lat: - z / GEO_SCALE + GEO_CENTER.lat
	};

}

/**
 * 駅を順につないだ閉じた折れ線を作り、弧長で正規化した各区間の開始位置 segTStart を返す。
 * segTStart は 0 から始まり 1 で終わる単調増加列（長さ = 点の数）。
 */
export function buildStationSegments( stations ) {

	const points = stations.map( s => geoToXZ( s.lon, s.lat ) );
	points.push( points[ 0 ] ); // ループを閉じる

	const segLengths = [];
	let totalLength = 0;
	for ( let i = 0; i < points.length - 1; i ++ ) {

		const dx = points[ i + 1 ].x - points[ i ].x;
		const dz = points[ i + 1 ].z - points[ i ].z;
		const len = Math.sqrt( dx * dx + dz * dz );
		segLengths.push( len );
		totalLength += len;

	}

	const segTStart = [ 0 ];
	let cumulative = 0;
	for ( let i = 0; i < segLengths.length - 1; i ++ ) {

		cumulative += segLengths[ i ] / totalLength;
		segTStart.push( cumulative );

	}

	segTStart.push( 1.0 );

	return { points, segLengths, segTStart, totalLength };

}

/** t における水平位置。 */
export function getXZAt( t, seg ) {

	const { points, segTStart } = seg;
	let lo = 0, hi = segTStart.length - 2;
	while ( lo < hi ) {

		const mid = ( lo + hi + 1 ) >> 1;
		if ( segTStart[ mid ] <= t ) lo = mid;
		else hi = mid - 1;

	}

	const i = lo;
	const tSeg = ( t - segTStart[ i ] ) / ( segTStart[ i + 1 ] - segTStart[ i ] );
	return {
		x: points[ i ].x + ( points[ i + 1 ].x - points[ i ].x ) * tSeg,
		z: points[ i ].z + ( points[ i + 1 ].z - points[ i ].z ) * tSeg
	};

}

const DELTA = 0.0001;

/**
 * RollerCoaster.js のジオメトリクラスが要求するインターフェース
 * （getPointAt / getTangentAt）を持つ曲線。
 * 戻り値のベクトルは使い回すので、呼び出し側は copy して使うこと。
 */
export class TrackCurve {

	/**
	 * @param stations 駅の配列（lon, lat を持つ）
	 * @param series   レールの高さに使う系列（移動平均後）
	 */
	constructor( stations, series ) {

		this.seg = buildStationSegments( stations );
		this.series = series;
		const { min, max } = closeRange( series );
		this.closeMin = min;
		this.closeMax = max;

		this._point = new Vector3();
		this._tangent = new Vector3();

	}

	/** 終値 → レールの高さ（ワールド座標の y）。 */
	valueToY( close ) {

		return Y_MIN + ( close - this.closeMin ) / ( this.closeMax - this.closeMin ) * ( Y_MAX - Y_MIN );

	}

	getXZAt( t ) {

		return getXZAt( t, this.seg );

	}

	getYAt( t ) {

		return this.valueToY( interpolateClose( this.series, t ) );

	}

	getPointAt( t ) {

		t = t % 1;
		if ( t < 0 ) t += 1;

		const { x, z } = getXZAt( t, this.seg );
		return this._point.set( x, this.getYAt( t ), z );

	}

	/** 水平方向の単位接線（y 成分は 0）。 */
	getTangentAt( t ) {

		const t1 = ( t - DELTA + 1 ) % 1;
		const t2 = ( t + DELTA ) % 1;
		const a = getXZAt( t1, this.seg );
		const b = getXZAt( t2, this.seg );
		return this._tangent.set( b.x - a.x, 0, b.z - a.z ).normalize();

	}

	/** 高さの勾配 dy/dt（速度の計算に使う）。 */
	getHeightGradientAt( t ) {

		const t1 = ( t - DELTA + 1 ) % 1;
		const t2 = ( t + DELTA ) % 1;
		return ( this.getYAt( t2 ) - this.getYAt( t1 ) ) / ( 2 * DELTA );

	}

}
