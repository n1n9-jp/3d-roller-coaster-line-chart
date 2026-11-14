import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeButtons, reducedRideMotion } from '../assets/js/ui/buttons.js';
import { createControls } from '../assets/js/controls.js';
import { createEvents } from '../assets/js/events.js';
import { MOTION } from '../assets/js/config.js';

// ---- 状態 → ラベル・aria-label・アイコン ----

test( '通常（走行中・一人称）：一時停止／俯瞰／最初から／情報', () => {

	const d = describeButtons( { paused: false, finished: false, view: 'ride', infoOpen: false } );
	assert.deepEqual( d[ 'toggle-pause' ], { label: '一時停止', ariaLabel: '一時停止（Space）', icon: 'pause', disabled: false } );
	assert.deepEqual( d.view, { label: '俯瞰', ariaLabel: '俯瞰で見る（W）', icon: 'eye', disabled: false } );
	assert.deepEqual( d.restart, { label: '最初から', ariaLabel: '最初から乗り直す（R）', icon: 'restart', disabled: false } );
	assert.deepEqual( d.home, { label: 'トップ', ariaLabel: 'スタート画面に戻る（T）', icon: 'home', disabled: false } );
	assert.deepEqual( d.info, { label: '情報', ariaLabel: '情報パネルを開く（I）', icon: 'info', disabled: false, expanded: false } );

} );

test( '一時停止中は「再生」、俯瞰中は「一人称」に差し替わる', () => {

	const d = describeButtons( { paused: true, view: 'overview' } );
	assert.deepEqual( d[ 'toggle-pause' ], { label: '再生', ariaLabel: '再生（Space）', icon: 'play', disabled: false } );
	assert.deepEqual( d.view, { label: '一人称', ariaLabel: '一人称に戻る（W）', icon: 'person', disabled: false } );

} );

test( '最後の週で止まったあとは、一時停止／再生だけが無効。最初から・視点・情報は有効', () => {

	for ( const paused of [ false, true ] ) {

		const d = describeButtons( { paused, finished: true } );
		assert.equal( d[ 'toggle-pause' ].disabled, true );
		assert.equal( d.view.disabled, false );
		assert.equal( d.restart.disabled, false );
		assert.equal( d.info.disabled, false );

	}

} );

test( '情報ボタンの aria-expanded は情報パネルの開閉に従い、ラベルは変わらない', () => {

	const closed = describeButtons( { infoOpen: false } ).info;
	const open = describeButtons( { infoOpen: true } ).info;
	assert.equal( closed.expanded, false );
	assert.equal( open.expanded, true );
	assert.equal( open.label, closed.label );
	assert.equal( open.ariaLabel, closed.ariaLabel );

} );

test( '引数なしでも既定の状態（走行中・一人称・パネルは閉じている）', () => {

	assert.deepEqual( describeButtons(), describeButtons( { paused: false, finished: false, view: 'ride', infoOpen: false } ) );

} );

test( 'aria-label にはショートカットのキーが入り、表示ラベルと食い違わない', () => {

	const keys = { 'toggle-pause': 'Space', view: 'W', restart: 'R', home: 'T', info: 'I' };
	for ( const state of [ {}, { paused: true }, { view: 'overview' }, { finished: true }, { infoOpen: true } ] ) {

		const d = describeButtons( state );
		for ( const [ action, key ] of Object.entries( keys ) ) {

			assert.ok( d[ action ].ariaLabel.endsWith( `（${key}）` ), `${action}: ${d[ action ].ariaLabel}` );
			assert.ok( d[ action ].label.length > 0 );

		}

	}

} );

// ---- reduced-motion の係数を選ぶ ----

