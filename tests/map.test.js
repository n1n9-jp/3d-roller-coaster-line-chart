// 螺旋の図の、描画に依存しない計算（assets/js/hud/map.js）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	spiralSamples, fitSpiral, mapMetrics, decadeLabels, riddenSampleCount, riddenEnd, nowText, mapAriaLabel, EDGE_INSET, SPOKE_OVERSHOOT
} from '../assets/js/hud/map.js';
import { TrackCurve } from '../assets/js/track.js';
import { SPIRAL } from '../assets/js/config.js';
import { loadFixtures, readJson, stretchedSeries } from './helpers.js';

const { usdjpy: nikkei } = loadFixtures();

// 周の数の違う 3 通り（約 5.6 周 = 1971 年〜、約 4 周 = 1986 年〜、約 3.7 周 = 1990 年〜）と、手元の日経平均と同じ形
const CASES = {
	'ドル円 5.6周': new TrackCurve( readJson( 'data/usdjpy.json' ) ),
	'金利 4周': new TrackCurve( stretchedSeries( nikkei, '1986-07-07', '2026-11-09' ) ),
	'日経平均 3.7周': new TrackCurve( stretchedSeries( nikkei, '1990-01-01', '2026-11-09' ) )
};

// パネルの canvas の大きさ（CSS px）：L 190、M 158、S 106、短い横長 94（hud.css の幅 - 枠 - 余白）
const SIZES = { L: 190, M: 158, S: 106, 短い横長: 94 };

test( '周の数：3 通りの系列はそれぞれ約 5.6・4・3.7 周', () => {

	assert.ok( Math.abs( CASES[ 'ドル円 5.6周' ].turns - 5.6 ) < 0.1 );
	assert.ok( Math.abs( CASES[ '金利 4周' ].turns - 4.0 ) < 0.1 );
	assert.ok( Math.abs( CASES[ '日経平均 3.7周' ].turns - 3.7 ) < 0.1 );

} );

test( '螺旋の標本：弧長で等間隔、始点は内側の端、終点は外側の端', () => {

	for ( const [ name, curve ] of Object.entries( CASES ) ) {

		const { points, count } = spiralSamples( curve );
		assert.equal( points.length, count + 1, name );
		assert.ok( count >= curve.turns * 90, `${name}: 1 周あたりの点が少ない` );
		const dist = [];
		for ( let i = 1; i < points.length; i ++ ) dist.push( Math.hypot( points[ i ].x - points[ i - 1 ].x, points[ i ].z - points[ i - 1 ].z ) );
		const mean = dist.reduce( ( a, b ) => a + b, 0 ) / dist.length;
		for ( const d of dist ) assert.ok( Math.abs( d - mean ) / mean < 0.02, `${name}: 点の間隔が不揃い` );
		assert.ok( Math.abs( Math.hypot( points[ 0 ].x, points[ 0 ].z ) - SPIRAL.innerRadius ) < 1e-6, name );
		assert.ok( Math.abs( Math.hypot( points.at( - 1 ).x, points.at( - 1 ).z ) - curve.radiusAtYear( curve.endYear ) ) < 1e-6, name );

	}

} );

test( 'canvas に収める：縦横比を保ち、縁から inset 以上あけ、中心は canvas の中心', () => {

	for ( const [ name, curve ] of Object.entries( CASES ) ) {

		const { points } = spiralSamples( curve );
		for ( const [ size, px ] of Object.entries( SIZES ) ) {

			for ( const [ w, h ] of [ [ px, px ], [ px, px * 1.5 ], [ px * 2, px ] ] ) {

				const fit = fitSpiral( points, w, h );
				assert.equal( fit.cx, w / 2 );
				assert.equal( fit.cy, h / 2 );
				let minX = Infinity, maxX = - Infinity, minY = Infinity, maxY = - Infinity;
				for ( const p of points ) {

					const q = fit.toCanvas( p.x, p.z );
					minX = Math.min( minX, q.x ); maxX = Math.max( maxX, q.x );
					minY = Math.min( minY, q.y ); maxY = Math.max( maxY, q.y );

				}

				const where = `${name} ${size} ${w}x${h}`;
				assert.ok( minX >= EDGE_INSET - 1e-9 && maxX <= w - EDGE_INSET + 1e-9, `${where}: 横にはみ出し` );
				assert.ok( minY >= EDGE_INSET - 1e-9 && maxY <= h - EDGE_INSET + 1e-9, `${where}: 縦にはみ出し` );
				// 縦横比を保つ：どちらかの軸がちょうど inset に接する
				const touchX = Math.min( minX - EDGE_INSET, w - EDGE_INSET - maxX );
				const touchY = Math.min( minY - EDGE_INSET, h - EDGE_INSET - maxY );
				assert.ok( Math.min( touchX, touchY ) < 1e-6, `${where}: 最大の拡大率になっていない` );
				// 北（−z）が上、東（+x）が右：始点から少し進んだ点の向き。北の線は x = 中心
				const north = fit.toCanvas( 0, - 10 );
				assert.equal( north.x, w / 2 );
				assert.ok( north.y < h / 2 );
				assert.ok( fit.toCanvas( 10, 0 ).x > w / 2 );
				// スポークの先端（いちばん北の点 + 4px）も canvas に収まる
				assert.ok( fit.cy - ( fit.northExtent + SPOKE_OVERSHOOT ) >= 0, `${where}: スポークがはみ出す` );

			}

		}

	}

} );

