import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yAxis, labelStride, labelValues, yearTicks } from '../assets/js/hud/scales.js';
import { createFormatter } from '../assets/js/format.js';
import { DATASETS } from '../assets/js/config.js';
import { riddenEnd, yearAt } from '../assets/js/hud/map.js';
import { buildDataset } from '../assets/js/data.js';
import { TrackCurve } from '../assets/js/track.js';
import { loadFixtures } from './helpers.js';

const { usdjpy, jgb10 } = loadFixtures();
const rangeOf = ( series ) => {

	const closes = series.map( d => d.close );
	return { min: Math.min( ...closes ), max: Math.max( ...closes ) };

};

const usd = createFormatter( DATASETS.usdjpy );
const jgb = createFormatter( DATASETS.jgb10 );
const nik = createFormatter( DATASETS.nikkei );

test( 'Y 軸（ドル円）：同梱データは 50〜400 円、50 円ごとの 7 本の線と下端、基線は下端', () => {

	const axis = yAxis( usd, rangeOf( usdjpy ) );
	assert.equal( axis.min, 50 );
	assert.equal( axis.max, 400 );
	assert.equal( axis.span, 350 );
	assert.equal( axis.count, 7 );
	assert.deepEqual( axis.values, [ 50, 100, 150, 200, 250, 300, 350, 400 ] );
	assert.equal( axis.baseValue, 50 ); // 0 は範囲にないので、下端の線

} );

test( 'Y 軸（金利）：同梱データは −1〜9%。0 が範囲にあるので、基線は 0 の線（その下にマイナスの区間）', () => {

	const axis = yAxis( jgb, rangeOf( jgb10 ) );
	assert.equal( axis.min, - 1 );
	assert.equal( axis.max, 9 );
	assert.equal( axis.count, 10 );
	assert.equal( axis.baseValue, 0 );
	assert.ok( axis.values.includes( 0 ) );
	// マイナスの値の位置は、基線（0）より下
	const yAt = ( v ) => ( v - axis.min ) / axis.span; // 下端が 0、上端が 1
	assert.ok( yAt( - 0.293 ) < yAt( axis.baseValue ) );
	assert.ok( yAt( - 0.293 ) > 0 );

} );

test( 'Y 軸（日経平均）：0〜8 万円（今までの見た目のまま）。基線は 0', () => {

	const axis = yAxis( nik, { min: 7055, max: 72366 } );
	assert.equal( axis.min, 0 );
	assert.equal( axis.max, 80000 );
	assert.equal( axis.count, 8 );
	assert.equal( axis.baseValue, 0 );

} );

test( 'ラベルの間引き：線が 7 本を超えるデータは 2 本おき、そうでなければ 1 本おき（描画域が十分に高いとき）', () => {

	// 描画域が十分に高い（デスクトップ）
	assert.equal( labelStride( yAxis( nik, { min: 0, max: 50000 } ), 114 ), 1 ); // 6 本
	assert.equal( labelStride( yAxis( usd, rangeOf( usdjpy ) ), 114 ), 2 ); // 8 本
	assert.equal( labelStride( yAxis( jgb, rangeOf( jgb10 ) ), 114 ), 2 ); // 11 本
	assert.equal( labelStride( yAxis( nik, { min: 7055, max: 72366 } ), 114 ), 2 ); // 9 本

} );

test( 'ラベルの間引き：描画域が低いとき（モバイル、短い横長）は、足りるまでさらに間引く', () => {

	const axis = yAxis( jgb, rangeOf( jgb10 ) ); // 10 区間
	// モバイルの描画域は約 68px：区間あたり 6.8px。2 本おきでも 13.6px で足りないので 4 本おき
	assert.equal( labelStride( axis, 68 ), 4 );
	assert.equal( labelStride( axis, 114 ), 2 );
	assert.ok( labelStride( axis, 46 ) >= 4 );

} );

test( 'ラベルの間引き：選ばれたラベルの間隔は、必ず最小の間隔以上になる（間引ける限り）', () => {

	for ( const axis of [ yAxis( usd, rangeOf( usdjpy ) ), yAxis( jgb, rangeOf( jgb10 ) ), yAxis( nik, { min: 0, max: 80000 } ) ] ) {

		for ( const plotHeight of [ 46, 68, 92, 114, 200 ] ) {

			const stride = labelStride( axis, plotHeight );
			assert.ok( plotHeight / axis.count * stride >= 16 || stride >= axis.count, `count ${axis.count}, height ${plotHeight}, stride ${stride}` );

		}

	}

} );

