// 一人称視点と俯瞰視点の切り替えと、カメラの置き方（担当：シーン。値は config.js の SCENE と MOTION）。
//
//   view.current            'ride'（一人称）または 'overview'（俯瞰）
//   view.setView( v )       切り替える。変わったときだけ events へ 'viewchange' を発行する
//   view.toggleView()       もう一方へ切り替える
//   view.isOverview / view.setOverview( bool )   旧 API（そのまま使える）
//   view.update( state )    毎フレーム、カメラの位置・向き・画角と fog を決める（environment.js が先頭で呼ぶ）
// <html data-view="ride|overview"> も更新する（CSS が俯瞰中だけ凡例を出すのに使う）。
// 各モジュールの onViewChange( view ) は、main.js が 'viewchange' を受けて呼ぶ。
//
// カメラはシーン直下に置き、ワールド座標で動かす。
//   一人称：車体（train）の姿勢から、上へ SCENE.ride.height、後ろへ back、下向きに pitchDeg。
//   俯瞰：  target から南（+z）へ仰角 55°、距離 radius / sin( min( 縦画角, 横画角 ) / 2 )。
//   切り替え：MOTION.viewTransitionMs（ease-in-out）で位置・向き・画角・fog を補間する。
//             時刻は state.nowMs。prefers-reduced-motion: reduce では瞬時。

import { Vector3, Quaternion, Matrix4, Euler, MathUtils } from './three.core.js';
import { SCENE, MOTION } from './config.js';

const DEG = Math.PI / 180;

/** CSS の cubic-bezier( x1, y1, x2, y2 ) と同じ曲線。x（時間の割合）→ y（進み具合）。 */
export function cubicBezier( x1, y1, x2, y2 ) {

	const ax = 3 * x1 - 3 * x2 + 1, bx = 3 * x2 - 6 * x1, cx = 3 * x1;
	const ay = 3 * y1 - 3 * y2 + 1, by = 3 * y2 - 6 * y1, cy = 3 * y1;
	const sx = ( t ) => ( ( ax * t + bx ) * t + cx ) * t;
	const sy = ( t ) => ( ( ay * t + by ) * t + cy ) * t;
	const dx = ( t ) => ( 3 * ax * t + 2 * bx ) * t + cx;

	return ( x ) => {

		if ( x <= 0 ) return 0;
		if ( x >= 1 ) return 1;
		let t = x;
		for ( let i = 0; i < 8; i ++ ) {

			const err = sx( t ) - x;
			if ( Math.abs( err ) < 1e-6 ) break;
			const d = dx( t );
			if ( Math.abs( d ) < 1e-6 ) break;
			t -= err / d;

		}

		// ニュートン法が外れたときは二分法
		if ( t < 0 || t > 1 || Math.abs( sx( t ) - x ) > 1e-4 ) {

			let lo = 0, hi = 1;
			t = x;
			for ( let i = 0; i < 30; i ++ ) {

				if ( sx( t ) < x ) lo = t; else hi = t;
				t = ( lo + hi ) / 2;

			}

		}

		return sy( t );

	};

}

/** 一人称の縦の画角（度）。横の画角が minHorizontalFov を下回らないようにする。 */
export function rideFov( aspect ) {

	const { fovMin, fovMax, minHorizontalFov } = SCENE.ride;
	const fov = 2 * Math.atan( Math.tan( minHorizontalFov / 2 * DEG ) / aspect ) / DEG;
	return Math.min( fovMax, Math.max( fovMin, fov ) );

}

/** 俯瞰の縦の画角（度）。縦長の画面では広げる。 */
export function overviewFov( aspect ) {

	return aspect < 1 ? SCENE.overview.fovPortrait : SCENE.overview.fovLandscape;

}

/** 俯瞰のカメラと target の距離。縦横の狭い方の画角に、半径 radius の球が収まる距離。 */
export function overviewDistance( aspect ) {

	const vfov = overviewFov( aspect ) * DEG;
	const hfov = 2 * Math.atan( Math.tan( vfov / 2 ) * aspect );
	return SCENE.overview.radius / Math.sin( Math.min( vfov, hfov ) / 2 );

}

function prefersReducedMotion() {

	return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
		&& window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

}

