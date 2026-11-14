import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	yAxis, labelStep, labelIndices, formatYenTick, yearTicks, nearestStationIndex, formatYearMonth, formatYen
} from '../assets/js/hud/scales.js';
import { riddenEnd } from '../assets/js/hud/map.js';
import { buildDataset } from '../assets/js/data.js';
import { buildStationSegments, getXZAt } from '../assets/js/track.js';
import { loadFixtures } from './helpers.js';

const { nikkei, stations } = loadFixtures();

test( 'Y 軸：上限は最高値を 1 万円単位で切り上げた値（41,701 → 5 万、71,250 → 8 万）', () => {

	assert.equal( yAxis( 41701 ).top, 50000 );
	assert.equal( yAxis( 41701 ).count, 5 );
	assert.equal( yAxis( 71250 ).top, 80000 );
	assert.equal( yAxis( 71250 ).count, 8 );
	// ちょうど 1 万円の倍数ならそのまま
	assert.equal( yAxis( 40000 ).top, 40000 );
	assert.equal( yAxis( 40000.5 ).top, 50000 );

} );

test( 'Y 軸：目盛りは 0 から上限まで 1 万円ごと', () => {

	assert.deepEqual( yAxis( 41701 ).ticks, [ 0, 10000, 20000, 30000, 40000, 50000 ] );
	assert.equal( yAxis( 71250 ).ticks.length, 9 );
	assert.equal( yAxis( 71250 ).ticks.at( - 1 ), 80000 );

} );

test( 'Y 軸：同梱のサンプルは上限 5 万', () => {

	const max = Math.max( ...nikkei.map( d => d.close ) );
	assert.equal( yAxis( max ).top, 50000 );

} );

test( 'ラベルの間引き：グリッド線が 6 本を超えるとき（実データの 8 本）は 2 万円ごと、サンプルの 5 本は 1 万円ごと', () => {

	// 描画域が十分に高い（デスクトップ）
	assert.equal( labelStep( 5, 114 ), 1 );
	assert.equal( labelStep( 6, 114 ), 1 );
	assert.equal( labelStep( 8, 114 ), 2 );

} );

test( 'ラベルの間引き：描画域が低いときも間引く（モバイル）', () => {

	// モバイルの描画域は約 68px：サンプル 5 本は 13.6px ごとで文字が重なるので 2 万円ごと
	assert.equal( labelStep( 5, 68 ), 2 );
	// 実データ 8 本は 8.5px ごと。2 万円ごとなら 17px で足りる
	assert.equal( labelStep( 8, 68 ), 2 );
	// 短い横長の描画域（約 46px）では、2 万円ごとでも足りないので、さらに間引く
	assert.ok( labelStep( 8, 46 ) > 2 );
	assert.ok( labelStep( 5, 46 ) >= 2 );

} );

test( 'ラベルの間引き：選ばれた間隔のラベル間隔は、必ず最小の間隔以上になる（間引ける限り）', () => {

	for ( const count of [ 3, 5, 8, 12 ] ) {

		for ( const plotHeight of [ 46, 68, 92, 114, 200 ] ) {

			const step = labelStep( count, plotHeight );
			assert.ok( plotHeight / count * step >= 16 || step >= count, `count ${count}, height ${plotHeight}, step ${step}` );

		}

	}

} );

test( 'ラベルの番号：0 と step の倍数。表記は「0」「2万」…', () => {

	assert.deepEqual( labelIndices( 8, 2 ), [ 0, 2, 4, 6, 8 ] );
	assert.deepEqual( labelIndices( 5, 1 ), [ 0, 1, 2, 3, 4, 5 ] );
	assert.deepEqual( labelIndices( 5, 2 ), [ 0, 2, 4 ] );
	assert.equal( formatYenTick( 0 ), '0' );
	assert.equal( formatYenTick( 10000 ), '1万' );
	assert.equal( formatYenTick( 80000 ), '8万' );

} );

const week = ( date, close = 1 ) => ( { date, close } );

test( '年の目盛り：10 年ごと。同梱のサンプルは 1990・2000・2010・2020', () => {

	const dataset = buildDataset( nikkei );
	const ticks = yearTicks( dataset );
	assert.deepEqual( ticks.map( t => t.year ), [ 1990, 2000, 2010, 2020 ] );
	assert.equal( ticks[ 0 ].index, 0 );
	for ( const { year, index } of ticks ) {

		// 位置は、その年の最初の週のあたり（週次なので 1 週のずれまで）
		const date = nikkei[ Math.round( index ) ].date;
		assert.ok( Math.abs( Date.parse( date ) - Date.parse( `${year}-01-01` ) ) <= 7 * 86400000, `${year}: ${date}` );

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

test( '現在位置に最も近い駅：各駅の位置では、その駅', () => {

	const { points, segTStart } = buildStationSegments( stations );
	const stationPoints = points.slice( 0, stations.length );
	stations.forEach( ( station, i ) => {

		const p = stationPoints[ i ];
		assert.equal( nearestStationIndex( stationPoints, p.x, p.z ), i, station.station_name );

	} );

	// 走行の位置（progress）でも：出発は大崎、新宿の区間の始まりは新宿
	const seg = { points, segTStart };
	const at = ( t ) => getXZAt( t, seg );
	assert.equal( stations[ nearestStationIndex( stationPoints, at( 0 ).x, at( 0 ).z ) ].station_name, '大崎' );
	const shinjuku = stations.findIndex( s => s.station_name === '新宿' );
	const p = at( segTStart[ shinjuku ] + 0.0001 );
	assert.equal( nearestStationIndex( stationPoints, p.x, p.z ), shinjuku );

} );

test( '現在位置に最も近い駅：2 駅の間は近い方。空なら -1', () => {

	const pts = [ { x: 0, z: 0 }, { x: 10, z: 0 } ];
	assert.equal( nearestStationIndex( pts, 4, 3 ), 0 );
	assert.equal( nearestStationIndex( pts, 6, - 3 ), 1 );
	assert.equal( nearestStationIndex( [], 0, 0 ), - 1 );

} );

test( '表記：年月と値', () => {

	assert.equal( formatYearMonth( '2025-12-29' ), '2025年12月' );
	assert.equal( formatYearMonth( '1990-01-08' ), '1990年1月' );
	assert.equal( formatYen( 12214.4 ), '12,214' );
	assert.equal( formatYen( 38791 ), '38,791' );

} );

test( '路線図：走行済みの弧の終わり。走行中は現在位置、一周して止まったときはデータ区間の終わり（連絡区間は含めない）', () => {

	const dataEnd = 0.97;
	assert.equal( riddenEnd( 0.4, false, dataEnd ), 0.4 );
	assert.equal( riddenEnd( 0.9695, false, dataEnd ), 0.9695 );
	assert.equal( riddenEnd( 0.97, true, dataEnd ), dataEnd );
	assert.equal( riddenEnd( 1, true, dataEnd ), dataEnd ); // 進行位置が連絡区間にあっても、データ区間の終わりまで
	assert.equal( riddenEnd( - 0.1, false, dataEnd ), 0 );
	assert.equal( riddenEnd( 1.2, false, dataEnd ), 1 );
	assert.equal( riddenEnd( 0.5, true ), 1 ); // 連絡区間がない（dataEnd 省略）なら全周

} );
