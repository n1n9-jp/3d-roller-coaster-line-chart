// 俯瞰の構図（view.js の fitOverview・setOverviewExtras）：HUD のパネルを避けて、螺旋（と追加の点）を大きく収める。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
	createView, fitOverview, overviewMode, overviewFrame, overviewFov, overviewHudRects
} from '../assets/js/view.js';
import { TrackCurve } from '../assets/js/track.js';
import { buildDataset } from '../assets/js/data.js';
import { overviewSubjectPoints } from '../assets/js/curtain.js';
import { Scene, PerspectiveCamera, Object3D, Vector3 } from '../assets/js/three.core.js';
import { SCENE } from '../assets/js/config.js';
import { readJson } from './helpers.js';

// 5.6 周（ドル円 1971 年〜）、4 周（10 年国債 1986 年〜）、3.6 周（サンプル）、手元にあれば日経平均（3.7 周）
const DATA = [
	[ 'ドル円', readJson( 'data/usdjpy.json' ) ],
	[ '国債10年', readJson( 'data/jgb10.json' ) ],
	[ 'サンプル', readJson( 'data/nikkei225.json' ) ]
];
const localUrl = new URL( '../data/local/nikkei225.json', import.meta.url );
if ( existsSync( localUrl ) ) DATA.push( [ '日経平均', JSON.parse( readFileSync( localUrl, 'utf8' ) ) ] );

const SPIRALS = DATA.map( ( [ name, data ] ) => {

	const curve = new TrackCurve( buildDataset( data ).smoothed );
	const points = overviewSubjectPoints( curve.arcCurve );
	const outer = Math.max( ...points.map( ( p ) => Math.hypot( p.x, p.z ) ) );
	return { name, curve, points, outer, turns: curve.turns };

} );

const SIZES = [ [ 1440, 900 ], [ 1024, 768 ], [ 800, 900 ], [ 390, 844 ], [ 844, 390 ] ];

/** 目盛りの壁の代わりの点：西のスポーク（x < 0、z = 0）の、半径 13〜外側 + 12、高さ 0〜35。 */
function scaleWall( outer ) {

	const points = [];
	for ( const y of [ 0, 35 ] ) for ( const r of [ 13, outer + 4, outer + 12 ] ) points.push( { x: - r, y, z: 0 } );
	return points;

}

/** fit の構図のカメラで、点を CSS px（y は下向き）へ投影する。 */
function projector( fit, width, height, fovDeg ) {

	const camera = new PerspectiveCamera( fovDeg, width / height, 0.1, 5000 );
	camera.position.set( fit.position.x, fit.position.y, fit.position.z );
	camera.lookAt( fit.target.x, fit.target.y, fit.target.z );
	camera.updateMatrixWorld();
	const v = new Vector3();
	return ( p ) => {

		v.set( p.x, p.y, p.z ).project( camera );
		return { x: ( v.x + 1 ) / 2 * width, y: ( 1 - v.y ) / 2 * height };

	};

}

function boxOf( pts ) {

	return {
		left: Math.min( ...pts.map( ( p ) => p.x ) ), right: Math.max( ...pts.map( ( p ) => p.x ) ),
		top: Math.min( ...pts.map( ( p ) => p.y ) ), bottom: Math.max( ...pts.map( ( p ) => p.y ) )
	};

}

function fitFor( points, width, height, kind ) {

	const mode = overviewMode( width, height );
	const frame = overviewFrame( mode );
	const fovDeg = overviewFov( width / height );
	const obstacles = overviewHudRects( mode, width, height, kind );
	const fit = fitOverview( points, { width, height, fovDeg, ...frame, obstacles } );
	return { fit, frame, fovDeg, obstacles, mode };

}

