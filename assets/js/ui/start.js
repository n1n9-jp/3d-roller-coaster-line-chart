// スタート画面：読み込み中・エラーの表示、データが決まってからの文言、START ボタンとフェード。
// main.js が最初に作る（データ読み込み前から使うので、生成時は ctx に依存しない）。
// 状態は #start-screen の data-state に持つ：loading → ready → leaving → （非表示）／ error。
// 起動前にモジュールの読み込みで失敗したときは、このファイルが動かないので、index.html の <head> のフォールバックが
// 同じ data-state="error" を作る。

import { DATASETS } from '../config.js';
import { datasetIdFromSearch } from '../data.js';
import {
	periodOf, titleParts, documentTitle, kickerText, descriptionParts, chipTexts, creditLine, metaDescription, canvasLabel,
	loadingText, dataSwitchItems, CREDIT_SEPARATOR, ERROR_TEXTS
} from './texts.js';

const START_LABEL = '乗車する';
const START_ARIA_LABEL = '乗車する（ジェットコースターを開始）';
// データを切り替えて開き直したあと、切り替えの選んでいる項目へフォーカスを戻すための印（sessionStorage。使えなくてもよい）
const FOCUS_MARK = 'coaster:data-switch-focus';
const CHECK_PATH = 'M2.5 7.5l3 3 6-7';

function markFocus() {

	try {

		sessionStorage.setItem( FOCUS_MARK, '1' );

	} catch {

		// sessionStorage が使えないときは、フォーカスを戻さないだけ
	}

}

/** 印があれば消して true を返す。 */
function takeFocusMark() {

	try {

		if ( sessionStorage.getItem( FOCUS_MARK ) !== '1' ) return false;
		sessionStorage.removeItem( FOCUS_MARK );
		return true;

	} catch {

		return false;

	}

}

