// カーテン（レールの真下に、床からレールの高さまで張る縦の半透明の面）と、俯瞰のときだけ出すレール上端の帯。
// 機能モジュール（createCurtain( ctx )）。値は config.js の RAIL.curtain / RAIL.topBand。
//
// ■ ねらい
//   面積グラフを立体にしたような見た目にして、俯瞰で「値の折れ線を立体で見ている」ことを伝える。
//   俯瞰ではレールが細い線にしか見えないので、レールの上端に床と平行な幅のある帯（topBand）を重ねる。
//
// ■ ジオメトリ（分割数 D。レールと同じ分割数 rail.userData.divisions）
//   曲線は弧長（水平）で引ける curve.arcCurve を渡す。区間 s（0..D-1）は弧長の割合 f ∈ [ s/D, (s+1)/D ]。区間ごとに 4 頂点を持ち（隣の区間と頂点を共有しない）、2 三角形を張る。
//     カーテン：頂点 4s + 0 = 上端( t0 )、+1 = 下端( t0 )、+2 = 上端( t1 )、+3 = 下端( t1 )
//               上端 = arcCurve.getPointAt( f )、下端 = 同じ x, z で y = 0（床）
//     帯：      頂点 4s + 0 = 左( t0 )、+1 = 右( t0 )、+2 = 左( t1 )、+3 = 右( t1 )
//               上端の点から、水平の法線方向へ ±width/2。高さは上端 + lift
//   頂点カラーは RGBA（itemSize 4）。カーテンは上端が濃く、床へ向かって薄くなる（alpha のグラデーション）。
//
// ■ 色の更新（rail-colors.js の createRailPainter と同じ考え方）
//   走行済み = ( s + 1 ) / D <= f の区間（f は進行位置を弧長の割合に直したもの：curve.arcFractionAt( progress )）。
//   毎フレーム、前回から変わった区間の頂点だけを書き換え、addUpdateRange で転送範囲を登録する。
//
// ■ 描画
//   カーテンは AdditiveBlending・depthWrite: false・DoubleSide。加算なので、面どうしが重なっても描画順で色が変わらない。
//   renderOrder をグリッド・足跡（0）より後にして、カーテンの奥のグリッド線がカーテンの手前に描かれないようにする。
//   一人称では opacity を下げ（rideOpacity）、手前のカーテンが前方のレールを隠さないようにする。
//   帯は俯瞰のときだけ。視点切り替えの補間（view.blend）に合わせてフェードする。
//
// ■ 俯瞰の構図
//   ここで曲線を標本化した点（レールの上端と床）を view.setOverviewSubject に渡し、view.js が HUD を避けた範囲に螺旋を収める。
//
// ジオメトリと塗り分けは three.js のレンダラに依存しない（three.core.js だけ）ので、Node のテストからも読める。

import {
	BufferGeometry, BufferAttribute, Color, DynamicDrawUsage, Mesh, MeshBasicMaterial,
	DoubleSide, AdditiveBlending, NormalBlending
} from './three.core.js';
import { PALETTE, RAIL, TRACK_SAMPLING, divisionsFor } from './config.js';
import { RAIL_STATE, riddenSegmentCount } from './rail-colors.js';

export const VERTS_PER_SEGMENT = 4;
export const TRIANGLES_PER_SEGMENT = 2;

/** 区間 s の先頭の頂点番号。 */
export function curtainSegmentStart( s ) {

	return VERTS_PER_SEGMENT * s;

}

function buildIndex( divisions ) {

	const index = new Uint32Array( divisions * TRIANGLES_PER_SEGMENT * 3 );
	for ( let s = 0; s < divisions; s ++ ) {

		const v = VERTS_PER_SEGMENT * s, i = 6 * s;
		// ( a0, b0, a1 ) と ( b0, b1, a1 )
		index[ i ] = v; index[ i + 1 ] = v + 1; index[ i + 2 ] = v + 2;
		index[ i + 3 ] = v + 1; index[ i + 4 ] = v + 3; index[ i + 5 ] = v + 2;

	}

	return index;

}

/** 列 i（0..D）の i / D における曲線の点を { x, y, z } で返す（getPointAt は共有のベクトルを返すので値をコピーする）。 */
function sampleColumns( curve, divisions ) {

	const xs = new Float64Array( divisions + 1 );
	const ys = new Float64Array( divisions + 1 );
	const zs = new Float64Array( divisions + 1 );
	for ( let i = 0; i <= divisions; i ++ ) {

		const p = curve.getPointAt( i / divisions );
		xs[ i ] = p.x; ys[ i ] = p.y; zs[ i ] = p.z;

	}

	return { xs, ys, zs };

}

