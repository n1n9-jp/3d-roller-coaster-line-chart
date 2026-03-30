import * as THREE from 'three';

import {
	RollerCoasterGeometry,
	RollerCoasterShadowGeometry,
	RollerCoasterLiftersGeometry,
	TreesGeometry,
	SkyGeometry
} from 'three/addons/misc/RollerCoaster.js';

let mesh, material, geometry;

// スタート画面制御
let gameStarted = false;
const startScreen = document.getElementById( 'start-screen' );
const startBtn = document.getElementById( 'start-btn' );
const graphCanvas = document.getElementById( 'graphCanvas' );
const mapCanvas = document.getElementById( 'mapCanvas' );
const yearDisplay = document.getElementById( 'year-display' );
const controlsInfo = document.getElementById( 'controls-info' );

startBtn.addEventListener( 'click', () => {
	gameStarted = true;
	startScreen.style.opacity = '0';
	startScreen.style.pointerEvents = 'none';
	setTimeout( () => {
		startScreen.style.display = 'none';
	}, 300 );
	graphCanvas.classList.add( 'visible' );
	mapCanvas.classList.add( 'visible' );
	yearDisplay.classList.add( 'visible' );
	controlsInfo.classList.add( 'visible' );
} );

const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
// renderer.setAnimationLoop( animate ); // データロード後に実行
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType( 'local' );
document.body.appendChild( renderer.domElement );

//

const scene = new THREE.Scene();
scene.background = new THREE.Color( 0xf0f0ff );

const light = new THREE.HemisphereLight( 0xfff0f0, 0x60606, 3 );
light.position.set( 1, 1, 1 );
scene.add( light );

const train = new THREE.Object3D();
scene.add( train );

const camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 0.1, 500 );
train.add( camera );

// environment

geometry = new THREE.PlaneGeometry( 500, 500, 15, 15 );
geometry.rotateX( - Math.PI / 2 );

const positions = geometry.attributes.position.array;
const vertex = new THREE.Vector3();

for ( let i = 0; i < positions.length; i += 3 ) {

	vertex.fromArray( positions, i );

	vertex.x += Math.random() * 10 - 5;
	vertex.z += Math.random() * 10 - 5;

	const distance = ( vertex.distanceTo( scene.position ) / 5 ) - 30;
	vertex.y = Math.random() * Math.max( 0, distance );

	vertex.toArray( positions, i );

}

geometry.computeVertexNormals();

material = new THREE.MeshLambertMaterial( {
	color: 0x407000
} );

mesh = new THREE.Mesh( geometry, material );
scene.add( mesh );

geometry = new TreesGeometry( mesh );
material = new THREE.MeshBasicMaterial( {
	side: THREE.DoubleSide, vertexColors: true
} );
mesh = new THREE.Mesh( geometry, material );
scene.add( mesh );

geometry = new SkyGeometry();
material = new THREE.MeshBasicMaterial( { color: 0xffffff } );
mesh = new THREE.Mesh( geometry, material );
scene.add( mesh );

//

let buildStationSegmentsResult = null;

// buildCurve 関数定義
function geoToXZ( lon, lat ) {
	const lonCenter = 139.739138;
	const latCenter = 35.678777;
	const SCALE = 1500;
	return {
		x: ( lon - lonCenter ) * SCALE,
		z: -( lat - latCenter ) * SCALE
	};
}

function buildStationSegments( stations ) {
	const points = stations.map( s => geoToXZ( s.lon, s.lat ) );
	points.push( points[ 0 ] ); // ループ閉合

	const segLengths = [];
	let totalLength = 0;
	for ( let i = 0; i < points.length - 1; i ++ ) {
		const dx = points[ i + 1 ].x - points[ i ].x;
		const dz = points[ i + 1 ].z - points[ i ].z;
		const len = Math.sqrt( dx * dx + dz * dz );
		segLengths.push( len );
		totalLength += len;
	}

	const segTStart = [ 0 ];
	let cumul = 0;
	for ( let i = 0; i < segLengths.length - 1; i ++ ) {
		cumul += segLengths[ i ] / totalLength;
		segTStart.push( cumul );
	}
	segTStart.push( 1.0 );

	return { points, segLengths, segTStart, totalLength };
}

