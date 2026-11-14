// スタート画面：読み込み中・エラーの表示、データが決まってからの文言、START ボタンとフェード。担当：スタート画面。
// main.js が最初に作る（データ読み込み前から使うので、生成時は ctx に依存しない）。
// 状態は #start-screen の data-state に持つ：loading → ready → leaving → （非表示）／ error。
// 起動前にモジュールの読み込みで失敗したときは、このファイルが動かないので、index.html の <head> のフォールバックが
// 同じ data-state="error" を作る。

import {
	periodOf, kickerText, descriptionParts, chipTexts, creditLine, metaDescription, CREDIT_SEPARATOR,
	SAMPLE_NOTE, CANVAS_LABEL, ERROR_TEXTS
} from './texts.js';

const START_LABEL = '乗車する';
const START_ARIA_LABEL = '乗車する（ジェットコースターを開始）';

export function createStartScreen() {

	const $ = ( id ) => document.getElementById( id );
	const screen = $( 'start-screen' );
	const button = $( 'start-btn' );
	const buttonLabel = button.querySelector( '.start-btn-label' );
	const message = $( 'start-message' );
	const hud = $( 'hud' );

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
			message.hidden = false;

		},

		/**
		 * 失敗を知らせる。START は押せないまま。
		 * kind：'data'（データ取得の失敗）、'local'（?data=local で実データなし）、'webgl'、'boot'（起動途中の例外）、'file'。
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
		 * データが決まったあとの文言を入れる（キッカー・説明・チップ・出典の一行・サンプルの注記・meta description・
		 * 3D の canvas の aria-label）。createInfoPanel( ctx ) が呼ぶ（このモジュールは ctx を受け取れないため）。
		 */
		setData( ctx ) {

			const { dataset, renderer } = ctx;
			const period = periodOf( dataset.raw );
			const kind = dataset.meta?.kind;

			$( 'start-kicker' ).textContent = kickerText( period );
			// 日付の途中で折り返さないよう、終了年月は nowrap の span にする
			$( 'start-desc' ).replaceChildren( ...descriptionParts( period ).map( ( part ) => {

				if ( ! part.nowrap ) return part.text;
				const span = document.createElement( 'span' );
				span.className = 'nowrap';
				span.textContent = part.text;
				return span;

			} ) );
			$( 'start-chip-loop' ).textContent = chipTexts( period )[ 1 ];
			// 「データ」と「描画」を、折り返すときもそれぞれまとまりにする
			$( 'start-credits' ).replaceChildren( ...creditLine( dataset.meta ).split( CREDIT_SEPARATOR ).map( ( text, i ) => {

				const span = document.createElement( 'span' );
				span.textContent = text;
				return i === 0 ? [ span ] : [ CREDIT_SEPARATOR, span ];

			} ).flat() );

			const note = $( 'start-sample' );
			note.hidden = kind !== 'sample';
			note.querySelector( 'span' ).textContent = SAMPLE_NOTE;

			document.querySelector( 'meta[name="description"]' )?.setAttribute( 'content', metaDescription( kind ) );

			renderer.domElement.setAttribute( 'role', 'img' );
			renderer.domElement.setAttribute( 'aria-label', CANVAS_LABEL );

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
