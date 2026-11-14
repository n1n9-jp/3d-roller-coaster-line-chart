// 一人称視点と俯瞰視点の切り替えと、カメラの置き方（担当：シーン。値は config.js の SCENE と MOTION）。
//
//   view.current            'ride'（一人称）または 'overview'（俯瞰）
//   view.setOverviewSubject( points ) / view.setOverviewExtras( key, points )   俯瞰の画面に収める点
//   view.setView( v )       切り替える。変わったときだけ events へ 'viewchange' を発行する
//   view.toggleView()       もう一方へ切り替える
//   view.isOverview / view.setOverview( bool )   旧 API（そのまま使える）
//   view.update( state )    毎フレーム、カメラの位置・向き・画角と fog を決める（environment.js が先頭で呼ぶ）
// <html data-view="ride|overview"> も更新する（CSS が俯瞰中だけ凡例を出すのに使う）。
// 各モジュールの onViewChange( view ) は、main.js が 'viewchange' を受けて呼ぶ。
//
// カメラはシーン直下に置き、ワールド座標で動かす。
//   一人称：位置は、レール上の進行位置（ride.progress）からレールに沿って SCENE.ride.back だけ後ろの点の真上
//           （レール面 + TRAIN_RAIL_OFFSET + SCENE.ride.height）。向きは車体（train）の向きから、下向きに pitchDeg。
//           車体の傾きはレールの実際の勾配より控えめ（RAIL_SLOPE_RATIO）なので、車体の向きで「後ろ」を回すと、
//           急な上り下りでカメラがレールから浮いたり沈んだりする。そのため位置はレールから直接取る。
//           curve・ride を渡さないときは、従来どおり車体の姿勢から（上へ height、後ろへ back）。
//   俯瞰：  南（+z）から仰角 SCENE.overview.elevationDeg（モードごとの値は elevationByMode）。位置は fitOverview が、
//           螺旋の点（setOverviewSubject）と追加の点（setOverviewExtras。目盛りの壁など）を、画面の端の余白の内側で、
//           HUD のパネルの矩形（実行時に DOM から読む。SCENE.overview.frame）と重ならない最大の大きさに収めるように決める。
//           点が無いときは target から距離 radius / sin( min( 縦画角, 横画角 ) / 2 )。
//   切り替え：MOTION.viewTransitionMs（ease-in-out）で位置・向き・画角・fog を補間する。
//             時刻は state.nowMs。prefers-reduced-motion: reduce では瞬時。

import { Vector3, Quaternion, Matrix4, Euler, MathUtils } from './three.core.js';
import { SCENE, MOTION, TRAIN_RAIL_OFFSET } from './config.js';

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
 * 螺旋の点から構図を決めたあと（view.setOverviewSubject のあと）は、その距離（カメラから螺旋の中心の奥行き）。
 * それまでは、縦横の狭い方の画角に、半径 radius の球が収まる距離。
 */
export function overviewDistance( aspect ) {

	if ( lastFit && Math.abs( lastFit.aspect - aspect ) < 1e-6 ) return lastFit.distance;
	const vfov = overviewFov( aspect ) * DEG;
	const hfov = 2 * Math.atan( Math.tan( vfov / 2 ) * aspect );
	return SCENE.overview.radius / Math.sin( Math.min( vfov, hfov ) / 2 );

}

/**
 * 一人称のカメラを置くレール上の点の progress：progress からレールに沿って back（3D の距離）だけ後ろ。
 * 後ろの点が 0 より前になるときは 0 で止める。
 * @param curve getPointAt と lengthPerProgressAt（その位置での t あたりの水平距離）を持つ曲線（TrackCurve）。
 *        lengthPerProgressAt を持たない曲線では、t あたりの距離を 1 とみなす
 */
export function rideCameraProgress( curve, progress, back = SCENE.ride.back ) {

	if ( progress <= 0 ) return 0;
	progress = Math.min( progress, 1 );
	const length = typeof curve.lengthPerProgressAt === 'function' ? curve.lengthPerProgressAt( progress ) : 1;
	const p = curve.getPointAt( progress );
	const px = p.x, py = p.y, pz = p.z;
	const chord = ( s ) => {

		const q = curve.getPointAt( s );
		return Math.hypot( q.x - px, q.y - py, q.z - pz );

	};

	// 水平に back より少し多く戻った点（3D では back 以上離れている）と進行位置の間で、3D の距離が back になる点を二分法で探す。
	// t あたりの距離は進行位置での値（螺旋では位置によって変わるが、back の範囲ではほぼ一定）。弦は弧より短いので 1 割多く戻る
	let lo = Math.max( 0, progress - 1.1 * back / length ); // 遠い側
	let hi = progress; // 近い側
	if ( chord( lo ) <= back ) return lo; // 始点の近く：0 で止める
	for ( let i = 0; i < 24; i ++ ) {

		const mid = ( lo + hi ) / 2;
		if ( chord( mid ) > back ) lo = mid; else hi = mid;

	}

	return ( lo + hi ) / 2;

}

