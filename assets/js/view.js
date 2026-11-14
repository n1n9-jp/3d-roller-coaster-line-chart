// 一人称視点と俯瞰視点の切り替え。
//
//   view.current            'ride'（一人称）または 'overview'（俯瞰）
//   view.setView( v )       切り替える。変わったときだけ events へ 'viewchange' を発行する
//   view.toggleView()       もう一方へ切り替える
//   view.isOverview / view.setOverview( bool )   旧 API（そのまま使える）
// <html data-view="ride|overview"> も更新する（CSS が俯瞰中だけ凡例を出すのに使う）。
// 各モジュールの onViewChange( view ) は、main.js が 'viewchange' を受けて呼ぶ。

import { CAMERA_HEIGHT, OVERVIEW_POSITION } from './config.js';

export function createView( { scene, camera, train, events = null } ) {

	let current = 'ride';

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

	function reflectInDocument() {

		if ( typeof document !== 'undefined' ) document.documentElement.dataset.view = current;

	}

	enterFirstPerson();
	reflectInDocument();

	const view = {
		get current() {

			return current;

		},
		get isOverview() {

			return current === 'overview';

		},
		setView( next ) {

			if ( next !== 'ride' && next !== 'overview' ) throw new RangeError( `不明な視点：${next}` );
			if ( next === current ) return;
			current = next;
			if ( current === 'overview' ) enterOverview();
			else enterFirstPerson();
			reflectInDocument();
			events?.emit( 'viewchange', { view: current } );

		},
		toggleView() {

			view.setView( current === 'ride' ? 'overview' : 'ride' );

		},
		setOverview( value ) {

			view.setView( value ? 'overview' : 'ride' );

		}
	};

	return view;

}
