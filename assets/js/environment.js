// 周囲の景色：暗い床と、細・太 2 枚のグリッド。機能モジュール（createEnvironment( ctx )）。担当：シーン（仕様 4）。
//
// 毎フレーム、カメラ（view.js）を先に更新する。このモジュールは登録順の先頭にあるので、
// 後に続くモジュール（マーカーの lookAt( camera ) など）は、このフレームのカメラの位置を見る。

import * as THREE from 'three';
import { SCENE, PALETTE } from './config.js';

function createGrid( divisions, color, y ) {

	const grid = new THREE.GridHelper( SCENE.floor.size, divisions, color, color );
	grid.position.y = y;
	grid.material.transparent = true;
	grid.material.opacity = SCENE.gridOpacity;
	grid.material.depthWrite = false;
	return grid;

}

export function createEnvironment( ctx ) {

	const { scene, view } = ctx;

	const floorGeometry = new THREE.PlaneGeometry( SCENE.floor.size, SCENE.floor.size );
	floorGeometry.rotateX( - Math.PI / 2 );
	const floor = new THREE.Mesh( floorGeometry, new THREE.MeshBasicMaterial( { color: PALETTE.floor } ) );
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
