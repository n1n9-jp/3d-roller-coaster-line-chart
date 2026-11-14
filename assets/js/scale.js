// 高さ目盛り：1 万円ごとの等高線と値ラベル、俯瞰のときの駅名。機能モジュール（createScale( ctx )）。担当：高さ目盛り。
//
// レールの高さが株価なので、等高線があると「いま何万円あたりを走っているか」が 3D の中で読める。
//   等高線：駅の多角形（curve.seg.points）を外側へ CONTOUR.offset ずらした輪。高さは curve.valueToY( 値 )。
//           線は 2 本の LineSegments（通常と、5 万円の倍数の強い線）にまとめて、draw call を抑える。
//   値ラベル（一人称）：Sprite。値ごとに 1 つ。テクスチャは値ごとに 1 枚（俯瞰の軸と使い回す）。
//           いまの高さを挟む上下の等高線に 1 つずつ、前方の読みやすい場所（近すぎず遠すぎない）に出す。文字は minTextPx 以上。
//   値ラベルの軸（俯瞰）：輪の 1 点（アンカー）で、各等高線から短い引き出し線を出し、その先に下から上へ値を縦に並べる。
//           アンカーは、ラベルの列が画面に収まり、HUD・年ラベルに重ならず、レールにかぶらない点を、輪の頂点から選ぶ（上の方を好む）。
//           列は輪の外側へ出すのを優先し、外に場所がない（縦長の狭い画面など）ときは、輪の内側の空いたところへ出す。
//           等高線どうしが画面上で詰まっているときは、引き出し線の先でラベルの間隔を広げる（labels.js の spreadAxis）。
//   駅名：Sprite。俯瞰のときだけ、床の高さで輪の外側に出す。
//
// 俯瞰の重なりは labels.js の掲示板で解く。優先順位は「年ラベル（markers.js）＞ 値ラベルの軸 ＞ 駅名」。
// 年ラベルの矩形は掲示板の 'event' 層から読み（markers.js が登録した関数が、このフレームのカメラで計算する）、
// 軸はそれと HUD を避け、駅名はさらに軸も避ける。
// 自分の矩形は 'axis' と 'station' の層に登録する（検証用）。
//
// ラベルの大きさは固定の倍率を持たず、実行時のカメラ（位置・画角）と表示サイズから、
// 「画面上の文字の高さが textPx になるワールドの大きさ」を毎フレーム求める。
//   一人称：基準距離（CONTOUR.rideDistance）で文字が ride の px になる大きさ。遠近はそのまま（近いほど大きい）。
//   俯瞰  ：どれも文字が overview の px になる大きさ。
// 描画に依存しない計算（等高線の値、輪のずらし、書式、大きさ）は export して、tests/scale.test.js で確かめる。

import {
	Group, LineSegments, LineBasicMaterial, BufferGeometry, Float32BufferAttribute,
	Sprite, SpriteMaterial, CanvasTexture, SRGBColorSpace, Vector2, Vector3, MathUtils
} from './three.core.js';
import { CONTOUR, PALETTE, HUD_COLORS, FONT_SANS } from './config.js';
import { placeLabels, spreadAxis, collidesAny, insideViewport, getLabelBoard } from './labels.js';

const DEG = Math.PI / 180;

// ---- 描画に依存しない計算 ----

/** 等高線の値の列：最安値を切り上げた値から、最高値を切り捨てた値まで、step ごと（既定 1 万円）。 */
export function contourValues( min, max, step = CONTOUR.stepYen ) {

	// 浮動小数点の誤差で、ちょうど 5 万円の最高値などの 1 本が落ちないよう、わずかに許す
	const eps = 1e-9;
	const first = Math.ceil( min / step - eps );
	const last = Math.floor( max / step + eps );
	const values = [];
	for ( let k = first; k <= last; k ++ ) values.push( k * step );
	return values;

}

/** ラベルの文字列：20000 → 「20,000円」。 */
export function formatContourLabel( value ) {

	return `${String( Math.round( value ) ).replace( /\B(?=(\d{3})+(?!\d))/g, ',' )}円`;

}

/**
 * 閉じた多角形（{x, z} の配列。最後の点が最初と同じなら除く）を、外側へ distance ずらした点列。
 * 各頂点を、前後の辺の外向きの法線の合成（マイター）で動かす。尖った頂点で飛び出しすぎないよう、長さは distance の maxMiter 倍まで。
 * 向き（時計回りか反時計回りか）は面積の符号から決めるので、どちらの周り方でも外側へずれる。
 * 重なった点を除くので、戻り値の長さは入力より短いことがある（山手線の駅は重ならないので同じ）。
 */