/**
 * カーテンのジオメトリ（position と RGBA の color、index）。色は paint で塗る（作った直後は 0）。
 * curve は等間隔に標本化する曲線（弧長で引ける curve.arcCurve）。
 * userData：{ divisions, role }。role[ v ] は 0 = 上端、1 = 下端。
 */
export function createCurtainGeometry( curve, divisions ) {

	const { xs, ys, zs } = sampleColumns( curve, divisions );
	const count = VERTS_PER_SEGMENT * divisions;
	const position = new Float32Array( count * 3 );
	const role = new Uint8Array( count );

	for ( let s = 0; s < divisions; s ++ ) {

		for ( let k = 0; k < 2; k ++ ) {

			const i = s + k; // 列
			const top = ( VERTS_PER_SEGMENT * s + 2 * k ) * 3;
			const bottom = top + 3;
			position[ top ] = xs[ i ]; position[ top + 1 ] = ys[ i ]; position[ top + 2 ] = zs[ i ];
			position[ bottom ] = xs[ i ]; position[ bottom + 1 ] = 0; position[ bottom + 2 ] = zs[ i ];
			role[ VERTS_PER_SEGMENT * s + 2 * k + 1 ] = 1;

		}

	}

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( position, 3 ) );
	geometry.setAttribute( 'color', new BufferAttribute( new Float32Array( count * 4 ), 4 ) );
	geometry.setIndex( new BufferAttribute( buildIndex( divisions ), 1 ) );
	geometry.computeBoundingSphere();
	geometry.userData = { divisions, role };
	return geometry;

}

/**
 * レール上端の帯のジオメトリ（床と平行、幅 width、高さは上端 + lift）。
 * 法線は水平の接線（curve.getTangentAt）を 90° 回したもの。区間の両端で隣の区間と同じ点を使うので、帯は切れ目なくつながる。
 */
export function createTopBandGeometry( curve, divisions, { width = 2, lift = 0.15 } = {} ) {

	const { xs, ys, zs } = sampleColumns( curve, divisions );
	const nx = new Float64Array( divisions + 1 );
	const nz = new Float64Array( divisions + 1 );
	for ( let i = 0; i <= divisions; i ++ ) {

		const tg = curve.getTangentAt( i / divisions );
		const len = Math.hypot( tg.x, tg.z ) || 1;
		nx[ i ] = - tg.z / len; nz[ i ] = tg.x / len;

	}

	const half = width / 2;
	const count = VERTS_PER_SEGMENT * divisions;
	const position = new Float32Array( count * 3 );
	const role = new Uint8Array( count ); // 帯は全頂点が「上端」と同じ扱い（alpha も同じ）

	for ( let s = 0; s < divisions; s ++ ) {

		for ( let k = 0; k < 2; k ++ ) {

			const i = s + k;
			const a = ( VERTS_PER_SEGMENT * s + 2 * k ) * 3;
			const b = a + 3;
			const y = ys[ i ] + lift;
			position[ a ] = xs[ i ] + nx[ i ] * half; position[ a + 1 ] = y; position[ a + 2 ] = zs[ i ] + nz[ i ] * half;
			position[ b ] = xs[ i ] - nx[ i ] * half; position[ b + 1 ] = y; position[ b + 2 ] = zs[ i ] - nz[ i ] * half;

		}

	}

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( position, 3 ) );
	geometry.setAttribute( 'color', new BufferAttribute( new Float32Array( count * 4 ), 4 ) );
	geometry.setIndex( new BufferAttribute( buildIndex( divisions ), 1 ) );
	geometry.computeBoundingSphere();
	geometry.userData = { divisions, role };
	return geometry;

}

const linear = ( hex ) => {

	const c = new Color( hex ); // sRGB の hex → linear
	return [ c.r, c.g, c.b ];

};

