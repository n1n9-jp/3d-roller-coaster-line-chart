// 操作ボタン（#hud-controls）：一時停止／再生、俯瞰／一人称、最初から、情報。担当：操作ボタン。
//
// ボタンは index.html の [hud-controls] に書いてある（data-action で見分ける）。ここでは次の 3 つをする。
//   1. 押されたら ride / view / events を呼ぶ（click だけ。タッチもキーボード（Space・Enter）も同じ経路）。
//   2. ride・view の状態をイベント（pause・resume・restart・finish・viewchange、情報パネルの 'infopanel:change'）で受けて、
//      ラベル・aria-label・アイコン・disabled・aria-expanded を直す（キーボードのショートカットで操作したときも追従する）。
//   3. prefers-reduced-motion: reduce のとき、START 後に俯瞰にし、一人称の走行を穏やかにする（MOTION.reducedRide を ride へ渡す）。
//
// 状態からラベルを決める部分（describeButtons）と reduced-motion の係数を選ぶ部分（reducedRideMotion）は
// DOM に依存しない関数にしてある（tests/buttons.test.js）。

const ICONS = {
	pause: '<path d="M8 5v14"/><path d="M16 5v14"/>',
	play: '<path d="M7 4.5v15l12-7.5z"/>',
	// 俯瞰（目）
	eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
	// 一人称（人）
	person: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
	// 最初から（↺）
	restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
	info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 16.5v-5"/><path d="M12 7.6h.01"/>'
};

/**
 * 状態から、4 つのボタンの表示を決める（DOM に依存しない）。
 * @param {{ paused?: boolean, finished?: boolean, view?: 'ride'|'overview', infoOpen?: boolean }} state
 * @returns 各ボタンの { label, ariaLabel, icon, disabled }（情報は expanded も）
 */
export function describeButtons( { paused = false, finished = false, view = 'ride', infoOpen = false } = {} ) {

	return {
		'toggle-pause': paused
			? { label: '再生', ariaLabel: '再生（Space）', icon: 'play', disabled: finished }
			: { label: '一時停止', ariaLabel: '一時停止（Space）', icon: 'pause', disabled: finished },
		view: view === 'overview'
			? { label: '一人称', ariaLabel: '一人称に戻る（W）', icon: 'person', disabled: false }
			: { label: '俯瞰', ariaLabel: '俯瞰で見る（W）', icon: 'eye', disabled: false },
		restart: { label: '最初から', ariaLabel: '最初から乗り直す（R）', icon: 'restart', disabled: false },
		info: { label: '情報', ariaLabel: '情報パネルを開く（I）', icon: 'info', disabled: false, expanded: Boolean( infoOpen ) }
	};

}

/**
 * ride へ渡す走行の係数を選ぶ（DOM に依存しない）。
 * reduced-motion の一人称のときだけ MOTION.reducedRide、それ以外は null（従来の値）。
 * 俯瞰ではカメラが動かないので、穏やかにする必要はない。
 */
export function reducedRideMotion( { reduced, view }, reducedRide ) {

	return reduced && view === 'ride' && reducedRide ? reducedRide : null;

}

function setIcon( svg, name ) {

	if ( svg.dataset.icon === name ) return;
	svg.dataset.icon = name;
	svg.innerHTML = ICONS[ name ];

}

export function createButtons( ctx ) {

	const { ride, view, events } = ctx;
	const container = ctx.ui?.slots?.controls ?? document.getElementById( 'hud-controls' );

	const buttons = {};
	for ( const el of container?.querySelectorAll( '[data-action]' ) ?? [] ) {

		buttons[ el.dataset.action ] = {
			el,
			icon: el.querySelector( '.ctl-icon' ),
			label: el.querySelector( '.ctl-label' ),
			shown: null // 最後に反映した表示（変わったときだけ DOM を書く）
		};

	}

	let infoOpen = false;

	function render() {

		const next = describeButtons( { paused: ride.paused, finished: ride.finished, view: view.current, infoOpen } );

		for ( const [ action, button ] of Object.entries( buttons ) ) {

			const d = next[ action ];
			if ( ! d ) continue;
			const key = JSON.stringify( d );
			if ( button.shown === key ) continue;
			button.shown = key;

			if ( button.label ) button.label.textContent = d.label;
			if ( button.icon ) setIcon( button.icon, d.icon );
			button.el.setAttribute( 'aria-label', d.ariaLabel );
			button.el.disabled = d.disabled;
			if ( 'expanded' in d ) button.el.setAttribute( 'aria-expanded', String( d.expanded ) );

		}

	}

	// ---- 押されたとき ----
	const actions = {
		'toggle-pause': () => {

			if ( ride.started && ! ride.finished ) ride.togglePause();

		},
		view: () => view.toggleView(),
		restart: () => {

			if ( ride.started ) ride.restart();

		},
		info: () => events.emit( 'infopanel:toggle' )
	};

	const removers = [];

	function listen( target, type, handler ) {

		target.addEventListener( type, handler );
		removers.push( () => target.removeEventListener( type, handler ) );

	}

	for ( const [ action, button ] of Object.entries( buttons ) ) {

		listen( button.el, 'click', ( e ) => {

			actions[ action ]?.();
			// マウスやタッチで押したあとは、フォーカスを外す。残すと、そのあとの Space が
			// 「同じボタンをもう一度押す」になる（最初から・視点）。キーボードで押したとき（detail 0）は残す。
			if ( e.detail > 0 && ( action === 'view' || action === 'restart' ) ) button.el.blur();

		} );

	}

	// ---- ride・view・情報パネルの状態への追従 ----
	for ( const name of [ 'start', 'pause', 'resume', 'restart', 'finish', 'viewchange' ] ) removers.push( events.on( name, render ) );
	removers.push( events.on( 'infopanel:change', ( payload ) => {

		infoOpen = Boolean( payload?.open );
		render();

	} ) );

	// ---- prefers-reduced-motion ----
	const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
		? window.matchMedia( '(prefers-reduced-motion: reduce)' )
		: null;
	const reducedRide = ctx.config?.MOTION?.reducedRide;

	function applyMotion() {

		if ( typeof ride.setMotion !== 'function' ) return;
		ride.setMotion( reducedRideMotion( { reduced: Boolean( query?.matches ), view: view.current }, reducedRide ) );

	}

	// 初期表示を俯瞰にする（START 後。あとから設定が変わったときは、いまの視点のまま）
	removers.push( events.on( 'start', () => {

		if ( query?.matches ) view.setView( 'overview' );

	} ) );
	removers.push( events.on( 'viewchange', applyMotion ) );
	if ( query ) {

		if ( typeof query.addEventListener === 'function' ) listen( query, 'change', applyMotion );
		else if ( typeof query.addListener === 'function' ) {

			query.addListener( applyMotion );
			removers.push( () => query.removeListener( applyMotion ) );

		}

	}

	applyMotion();
	render();

	return {
		dispose() {

			for ( const remove of removers ) remove();
			removers.length = 0;

		}
	};

}