test( '俯瞰の枠：モードごとの余白・上限・仰角', () => {

	for ( const mode of [ 'wide', 'medium', 'narrow', 'short' ] ) {

		const f = overviewFrame( mode );
		const e = SCENE.overview.frame.edge[ mode ];
		assert.deepEqual( f.insets, { top: e, right: e, bottom: e, left: e } );
		assert.ok( f.maxWidth > 0.8 && f.maxWidth <= 1, mode );
		assert.ok( f.elevationDeg >= 40 && f.elevationDeg <= 60, mode );

	}

	// 縦長の S は横幅で決まるので、幅の上限は 0.9 を超える
	assert.ok( overviewFrame( 'narrow' ).maxWidth > 0.9 );

} );

test( 'HUD の既定の矩形：画面の中に収まり、実データではキャプションの分が増える', () => {

	for ( const [ w, h ] of SIZES ) {

		const mode = overviewMode( w, h );
		const sample = overviewHudRects( mode, w, h, 'sample' );
		const real = overviewHudRects( mode, w, h, 'real' );
		assert.equal( real.length, sample.length, mode ); // サンプルはバッジ + 凡例、実データは凡例 + キャプション
		for ( const r of [ ...sample, ...real ] ) {

			assert.ok( r.left >= 0 && r.top >= 0 && r.right <= w && r.bottom <= h && r.right > r.left && r.bottom > r.top, `${mode} ${JSON.stringify( r )}` );

		}

	}

} );

test( 'fitOverview：避ける矩形を渡すと、点の投影がどの矩形とも重ならない（隙間 gapPx 以上）', () => {

	const { points } = SPIRALS[ 0 ];
	const width = 1200, height = 800, fovDeg = 50;
	// 左下と右下の大きなパネル、上の帯
	const obstacles = [
		{ left: 0, top: 0, right: 1200, bottom: 120 },
		{ left: 20, top: 480, right: 420, bottom: 780 },
		{ left: 860, top: 420, right: 1180, bottom: 780 }
	];
	const base = { width, height, fovDeg, elevationDeg: 48, insets: { top: 20, right: 20, bottom: 20, left: 20 }, maxWidth: 1, maxHeight: 1 };
	const free = fitOverview( points, base );
	const fit = fitOverview( points, { ...base, obstacles, gapPx: 10 } );
	assert.ok( fit.scale < 1 && fit.scale > 0.3, `scale ${fit.scale}` );
	assert.ok( fit.distance > free.distance );
	const project = projector( fit, width, height, fovDeg );
	for ( const p of points ) {

		const q = project( p );
		for ( const r of obstacles ) {

			const inside = q.x > r.left - 9 && q.x < r.right + 9 && q.y > r.top - 9 && q.y < r.bottom + 9;
			assert.ok( ! inside, `${JSON.stringify( q )} in ${JSON.stringify( r )}` );

		}

	}

	// 避ける矩形が無ければ従来どおり（scale 1）
	assert.equal( free.scale, 1 );
	assert.deepEqual( fitOverview( points, { ...base, obstacles: [] } ).position, free.position );

} );

