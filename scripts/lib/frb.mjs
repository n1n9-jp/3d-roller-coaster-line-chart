// 米連邦準備制度理事会（FRB）H.10（Foreign Exchange Rates）の過去の日次データを読む。
//
// 対象は https://www.federalreserve.gov/releases/h10/hist/ の dat89_ja.htm（〜1989）・dat96_ja.htm（1990〜99）・
// dat00_ja.htm（2000〜現在）。日付は「 4-Jan-71」「 3-JAN-00」の形（2 桁の年）、値は 1 ドルあたりの円、
// 値のない日は ND（No Data）。HTML の表の構造が年代で違うので、タグを取り除いた文字列から
// 「日付 値」の並びを読む。

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export const H10_JAPAN_URLS = [
	'https://www.federalreserve.gov/releases/h10/hist/dat89_ja.htm',
	'https://www.federalreserve.gov/releases/h10/hist/dat96_ja.htm',
	'https://www.federalreserve.gov/releases/h10/hist/dat00_ja.htm'
];

// 2 桁の年の境目。H.10 の日本円は 1971 年から始まるので、71〜99 は 19xx、00〜70 は 20xx。
const YEAR_PIVOT = 71;

function stripHtml( text ) {

	return text
		.replace( /<\/?abbr[^>]*>/gi, '' ) // 古い形式の「Jan-」は <ABBR> の中。空白を入れずに外す
		.replace( /<[^>]*>/g, ' ' )
		.replace( /&nbsp;/gi, ' ' );

}

/**
 * H.10 の HTML（または ASCII 版のテキスト）から日次の値 [{ date, close }] を取り出す。
 * ND・NA（値なし）の日は除く。日付の形をした記述の数と読めた数が合わなければ（形式が変わった）Error。
 */
export function parseFrbH10( text ) {

	const plain = stripHtml( text );
	const rows = [];

	const dateLike = plain.match( /\b\d{1,2}-[A-Za-z]{3}-\d{2}\b/g ) ?? [];
	const pattern = /\b(\d{1,2})-([A-Za-z]{3})-(\d{2})\s+(N\.?D\.?|N\.?A\.?|-?\d+(?:\.\d+)?)(?![\w.-])/gi;

	let matched = 0;
	for ( const match of plain.matchAll( pattern ) ) {

		matched ++;
		const [ , dayText, monthText, yearText, valueText ] = match;
		const month = MONTHS[ monthText.toLowerCase() ];
		if ( ! month ) throw new Error( `月を読めません：${match[ 0 ]}` );

		const yy = Number( yearText );
		const year = yy >= YEAR_PIVOT ? 1900 + yy : 2000 + yy;
		const iso = `${year}-${String( month ).padStart( 2, '0' )}-${String( Number( dayText ) ).padStart( 2, '0' )}`;
		const check = new Date( `${iso}T00:00:00Z` );
		if ( Number.isNaN( check.getTime() ) || check.toISOString().slice( 0, 10 ) !== iso ) {

			throw new Error( `存在しない日付です：${match[ 0 ]}` );

		}

		if ( /^N/i.test( valueText ) ) continue; // ND・NA：値のない日

		const close = Number( valueText );
		if ( ! Number.isFinite( close ) ) throw new Error( `値を読めません：${match[ 0 ]}` );
		rows.push( { date: iso, close } );

	}

	if ( matched !== dateLike.length ) {

		throw new Error( `日付の形の記述 ${dateLike.length} 件のうち ${matched} 件しか「日付 値」として読めませんでした（形式が変わった可能性があります）` );

	}

	return rows;

}