function getXZAt( t, seg ) {
	const { points, segTStart } = seg;
	let lo = 0, hi = segTStart.length - 2;
	while ( lo < hi ) {
		const mid = ( lo + hi + 1 ) >> 1;
		if ( segTStart[ mid ] <= t ) lo = mid;
		else hi = mid - 1;
	}
	const i = lo;
	const tSeg = ( t - segTStart[ i ] ) / ( segTStart[ i + 1 ] - segTStart[ i ] );
	const x = points[ i ].x + ( points[ i + 1 ].x - points[ i ].x ) * tSeg;
	const z = points[ i ].z + ( points[ i + 1 ].z - points[ i ].z ) * tSeg;
	return { x, z };
}

// 移動平均を計算する関数
function applyMovingAverage( data, windowSize ) {
	return data.map( ( item, i ) => {
		const start = Math.max( 0, i - Math.floor( windowSize / 2 ) );
		const end = Math.min( data.length, i + Math.ceil( windowSize / 2 ) );
		let sum = 0;
		for ( let j = start; j < end; j ++ ) {
			sum += data[ j ].close;
		}
		const avg = sum / ( end - start );
		return {
			...item,
			close: avg
		};
	} );
}

function buildCurve( nikkeiData, stations ) {
	const seg = buildStationSegments( stations );
	buildStationSegmentsResult = seg; // グローバルに保存
	const closes = nikkeiData.map( d => d.close );
	const closeMin = Math.min( ...closes );
	const closeMax = Math.max( ...closes );

	const Y_MIN = 3;
	const Y_MAX = 35;

	function scaleY( close ) {
		return Y_MIN + ( close - closeMin ) / ( closeMax - closeMin ) * ( Y_MAX - Y_MIN );
	}

	function getNikkeiY( t, data ) {
		const n = data.length;
		const raw = t * ( n - 1 );
		const i0 = Math.floor( raw );
		const i1 = Math.min( i0 + 1, n - 1 );
		const frac = raw - i0;
		const close = data[ i0 ].close * ( 1 - frac ) + data[ i1 ].close * frac;
		return scaleY( close );
	}

	const _vec = new THREE.Vector3();
	const _vec2 = new THREE.Vector3();

	return {
		getPointAt( t ) {
			t = t % 1;
			if ( t < 0 ) t += 1;

			const { x, z } = getXZAt( t, seg );
			const y = getNikkeiY( t, nikkeiData );

			return _vec.set( x, y, z );
		},

		getTangentAt( t ) {
			const delta = 0.0001;
			const t1 = ( t - delta + 1 ) % 1;
			const t2 = ( t + delta ) % 1;
			// XZ平面の水平方向の接線のみを使用（Y成分を無視）
			const { x: x1, z: z1 } = getXZAt( t1, seg );
			const { x: x2, z: z2 } = getXZAt( t2, seg );
			return _vec2.set( x2 - x1, 0, z2 - z1 ).normalize();
		},

		getHeightGradientAt( t ) {
			// 高さの勾配を計算（速度計算用）
			const delta = 0.0001;
			const t1 = ( t - delta + 1 ) % 1;
			const t2 = ( t + delta ) % 1;
			const y1 = getNikkeiY( t1, nikkeiData );
			const y2 = getNikkeiY( t2, nikkeiData );
			return ( y2 - y1 ) / ( 2 * delta );
		}
	};
}

// データロード
const [ nikkeiData, yamanoteRaw ] = await Promise.all( [
	fetch( './data/nikkei225.json' ).then( r => r.json() ),
	fetch( './data/train-yamanote.json' ).then( r => r.json() )
] );
const stations = yamanoteRaw[ 0 ].station_l;

// 移動平均データを生成（ローラーコースター用）
const smoothedData = applyMovingAverage( nikkeiData, 4 );

// curve 生成
const curve = buildCurve( smoothedData, stations );

geometry = new RollerCoasterGeometry( curve, 1500 );
material = new THREE.MeshPhongMaterial( {
	vertexColors: true
} );
mesh = new THREE.Mesh( geometry, material );
scene.add( mesh );

