// 連絡区間（最新の週の高さ → 1990 年 1 月の高さ）の確かめ。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrackCurve } from '../assets/js/track.js';
import { buildDataset } from '../assets/js/data.js';
import { LOOP } from '../assets/js/config.js';
import { hermite, linkEndSlopes } from '../assets/js/loop.js';
import { loadFixtures } from './helpers.js';

const { nikkei, stations } = loadFixtures();
const sample = buildDataset( nikkei ).smoothed;

/** 段差の大きい仮のデータ：1990 年 1 月 38,000 円、最小 7,000 円、最大 72,000 円、最新 61,000 円（最新週の変化は引数）。 */
function steepSeries( lastStep = - 600, firstStep = 400 ) {

	const keys = [ [ 0, 38000 ], [ 600, 22000 ], [ 900, 7000 ], [ 1500, 72000 ], [ 1920, 61000 ] ];
	const n = 1923;
	const closes = [];
	for ( let i = 0; i < n; i ++ ) {

		let k = 0;
		while ( k < keys.length - 2 && i > keys[ k + 1 ][ 0 ] ) k ++;
		const [ i0, v0 ] = keys[ k ];
		const [ i1, v1 ] = keys[ k + 1 ];
		const f = Math.min( 1, ( i - i0 ) / ( i1 - i0 ) );
		closes.push( v0 + ( v1 - v0 ) * f + 800 * Math.sin( i * 1.7 ) );

	}

	closes[ 0 ] = 38000;
	closes[ 1 ] = 38000 + firstStep;
	closes[ 900 ] = 7000;
	closes[ 1500 ] = 72000;
	closes[ n - 1 ] = 61000;
	closes[ n - 2 ] = 61000 - lastStep;
	return closes.map( ( close, i ) => ( { date: `d${i}`, close } ) );

}

const cases = [
	[ 'サンプルデータ', sample ],
	[ '段差の大きい仮のデータ（最新週 -600）', steepSeries( - 600 ) ],
	[ '段差の大きい仮のデータ（最新週 +600）', steepSeries( 600 ) ],
	[ '段差の大きい仮のデータ（最新週 +1500、最初は下り）', steepSeries( 1500, - 500 ) ]
];

const link = ( series ) => new TrackCurve( stations, series, { linkFraction: 0.03 } );
const linkSamples = ( curve, count = 400 ) => Array.from( { length: count + 1 }, ( _, i ) => curve.dataEnd + curve.linkFraction * i / count );

test( 'LOOP.linkFraction は 0.03、連絡区間は品川→大崎の 1 辺（最後の区間）の内側に収まる', () => {

	assert.equal( LOOP.linkFraction, 0.03 );
	const curve = link( sample );
	const last = curve.seg.segTStart.at( - 2 );
	assert.ok( curve.dataEnd >= last, `dataEnd=${curve.dataEnd} lastSegStart=${last}` );

} );

