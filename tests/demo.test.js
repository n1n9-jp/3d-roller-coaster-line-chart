// スタート画面のデモ走行の区間の選び方（demo.js）。同梱の 2 種類のデータと、手元にあれば日経平均で確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chooseDemoRange, demoStillProgress, DEMO } from '../assets/js/demo.js';
import { TrackCurve } from '../assets/js/track.js';
import { buildDataset } from '../assets/js/data.js';
import { DATASETS, MOVING_AVERAGE_WINDOW } from '../assets/js/config.js';
import { loadFixtures, readJson } from './helpers.js';

const fixtures = loadFixtures();
const sources = [
	[ 'usdjpy', fixtures.usdjpy ],
	[ 'jgb10', fixtures.jgb10 ]
];
// 日経平均は同梱しない（手元で取得したときだけ確かめる）
if ( existsSync( new URL( '../data/local/nikkei225.json', import.meta.url ) ) ) sources.push( [ 'nikkei', readJson( 'data/local/nikkei225.json' ) ] );

function curveOf( id, series ) {

	return new TrackCurve( buildDataset( series, MOVING_AVERAGE_WINDOW, undefined, DATASETS[ id ] ).smoothed );

}

/** 区間の中の最大の勾配（水平の長さあたり。前後 DEMO.slopeHalfLength の弦）。demo.js とは別に、細かく標本化して測る。 */
function maxSlopeIn( curve, from, to, samples = 2000 ) {

	let max = 0;
	for ( let i = 0; i <= samples; i ++ ) {

		const t = from + ( to - from ) * i / samples;
		const per = curve.lengthPerProgressAt( t );
		const h = DEMO.slopeHalfLength / per;
		const t1 = Math.max( 0, t - h ), t2 = Math.min( 1, t + h );
		max = Math.max( max, Math.abs( curve.getYAt( t2 ) - curve.getYAt( t1 ) ) / ( ( t2 - t1 ) * per ) );

	}

	return max;

}

for ( const [ id, series ] of sources ) {

	const curve = curveOf( id, series );
	const range = chooseDemoRange( curve );

	test( `${id}：区間はデータの範囲内（両端から離す）で、長さは約 ${DEMO.years} 年`, () => {

		assert.ok( range.from > 0 && range.to < 1 && range.from < range.to, JSON.stringify( range ) );
		const edge = DEMO.edgeYears / curve.years;
		assert.ok( range.from >= edge - 1e-9 && range.to <= 1 - edge + 1e-9 );
		assert.ok( Math.abs( ( range.toYear - range.fromYear ) - DEMO.years ) < 0.05, `${range.fromYear}〜${range.toYear}` );

	} );

	test( `${id}：急すぎる区間を避ける（区間の中の勾配が上限以下）`, () => {

		assert.ok( range.maxSlope <= DEMO.maxSlope );
		// 別に細かく測っても、上限をほとんど超えない（標本の間隔の分だけの差）
		assert.ok( maxSlopeIn( curve, range.from, range.to ) <= DEMO.maxSlope * 1.05 );

	} );

	test( `${id}：上げ下げの合計は、上限を満たす窓の中で最大（上限なしで選ぶ窓の合計以下）`, () => {

		const free = chooseDemoRange( curve, { maxSlope: Infinity } );
		assert.ok( range.variation > 0 );
		assert.ok( range.variation <= free.variation + 1e-9 );
		// 平らな窓（最小）より十分大きい
		const flat = chooseDemoRange( curve, { maxSlope: 0 } );
		assert.ok( range.variation >= flat.variation );

	} );

	test( `${id}：止めて見せる位置は区間の中`, () => {

		const still = demoStillProgress( range );
		assert.ok( still > range.from && still < range.to );

	} );

}

test( '国債金利：1987 年（急な区間）は選ばない', () => {

	const curve = curveOf( 'jgb10', fixtures.jgb10 );
	const range = chooseDemoRange( curve );
	assert.ok( range.fromYear > 1988 || range.toYear < 1987, `${range.fromYear}〜${range.toYear}` );
	// 上限がなければ、その急な区間を含む窓が選ばれる（上限が効いている）
	const free = chooseDemoRange( curve, { maxSlope: Infinity } );
	assert.ok( free.fromYear < 1988 && free.toYear > 1987, `${free.fromYear}〜${free.toYear}` );

} );

test( '上限を満たす窓がないときは、最大勾配がいちばん小さい窓にする', () => {

	const curve = curveOf( 'usdjpy', fixtures.usdjpy );
	const range = chooseDemoRange( curve, { maxSlope: - 1 } );
	assert.ok( range.from >= 0 && range.to <= 1 && range.to > range.from );
	// どの窓の最大勾配よりも大きくない（いくつかの窓と比べる）
	const span = range.to - range.from;
	for ( const from of [ 0.05, 0.25, 0.45, 0.65 ] ) {

		assert.ok( range.maxSlope <= maxSlopeIn( curve, from, from + span, 400 ) * 1.05 + 1e-9, `from=${from}` );

	}

} );