/**
 * 一人称のカメラの位置：rideCameraProgress の点の真上（レール面 + TRAIN_RAIL_OFFSET + height）。
 * @param out 結果を入れる {x,y,z}（Vector3 など）。そのまま返す
 */
export function rideCameraPosition( curve, progress, out, { back = SCENE.ride.back, height = SCENE.ride.height } = {} ) {

	const p = curve.getPointAt( rideCameraProgress( curve, progress, back ) );
	out.x = p.x;
	out.y = p.y + TRAIN_RAIL_OFFSET + height;
	out.z = p.z;
	return out;

}

/**
 * HUD の配置のモード（hud.css と同じ判定）：'short'（高さ 520 以下かつ横長）／ 'narrow'（幅 720 以下）／
 * 'medium'（721〜1023px。M）／ 'wide'（1024px 以上。L）。
 */
export function overviewMode( width, height ) {

	if ( height <= 520 && width >= height ) return 'short';
	if ( width <= 720 ) return 'narrow';
	if ( width < 1024 ) return 'medium';
	return 'wide';

}

/**
 * 俯瞰の構図の枠：モードから、画面の端の余白（px）、大きさの上限、仰角を返す。
 * HUD のパネルは余白ではなく「避ける矩形」（overviewHudRects、または実行時に DOM から読む）で扱う。
 */
export function overviewFrame( mode ) {

	const frame = SCENE.overview.frame;
	const e = frame.edge[ mode ];
	return {
		insets: { top: e, right: e, bottom: e, left: e },
		maxWidth: frame.maxWidth[ mode ],
		maxHeight: frame.maxHeight[ mode ],
		gapPx: frame.gapPx,
		elevationDeg: SCENE.overview.elevationByMode?.[ mode ] ?? SCENE.overview.elevationDeg
	};

}

/** CSS の配置（left / right / top / bottom / width / height のうち 2 つずつ）を、画面 width x height の矩形にする。 */
function resolveBox( box, width, height ) {

	const x0 = box.left !== undefined ? box.left : width - box.right - box.width;
	const x1 = box.left !== undefined ? ( box.width !== undefined ? box.left + box.width : width - box.right ) : width - box.right;
	const y0 = box.top !== undefined ? box.top : height - box.bottom - box.height;
	const y1 = box.top !== undefined ? ( box.height !== undefined ? box.top + box.height : height - box.bottom ) : height - box.bottom;
	return { left: x0, top: y0, right: x1, bottom: y1 };

}

/**
 * HUD の矩形（CSS px）の既定値。DOM が無いとき（テスト）と、DOM から読めないときに使う（hud.css・readout.css の値）。
 * kind：'sample' はバッジがあり凡例が下がる。'real' は出来事のキャプション（高さ captionReservePx）を足す。
 */
export function overviewHudRects( mode, width, height, kind = null ) {

	const F = SCENE.overview.frame;
	const H = F.hudFallback[ mode ];
	const boxes = [ ...H.common ];
	boxes.push( ...( kind === 'sample' ? H.sample : H.real ) );
	if ( kind === 'real' && H.caption ) boxes.push( typeof H.caption === 'function' ? H.caption( width, height ) : H.caption );
	return boxes.map( ( b ) => resolveBox( b, width, height ) );

}

// ---- 2D の小道具（画面の px。y は下向き）----