test( '俯瞰の構図（4 つのモード × サンプル・実データ × 3〜4 データ）：螺旋と目盛りの壁が HUD と重ならず、画面の中に収まり、小さすぎない', () => {

	for ( const { name, points, outer, turns } of SPIRALS ) {

		const extras = scaleWall( outer );
		for ( const kind of [ 'sample', 'real' ] ) {

			for ( const [ w, h ] of SIZES ) {

				const { fit, frame, fovDeg, obstacles, mode } = fitFor( points.concat( extras ), w, h, kind );
				const label = `${name}（${turns.toFixed( 1 )} 周）${kind} ${w}x${h}（${mode}）`;
				const project = projector( fit, w, h, fovDeg );
				const all = points.concat( extras ).map( project );
				for ( const q of all ) {

					// 余白の内側
					assert.ok( q.x >= frame.insets.left - 1 && q.x <= w - frame.insets.right + 1 && q.y >= frame.insets.top - 1 && q.y <= h - frame.insets.bottom + 1, `${label}: ${JSON.stringify( q )}` );
					// HUD と重ならない（隙間 gapPx から誤差 1px を引いた分）
					for ( const r of obstacles ) {

						const g = frame.gapPx - 1;
						assert.ok( ! ( q.x > r.left - g && q.x < r.right + g && q.y > r.top - g && q.y < r.bottom + g ), `${label}: ${JSON.stringify( q )} と ${JSON.stringify( r )}` );

					}

				}

				// 大きさの下限：螺旋（追加の点を除く）の外接矩形の長い辺が、画面の短い辺の 65% 以上。
				// M の実データだけは、俯瞰のあいだキャプションが凡例の下（上から 152、幅 560 まで）に出て上の空きが狭いので 55%
				const box = boxOf( points.map( project ) );
				const size = Math.max( box.right - box.left, box.bottom - box.top );
				const minRatio = mode === 'medium' && kind === 'real' ? 0.55 : 0.65;
				assert.ok( size >= minRatio * Math.min( w, h ), `${label}: 螺旋 ${size.toFixed( 0 )}px` );
				// 1 単位あたりの大きさ（構図の中心の奥行き）：デスクトップは 4.5 px 以上、縦長のスマートフォンでも 1.8 px 以上
				const minPx = mode === 'wide' && w >= 1440 ? 4.5 : 1.8;
				assert.ok( fit.pxPerUnit >= minPx, `${label}: ${fit.pxPerUnit.toFixed( 2 )} px/単位` );

			}

		}

	}

} );

function makeView() {

	const scene = new Scene();
	const camera = new PerspectiveCamera( 50, 1440 / 900, 0.1, 2000 );
	const train = new Object3D();
	return createView( { scene, camera, train, kind: 'real' } );

}

test( 'view.setOverviewExtras：追加の点も画面（余白の内側）に収め、key ごとに上書き・空の配列で取り消す', () => {

	const { points, outer } = SPIRALS[ 0 ];
	const view = makeView();
	assert.equal( view.overviewFit, null );
	view.setOverviewSubject( points );
	const before = view.overviewFit;
	const width = 1000 * 1440 / 900, height = 1000; // DOM が無いときの画面の大きさ（viewportSize）
	assert.ok( Math.abs( before.screen.bottom - before.screen.top ) > 0 );

	// 西の外側（左）へ大きく張り出す点
	const far = [ { x: - ( outer + 40 ), y: 0, z: 0 }, { x: - ( outer + 40 ), y: 35, z: 0 } ];
	view.setOverviewExtras( 'scale', far );
	const fit = view.overviewFit;
	assert.notDeepEqual( fit.position, before.position );
	assert.ok( fit.distance > before.distance );
	const project = projector( fit, width, height, overviewFov( width / height ) );
	const frame = overviewFrame( fit.mode );
	for ( const p of far ) {

		const q = project( p );
		assert.ok( q.x >= frame.insets.left - 1 && q.y >= frame.insets.top - 1 && q.y <= height - frame.insets.bottom + 1, JSON.stringify( q ) );
		for ( const r of view.overviewObstacles ) assert.ok( ! ( q.x > r.left && q.x < r.right && q.y > r.top && q.y < r.bottom ), JSON.stringify( { q, r } ) );

	}

	// 同じ key は上書き（小さい張り出しに替えると近づく）
	view.setOverviewExtras( 'scale', [ { x: - ( outer + 5 ), y: 0, z: 0 } ] );
	assert.ok( view.overviewFit.distance < fit.distance );
	// 別の key は足される（張り出しの大きい方で決まる）
	view.setOverviewExtras( 'other', far );
	assert.ok( Math.abs( view.overviewFit.distance / fit.distance - 1 ) < 0.02 );
	// 空の配列で取り消すと元の構図
	view.setOverviewExtras( 'other', [] );
	view.setOverviewExtras( 'scale', [] );
	assert.deepEqual( view.overviewFit.position, before.position );

} );