export function offsetRing( points, distance, maxMiter = 2 ) {

	let ring = points.map( ( p ) => ( { x: p.x, z: p.z } ) );
	const first = ring[ 0 ];
	const last = ring[ ring.length - 1 ];
	if ( ring.length > 1 && Math.abs( first.x - last.x ) < 1e-9 && Math.abs( first.z - last.z ) < 1e-9 ) ring.pop();

	// 連続する同じ点は辺の向きが決まらないので除く
	ring = ring.filter( ( p, i ) => {

		const q = ring[ ( i + 1 ) % ring.length ];
		return Math.abs( p.x - q.x ) > 1e-9 || Math.abs( p.z - q.z ) > 1e-9;

	} );

	const n = ring.length;
	if ( n < 3 ) return ring;

	let area = 0;
	for ( let i = 0; i < n; i ++ ) {

		const a = ring[ i ];
		const b = ring[ ( i + 1 ) % n ];
		area += a.x * b.z - b.x * a.z;

	}

	const sign = area >= 0 ? 1 : - 1;

	// 辺 i（i → i+1）の外向きの単位法線
	const normals = ring.map( ( a, i ) => {

		const b = ring[ ( i + 1 ) % n ];
		const dx = b.x - a.x;
		const dz = b.z - a.z;
		const len = Math.hypot( dx, dz );
		return { x: sign * dz / len, z: - sign * dx / len };

	} );

	return ring.map( ( p, i ) => {

		const n1 = normals[ ( i - 1 + n ) % n ];
		const n2 = normals[ i ];
		const dot = n1.x * n2.x + n1.z * n2.z;
		let mx = ( n1.x + n2.x ) / ( 1 + dot );
		let mz = ( n1.z + n2.z ) / ( 1 + dot );
		const len = Math.hypot( mx, mz );
		if ( ! Number.isFinite( len ) || len > maxMiter ) {

			// ほぼ折り返す頂点：長さを抑える（向きは 2 つの法線の合成）
			const sx = n1.x + n2.x;
			const sz = n1.z + n2.z;
			const sl = Math.hypot( sx, sz ) || 1;
			mx = sx / sl * maxMiter;
			mz = sz / sl * maxMiter;

		}

		return { x: p.x + mx * distance, z: p.z + mz * distance };

	} );

}

/**
 * 画面上の文字の高さが textPx になる、ラベル（ピル）のワールドでの高さ。
 * distance：カメラからの奥行き、fovDeg：縦の画角（度）、viewportHeight：表示の高さ（CSS px）。
 * pillHeight と fontPx は、テクスチャの高さと、その中の文字の大きさ（CONTOUR.label）。
 */
export function labelWorldHeight( { distance, fovDeg, viewportHeight, textPx, pillHeight = CONTOUR.label.pillHeight, fontPx = CONTOUR.label.fontPx } ) {

	const worldPerPx = 2 * Math.max( distance, 1e-3 ) * Math.tan( fovDeg * DEG / 2 ) / viewportHeight;
	return textPx * ( pillHeight / fontPx ) * worldPerPx;

}

/** labelWorldHeight の逆：ワールドの高さ worldHeight のラベルの、画面上の文字の高さ（px）。 */
export function screenTextPx( { worldHeight, distance, fovDeg, viewportHeight, pillHeight = CONTOUR.label.pillHeight, fontPx = CONTOUR.label.fontPx } ) {

	const worldPerPx = 2 * Math.max( distance, 1e-3 ) * Math.tan( fovDeg * DEG / 2 ) / viewportHeight;
	return worldHeight / worldPerPx * ( fontPx / pillHeight );

}

/** 狭い画面の軸のラベル：20000 → 「2万円」。 */
export function formatContourShort( value ) {

	const man = Math.round( value ) / 10000;
	return `${Number.isInteger( man ) ? man : man.toFixed( 1 )}万円`;

}

// 間引き（placeLabels）は labels.js にある。既存のテストと呼び出しのために、ここからも出す
export { placeLabels };

// ---- テクスチャ（canvas） ----

/** ピル型のラベルの CanvasTexture。width を省略すると文字に合わせる。 */
function createPillTexture( text, { textColor, borderColor, width = null } ) {

	const { pillHeight, radius, border, fontPx } = CONTOUR.label;
	const canvas = document.createElement( 'canvas' );
	canvas.height = pillHeight;
	const g = canvas.getContext( '2d' );
	const font = `700 ${fontPx}px ${FONT_SANS}`;
	g.font = font;
	canvas.width = width ?? Math.ceil( g.measureText( text ).width + CONTOUR.label.padding * 2 );
	g.font = font; // canvas の大きさを変えると状態が戻る

	const w = canvas.width;
	const r = Math.min( radius, pillHeight / 2, w / 2 );
	const inset = border / 2;
	g.beginPath();
	g.moveTo( r, inset );
	g.lineTo( w - r, inset );
	g.arc( w - r, pillHeight / 2, r - inset, - Math.PI / 2, Math.PI / 2 );
	g.lineTo( r, pillHeight - inset );
	g.arc( r, pillHeight / 2, r - inset, Math.PI / 2, Math.PI * 1.5 );
	g.closePath();
	g.fillStyle = HUD_COLORS.contourLabelBg;
	g.fill();
	g.lineWidth = border;
	g.strokeStyle = borderColor;
	g.stroke();

	g.fillStyle = textColor;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillText( text, w / 2, pillHeight / 2 + 2 );

	const texture = new CanvasTexture( canvas );
	texture.colorSpace = SRGBColorSpace;
	return texture;

}

// ---- モジュール ----

