// スタート画面：読み込み中・エラーのメッセージ、START ボタン、HUD の表示切り替え。
// main.js が最初に作る（データ読み込み前から使うので、ctx には依存しない）。担当：スタート画面。

export function createStartScreen() {

	const screen = document.getElementById( 'start-screen' );
	const button = document.getElementById( 'start-btn' );
	const message = document.getElementById( 'start-message' );
	const hud = document.getElementById( 'hud' );

	function setMessage( text, isError ) {

		message.textContent = text;
		message.hidden = ! text;
		message.classList.toggle( 'error', Boolean( isError ) );

	}

	return {
		showLoading() {

			button.disabled = true;
			setMessage( '読み込み中…', false );

		},
		/** 失敗を知らせる。START は押せないまま。 */
		showError( text ) {

			button.disabled = true;
			setMessage( text, true );

		},
		/** 準備完了。START を押せるようにして、押されたら onStart を呼ぶ。 */
		ready( onStart ) {

			setMessage( '', false );
			button.disabled = false;

			button.addEventListener( 'click', () => {

				screen.style.opacity = '0';
				screen.style.pointerEvents = 'none';
				setTimeout( () => {

					screen.style.display = 'none';

				}, 300 );

				hud.classList.add( 'visible' );
				onStart();

			}, { once: true } );

		}
	};

}
