// 終了画面（#end-screen）。'finish' で出し、'restart' で閉じる。担当：終了画面。
// 要約の計算は ../summary.js（DOM に依存しない）。ここは表示・フォーカス・キー操作だけ。
// 契約は specs/contract.md。createEndScreen( ctx ) は { update?, onViewChange?, onReset?, dispose? } を返す。

import { summarize, summaryTexts } from '../summary.js';

const CLOSE_MS = 200; // 閉じる動き（仕様 5）。css の閉じる遷移（--dur-fast、reduced-motion でも 150ms）以上にしておく

export function createEndScreen( ctx ) {

	const { events, ride, view, dataset } = ctx;
	const root = document.getElementById( 'end-screen' );
	const html = document.documentElement;
	const restartButton = root.querySelector( '#end-restart' );
	const overviewButton = root.querySelector( '#end-overview' );
	const infoPanel = document.getElementById( 'info-panel' );

	let open = false;
	let hideTimer = 0;
	let frame = 0;

	function render() {

		const summary = summarize( dataset.raw );
		if ( ! summary ) return false;
		const texts = summaryTexts( summary );

		root.querySelector( '#end-lead' ).textContent = texts.lead;
		root.querySelector( '#end-change' ).textContent = texts.change;
		root.querySelector( '#end-sample-note' ).hidden = dataset.meta?.kind !== 'sample';
		restartButton.setAttribute( 'aria-label', texts.restartLabel );

		for ( const [ key, stat ] of Object.entries( texts.stats ) ) {

			const cell = root.querySelector( `[data-stat="${key}"]` );
			cell.querySelector( 'dt' ).textContent = stat.label;
			cell.querySelector( '.end-stat__num' ).textContent = stat.value;
			cell.querySelector( '.end-stat__unit' ).textContent = stat.unit;
			cell.querySelector( '.end-stat__date' ).textContent = stat.date;

		}

		return true;

	}

	function show() {

		if ( open ) return;
		if ( ! render() ) return;

		open = true;
		clearTimeout( hideTimer );
		cancelAnimationFrame( frame );

		root.hidden = false;
		html.dataset.ended = '';
		restartButton.focus( { preventScroll: true } );

		// hidden を外した直後の状態を 1 回描いてから、動きを始める
		void root.offsetWidth;
		frame = requestAnimationFrame( () => root.classList.add( 'is-open' ) );

	}

	/** 閉じる。フォーカスは操作ボタン（あれば）へ、なければ body 側へ戻す。 */
	function close() {

		if ( ! open ) return;
		open = false;

		cancelAnimationFrame( frame );
		root.classList.remove( 'is-open' );
		delete html.dataset.ended;

		const hadFocus = root.contains( document.activeElement );
		if ( hadFocus ) document.activeElement.blur();
		const firstControl = document.querySelector( '#hud-controls button' );
		if ( hadFocus && firstControl ) firstControl.focus( { preventScroll: true } );

		clearTimeout( hideTimer );
		hideTimer = setTimeout( () => {

			if ( ! open ) root.hidden = true;

		}, CLOSE_MS );

	}

	function showOverview() {

		close();
		view.setView( 'overview' );

	}

	function onKeyDown( e ) {

		if ( ! open || e.defaultPrevented ) return;

		// 情報パネルが開いているときは、そちらの Esc と Tab に任せる
		if ( infoPanel && ! infoPanel.hidden ) return;

		if ( e.key === 'Escape' ) {

			e.preventDefault();
			showOverview();
			return;

		}

		if ( e.key === 'Tab' ) {

			// ダイアログの中（2 つのボタン）で回す。外にフォーカスがあるときは中へ入れる
			const items = [ restartButton, overviewButton ];
			const index = items.indexOf( document.activeElement );
			e.preventDefault();
			if ( index === - 1 ) items[ e.shiftKey ? items.length - 1 : 0 ].focus();
			else items[ ( index + ( e.shiftKey ? items.length - 1 : 1 ) ) % items.length ].focus();

		}

	}

	restartButton.addEventListener( 'click', () => ride.restart() );
	overviewButton.addEventListener( 'click', showOverview );
	document.addEventListener( 'keydown', onKeyDown );

	const offFinish = events.on( 'finish', show );
	const offRestart = events.on( 'restart', close );

	return {
		dispose() {

			offFinish?.();
			offRestart?.();
			document.removeEventListener( 'keydown', onKeyDown );
			clearTimeout( hideTimer );
			cancelAnimationFrame( frame );

		}
	};

}
