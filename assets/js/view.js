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
//   俯瞰：  南（+z）から仰角 SCENE.overview.elevationDeg。位置は fitOverview が、輪の点（setOverviewSubject）を
//           HUD を避けた範囲（SCENE.overview.frame）に収めるように決める。点が無いときは
//           target から距離 radius / sin( min( 縦画角, 横画角 ) / 2 )。
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

// 直近の構図（fitOverview の結果）。overviewDistance が返す
let lastFit = null;

/**
 * 俯瞰のカメラと target の距離。
 * 輪の点から構図を決めたあと（view.setOverviewSubject のあと）は、その距離（カメラから輪の中心の奥行き）。
 * それまでは、縦横の狭い方の画角に、半径 radius の球が収まる距離。
 */
export function overviewDistance( aspect ) {

	if ( lastFit && Math.abs( lastFit.aspect - aspect ) < 1e-6 ) return lastFit.distance;
	const vfov = overviewFov( aspect ) * DEG;
	const hfov = 2 * Math.atan( Math.tan( vfov / 2 ) * aspect );
	return SCENE.overview.radius / Math.sin( Math.min( vfov, hfov ) / 2 );

}

/** HUD の配置のモード（hud.css と同じ判定）：'short'（高さ 520 以下かつ横長）／ 'narrow'（幅 720 以下）／ 'wide'。 */
export function overviewMode( width, height ) {

	if ( height <= 520 && width >= height ) return 'short';
	if ( width <= 720 ) return 'narrow';
	return 'wide';

}

/**
 * 俯瞰の構図を決める（three.js 非依存）。向きは南から仰角 elevationDeg で固定し、カメラの位置だけを動かして、
 * 点 points（{x,y,z} の配列）の投影の外接矩形が、画面から insets（px）を引いた範囲の中央に、
 * 幅 maxWidth・高さ maxHeight（画面に対する割合）を超えない最大の大きさで収まるようにする。
 * 透視投影なので、奥行きと横のずれを交互に直す反復で解く。
 * @returns { position, target, distance, bounds }  bounds は収めた外接矩形（NDC、-1..1）
 */