for ( const [ name, series ] of cases ) {

	test( `${name}：t = dataEnd と t = 1（= 0）で高さが連続している`, () => {

		const curve = link( series );
		const first = curve.valueToY( series[ 0 ].close );
		const last = curve.valueToY( series.at( - 1 ).close );
		assert.ok( Math.abs( curve.getYAt( curve.dataEnd ) - last ) < 1e-9 );
		assert.ok( Math.abs( curve.getYAt( curve.dataEnd + 1e-9 ) - last ) < 1e-6 );
		assert.ok( Math.abs( curve.getYAt( 1 ) - first ) < 1e-9 );
		assert.ok( Math.abs( curve.getYAt( 1 - 1e-9 ) - first ) < 1e-6 );
		assert.ok( Math.abs( curve.getYAt( 0 ) - first ) < 1e-9 );
		// getPointAt は t = 1 を 0 に折り返す。つなぎ目の前後で点が飛ばない
		const a = curve.getPointAt( 1 - 1e-7 ).clone();
		const b = curve.getPointAt( 0 ).clone();
		assert.ok( a.distanceTo( b ) < 1e-3, `distance=${a.distanceTo( b )}` );
		const c = curve.getPointAt( curve.dataEnd ).clone();
		const d = curve.getPointAt( curve.dataEnd + 1e-7 ).clone();
		assert.ok( c.distanceTo( d ) < 1e-3 );

	} );

	test( `${name}：連絡区間の高さは単調で、両端の高さの間に収まる`, () => {

		const curve = link( series );
		const y0 = curve.getYAt( curve.dataEnd );
		const y1 = curve.getYAt( 1 );
		const lo = Math.min( y0, y1 ) - 1e-9;
		const hi = Math.max( y0, y1 ) + 1e-9;
		const sign = Math.sign( y1 - y0 );
		let prev = y0;
		for ( const t of linkSamples( curve ) ) {

			const y = curve.getYAt( t );
			assert.ok( y >= lo && y <= hi, `t=${t} y=${y} [${lo}, ${hi}]` );
			assert.ok( ( y - prev ) * sign >= - 1e-9, `単調でない t=${t}` );
			prev = y;

		}

	} );

	test( `${name}：解析的な勾配は、高さの差分と一致する`, () => {

		const curve = link( series );
		const h = 1e-6;
		for ( const s of [ 0.05, 0.3, 0.5, 0.8, 0.95 ] ) {

			const t = curve.dataEnd + curve.linkFraction * s;
			const numeric = ( curve.getYAt( t + h ) - curve.getYAt( t - h ) ) / ( 2 * h );
			const analytic = curve.getHeightGradientAt( t );
			assert.ok( Math.abs( numeric - analytic ) < 1e-3 * Math.max( 1, Math.abs( analytic ) ), `s=${s} ${numeric} vs ${analytic}` );

		}

	} );

	test( `${name}：t = 0 と t = dataEnd の近くで getHeightGradientAt が飛ばない`, () => {

		const curve = link( series );
		const n = series.length;
		const perIndex = ( n - 1 ) / curve.dataEnd;
		const y = ( i ) => curve.valueToY( series[ i ].close );
		const firstSlope = ( y( 1 ) - y( 0 ) ) * perIndex;
		const lastSlope = ( y( n - 1 ) - y( n - 2 ) ) * perIndex;
		const e = 1e-6;
		// 端は、データ区間の最初・最後の線分の勾配に一致する（つなぎ目の向こう側の高さが混ざらない）
		assert.ok( Math.abs( curve.getHeightGradientAt( 0 ) - firstSlope ) < 1e-6 * Math.abs( firstSlope ) + 1e-6, `t=0 ${curve.getHeightGradientAt( 0 )} vs ${firstSlope}` );
		assert.ok( Math.abs( curve.getHeightGradientAt( e ) - firstSlope ) < 1e-6 * Math.abs( firstSlope ) + 1e-6 );
		assert.ok( Math.abs( curve.getHeightGradientAt( curve.dataEnd ) - lastSlope ) < 1e-6 * Math.abs( lastSlope ) + 1e-6, `t=dataEnd ${curve.getHeightGradientAt( curve.dataEnd )} vs ${lastSlope}` );
		assert.ok( Math.abs( curve.getHeightGradientAt( curve.dataEnd - e ) - lastSlope ) < 1e-6 * Math.abs( lastSlope ) + 1e-6 );
		// 端の近くを細かく走査しても、隣り合う点の差が線分の勾配の差（週ごとの変化）を超えない
		const range = Math.max( ...series.map( d => d.close ) ) - Math.min( ...series.map( d => d.close ) );
		const maxSegmentJump = 2 * ( 32 / range ) * range * 0.2 * perIndex; // 十分ゆるい上限（1 週で値幅の 20% 動く）
		for ( const base of [ 0, curve.dataEnd - 4e-4 ] ) {

			let prev = curve.getHeightGradientAt( base );
			for ( let i = 1; i <= 400; i ++ ) {

				const g = curve.getHeightGradientAt( base + i * 1e-6 );
				assert.ok( Math.abs( g - prev ) < maxSegmentJump, `base=${base} i=${i}` );
				prev = g;

			}

		}

	} );

}

test( '段差の大きい仮のデータ：連絡区間の最大の傾斜は 45° 以下', () => {

	for ( const [ name, series ] of cases.slice( 1 ) ) {

		const curve = link( series );
		const run = curve.seg.totalLength * curve.linkFraction; // 連絡区間の水平距離
		let maxSlope = 0;
		// t = dataEnd ちょうどはデータ側の片側勾配なので、連絡区間の内側（開区間）だけを見る
		for ( const t of linkSamples( curve, 2000 ).slice( 1 ) ) maxSlope = Math.max( maxSlope, Math.abs( curve.getHeightGradientAt( t ) ) / curve.seg.totalLength );
		const deg = Math.atan( maxSlope ) * 180 / Math.PI;
		const rise = Math.abs( curve.getYAt( curve.dataEnd ) - curve.getYAt( 1 ) );
		assert.ok( deg <= 45, `${name}: ${deg.toFixed( 1 )}° (rise=${rise.toFixed( 2 )}, run=${run.toFixed( 2 )})` );

	}

} );

