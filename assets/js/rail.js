// レール・支柱・床の足跡・現在位置マーカー。機能モジュール（createRail( ctx )）。担当：レールの色分け。
// 他のモジュールは scene.getObjectByName( 'rail' | 'lifters' | 'shadow' | 'position-marker' ) で取り出す。
// レールの頂点カラー（これから・走行済み・連絡区間）は rail-colors.js が塗る。

import * as THREE from 'three';
import {
	RollerCoasterGeometry,
	RollerCoasterShadowGeometry,
	RollerCoasterLiftersGeometry
} from 'three/addons/misc/RollerCoaster.js';
import { PALETTE, RAIL, RAIL_DIVISIONS, LIFTER_DIVISIONS, SHADOW_DIVISIONS } from './config.js';

export function createRail( ctx ) {

	const { scene, curve, train, camera } = ctx;

	// レール（頂点カラー。emissive をわずかに足して、影になる側面が背景に沈まないようにする）
	const rail = new THREE.Mesh(
		new RollerCoasterGeometry( curve, RAIL_DIVISIONS ),
		new THREE.MeshPhongMaterial( {
			vertexColors: true,
			shininess: RAIL.material.shininess,
			specular: RAIL.material.specular,
			emissive: PALETTE.railEmissive
		} )
	);
	rail.name = 'rail';
	rail.userData.divisions = RAIL_DIVISIONS; // rail-colors.js が頂点の並びを求めるのに使う
	scene.add( rail );

	// 支柱（高さ 10 を超える地点は門型、それ以下は 1 本柱。同梱ファイルの条件のまま）
	const lifters = new THREE.Mesh(
		new RollerCoasterLiftersGeometry( curve, LIFTER_DIVISIONS ),
		new THREE.MeshPhongMaterial( { color: PALETTE.pillar, shininess: RAIL.pillar.shininess } )
	);
	lifters.name = 'lifters';
	lifters.position.y = RAIL.pillar.y;
	scene.add( lifters );

	// 床の足跡（俯瞰で山手線の輪の形が床に見える）
	const shadow = new THREE.Mesh(
		new RollerCoasterShadowGeometry( curve, SHADOW_DIVISIONS ),
		new THREE.MeshBasicMaterial( {
			color: PALETTE.shadow,
			transparent: true,
			opacity: RAIL.shadow.opacity,
			depthWrite: false
		} )
	);
	shadow.name = 'shadow';
	shadow.position.y = RAIL.shadow.y;
	scene.add( shadow );

	// 現在位置マーカー（俯瞰のときだけ表示）：球、カメラに向く白い輪、床までの白い縦線。
	// 輪と縦線は球の子なので、球の visible に従う。
	const m = RAIL.marker;
	const positionMarker = new THREE.Mesh(
		new THREE.SphereGeometry( m.radius, m.widthSegments, m.heightSegments ),
		new THREE.MeshBasicMaterial( { color: PALETTE.marker } )
	);
	positionMarker.name = 'position-marker';
	positionMarker.visible = false;

	const ringMaterial = new THREE.MeshBasicMaterial( {
		color: PALETTE.markerRing,
		transparent: true,
		opacity: m.ringOpacity,
		side: THREE.DoubleSide,
		depthWrite: false
	} );
	const ring = new THREE.Mesh( new THREE.RingGeometry( m.ringInner, m.ringOuter, m.ringSegments ), ringMaterial );
	ring.name = 'position-marker-ring';
	positionMarker.add( ring );

	// 縦線は長さ 1 の線を、毎フレーム高さに合わせて縦に伸ばす
	const heightLine = new THREE.Line(
		new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, - 1, 0 ) ] ),
		new THREE.LineBasicMaterial( {
			color: PALETTE.markerRing,
			transparent: true,
			opacity: m.lineOpacity,
			depthWrite: false
		} )
	);
	heightLine.name = 'position-marker-line';
	positionMarker.add( heightLine );

	scene.add( positionMarker );

	// prefers-reduced-motion: reduce のときは脈動させない（設定の変更にも追従する）
	const reducedQuery = typeof window !== 'undefined' && window.matchMedia
		? window.matchMedia( '(prefers-reduced-motion: reduce)' )
		: null;
	let reducedMotion = reducedQuery?.matches ?? false;
	const onReducedChange = ( e ) => {

		reducedMotion = e.matches;

	};

	reducedQuery?.addEventListener?.( 'change', onReducedChange );

	const cameraWorld = new THREE.Vector3();

	return {
		rail,
		lifters,
		shadow,
		positionMarker,
		update( state ) {

			// 位置は非表示のあいだも追従させる（他のモジュールが読んでもよいように）
			positionMarker.position.copy( train.position );
			const visible = state.view === 'overview';
			positionMarker.visible = visible;
			if ( ! visible ) return;

			positionMarker.updateMatrixWorld();

			heightLine.scale.y = Math.max( positionMarker.position.y, 1e-3 );

			camera.getWorldPosition( cameraWorld );
			ring.lookAt( cameraWorld );

			if ( reducedMotion ) {

				ringMaterial.opacity = m.ringOpacity;

			} else {

				// 0.9 → 0.4 → 0.9 を pulseMs で 1 周（実時間。一時停止中も脈動する）
				const phase = ( state.nowMs % m.pulseMs ) / m.pulseMs;
				const k = 0.5 + 0.5 * Math.cos( phase * Math.PI * 2 );
				ringMaterial.opacity = m.ringOpacityMin + ( m.ringOpacity - m.ringOpacityMin ) * k;

			}

		},
		dispose() {

			reducedQuery?.removeEventListener?.( 'change', onReducedChange );

		}
	};

}