test( 'canvas に収める：5.6 周のL（190px）の拡大率は周の間隔が約 13px（仕様の見積もり）', () => {

	const { points } = spiralSamples( CASES[ 'ドル円 5.6周' ] );
	const fit = fitSpiral( points, 190, 190 );
	const pitch = SPIRAL.turnGap * fit.scale;
	assert.ok( pitch > 12 && pitch < 14, `${pitch}` );

} );

test( '見た目の寸法：150px 未満は一段小さい（11px、縁取り 2px、細い線、点の半径 4）', () => {

	assert.deepEqual( mapMetrics( 190 ), { compact: false, fontSize: 12, labelStroke: 3, aheadWidth: 1.5, riddenWidth: 2, markerRadius: 4.5 } );
	assert.deepEqual( mapMetrics( 158 ), mapMetrics( 190 ) );
	assert.deepEqual( mapMetrics( 106 ), { compact: true, fontSize: 11, labelStroke: 2, aheadWidth: 1.25, riddenWidth: 1.75, markerRadius: 4 } );
	assert.equal( mapMetrics( 94 ).compact, true );

} );

/** パネルの大きさ px のときの年代のラベル。 */
function labelsFor( curve, px ) {

	const { points } = spiralSamples( curve );
	const m = mapMetrics( px );
	const fit = fitSpiral( points, px, px );
	return { labels: decadeLabels( curve, fit.scale, m.fontSize ), fit, m };

}

test( '年代のラベル：L は周の数によらず年代の境目をすべて出す。M は 5.6 周だけ 20 年ごと', () => {

	const years = ( curve, px ) => labelsFor( curve, px ).labels.map( ( l ) => l.year );
	assert.deepEqual( years( CASES[ 'ドル円 5.6周' ], SIZES.L ), [ 1980, 1990, 2000, 2010, 2020 ] );
	assert.deepEqual( years( CASES[ '金利 4周' ], SIZES.L ), [ 1990, 2000, 2010, 2020 ] );
	assert.deepEqual( years( CASES[ '日経平均 3.7周' ], SIZES.L ), [ 1990, 2000, 2010, 2020 ] );
	// M（158px）の 5.6 周は周の間隔が約 10.5px で、12px の数字（高さ 8.6px + 3px）に足りないので 20 年ごと
	assert.deepEqual( years( CASES[ 'ドル円 5.6周' ], SIZES.M ), [ 1980, 2000, 2020 ] );
	assert.deepEqual( years( CASES[ '金利 4周' ], SIZES.M ), [ 1990, 2000, 2010, 2020 ] );

} );

test( '年代のラベル：S・短い横長で 5.6 周は 20 年ごと（1980・2000・2020）', () => {

	for ( const px of [ SIZES.S, SIZES.短い横長 ] ) {

		const { labels, fit, m } = labelsFor( CASES[ 'ドル円 5.6周' ], px );
		assert.deepEqual( labels.map( ( l ) => l.year ), [ 1980, 2000, 2020 ], `${px}px` );
		assert.ok( SPIRAL.turnGap * fit.scale < m.fontSize * 0.72 + 3, '間引きの条件' );

	}

} );