geometry = new RollerCoasterLiftersGeometry( curve, 100 );
material = new THREE.MeshPhongMaterial();
mesh = new THREE.Mesh( geometry, material );
mesh.position.y = 0.1;
scene.add( mesh );

geometry = new RollerCoasterShadowGeometry( curve, 500 );
material = new THREE.MeshBasicMaterial( {
	color: 0x305000, depthWrite: false, transparent: true
} );
mesh = new THREE.Mesh( geometry, material );
mesh.position.y = 0.1;
scene.add( mesh );

// アニメーションループ開始
renderer.setAnimationLoop( animate );

const funfairs = [];

// 視点制御状態
let isFPSMode = true;
let isWKeyPressed = false;
let isSpacePressed = false;

//

geometry = new THREE.CylinderGeometry( 10, 10, 5, 15 );
material = new THREE.MeshLambertMaterial( {
	color: 0xff8080
} );
mesh = new THREE.Mesh( geometry, material );
mesh.position.set( - 80, 10, - 70 );
mesh.rotation.x = Math.PI / 2;
scene.add( mesh );

funfairs.push( mesh );

geometry = new THREE.CylinderGeometry( 5, 6, 4, 10 );
material = new THREE.MeshLambertMaterial( {
	color: 0x8080ff
} );
mesh = new THREE.Mesh( geometry, material );
mesh.position.set( 50, 2, 30 );
scene.add( mesh );

funfairs.push( mesh );

// 現在位置マーカー（俯瞰視点用）
geometry = new THREE.SphereGeometry( 3, 8, 8 );
material = new THREE.MeshBasicMaterial( {
	color: 0xff3333
} );
const positionMarker = new THREE.Mesh( geometry, material );
positionMarker.visible = false;
scene.add( positionMarker );

//

window.addEventListener( 'resize', onWindowResize );

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

// wキー持続押下で視点切り替え
function updateViewMode() {

	if ( renderer.xr.isPresenting ) return;

	const shouldBeOverview = isWKeyPressed;

	if ( shouldBeOverview && isFPSMode ) {

		// FPS → 俯瞰
		isFPSMode = false;
		train.remove( camera );
		camera.position.set( 0, 200, 0 );
		camera.lookAt( 0, 0, 0 );
		scene.add( camera );

	} else if ( ! shouldBeOverview && ! isFPSMode ) {

		// 俯瞰 → FPS
		isFPSMode = true;
		scene.remove( camera );
		camera.position.set( 0, 0.3, 0 );
		camera.rotation.set( 0, 0, 0 );
		train.add( camera );

	}

}

window.addEventListener( 'keydown', ( e ) => {

	if ( ( e.key === 'w' || e.key === 'W' ) && ! e.repeat ) {

		isWKeyPressed = true;
		updateViewMode();

	}

} );

window.addEventListener( 'keyup', ( e ) => {

	if ( ( e.key === 'w' || e.key === 'W' ) ) {

		isWKeyPressed = false;
		updateViewMode();

	}

} );

// ウィンドウがフォーカスを失ったときに、キー状態をリセット
window.addEventListener( 'blur', () => {

	if ( isWKeyPressed ) {

		isWKeyPressed = false;
		updateViewMode();

	}

} );

// SPACEキーでアニメーション停止
window.addEventListener( 'keydown', ( e ) => {

	if ( e.code === 'Space' && ! e.repeat ) {

		isSpacePressed = true;
		e.preventDefault();

	}

} );

window.addEventListener( 'keyup', ( e ) => {

	if ( e.code === 'Space' ) {

		isSpacePressed = false;
		e.preventDefault();

	}

} );

//

const position = new THREE.Vector3();
const tangent = new THREE.Vector3();

const lookAt = new THREE.Vector3();

let velocity = 0.00006; // 時計回り（0.00004 * 1.5）
let progress = 7 / 29; // 新宿からスタート（駅索引7 / 全駅数29）

let prevTime = performance.now();