/** 点の凸包（反時計回り・時計回りはどちらでもよい）。 */
function convexHull( pts ) {

	const p = pts.slice().sort( ( a, b ) => a.x - b.x || a.y - b.y );
	if ( p.length < 3 ) return p;
	const cross = ( o, a, b ) => ( a.x - o.x ) * ( b.y - o.y ) - ( a.y - o.y ) * ( b.x - o.x );
	const lower = [];
	for ( const q of p ) {

		while ( lower.length >= 2 && cross( lower[ lower.length - 2 ], lower[ lower.length - 1 ], q ) <= 0 ) lower.pop();
		lower.push( q );

	}

	const upper = [];
	for ( let i = p.length - 1; i >= 0; i -- ) {

		const q = p[ i ];
		while ( upper.length >= 2 && cross( upper[ upper.length - 2 ], upper[ upper.length - 1 ], q ) <= 0 ) upper.pop();
		upper.push( q );

	}

	lower.pop();
	upper.pop();
	return lower.concat( upper );

}

/** 凸多角形 poly（頂点の符号付き面積の符号 sign）と矩形 r が重なるか（分離軸）。bbox は poly の外接矩形。 */
function hullHitsRect( poly, sign, bbox, r ) {

	if ( bbox.right <= r.left || bbox.left >= r.right || bbox.bottom <= r.top || bbox.top >= r.bottom ) return false;
	const n = poly.length;
	for ( let i = 0; i < n; i ++ ) {

		const a = poly[ i ], b = poly[ ( i + 1 ) % n ];
		const ex = b.x - a.x, ey = b.y - a.y;
		// 4 隅がすべて辺の外側なら離れている
		const s1 = ( ex * ( r.top - a.y ) - ey * ( r.left - a.x ) ) * sign;
		const s2 = ( ex * ( r.top - a.y ) - ey * ( r.right - a.x ) ) * sign;
		const s3 = ( ex * ( r.bottom - a.y ) - ey * ( r.left - a.x ) ) * sign;
		const s4 = ( ex * ( r.bottom - a.y ) - ey * ( r.right - a.x ) ) * sign;
		if ( s1 < 0 && s2 < 0 && s3 < 0 && s4 < 0 ) return false;

	}

	return true;

}

function signedArea( poly ) {

	let a = 0;
	for ( let i = 0; i < poly.length; i ++ ) {

		const p = poly[ i ], q = poly[ ( i + 1 ) % poly.length ];
		a += p.x * q.y - q.x * p.y;

	}

	return a / 2;

}

function boundsOf( pts ) {

	let left = Infinity, right = - Infinity, top = Infinity, bottom = - Infinity;
	for ( const p of pts ) {

		if ( p.x < left ) left = p.x;
		if ( p.x > right ) right = p.x;
		if ( p.y < top ) top = p.y;
		if ( p.y > bottom ) bottom = p.y;

	}

	return { left, right, top, bottom };

}

/**
 * 俯瞰の構図を決める（three.js 非依存）。向きは南から仰角 elevationDeg で固定し、カメラの位置だけを動かす。
 *
 * 1. 点 points（{x,y,z} の配列）の投影の外接矩形が、画面から insets（px）を引いた範囲の中央に、
 *    幅 maxWidth・高さ maxHeight（画面に対する割合）を超えない最大の大きさで収まる位置を解く。
 *    透視投影なので、奥行きと横のずれを交互に直す反復で解く。
 * 2. obstacles（HUD のパネルの矩形。CSS px、y は下向き）があるときは、点の投影の凸包が、どの矩形
 *    （gapPx 広げたもの）とも重ならない範囲で、最も大きく写る大きさと位置を探す（大きさは二分法、位置は格子）。
 *    同じ大きさで置ける位置が幅を持つときは、その範囲の中央。
 * @returns { position, target, distance, bounds, screen, pxPerUnit, scale }
 *   bounds は点の外接矩形（NDC、-1..1）、screen は同じ矩形の CSS px（y は下向き）、
 *   pxPerUnit は target の奥行きでの 1 単位の大きさ（px）、scale は 1 に対する縮小の割合（obstacles が無いときは 1）
 */
