// キーボード入力。keydown / keyup / blur を 1 か所に集約する。
//   W     : 押している間は俯瞰
//   SPACE : 押している間は停止

/**
 * @param onChange 状態が変わるたびに { overview, paused } を渡して呼ばれる
 */
export function createControls( onChange ) {

	const state = { overview: false, paused: false };

	function set( key, value ) {

		if ( state[ key ] === value ) return;
		state[ key ] = value;
		onChange( state );

	}

	function targetOf( e ) {

		if ( e.key === 'w' || e.key === 'W' ) return 'overview';
		if ( e.code === 'Space' ) return 'paused';
		return null;

	}

	window.addEventListener( 'keydown', ( e ) => {

		const key = targetOf( e );
		if ( ! key ) return;
		if ( key === 'paused' ) e.preventDefault(); // ページのスクロールを防ぐ
		if ( ! e.repeat ) set( key, true );

	} );

	window.addEventListener( 'keyup', ( e ) => {

		const key = targetOf( e );
		if ( ! key ) return;
		if ( key === 'paused' ) e.preventDefault();
		set( key, false );

	} );

	// フォーカスを失うと keyup を受け取れないので、押下状態を戻す
	window.addEventListener( 'blur', () => {

		set( 'overview', false );
		set( 'paused', false );

	} );

	return { state };

}
