// 山手線の経路（水平）と日経平均（高さ）から、ジェットコースターのレール曲線を作る。
//
// t（0..1）は「山手線を 1 周した距離の割合」であり、同時に「データ系列の位置」でもある。
// three.js のレンダラには依存しないので、Node からもそのまま読み込める。
// （Vector3 だけは three.core.js から相対パスで読む。ブラウザの importmap が指す
//  three.module.js は three.core.js を再エクスポートしているので、同じクラスになる。）

import { Vector3 } from './three.core.js';
import { GEO_CENTER, GEO_SCALE, Y_MIN, Y_MAX, LOOP } from './config.js';
import { closeRange, interpolateClose } from './data.js';
import { progressToIndex, indexToProgress, hermite, linkEndSlopes } from './loop.js';

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
	 * @param options  { linkFraction }：周回の最後に置く連絡区間の割合（既定は LOOP.linkFraction）
	 */
	constructor( stations, series, { linkFraction = LOOP.linkFraction } = {} ) {

		this.seg = buildStationSegments( stations );
		this.series = series;
		/** 連絡区間の割合。0 のあいだは連絡区間なし。 */
		this.linkFraction = linkFraction;
		/** データ区間の終わり（progress）。0 .. dataEnd が系列の全体に対応する。 */
		this.dataEnd = 1 - linkFraction;
		const { min, max } = closeRange( series );
		this.closeMin = min;
		this.closeMax = max;

		this._point = new Vector3();
		this._tangent = new Vector3();

		/** 連絡区間の高さ（エルミート補間）の両端の値と勾配。連絡区間がなければ null。 */
		this.link = linkFraction > 0 && series.length >= 2 ? this._buildLink() : null;

	}

	/** 最新の週の高さ → 1990 年 1 月の高さ。両端の勾配はデータ側の片側勾配に単調制限をかけたもの。 */
	_buildLink() {

		const n = this.series.length;
		const y = ( i ) => this.valueToY( this.series[ i ].close );
		const perIndex = ( n - 1 ) / this.dataEnd; // 添字 1 つ分の高さ変化を dy/dt に換算する係数
		const y0 = y( n - 1 );
		const y1 = y( 0 );
		const m0Data = ( y( n - 1 ) - y( n - 2 ) ) * perIndex;
		const m1Data = ( y( 1 ) - y( 0 ) ) * perIndex;
		const h = this.linkFraction;
		// 水平距離 1（周長に対する progress 1 分）あたりの高さの変化が tan( maxLinkPitchDeg ) になる勾配
		const maxSlope = Math.tan( LOOP.maxLinkPitchDeg * Math.PI / 180 ) * this.seg.totalLength;
		return { y0, y1, h, ...linkEndSlopes( { y0, y1, m0Data, m1Data, h, maxSlope } ) };

	}

	/** 終値 → レールの高さ（ワールド座標の y）。 */
	valueToY( close ) {

		return Y_MIN + ( close - this.closeMin ) / ( this.closeMax - this.closeMin ) * ( Y_MAX - Y_MIN );

	}

	getXZAt( t ) {

		return getXZAt( t, this.seg );

	}

	/** t が連絡区間（dataEnd より先）か。 */
	isLink( t ) {

		return t > this.dataEnd;

	}

	/** progress → 系列上の位置（小数）。データ区間だけ。連絡区間では null。 */
	progressToIndex( t ) {

		return progressToIndex( t, this.series.length, this.linkFraction );

	}

	/** 系列上の位置（小数）→ progress。 */
	indexToProgress( u ) {

		return indexToProgress( u, this.series.length, this.linkFraction );

	}

	getYAt( t ) {

		if ( this.isLink( t ) && this.link ) {

			// 連絡区間：最新の週の高さから 1990 年 1 月の高さへ、3 次エルミートで滑らかに戻る。
			const { y0, m0, y1, m1, h } = this.link;
			const s = Math.min( 1, ( t - this.dataEnd ) / h );
			return hermite( y0, m0, y1, m1, h, s ).y;

		}

		return this.valueToY( interpolateClose( this.series, t, this.linkFraction ) );

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

	/**
	 * 高さの勾配 dy/dt（速度の計算に使う）。
	 * データ区間は ±DELTA の差分で、端（t = 0 と t = dataEnd）ではデータ区間の内側へ寄せた片側差分にする
	 * （つなぎ目をまたぐと、反対側の高さが混ざって勾配が飛ぶため）。連絡区間は解析的な勾配。
	 */
	getHeightGradientAt( t ) {

		if ( t < 0 || t > 1 ) {

			t = t % 1;
			if ( t < 0 ) t += 1;

		}

		if ( this.link && t > this.dataEnd ) {

			const { y0, m0, y1, m1, h } = this.link;
			return hermite( y0, m0, y1, m1, h, ( t - this.dataEnd ) / h ).dy;

		}

		const t1 = Math.max( 0, t - DELTA );
		const t2 = Math.min( this.dataEnd, t + DELTA );
		if ( t2 <= t1 ) return 0;
		return ( this.getYAt( t2 ) - this.getYAt( t1 ) ) / ( t2 - t1 );

	}

}