export function fitOverview( points, {
	width, height, fovDeg, elevationDeg, insets, maxWidth = 1, maxHeight = 1,
	obstacles = null, gapPx = 0, iterations = 40
} ) {

	const e = elevationDeg * DEG;
	// 前（カメラ → 螺旋）、右、上
	const f = { x: 0, y: - Math.sin( e ), z: - Math.cos( e ) };
	const r = { x: 1, y: 0, z: 0 };
	const u = { x: 0, y: Math.cos( e ), z: - Math.sin( e ) };
	const tanV = Math.tan( fovDeg * DEG / 2 );
	const tanH = tanV * width / height;

	// 収める範囲（NDC）と大きさの上限
	const sx0 = - 1 + 2 * insets.left / width, sx1 = 1 - 2 * insets.right / width;
	const sy0 = - 1 + 2 * insets.bottom / height, sy1 = 1 - 2 * insets.top / height;
	const aw0 = Math.max( 1e-3, Math.min( sx1 - sx0, 2 * maxWidth ) );
	const ah0 = Math.max( 1e-3, Math.min( sy1 - sy0, 2 * maxHeight ) );

	// 重心
	let gx = 0, gy = 0, gz = 0;
	for ( const p of points ) {

		gx += p.x; gy += p.y; gz += p.z;

	}

	const n = Math.max( 1, points.length );
	gx /= n; gy /= n; gz /= n;

	let d0 = 0;
	for ( const p of points ) d0 = Math.max( d0, Math.hypot( p.x - gx, p.y - gy, p.z - gz ) );
	d0 = d0 / Math.sin( Math.min( Math.atan( tanV ), Math.atan( tanH ) ) ) + 1;

	function measure( C ) {

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

		return { x0, x1, y0, y1 };

	}

	/** 点の外接矩形（NDC）を、中心 (cx, cy)・幅 aw・高さ ah の範囲に、縦横比を保って最大に収める位置。 */
	function solve( cx, cy, aw, ah ) {

		// 初期位置：重心から後ろへ十分に離す
		const C = { x: gx - f.x * d0, y: gy - f.y * d0, z: gz - f.z * d0 };
		let depthG = d0;
		for ( let i = 0; i < iterations; i ++ ) {

			const b = measure( C );
			depthG = ( gx - C.x ) * f.x + ( gy - C.y ) * f.y + ( gz - C.z ) * f.z;
			// 大きさ：重心の奥行きを 1/k にする（近似）
			const k = Math.min( aw / ( b.x1 - b.x0 ), ah / ( b.y1 - b.y0 ) );
			const nextDepth = depthG / k;
			const move = depthG - nextDepth;
			C.x += f.x * move; C.y += f.y * move; C.z += f.z * move;
			// 位置：外接矩形の中心を範囲の中心へ（新しい奥行きで、NDC のずれをワールドの横・縦のずれに直す）
			const mx = ( ( b.x0 + b.x1 ) / 2 ) * k - cx;
			const my = ( ( b.y0 + b.y1 ) / 2 ) * k - cy;
			const sx = mx * nextDepth * tanH, sy = my * nextDepth * tanV;
			C.x += r.x * sx + u.x * sy; C.y += r.y * sx + u.y * sy; C.z += r.z * sx + u.z * sy;
			if ( Math.abs( k - 1 ) < 1e-5 && Math.abs( mx ) < 1e-5 && Math.abs( my ) < 1e-5 ) break;

		}

		const bounds = measure( C );
		depthG = ( gx - C.x ) * f.x + ( gy - C.y ) * f.y + ( gz - C.z ) * f.z;
		const target = { x: C.x + f.x * depthG, y: C.y + f.y * depthG, z: C.z + f.z * depthG };
		const screen = {
			left: ( bounds.x0 + 1 ) / 2 * width, right: ( bounds.x1 + 1 ) / 2 * width,
			top: ( 1 - bounds.y1 ) / 2 * height, bottom: ( 1 - bounds.y0 ) / 2 * height
		};
		return { position: { ...C }, target, distance: depthG, bounds, screen, pxPerUnit: height / ( 2 * depthG * tanV ), scale: 1 };

	}

	/** 構図 fit での点の投影（CSS px）の凸包。 */
	function screenHull( fit ) {

		const C = fit.position;
		const pts = points.map( ( p ) => {

			const vx = p.x - C.x, vy = p.y - C.y, vz = p.z - C.z;
			const depth = Math.max( 1e-3, vx * f.x + vy * f.y + vz * f.z );
			const nx = ( vx * r.x + vy * r.y + vz * r.z ) / ( depth * tanH );
			const ny = ( vx * u.x + vy * u.y + vz * u.z ) / ( depth * tanV );
			return { x: ( nx + 1 ) / 2 * width, y: ( 1 - ny ) / 2 * height };

		} );
		return convexHull( pts );

	}

	const base = solve( ( sx0 + sx1 ) / 2, ( sy0 + sy1 ) / 2, aw0, ah0 );
	if ( ! obstacles || obstacles.length === 0 || points.length < 3 ) return base;

	// 避ける矩形（gapPx 広げる）と、収める範囲（px）
	const rects = obstacles
		.filter( ( o ) => o.right > o.left && o.bottom > o.top )
		.map( ( o ) => ( { left: o.left - gapPx, top: o.top - gapPx, right: o.right + gapPx, bottom: o.bottom + gapPx } ) );
	const safe = { left: insets.left, top: insets.top, right: width - insets.right, bottom: height - insets.bottom };

	// 基準の構図での凸包（外接矩形の中心からの相対位置）。大きさ s・中心 c の候補では c + s·rel に写ると近似する
	const hull0 = screenHull( base );
	const b0 = boundsOf( hull0 );
	const w0 = b0.right - b0.left, h0 = b0.bottom - b0.top;
	const c0x = ( b0.left + b0.right ) / 2, c0y = ( b0.top + b0.bottom ) / 2;
	const rel = hull0.map( ( p ) => ( { x: p.x - c0x, y: p.y - c0y } ) );
	const sign = Math.sign( signedArea( hull0 ) ) || 1;
	const poly = rel.map( () => ( { x: 0, y: 0 } ) );

	function fits( s, cx, cy ) {

		for ( let i = 0; i < rel.length; i ++ ) {

			poly[ i ].x = cx + s * rel[ i ].x;
			poly[ i ].y = cy + s * rel[ i ].y;

		}

		const bb = { left: cx - s * w0 / 2, right: cx + s * w0 / 2, top: cy - s * h0 / 2, bottom: cy + s * h0 / 2 };
		for ( const rc of rects ) if ( hullHitsRect( poly, sign, bb, rc ) ) return false;
		return true;

	}

	/**
	 * 大きさ s で置ける位置（無ければ null）。置ける位置（格子の点）の重心に最も近い点。
	 * 置ける範囲が広いとき（大きさが上限で決まるとき）は、HUD に挟まれた空きの中央に来る。
	 */
	function placeAt( s, steps = 24 ) {

		const hw = s * w0 / 2, hh = s * h0 / 2;
		const xa = safe.left + hw, xb = safe.right - hw, ya = safe.top + hh, yb = safe.bottom - hh;
		if ( xa > xb + 1e-6 || ya > yb + 1e-6 ) return null;
		const ok = [];
		const nx = xb - xa < 1e-6 ? 0 : steps, ny = yb - ya < 1e-6 ? 0 : steps;
		for ( let i = 0; i <= nx; i ++ ) {

			const cx = nx ? xa + ( xb - xa ) * i / nx : ( xa + xb ) / 2;
			for ( let j = 0; j <= ny; j ++ ) {

				const cy = ny ? ya + ( yb - ya ) * j / ny : ( ya + yb ) / 2;
				if ( fits( s, cx, cy ) ) ok.push( { x: cx, y: cy } );

			}

		}

		if ( ok.length === 0 ) return null;
		let mx = 0, my = 0;
		for ( const p of ok ) {

			mx += p.x; my += p.y;

		}

		mx /= ok.length; my /= ok.length;
		let best = ok[ 0 ], bestD = Infinity;
		for ( const p of ok ) {

			const d = ( p.x - mx ) ** 2 + ( p.y - my ) ** 2;
			if ( d < bestD ) {

				best = p;
				bestD = d;

			}

		}

		return best;

	}

	// 大きさを二分法で（1 は基準の構図の大きさ）
	let lo = 0, hi = 1, place = placeAt( 1 );
	if ( place ) lo = 1;
	else {

		const sMin = SCENE.overview.frame.minScale;
		const atMin = placeAt( sMin );
		if ( ! atMin ) return base; // どこにも置けない（極端に小さい画面）：HUD を無視する
		lo = sMin;
		place = atMin;
		for ( let i = 0; i < 14; i ++ ) {

			const mid = ( lo + hi ) / 2;
			const p = placeAt( mid );
			if ( p ) {

				lo = mid;
				place = p;

			} else hi = mid;

		}

	}

	// 決めた大きさと位置で解き直し、実際の投影で確かめる（透視のゆがみで少しはみ出すときは縮める）
	let s = lo;
	let fit = null;
	for ( let i = 0; i < 16; i ++ ) {

		const cx = place.x / width * 2 - 1, cy = 1 - place.y / height * 2;
		fit = solve( cx, cy, 2 * s * w0 / width, 2 * s * h0 / height );
		const hull = screenHull( fit );
		const bb = boundsOf( hull );
		const sg = Math.sign( signedArea( hull ) ) || 1;
		const inside = bb.left >= safe.left - 0.5 && bb.right <= safe.right + 0.5 && bb.top >= safe.top - 0.5 && bb.bottom <= safe.bottom + 0.5;
		const shrunk = rects.map( ( rc ) => ( { left: rc.left + 0.5, top: rc.top + 0.5, right: rc.right - 0.5, bottom: rc.bottom - 0.5 } ) );
		if ( inside && ! shrunk.some( ( rc ) => hullHitsRect( hull, sg, bb, rc ) ) ) break;
		s *= 0.985;
		place = placeAt( s ) ?? place;

	}

	fit.scale = s;
	return fit;

}

