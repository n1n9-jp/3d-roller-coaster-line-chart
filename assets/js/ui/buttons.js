// 操作ボタン（#hud-controls）：一時停止／再生、俯瞰／一人称、最初から、トップ（スタート画面へ戻る）、音、情報。
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
	// トップ（家）
	home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-6h4v6"/>',
	// 音（スピーカー。オフは斜線つき）
	soundOn: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/>',
	soundOff: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M16 9.5l5 5"/><path d="M21 9.5l-5 5"/>',
	info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 16.5v-5"/><path d="M12 7.6h.01"/>'
};

/**
 * 状態から、6 つのボタンの表示を決める（DOM に依存しない）。
 * @param {{ paused?: boolean, finished?: boolean, view?: 'ride'|'overview', infoOpen?: boolean, soundOn?: boolean }} state
 * @returns 各ボタンの { label, ariaLabel, icon, disabled }（情報は expanded も）
 */
export function describeButtons( { paused = false, finished = false, view = 'ride', infoOpen = false, soundOn = true } = {} ) {

	return {
		'toggle-pause': paused
			? { label: '再生', ariaLabel: '再生（Space）', icon: 'play', disabled: finished }
			: { label: '一時停止', ariaLabel: '一時停止（Space）', icon: 'pause', disabled: finished },
		view: view === 'overview'
			? { label: '一人称', ariaLabel: '一人称に戻る（W）', icon: 'person', disabled: false }
			: { label: '俯瞰', ariaLabel: '俯瞰で見る（W）', icon: 'eye', disabled: false },
		restart: { label: '最初から', ariaLabel: '最初から乗り直す（R）', icon: 'restart', disabled: false },
		home: { label: 'トップ', ariaLabel: 'スタート画面に戻る（T）', icon: 'home', disabled: false },
		sound: soundOn
			? { label: '音', ariaLabel: '音を消す（M）', icon: 'soundOn', disabled: false, pressed: true }
			: { label: '音', ariaLabel: '音を出す（M）', icon: 'soundOff', disabled: false, pressed: false },
		info: { label: '情報', ariaLabel: '情報パネルを開く（I）', icon: 'info', disabled: false, expanded: Boolean( infoOpen ) }
	};

}

/**
 * ride へ渡す走行の係数を選ぶ（DOM に依存しない）。
 * reduced-motion の一人称のときだけ MOTION.reducedRide、それ以外は null（ride の既定の値）。
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

/** スタート画面へ戻る：ページを開き直す。 */
export function goHome() {

	window.location.reload();

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

		const next = describeButtons( { paused: ride.paused, finished: ride.finished, view: view.current, infoOpen, soundOn: ctx.sound?.enabled ?? true } );

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
			if ( 'pressed' in d ) button.el.setAttribute( 'aria-pressed', String( d.pressed ) );
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
		// スタート画面へ戻る。ページを開き直す（URL の ?data= は残るので、選んでいたデータのスタート画面になる）
		home: () => ( ctx.ui?.goHome ?? goHome )(),
		sound: () => ctx.sound?.toggle(),
		// trigger を渡す：クリックでボタンにフォーカスが移らないブラウザ（Safari、macOS の Firefox）でも、閉じたあとここへ戻せる
		info: () => events.emit( 'infopanel:toggle', { trigger: buttons.info?.el } )
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
			// 「同じボタンをもう一度押す」になる（最初から・視点・音）。キーボードで押したとき（detail 0）は残す。
			if ( e.detail > 0 && ( action === 'view' || action === 'restart' || action === 'sound' ) ) button.el.blur();

		} );

	}

	// ---- ride・view・情報パネルの状態への追従 ----
	for ( const name of [ 'start', 'pause', 'resume', 'restart', 'finish', 'viewchange' ] ) removers.push( events.on( name, render ) );
	removers.push( events.on( 'soundchange', render ) );
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
