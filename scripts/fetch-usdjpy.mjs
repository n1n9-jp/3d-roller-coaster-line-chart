// ドル円の為替レート（米連邦準備制度理事会 FRB の H.10）を取得し、週次の data/usdjpy.json と
// data/usdjpy.meta.json を書き出す。
//
//   npm run fetch-usdjpy
//   node scripts/fetch-usdjpy.mjs --from-file <dat89_ja.htm> [--from-file <dat96_ja.htm> ...]
//   node scripts/fetch-usdjpy.mjs --from-dir <保存したファイルのフォルダ>   （フォルダ内の dat*_ja.htm を読む）
//
// 出所：FRB「Foreign Exchange Rates - H.10」（日本円。ニューヨーク市場の正午の買値、1 ドルあたりの円）
//       https://www.federalreserve.gov/releases/h10/hist/ の dat89_ja.htm・dat96_ja.htm・dat00_ja.htm
// 規約：https://www.federalreserve.gov/disclaimer.htm（Board のサイトの情報は、特記のない限りパブリックドメイン。出典を示す）

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aggregateWeekly, mergeDaily } from './lib/weekly.mjs';
import { H10_JAPAN_URLS, parseFrbH10 } from './lib/frb.mjs';
import { DATA_DIR, buildRealMeta, writeDataset, fetchBytes, todayIso } from './lib/output.mjs';

export const USDJPY_SPEC = {
	id: 'usdjpy',
	label: 'ドル円の為替レート',
	valueLabel: '週の最終営業日の値',
	unit: '円',
	decimals: 2,
	source: '米連邦準備制度理事会（FRB）統計 H.10「Foreign Exchange Rates」（日本円。ニューヨーク市場の正午の買値、1ドルあたり）',
	sourceUrl: 'https://www.federalreserve.gov/releases/h10/hist/',
	license: 'FRB ウェブサイトの利用条件（特記のない限りパブリックドメイン。出典を示す）',
	licenseUrl: 'https://www.federalreserve.gov/disclaimer.htm',
	attribution: '出典：米連邦準備制度理事会（FRB）「Foreign Exchange Rates - H.10」（https://www.federalreserve.gov/releases/h10/hist/）を加工して作成',
	processing: 'FRB が公表する日次の値（ニューヨーク市場の正午の買値）のうち、値のある日を、月曜始まりの週ごとに、その週の最終営業日の値へまとめました（日付は週の月曜日、単位は円、小数2桁）。'
};

const decodeUtf8 = bytes => new TextDecoder( 'utf-8' ).decode( bytes );

/** H.10 のページの文字列をいくつか受け取り、週次の値にする。 */
export function buildUsdjpyWeekly( texts ) {

	const daily = mergeDaily( ...texts.map( parseFrbH10 ) );
	return { daily, weekly: aggregateWeekly( daily, USDJPY_SPEC.decimals ) };

}

async function readInputs( args ) {

	const files = [];
	for ( let i = 0; i < args.length; i ++ ) {

		if ( args[ i ] === '--from-file' ) {

			if ( ! args[ i + 1 ] ) throw new Error( '--from-file にはファイル名が必要です' );
			files.push( args[ ++ i ] );

		} else if ( args[ i ] === '--from-dir' ) {

			if ( ! args[ i + 1 ] ) throw new Error( '--from-dir にはフォルダ名が必要です' );
			const dir = args[ ++ i ];
			const names = ( await readdir( dir ) ).filter( name => /^dat\d{2}_ja\.(htm|txt)$/.test( name ) ).sort();
			if ( ! names.length ) throw new Error( `${dir} に dat*_ja.htm がありません` );
			files.push( ...names.map( name => join( dir, name ) ) );

		} else {

			throw new Error( `知らない引数です：${args[ i ]}` );

		}

	}

	if ( files.length ) return Promise.all( files.map( async file => decodeUtf8( await readFile( file ) ) ) );
	return Promise.all( H10_JAPAN_URLS.map( async url => decodeUtf8( await fetchBytes( url ) ) ) );

}

async function main() {

	const texts = await readInputs( process.argv.slice( 2 ) );
	const { daily, weekly } = buildUsdjpyWeekly( texts );
	if ( weekly.length < 2 ) throw new Error( '日次の値を読み取れませんでした（形式が違う可能性があります）' );

	const meta = buildRealMeta( USDJPY_SPEC, weekly, todayIso() );
	await writeDataset( DATA_DIR, USDJPY_SPEC.id, weekly, meta );

	console.log( `日次 ${daily.length} 件（${daily[ 0 ].date} 〜 ${daily.at( - 1 ).date}）を、${weekly.length} 週（${meta.start} 〜 ${meta.end}）にまとめ、data/usdjpy.json と data/usdjpy.meta.json に書き出しました。` );

}

if ( process.argv[ 1 ] && import.meta.url === pathToFileURL( process.argv[ 1 ] ).href ) {

	try {

		await main();

	} catch ( error ) {

		console.error( `データを作れませんでした：${error.message}` );
		console.error( 'ブラウザで dat89_ja.htm・dat96_ja.htm・dat00_ja.htm（https://www.federalreserve.gov/releases/h10/hist/）を保存し、' );
		console.error( 'node scripts/fetch-usdjpy.mjs --from-dir <保存したフォルダ> で作ることもできます。' );
		process.exit( 1 );

	}

}
