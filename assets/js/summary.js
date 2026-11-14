// 終了画面の要約（DOM に依存しない純粋な関数）。
// 入力は生データ（dataset.raw）：{ date: 'YYYY-MM-DD', close: number } の配列（古い順）。
// 表示値は生データの終値を四捨五入した整数。レール用の移動平均後の値は使わない。

/** 整数をカンマ区切りにする（Intl に頼らない）。 */
export function formatNumber( n ) {

	return String( Math.round( n ) ).replace( /\B(?=(\d{3})+(?!\d))/g, ',' );

}

/** 終値 → 「41,702円」。 */
export function formatYen( close ) {

	return `${formatNumber( close )}円`;

}

/** 'YYYY-MM-DD' → { year, month, day }（数値）。Date を通さないので時差の影響を受けない。 */
export function parseDate( date ) {

	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec( date );
	if ( ! m ) throw new Error( `日付の形式が正しくありません：${date}` );
	return { year: Number( m[ 1 ] ), month: Number( m[ 2 ] ), day: Number( m[ 3 ] ) };

}

/** 'YYYY-MM-DD' → 「2024年7月1日の週」。 */
export function formatWeek( date ) {

	const { year, month, day } = parseDate( date );
	return `${year}年${month}月${day}日の週`;

}

/** 'YYYY-MM-DD' → 「2024年7月」。 */
export function formatYearMonth( date ) {

	const { year, month } = parseDate( date );
	return `${year}年${month}月`;

}

/**
 * 最初の週と最後の週の終値の変化。
 * 戻り値：{ direction: 'up' | 'down' | 'flat', percent: '12.3'（絶対値、小数 1 桁の文字列）, text: '▲12.3%' }。
 * 小数 1 桁に丸めて 0.0 になるときは 'flat'（text は '±0.0%'）。
 */
export function describeChange( firstClose, lastClose ) {

	const raw = ( lastClose - firstClose ) / firstClose * 100;
	const percent = Math.abs( raw ).toFixed( 1 );

	if ( percent === '0.0' ) return { direction: 'flat', percent, text: '±0.0%' };
	if ( raw > 0 ) return { direction: 'up', percent, text: `▲${percent}%` };
	return { direction: 'down', percent, text: `▼${percent}%` };

}

/**
 * 系列の要約。最高値と最安値は、同じ値が複数あるときは最初の週を採る。
 * 系列が空なら null。
 */
export function summarize( raw ) {

	if ( ! Array.isArray( raw ) || raw.length === 0 ) return null;

	let max = raw[ 0 ];
	let min = raw[ 0 ];
	for ( const point of raw ) {

		if ( point.close > max.close ) max = point;
		if ( point.close < min.close ) min = point;

	}

	const first = raw[ 0 ];
	const last = raw[ raw.length - 1 ];

	return {
		weeks: raw.length,
		first,
		last,
		max,
		min,
		startLabel: formatYearMonth( first.date ),
		endLabel: formatYearMonth( last.date ),
		change: describeChange( first.close, last.close )
	};

}

/** 要約から、終了画面に出す文言をまとめる（文言は仕様 6「終了画面」）。 */
export function summaryTexts( summary ) {

	const stat = ( label, point ) => ( { label, value: formatNumber( point.close ), unit: '円', date: formatWeek( point.date ) } );

	return {
		lead: `${summary.startLabel}から${summary.endLabel}まで、${summary.weeks}週分の日経平均株価を走りました。`,
		stats: {
			first: stat( '最初の週', summary.first ),
			last: stat( '最後の週', summary.last ),
			max: stat( '最高値', summary.max ),
			min: stat( '最安値', summary.min )
		},
		change: `最初の週と比べて ${summary.change.text}`,
		restartLabel: `${summary.startLabel}からもう一度乗る`
	};

}
