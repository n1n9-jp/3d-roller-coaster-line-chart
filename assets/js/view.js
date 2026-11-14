// 一人称視点と俯瞰視点の切り替え。

import { CAMERA_HEIGHT, OVERVIEW_POSITION } from './config.js';

export function createView( { scene, camera, train } ) {

	let overview = false;

	function enterFirstPerson() {

		scene.remove( camera );
		camera.position.set( 0, CAMERA_HEIGHT, 0 );
		camera.rotation.set( 0, 0, 0 );
		train.add( camera );

	}

	function enterOverview() {

		train.remove( camera );
		camera.position.set( OVERVIEW_POSITION.x, OVERVIEW_POSITION.y, OVERVIEW_POSITION.z );
		camera.lookAt( 0, 0, 0 );
		scene.add( camera );

	}

	enterFirstPerson();

	return {
		get isOverview() {

			return overview;

		},
		setOverview( value ) {

			value = Boolean( value );
			if ( value === overview ) return;
			overview = value;
			if ( overview ) enterOverview();
			else enterFirstPerson();

		}
	};

}