test( '年代のラベル：どの大きさでも、隣のラベルとの間は数字の高さ + 3px 以上、canvas の縁にかからない', () => {

	for ( const [ name, curve ] of Object.entries( CASES ) ) {

		for ( const [ size, px ] of Object.entries( SIZES ) ) {

			const { labels, m } = labelsFor( curve, px );
			const where = `${name} ${size}`;
			assert.ok( labels.length >= 1, where );
			for ( let i = 1; i < labels.length; i ++ ) {

				assert.ok( labels[ i ].offset - labels[ i - 1 ].offset >= m.fontSize * 0.72 + 3 - 1e-9, `${where}: ${labels[ i - 1 ].year} と ${labels[ i ].year} が近い` );

			}

			// 北の線の上（x = 0）で、外側ほど中心から遠い。最後のラベルの上端が canvas の内側
			for ( const l of labels ) assert.ok( Math.abs( l.x ) < 1e-6 && l.z < 0, `${where}: ${l.year} が北にない` );
			assert.ok( px / 2 - labels.at( - 1 ).offset - m.fontSize * 0.36 > 0, `${where}: 縁にかかる` );

		}

	}

} );

test( '年代のラベル：さらに狭いときは、いちばん外側（最新）だけ', () => {

	const curve = CASES[ 'ドル円 5.6周' ];
	const labels = decadeLabels( curve, 0.3, 12 ); // 周の間隔 3.9px：20 年ごと（7.8px）でも足りない
	assert.deepEqual( labels.map( ( l ) => l.year ), [ 2020 ] );
	assert.deepEqual( decadeLabels( curve, 0.45, 12 ).map( ( l ) => l.year ), [ 1980, 2000, 2020 ] ); // 5.85px、2 倍で 11.7 ≥ 11.64
	assert.deepEqual( decadeLabels( curve, 1, 12 ).map( ( l ) => l.year ), [ 1980, 1990, 2000, 2010, 2020 ] );

} );

test( '年代のラベル：位置は交点の半径 × 拡大率。起点が 1 月 1 日の北ならその上にも置く', () => {

	const curve = CASES[ '日経平均 3.7周' ];
	const labels = decadeLabels( curve, 2, 12 );
	assert.equal( labels[ 0 ].year, 1990 );
	assert.ok( Math.abs( labels[ 0 ].offset - SPIRAL.innerRadius * 2 ) < 1e-6 ); // 起点の上
	assert.ok( Math.abs( labels[ 1 ].offset - ( SPIRAL.innerRadius + SPIRAL.turnGap ) * 2 ) < 1e-6 );
	// 起点が北でないデータの最初の交点は、起点より外側
	const usd = decadeLabels( CASES[ 'ドル円 5.6周' ], 2, 12 );
	assert.equal( usd[ 0 ].year, 1980 );
	assert.ok( usd[ 0 ].offset > SPIRAL.innerRadius * 2 );

} );

test( '走行済みの終わり：走行中は現在位置、走り終えたときは終点。標本は弧長の割合に比例', () => {

	for ( const [ name, curve ] of Object.entries( CASES ) ) {

		const { points, count } = spiralSamples( curve );
		const a = riddenSampleCount( curve, count, 0, false );
		assert.equal( a.end, 0, name );
		assert.equal( a.last, 0, name );
		const b = riddenSampleCount( curve, count, 0.5, false );
		assert.ok( Math.abs( b.end - curve.arcFractionAt( 0.5 ) ) < 1e-12, name );
		assert.equal( b.last, Math.floor( b.end * count ), name );
		// 走り終えたとき：進行位置が 1 より手前で止まっていても終点まで
		const c = riddenSampleCount( curve, count, 0.97, true );
		assert.equal( c.end, 1, name );
		assert.equal( c.last, count, name );
		assert.equal( points.length, c.last + 1, name );
		// 現在位置（progress）が、走行済みの線の先頭の点（last 番目）と次の点の間にある
		const here = curve.getXZAt( 0.5 );
		const p0 = points[ b.last ], p1 = points[ Math.min( count, b.last + 1 ) ];
		const seg = Math.hypot( p1.x - p0.x, p1.z - p0.z );
		assert.ok( Math.hypot( here.x - p0.x, here.z - p0.z ) <= seg * 1.05, name );

	}

	assert.equal( riddenEnd( 0.5, true ), 1 );

} );

test( '文言：いま・（終点）・aria-label', () => {

	assert.equal( nowText( 2008, false ), '2008年' );
	assert.equal( nowText( 2026, true ), '2026年（終点）' );
	assert.equal(
		mapAriaLabel( 1971, 2008 ),
		'上から見たらせん形のコースの図。中心が1971年で、外側ほど新しく、10年で1周します。北を向く線が年代の境目です。現在は2008年。'
	);

} );
