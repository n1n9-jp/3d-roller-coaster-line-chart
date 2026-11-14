// 日経平均株価の実データを FRED から取得し、週次終値の data/local/ に書き出す。
//
//   npm run fetch-data
//   node scripts/fetch-nikkei.mjs --from-file <保存済みの CSV>
//
// 出力（どちらも git の管理外）:
//   data/local/nikkei225.json  [{ date: 週の月曜日, close: 週の最終営業日の終値 }]
//   data/local/meta.json       出典などのメタ情報（kind: 'real'）

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

export const FRED_CSV_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=NIKKEI225&cosd=1990-01-01';
export const START_DATE = '1990-01-01';
const USER_AGENT = 'curl/8.5.0';
const DAY_MS = 86400000;

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const outDir = join( root, 'data', 'local' );

/** 'YYYY-MM-DD' → UTC のエポック日数。 */
function toDays( date ) {

	return Math.floor( Date.parse( `${date}T00:00:00Z` ) / DAY_MS );

}

function fromDays( days ) {

	return new Date( days * DAY_MS ).toISOString().slice( 0, 10 );

}

/** その日を含む週（月曜始まり）の月曜日の日付。 */
export function mondayOf( date ) {

	const days = toDays( date );
	// 1970-01-01 は木曜日。月曜 = 0 とした曜日は (days + 3) % 7
	const weekday = ( ( days + 3 ) % 7 + 7 ) % 7;
	return fromDays( days - weekday );

}

/** FRED の CSV（observation_date,NIKKEI225）を [{ date, close }] にする。休場日（空・"."）は除く。 */
export function parseCsv( text ) {

	const rows = [];
	for ( const line of text.split( /\r?\n/ ) ) {

		const [ date, value ] = line.split( ',' ).map( s => s.trim() );
		if ( ! /^\d{4}-\d{2}-\d{2}$/.test( date ?? '' ) ) continue; // ヘッダや空行
		if ( value === undefined || value === '' || value === '.' ) continue;

		const close = Number( value );
		if ( Number.isFinite( close ) ) rows.push( { date, close } );

	}

	return rows;

}

/**
 * 日次終値を、月曜始まりの週ごとに「その週の最終営業日の終値」へまとめる。
 * date は週の月曜日。営業日のない週の行は作らない。close は小数 2 桁。
 */
export function aggregateWeekly( daily ) {

	const sorted = [ ...daily ].sort( ( a, b ) => ( a.date < b.date ? - 1 : a.date > b.date ? 1 : 0 ) );
	const weeks = new Map();
	for ( const { date, close } of sorted ) {

		weeks.set( mondayOf( date ), close ); // 日付順なので、最後に入った値がその週の最終営業日

	}

	return [ ...weeks ]
		.sort( ( a, b ) => ( a[ 0 ] < b[ 0 ] ? - 1 : 1 ) )
		.map( ( [ date, close ] ) => ( { date, close: Math.round( close * 100 ) / 100 } ) );

}

export function buildMeta( weekly, fetchedAt ) {

	return {
		kind: 'real',
		label: '日経平均株価（週次終値）',
		source: '日本経済新聞社「日経平均株価」',
		via: 'FRED（系列 NIKKEI225）',
		sourceUrl: 'https://fred.stlouisfed.org/series/NIKKEI225',
		fetchedAt,
		start: weekly[ 0 ].date,
		end: weekly.at( - 1 ).date,
		count: weekly.length
	};

}

async function fetchCsv() {

	const response = await fetch( FRED_CSV_URL, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/csv,*/*' } } );
	if ( ! response.ok ) throw new Error( `HTTP ${response.status} ${response.statusText}` );
	return response.text();

}

function fail( reason ) {

	console.error( `データを取得できませんでした：${reason}` );
	console.error( '' );
	console.error( '手で保存した CSV から作ることもできます。' );
	console.error( `  1. ブラウザで ${FRED_CSV_URL} を開き、CSV として保存する（例：fred.csv）` );
	console.error( '  2. node scripts/fetch-nikkei.mjs --from-file fred.csv' );
	process.exit( 1 );

}

async function main() {

	const args = process.argv.slice( 2 );
	const fileIndex = args.indexOf( '--from-file' );
	let text;

	try {

		if ( fileIndex >= 0 ) {

			const file = args[ fileIndex + 1 ];
			if ( ! file ) throw new Error( '--from-file にはファイル名が必要です' );
			text = await readFile( file, 'utf8' );

		} else {

			text = await fetchCsv();

		}

	} catch ( error ) {

		fail( error.cause ? `${error.message}（${error.cause.message ?? error.cause}）` : error.message );

	}

	const daily = parseCsv( text ).filter( row => row.date >= START_DATE );
	const weekly = aggregateWeekly( daily );
	if ( weekly.length < 2 ) fail( 'CSV から日次終値を読み取れませんでした（形式が違う可能性があります）' );

	const meta = buildMeta( weekly, new Date().toISOString().slice( 0, 10 ) );

	await mkdir( outDir, { recursive: true } );
	await writeFile( join( outDir, 'nikkei225.json' ), JSON.stringify( weekly ) + '\n' );
	await writeFile( join( outDir, 'meta.json' ), JSON.stringify( meta, null, '\t' ) + '\n' );

	console.log( `${weekly.length} 週（${meta.start} 〜 ${meta.end}）を data/local/ に書き出しました。` );
	console.log( 'http://localhost:8000/?data=local で開けます（npm start でサーバを起動）。' );

}

if ( process.argv[ 1 ] && import.meta.url === pathToFileURL( process.argv[ 1 ] ).href ) {

	await main();

}
