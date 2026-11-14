// レールの色分け（これから・走行済み）。機能モジュール（createRailColors( ctx )）。担当：レールの色分け。
// レールは ctx.scene.getObjectByName( 'rail' )（rail.js が作る RollerCoasterGeometry）。
//
// ■ RollerCoasterGeometry の color 属性の並び（同梱 assets/jsm/misc/RollerCoaster.js を読んで確かめたもの）
//   非インデックスの三角形リストで、1 頂点 = RGB 3 float。生成ループ i = 1..D（D = 分割数）の 1 回分を
//   「区間 s = i - 1」と呼ぶ。区間 s は t ∈ ( s/D, (s+1)/D ] のレールを表す。区間ごとに次の順で頂点が積まれる。
//
//     [枕木     12] … s が奇数（i が偶数）のときだけ。drawShape( step )：表 6 + 裏 6（元の色は黄 1,1,0）
//     [中央の管 30] … extrudeShape( tube1 )：5 角形 × 6 頂点（黄）
//     [右レール 36] … extrudeShape( tube2, +0.2 )：6 角形 × 6 頂点（白 1,1,1）
//     [左レール 36] … extrudeShape( tube2, -0.2 )：6 角形 × 6 頂点（白）
//
//   区間の頂点数は 102（s 偶数）/ 114（s 奇数）。2 区間で 216 の周期。
//     区間 s の先頭頂点 = 102·s + 12·floor( s/2 )、総頂点数 = 102·D + 12·floor( D/2 )（D = 1500 で 162,000）
//   区間の中では「枕木 + 中央の管」（構造部）が先、「レール 2 本」が後ろに連続するので、1 区間は 2 つの連続範囲で塗れる。
//
// ■ 状態
//   レールは弧長（水平）で等間隔に標本化してある（rail.js が curve.arcCurve を渡す）。区間 s は弧長の割合 ( s/D, (s+1)/D ]。
//   進行位置 progress（時間に比例）は、curve.arcFractionAt で弧長の割合 f に直してから区間を決める。
//   走行済み：( s + 1 ) / D <= f（区間を丸ごと通り過ぎた）。
//   これから：それ以外。
//
// ■ 更新
//   毎フレーム、前回の走行済み区間数から今回の区間数までの差分だけを書き換え、addUpdateRange で転送範囲を登録する。
//   全体を塗ったあとの最初のフレーム（最初と「最初から」）では範囲を登録しない
//   （範囲なし = 全体を転送。同じフレームで範囲が混ざると、その範囲だけの転送になってしまう）。
//   色は THREE.Color を通す（sRGB の hex → linear。hex を 255 で割っただけの値は入れない）。
//
// three.js のレンダラに依存しない（Color と DynamicDrawUsage は three.core.js から読む）ので、Node のテストからも読める。

import { Color, DynamicDrawUsage } from './three.core.js';
import { PALETTE } from './config.js';

export const PART = Object.freeze( { SLEEPER: 0, TUBE: 1, RAIL_RIGHT: 2, RAIL_LEFT: 3 } );
export const RAIL_STATE = Object.freeze( { AHEAD: 0, RIDDEN: 1 } );

export const SLEEPER_VERTS = 6 * 2;
export const TUBE_VERTS = 5 * 6;
export const RAIL_VERTS = 6 * 6;
export const EVEN_SEGMENT_VERTS = TUBE_VERTS + RAIL_VERTS * 2; // 102
export const ODD_SEGMENT_VERTS = EVEN_SEGMENT_VERTS + SLEEPER_VERTS; // 114
const PAIR_VERTS = EVEN_SEGMENT_VERTS + ODD_SEGMENT_VERTS; // 216

/** 区間 s の先頭の頂点番号（s = D なら総頂点数）。 */
export function segmentStartIndex( s ) {

	return EVEN_SEGMENT_VERTS * s + SLEEPER_VERTS * Math.floor( s / 2 );

}

/** 分割数 D のときの総頂点数。 */
export function railVertexCount( divisions ) {

	return segmentStartIndex( divisions );

}

