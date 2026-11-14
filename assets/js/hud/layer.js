// HUD の canvas 共通処理。
// 表示サイズは CSS（canvas の clientWidth x clientHeight）で決まり、内部解像度は devicePixelRatio 倍（上限 2）にする。
// 変化しない部分（背景・折れ線など）は offscreen canvas に 1 回だけ描き、
// 毎フレームはそれを転写してマーカーだけを重ねる。描画座標は常に CSS px の論理座標。
// CSS サイズが変わったとき（リサイズ、ブレークポイントの切り替え）は ResizeObserver で追従して静的部分を描き直す。

/**
 * @param canvas      対象の canvas（CSS でサイズを決めておく）
 * @param drawStatic  ( ctx, width, height ) => void。静的な部分を描く。サイズが変わるたびに呼ばれる
 */
export function createHudLayer( canvas, drawStatic ) {

	const ctx = canvas.getContext( '2d' );
	const base = document.createElement( 'canvas' );
	let dpr = 1;
	let width = 0;
	let height = 0;

	function resize() {

		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		if ( ! w || ! h ) return; // 非表示のあいだは何もしない

		dpr = Math.min( 2, window.devicePixelRatio || 1 );
		width = w;
		height = h;
		canvas.width = base.width = Math.round( w * dpr );
		canvas.height = base.height = Math.round( h * dpr );

		const baseCtx = base.getContext( '2d' );
		baseCtx.setTransform( dpr, 0, 0, dpr, 0, 0 );
		drawStatic( baseCtx, w, h );

	}

	resize();
	if ( typeof ResizeObserver !== 'undefined' ) new ResizeObserver( resize ).observe( canvas );
	else window.addEventListener( 'resize', resize );

	return {
		/** 静的な部分を転写し、論理座標に合わせた context を返す。続けてマーカーを描く。 */
		begin() {

			ctx.setTransform( 1, 0, 0, 1, 0, 0 );
			ctx.clearRect( 0, 0, canvas.width, canvas.height );
			if ( base.width && base.height ) ctx.drawImage( base, 0, 0 );
			ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
			return ctx;

		},
		/** 現在の論理サイズ（CSS px）。まだ測れていないときは 0。 */
		get width() {

			return width;

		},
		get height() {

			return height;

		},
		resize
	};

}