// カメラの向きを滑らかに補間するための変数
const targetQuaternion = new THREE.Quaternion();
const tempObject3D = new THREE.Object3D();

// グラフ用 Canvas context
const graphCtx = graphCanvas.getContext( '2d' );

function drawGraph() {

	if ( ! nikkeiData ) return; // データロード前はスキップ

	const w = graphCanvas.width;
	const h = graphCanvas.height;

	// 背景クリア
	graphCtx.fillStyle = 'rgba(255, 255, 255, 0.95)';
	graphCtx.fillRect( 0, 0, w, h );

	// グリッドライン
	graphCtx.strokeStyle = '#eee';
	graphCtx.lineWidth = 1;
	graphCtx.beginPath();
	graphCtx.moveTo( 0, h / 2 );
	graphCtx.lineTo( w, h / 2 );
	graphCtx.stroke();

	// データを折れ線で描画
	const dataPoints = nikkeiData.length;
	const padding = 10;
	const graphW = w - padding * 2;
	const graphH = h - padding * 2;

	const closes = nikkeiData.map( d => d.close );
	const closeMin = Math.min( ...closes );
	const closeMax = Math.max( ...closes );

	graphCtx.strokeStyle = '#0066cc';
	graphCtx.lineWidth = 1.5;
	graphCtx.beginPath();

	for ( let i = 0; i < dataPoints; i ++ ) {

		const x = padding + ( i / ( dataPoints - 1 ) ) * graphW;
		const normalized = ( closes[ i ] - closeMin ) / ( closeMax - closeMin );
		const y = padding + ( 1 - normalized ) * graphH;

		if ( i === 0 ) graphCtx.moveTo( x, y );
		else graphCtx.lineTo( x, y );

	}

	graphCtx.stroke();

	// 現在位置マーカー
	const currentX = padding + progress * graphW;
	const currentNormalized = ( closes[ Math.floor( progress * ( dataPoints - 1 ) ) ] - closeMin ) / ( closeMax - closeMin );
	const currentY = padding + ( 1 - currentNormalized ) * graphH;

	graphCtx.fillStyle = '#ff3333';
	graphCtx.beginPath();
	graphCtx.arc( currentX, currentY, 4, 0, Math.PI * 2 );
	graphCtx.fill();

	// テキスト
	graphCtx.fillStyle = '#333';
	graphCtx.font = '10px "Noto Sans", sans-serif';
	graphCtx.textAlign = 'center';
	graphCtx.textBaseline = 'middle';
	graphCtx.fillText( 'Nikkei 225', 100, 100 );

}

// 地図用 Canvas context
const mapCtx = mapCanvas.getContext( '2d' );