/** 弧長の割合 f（0..1）のときに走行済みになっている区間の数（先頭からの連続）。 */
export function riddenSegmentCount( fraction, divisions ) {

	if ( ! ( fraction > 0 ) ) return 0;
	return Math.min( divisions, Math.floor( fraction * divisions + 1e-9 ) );

}

/** 区間 s の状態（RAIL_STATE）。 */
export function segmentState( s, riddenCount ) {

	return s < riddenCount ? RAIL_STATE.RIDDEN : RAIL_STATE.AHEAD;

}

/**
 * 生成済みの RollerCoasterGeometry から、頂点番号と区間・部位の対応表を作る。
 * 頂点数が式と合わない（同梱ファイルが変わったなど）ときは例外を投げる。
 */
export function buildRailColorMap( geometry, divisions ) {

	const color = geometry.getAttribute( 'color' );
	const D = divisions;
	const expected = railVertexCount( D );

	if ( ! color || color.count !== expected ) {

		throw new Error( `rail-colors: color 属性の頂点数 ${color && color.count} が想定 ${expected} と一致しません（divisions=${D}）` );

	}

	const segmentStart = new Uint32Array( D + 1 );
	const structureEnd = new Uint32Array( D ); // 区間 s の構造部（枕木 + 中央の管）は [ segmentStart[s], structureEnd[s] )
	for ( let s = 0; s < D; s ++ ) {

		segmentStart[ s ] = segmentStartIndex( s );
		structureEnd[ s ] = segmentStart[ s ] + ( s & 1 ? SLEEPER_VERTS : 0 ) + TUBE_VERTS;

	}

	segmentStart[ D ] = expected;

	function segmentOf( vi ) {

		const pair = Math.floor( vi / PAIR_VERTS );
		return 2 * pair + ( vi % PAIR_VERTS < EVEN_SEGMENT_VERTS ? 0 : 1 );

	}

	function partOf( vi ) {

		const s = segmentOf( vi );
		let r = vi - segmentStart[ s ];
		if ( s & 1 ) {

			if ( r < SLEEPER_VERTS ) return PART.SLEEPER;
			r -= SLEEPER_VERTS;

		}

		if ( r < TUBE_VERTS ) return PART.TUBE;
		return r < TUBE_VERTS + RAIL_VERTS ? PART.RAIL_RIGHT : PART.RAIL_LEFT;

	}

	return { divisions: D, vertexCount: expected, segmentStart, structureEnd, segmentOf, partOf };

}

/** 仕様 1-2 の配色（PALETTE）を、塗りに使う linear の RGB にする。[ 状態 ][ 0 = 構造部, 1 = レール ] */
export function railPaletteFrom( palette = PALETTE ) {

	const rgb = ( hex ) => {

		const c = new Color( hex ); // sRGB の hex → linear（ColorManagement）
		return [ c.r, c.g, c.b ];

	};

	const colors = [];
	colors[ RAIL_STATE.AHEAD ] = [ rgb( palette.railAheadYellow ), rgb( palette.railAheadWhite ) ];
	colors[ RAIL_STATE.RIDDEN ] = [ rgb( palette.railRiddenYellow ), rgb( palette.railRiddenWhite ) ];
	return colors;

}

/**
 * レールの塗り分けを受け持つ（three.js のレンダラに依存しない部分）。
 *   paintAll( fraction )  全体を塗る（走行済みも含めて一度で）。最初と「最初から」で使う
 *   update( fraction )    前回からの差分の区間だけを塗る。戻り値は { segments, vertices }
 *   riddenCount           いま走行済みの区間数
 * fraction は弧長の割合（0..1。curve.arcFractionAt( progress )）。
 *
 * @param geometry  RollerCoasterGeometry（弧長で等間隔に標本化したもの）
 * @param divisions 生成時の分割数
 * @param options   { palette?: PALETTE と同じ形 }
 */