test( 'reduced かつ一人称のときだけ MOTION.reducedRide を使う', () => {

	const r = MOTION.reducedRide;
	assert.equal( reducedRideMotion( { reduced: true, view: 'ride' }, r ), r );
	assert.equal( reducedRideMotion( { reduced: true, view: 'overview' }, r ), null );
	assert.equal( reducedRideMotion( { reduced: false, view: 'ride' }, r ), null );
	assert.equal( reducedRideMotion( { reduced: false, view: 'overview' }, r ), null );
	assert.equal( reducedRideMotion( { reduced: true, view: 'ride' }, undefined ), null );

} );

// ---- キーボード（W の戻り先。controls.js）----

function setupKeyboard() {

	const listeners = new Map();
	globalThis.Element = class Element {};
	globalThis.window = {
		addEventListener( type, fn ) {

			if ( ! listeners.has( type ) ) listeners.set( type, new Set() );
			listeners.get( type ).add( fn );

		},
		removeEventListener( type, fn ) {

			listeners.get( type )?.delete( fn );

		}
	};

	const events = createEvents();
	let current = 'ride';
	const view = {
		get current() {

			return current;

		},
		setView( next ) {

			if ( next === current ) return;
			current = next;
			events.emit( 'viewchange', { view: current } );

		},
		toggleView() {

			view.setView( current === 'ride' ? 'overview' : 'ride' );

		}
	};
	const calls = [];
	const ride = { started: true, finished: false, togglePause: () => calls.push( 'toggle' ), restart: () => calls.push( 'restart' ) };
	const controls = createControls( { ride, view, events } );

	function key( type, init ) {

		const e = { code: '', key: '', repeat: false, target: null, preventDefault() {}, ...init };
		for ( const fn of listeners.get( type ) ?? [] ) fn( e );

	}

	return {
		view, calls, controls,
		down: ( k, init = {} ) => key( 'keydown', { key: k, code: k === ' ' ? 'Space' : `Key${k.toUpperCase()}`, ...init } ),
		up: ( k, init = {} ) => key( 'keyup', { key: k, ...init } )
	};

}

test( 'W：押している間だけ俯瞰で、離すと押す前の視点に戻る', () => {

	const kb = setupKeyboard();
	kb.down( 'w' );
	assert.equal( kb.view.current, 'overview' );
	kb.down( 'w', { repeat: true } );
	kb.up( 'w' );
	assert.equal( kb.view.current, 'ride' );
	kb.controls.dispose();

} );

test( 'ボタンで俯瞰にした状態で W を押して離しても、俯瞰のまま（ボタンで選んだ視点へ戻る）', () => {

	const kb = setupKeyboard();
	kb.view.toggleView(); // ボタンで俯瞰へ
	kb.down( 'w' );
	assert.equal( kb.view.current, 'overview' );
	kb.up( 'w' );
	assert.equal( kb.view.current, 'overview' );
	kb.controls.dispose();

} );

test( 'W を押している間にボタンで視点を選び直したら、離したあともその視点', () => {

	const kb = setupKeyboard();
	kb.down( 'w' ); // 一人称 → 俯瞰（押す前は一人称）
	kb.view.toggleView(); // ボタンで一人称へ
	assert.equal( kb.view.current, 'ride' );
	kb.up( 'w' );
	assert.equal( kb.view.current, 'ride' );

	kb.view.toggleView(); // 俯瞰へ
	kb.down( 'w' );
	kb.view.toggleView(); // ボタンで一人称へ
	kb.up( 'w' );
	assert.equal( kb.view.current, 'ride' );
	kb.controls.dispose();

} );

test( 'ボタンにフォーカスがあるとき、Space はショートカットとして働かない（ボタンの click が 1 回だけ働く）', () => {

	const kb = setupKeyboard();
	const button = Object.assign( new globalThis.Element(), { closest: ( q ) => ( q.includes( 'button' ) ? button : null ) } );
	kb.down( ' ', { target: button } );
	assert.deepEqual( kb.calls, [] );

	kb.down( ' ' ); // フォーカスがないとき
	assert.deepEqual( kb.calls, [ 'toggle' ] );
	kb.controls.dispose();

} );
