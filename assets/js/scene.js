// renderer・scene・ライト・camera・リサイズ。

import * as THREE from 'three';
import { COLORS, CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR } from './config.js';

/** WebGL が使えない環境では例外を投げる。 */
export function createScene( container = document.body ) {

	const renderer = new THREE.WebGLRenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	container.appendChild( renderer.domElement );

	const scene = new THREE.Scene();
	scene.background = new THREE.Color( COLORS.background );

	const light = new THREE.HemisphereLight( COLORS.hemisphereSky, COLORS.hemisphereGround, 3 );
	light.position.set( 1, 1, 1 );
	scene.add( light );

	// 車体。カメラは一人称のとき車体に付く
	const train = new THREE.Object3D();
	scene.add( train );

	const camera = new THREE.PerspectiveCamera( CAMERA_FOV, window.innerWidth / window.innerHeight, CAMERA_NEAR, CAMERA_FAR );
	train.add( camera );

	function resize() {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();

		// 別ディスプレイへ移すなどで devicePixelRatio が変わることがある
		renderer.setPixelRatio( window.devicePixelRatio );
		renderer.setSize( window.innerWidth, window.innerHeight );

	}

	window.addEventListener( 'resize', resize );

	return { renderer, scene, camera, train, light, resize };

}
