// 凡例（#hud-legend）。俯瞰中だけ表示する（表示の切り替えは readout.css の html[data-view="overview"]）。
// 項目：走行済み／これから／現在地／出来事。「出来事」は、そのデータに出来事の注釈があるときだけ。
// 出来事は読み込みが終わると 'eventsready'（payload { events }）で届く（events-data.js）。件数が 1 以上になったら項目を足す。
// 「回送」の項目は作らない（螺旋の走行に連絡区間はない）。

const BASE_ITEMS = [
	{ shape: 'ridden', label: '走行済み' },
	{ shape: 'ahead', label: 'これから' },
	{ shape: 'marker', label: '現在地' }
];

const EVENT_ITEM = { shape: 'event', label: '出来事' };

/** 凡例の項目。出来事が 1 件以上あるときだけ「出来事」を足す（DOM に依存しない）。 */
export function legendItems( eventCount ) {

	return eventCount > 0 ? [ ...BASE_ITEMS, EVENT_ITEM ] : [ ...BASE_ITEMS ];

}

export function createLegend( ctx ) {

	const root = ctx.ui.slots.legend;

	const list = document.createElement( 'ul' );
	list.className = 'legend-list';
	let shownCount = - 1;

	function render( eventCount ) {

		const items = legendItems( eventCount );
		if ( items.length === shownCount ) return;
		shownCount = items.length;
		list.replaceChildren();

		for ( const { shape, label } of items ) {

			const item = document.createElement( 'li' );
			item.className = 'legend-item';
			const swatch = document.createElement( 'span' );
			swatch.className = `legend-swatch legend-swatch--${shape}`;
			swatch.setAttribute( 'aria-hidden', 'true' );
			const text = document.createElement( 'span' );
			text.textContent = label;
			item.append( swatch, text );
			list.append( item );

		}

	}

	render( 0 );
	root.append( list );

	const offEvents = ctx.events.on( 'eventsready', ( payload ) => {

		render( Array.isArray( payload?.events ) ? payload.events.length : 0 );

	} );

	return {
		dispose() {

			offEvents?.();
			list.remove();

		}
	};

}
