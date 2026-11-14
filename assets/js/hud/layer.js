// HUD の canvas 共通処理。
// - 表示サイズは CSS（canvas の見た目の大きさ）で決まる。内部解像度は devicePixelRatio 倍（上限 2）。
//   サイズの変化は ResizeObserver、devicePixelRatio だけの変化（ブラウザの拡大縮小、別の画面への移動）は matchMedia で追う。
// - 変化しない部分（グリッド・軸・これからの線・年代ラベル）は offscreen の canvas に、大きさが変わったときだけ描く。
//   毎フレームは、それを転写して、走行済みの線と現在位置だけを重ねる。
// - 描画座標は常に CSS px の論理座標。

/** 内部解像度の上限（devicePixelRatio の上限）。 */
export const MAX_DPR = 2;

/**
 * @param canvas  対象の canvas（CSS でサイズを決めておく。canvas の width / height 属性には依存しない）
 * @param options
 *   drawStatic( c, width, height, dpr )   静的な部分を描く。サイズか dpr が変わるたびに呼ばれる
 *   drawDynamic( c, width, height, dpr )  毎フレームの部分を描く。render() のたびに呼ばれる
 */
export function createHudLayer( canvas, { drawStatic, drawDynamic } ) {

	const ctx = canvas.getContext( '2d' );
	const base = document.createElement( 'canvas' );
	let dpr = 1;
	let width = 0;
	let height = 0;
	let version = 0;
	let disposed = false;
	let stopDprWatch = null;

	/** 論理座標（CSS px）で描けるようにする。canvas の画素数が CSS の小数サイズと少しずれても、全体が収まるように拡縮する。 */
	function setLogicalTransform( c, target ) {

		c.setTransform( target.width / width, 0, 0, target.height / height, 0, 0 );

	}

	function resize() {

		if ( disposed ) return;
		const rect = canvas.getBoundingClientRect();
		const w = rect.width;
		const h = rect.height;
		if ( ! w || ! h ) return; // 非表示のあいだは何もしない

		const nextDpr = Math.min( MAX_DPR, window.devicePixelRatio || 1 );
		const pixelW = Math.max( 1, Math.round( w * nextDpr ) );
		const pixelH = Math.max( 1, Math.round( h * nextDpr ) );
		if ( w === width && h === height && nextDpr === dpr && canvas.width === pixelW && canvas.height === pixelH ) return;

		dpr = nextDpr;
		width = w;
		height = h;
		canvas.width = base.width = pixelW;
		canvas.height = base.height = pixelH;

		redrawStatic();

	}

	function redrawStatic() {

		if ( ! width ) return;
		const baseCtx = base.getContext( '2d' );
		baseCtx.setTransform( 1, 0, 0, 1, 0, 0 );
		baseCtx.clearRect( 0, 0, base.width, base.height );
		setLogicalTransform( baseCtx, base );
		drawStatic( baseCtx, width, height, dpr );
		version ++;
		render();

	}

	function render() {

		if ( ! width ) return;
		ctx.setTransform( 1, 0, 0, 1, 0, 0 );
		ctx.clearRect( 0, 0, canvas.width, canvas.height );
		ctx.drawImage( base, 0, 0 );
		setLogicalTransform( ctx, canvas );
		drawDynamic?.( ctx, width, height, dpr );

	}

	/** devicePixelRatio が変わったら resize する（変わるたびに、新しい値で監視し直す）。 */
	function watchDpr() {

		if ( typeof window.matchMedia !== 'function' ) return;
		const query = window.matchMedia( `(resolution: ${window.devicePixelRatio || 1}dppx)` );
		const onChange = () => {

			resize();
			watchDpr();

		};

		query.addEventListener( 'change', onChange, { once: true } );
		stopDprWatch = () => query.removeEventListener( 'change', onChange );

	}

	let observer = null;
	if ( typeof ResizeObserver !== 'undefined' ) {

		observer = new ResizeObserver( resize );
		observer.observe( canvas );

	} else {

		window.addEventListener( 'resize', resize );

	}

	watchDpr();
	resize();

	return {
		/**
		 * devicePixelRatio が変わっていたら描き直す。毎フレーム呼んでよい（値を読むだけで、変わっていなければ何もしない）。
		 * matchMedia の通知が届かない環境（エミュレーション、古いブラウザ）への保険。
		 */
		syncDpr() {

			if ( width && Math.min( MAX_DPR, window.devicePixelRatio || 1 ) !== dpr ) resize();

		},
		/** 静的な部分を転写し、drawDynamic で毎フレームの部分を重ねる。 */
		render,
		/** 静的な部分だけ描き直す（イベントの目盛りなど、サイズ以外の理由で変わったとき）。 */
		redrawStatic,
		resize,
		/** 静的な部分を描き直した回数。呼び出し側が「描き直しが要るか」の判定に使う。 */
		get version() {

			return version;

		},
		/** 現在の論理サイズ（CSS px）。まだ測れていないときは 0。 */
		get width() {

			return width;

		},
		get height() {

			return height;

		},
		get dpr() {

			return dpr;

		},
		dispose() {

			disposed = true;
			observer?.disconnect();
			window.removeEventListener( 'resize', resize );
			stopDprWatch?.();

		}
	};

}

/**
 * 1 論理 px の線をにじませない位置。v（論理座標）を、線の中心が装置ピクセルの中心か境界に乗る座標に丸める。
 * 1 論理 px が奇数の装置 px（dpr 1）なら画素の中心、偶数（dpr 2）なら画素の境界。
 */
export function crisp( v, dpr ) {

	const device = Math.round( dpr );
	const scaled = v * dpr;
	return ( device % 2 === 1 ? Math.floor( scaled ) + 0.5 : Math.round( scaled ) ) / dpr;

}

/** '#rrggbb' に不透明度を付けた rgba()。 */
export function withAlpha( hex, alpha ) {

	const n = parseInt( hex.slice( 1 ), 16 );
	return `rgba(${( n >> 16 ) & 255}, ${( n >> 8 ) & 255}, ${n & 255}, ${alpha})`;

}
