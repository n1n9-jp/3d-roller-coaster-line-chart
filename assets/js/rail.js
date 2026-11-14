// レール・支柱・影・現在位置マーカー。

import * as THREE from 'three';
import {
	RollerCoasterGeometry,
	RollerCoasterShadowGeometry,
	RollerCoasterLiftersGeometry
} from 'three/addons/misc/RollerCoaster.js';
import { COLORS, RAIL_DIVISIONS, LIFTER_DIVISIONS, SHADOW_DIVISIONS } from './config.js';

export function createRail( scene, curve ) {

	const rail = new THREE.Mesh(
		new RollerCoasterGeometry( curve, RAIL_DIVISIONS ),
		new THREE.MeshPhongMaterial( { vertexColors: true } )
	);
	scene.add( rail );

	const lifters = new THREE.Mesh(
		new RollerCoasterLiftersGeometry( curve, LIFTER_DIVISIONS ),
		new THREE.MeshPhongMaterial()
	);
	lifters.position.y = 0.1;
	scene.add( lifters );

	const shadow = new THREE.Mesh(
		new RollerCoasterShadowGeometry( curve, SHADOW_DIVISIONS ),
		new THREE.MeshBasicMaterial( { color: COLORS.shadow, depthWrite: false, transparent: true } )
	);
	shadow.position.y = 0.1;
	scene.add( shadow );

	// 現在位置マーカー（俯瞰視点のときだけ表示する）
	const positionMarker = new THREE.Mesh(
		new THREE.SphereGeometry( 3, 8, 8 ),
		new THREE.MeshBasicMaterial( { color: COLORS.marker } )
	);
	positionMarker.visible = false;
	scene.add( positionMarker );

	return { rail, lifters, shadow, positionMarker };

}