test( 'linkEndSlopes：データ側の勾配が連絡区間の向きと同じなら使い（1.5|δ| で頭打ち）、逆なら 0', () => {

	const h = 0.03;
	const delta = ( 20 - 10 ) / h;
	assert.deepEqual( linkEndSlopes( { y0: 10, y1: 20, m0Data: 50, m1Data: 60, h } ), { m0: 50, m1: 60 } );
	assert.deepEqual( linkEndSlopes( { y0: 10, y1: 20, m0Data: - 50, m1Data: - 60, h } ), { m0: 0, m1: 0 } );
	const capped = linkEndSlopes( { y0: 10, y1: 20, m0Data: 1e6, m1Data: 1e6, h } );
	assert.ok( Math.abs( capped.m0 - 1.5 * delta ) < 1e-9 && Math.abs( capped.m1 - 1.5 * delta ) < 1e-9 );
	const down = linkEndSlopes( { y0: 20, y1: 10, m0Data: - 1e6, m1Data: 5, h } );
	assert.ok( Math.abs( down.m0 + 1.5 * delta ) < 1e-9 && down.m1 === 0 );

	const { y } = hermite( 10, 0, 20, 0, h, 0.5 );
	assert.ok( Math.abs( y - 15 ) < 1e-12 );

} );

test( 'progressToIndex / indexToProgress：データ区間で往復し、連絡区間では null', () => {

	const curve = link( sample );
	const n = sample.length;
	for ( const u of [ 0, 1, 100.5, 999, n - 2, n - 1 ] ) {

		assert.ok( Math.abs( curve.progressToIndex( curve.indexToProgress( u ) ) - u ) < 1e-9, `u=${u}` );

	}

	assert.ok( Math.abs( curve.indexToProgress( n - 1 ) - curve.dataEnd ) < 1e-12 );
	for ( const t of [ 0.9701, 0.98, 0.99, 0.9999, 1 ] ) {

		assert.equal( curve.isLink( t ), true, `t=${t}` );
		assert.equal( curve.progressToIndex( t ), null, `t=${t}` );

	}

	assert.equal( curve.isLink( curve.dataEnd ), false );
	assert.equal( curve.isLink( 0 ), false );

} );

test( 'linkFraction が 0 のときは、従来と同じ高さ（系列を線形補間しただけ）で、連絡区間がない', () => {

	const curve = new TrackCurve( stations, sample, { linkFraction: 0 } );
	assert.equal( curve.link, null );
	assert.equal( curve.dataEnd, 1 );
	const n = sample.length;
	for ( const t of [ 0, 0.1, 0.25, 0.5, 0.731, 0.97, 0.99, 0.9999, 1 ] ) {

		const u = t * ( n - 1 );
		const i0 = Math.min( n - 1, Math.floor( u ) );
		const i1 = Math.min( n - 1, i0 + 1 );
		const expected = curve.valueToY( sample[ i0 ].close * ( 1 - ( u - i0 ) ) + sample[ i1 ].close * ( u - i0 ) );
		assert.ok( Math.abs( curve.getYAt( t ) - expected ) < 1e-9, `t=${t}` );
		assert.equal( curve.isLink( t ), false );

	}

	// 端の勾配は有限（つなぎ目をまたがない）
	for ( const t of [ 0, 1e-6, 0.5, 1 - 1e-6, 1 ] ) assert.ok( Number.isFinite( curve.getHeightGradientAt( t ) ), `t=${t}` );

} );

test( 'データ区間の高さは、連絡区間があってもなくても系列どおり（添字で比べる）', () => {

	const withLink = link( sample );
	const without = new TrackCurve( stations, sample, { linkFraction: 0 } );
	const n = sample.length;
	for ( const u of [ 0, 3.5, 500, 1234.25, n - 2.5, n - 1 ] ) {

		const a = withLink.getYAt( withLink.indexToProgress( u ) );
		const b = without.getYAt( without.indexToProgress( u ) );
		assert.ok( Math.abs( a - b ) < 1e-9, `u=${u}` );

	}

} );
