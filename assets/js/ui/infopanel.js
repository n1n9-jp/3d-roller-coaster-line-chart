// 情報パネル（#info-panel）：開閉、フォーカスの閉じ込め、走行の一時停止と復帰、データ出典の差し込み。
// 操作の表などの固定の文面は index.html の #info-panel の中にある。ここでは、データで変わる部分（しくみの説明、データの出典、
// 出来事の出典）を入れる。しくみの年代の境目の例は、そのデータの最初の境目（ctx.curve.decadeBoundaries()）から作る。
//
// 開く：スタート画面の「操作方法と出典」、キー I、'infopanel:open'（payload は { trigger?: Element }。trigger があれば、閉じたときそこへフォーカスを戻す）、
//       'infopanel:toggle'。
// 閉じる：閉じるボタン、Esc、パネルの外側（背面）のクリック、キー I、'infopanel:close'。
// 開閉は <html data-info-open> と 'infopanel:change'（payload は { open }）で知らせる。

import { mechanismParagraphs, dataSourceItems, eventsSourceItem } from './texts.js';

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
const TEXT_INPUT = 'input, select, textarea, [contenteditable=""], [contenteditable="true"]';
// 開いている間、背景として操作・フォーカスを止める要素（すでに inert だったものは触らない）
const BACKGROUND_IDS = [ 'start-screen', 'hud', 'end-screen' ];
const CLOSE_MS = 220; // 閉じる演出（200ms）のあと hidden にするまでの時間