/** カーテンの塗り（[ 状態 ] = { rgb, alpha: [ 上端, 下端 ] }）。 */
export function curtainPaletteFrom( palette = PALETTE, options = RAIL.curtain ) {

	const { topAlpha, bottomAlpha } = options;
	const colors = [];
	colors[ RAIL_STATE.AHEAD ] = { rgb: linear( palette.contour ), alpha: [ topAlpha, bottomAlpha ] };
	colors[ RAIL_STATE.RIDDEN ] = { rgb: linear( palette.railRiddenYellow ), alpha: [ topAlpha, bottomAlpha ] };
	return colors;

}

/** 上端の帯の塗り（alpha は 1。全体の濃さは材質の opacity でフェードする）。 */
export function topBandPaletteFrom( palette = PALETTE ) {

	const colors = [];
	colors[ RAIL_STATE.AHEAD ] = { rgb: linear( palette.railAheadWhite ), alpha: [ 1, 1 ] };
	colors[ RAIL_STATE.RIDDEN ] = { rgb: linear( palette.railRiddenWhite ), alpha: [ 1, 1 ] };
	return colors;

}

/** 区間 s の状態。 */
function stateOf( s, riddenCount ) {

	return s < riddenCount ? RAIL_STATE.RIDDEN : RAIL_STATE.AHEAD;

}

/**
 * カーテン（または帯）の頂点カラーの塗り分け。
 *   paintAll( fraction )  全体を塗る（最初と「最初から」）
 *   update( fraction )    前回から変わった区間だけ塗る。戻り値は { segments, vertices }
 *   riddenCount           いま走行済みの区間数
 * fraction は弧長の割合（0..1。curve.arcFractionAt( progress )）。
 *
 * @param geometry createCurtainGeometry / createTopBandGeometry の戻り値
 * @param options  { colors: curtainPaletteFrom() などの戻り値 }
 */
export function createCurtainPainter( geometry, { colors } ) {

	const { divisions, role } = geometry.userData;
	const attribute = geometry.getAttribute( 'color' );
	const array = attribute.array;

	let riddenCount = 0;
	let fullUploadPending = false;

	function paintRange( s0, s1, count ) {

		for ( let s = s0; s < s1; s ++ ) {

			const { rgb, alpha } = colors[ stateOf( s, count ) ];
			for ( let v = VERTS_PER_SEGMENT * s, e = v + VERTS_PER_SEGMENT; v < e; v ++ ) {

				const o = v * 4;
				array[ o ] = rgb[ 0 ];
				array[ o + 1 ] = rgb[ 1 ];
				array[ o + 2 ] = rgb[ 2 ];
				array[ o + 3 ] = alpha[ role[ v ] ];

			}

		}

		return ( s1 - s0 ) * VERTS_PER_SEGMENT;

	}

	function paintAll( fraction = 0 ) {

		riddenCount = riddenSegmentCount( fraction, divisions );
		paintRange( 0, divisions, riddenCount );
		attribute.clearUpdateRanges(); // 範囲なし = 全体を転送
		attribute.needsUpdate = true;
		fullUploadPending = true;
		return { segments: divisions, vertices: divisions * VERTS_PER_SEGMENT };

	}

	function update( fraction ) {

		const next = riddenSegmentCount( fraction, divisions );
		const prev = riddenCount;
		let result = { segments: 0, vertices: 0 };

		if ( next !== prev ) {

			const s0 = Math.min( prev, next ), s1 = Math.max( prev, next );
			const vertices = paintRange( s0, s1, next );
			riddenCount = next;
			if ( ! fullUploadPending ) attribute.addUpdateRange( VERTS_PER_SEGMENT * s0 * 4, vertices * 4 );
			attribute.needsUpdate = true;
			result = { segments: s1 - s0, vertices };

		}

		fullUploadPending = false;
		return result;

	}

	return {
		attribute,
		paintAll,
		update,
		get riddenCount() {

			return riddenCount;

		}
	};

}

/** 俯瞰の構図に使う点：曲線（弧長で引ける curve.arcCurve）を count 等分した上端（レールの高さ）と床の点。終点も含める。 */
export function overviewSubjectPoints( curve, count = 480 ) {

	const points = [];
	for ( let i = 0; i <= count; i ++ ) {

		const p = curve.getPointAt( i / count );
		points.push( { x: p.x, y: p.y, z: p.z }, { x: p.x, y: 0, z: p.z } );

	}

	return points;

}

const smoothstep = ( e0, e1, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - e0 ) / ( e1 - e0 ) ) );
	return t * t * ( 3 - 2 * t );

};

