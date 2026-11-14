// 現在値の帯（#hud-readout）。年月・ラベル・値・前週比。
// 機能モジュール（createReadout( ctx )）。担当：現在値の帯。
// 値・単位・前週比の文字列は dataset.format（format.js）で作る。値は生データ（state.point、dataset.raw）。

import { parseDate } from '../format.js';

/** 最後の週で止まったときなど、dataIndex（小数）から系列上の週の位置（整数）を決める。 */
export function weekIndex( dataIndex, length ) {

	return Math.min( Math.max( Math.floor( dataIndex ), 0 ), length - 1 );

}

export function createReadout( ctx ) {

	const raw = ctx.dataset.raw;
	const format = ctx.dataset.format;

	const yearEl = document.getElementById( 'year-display' );
	const monthEl = document.getElementById( 'ro-month' );
	const dayEl = document.getElementById( 'ro-day' );
	const valueEl = document.getElementById( 'ro-value' );
	const unitEl = document.getElementById( 'ro-unit' );
	const labelEl = document.getElementById( 'ro-label' );
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
		const change = format.change( point.close, index > 0 ? raw[ index - 1 ].close : NaN );

		setText( yearEl, String( year ) );
		setText( monthEl, `年${month}月` );
		setText( dayEl, `${day}日の週` );
		setText( valueEl, format.number( point.close ) );
		setText( changeFullEl, change.text );
		setText( changeShortEl, change.compactText );
		if ( changeEl.dataset.direction !== change.direction ) changeEl.dataset.direction = change.direction;

	}

	// 単位とラベルは、選んだデータのもの（HTML の初期値はドル円）
	unitEl.textContent = format.unit;
	labelEl.textContent = ctx.dataset.def.readoutLabel;

	// 年が変わったときだけ読み上げる（帯そのものには aria-live を付けない）
	const offYear = ctx.events.on( 'yearchange', ( { year } ) => {

		ctx.ui.announce( `${year}年` );

	} );

	show( 0 );

	return {
		update( state ) {

			// 終了時は、直前の表示のまま（終了時は最後の週）
			if ( ! state.point || state.dataIndex === null ) return;
			show( weekIndex( state.dataIndex, raw.length ) );

		},
		onReset() {

			shownIndex = - 1;
			show( 0 );

		},
		dispose() {

			offYear();

		}
	};

}
