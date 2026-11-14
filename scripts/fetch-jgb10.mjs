// 10 年国債の金利（財務省「国債金利情報」）を取得し、週次の data/jgb10.json と data/jgb10.meta.json を書き出す。
//
//   npm run fetch-jgb10
//   node scripts/fetch-jgb10.mjs --from-file <jgbcm_all.csv> [--from-file <jgbcm.csv> ...]
//
// 全期間の CSV（jgbcm_all.csv）が当月分を含まない場合があるので、当月分の CSV（jgbcm.csv）も取得して
// つなぐ（同じ日付は後に読んだ方が優先）。CSV は Shift_JIS。
// 出所：財務省「国債金利情報」 https://www.mof.go.jp/jgbs/reference/interest_rate/index.htm
// 規約：公共データ利用規約（第 1.0 版）PDL1.0 https://www.digital.go.jp/resources/open_data/public_data_license_v1.0

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { aggregateWeekly, mergeDaily } from './lib/weekly.mjs';
import { decodeShiftJis, parseJgbCsv } from './lib/jgb.mjs';
import { DATA_DIR, buildRealMeta, writeDataset, fetchBytes, todayIso } from './lib/output.mjs';

export const JGB_ALL_URL = 'https://www.mof.go.jp/jgbs/reference/interest_rate/data/jgbcm_all.csv';
export const JGB_MONTH_URL = 'https://www.mof.go.jp/jgbs/reference/interest_rate/jgbcm.csv';

export const JGB10_SPEC = {
	id: 'jgb10',
	label: '10年国債の金利',
	valueLabel: '週の最終営業日の値',
	unit: '%',
	decimals: 3,
	source: '財務省「国債金利情報」（10年物。単位は %）',
	sourceUrl: 'https://www.mof.go.jp/jgbs/reference/interest_rate/index.htm',
	license: '公共データ利用規約（第1.0版）PDL1.0',
	licenseUrl: 'https://www.digital.go.jp/resources/open_data/public_data_license_v1.0',
	attribution: '出典：財務省「国債金利情報」（https://www.mof.go.jp/jgbs/reference/interest_rate/index.htm）、PDL1.0（https://www.digital.go.jp/resources/open_data/public_data_license_v1.0）を加工して作成',
	processing: '財務省が公表する日次の国債金利（10年物）のうち、値のある日を、月曜始まりの週ごとに、その週の最終営業日の値へまとめました（日付は週の月曜日、単位は %、小数3桁）。和暦の日付は西暦に直しています。'
};

/** CSV のバイト列をいくつか受け取り、10 年物の週次の値にする。 */
export function buildJgb10Weekly( byteLists ) {

	const daily = mergeDaily( ...byteLists.map( bytes => parseJgbCsv( decodeShiftJis( bytes ) ) ) );
	return { daily, weekly: aggregateWeekly( daily, JGB10_SPEC.decimals ) };

}

async function main() {

	const args = process.argv.slice( 2 );
	const files = [];
	for ( let i = 0; i < args.length; i ++ ) {

		if ( args[ i ] === '--from-file' ) {

			if ( ! args[ i + 1 ] ) throw new Error( '--from-file にはファイル名が必要です' );
			files.push( args[ ++ i ] );

		} else {

			throw new Error( `知らない引数です：${args[ i ]}` );

		}

	}

	const byteLists = files.length
		? await Promise.all( files.map( async file => new Uint8Array( await readFile( file ) ) ) )
		: [ await fetchBytes( JGB_ALL_URL ), await fetchBytes( JGB_MONTH_URL ) ];

	const { daily, weekly } = buildJgb10Weekly( byteLists );
	if ( weekly.length < 2 ) throw new Error( 'CSV から 10 年物の日次の値を読み取れませんでした（形式が違う可能性があります）' );

	const meta = buildRealMeta( JGB10_SPEC, weekly, todayIso() );
	await writeDataset( DATA_DIR, JGB10_SPEC.id, weekly, meta );

	console.log( `日次 ${daily.length} 件（${daily[ 0 ].date} 〜 ${daily.at( - 1 ).date}）を、${weekly.length} 週（${meta.start} 〜 ${meta.end}）にまとめ、data/jgb10.json と data/jgb10.meta.json に書き出しました。` );

}

if ( process.argv[ 1 ] && import.meta.url === pathToFileURL( process.argv[ 1 ] ).href ) {

	try {

		await main();

	} catch ( error ) {

		console.error( `データを作れませんでした：${error.message}` );
		console.error( `手で保存した CSV から作ることもできます：node scripts/fetch-jgb10.mjs --from-file jgbcm_all.csv --from-file jgbcm.csv` );
		process.exit( 1 );

	}

}
