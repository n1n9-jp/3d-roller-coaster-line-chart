// 高さ目盛り：1 万円ごとの等高線と値ラベル、俯瞰のときの駅名。機能モジュール（createScale( ctx )）。担当：高さ目盛り。
//
// レールの高さが株価なので、等高線があると「いま何万円あたりを走っているか」が 3D の中で読める。
//   等高線：駅の多角形（curve.seg.points）を外側へ CONTOUR.offset ずらした輪。高さは curve.valueToY( 値 )。
//           線は 2 本の LineSegments（通常と、5 万円の倍数の強い線）にまとめて、draw call を抑える。
//   値ラベル：Sprite。テクスチャは値ごとに 1 枚（その値の全ラベルで使い回す）。
//   駅名：Sprite。俯瞰のときだけ、床の高さで輪の外側に出す。
//
// ラベルの大きさは固定の倍率を持たず、実行時のカメラ（位置・画角）と表示サイズから、
// 「画面上の文字の高さが textPx になるワールドの大きさ」を毎フレーム求める。
//   一人称：基準距離（CONTOUR.rideDistance）で文字が ride の px になる大きさ。遠近はそのまま（近いほど大きい）。
//   俯瞰  ：ラベルごとの奥行きで、どれも文字が overview の px になる大きさ。
//   切り替え中は、view.js と同じ補間（時間と曲線）で、2 つの大きさの間をなめらかに動く。
// 俯瞰では、ラベル・駅名・HUD のパネルが重ならないよう、優先順に置いて重なるものを間引く（画面が狭いほど減る）。
// 描画に依存しない計算（等高線の値、輪のずらし、書式、大きさ、間引き）は export して、tests/scale.test.js で確かめる。

import {
	Group, LineSegments, LineBasicMaterial, BufferGeometry, Float32BufferAttribute,
	Sprite, SpriteMaterial, CanvasTexture, SRGBColorSpace, Vector2, Vector3, MathUtils
} from './three.core.js';
import { CONTOUR, PALETTE, HUD_COLORS, FONT_SANS, MOTION } from './config.js';
import { cubicBezier } from './view.js';

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

/** 長方形（中心 x, y と幅 w, 高さ h。px）どうしが、margin 以内に近いか。 */
function overlaps( a, b, margin ) {

	return Math.abs( a.x - b.x ) < ( a.w + b.w ) / 2 + margin && Math.abs( a.y - b.y ) < ( a.h + b.h ) / 2 + margin;

}

/**
 * 優先順に並んだ候補を置いていき、画面からはみ出すもの、HUD のパネル（obstacles）や置いたものに重なるものを間引く。
 * candidates：{ x, y, w, h（中心と大きさ。px）, group?, limit?, firstOf? }。w が 0 以下なら置かない。group ごとに limit 個まで。
 * firstOf：同じ値の候補のうち、最初に置けた 1 つだけを置く（あとの候補は、その値がすでに置けていれば飛ばす）。
 * 戻り値：候補と同じ順の true / false。
 */
export function placeLabels( candidates, obstacles, viewport, margin = 0 ) {

	const placed = [];
	const counts = new Map();
	const firsts = new Set();
	return candidates.map( ( c ) => {

		if ( c.firstOf !== undefined && firsts.has( c.firstOf ) ) return false;
		if ( ! ( c.w > 0 ) || c.x - c.w / 2 < 0 || c.x + c.w / 2 > viewport.width || c.y - c.h / 2 < 0 || c.y + c.h / 2 > viewport.height ) return false;
		if ( c.group !== undefined && c.limit !== undefined && ( counts.get( c.group ) ?? 0 ) >= c.limit ) return false;
		for ( const o of obstacles ) if ( overlaps( c, o, margin ) ) return false;
		for ( const p of placed ) if ( overlaps( c, p, margin ) ) return false;
		placed.push( c );
		if ( c.firstOf !== undefined ) firsts.add( c.firstOf );
		if ( c.group !== undefined ) counts.set( c.group, ( counts.get( c.group ) ?? 0 ) + 1 );
		return true;

	} );

}

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

function prefersReducedMotion() {

	return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
		&& window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

}

// ---- モジュール ----