test( 'ラベルの値：step × 間隔の倍数の線だけ（ドル円は 100・200・300・400、金利は 0・2・4・6・8）', () => {

	const u = yAxis( usd, rangeOf( usdjpy ) );
	assert.deepEqual( labelValues( u, labelStride( u, 114 ) ), [ 100, 200, 300, 400 ] );
	const j = yAxis( jgb, rangeOf( jgb10 ) );
	assert.deepEqual( labelValues( j, labelStride( j, 114 ) ), [ 0, 2, 4, 6, 8 ] );
	const n = yAxis( nik, { min: 7055, max: 72366 } );
	assert.deepEqual( labelValues( n, labelStride( n, 114 ) ), [ 0, 20000, 40000, 60000, 80000 ] );
	// 描画域が低いときは、さらに少ない
	assert.deepEqual( labelValues( j, labelStride( j, 68 ) ), [ 0, 4, 8 ] );

} );

const week = ( date, close = 1 ) => ( { date, close } );

test( '年の目盛り：10 年ごと。ドル円は 1980・1990・2000・2010・2020、金利は 1990・2000・2010・2020', () => {

	for ( const [ series, years ] of [ [ usdjpy, [ 1980, 1990, 2000, 2010, 2020 ] ], [ jgb10, [ 1990, 2000, 2010, 2020 ] ] ] ) {

		const ticks = yearTicks( buildDataset( series ) );
		assert.deepEqual( ticks.map( t => t.year ), years );
		for ( const { year, index } of ticks ) {

			// 位置は、その年の最初の週のあたり（週次なので 1 週のずれまで）
			const date = series[ Math.round( index ) ].date;
			assert.ok( Math.abs( Date.parse( date ) - Date.parse( `${year}-01-01` ) ) <= 7 * 86400000, `${year}: ${date}` );

		}

	}

} );

test( '年の目盛り：週が 1 つ抜けていても、位置は日付どおりになる', () => {

	// 1999-12-27 の次が 2000-01-10（2000-01-03 の週が抜けている）
	const raw = [ week( '1999-12-13' ), week( '1999-12-20' ), week( '1999-12-27' ), week( '2000-01-10' ), week( '2000-01-17' ) ];
	raw.unshift( week( '1990-01-01' ) ); // 1990 年の目盛りの確認用に、先頭を足す
	const ticks = yearTicks( buildDataset( raw ) );
	assert.deepEqual( ticks.map( t => t.year ), [ 1990, 2000 ] );
	assert.equal( ticks[ 0 ].index, 0 );
	// 2000-01-01 は 1999-12-27（index 3）と 2000-01-10（index 4）の間：5/14 日目
	assert.ok( Math.abs( ticks[ 1 ].index - ( 3 + 5 / 14 ) ) < 1e-9, `${ticks[ 1 ].index}` );

} );

test( '年の目盛り：系列より後の年は出さない。最初の年の途中から始まるときも、最初の年を左端に置く', () => {

	const raw = [ week( '1990-01-08' ), week( '1990-01-15' ), week( '2003-06-02' ) ];
	const ticks = yearTicks( buildDataset( raw ) );
	assert.deepEqual( ticks.map( t => t.year ), [ 1990, 2000 ] );
	assert.equal( ticks[ 0 ].index, 0 );
	assert.ok( ticks[ 1 ].index > 1 && ticks[ 1 ].index < 2 );
	assert.deepEqual( yearTicks( buildDataset( [] ) ), [] );

} );

test( '年の目盛り：実データの範囲（1990-01-01〜2026-11-09）は 2030 を含まない', () => {

	const raw = [ week( '1990-01-01' ), week( '2026-11-09' ) ];
	assert.deepEqual( yearTicks( buildDataset( raw ) ).map( t => t.year ), [ 1990, 2000, 2010, 2020 ] );

} );

test( '螺旋の図：走行済みの線の終わり。走行中は現在位置、走り終えたときは終点', () => {

	assert.equal( riddenEnd( 0.4, false ), 0.4 );
	assert.equal( riddenEnd( 0.9695, true ), 1 );
	assert.equal( riddenEnd( - 0.1, false ), 0 );
	assert.equal( riddenEnd( 1.2, false ), 1 );

} );

test( '螺旋の図：「いま：2008年」の年は、進行位置の日付の年', () => {

	const curve = new TrackCurve( usdjpy );
	assert.equal( yearAt( curve, 0 ), 1971 );
	assert.equal( yearAt( curve, 1 ), Number( usdjpy.at( - 1 ).date.slice( 0, 4 ) ) );
	assert.equal( yearAt( curve, curve.dateToProgress( '2008-06-30' ) ), 2008 );
	assert.equal( yearAt( curve, curve.dateToProgress( '2009-01-01' ) ), 2009 );
	assert.equal( yearAt( curve, 1.5 ), yearAt( curve, 1 ) );

} );