export function createView( { scene, camera, train, events = null } ) {

	let current = 'ride';

	// 補間：blend は 0（一人称）..1（俯瞰）。from から to へ、startMs から durationMs かけて動く
	const ease = cubicBezier( ...MOTION.viewEase );
	let blend = 0;
	let from = 0;
	let to = 0;
	let startMs = null; // 次の update の nowMs で始める
	let durationMs = 0;
	let lastNowMs = 0;

	// カメラはシーン直下に置き、ワールド座標で位置と向きを決める
	camera.parent?.remove( camera );
	scene.add( camera );

	const ridePosition = new Vector3();
	const rideQuaternion = new Quaternion();
	const overviewPosition = new Vector3();
	const overviewQuaternion = new Quaternion();
	const target = new Vector3( SCENE.overview.target.x, SCENE.overview.target.y, SCENE.overview.target.z );
	const up = new Vector3( 0, 1, 0 );
	const lookMatrix = new Matrix4();
	const pitch = new Quaternion();
	const pitchEuler = new Euler();
	const elevation = SCENE.overview.elevationDeg * DEG;
	const overviewDirection = new Vector3( 0, Math.sin( elevation ), Math.cos( elevation ) );

	function placeCamera() {

		const aspect = camera.aspect;

		// 一人称：車体の姿勢（train は main.js がこのフレームの ride の値にしてある）
		ridePosition.set( 0, SCENE.ride.height, SCENE.ride.back ).applyQuaternion( train.quaternion ).add( train.position );
		pitch.setFromEuler( pitchEuler.set( ( aspect < 1 ? SCENE.ride.pitchDegPortrait : SCENE.ride.pitchDeg ) * DEG, 0, 0 ) );
		rideQuaternion.copy( train.quaternion ).multiply( pitch );

		// 俯瞰
		const distance = overviewDistance( aspect );
		overviewPosition.copy( overviewDirection ).multiplyScalar( distance ).add( target );
		lookMatrix.lookAt( overviewPosition, target, up );
		overviewQuaternion.setFromRotationMatrix( lookMatrix );

		const b = blend;
		camera.position.lerpVectors( ridePosition, overviewPosition, b );
		camera.quaternion.slerpQuaternions( rideQuaternion, overviewQuaternion, b );

		const fov = MathUtils.lerp( rideFov( aspect ), overviewFov( aspect ), b );
		if ( Math.abs( camera.fov - fov ) > 1e-6 ) {

			camera.fov = fov;
			camera.updateProjectionMatrix();

		}

		if ( scene.fog ) {

			scene.fog.near = MathUtils.lerp( SCENE.fog.near, distance * SCENE.fogOverview.nearPerDistance, b );
			scene.fog.far = MathUtils.lerp( SCENE.fog.far, distance * SCENE.fogOverview.farPerDistance, b );

		}

		alignSky();
		camera.updateMatrixWorld();

	}

	// 背景のグラデーション（scene.background）は画面に貼られるので、カメラが上下を向くと地平線とずれる。
	// 画面に映る地平線の高さへ、グラデーションの「地平線の色」の位置（SCENE.sky.horizonAt）を合わせる。
	// 地平線より下は床（遠くは fog で地平線の色）なので、空の色と床の色が継ぎ目なくつながる。
	const forward = new Vector3();
	function alignSky() {

		const background = scene.background;
		if ( ! background || ! background.isTexture ) return;
		forward.set( 0, 0, - 1 ).applyQuaternion( camera.quaternion );
		const pitchAngle = Math.asin( MathUtils.clamp( forward.y, - 1, 1 ) );
		// 地平線の NDC の y（上が +1）と、画面の上端からの割合
		const ndcY = - Math.tan( pitchAngle ) / Math.tan( camera.fov * DEG / 2 );
		const fromTop = ( 1 - ndcY ) / 2;
		// テクスチャの v は下が 0（flipY）。画面の上からの割合 s が、グラデーションの上からの割合 s - offset に写る
		background.offset.y = MathUtils.clamp( fromTop, - 2, 3 ) - SCENE.sky.horizonAt;

	}

	function reflectInDocument() {

		if ( typeof document !== 'undefined' ) document.documentElement.dataset.view = current;

	}

	reflectInDocument();
	placeCamera();

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

			const goal = current === 'overview' ? 1 : 0;
			if ( prefersReducedMotion() || MOTION.viewTransitionMs <= 0 ) {

				blend = from = to = goal;
				startMs = null;
				durationMs = 0;

			} else {

				// 途中で切り替えたときは、今の位置から残りの距離に比例した時間で戻る
				from = blend;
				to = goal;
				durationMs = MOTION.viewTransitionMs * Math.abs( to - from );
				startMs = lastNowMs;

			}

			placeCamera();
			reflectInDocument();
			events?.emit( 'viewchange', { view: current } );

		},
		toggleView() {

			view.setView( current === 'ride' ? 'overview' : 'ride' );

		},
		setOverview( value ) {

			view.setView( value ? 'overview' : 'ride' );

		},
		/** 毎フレーム呼ぶ（environment.js）。state.nowMs で補間を進め、カメラと fog を置く。 */
		update( state ) {

			lastNowMs = state.nowMs;
			if ( blend !== to && durationMs > 0 ) {

				if ( startMs === null ) startMs = state.nowMs;
				const s = Math.min( 1, Math.max( 0, ( state.nowMs - startMs ) / durationMs ) );
				blend = from + ( to - from ) * ease( s );
				if ( s >= 1 ) blend = to;

			}

			placeCamera();

		}
	};

	return view;

}