export function createScale( ctx ) {

	const { scene, camera, renderer, curve, dataset, stations, ui } = ctx;

	const group = new Group();
	group.name = 'scale';
	scene.add( group );

	const ring = offsetRing( curve.seg.points, CONTOUR.offset );
	const labelRing = offsetRing( curve.seg.points, CONTOUR.offset + CONTOUR.label.extraOffset );
	const nameRing = offsetRing( curve.seg.points, CONTOUR.stationNames.offset );

	// 等高線の値は、画面の値（生データ）の最安値・最高値から決める（ミニグラフの Y 軸と同じ）。高さはレールと同じ valueToY
	const range = dataset.rawRange ?? { min: curve.closeMin, max: curve.closeMax };
	const values = contourValues( range.min, range.max );

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
	const nameGroup = new Group();
	nameGroup.name = 'station-names';
	group.add( valueGroup, nameGroup );

	const textures = new Map(); // 値 → 値ラベルのテクスチャ（その値の全ラベルで使い回す）
	const nameTextures = [];
	const entries = [];

	function addEntry( kind, texture, base, normal, extra ) {

		const material = new SpriteMaterial( { map: texture, transparent: true, depthWrite: false, opacity: 0 } );
		const sprite = new Sprite( material );
		sprite.visible = false;
		( kind === 'name' ? nameGroup : valueGroup ).add( sprite );
		entries.push( {
			kind, sprite, material, base, normal,
			aspect: texture.image.width / texture.image.height,
			show: 0, // 0..1：表示するか（視点と間引きで決まる。なめらかに変える）
			wanted: false,
			near: 1,
			depth: 0,
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

	// 値ラベルを置く駅：駅名を置く駅と同じなら、次の駅へずらす
	const labelStations = CONTOUR.label.stations.map( ( i ) => {

		let k = i;
		while ( named.has( k ) && k < ring.length - 1 ) k ++;
		return k;

	} );

	const labelBorder = `#${PALETTE.contour.toString( 16 ).padStart( 6, '0' )}`;
	values.forEach( ( v, level ) => {

		const texture = createPillTexture( formatContourLabel( v ), { textColor: HUD_COLORS.contourLabel, borderColor: labelBorder } );
		textures.set( v, texture );
		const y = curve.valueToY( v ) + CONTOUR.label.lift;
		// 等高線ごとに駅の優先順をずらす（隣の等高線のラベルが同じ駅に集まらないように）
		for ( let r = 0; r < labelStations.length; r ++ ) {

			const index = labelStations[ ( level + r ) % labelStations.length ];
			const p = labelRing[ index ];
			addEntry( 'value', texture, new Vector3( p.x, y, p.z ), outwardNormal( labelRing, index ), { level, value: v, rank: r, station: index, extra: false, ride: true } );

		}

		// 俯瞰で、決まった駅に置けなかった等高線のための予備の駅（一人称では使わない）
		const spare = CONTOUR.label.spareStations.filter( ( i ) => i < ring.length && ! named.has( i ) );
		for ( let r = 0; r < spare.length; r ++ ) {

			const index = spare[ ( level + r ) % spare.length ];
			const p = labelRing[ index ];
			addEntry( 'value', texture, new Vector3( p.x, y, p.z ), outwardNormal( labelRing, index ), { level, value: v, rank: labelStations.length + r, station: index, extra: true, ride: r < CONTOUR.label.rideSpareCount } );

		}

	} );

	for ( const s of nameStations ) {

		const texture = createPillTexture( s.name, { textColor: HUD_COLORS.text2, borderColor: HUD_COLORS.panelBorder } );
		nameTextures.push( texture );
		const p = nameRing[ s.index ];
		addEntry( 'name', texture, new Vector3( p.x, CONTOUR.stationNames.y, p.z ), outwardNormal( nameRing, s.index ), { rank: s.rank, station: s.index, label: s.name } );

	}

	// 俯瞰で置く優先順：駅名 → 各等高線に 1 つずつ（等高線ごとに、置ける駅を優先順に探す。予備の駅も使って、どの等高線にも 1 つ付ける）
	// → 残りの値ラベル（駅の優先順の 0 番目を全等高線に配ってから、1 番目…）。
	// 同じラベルが 2 回現れるが、2 回目は 1 回目の位置と重なるので置かれない（結果は OR で合わせる）
	const byLevel = values.map( ( v, level ) => entries.filter( ( e ) => e.kind === 'value' && e.level === level ).sort( ( a, b ) => a.rank - b.rank ) );
	const placementOrder = [
		...entries.filter( ( e ) => e.kind === 'name' ).sort( ( a, b ) => a.rank - b.rank ),
		...byLevel.flat().map( ( e ) => ( { first: true, entry: e } ) ),
		...entries.filter( ( e ) => e.kind === 'value' && ! e.extra ).sort( ( a, b ) => a.rank - b.rank || a.level - b.level )
	].map( ( item ) => item.entry ? item : { first: false, entry: item } );

	// ---- 視点の補間（view.js と同じ時間と曲線） ----
	const ease = cubicBezier( ...MOTION.viewEase );
	let currentView = ctx.view?.current ?? 'ride';
	let blend = currentView === 'overview' ? 1 : 0;
	let from = blend;
	let to = blend;
	let startMs = null;
	let durationMs = 0;
	let lastNowMs = 0;
	let obstacles = [];
	let obstaclesAt = - Infinity;

	function onViewChange( next ) {

		if ( next === currentView ) return;
		currentView = next;
		const goal = next === 'overview' ? 1 : 0;
		if ( prefersReducedMotion() || MOTION.viewTransitionMs <= 0 ) {

			blend = from = to = goal;
			startMs = null;
			durationMs = 0;

		} else {

			from = blend;
			to = goal;
			durationMs = MOTION.viewTransitionMs * Math.abs( to - from );
			startMs = lastNowMs;

		}

		obstaclesAt = - Infinity;

	}

	// ---- HUD のパネル（俯瞰で重ねない。位置は数百 ms おきに読み直す）----
	function readObstacles( nowMs ) {

		if ( nowMs - obstaclesAt < 400 ) return;
		obstaclesAt = nowMs;
		const list = [];
		const push = ( el ) => {

			if ( ! el ) return;
			const r = el.getBoundingClientRect();
			if ( r.width > 0 && r.height > 0 ) list.push( { x: ( r.left + r.right ) / 2, y: ( r.top + r.bottom ) / 2, w: r.width, h: r.height } );

		};

		const slots = ui?.slots ?? {};
		push( slots.readout );
		push( slots.readout?.querySelector( '.ro-badge' ) );
		push( slots.legend );
		push( slots.chart );
		push( slots.map );
		// 操作ボタンの入れ物は横いっぱいに広がることがあるので、ボタンごとに見る
		for ( const child of slots.controls?.children ?? [] ) push( child );
		obstacles = list;

	}

	// ---- 毎フレーム ----
	const size = new Vector2();
	const viewPosition = new Vector3();
	const cameraPosition = new Vector3();
	const worldPosition = new Vector3();

	function update( state ) {

		const nowMs = state.nowMs;
		const dt = Math.min( Math.max( nowMs - lastNowMs, 0 ), 500 );
		lastNowMs = nowMs;

		if ( state.view !== currentView ) onViewChange( state.view );

		if ( blend !== to && durationMs > 0 ) {

			if ( startMs === null ) startMs = nowMs;
			const s = Math.min( 1, Math.max( 0, ( nowMs - startMs ) / durationMs ) );
			blend = from + ( to - from ) * ease( s );
			if ( s >= 1 ) blend = to;

		}

		renderer.getSize( size );
		const width = size.x;
		const height = size.y;
		if ( ! ( width > 0 && height > 0 ) ) return;

		const compact = width <= CONTOUR.compactMaxWidth;
		const textPx = MathUtils.lerp( CONTOUR.textPx.ride, compact ? CONTOUR.textPx.overviewCompact : CONTOUR.textPx.overview, blend );
		const overviewing = currentView === 'overview';

		camera.updateMatrixWorld();
		cameraPosition.setFromMatrixPosition( camera.matrixWorld );
		const tanHalf = Math.tan( camera.fov * DEG / 2 );
		const fade = CONTOUR.nearFade;
		const far = CONTOUR.farFade;

		// 大きさと位置。奥行きは、カメラの空間での z（画面に垂直な距離）
		for ( const e of entries ) {

			viewPosition.copy( e.base ).applyMatrix4( camera.matrixWorldInverse );
			e.depth = - viewPosition.z;
			const distance = MathUtils.lerp( CONTOUR.rideDistance, Math.max( e.depth, 1 ), blend );
			const h = labelWorldHeight( { distance, fovDeg: camera.fov, viewportHeight: height, textPx } );
			const w = h * e.aspect;
			e.sprite.scale.set( w, h, 1 );

			// 俯瞰では、ラベルが輪（レール）の上に乗らないよう、ラベルの幅・高さの半分だけ外へ押し出す
			const push = blend * ( 0.5 * w * Math.abs( e.normal.x ) + 0.6 * h * Math.abs( e.normal.z ) );
			// 駅名は床の上に立てる（ピルの下端が床の高さ。中心を床に置くと、下半分が床に隠れる）
			const lift = e.kind === 'name' ? h / 2 : 0;
			e.sprite.position.set( e.base.x + e.normal.x * push, e.base.y + lift, e.base.z + e.normal.z * push );

			// 一人称：カメラの近くのラベルは薄くして消す（俯瞰へ向かうほど弱める）。遠いラベルも消す
			worldPosition.copy( e.sprite.position );
			const near = MathUtils.smoothstep( worldPosition.distanceTo( cameraPosition ), fade.hideBelow, fade.fullAbove );
			// 遠いラベルは、文字が小さすぎて読めないので消す（draw call も減る）
			const distanceFar = 1 - MathUtils.smoothstep( worldPosition.distanceTo( cameraPosition ), far.fadeStart, far.hideAbove );
			e.near = MathUtils.lerp( near * distanceFar, 1, blend );

		}

		// 表示するラベル：一人称は値ラベルだけ全部。俯瞰は優先順に置いて、重なるものを間引く
		for ( const e of entries ) e.wanted = e.kind === 'value' && e.ride && ! overviewing;

		if ( overviewing ) {

			readObstacles( nowMs );
			const limit = compact ? CONTOUR.declutter.maxPerLevelCompact : CONTOUR.declutter.maxPerLevel;
			let nameCount = 0;
			const candidates = placementOrder.map( ( { entry: e, first } ) => {

				viewPosition.copy( e.sprite.position ).applyMatrix4( camera.matrixWorldInverse );
				const z = - viewPosition.z;
				if ( z <= 0.1 ) return { w: 0 };
				if ( e.kind === 'name' && compact && nameCount ++ >= CONTOUR.stationNames.maxCompact ) return { w: 0 };
				const pxPerWorld = height / ( 2 * z * tanHalf );
				const c = {
					x: width / 2 + viewPosition.x * pxPerWorld,
					y: height / 2 - viewPosition.y * pxPerWorld,
					w: e.sprite.scale.x * pxPerWorld,
					h: e.sprite.scale.y * pxPerWorld
				};
				if ( e.kind === 'value' ) {

					c.group = e.level;
					c.limit = limit;
					if ( first ) c.firstOf = e.level;

				}

				return c;

			} );

			const result = placeLabels( candidates, obstacles, { width, height }, CONTOUR.declutter.margin );
			for ( const { entry } of placementOrder ) entry.wanted = false;
			placementOrder.forEach( ( { entry }, i ) => {

				if ( result[ i ] ) entry.wanted = true;

			} );

		}

		// 表示のなめらかな切り替え（時定数 fadeMs）。reduced-motion では即座に
		const k = prefersReducedMotion() ? 1 : 1 - Math.exp( - dt / CONTOUR.fadeMs );
		for ( const e of entries ) {

			const goal = e.wanted ? 1 : 0;
			e.show += ( goal - e.show ) * k;
			if ( Math.abs( e.show - goal ) < 0.02 ) e.show = goal;
			const opacity = e.show * e.near;
			e.material.opacity = opacity;
			e.sprite.visible = opacity > 0.02;

		}

	}

	return {
		contours,
		valueLabels: valueGroup,
		stationNames: nameGroup,
		/** 検証用：等高線の値と、ラベル・駅名の現在の状態。 */
		debug() {

			return {
				values,
				blend,
				labels: entries.filter( ( e ) => e.kind === 'value' ).map( ( e ) => ( { value: e.value, station: e.station, visible: e.sprite.visible, opacity: e.material.opacity } ) ),
				names: entries.filter( ( e ) => e.kind === 'name' ).map( ( e ) => ( { name: e.label, station: e.station, visible: e.sprite.visible, opacity: e.material.opacity } ) )
			};

		},
		update,
		onViewChange,
		onReset() {},
		dispose() {

			scene.remove( group );
			for ( const e of entries ) e.material.dispose();
			for ( const lines of contours.children ) {

				lines.geometry.dispose();
				lines.material.dispose();

			}

			for ( const t of [ ...textures.values(), ...nameTextures ] ) t.dispose();

		}
	};

}