export function createStartScreen() {

	const $ = ( id ) => document.getElementById( id );
	const screen = $( 'start-screen' );
	const button = $( 'start-btn' );
	const buttonLabel = button.querySelector( '.start-btn-label' );
	const message = $( 'start-message' );
	const hud = $( 'hud' );

	// ---- データの切り替え（リンクの組。選ぶとその URL で開き直す） ----

	const search = window.location.search;
	const currentId = datasetIdFromSearch( search );
	const switchList = document.querySelector( '#start-data .start-data-list' );
	let pendingFocus = takeFocusMark();

	function renderSwitch( { includeLocal = false } = {} ) {

		// 日経平均のデータが無くて（読み込めなくて）いるときは、どれも選んでいない状態にする
		const selected = DATASETS[ currentId ].localOnly && ! includeLocal ? null : currentId;
		switchList.replaceChildren( ...dataSwitchItems( search, { currentId: selected, includeLocal } ).map( ( item ) => {

			const li = document.createElement( 'li' );
			const a = document.createElement( 'a' );
			a.href = item.href;
			a.dataset.datasetId = item.id;
			if ( item.current ) a.setAttribute( 'aria-current', 'page' );

			const svg = document.createElementNS( 'http://www.w3.org/2000/svg', 'svg' );
			svg.setAttribute( 'viewBox', '0 0 14 14' );
			svg.setAttribute( 'width', '14' );
			svg.setAttribute( 'height', '14' );
			svg.setAttribute( 'aria-hidden', 'true' );
			svg.setAttribute( 'focusable', 'false' );
			const path = document.createElementNS( 'http://www.w3.org/2000/svg', 'path' );
			path.setAttribute( 'd', CHECK_PATH );
			svg.append( path );

			a.append( svg, item.label );
			li.append( a );
			return li;

		} ) );
		restoreFocus();

	}

	function restoreFocus() {

		if ( ! pendingFocus ) return;
		const target = switchList.querySelector( '[aria-current="page"]' );
		if ( ! target ) return;
		pendingFocus = false;
		target.focus( { preventScroll: true } );

	}

	// 選んでいる項目は何もしない。ほかの項目は、その URL を開く（修飾キーつきのクリックはブラウザに任せる）
	$( 'start-data' ).addEventListener( 'click', ( event ) => {

		const link = event.target instanceof Element ? event.target.closest( 'a[href]' ) : null;
		if ( ! link ) return;
		if ( event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ) return;
		event.preventDefault();
		if ( link.getAttribute( 'aria-current' ) === 'page' ) return;
		markFocus();
		window.location.assign( link.href );

	} );

	// 読み込みの前から、URL で決まる文言（タイトル・切り替え）を出す
	{

		const [ line1, line2 ] = titleParts( DATASETS[ currentId ] );
		const spans = document.querySelectorAll( '#start-title span' );
		spans[ 0 ].textContent = line1;
		spans[ 1 ].textContent = line2;
		document.title = documentTitle( DATASETS[ currentId ] );
		renderSwitch();

	}

	function setState( state ) {

		screen.dataset.state = state;

	}

	function setButton( { label, busy, disabled } ) {

		buttonLabel.textContent = label;
		button.disabled = disabled;
		button.setAttribute( 'aria-disabled', String( disabled ) );
		button.setAttribute( 'aria-busy', String( busy ) );
		if ( busy ) button.removeAttribute( 'aria-label' );
		else button.setAttribute( 'aria-label', START_ARIA_LABEL );

	}

	return {
		showLoading() {

			setState( 'loading' );
			setButton( { label: '読み込み中…', busy: true, disabled: true } );
			message.textContent = loadingText( DATASETS[ currentId ] );
			message.hidden = false;

		},

		/**
		 * 失敗を知らせる。START は押せないまま。
		 * kind：'data'（データ取得の失敗）、'local'（?data=nikkei で手元のデータなし）、'webgl'、'boot'（起動途中の例外）、'file'。
		 */
		showError( kind ) {

			const text = ERROR_TEXTS[ kind ] ?? ERROR_TEXTS.boot;
			setState( 'error' );
			setButton( { label: START_LABEL, busy: false, disabled: true } );
			message.hidden = true;
			$( 'start-error-title' ).textContent = text.title;
			$( 'start-error-body' ).textContent = text.body;
			$( 'start-reload' ).hidden = ! text.reload;
			$( 'start-error' ).hidden = false;

		},

		/**
		 * データが決まったあとの文言を入れる（タイトル・キッカー・説明・チップ・出典の一行・meta description・document.title・
		 * 3D の canvas の aria-label）。日経平均は、読み込めたので、切り替えにも足す。
		 * createInfoPanel( ctx ) が呼ぶ（このモジュールは ctx を受け取れないため）。
		 */
		setData( ctx ) {

			const { dataset, renderer } = ctx;
			const def = dataset.def ?? DATASETS[ dataset.id ];
			const period = periodOf( dataset.raw );

			const [ line1, line2 ] = titleParts( def );
			const spans = document.querySelectorAll( '#start-title span' );
			spans[ 0 ].textContent = line1;
			spans[ 1 ].textContent = line2;
			document.title = documentTitle( def );
			if ( def.localOnly ) renderSwitch( { includeLocal: true } );

			$( 'start-kicker' ).textContent = kickerText( period );
			// 日付の途中で折り返さないよう、終了年月は nowrap の span にする
			$( 'start-desc' ).replaceChildren( ...descriptionParts( def, period ).map( ( part ) => {

				if ( ! part.nowrap ) return part.text;
				const span = document.createElement( 'span' );
				span.className = 'nowrap';
				span.textContent = part.text;
				return span;

			} ) );
			const [ chipA, chipB ] = chipTexts( def );
			$( 'start-chip-a' ).textContent = chipA;
			$( 'start-chip-b' ).textContent = chipB;
			// 「データ」と「描画」を、折り返すときもそれぞれまとまりにする
			$( 'start-credits' ).replaceChildren( ...creditLine( def, dataset.meta ).split( CREDIT_SEPARATOR ).map( ( text, i ) => {

				const span = document.createElement( 'span' );
				span.textContent = text;
				return i === 0 ? [ span ] : [ CREDIT_SEPARATOR, span ];

			} ).flat() );

			document.querySelector( 'meta[name="description"]' )?.setAttribute( 'content', metaDescription( def, period ) );

			renderer.domElement.setAttribute( 'role', 'img' );
			renderer.domElement.setAttribute( 'aria-label', canvasLabel( def ) );

		},

		/** 準備完了。START を押せるようにして、押されたら（クリック・Enter・Space）onStart を呼ぶ。 */
		ready( onStart ) {

			if ( screen.dataset.state === 'error' ) return;

			setState( 'ready' );
			setButton( { label: START_LABEL, busy: false, disabled: false } );
			message.hidden = true;
			$( 'start-info-btn' ).disabled = false;

			let started = false;

			button.addEventListener( 'click', () => {

				if ( started || button.disabled ) return;
				started = true;

				// 押した瞬間に操作を受け付けなくする（フォーカスも外れる）
				screen.inert = true;
				setState( 'leaving' );

				const finish = () => {

					screen.removeEventListener( 'transitionend', onEnd );
					clearTimeout( fallback );
					screen.hidden = true;

				};

				const onEnd = ( event ) => {

					if ( event.target === screen && event.propertyName === 'opacity' ) finish();

				};

				screen.addEventListener( 'transitionend', onEnd );
				// transitionend が来ない場合（タブが隠れている、transition が無効など）の保険
				const fallback = setTimeout( finish, 1000 );

				hud.classList.add( 'visible' );
				onStart();

			} );

		}
	};

}
