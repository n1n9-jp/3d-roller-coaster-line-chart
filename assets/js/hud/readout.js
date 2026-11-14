// 現在値の帯：いまは現在位置のデータ点（生データ）の西暦だけを出す。
// 機能モジュール（createReadout( ctx )）。担当：現在値の帯。要素は #hud-readout（中に #year-display）。

export function createReadout( ctx ) {

	const element = document.getElementById( 'year-display' );
	let shown = '';

	function show( point ) {

		if ( ! point ) return; // 連絡区間：直前の表示のまま
		const year = point.date.substring( 0, 4 );
		if ( year !== shown ) {

			shown = year;
			element.textContent = year;

		}

	}

	return {
		update( state ) {

			show( state.point );

		},
		onReset() {

			shown = '';

		}
	};

}