export function createRailPainter( geometry, divisions, { palette } = {} ) {

	const map = buildRailColorMap( geometry, divisions );
	const colors = railPaletteFrom( palette );
	const attribute = geometry.getAttribute( 'color' );
	const array = attribute.array;
	const { segmentStart, structureEnd } = map;

	let riddenCount = 0;
	// 全体を塗ったあと、まだ update（= その直後の描画で全体が転送される）を挟んでいない
	let fullUploadPending = false;

	function fill( v0, v1, c ) {

		const r = c[ 0 ], g = c[ 1 ], b = c[ 2 ];
		for ( let i = v0 * 3, e = v1 * 3; i < e; i += 3 ) {

			array[ i ] = r;
			array[ i + 1 ] = g;
			array[ i + 2 ] = b;

		}

	}

	/** 区間 [ s0, s1 ) を、走行済み区間数 count の状態で塗る。戻り値は書き換えた頂点数。 */
	function paintRange( s0, s1, count ) {

		for ( let s = s0; s < s1; s ++ ) {

			const [ structure, rail ] = colors[ segmentState( s, count ) ];
			fill( segmentStart[ s ], structureEnd[ s ], structure );
			fill( structureEnd[ s ], segmentStart[ s + 1 ], rail );

		}

		return segmentStart[ s1 ] - segmentStart[ s0 ];

	}

	function paintAll( fraction = 0 ) {

		riddenCount = riddenSegmentCount( fraction, divisions );
		paintRange( 0, divisions, riddenCount );
		attribute.clearUpdateRanges(); // 範囲なし = 全体を転送
		attribute.needsUpdate = true;
		fullUploadPending = true;
		return { segments: divisions, vertices: map.vertexCount };

	}

	function update( fraction ) {

		const next = riddenSegmentCount( fraction, divisions );
		const prev = riddenCount;
		let result = { segments: 0, vertices: 0 };

		if ( next !== prev ) {

			const s0 = Math.min( prev, next ), s1 = Math.max( prev, next );
			const vertices = paintRange( s0, s1, next );
			riddenCount = next;
			// 全体の転送が控えているフレームでは範囲を足さない（足すとその範囲だけの転送になる）
			if ( ! fullUploadPending ) attribute.addUpdateRange( segmentStart[ s0 ] * 3, vertices * 3 );
			attribute.needsUpdate = true;
			result = { segments: s1 - s0, vertices };

		}

		// update は毎フレーム描画の直前に呼ばれる。全体の転送はこのフレームの描画で済む
		fullUploadPending = false;
		return result;

	}

	return {
		map,
		colors,
		attribute,
		paintAll,
		update,
		get riddenCount() {

			return riddenCount;

		}
	};

}

export function createRailColors( ctx ) {

	const { scene, curve, ride } = ctx;
	const rail = scene.getObjectByName( 'rail' );
	if ( ! rail ) throw new Error( 'rail-colors: scene に rail がありません' );

	const geometry = rail.geometry;
	const divisions = rail.userData.divisions;
	// 毎フレーム一部を書き換えるので、最初の描画（バッファの生成）より前に設定する
	geometry.getAttribute( 'color' ).setUsage( DynamicDrawUsage );

	const painter = createRailPainter( geometry, divisions );
	// 進行位置（時間に比例）→ 弧長の割合（レールの区間は弧長で等間隔）
	const fractionOf = ( progress ) => curve.arcFractionAt( progress );
	painter.paintAll( fractionOf( ride.progress ) );

	// 計測用（デバッグ）：直近に書き換えたフレームの区間数・頂点数と所要時間、その最大
	const stats = { segments: 0, vertices: 0, ms: 0, maxVertices: 0, maxMs: 0 };
	rail.userData.colorStats = stats;

	return {
		update( state ) {

			const t0 = performance.now();
			const { segments, vertices } = painter.update( fractionOf( state.progress ) );
			if ( vertices > 0 ) {

				stats.segments = segments;
				stats.vertices = vertices;
				stats.ms = performance.now() - t0;
				stats.maxVertices = Math.max( stats.maxVertices, vertices );
				stats.maxMs = Math.max( stats.maxMs, stats.ms );

			}

		},
		onReset() {

			// 「最初から」：全体を塗り直す（ride.restart のあとなので progress は 0）
			painter.paintAll( fractionOf( ride.progress ) );

		},
		dispose() {

			delete rail.userData.colorStats;

		}
	};

}
