// 年表示：現在位置のデータ点（生データ）の西暦を出す。

export function createReadout( element, dataset ) {

	let shown = '';

	return {
		update( progress ) {

			const year = dataset.rawAt( progress ).date.substring( 0, 4 );
			if ( year !== shown ) {

				shown = year;
				element.textContent = year;

			}

		}
	};

}