function prefersReducedMotion() {

	return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
		&& window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

}

export function createView( { scene, camera, train, events = null, curve = null, ride = null, kind = null } ) {

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

	// 俯瞰の構図に収める点（curtain.js が setOverviewSubject で渡す）、追加の点（setOverviewExtras。key ごと）、
	// 解いた構図のキャッシュ
	let subject = null;
	const extras = new Map();
	let fitPoints = null;
	let fitKey = '';
	let fit = null;

	// データの種類（'sample' | 'real'）。main.js が dataset.meta.kind を渡す。無いときは <html data-kind>
	function dataKind() {

		if ( kind ) return kind;
		return typeof document !== 'undefined' ? document.documentElement.dataset.kind ?? null : null;

	}

	function viewportSize( aspect ) {

		if ( typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0 ) {

			return { width: window.innerWidth, height: window.innerHeight };

		}

		return { width: 1000 * aspect, height: 1000 };

	}

	// ---- HUD の矩形（CSS px）----
	// DOM があれば、SCENE.overview.frame.hudSelectors の要素の位置を読む（他の担当がパネルの大きさを変えても追従する）。
	// 読むのは、画面の大きさが変わったとき・パネルの大きさが変わったとき（ResizeObserver）・俯瞰へ切り替えたとき
	// （M と短い横長では、俯瞰のあいだキャプションの場所が変わる。annotations.css）。毎フレームは読まない。
	// キャプションは中身の有無で高さが変わるので、スロットの端（下寄せなら下端、上寄せなら上端）から captionReservePx を確保する。
	// DOM が無いとき（テスト）は overviewHudRects（hud.css の値）。
	let hudRects = null;
	let hudDirty = true;
	let hudObserver = null;
	const hasDom = typeof document !== 'undefined' && typeof document.querySelector === 'function';

	function readHudRects( width, height ) {

		const F = SCENE.overview.frame;
		const rects = [];
		let found = 0;
		for ( const selector of F.hudSelectors ) {

			for ( const el of document.querySelectorAll( selector ) ) {

				found ++;
				const b = el.getBoundingClientRect();
				if ( b.width > 0 && b.height > 0 ) rects.push( { left: b.left, top: b.top, right: b.right, bottom: b.bottom } );

			}

		}

		if ( dataKind() === 'real' ) {

			const el = document.querySelector( F.captionSelector );
			if ( el ) {

				found ++;
				const b = el.getBoundingClientRect();
				if ( b.width > 0 ) {

					const reserve = F.captionReservePx;
					// 画面の下半分にあるスロットは下寄せ（上へ伸びる）、上半分は上寄せ（下へ伸びる）
					rects.push( ( b.top + b.bottom ) / 2 > height / 2
						? { left: b.left, right: b.right, top: Math.min( b.top, b.bottom - reserve ), bottom: b.bottom }
						: { left: b.left, right: b.right, top: b.top, bottom: Math.max( b.bottom, b.top + reserve ) } );

				}

			}

		}

		if ( found === 0 ) return overviewHudRects( overviewMode( width, height ), width, height, dataKind() );
		return rects.map( ( r ) => ( {
			left: Math.round( r.left ), top: Math.round( r.top ), right: Math.round( r.right ), bottom: Math.round( r.bottom )
		} ) );

	}

	function observeHud() {

		if ( hudObserver || ! hasDom || typeof ResizeObserver !== 'function' ) return;
		hudObserver = new ResizeObserver( () => {

			hudDirty = true;

		} );
		for ( const selector of SCENE.overview.frame.hudSelectors ) {

			for ( const el of document.querySelectorAll( selector ) ) hudObserver.observe( el );

		}

	}

	function currentHudRects( width, height ) {

		if ( ! hasDom ) return overviewHudRects( overviewMode( width, height ), width, height, dataKind() );
		if ( hudDirty || ! hudRects ) {

			hudRects = readHudRects( width, height );
			hudDirty = false;
			observeHud();

		}

		return hudRects;

	}

	if ( typeof window !== 'undefined' && typeof window.addEventListener === 'function' ) {

		window.addEventListener( 'resize', () => {

			hudDirty = true;

		} );

	}

	function collectFitPoints() {

		if ( ! subject ) return null;
		const all = subject.slice();
		for ( const list of extras.values() ) all.push( ...list );
		return all;

	}

	function currentFit( aspect ) {

		if ( ! fitPoints ) return null;
		const { width, height } = viewportSize( aspect );
		const obstacles = currentHudRects( width, height );
		const key = `${width}x${height}:${aspect.toFixed( 6 )}:${dataKind()}:${JSON.stringify( obstacles )}`;
		if ( key !== fitKey ) {

			const mode = overviewMode( width, height );
			const frame = overviewFrame( mode );
			fit = fitOverview( fitPoints, {
				width,
				height,
				fovDeg: overviewFov( aspect ),
				elevationDeg: frame.elevationDeg,
				insets: frame.insets,
				maxWidth: frame.maxWidth,
				maxHeight: frame.maxHeight,
				gapPx: frame.gapPx,
				obstacles
			} );
			fit.aspect = aspect;
			fit.mode = mode;
			fit.obstacles = obstacles;
			fitKey = key;
			lastFit = fit;

		}

		return fit;

	}

	function invalidateFit() {

		fitPoints = collectFitPoints();
		fitKey = '';
		fit = null;
		if ( ! fitPoints ) lastFit = null;

	}

	function placeCamera() {

		const aspect = camera.aspect;

		// 一人称：位置はレールの少し後ろの点の真上、向きは車体の向き（train は main.js がこのフレームの ride の値にしてある）
		if ( curve && ride ) rideCameraPosition( curve, ride.progress, ridePosition );
		else ridePosition.set( 0, SCENE.ride.height, SCENE.ride.back ).applyQuaternion( train.quaternion ).add( train.position );
		pitch.setFromEuler( pitchEuler.set( ( aspect < 1 ? SCENE.ride.pitchDegPortrait : SCENE.ride.pitchDeg ) * DEG, 0, 0 ) );
		rideQuaternion.copy( train.quaternion ).multiply( pitch );

		// 俯瞰：螺旋の点があれば、HUD を避けた範囲に収める構図（画面の大きさが変わったときだけ解き直す）
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
		/** 俯瞰のカメラから螺旋の中心までの距離（いまの画面の大きさでの値）。 */
		get overviewDistance() {

			return overviewDistance( camera.aspect );

		},
		/** 俯瞰の構図（fitOverview の結果。螺旋の点が無いときは null）。 */
		get overviewFit() {

			return currentFit( camera.aspect );

		},
		/** 俯瞰で画面に収める点（{x,y,z} の配列。螺旋）。構図を解き直す。 */
		setOverviewSubject( points ) {

			subject = points && points.length ? points.map( ( p ) => ( { x: p.x, y: p.y, z: p.z } ) ) : null;
			invalidateFit();
			placeCamera();

		},
		/**
		 * 螺旋のほかに俯瞰の画面へ収める点（{x,y,z} の配列。目盛りの壁と値ラベルの軸など）。key ごとに上書きし、
		 * 空の配列（または null）で取り消す。構図を解き直す。
		 */
		setOverviewExtras( key, points ) {

			if ( points && points.length ) extras.set( key, points.map( ( p ) => ( { x: p.x, y: p.y, z: p.z } ) ) );
			else extras.delete( key );
			invalidateFit();
			placeCamera();

		},
		/** 俯瞰の構図が避けている HUD の矩形（CSS px）。 */
		get overviewObstacles() {

			const { width, height } = viewportSize( camera.aspect );
			return currentHudRects( width, height );

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

			reflectInDocument();
			// 俯瞰へ移るときは HUD の位置を読み直す（俯瞰のあいだだけキャプションの場所が変わるモードがある）。
			// 一人称へ戻るときは読み直さない（補間の途中で俯瞰の構図が動かないように）
			if ( current === 'overview' ) hudDirty = true;
			placeCamera();
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
