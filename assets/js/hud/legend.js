// 凡例（#hud-legend）。俯瞰中だけ表示する（表示の切り替えは readout.css の html[data-view="overview"]）。
// 項目：走行済み／これから／現在地／出来事。「出来事」は実データのときだけ（イベントの注釈は実データのときだけ出るため）。
// 「回送」の項目は作らない（走行は連絡区間を通らない）。

export function createLegend( ctx ) {

	const root = ctx.ui.slots.legend;

	const items = [
		{ shape: 'ridden', label: '走行済み' },
		{ shape: 'ahead', label: 'これから' },
		{ shape: 'marker', label: '現在地' }
	];
	if ( ctx.dataset.meta?.kind === 'real' ) items.push( { shape: 'event', label: '出来事' } );

	const list = document.createElement( 'ul' );
	list.className = 'legend-list';

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

	root.append( list );

	return {
		dispose() {

			list.remove();

		}
	};

}
