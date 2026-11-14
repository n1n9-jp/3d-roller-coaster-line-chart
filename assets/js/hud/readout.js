// 現在値の帯（#hud-readout）。年月・ラベル・値・前週比と、サンプルデータのバッジ。
// 機能モジュール（createReadout( ctx )）。担当：現在値の帯。
// 表示用の文字列は DOM に依存しない関数（下の export）で作る。値は生データ（state.point、dataset.raw）。

const MINUS = '−'; // −（U+2212）。ハイフンより幅が数字に近い

/** 'YYYY-MM-DD' → { year, month, day }（数値）。Date を通さない（タイムゾーンの影響を受けない）。 */
export function parseDate( dateString ) {

	const [ year, month, day ] = String( dateString ).split( '-' ).map( Number );
	return { year, month, day };

}

/** デスクトップ用の年月：'1990年1月8日の週' */
export function formatWeekLabel( dateString ) {

	const { year, month, day } = parseDate( dateString );
	return `${year}年${month}月${day}日の週`;

}

/** モバイル用の年月：'1990年1月' */
export function formatMonthLabel( dateString ) {

	const { year, month } = parseDate( dateString );
	return `${year}年${month}月`;

}

/** 3桁区切りの整数（四捨五入）：38791.29 → '38,791' */
export function formatYen( value ) {

	const rounded = Math.round( value );
	const digits = String( Math.abs( rounded ) ).replace( /\B(?=(\d{3})+(?!\d))/g, ',' );
	return rounded < 0 ? MINUS + digits : digits;

}

/** ％の小数1桁（符号なし）：0.2 → '0.2' */
export function formatPercent( value ) {

	return Math.abs( value ).toFixed( 1 );

}

/**
 * 前週比。previous / current は終値。previous が無ければ（最初の週）direction は 'none'。
 * 差額は四捨五入して 0 円になるとき 'flat'。戻り値：
 *   { direction: 'up' | 'down' | 'flat' | 'none', amount: '1,234'（符号なし）, percent: '1.7'（符号なし, 小数1桁）,
 *     full: '前週比 ▲61円（+0.2%）', short: '▲0.2%' }
 */
export function formatChange( previous, current ) {

	if ( ! Number.isFinite( previous ) || ! Number.isFinite( current ) || previous === 0 ) {

		return { direction: 'none', amount: '', percent: '', full: '前週比 —', short: '—' };

	}

	const diff = current - previous;
	const amount = formatYen( Math.abs( diff ) );

	if ( Math.round( Math.abs( diff ) ) === 0 ) {

		return { direction: 'flat', amount: '0', percent: '0.0', full: '前週比 ±0円', short: '±0%' };

	}

	const percent = formatPercent( diff / previous * 100 );
	const up = diff > 0;
	const mark = up ? '▲' : '▼';
	const sign = up ? '+' : MINUS;

	return {
		direction: up ? 'up' : 'down',
		amount,
		percent,
		full: `前週比 ${mark}${amount}円（${sign}${percent}%）`,
		short: `${mark}${percent}%`
	};

}

/** 一周して止まる最後の週など、dataIndex（小数）から系列上の週の位置（整数）を決める。 */
export function weekIndex( dataIndex, length ) {

	return Math.min( Math.max( Math.floor( dataIndex ), 0 ), length - 1 );

}

const BADGE_FULL = 'サンプルデータ（実際の日経平均ではありません）';
const BADGE_SHORT = 'サンプルデータ';

export function createReadout( ctx ) {

	const root = ctx.ui.slots.readout;
	const raw = ctx.dataset.raw;

	const yearEl = document.getElementById( 'year-display' );
	const monthEl = document.getElementById( 'ro-month' );
	const dayEl = document.getElementById( 'ro-day' );
	const valueEl = document.getElementById( 'ro-value' );
	const changeEl = document.getElementById( 'ro-change' );
	const changeFullEl = document.getElementById( 'ro-change-full' );
	const changeShortEl = document.getElementById( 'ro-change-short' );

	// 書き換えは内容が変わったときだけ
	const shown = new Map();
	function setText( element, text ) {

		if ( shown.get( element ) === text ) return;
		shown.set( element, text );
		element.textContent = text;

	}

	let shownIndex = - 1;

	function show( index ) {

		if ( index === shownIndex ) return;
		shownIndex = index;

		const point = raw[ index ];
		const { year, month, day } = parseDate( point.date );
		const change = formatChange( index > 0 ? raw[ index - 1 ].close : NaN, point.close );

		setText( yearEl, String( year ) );
		setText( monthEl, `年${month}月` );
		setText( dayEl, `${day}日の週` );
		setText( valueEl, formatYen( point.close ) );
		setText( changeFullEl, change.full );
		setText( changeShortEl, change.short );
		if ( changeEl.dataset.direction !== change.direction ) changeEl.dataset.direction = change.direction;

	}

	// サンプルデータのバッジ（実データでは作らない）
	let badge = null;
	if ( ctx.dataset.meta?.kind === 'sample' ) {

		badge = document.createElement( 'span' );
		badge.className = 'ro-badge';
		badge.setAttribute( 'role', 'note' );
		badge.setAttribute( 'aria-label', BADGE_FULL );
		badge.innerHTML =
			'<svg class="ro-badge-icon" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">' +
			'<circle cx="6" cy="6" r="5.25" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
			'<path d="M6 3.2v3.2M6 8.2v.1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
		const full = document.createElement( 'span' );
		full.className = 'ro-badge-full';
		full.textContent = BADGE_FULL;
		const short = document.createElement( 'span' );
		short.className = 'ro-badge-short';
		short.textContent = BADGE_SHORT;
		badge.append( full, short );
		root.append( badge );

	}

	// 年が変わったときだけ読み上げる（帯そのものには aria-live を付けない）
	const offYear = ctx.events.on( 'yearchange', ( { year } ) => {

		ctx.ui.announce( `${year}年` );

	} );

	show( 0 );

	return {
		update( state ) {

			// 連絡区間（point が null）や終了時は、直前の表示のまま（終了時は最後の週）
			if ( ! state.point || state.dataIndex === null ) return;
			show( weekIndex( state.dataIndex, raw.length ) );

		},
		onReset() {

			shownIndex = - 1;
			show( 0 );

		},
		dispose() {

			offYear();
			badge?.remove();

		}
	};

}
