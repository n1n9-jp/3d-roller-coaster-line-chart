// 財務省「国債金利情報」の CSV（jgbcm_all.csv・jgbcm.csv）を読む。
//
// 形式：Shift_JIS。1 行目が表題、2 行目が見出し（基準日,1年,2年,…,10年,…,40年）、
// 3 行目以降が日次（基準日は和暦の S49.9.24・H1.1.9・R8.10.30 の形、値がない日は "-"）。
// 末尾に注意書きの行や空行が付くことがある。

/** 和暦の元号の記号 → 元年の前年の西暦（西暦 = 基準 + 和暦の年）。 */
export const ERA_BASE = { S: 1925, H: 1988, R: 2018 };

// 各元号の最初の日と最後の日（西暦）。範囲の外の組は、和暦の誤読として拒否する。
const ERA_RANGE = {
	S: [ '1926-12-25', '1989-01-07' ],
	H: [ '1989-01-08', '2019-04-30' ],
	R: [ '2019-05-01', '9999-12-31' ]
};

/**
 * 和暦の日付（S49.9.24・H1.1.9・R8.10.30。元年は 1 または 元）を 'YYYY-MM-DD' にする。
 * 存在しない日付、元号の範囲の外（例：H31.5.1）は Error。
 */
export function warekiToIso( text ) {

	const match = /^([SHR])(\d{1,2}|元)\.(\d{1,2})\.(\d{1,2})$/.exec( String( text ).trim() );
	if ( ! match ) throw new Error( `和暦を解釈できません：${text}` );

	const [ , era, yearText, monthText, dayText ] = match;
	const year = ERA_BASE[ era ] + ( yearText === '元' ? 1 : Number( yearText ) );
	const month = Number( monthText );
	const day = Number( dayText );
	const iso = `${String( year ).padStart( 4, '0' )}-${String( month ).padStart( 2, '0' )}-${String( day ).padStart( 2, '0' )}`;

	// 月日の範囲（2 月 30 日などを弾く）
	const check = new Date( `${iso}T00:00:00Z` );
	if ( Number.isNaN( check.getTime() ) || check.toISOString().slice( 0, 10 ) !== iso ) {

		throw new Error( `存在しない日付です：${text}（${iso}）` );

	}

	const [ first, last ] = ERA_RANGE[ era ];
	if ( iso < first || iso > last ) throw new Error( `元号の範囲の外です：${text}（${iso}）` );
	return iso;

}

/** Shift_JIS のバイト列を文字列にする。壊れたバイトがあれば Error。 */
export function decodeShiftJis( bytes ) {

	return new TextDecoder( 'shift_jis', { fatal: true } ).decode( bytes );

}

/**
 * 国債金利情報の CSV の文字列から、指定した年限の日次の値 [{ date, close }] を取り出す。
 * 値のない日（"-" または空）は除く。見出しの行に年限（既定 '10年'）の列がなければ Error。
 * 基準日の形をしていない行（表題・注意書き・空行）は読み飛ばす。値が数値でも "-" でもなければ Error。
 */
export function parseJgbCsv( text, tenor = '10年' ) {

	const rows = [];
	let column = - 1;

	for ( const line of text.replace( /^﻿/, '' ).split( /\r?\n/ ) ) {

		const cells = line.split( ',' ).map( cell => cell.trim() );

		if ( cells[ 0 ] === '基準日' ) {

			column = cells.indexOf( tenor );
			if ( column < 0 ) throw new Error( `見出しに ${tenor} の列がありません：${line}` );
			continue;

		}

		if ( ! /^[SHR](\d+|元)\./.test( cells[ 0 ] ?? '' ) ) continue; // 表題・注意書き・空行
		if ( column < 0 ) throw new Error( '見出しの行（基準日,1年,…）より前にデータの行があります' );

		const date = warekiToIso( cells[ 0 ] );
		const value = cells[ column ];
		if ( value === undefined || value === '' || value === '-' ) continue;

		const close = Number( value );
		if ( ! Number.isFinite( close ) ) throw new Error( `${cells[ 0 ]} の ${tenor} の値を読めません：${value}` );
		rows.push( { date, close } );

	}

	return rows;

}
