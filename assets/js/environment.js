// 周囲の景色：暗い床と、細・太 2 枚のグリッド。機能モジュール（createEnvironment( ctx )）。担当：シーン（仕様 4）。
//
// 毎フレーム、カメラ（view.js）を先に更新する。このモジュールは登録順の先頭にあるので、
// 後に続くモジュール（マーカーの lookAt( camera ) など）は、このフレームのカメラの位置を見る。

import * as THREE from 'three';
import { SCENE, PALETTE } from './config.js';

/**
 * 床のグリッド（GridHelper と同じ見た目の LineSegments）。線を segment ごとに区切る：
 * 床の端から端までの 1 本の長い線は、俯瞰でカメラの後ろまで伸びて近くの面で切られ、
 * 描画環境によっては（ソフトウェア描画など）線ごと消える（南北の線が消えて横縞だけが残る）。
 */
export function createGridGeometry( size, divisions, segment ) {

	const half = size / 2;
	const step = size / divisions;
	const pieces = Math.max( 1, Math.round( size / segment ) );
	const positions = new Float32Array( ( divisions + 1 ) * 2 * pieces * 2 * 3 );
	let k = 0;
	for ( let i = 0; i <= divisions; i ++ ) {

		const c = - half + i * step;
		for ( let j = 0; j < pieces; j ++ ) {

			const a = - half + size * j / pieces, b = - half + size * ( j + 1 ) / pieces;
			// 東西の線（z 一定）と南北の線（x 一定）
			positions.set( [ a, 0, c, b, 0, c, c, 0, a, c, 0, b ], k );
			k += 12;

		}

	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
	return geometry;

}

function createGrid( divisions, color, y ) {

	const material = new THREE.LineBasicMaterial( {
		color,
		transparent: true,
		opacity: SCENE.gridOpacity,
		depthWrite: false
	} );
	const grid = new THREE.LineSegments( createGridGeometry( SCENE.floor.size, divisions, SCENE.gridSegment ), material );
	grid.position.y = y;
	return grid;

}

export function createEnvironment( ctx ) {

	const { scene, view } = ctx;

	const floorGeometry = new THREE.PlaneGeometry( SCENE.floor.size, SCENE.floor.size );
	floorGeometry.rotateX( - Math.PI / 2 );
	const floor = new THREE.Mesh( floorGeometry, new THREE.MeshBasicMaterial( {
		color: PALETTE.floor,
		polygonOffset: true,
		polygonOffsetFactor: SCENE.floor.polygonOffsetFactor,
		polygonOffsetUnits: SCENE.floor.polygonOffsetUnits
	} ) );
	floor.name = 'floor';
	scene.add( floor );

	const gridFine = createGrid( SCENE.gridFine.divisions, PALETTE.gridFine, SCENE.gridFine.y );
	gridFine.name = 'grid-fine';
	scene.add( gridFine );

	const gridBold = createGrid( SCENE.gridBold.divisions, PALETTE.gridBold, SCENE.gridBold.y );
	gridBold.name = 'grid-bold';
	scene.add( gridBold );

	return {
		floor,
		gridFine,
		gridBold,
		update( state ) {

			view.update?.( state );

		},
		dispose() {

			for ( const object of [ floor, gridFine, gridBold ] ) {

				scene.remove( object );
				object.geometry.dispose();
				object.material.dispose();

			}

		}
	};

}
