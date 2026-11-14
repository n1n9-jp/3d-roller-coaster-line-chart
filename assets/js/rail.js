// レール・支柱・影・現在位置マーカー。機能モジュール（createRail( ctx )）。担当：シーン。
// 他のモジュールは scene.getObjectByName( 'rail' | 'lifters' | 'shadow' | 'position-marker' ) で取り出す。

import * as THREE from 'three';
import {
	RollerCoasterGeometry,
	RollerCoasterShadowGeometry,
	RollerCoasterLiftersGeometry
} from 'three/addons/misc/RollerCoaster.js';
import { COLORS, RAIL_DIVISIONS, LIFTER_DIVISIONS, SHADOW_DIVISIONS } from './config.js';

export function createRail( ctx ) {

	const { scene, curve, train } = ctx;

	const rail = new THREE.Mesh(
		new RollerCoasterGeometry( curve, RAIL_DIVISIONS ),
		new THREE.MeshPhongMaterial( { vertexColors: true } )
	);
	rail.name = 'rail';
	scene.add( rail );

	const lifters = new THREE.Mesh(
		new RollerCoasterLiftersGeometry( curve, LIFTER_DIVISIONS ),
		new THREE.MeshPhongMaterial()
	);
	lifters.name = 'lifters';
	lifters.position.y = 0.1;
	scene.add( lifters );

	const shadow = new THREE.Mesh(
		new RollerCoasterShadowGeometry( curve, SHADOW_DIVISIONS ),
		new THREE.MeshBasicMaterial( { color: COLORS.shadow, depthWrite: false, transparent: true } )
	);
	shadow.name = 'shadow';
	shadow.position.y = 0.1;
	scene.add( shadow );

	// 現在位置マーカー（俯瞰視点のときだけ表示する）
	const positionMarker = new THREE.Mesh(
		new THREE.SphereGeometry( 3, 8, 8 ),
		new THREE.MeshBasicMaterial( { color: COLORS.marker } )
	);
	positionMarker.name = 'position-marker';
	positionMarker.visible = false;
	scene.add( positionMarker );

	return {
		rail,
		lifters,
		shadow,
		positionMarker,
		update( state ) {

			positionMarker.position.copy( train.position );
			positionMarker.visible = state.view === 'overview';

		}
	};

}