export function fitOverview( points, { width, height, fovDeg, elevationDeg, insets, maxWidth = 1, maxHeight = 1, iterations = 40 } ) {

	const e = elevationDeg * DEG;
	// 前（カメラ → 輪）、右、上
	const f = { x: 0, y: - Math.sin( e ), z: - Math.cos( e ) };
	const r = { x: 1, y: 0, z: 0 };
	const u = { x: 0, y: Math.cos( e ), z: - Math.sin( e ) };
	const tanV = Math.tan( fovDeg * DEG / 2 );
	const tanH = tanV * width / height;

	// 収める範囲（NDC）と大きさの上限
	const sx0 = - 1 + 2 * insets.left / width, sx1 = 1 - 2 * insets.right / width;
	const sy0 = - 1 + 2 * insets.bottom / height, sy1 = 1 - 2 * insets.top / height;
	const aw = Math.max( 1e-3, Math.min( sx1 - sx0, 2 * maxWidth ) );
	const ah = Math.max( 1e-3, Math.min( sy1 - sy0, 2 * maxHeight ) );
	const cx = ( sx0 + sx1 ) / 2, cy = ( sy0 + sy1 ) / 2;

	// 重心
	let gx = 0, gy = 0, gz = 0;
	for ( const p of points ) {

		gx += p.x; gy += p.y; gz += p.z;

	}

	const n = Math.max( 1, points.length );
	gx /= n; gy /= n; gz /= n;

	// 初期位置：重心から後ろへ十分に離す
	let d0 = 0;
	for ( const p of points ) d0 = Math.max( d0, Math.hypot( p.x - gx, p.y - gy, p.z - gz ) );
	d0 = d0 / Math.sin( Math.min( Math.atan( tanV ), Math.atan( tanH ) ) ) + 1;
	const C = { x: gx - f.x * d0, y: gy - f.y * d0, z: gz - f.z * d0 };

	let bounds = null;
	let depthG = d0;

	function measure() {

		let x0 = Infinity, x1 = - Infinity, y0 = Infinity, y1 = - Infinity;
		for ( const p of points ) {

			const vx = p.x - C.x, vy = p.y - C.y, vz = p.z - C.z;
			const depth = Math.max( 1e-3, vx * f.x + vy * f.y + vz * f.z );
			const nx = ( vx * r.x + vy * r.y + vz * r.z ) / ( depth * tanH );
			const ny = ( vx * u.x + vy * u.y + vz * u.z ) / ( depth * tanV );
			if ( nx < x0 ) x0 = nx;
			if ( nx > x1 ) x1 = nx;
			if ( ny < y0 ) y0 = ny;
			if ( ny > y1 ) y1 = ny;

		}

		depthG = ( gx - C.x ) * f.x + ( gy - C.y ) * f.y + ( gz - C.z ) * f.z;
		return { x0, x1, y0, y1 };

	}

	for ( let i = 0; i < iterations; i ++ ) {

		bounds = measure();
		// 大きさ：重心の奥行きを 1/k にする（近似）
		const k = Math.min( aw / ( bounds.x1 - bounds.x0 ), ah / ( bounds.y1 - bounds.y0 ) );
		const nextDepth = depthG / k;
		const move = depthG - nextDepth;
		C.x += f.x * move; C.y += f.y * move; C.z += f.z * move;
		// 位置：外接矩形の中心を範囲の中心へ（新しい奥行きで、NDC のずれをワールドの横・縦のずれに直す）
		const mx = ( ( bounds.x0 + bounds.x1 ) / 2 ) * k - cx;
		const my = ( ( bounds.y0 + bounds.y1 ) / 2 ) * k - cy;
		const sx = mx * nextDepth * tanH, sy = my * nextDepth * tanV;
		C.x += r.x * sx + u.x * sy; C.y += r.y * sx + u.y * sy; C.z += r.z * sx + u.z * sy;
		if ( Math.abs( k - 1 ) < 1e-5 && Math.abs( mx ) < 1e-5 && Math.abs( my ) < 1e-5 ) break;

	}

	bounds = measure();
	const target = { x: C.x + f.x * depthG, y: C.y + f.y * depthG, z: C.z + f.z * depthG };
	return { position: { ...C }, target, distance: depthG, bounds };

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
	const overviewTarget = new Vector3();

	// 俯瞰の構図に収める点（curtain.js が setOverviewSubject で渡す）と、解いた構図のキャッシュ
	let subject = null;
	let fitKey = '';
	let fit = null;

	function viewportSize( aspect ) {

		if ( typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0 ) {

			return { width: window.innerWidth, height: window.innerHeight };

		}

		return { width: 1000 * aspect, height: 1000 };

	}

	function currentFit( aspect ) {

		if ( ! subject ) return null;
		const { width, height } = viewportSize( aspect );
		const key = `${width}x${height}:${aspect.toFixed( 6 )}`;
		if ( key !== fitKey ) {

			const mode = overviewMode( width, height );
			const frame = SCENE.overview.frame;
			fit = fitOverview( subject, {
				width,
				height,
				fovDeg: overviewFov( aspect ),
				elevationDeg: SCENE.overview.elevationDeg,
				insets: frame.insets[ mode ],
				maxWidth: frame.maxWidth[ mode ],
				maxHeight: frame.maxHeight[ mode ]
			} );
			fit.aspect = aspect;
			fit.mode = mode;
			fitKey = key;
			lastFit = fit;

		}

		return fit;

	}

	function placeCamera() {

		const aspect = camera.aspect;

		// 一人称：車体の姿勢（train は main.js がこのフレームの ride の値にしてある）
		ridePosition.set( 0, SCENE.ride.height, SCENE.ride.back ).applyQuaternion( train.quaternion ).add( train.position );
		pitch.setFromEuler( pitchEuler.set( ( aspect < 1 ? SCENE.ride.pitchDegPortrait : SCENE.ride.pitchDeg ) * DEG, 0, 0 ) );
		rideQuaternion.copy( train.quaternion ).multiply( pitch );

		// 俯瞰：輪の点があれば、HUD を避けた範囲に収める構図（画面の大きさが変わったときだけ解き直す）
		let distance;
		const fit = currentFit( aspect );
		if ( fit ) {

			distance = fit.distance;
			overviewPosition.set( fit.position.x, fit.position.y, fit.position.z );
			overviewTarget.set( fit.target.x, fit.target.y, fit.target.z );

		} else {

			distance = overviewDistance( aspect );
			overviewTarget.copy( target );
			overviewPosition.copy( overviewDirection ).multiplyScalar( distance ).add( target );

		}

		lookMatrix.lookAt( overviewPosition, overviewTarget, up );
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
		/** 視点の補間の進み具合（0 = 一人称 .. 1 = 俯瞰）。俯瞰だけの表示のフェードに使う。 */
		get blend() {

			return blend;

		},
		/** 俯瞰のカメラから輪の中心までの距離（いまの画面の大きさでの値）。 */
		get overviewDistance() {

			return overviewDistance( camera.aspect );

		},
		/** 俯瞰の構図（fitOverview の結果。輪の点が無いときは null）。 */
		get overviewFit() {

			return currentFit( camera.aspect );

		},
		/** 俯瞰で画面に収める点（{x,y,z} の配列）。次のフレームから構図を解き直す。 */
		setOverviewSubject( points ) {

			subject = points && points.length ? points.map( ( p ) => ( { x: p.x, y: p.y, z: p.z } ) ) : null;
			fitKey = '';
			fit = null;
			if ( ! subject ) lastFit = null;
			placeCamera();

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
