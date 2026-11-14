// イベントの 3D の目印（アーチ・ひし形・縦線・年ラベル）。機能モジュール（createMarkers( ctx )）。担当：イベント注釈。
//
// 実データ（dataset.meta.kind === 'real'）のときだけ置く。サンプルでは何もしない。
// 出来事の位置は events-data.js が data/events.json から計算する（progress）。ここは 3D の部品を置くだけ。
//
// 各出来事に置くもの（scene の 'event-markers' グループの子）：
//   アーチ     レール（中心線）をまたぐ半円。平面は水平の接線に垂直で、半円が上。一人称は細いチューブ、俯瞰は 1px の線
//   ひし形     アーチの頂点の上。ゆっくり回る（実時間 state.nowMs。reduced-motion では回さない）
//   縦線       床からレールまで
//   年ラベル   俯瞰のときだけ、ひし形の上に「2008」。重なるものは間引く
//
// 俯瞰のラベルの優先順位は「年ラベル ＞ 値ラベルの軸 ＞ 駅名」（labels.js）。年ラベルは HUD と年ラベルどうしだけを避けて置き、
// 置いた矩形を共有の掲示板（getLabelBoard( ctx )）の 'event' 層に登録する。値ラベルと駅名（scale.js）はそれを避ける。
//
// 大きさ
//   一人称：ワールド座標の固定値（config.js の ANNOT.marker）。アーチの半径はカメラが通る高さ
//     （レール中心線の 0〜2.6 上、勾配が急なほど高い）を内側に収められる値にしてある。
//   俯瞰：カメラの距離や画角は他の担当が調整中なので、固定の倍率は使わない。毎フレーム、ctx.camera の位置・画角と
//     描画サイズから「画面上の 1 ワールド単位が何 px か」を出し、年ラベルの文字が 14px、ひし形が 10px になるよう決める。

import * as THREE from 'three';
import { PALETTE, HUD_COLORS, FONT_SANS, ANNOT } from './config.js';
import { ensureEvents } from './events-data.js';
import { collidesAny, insideViewport, getLabelBoard } from './labels.js';

const DEG = Math.PI / 180;

/** 年ラベルの CanvasTexture（ピル型。文字は fontPx、余白は label.padX / padY）。戻り値の width / height は canvas の px。 */
function createLabelTexture( text, label ) {

	const { fontPx, padX, padY, border } = label;
	const canvas = document.createElement( 'canvas' );
	const g = canvas.getContext( '2d' );
	g.font = `700 ${fontPx}px ${FONT_SANS}`;
	const width = Math.ceil( g.measureText( text ).width + padX * 2 );
	const height = fontPx + padY * 2;
	canvas.width = width;
	canvas.height = height;

	// canvas の大きさを変えるとコンテキストの状態が消えるので、描き直す
	g.font = `700 ${fontPx}px ${FONT_SANS}`;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	const r = height / 2;
	g.beginPath();
	g.roundRect( border / 2, border / 2, width - border, height - border, r );
	g.fillStyle = HUD_COLORS.panel;
	g.fill();
	g.lineWidth = border;
	g.strokeStyle = `#${PALETTE.event.toString( 16 ).padStart( 6, '0' )}`;
	g.stroke();
	g.fillStyle = HUD_COLORS.text1;
	g.fillText( text, width / 2, height / 2 + fontPx * 0.04 );

	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return { texture, width, height };

}

