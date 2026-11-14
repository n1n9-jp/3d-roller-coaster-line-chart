// キーボード入力。ride と view の API を呼ぶだけ。
//   SPACE : 一時停止と再生のトグル
//   W     : 押している間だけ俯瞰（離すと、押す前の視点に戻る）
//   R     : 最初から
//   T     : スタート画面へ戻る（ページを開き直す）
//   M     : 音のオン・オフ（乗車前でも効く）
// フォーカスがボタン・リンク・入力欄にあるときは SPACE を横取りしない（ボタンの操作を優先する。
// Space・Enter はそのボタンの click になるので、ショートカットと二重に働かない）。
// W を押しているあいだに、画面上のボタンで視点を選び直したときは、離したあとその視点にとどまる。
// 修飾キー（Ctrl / Cmd / Alt）つきは無視する（Ctrl+R のリロードなどを妨げない）。
// 画面上のボタンは ui/buttons.js。

import { goHome } from './ui/buttons.js';

const INTERACTIVE = 'button, a[href], input, select, textarea, summary, [role="button"], [contenteditable=""], [contenteditable="true"]';
const TEXT_INPUT = 'input, select, textarea, [contenteditable=""], [contenteditable="true"]';

export function createControls( { ride, view, events = null, sound = null } ) {

	let viewBeforeW = null; // W を押しているあいだだけ入る
	let changingByW = false; // W 自身による視点の切り替え中

	function setViewByW( next ) {

		changingByW = true;
		try {

			view.setView( next );

		} finally {

			changingByW = false;

		}

	}

	function releaseW() {

		if ( viewBeforeW === null ) return;
		const back = viewBeforeW;
		viewBeforeW = null;
		setViewByW( back );

	}

	// W を押している最中に、ボタンなど W 以外で視点が変わったら、それが「戻る先」になる
	const stopWatchingView = events?.on( 'viewchange', ( { view: next } ) => {

		if ( viewBeforeW !== null && ! changingByW ) viewBeforeW = next;

	} );

	function onKeyDown( e ) {

		if ( e.ctrlKey || e.metaKey || e.altKey ) return;
		const target = e.target instanceof Element ? e.target : null;
		if ( target && target.closest( TEXT_INPUT ) ) return;

		if ( e.code === 'Space' ) {

			if ( target && target.closest( INTERACTIVE ) ) return;
			e.preventDefault(); // ページのスクロールを防ぐ
			if ( e.repeat || ! ride.started || ride.finished ) return;
			ride.togglePause();

		} else if ( e.key === 'w' || e.key === 'W' ) {

			if ( e.repeat || viewBeforeW !== null ) return;
			viewBeforeW = view.current;
			setViewByW( 'overview' );

		} else if ( e.key === 'r' || e.key === 'R' ) {

			if ( e.repeat || ! ride.started ) return;
			ride.restart();

		} else if ( e.key === 't' || e.key === 'T' ) {

			// スタート画面へ戻る（走行を始めたあとだけ。スタート画面では何もしない）
			if ( e.repeat || ! ride.started ) return;
			goHome();

		} else if ( e.key === 'm' || e.key === 'M' ) {

			if ( e.repeat ) return;
			sound?.toggle();

		}

	}

	function onKeyUp( e ) {

		if ( e.key === 'w' || e.key === 'W' ) releaseW();

	}

	window.addEventListener( 'keydown', onKeyDown );
	window.addEventListener( 'keyup', onKeyUp );
	// フォーカスを失うと keyup を受け取れないので、押下状態を戻す
	window.addEventListener( 'blur', releaseW );

	return {
		dispose() {

			window.removeEventListener( 'keydown', onKeyDown );
			window.removeEventListener( 'keyup', onKeyUp );
			window.removeEventListener( 'blur', releaseW );
			stopWatchingView?.();

		}
	};

}
