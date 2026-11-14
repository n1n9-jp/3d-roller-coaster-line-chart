// HUD の canvas 共通処理。
// 表示サイズは CSS で size x size px に固定し、内部解像度は devicePixelRatio 倍にする。
// 変化しない部分（背景・折れ線など）は offscreen canvas に 1 回だけ描き、
// 毎フレームはそれを転写してマーカーだけを重ねる。描画座標は常に size x size の論理座標。

export function createHudLayer( canvas, size, drawStatic ) {

	const ctx = canvas.getContext( '2d' );
	const base = document.createElement( 'canvas' );
	let dpr = 1;

	function resize() {

		dpr = window.devicePixelRatio || 1;
		const pixels = Math.round( size * dpr );

		canvas.width = base.width = pixels;
		canvas.height = base.height = pixels;

		const baseCtx = base.getContext( '2d' );
		baseCtx.setTransform( dpr, 0, 0, dpr, 0, 0 );
		drawStatic( baseCtx );

	}

	resize();
	window.addEventListener( 'resize', resize );

	return {
		/** 静的な部分を転写し、論理座標に合わせた context を返す。続けてマーカーを描く。 */
		begin() {

			ctx.setTransform( 1, 0, 0, 1, 0, 0 );
			ctx.clearRect( 0, 0, canvas.width, canvas.height );
			ctx.drawImage( base, 0, 0 );
			ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
			return ctx;

		},
		resize
	};

}
