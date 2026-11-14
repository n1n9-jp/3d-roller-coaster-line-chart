// 周囲の景色：地形・木・空と、回転する円柱（遊園地）。機能モジュール（createEnvironment( ctx )）。担当：シーン。

import * as THREE from 'three';
import { TreesGeometry, SkyGeometry } from 'three/addons/misc/RollerCoaster.js';
import { COLORS } from './config.js';

/**
 * @param ctx    共有コンテキスト（ctx.scene を使う）
 * @param random 地形の起伏に使う乱数（0..1）。テストで固定したいときに差し替える。
 *               木（TreesGeometry）は同梱ファイル内の Math.random を使う。
 */
export function createEnvironment( ctx, { random = Math.random } = {} ) {

	const { scene } = ctx;

	// 地形
	const terrainGeometry = new THREE.PlaneGeometry( 500, 500, 15, 15 );
	terrainGeometry.rotateX( - Math.PI / 2 );

	const positions = terrainGeometry.attributes.position.array;
	const vertex = new THREE.Vector3();

	for ( let i = 0; i < positions.length; i += 3 ) {

		vertex.fromArray( positions, i );

		vertex.x += random() * 10 - 5;
		vertex.z += random() * 10 - 5;

		const distance = ( vertex.distanceTo( scene.position ) / 5 ) - 30;
		vertex.y = random() * Math.max( 0, distance );

		vertex.toArray( positions, i );

	}

	terrainGeometry.computeVertexNormals();

	const terrain = new THREE.Mesh(
		terrainGeometry,
		new THREE.MeshLambertMaterial( { color: COLORS.ground } )
	);
	scene.add( terrain );

	// 木（地形の頂点に生やす）
	const trees = new THREE.Mesh(
		new TreesGeometry( terrain ),
		new THREE.MeshBasicMaterial( { side: THREE.DoubleSide, vertexColors: true } )
	);
	scene.add( trees );

	// 空（雲）
	const sky = new THREE.Mesh(
		new SkyGeometry(),
		new THREE.MeshBasicMaterial( { color: COLORS.sky } )
	);
	scene.add( sky );

	// 回転する円柱
	const funfairA = new THREE.Mesh(
		new THREE.CylinderGeometry( 10, 10, 5, 15 ),
		new THREE.MeshLambertMaterial( { color: COLORS.funfairA } )
	);
	funfairA.position.set( - 80, 10, - 70 );
	funfairA.rotation.x = Math.PI / 2;
	scene.add( funfairA );

	const funfairB = new THREE.Mesh(
		new THREE.CylinderGeometry( 5, 6, 4, 10 ),
		new THREE.MeshLambertMaterial( { color: COLORS.funfairB } )
	);
	funfairB.position.set( 50, 2, 30 );
	scene.add( funfairB );

	const funfairs = [ funfairA, funfairB ];

	return {
		terrain,
		trees,
		sky,
		funfairs,
		/** state.nowMs は requestAnimationFrame のタイムスタンプ（一時停止中も進む）。 */
		update( state ) {

			for ( const funfair of funfairs ) funfair.rotation.y = state.nowMs * 0.0004;

		}
	};

}