export function createScale( ctx ) {

	const { scene, camera, renderer, curve, dataset, stations } = ctx;
	const board = getLabelBoard( ctx );

	const group = new Group();
	group.name = 'scale';
	scene.add( group );

	const ring = offsetRing( curve.seg.points, CONTOUR.offset );
	const labelRing = offsetRing( curve.seg.points, CONTOUR.offset + CONTOUR.label.extraOffset );
	const nameRing = offsetRing( curve.seg.points, CONTOUR.stationNames.offset );

	// 等高線の値は、画面の値（生データ）の最安値・最高値から決める（ミニグラフの Y 軸と同じ）。高さはレールと同じ valueToY
	const range = dataset.rawRange ?? { min: curve.closeMin, max: curve.closeMax };
	const values = contourValues( range.min, range.max );
	const valueYs = values.map( ( v ) => curve.valueToY( v ) );

	// ---- 等高線：通常と強い線の 2 本の LineSegments ----
	const contours = new Group();
	contours.name = 'contours';
	group.add( contours );

	function buildLines( list, opacity, name ) {

		if ( list.length === 0 ) return;
		const positions = [];
		for ( const v of list ) {

			const y = curve.valueToY( v );
			for ( let i = 0; i < ring.length; i ++ ) {

				const a = ring[ i ];
				const b = ring[ ( i + 1 ) % ring.length ];
				positions.push( a.x, y, a.z, b.x, y, b.z );

			}

		}

		const geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );
		const lines = new LineSegments( geometry, new LineBasicMaterial( { color: PALETTE.contour, transparent: true, opacity, depthWrite: false } ) );
		lines.name = name;
		contours.add( lines );

	}

	const { strongEveryYen, opacity: lineOpacity, strongOpacity } = CONTOUR.line;
	const isStrong = ( v ) => v % strongEveryYen === 0;
	buildLines( values.filter( ( v ) => ! isStrong( v ) ), lineOpacity, 'contour-lines' );
	buildLines( values.filter( isStrong ), strongOpacity, 'contour-lines-strong' );

	// ---- ラベルと駅名（Sprite） ----
	const valueGroup = new Group();
	valueGroup.name = 'contour-labels';
	const axisGroup = new Group();
	axisGroup.name = 'contour-axis';
	const nameGroup = new Group();
	nameGroup.name = 'station-names';
	group.add( valueGroup, axisGroup, nameGroup );

	const textures = new Map(); // 値 → 値ラベルのテクスチャ（その値の全ラベルで使い回す）
	const shortTextures = new Map(); // 値 → 狭い画面の軸のラベル（「2万円」）
	const nameTextures = [];
	const entries = []; // 一人称の値ラベルと駅名
	const axisEntries = []; // 俯瞰の軸のラベル（値ごとに 1 つ）

	function makeSprite( texture, parent, overlay ) {

		const material = new SpriteMaterial( { map: texture, transparent: true, depthWrite: false, opacity: 0 } );
		if ( overlay ) {

			// 軸と一人称の値ラベルは、カーテン・レール・支柱・等高線に隠されないよう、いつも手前に描く（霧もかけない）
			material.depthTest = false;
			material.fog = false;

		}

		const sprite = new Sprite( material );
		sprite.visible = false;
		if ( overlay ) sprite.renderOrder = 10;
		parent.add( sprite );
		return { sprite, material };

	}

	function addEntry( kind, texture, base, normal, extra ) {

		// 一人称の値ラベルは、支柱やレールに文字が切られないよう手前に描く（置き場所は、読める位置を選んである）
		const { sprite, material } = makeSprite( texture, kind === 'name' ? nameGroup : valueGroup, kind === 'value' );
		entries.push( {
			kind, sprite, material, base, normal,
			aspect: texture.image.width / texture.image.height,
			show: 0, // 0..1：表示するか（視点と間引きで決まる。なめらかに変える）
			wanted: false,
			near: 1,
			...extra
		} );

	}

	/** 元の点から、ずらした輪の点へ向かう単位ベクトル（外向き）。 */
	function outwardNormal( ringPoints, i ) {

		const p = curve.seg.points[ i ];
		const q = ringPoints[ i ];
		const len = Math.hypot( q.x - p.x, q.z - p.z ) || 1;
		return { x: ( q.x - p.x ) / len, z: ( q.z - p.z ) / len };

	}

	// 駅名を置く駅（主要 7 駅）。名前から駅の番号を引く
	const nameStations = [];
	for ( const [ rank, name ] of CONTOUR.stationNames.priority.entries() ) {

		const index = stations.findIndex( ( s ) => s.station_name === name );
		if ( index >= 0 ) nameStations.push( { name, index, rank } );

	}

	const named = new Set( nameStations.map( ( s ) => s.index ) );

	// 一人称の値ラベルの置き場所の候補：ラベルの輪（等高線の輪のさらに外）の辺を細かく分けた点と、その点での外向きの向き
	const rideSamples = [];
	{

		const n = CONTOUR.ride.subdivisions;
		for ( let i = 0; i < labelRing.length; i ++ ) {

			const j = ( i + 1 ) % labelRing.length;
			const na = outwardNormal( labelRing, i );
			const nb = outwardNormal( labelRing, j );
			for ( let k = 0; k < n; k ++ ) {

				const t = k / n;
				const nx = na.x + ( nb.x - na.x ) * t;
				const nz = na.z + ( nb.z - na.z ) * t;
				const len = Math.hypot( nx, nz ) || 1;
				rideSamples.push( {
					x: labelRing[ i ].x + ( labelRing[ j ].x - labelRing[ i ].x ) * t,
					z: labelRing[ i ].z + ( labelRing[ j ].z - labelRing[ i ].z ) * t,
					normal: { x: nx / len, z: nz / len }
				} );

			}

		}

	}

	const labelBorder = `#${PALETTE.contour.toString( 16 ).padStart( 6, '0' )}`;
	const labelStyle = { textColor: HUD_COLORS.contourLabel, borderColor: labelBorder };
	values.forEach( ( v, level ) => {

		const texture = createPillTexture( formatContourLabel( v ), labelStyle );
		textures.set( v, texture );
		shortTextures.set( v, createPillTexture( formatContourShort( v ), labelStyle ) );
		// 一人称：値ごとに 1 つだけ。置く場所（anchor：rideSamples の番号）は毎フレーム選び直す
		addEntry( 'value', texture, new Vector3( 0, valueYs[ level ] + CONTOUR.label.lift, 0 ), { x: 0, z: 0 }, { level, value: v, anchor: - 1 } );
		entries[ entries.length - 1 ].sprite.userData.value = v; // 検証用

		const { sprite, material } = makeSprite( texture, axisGroup, true );
		sprite.userData.value = v;
		axisEntries.push( { level, value: v, sprite, material, compact: false, show: 0, rect: null } );

	} );

	for ( const s of nameStations ) {

		const texture = createPillTexture( s.name, { textColor: HUD_COLORS.text2, borderColor: HUD_COLORS.panelBorder } );
		nameTextures.push( texture );
		const p = nameRing[ s.index ];
		addEntry( 'name', texture, new Vector3( p.x, CONTOUR.stationNames.y, p.z ), outwardNormal( nameRing, s.index ), { rank: s.rank, station: s.index, label: s.name } );

	}

	const rideEntries = entries.filter( ( e ) => e.kind === 'value' );
	const nameEntries = entries.filter( ( e ) => e.kind === 'name' ).sort( ( a, b ) => a.rank - b.rank );

	// ---- 軸の引き出し線と背骨：値ごとに 3 本（横の短い線・斜めの線・ラベルへの短い線）＋ アンカーの縦線 1 本 ----
	const leaderGeometry = new BufferGeometry();
	// Float32BufferAttribute は配列を写すので、書き込みは属性の配列そのものへ
	leaderGeometry.setAttribute( 'position', new Float32BufferAttribute( new Float32Array( ( values.length * 3 + 1 ) * 2 * 3 ), 3 ) );
	const leaderPositions = leaderGeometry.attributes.position.array;
	const leaderMaterial = new LineBasicMaterial( { color: PALETTE.contour, transparent: true, opacity: 0, depthTest: false, depthWrite: false } );
	const leaders = new LineSegments( leaderGeometry, leaderMaterial );
	leaders.name = 'contour-axis-leaders';
	leaders.renderOrder = 9;
	leaders.frustumCulled = false;
	leaders.visible = false;
	axisGroup.add( leaders );
	let axisShow = 0;

	// アンカーを選ぶときに、ラベルの列がレール（とカーテン）にかぶっていないかを見るための点（床・中ほど・上端）
	const railSamples = [];
	{

		const count = 360;
		for ( let i = 0; i < count; i ++ ) {

			const p = curve.getPointAt( i / count );
			for ( const f of [ 1, 0.5, 0 ] ) railSamples.push( new Vector3( p.x, p.y * f, p.z ) );

		}

	}

	// ---- 視点：補間の値は view.blend（0＝一人称、1＝俯瞰。カメラと同じ）を使う ----
	let currentView = ctx.view?.current ?? 'ride';
	const viewBlend = () => {

		const b = ctx.view?.blend;
		return Number.isFinite( b ) ? b : ( currentView === 'overview' ? 1 : 0 );

	};

	let blend = viewBlend();
	let lastNowMs = 0;
	let obstacles = [];
	let layout = null; // 俯瞰の軸の配置（computeAxisLayout の結果）
	let layoutKey = '';
	let placedNames = [];

	// prefers-reduced-motion：MediaQueryList は 1 回だけ作り、変化を購読する
	const reducedQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
		? window.matchMedia( '(prefers-reduced-motion: reduce)' )
		: null;
	let reducedMotion = reducedQuery?.matches ?? false;
	const onReducedChange = ( e ) => {

		reducedMotion = e.matches;

	};

	reducedQuery?.addEventListener?.( 'change', onReducedChange );

	function onViewChange( next ) {

		if ( next === currentView ) return;
		currentView = next;
		board.hud.invalidate();
		layoutKey = '';

	}

	// ---- 画面との変換 ----
	const size = new Vector2();
	const viewPosition = new Vector3();
	const cameraPosition = new Vector3();
	const worldPosition = new Vector3();
	const ndc = new Vector3();

	function toScreen( x, y, z, width, height ) {

		ndc.set( x, y, z ).project( camera );
		return { x: ( ndc.x + 1 ) / 2 * width, y: ( 1 - ndc.y ) / 2 * height, z: ndc.z };

	}

	function toWorld( sx, sy, ndcZ, width, height, target ) {

		return target.set( sx / width * 2 - 1, 1 - sy / height * 2, ndcZ ).unproject( camera );

	}

	/** 引き出し線の折れ線（画面の px）：等高線の点 → 横の短い線 → ラベルの高さへ斜め → ラベルの端の手前。値ごとに 4 点。 */
	function leaderPolyline( a, y, edge, side ) {

		const stub = CONTOUR.axis.stubPx;
		const end = edge - side * 3;
		return [ { x: a.x, y: a.y }, { x: a.x + side * stub, y: a.y }, { x: end - side * stub, y }, { x: end, y } ];

	}

	/** 引き出し線を、数 px おきの小さな矩形の列にする（重なりの判定用）。 */
	function leaderDots( anchor, spread, edge, side ) {

		const dots = [];
		for ( let k = 0; k < anchor.length; k ++ ) {

			const line = leaderPolyline( anchor[ k ], spread[ k ], edge, side );
			for ( let j = 0; j < line.length - 1; j ++ ) {

				const p = line[ j ];
				const q = line[ j + 1 ];
				const n = Math.max( 1, Math.ceil( Math.hypot( q.x - p.x, q.y - p.y ) / 4 ) );
				for ( let t = 0; t <= n; t ++ ) dots.push( { x: p.x + ( q.x - p.x ) * t / n, y: p.y + ( q.y - p.y ) * t / n, w: 2, h: 2 } );

			}

		}

		return dots;

	}

	/**
	 * 俯瞰の軸の配置を決める。輪の頂点をアンカーの候補として、それぞれ「外側か内側か」「引き出し線の長さ」「列の上下のずらし」を変えて
	 * ラベルの列を作り、画面からはみ出す・HUD や年ラベルに重なるもの（hard）を退け、
	 * レールにかぶる量・引き出し線の曲がり（ずらした量）・アンカーの低さ・内側かどうか（soft）の合計が最小のものを選ぶ。
	 */
	function computeAxisLayout( width, height, compact, hard ) {

		const A = CONTOUR.axis;
		const viewport = { width, height };
		const pillPx = ( compact ? CONTOUR.textPx.overviewCompact : CONTOUR.textPx.overview ) * CONTOUR.label.pillHeight / CONTOUR.label.fontPx;
		const leaderPx = compact ? A.leaderPxCompact : A.leaderPx;
		const aspects = values.map( ( v ) => {

			const t = ( compact ? shortTextures : textures ).get( v );
			return t.image.width / t.image.height;

		} );
		const rail = railSamples.map( ( p ) => toScreen( p.x, p.y, p.z, width, height ) ).filter( ( s ) => s.z < 1 );
		let cx = 0;
		for ( const s of rail ) cx += s.x;
		cx /= Math.max( 1, rail.length );

		// 列の上下のずらし：0、+step、-step、+2step…（ずらすほど割高）
		const shifts = [ 0 ];
		for ( let k = 1; k <= A.shiftSteps; k ++ ) shifts.push( k * A.shiftPx, - k * A.shiftPx );
		const bounds = { min: A.insetPx + pillPx / 2, max: height - A.insetPx - pillPx / 2 };

		let best = null;
		for ( let i = 0; i < ring.length; i ++ ) {

			const anchor = valueYs.map( ( y ) => toScreen( ring[ i ].x, y, ring[ i ].z, width, height ) );
			if ( anchor.some( ( s ) => s.z >= 1 || s.x < 0 || s.x > width || s.y < 0 || s.y > height ) ) continue;
			// 上から（値の高い順に）並べて間隔を広げる
			const base = spreadAxis( anchor.map( ( s ) => s.y ).reverse(), pillPx + A.gapPx ).reverse();
			const outward = anchor[ 0 ].x >= cx ? 1 : - 1;
			const minX = Math.min( ...anchor.map( ( s ) => s.x ) );
			const maxX = Math.max( ...anchor.map( ( s ) => s.x ) );

			// 外側（輪の中心から離れる向き）を先に、内側（輪の中の空いたところ）も試す
			for ( const side of [ outward, - outward ] ) {

				for ( const extra of A.leaderExtraPx ) {

					const edge = side > 0 ? maxX + leaderPx + extra : minX - leaderPx - extra;
					for ( const shift of shifts ) {

						const spread = base.map( ( y ) => y + shift );
						if ( spread[ spread.length - 1 ] < bounds.min || spread[ 0 ] > bounds.max ) continue;
						let cost = Math.abs( shift ) * values.length * A.shiftWeight + extra * A.extraWeight
							+ anchor[ 0 ].y / height * A.preferUpper + ( side !== outward ? A.inwardPenalty : 0 );
						for ( let k = 0; k < values.length; k ++ ) cost += Math.abs( base[ k ] - anchor[ k ].y ) * A.shiftWeight;
						if ( best && cost >= best.cost ) continue;

						const rects = values.map( ( v, k ) => {

							const w = pillPx * aspects[ k ];
							return { x: edge + side * w / 2, y: spread[ k ], w, h: pillPx };

						} );
						let collisions = 0;
						for ( const r of rects ) {

							if ( ! insideViewport( r, viewport, A.insetPx ) || collidesAny( r, hard, A.margin ) ) collisions ++;

						}

						// 引き出し線（折れ線を数 px おきの小さな点に分けたもの）。年ラベルや HUD を横切らない
						const bands = leaderDots( anchor, spread, edge, side );
						if ( collisions === 0 ) for ( const dot of bands ) if ( collidesAny( dot, hard, 0 ) ) collisions ++;
						// どの候補も置けないときに備えて、重なる候補も（重なりの数に応じて大きく割高にして）残す
						cost += collisions * 1e6;
						if ( best && cost >= best.cost ) continue;

						// レール（とカーテン）にかぶる点の数
						for ( const sp of rail ) {

							for ( const r of rects ) {

								if ( Math.abs( sp.x - r.x ) < r.w / 2 + 3 && Math.abs( sp.y - r.y ) < r.h / 2 + 3 ) {

									cost += A.railWeight;
									break;

								}

							}

							if ( best && cost >= best.cost ) break;

						}

						if ( ! best || cost < best.cost ) best = { cost, index: i, side, edge, anchor, rects, bands, spread, pillPx, compact };

					}

				}

			}

		}

		return best;

	}

	function writeLeaders( lay, width, height ) {

		const p = new Vector3();
		let o = 0;
		const put = ( v ) => {

			leaderPositions[ o ++ ] = v.x;
			leaderPositions[ o ++ ] = v.y;
			leaderPositions[ o ++ ] = v.z;

		};

		values.forEach( ( v, k ) => {

			const a = lay.anchor[ k ];
			const line = leaderPolyline( a, lay.spread[ k ], lay.edge, lay.side );
			for ( let j = 0; j < line.length - 1; j ++ ) {

				put( toWorld( line[ j ].x, line[ j ].y, a.z, width, height, p ) );
				put( toWorld( line[ j + 1 ].x, line[ j + 1 ].y, a.z, width, height, p ) );

			}

		} );

		// 背骨：アンカーの、いちばん低い等高線からいちばん高い等高線まで
		const bottom = ring[ lay.index ];
		put( p.set( bottom.x, valueYs[ 0 ], bottom.z ) );
		put( p.set( bottom.x, valueYs[ valueYs.length - 1 ], bottom.z ) );
		leaderGeometry.attributes.position.needsUpdate = true;

	}

	function placeAxisSprites( lay, width, height ) {

		const tanHalf = Math.tan( camera.fov * DEG / 2 );
		axisEntries.forEach( ( a, k ) => {

			const r = lay.rects[ k ];
			const map = ( lay.compact ? shortTextures : textures ).get( a.value );
			if ( a.material.map !== map ) {

				a.material.map = map;
				a.material.needsUpdate = true;

			}

			toWorld( r.x, r.y, lay.anchor[ k ].z, width, height, worldPosition );
			a.sprite.position.copy( worldPosition );
			viewPosition.copy( worldPosition ).applyMatrix4( camera.matrixWorldInverse );
			const pxPerWorld = height / ( 2 * Math.max( - viewPosition.z, 1e-3 ) * tanHalf );
			a.sprite.scale.set( r.w / pxPerWorld, r.h / pxPerWorld, 1 );
			a.rect = r;

		} );

	}

	// ---- 一人称の値ラベルの置き場所 ----

	/** 一人称で、値ラベル e を候補の点 sample に置いたときの画面上の矩形と評価。置けないときは null。 */
	function evaluateRideSample( e, sample, width, height, placed ) {

		const R = CONTOUR.ride;
		worldPosition.set( sample.x, e.base.y, sample.z );
		const d = worldPosition.distanceTo( cameraPosition );
		if ( d < R.minDistance ) return null;
		viewPosition.copy( worldPosition ).applyMatrix4( camera.matrixWorldInverse );
		const depth = - viewPosition.z;
		if ( depth <= 0.1 ) return null;
		// 遠すぎるところ（maxDistance より先）には置かない
		if ( d > R.maxDistance ) return null;
		// 一人称の大きさ：基準距離で textPx.ride。画面上の文字の高さは奥行きに反比例し、minTextPx〜maxTextPx に収める
		const textPx = MathUtils.clamp( CONTOUR.textPx.ride * CONTOUR.rideDistance / depth, R.minTextPx, R.maxTextPx );
		const tanHalf = Math.tan( camera.fov * DEG / 2 );
		const pxPerWorld = height / ( 2 * depth * tanHalf );
		const h = textPx * CONTOUR.label.pillHeight / CONTOUR.label.fontPx;
		const rect = { x: width / 2 + viewPosition.x * pxPerWorld, y: height / 2 - viewPosition.y * pxPerWorld, w: h * e.aspect, h };
		if ( ! insideViewport( rect, { width, height }, R.insetPx ) ) return null;
		if ( collidesAny( rect, obstacles, 4 ) || collidesAny( rect, placed, 4 ) ) return null;
		const score = - Math.abs( depth - R.idealDepth ) - Math.abs( rect.x - width / 2 ) / width * R.centerWeight;
		return { rect, score };

	}

	/**
	 * 一人称：いまのレールの高さを挟む上下の等高線（範囲の外なら近い 1 本）に、値ラベルを 1 つずつ置く。
	 * 置いた場所は、読めなくなる（近すぎる・遠すぎる・画面の外・HUD に重なる）まで動かさない。読めなくなったら
	 * いったん消し（pending）、消えきってから、前方の読みやすい場所（奥行き idealDepth に近く、画面の中央に近い点）へ置き直す。
	 */
	function chooseRideAnchors( state, width, height ) {

		// いまの値は、帯に出ている週次終値（state.point.close）。開始前などで無いときは、車体の高さ
		const railY = state.point ? curve.valueToY( state.point.close ) : ( ctx.ride?.position?.y ?? null );
		const wantedLevels = new Set();
		if ( railY !== null && railY !== undefined && valueYs.length > 0 ) {

			let below = - 1;
			for ( let i = 0; i < valueYs.length; i ++ ) if ( valueYs[ i ] <= railY ) below = i;
			if ( below >= 0 ) wantedLevels.add( below );
			if ( below + 1 < valueYs.length ) wantedLevels.add( below + 1 );

		}

		const placed = [];
		for ( const e of rideEntries ) {

			if ( ! wantedLevels.has( e.level ) ) {

				e.pending = e.anchor >= 0;
				if ( e.show === 0 ) e.anchor = - 1;
				continue;

			}

			if ( e.anchor >= 0 ) {

				const current = evaluateRideSample( e, rideSamples[ e.anchor ], width, height, placed );
				if ( current && ! e.pending ) {

					placed.push( current.rect );
					continue;

				}

				// 読めなくなった：消えきるまで待つ
				e.pending = true;
				if ( e.show > 0 ) continue;

			}

			let best = null;
			let bestIndex = - 1;
			for ( let i = 0; i < rideSamples.length; i ++ ) {

				const c = evaluateRideSample( e, rideSamples[ i ], width, height, placed );
				if ( c && ( ! best || c.score > best.score ) ) {

					best = c;
					bestIndex = i;

				}

			}

			e.anchor = bestIndex;
			e.pending = false;
			if ( best ) placed.push( best.rect );

		}

	}

	// ---- 毎フレーム ----

	function update( state ) {

		const nowMs = state.nowMs;
		const dt = Math.min( Math.max( nowMs - lastNowMs, 0 ), 500 );
		lastNowMs = nowMs;

		if ( state.view !== currentView ) onViewChange( state.view );
		blend = viewBlend();

		renderer.getSize( size );
		const width = size.x;
		const height = size.y;
		if ( ! ( width > 0 && height > 0 ) ) return;
		const viewport = { width, height };

		const compact = width <= CONTOUR.compactMaxWidth;
		const textPx = MathUtils.lerp( CONTOUR.textPx.ride, compact ? CONTOUR.textPx.overviewCompact : CONTOUR.textPx.overview, blend );
		const overviewing = currentView === 'overview';

		camera.updateMatrixWorld();
		cameraPosition.setFromMatrixPosition( camera.matrixWorld );
		const tanHalf = Math.tan( camera.fov * DEG / 2 );
		const fade = CONTOUR.nearFade;
		const far = CONTOUR.farFade;

		// HUD のパネル（キャプションを含む）。読み直しは 400ms ごと（labels.js の createHudReader。年ラベルと共有）
		obstacles = board.hud.read( nowMs, `${width}x${height}` );

		if ( ! overviewing ) chooseRideAnchors( state, width, height );
		else for ( const e of rideEntries ) e.pending = e.anchor >= 0;

		// 一人称の値ラベルと駅名の、大きさと位置。奥行きは、カメラの空間での z（画面に垂直な距離）
		for ( const e of entries ) {

			if ( e.kind === 'value' && e.anchor >= 0 ) {

				const sample = rideSamples[ e.anchor ];
				e.base.x = sample.x;
				e.base.z = sample.z;
				e.normal = sample.normal;

			}

			viewPosition.copy( e.base ).applyMatrix4( camera.matrixWorldInverse );
			const depth = - viewPosition.z;
			const distance = MathUtils.lerp( CONTOUR.rideDistance, Math.max( depth, 1 ), blend );
			let h = labelWorldHeight( { distance, fovDeg: camera.fov, viewportHeight: height, textPx } );
			// 一人称の値ラベルは、文字の高さを minTextPx〜maxTextPx に収める（遠くて読めない・近くて大きすぎる、をなくす）
			if ( e.kind === 'value' ) {

				const at = ( px ) => labelWorldHeight( { distance: Math.max( depth, 1 ), fovDeg: camera.fov, viewportHeight: height, textPx: px } );
				h = MathUtils.lerp( MathUtils.clamp( h, at( CONTOUR.ride.minTextPx ), at( CONTOUR.ride.maxTextPx ) ), h, blend );

			}

			const w = h * e.aspect;
			e.sprite.scale.set( w, h, 1 );

			// 俯瞰では、ラベルが輪（レール）の上に乗らないよう、ラベルの幅・高さの半分だけ外へ押し出す
			const push = blend * ( 0.5 * w * Math.abs( e.normal.x ) + 0.6 * h * Math.abs( e.normal.z ) );
			// 駅名は床の上に立てる（ピルの下端が床の高さ。中心を床に置くと、下半分が床に隠れる）
			const lift = e.kind === 'name' ? h / 2 : 0;
			e.sprite.position.set( e.base.x + e.normal.x * push, e.base.y + lift, e.base.z + e.normal.z * push );

			// 一人称：カメラの近くのラベルは薄くして消す。遠いラベルも消す（俯瞰へ向かうほど弱める）
			worldPosition.copy( e.sprite.position );
			const d = worldPosition.distanceTo( cameraPosition );
			const near = e.kind === 'value'
				? MathUtils.smoothstep( d, CONTOUR.ride.minDistance * 0.6, CONTOUR.ride.minDistance )
				: MathUtils.smoothstep( d, fade.hideBelow, fade.fullAbove ) * ( 1 - MathUtils.smoothstep( d, far.fadeStart, far.hideAbove ) );
			e.rideNear = near;
			e.near = MathUtils.lerp( near, 1, blend );

			// 画面上の矩形と文字の高さ（一人称の選択と、俯瞰の駅名の配置に使う）
			viewPosition.copy( e.sprite.position ).applyMatrix4( camera.matrixWorldInverse );
			const z = - viewPosition.z;
			if ( z > 0.1 ) {

				const pxPerWorld = height / ( 2 * z * tanHalf );
				e.rect = { x: width / 2 + viewPosition.x * pxPerWorld, y: height / 2 - viewPosition.y * pxPerWorld, w: w * pxPerWorld, h: h * pxPerWorld };
				e.textPx = e.rect.h * CONTOUR.label.fontPx / CONTOUR.label.pillHeight;

			} else {

				e.rect = null;
				e.textPx = 0;

			}

		}

		for ( const e of entries ) e.wanted = false;
		let axisWanted = false;

		if ( ! overviewing ) {

			// 一人称：いまの高さを挟む上下の等高線のラベルだけを出す（anchor は chooseRideAnchors で決めてある）
			for ( const e of rideEntries ) e.wanted = e.anchor >= 0 && e.pending !== true;
			board.set( 'axis', [] );
			board.set( 'station', [] );
			layout = null;
			layoutKey = '';

		} else if ( blend >= 1 ) {

			// 俯瞰：軸（年ラベルと HUD を避ける）→ 駅名（年ラベル・軸・HUD を避ける）。年ラベルは、このフレームのカメラで計算されたもの
			const years = board.get( 'event' );
			const hard = [ ...obstacles, ...years ];
			const m = camera.matrixWorld.elements;
			const key = [ width, height, compact, ...Array.from( camera.projectionMatrix.elements, ( x ) => x.toFixed( 4 ) ), ...Array.from( m, ( x ) => x.toFixed( 3 ) ),
				...years.map( ( r ) => `${r.x.toFixed( 0 )},${r.y.toFixed( 0 )}` ), ...obstacles.map( ( r ) => `${r.x.toFixed( 0 )},${r.y.toFixed( 0 )},${r.w.toFixed( 0 )}` ) ].join( '|' );
			if ( key !== layoutKey ) {

				layoutKey = key;
				layout = values.length > 0 ? computeAxisLayout( width, height, compact, hard ) : null;
				if ( layout ) {

					writeLeaders( layout, width, height );
					placeAxisSprites( layout, width, height );

				}

				// 駅名：優先順に置き、重なるものは隠す
				const blockers = [ ...hard, ...( layout ? [ ...layout.rects, ...layout.bands ] : [] ) ];
				const limit = compact ? CONTOUR.stationNames.maxCompact : Infinity;
				const candidates = nameEntries.map( ( e, i ) => ( i < limit && e.rect ? e.rect : { w: 0 } ) );
				const result = placeLabels( candidates, blockers, viewport, CONTOUR.declutter.margin );
				placedNames = nameEntries.filter( ( e, i ) => result[ i ] );

			}

			axisWanted = !! layout;
			for ( const e of placedNames ) e.wanted = true;
			board.set( 'axis', axisWanted ? layout.rects : [] );
			board.set( 'station', placedNames.map( ( e ) => e.rect ) );

		} else {

			board.set( 'axis', [] );
			board.set( 'station', [] );

		}

		// 表示のなめらかな切り替え（時定数 fadeMs）。reduced-motion では即座に
		const k = reducedMotion ? 1 : 1 - Math.exp( - dt / CONTOUR.fadeMs );
		const approach = ( value, goal ) => {

			const next = value + ( goal - value ) * k;
			return Math.abs( next - goal ) < 0.02 ? goal : next;

		};

		for ( const e of entries ) {

			// 俯瞰の駅名は、置けなくなったら（重なるようになったら）すぐに消す。出すときだけなめらかに
			e.show = e.kind === 'name' && ! e.wanted ? 0 : approach( e.show, e.wanted ? 1 : 0 );
			const opacity = e.show * e.near;
			e.material.opacity = opacity;
			e.sprite.visible = opacity > 0.02;

		}

		// 軸：配置が変わるときは位置ごと切り替える（出ている間に動かすのは、リサイズのときだけ）
		axisShow = approach( axisShow, axisWanted ? 1 : 0 );
		for ( const a of axisEntries ) {

			a.material.opacity = axisShow;
			a.sprite.visible = axisShow > 0.02 && !! layout;

		}

		leaderMaterial.opacity = axisShow * CONTOUR.axis.leaderOpacity;
		leaders.visible = axisShow > 0.02 && !! layout;

	}

	return {
		contours,
		valueLabels: valueGroup,
		axis: axisGroup,
		stationNames: nameGroup,
		/** 検証用：等高線の値と、ラベル・軸・駅名の現在の状態。 */
		debug() {

			return {
				values,
				blend,
				labels: rideEntries.map( ( e ) => ( { value: e.value, anchor: e.anchor, visible: e.sprite.visible, opacity: e.material.opacity, textPx: e.textPx, rect: e.rect } ) ),
				axis: layout ? {
					anchor: layout.index,
					side: layout.side,
					labels: axisEntries.map( ( a ) => ( { value: a.value, visible: a.sprite.visible, rect: a.rect, anchorY: layout.anchor[ a.level ].y } ) )
				} : null,
				names: nameEntries.map( ( e ) => ( { name: e.label, station: e.station, visible: e.sprite.visible, opacity: e.material.opacity, rect: e.rect } ) ),
				board: board.snapshot()
			};

		},
		update,
		onViewChange,
		onReset() {},
		dispose() {

			scene.remove( group );
			reducedQuery?.removeEventListener?.( 'change', onReducedChange );
			for ( const e of [ ...entries, ...axisEntries ] ) e.material.dispose();
			for ( const lines of contours.children ) {

				lines.geometry.dispose();
				lines.material.dispose();

			}

			leaderGeometry.dispose();
			leaderMaterial.dispose();
			for ( const t of [ ...textures.values(), ...shortTextures.values(), ...nameTextures ] ) t.dispose();

		}
	};

}
