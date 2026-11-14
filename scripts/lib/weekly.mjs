// 日次の値を、月曜始まりの週ごとの値にまとめる共通関数。
// fetch-nikkei.mjs・fetch-usdjpy.mjs・fetch-jgb10.mjs が使う。

const DAY_MS = 86400000;

/** 'YYYY-MM-DD' → UTC のエポック日数。 */
export function toDays( date ) {

	return Math.floor( Date.parse( `${date}T00:00:00Z` ) / DAY_MS );

}

export function fromDays( days ) {

	return new Date( days * DAY_MS ).toISOString().slice( 0, 10 );

}

/** その日を含む週（月曜始まり）の月曜日の日付。 */
export function mondayOf( date ) {

	const days = toDays( date );
	// 1970-01-01 は木曜日。月曜 = 0 とした曜日は (days + 3) % 7
	const weekday = ( ( days + 3 ) % 7 + 7 ) % 7;
	return fromDays( days - weekday );

}

/**
 * 日次の値 [{ date, close }] を、月曜始まりの週ごとに「その週の最終営業日の値」へまとめる。
 * date は週の月曜日。営業日のない週の行は作らない。close は小数 decimals 桁（既定 2）に丸める。
 * 入力の順序は問わない（日付の昇順に並べてから、週の中で最後の値をとる）。
 */
export function aggregateWeekly( daily, decimals = 2 ) {

	const sorted = [ ...daily ].sort( ( a, b ) => ( a.date < b.date ? - 1 : a.date > b.date ? 1 : 0 ) );
	const weeks = new Map();
	for ( const { date, close } of sorted ) {

		weeks.set( mondayOf( date ), close ); // 日付順なので、最後に入った値がその週の最終営業日

	}

	const scale = 10 ** decimals;
	return [ ...weeks ]
		.sort( ( a, b ) => ( a[ 0 ] < b[ 0 ] ? - 1 : 1 ) )
		.map( ( [ date, close ] ) => ( { date, close: Math.round( close * scale ) / scale } ) );

}

/** 日次の値の列をいくつか受け取り、日付ごとに 1 つにする（同じ日付は後の列が優先）。日付の昇順。 */
export function mergeDaily( ...lists ) {

	const byDate = new Map();
	for ( const list of lists ) for ( const row of list ) byDate.set( row.date, row );
	return [ ...byDate.values() ].sort( ( a, b ) => ( a.date < b.date ? - 1 : a.date > b.date ? 1 : 0 ) );

}