export function createCurtain( ctx ) {

	const { scene, curve, ride, view } = ctx;
	const C = RAIL.curtain;
	const B = RAIL.topBand;
	const arc = curve.arcCurve;
	// レールと同じ分割数（rail.js が先に作る。無いときは全長から）
	const divisions = scene.getObjectByName( 'rail' )?.userData.divisions ?? divisionsFor( curve.totalLength, TRACK_SAMPLING.railSegment );
	const fractionOf = ( progress ) => curve.arcFractionAt( progress );

	// カーテン
	const curtainGeometry = createCurtainGeometry( arc, divisions );
	curtainGeometry.getAttribute( 'color' ).setUsage( DynamicDrawUsage );
	const curtainMaterial = new MeshBasicMaterial( {
		vertexColors: true,
		transparent: true,
		opacity: C.rideOpacity,
		blending: AdditiveBlending,
		depthWrite: false,
		side: DoubleSide
	} );
	const curtain = new Mesh( curtainGeometry, curtainMaterial );
	curtain.name = 'curtain';
	curtain.renderOrder = C.renderOrder;
	curtain.frustumCulled = false; // 一人称で螺旋の内側にいても、境界球の判定で消えないように
	scene.add( curtain );

	// 俯瞰のときだけの上端の帯
	const bandGeometry = createTopBandGeometry( arc, divisions, { width: B.width, lift: B.lift } );
	bandGeometry.getAttribute( 'color' ).setUsage( DynamicDrawUsage );
	const bandMaterial = new MeshBasicMaterial( {
		vertexColors: true,
		transparent: true,
		opacity: 0,
		blending: NormalBlending,
		depthWrite: false,
		side: DoubleSide
	} );
	const band = new Mesh( bandGeometry, bandMaterial );
	band.name = 'curtain-top-band';
	band.renderOrder = B.renderOrder;
	band.visible = false;
	scene.add( band );

	const curtainPainter = createCurtainPainter( curtainGeometry, { colors: curtainPaletteFrom() } );
	const bandPainter = createCurtainPainter( bandGeometry, { colors: topBandPaletteFrom() } );
	curtainPainter.paintAll( fractionOf( ride.progress ) );
	bandPainter.paintAll( fractionOf( ride.progress ) );

	// 俯瞰の構図：螺旋の点を view に渡す（view.js が HUD を避けた範囲に収める）
	view.setOverviewSubject?.( overviewSubjectPoints( arc ) );

	// 計測用（デバッグ）：直近に書き換えたフレームの頂点数と所要時間、その最大。三角形の数
	const stats = {
		vertices: 0, ms: 0, maxVertices: 0, maxMs: 0,
		triangles: ( divisions + divisions ) * TRIANGLES_PER_SEGMENT
	};
	curtain.userData.colorStats = stats;

	let currentView = view.current;

	function applyView( blend ) {

		// カーテン：一人称は薄く、俯瞰は濃く
		curtainMaterial.opacity = C.rideOpacity + ( C.overviewOpacity - C.rideOpacity ) * blend;
		// 帯：補間の後半でだけ現れる（一人称の近くでは出さない）
		const k = smoothstep( B.fadeFrom, 1, blend );
		bandMaterial.opacity = k;
		band.visible = k > 0.001;

	}

	applyView( typeof view.blend === 'number' ? view.blend : ( currentView === 'overview' ? 1 : 0 ) );

	return {
		curtain,
		band,
		update( state ) {

			const t0 = performance.now();
			const f = fractionOf( state.progress );
			const a = curtainPainter.update( f );
			const b = bandPainter.update( f );
			const vertices = a.vertices + b.vertices;
			if ( vertices > 0 ) {

				stats.vertices = vertices;
				stats.ms = performance.now() - t0;
				stats.maxVertices = Math.max( stats.maxVertices, vertices );
				stats.maxMs = Math.max( stats.maxMs, stats.ms );

			}

			applyView( typeof view.blend === 'number' ? view.blend : ( currentView === 'overview' ? 1 : 0 ) );

		},
		onViewChange( next ) {

			currentView = next;

		},
		onReset() {

			curtainPainter.paintAll( fractionOf( ride.progress ) );
			bandPainter.paintAll( fractionOf( ride.progress ) );

		},
		dispose() {

			for ( const mesh of [ curtain, band ] ) {

				scene.remove( mesh );
				mesh.geometry.dispose();
				mesh.material.dispose();

			}

		}
	};

}