export function createMarkers( ctx ) {

	if ( ctx.dataset?.meta?.kind !== 'real' ) return {};

	const { scene, curve, camera, renderer } = ctx;
	const board = getLabelBoard( ctx );
	const M = ANNOT.marker;
	const O = M.overview;

	const group = new THREE.Group();
	group.name = 'event-markers';
	scene.add( group );

	// ---- 共有の形と材質 ----
	const archGeometry = new THREE.TorusGeometry( M.archRadius, M.archTube, M.archTubeSegments, M.archSegments, Math.PI );
	const archLineGeometry = new THREE.BufferGeometry().setFromPoints(
		Array.from( { length: M.archSegments + 1 }, ( _, i ) => {

			const a = Math.PI * i / M.archSegments;
			return new THREE.Vector3( Math.cos( a ) * M.archRadius, Math.sin( a ) * M.archRadius, 0 );

		} )
	);
	const diamondGeometry = new THREE.OctahedronGeometry( M.diamondRadius );

	const archMaterial = new THREE.MeshBasicMaterial( { color: PALETTE.event } );
	const archLineMaterial = new THREE.LineBasicMaterial( { color: PALETTE.event, transparent: true, opacity: M.archLineOpacity } );
	// 面ごとに明るさが変わる（回っているのが見える）ように、自己発光を半分にした Lambert。色は PALETTE.event
	const diamondMaterial = new THREE.MeshLambertMaterial( { color: PALETTE.event, emissive: PALETTE.event, emissiveIntensity: 0.55, flatShading: true } );
	const stemMaterial = new THREE.LineBasicMaterial( { color: PALETTE.event, transparent: true, opacity: M.lineOpacity, depthWrite: false } );

	const labelTextures = new Map(); // 年の文字列 → { texture, width, height }
	const labelMaterials = [];

	let items = [];
	let disposed = false;

	// prefers-reduced-motion: reduce のときはひし形を回さない（設定の変更にも追従する）
	const reducedQuery = typeof window !== 'undefined' && window.matchMedia
		? window.matchMedia( '(prefers-reduced-motion: reduce)' )
		: null;
	let reducedMotion = reducedQuery?.matches ?? false;
	const onReducedChange = ( e ) => {

		reducedMotion = e.matches;

	};

	reducedQuery?.addEventListener?.( 'change', onReducedChange );

	function labelFor( year ) {

		if ( ! labelTextures.has( year ) ) labelTextures.set( year, createLabelTexture( year, M.label ) );
		return labelTextures.get( year );

	}

	function build( events ) {

		for ( const event of events ) {

			const position = curve.getPointAt( event.progress ).clone();
			const tangent = curve.getTangentAt( event.progress ).clone();

			const root = new THREE.Group();
			root.name = `event-marker-${event.date}`;
			root.position.copy( position );
			root.rotation.y = Math.atan2( tangent.x, tangent.z ); // ローカルの +Z（アーチの平面の法線）を進行方向へ

			const arch = new THREE.Mesh( archGeometry, archMaterial );
			const archLine = new THREE.Line( archLineGeometry, archLineMaterial );
			const diamond = new THREE.Mesh( diamondGeometry, diamondMaterial );

			// 床からレールまでの縦線（床のグリッドと z-fighting しないよう 0.05 から。レールの中心線の少し下まで）
			const stemBottom = - position.y + 0.05;
			const stem = new THREE.Line(
				new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, stemBottom, 0 ), new THREE.Vector3( 0, - 0.2, 0 ) ] ),
				stemMaterial
			);

			// 年ラベル（俯瞰のときだけ）。重なりの判定のため、画面上の大きさも毎フレーム求める
			const year = event.date.slice( 0, 4 );
			const { texture, width, height } = labelFor( year );
			const labelMaterial = new THREE.SpriteMaterial( { map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false } );
			labelMaterials.push( labelMaterial );
			const label = new THREE.Sprite( labelMaterial );
			label.renderOrder = 10;
			label.visible = false;

			root.add( arch, archLine, diamond, stem, label );
			group.add( root );
			items.push( { event, root, position, arch, archLine, diamond, label, labelSize: { width, height } } );

		}

	}

	ensureEvents( ctx ).then( ( events ) => {

		if ( disposed || events.length === 0 ) return;
		build( events );

	} );

	// ---- 毎フレーム ----
	const rendererSize = new THREE.Vector2();
	const viewPosition = new THREE.Vector3();
	const projected = new THREE.Vector3();

	/** 俯瞰：画面上の 1 ワールド単位が何 px か（その出来事の奥行きで）。 */
	function pixelsPerUnit( worldPosition, heightPx ) {

		viewPosition.copy( worldPosition ).applyMatrix4( camera.matrixWorldInverse );
		const depth = Math.max( 0.5, - viewPosition.z );
		return heightPx / ( 2 * depth * Math.tan( camera.fov * DEG / 2 ) );

	}

	function layoutRide( item, nowMs ) {

		const { arch, archLine, diamond, label } = item;
		arch.visible = true;
		archLine.visible = false;
		label.visible = false;
		diamond.scale.setScalar( 1 );
		diamond.position.set( 0, M.archRadius + M.diamondGap + M.diamondRadius, 0 );
		diamond.rotation.y = reducedMotion ? 0.4 : nowMs * 0.001 * M.diamondSpin;

	}

	function layoutOverview( item, nowMs, heightPx, widthPx, accepted ) {

		const { arch, archLine, diamond, label, position, labelSize } = item;
		const ppu = pixelsPerUnit( position, heightPx );

		// アーチは細い線にする（チューブは 1px に満たず見えないため）。半径は下限をかける
		const archScale = Math.max( 1, O.archMinPx / ( M.archRadius * ppu ) );
		arch.visible = false;
		archLine.visible = true;
		archLine.scale.setScalar( archScale );

		// ひし形：画面上で高さ diamondPx
		const diamondScale = Math.max( 1, O.diamondPx / ( 2 * M.diamondRadius * ppu ) );
		diamond.scale.setScalar( diamondScale );
		const diamondY = M.archRadius * archScale + M.diamondGap * diamondScale + M.diamondRadius * diamondScale;
		diamond.position.set( 0, diamondY, 0 );
		diamond.rotation.y = reducedMotion ? 0.4 : nowMs * 0.001 * M.diamondSpin;

		// 年ラベル：文字（fontPx）が画面上で labelTextPx になる大きさ。ひし形の上端から labelGapPx 上
		const pxPerCanvasPx = O.labelTextPx / M.label.fontPx;
		const labelHeightPx = labelSize.height * pxPerCanvasPx;
		const labelWidthPx = labelSize.width * pxPerCanvasPx;
		const labelY = diamondY + M.diamondRadius * diamondScale + ( O.labelGapPx + labelHeightPx / 2 ) / ppu;
		label.position.set( 0, labelY, 0 );
		label.scale.set( labelWidthPx / ppu, labelHeightPx / ppu, 1 );

		// 重なるラベルは間引く（時系列で先のものを残す）。画面からはみ出すものや、カメラの後ろも出さない
		projected.set( position.x, position.y + labelY, position.z ).project( camera );
		let show = projected.z > -1 && projected.z < 1;
		if ( show ) {

			const rect = {
				x: ( projected.x * 0.5 + 0.5 ) * widthPx,
				y: ( 1 - ( projected.y * 0.5 + 0.5 ) ) * heightPx,
				w: labelWidthPx,
				h: labelHeightPx
			};
			if ( ! insideViewport( rect, { width: widthPx, height: heightPx } ) ) show = false;
			else if ( collidesAny( rect, accepted.hud, O.labelPad ) || collidesAny( rect, accepted.labels, O.labelPad * 2 ) ) show = false;
			else accepted.labels.push( rect );

		}

		label.visible = show;

	}

	let lastNowMs = 0;

	/** 俯瞰：このフレームのカメラで年ラベルを置き、置いた矩形を返す。scale.js も掲示板から（先に）呼ぶ。 */
	function layoutAllOverview( nowMs ) {

		if ( items.length === 0 || ctx.view?.current !== 'overview' ) return [];
		renderer.getSize( rendererSize );
		if ( ! ( rendererSize.x > 0 && rendererSize.y > 0 ) ) return [];
		camera.updateMatrixWorld();
		// HUD の部品（帯・凡例・ミニグラフ・路線図・ボタン・キャプション）の下に入る年ラベルは出さない（読めなくなるため）。
		// HUD の矩形は labels.js の共有の読み取り（400ms ごと。値ラベル・駅名と同じ判定）
		const accepted = { hud: board.hud.read( nowMs, `${rendererSize.x}x${rendererSize.y}` ), labels: [] };
		for ( const item of items ) layoutOverview( item, nowMs, rendererSize.y, rendererSize.x, accepted );
		return accepted.labels;

	}

	board.provide( 'event', () => layoutAllOverview( lastNowMs ) );

	return {
		update( state ) {

			lastNowMs = state.nowMs;
			if ( items.length === 0 ) return;

			if ( state.view === 'overview' ) {

				board.set( 'event', layoutAllOverview( state.nowMs ) );

			} else {

				for ( const item of items ) layoutRide( item, state.nowMs );
				board.set( 'event', [] );

			}

		},
		dispose() {

			disposed = true;
			board.clear( 'event' );
			reducedQuery?.removeEventListener?.( 'change', onReducedChange );
			scene.remove( group );
			for ( const item of items ) {

				item.root.traverse( ( node ) => {

					if ( node.geometry && node.geometry !== archGeometry && node.geometry !== archLineGeometry && node.geometry !== diamondGeometry ) node.geometry.dispose();

				} );

			}

			archGeometry.dispose();
			archLineGeometry.dispose();
			diamondGeometry.dispose();
			for ( const material of [ archMaterial, archLineMaterial, diamondMaterial, stemMaterial, ...labelMaterials ] ) material.dispose();
			for ( const { texture } of labelTextures.values() ) texture.dispose();
			items = [];

		}
	};

}
