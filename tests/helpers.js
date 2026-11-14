import { readFileSync } from 'node:fs';

export function readJson( relativePath ) {

	return JSON.parse( readFileSync( new URL( `../${relativePath}`, import.meta.url ), 'utf8' ) );

}

export function loadFixtures() {

	return {
		nikkei: readJson( 'data/nikkei225.json' )
	};

}

/**
 * 開始日と終了日を変えた仮の週次データ（テスト用）。元の系列の値を、startDate から endDate までの週次へ引き伸ばす。
 * 開始年の違うデータ（1971 年始まり 約 5.6 周、1986 年始まり 約 4 周）で螺旋の作りを確かめるのに使う。
 */
export function stretchedSeries( base, startDate, endDate ) {

	const week = 7 * 86400000;
	const start = Date.parse( `${startDate}T00:00:00Z` );
	const end = Date.parse( `${endDate}T00:00:00Z` );
	const n = Math.floor( ( end - start ) / week ) + 1;
	const out = [];
	for ( let i = 0; i < n; i ++ ) {

		const u = i / ( n - 1 ) * ( base.length - 1 );
		const i0 = Math.floor( u );
		const i1 = Math.min( i0 + 1, base.length - 1 );
		const close = base[ i0 ].close * ( 1 - ( u - i0 ) ) + base[ i1 ].close * ( u - i0 );
		out.push( { date: new Date( start + i * week ).toISOString().slice( 0, 10 ), close } );

	}

	return out;

}
