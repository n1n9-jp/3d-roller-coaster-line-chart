// イベントのキャプション（#hud-caption）。機能モジュール（createAnnotations( ctx )）。
//
// 選んだデータの出来事（data/events/<id>.json。DATASETS[ id ].eventsUrl）だけを出す。ファイルがなければ何も出さない。
// どの出来事をいつ出すかは events-data.js の createCaptionScheduler（DOM に触らない）が決め、
// ここは決まった動作を DOM に反映するだけ。時間は ride の時間（state.timeMs）。入れ替えのフェードだけは実時間（state.nowMs）。
// 見た目は annotations.css。

import { ANNOT, START_PROGRESS } from '../config.js';
import { ensureEvents, createCaptionScheduler, formatCaption, captionStepLimit } from '../events-data.js';

function element( tag, className ) {

	const node = document.createElement( tag );
	node.className = className;
	return node;

}

export function createAnnotations( ctx ) {

	const root = ctx.ui.slots.caption;
	const settings = ANNOT.caption;

	// prefers-reduced-motion: reduce のときは表示時間を延ばす（設定の変更にも追従する）
	const reducedQuery = typeof window !== 'undefined' && window.matchMedia
		? window.matchMedia( '(prefers-reduced-motion: reduce)' )
		: null;
	let reducedMotion = reducedQuery?.matches ?? false;
	const onReducedChange = ( e ) => {

		reducedMotion = e.matches;

	};

	reducedQuery?.addEventListener?.( 'change', onReducedChange );

	// 見出し・補足・値。role="status" aria-live="polite" は #hud-caption が持つ。表示していないあいだは空にする
	const card = element( 'div', 'caption-card' );
	const heading = element( 'p', 'caption-title' );
	const note = element( 'p', 'caption-note' );
	const value = element( 'p', 'caption-value tabular' );
	card.append( heading, note, value );

	let scheduler = null;
	let disposed = false;

	// 表示の状態：idle（空）／in（見えている）／out（フェードアウト中。終わったら pending を出すか、空にする）
	let phase = 'idle';
	let outStartedAt = 0;
	let pending = null;
	let lastNowMs = 0;

	function render( event ) {

		const text = formatCaption( event );
		heading.textContent = text.heading;
		note.textContent = text.note;
		value.textContent = text.value ?? '';
		value.hidden = text.value === null;
		card.classList.toggle( 'is-valueless', text.value === null );
		root.replaceChildren( card );
		card.classList.remove( 'is-leaving', 'is-visible' );
		void card.offsetWidth; // 初期状態を確定させてから is-visible を付け、入りの遷移を動かす
		card.classList.add( 'is-visible' );
		phase = 'in';
		pending = null;

	}

	function clear() {

		card.classList.remove( 'is-visible', 'is-leaving' );
		root.replaceChildren();
		phase = 'idle';
		pending = null;

	}

	function beginOut( next ) {

		card.classList.remove( 'is-visible' );
		card.classList.add( 'is-leaving' );
		phase = 'out';
		outStartedAt = lastNowMs;
		pending = next;

	}

	function apply( action ) {

		if ( action.type === 'show' ) {

			if ( phase === 'in' ) beginOut( action.event );
			else if ( phase === 'out' ) pending = action.event;
			else render( action.event );

		} else if ( action.type === 'hide' ) {

			if ( phase === 'in' ) beginOut( null );
			else if ( phase === 'out' ) pending = null;

		}

	}

	ensureEvents( ctx ).then( ( events ) => {

		if ( disposed || events.length === 0 ) return;
		scheduler = createCaptionScheduler( {
			events,
			showMs: () => ( reducedMotion ? settings.showMsReduced : settings.showMs ),
			minShowMs: settings.minShowMs,
			maxWaitMs: settings.maxWaitMs,
			maxStepProgress: captionStepLimit( ctx.curve?.years ),
			startProgress: START_PROGRESS
		} );

	} );

	return {
		update( state ) {

			lastNowMs = state.nowMs;

			if ( phase === 'out' && state.nowMs - outStartedAt >= settings.outMs ) {

				if ( pending ) render( pending );
				else clear();

			}

			if ( ! scheduler || ! state.started ) return;
			const action = scheduler.update( { timeMs: state.timeMs, progress: state.progress, finished: state.finished } );
			if ( action ) apply( action );

		},
		onReset() {

			scheduler?.reset();
			clear();

		},
		dispose() {

			disposed = true;
			reducedQuery?.removeEventListener?.( 'change', onReducedChange );
			clear();

		}
	};

}