export function createInfoPanel( ctx ) {

	const { ride, events, dataset, config, ui } = ctx;
	const panel = ui.infoPanel;
	const sheet = panel.querySelector( '.info-sheet' );
	const closeButton = panel.querySelector( '#info-close' );
	const body = panel.querySelector( '.info-body' );
	const root = document.documentElement;

	// ---- データで変わる部分 ----

	// スタート画面の文言（タイトル・期間・出典の一行）もここで入れる（start.js は ctx を受け取れないため）
	try {

		ui.startScreen?.setData?.( ctx );

	} catch ( error ) {

		console.error( 'スタート画面の文言の設定に失敗しました', error );

	}

	const def = dataset.def;

	// しくみ（データの名前、移動平均の週数、目盛りの刻み）
	const mechanism = panel.querySelector( '#info-mechanism' );
	mechanism.replaceChildren( ...mechanismParagraphs( def, config.MOVING_AVERAGE_WINDOW, ctx.curve?.decadeBoundaries?.() ?? [] ).map( ( text ) => {

		const paragraph = document.createElement( 'p' );
		paragraph.textContent = text;
		return paragraph;

	} ) );

	// データ出典：{ name?, parts: [ { text, href? } ] } を段落にする
	function paragraphOf( item ) {

		const paragraph = document.createElement( 'p' );
		if ( item.name ) {

			const strong = document.createElement( 'strong' );
			strong.className = 'info-source-name';
			strong.textContent = item.name;
			paragraph.append( strong );

		}

		for ( const part of item.parts ) {

			if ( ! part.href ) {

				paragraph.append( part.text );
				continue;

			}

			const anchor = document.createElement( 'a' );
			anchor.href = part.href;
			anchor.target = '_blank';
			anchor.rel = 'noopener';
			anchor.textContent = part.text;
			paragraph.append( anchor );

		}

		return paragraph;

	}

	const sources = panel.querySelector( '#info-sources' );
	sources.replaceChildren( ...dataSourceItems( def, dataset.meta ).map( paragraphOf ) );

	// 出来事の出典は、出来事の読み込みが終わってから（件数が 1 以上のときだけ）。
	// 出来事は別のモジュールがデータごとに用意して、'eventsready'（{ events, sources? }）で知らせる
	let eventsParagraph = null;
	const offEventsReady = events.on( 'eventsready', ( payload ) => {

		eventsParagraph?.remove();
		eventsParagraph = null;
		const item = eventsSourceItem( payload?.events, payload?.sources );
		if ( ! item ) return;
		eventsParagraph = paragraphOf( item );
		sources.append( eventsParagraph );

	} );

	// ---- 開閉 ----

	let isOpen = false;
	let pausedByPanel = false;
	let returnFocus = null;
	let hideTimer = 0;
	let inerted = [];

	function open( trigger ) {

		if ( isOpen ) return;
		isOpen = true;
		clearTimeout( hideTimer );

		const active = document.activeElement;
		returnFocus = trigger instanceof Element ? trigger : ( active && active !== document.body ? active : null );

		// 走行中なら止める。開く前から止まっていたときは、何もしない（閉じても止めたまま）
		pausedByPanel = ride.started && ! ride.finished && ! ride.paused;
		if ( pausedByPanel ) ride.pause();

		inerted = BACKGROUND_IDS
			.map( ( id ) => document.getElementById( id ) )
			.filter( ( element ) => element && ! element.inert );
		for ( const element of inerted ) element.inert = true;

		panel.hidden = false;
		void panel.offsetWidth; // hidden を外した直後の状態から transition を始める
		panel.classList.add( 'is-open' );
		root.setAttribute( 'data-info-open', '' );

		body.scrollTop = 0;
		closeButton.focus( { preventScroll: true } );
		events.emit( 'infopanel:change', { open: true } );

	}

	function close() {

		if ( ! isOpen ) return;
		isOpen = false;

		panel.classList.remove( 'is-open' );
		root.removeAttribute( 'data-info-open' );
		hideTimer = setTimeout( () => {

			panel.hidden = true;

		}, CLOSE_MS );

		for ( const element of inerted ) element.inert = false;
		inerted = [];

		if ( pausedByPanel && ride.paused ) ride.resume();
		pausedByPanel = false;

		if ( returnFocus && returnFocus.isConnected ) returnFocus.focus( { preventScroll: true } );
		returnFocus = null;

		events.emit( 'infopanel:change', { open: false } );

	}

	function toggle( trigger ) {

		if ( isOpen ) close();
		else open( trigger );

	}

	// ---- 入力 ----

	closeButton.addEventListener( 'click', close );

	// 背面のクリックで閉じる。シートの中で押して背面で離したとき（文字の選択など）は閉じない
	let pressedOnBackdrop = false;
	panel.addEventListener( 'pointerdown', ( event ) => {

		pressedOnBackdrop = event.target === panel;

	} );
	panel.addEventListener( 'click', ( event ) => {

		if ( event.target === panel && pressedOnBackdrop ) close();
		pressedOnBackdrop = false;

	} );

	const startInfoButton = document.getElementById( 'start-info-btn' );
	const onStartInfoClick = () => open( startInfoButton );
	startInfoButton?.addEventListener( 'click', onStartInfoClick );

	function trapTab( event ) {

		const focusables = [ ...sheet.querySelectorAll( FOCUSABLE ) ].filter( ( element ) => element.offsetParent !== null );
		if ( focusables.length === 0 ) {

			event.preventDefault();
			return;

		}

		const first = focusables[ 0 ];
		const last = focusables[ focusables.length - 1 ];
		const active = document.activeElement;

		if ( ! sheet.contains( active ) ) {

			event.preventDefault();
			first.focus();

		} else if ( event.shiftKey && active === first ) {

			event.preventDefault();
			last.focus();

		} else if ( ! event.shiftKey && active === last ) {

			event.preventDefault();
			first.focus();

		}

	}

	function onKeyDown( event ) {

		if ( event.ctrlKey || event.metaKey || event.altKey ) return;
		const isInfoKey = event.code === 'KeyI' || event.key === 'i' || event.key === 'I';

		if ( ! isOpen ) {

			const target = event.target instanceof Element ? event.target : null;
			if ( isInfoKey && ! event.repeat && ! ( target && target.closest( TEXT_INPUT ) ) ) open();
			return;

		}

		if ( event.key === 'Escape' ) {

			event.preventDefault();
			event.stopPropagation();
			close();

		} else if ( event.key === 'Tab' ) {

			trapTab( event );

		} else if ( isInfoKey ) {

			event.preventDefault();
			event.stopPropagation();
			if ( ! event.repeat ) close();

		} else if ( event.code === 'Space' || /^[wWrR]$/.test( event.key ) ) {

			// 走行の操作（controls.js）に渡さない。Space は既定の動作（ボタンの押下やスクロール）に任せる
			event.stopPropagation();

		}

	}

	// controls.js より先に受けるため、捕捉フェーズで登録する
	window.addEventListener( 'keydown', onKeyDown, true );

	const offs = [
		events.on( 'infopanel:open', ( payload ) => open( payload?.trigger ) ),
		events.on( 'infopanel:toggle', ( payload ) => toggle( payload?.trigger ) ),
		events.on( 'infopanel:close', close )
	];

	return {
		dispose() {

			close();
			clearTimeout( hideTimer );
			window.removeEventListener( 'keydown', onKeyDown, true );
			startInfoButton?.removeEventListener( 'click', onStartInfoClick );
			offEventsReady();
			for ( const off of offs ) off();

		}
	};

}