function drawMap() {

	if ( ! buildStationSegmentsResult || ! stations ) return; // データロード前はスキップ

	const w = mapCanvas.width;
	const h = mapCanvas.height;

	// 背景クリア
	mapCtx.fillStyle = 'rgba(255, 255, 255, 0.95)';
	mapCtx.fillRect( 0, 0, w, h );

	// 山手線駅をプロット
	const padding = 8;
	const maxSize = Math.min( w, h ) - padding * 2;

	const lonMin = 139.700261;
	const lonMax = 139.778015;
	const latMin = 35.619772;
	const latMax = 35.737781;
	const lonRange = lonMax - lonMin;
	const latRange = latMax - latMin;

	// アスペクト比を正確に保つ
	const aspectRatio = latRange / lonRange; // 約 1.518
	let mapW, mapH, offsetX, offsetY;

	if ( aspectRatio > 1 ) {
		// 緯度が大きい（縦長）
		mapH = maxSize;
		mapW = maxSize / aspectRatio;
		offsetX = ( w - mapW ) / 2;
		offsetY = padding;
	} else {
		// 経度が大きい（横長）
		mapW = maxSize;
		mapH = maxSize * aspectRatio;
		offsetX = padding;
		offsetY = ( h - mapH ) / 2;
	}

	// 駅をプロット（単純な平面図法）
	const stationPoints = stations.map( s => {
		const normLon = ( s.lon - lonMin ) / lonRange;
		const normLat = ( s.lat - latMin ) / latRange;
		return {
			x: offsetX + normLon * mapW,
			y: offsetY + ( 1 - normLat ) * mapH,
			name: s.station_name
		};
	} );

	// 駅を線で結ぶ
	mapCtx.strokeStyle = '#00aa00';
	mapCtx.lineWidth = 1.5;
	mapCtx.beginPath();

	for ( let i = 0; i < stationPoints.length; i ++ ) {
		const p = stationPoints[ i ];
		if ( i === 0 ) mapCtx.moveTo( p.x, p.y );
		else mapCtx.lineTo( p.x, p.y );
	}

	// ループを閉じる
	mapCtx.lineTo( stationPoints[ 0 ].x, stationPoints[ 0 ].y );
	mapCtx.stroke();

	// 駅をドットで表示
	mapCtx.fillStyle = '#00aa00';
	for ( const p of stationPoints ) {
		mapCtx.beginPath();
		mapCtx.arc( p.x, p.y, 2, 0, Math.PI * 2 );
		mapCtx.fill();
	}

	// 現在位置マーカー
	const trainXZ = getXZAt( progress, buildStationSegmentsResult );
	const trainLon = trainXZ.x / 1500 + 139.739138;
	const trainLat = -trainXZ.z / 1500 + 35.678777;

	const trainNormLon = ( trainLon - lonMin ) / lonRange;
	const trainNormLat = ( trainLat - latMin ) / latRange;

	const trainX = offsetX + trainNormLon * mapW;
	const trainY = offsetY + ( 1 - trainNormLat ) * mapH;

	mapCtx.fillStyle = '#ff3333';
	mapCtx.beginPath();
	mapCtx.arc( trainX, trainY, 4, 0, Math.PI * 2 );
	mapCtx.fill();

	// テキスト
	mapCtx.fillStyle = '#333';
	mapCtx.font = '10px "Noto Sans", sans-serif';
	mapCtx.textAlign = 'center';
	mapCtx.textBaseline = 'middle';
	mapCtx.fillText( 'Yamanote Line', 100, 100 );

}

function animate() {

	const time = performance.now();
	const delta = time - prevTime;

	for ( let i = 0; i < funfairs.length; i ++ ) {

		funfairs[ i ].rotation.y = time * 0.0004;

	}

	//

	// SPACEキーが押されていない場合のみ進行
	if ( ! isSpacePressed ) {

		progress += velocity;
		progress = progress % 1;

		position.copy( curve.getPointAt( progress ) );
		position.y += 0.3;

		train.position.copy( position );

		tangent.copy( curve.getTangentAt( progress ) );

		// 高さ勾配から速度を調整（重力効果）
		const heightGradient = curve.getHeightGradientAt( progress );
		velocity -= heightGradient * 0.0000001 * delta;
		// 速度の範囲：正の値で時計回り（1.5倍）
		velocity = Math.max( 0.00006, Math.min( 0.0003, velocity ) );

		// レール方向（傾斜を含む）に合わせる
		const railDirection = new THREE.Vector3(
			tangent.x,
			heightGradient * 0.0009,
			tangent.z
		).normalize();

		// 目標のQuaternionを計算
		tempObject3D.position.copy( position );
		tempObject3D.lookAt( lookAt.copy( position ).sub( railDirection ) );
		targetQuaternion.copy( tempObject3D.quaternion );

		// 現在の回転を目標に向けて滑らかに補間
		train.quaternion.slerp( targetQuaternion, 0.08 );

		// 現在位置マーカーを更新
		positionMarker.position.copy( position );
		positionMarker.visible = !isFPSMode; // 俯瞰視点のみ表示

	}

	//

	renderer.render( scene, camera );

	// UI 更新（ゲーム開始後）
	if ( gameStarted ) {
		drawGraph();
		drawMap();

		// 年表示を更新
		if ( nikkeiData ) {
			const dataIndex = Math.floor( progress * ( nikkeiData.length - 1 ) );
			const dateStr = nikkeiData[ dataIndex ].date;
			const year = dateStr.substring( 0, 4 );
			yearDisplay.textContent = year;
		}
	}

	prevTime = time;

}
