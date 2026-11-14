// キーボード入力。ride と view の API を呼ぶだけ。
//   SPACE : 一時停止と再生のトグル
//   W     : 押している間だけ俯瞰（離すと、押す前の視点に戻る）
//   R     : 最初から
// フォーカスがボタン・リンク・入力欄にあるときは SPACE を横取りしない（ボタンの操作を優先する）。
// 修飾キー（Ctrl / Cmd / Alt）つきは無視する（Ctrl+R のリロードなどを妨げない）。
// 画面上のボタンは ui/buttons.js。

const INTERACTIVE = 'button, a[href], input, select, textarea, summary, [role="button"], [contenteditable=""], [contenteditable="true"]';
const TEXT_INPUT = 'input, select, textarea, [contenteditable=""], [contenteditable="true"]';

export function createControls( { ride, view } ) {

	let viewBeforeW = null; // W を押しているあいだだけ入る

	function releaseW() {

		if ( viewBeforeW === null ) return;
		view.setView( viewBeforeW );
		viewBeforeW = null;

	}

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
			view.setView( 'overview' );

		} else if ( e.key === 'r' || e.key === 'R' ) {

			if ( e.repeat || ! ride.started ) return;
			ride.restart();

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

		}
	};

}
