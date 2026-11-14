// renderer・scene・背景・fog・ライト・camera・リサイズ。担当：シーン（値は config.js の SCENE と PALETTE、仕様 4）。
//
// 画角とカメラの位置は view.js が毎フレーム決める（一人称と俯瞰、その間の補間）。
// ここではリサイズで camera.aspect とレンダラの大きさ・解像度だけを合わせる。

import * as THREE from 'three';
import { SCENE, PALETTE } from './config.js';

/** devicePixelRatio の上限（hud/layer.js の MAX_DPR と同じ）。DPR 3 の端末で、DPR 2 の 2.25 倍の画素を描かないようにする。 */
const MAX_PIXEL_RATIO = 2;

/** 縦グラデーションの CanvasTexture（scene.background 用。画面全体に引き伸ばされる）。 */
function createSkyTexture() {

	const { width, height, stops } = SCENE.sky;
	const canvas = document.createElement( 'canvas' );
	canvas.width = width;
	canvas.height = height;
	const g = canvas.getContext( '2d' );
	const gradient = g.createLinearGradient( 0, 0, 0, height );
	for ( const [ at, hex ] of stops ) gradient.addColorStop( at, `#${hex.toString( 16 ).padStart( 6, '0' )}` );
	g.fillStyle = gradient;
	g.fillRect( 0, 0, width, height );

	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;

}

/** 描画の解像度。HUD の canvas（hud/layer.js の MAX_DPR）と同じく、devicePixelRatio の上限は 2。 */
export function pixelRatio( dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1 ) {

	return Math.min( MAX_PIXEL_RATIO, dpr || 1 );

}

/** WebGL が使えない環境では例外を投げる。 */
export function createScene( container = document.body ) {

	const renderer = new THREE.WebGLRenderer( { antialias: true } );
	renderer.setClearColor( SCENE.clearColor );
	renderer.setPixelRatio( pixelRatio() );
	renderer.setSize( window.innerWidth, window.innerHeight );
	container.appendChild( renderer.domElement );

	const scene = new THREE.Scene();
	scene.background = createSkyTexture();
	// 一人称の fog。俯瞰では view.js が near / far を遠ざける（シェーダを作り直さないよう、null にはしない）
	scene.fog = new THREE.Fog( SCENE.fog.color, SCENE.fog.near, SCENE.fog.far );

	const light = new THREE.HemisphereLight( PALETTE.hemisphereSky, PALETTE.hemisphereGround, SCENE.hemisphereIntensity );
	scene.add( light );

	// 影は計算しない（床の足跡ジオメトリで代用する）
	const sun = new THREE.DirectionalLight( PALETTE.directional, SCENE.directional.intensity );
	const { x, y, z } = SCENE.directional.position;
	sun.position.set( x, y, z );
	scene.add( sun );

	// 車体。一人称のカメラは view.js が車体の姿勢から毎フレーム置く
	const train = new THREE.Object3D();
	scene.add( train );

	const camera = new THREE.PerspectiveCamera( SCENE.ride.fovMin, window.innerWidth / window.innerHeight, SCENE.camera.near, SCENE.camera.far );
	train.add( camera );

	function resize() {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();

		renderer.setPixelRatio( pixelRatio() );
		renderer.setSize( window.innerWidth, window.innerHeight );

	}

	window.addEventListener( 'resize', resize );
	window.addEventListener( 'orientationchange', resize );

	// ウィンドウの大きさは変わらずに devicePixelRatio だけが変わる（別の解像度の画面へ移すなど）と resize は来ない。
	// 今の解像度に一致するメディアクエリを監視し、外れたら合わせ直して、新しい解像度で監視し直す。
	function watchPixelRatio() {

		if ( typeof window.matchMedia !== 'function' ) return;
		const query = window.matchMedia( `(resolution: ${window.devicePixelRatio}dppx)` );
		query.addEventListener( 'change', () => {

			resize();
			watchPixelRatio();

		}, { once: true } );

	}

	watchPixelRatio();

	return { renderer, scene, camera, train, light, sun, resize };

}
