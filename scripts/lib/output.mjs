// 同梱データの書き出しと、メタ情報の組み立て、ネットワーク取得の共通部分。

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '..', '..' );
export const DATA_DIR = join( ROOT, 'data' );

// 一般的なクライアント名。利用者やプロジェクトを識別できる情報は入れない。
export const USER_AGENT = 'curl/8.5.0';

/** UTC の今日の日付 'YYYY-MM-DD'。 */
export function todayIso() {

	return new Date().toISOString().slice( 0, 10 );

}

/**
 * 同梱する実データのメタ情報。項目の順序もここで決める。
 * spec: { id, label, valueLabel, unit, decimals, source, sourceUrl, license, licenseUrl, attribution, processing }
 */
export function buildRealMeta( spec, weekly, fetchedAt ) {

	if ( ! weekly.length ) throw new Error( '週次のデータがありません' );

	return {
		id: spec.id,
		kind: 'real',
		label: spec.label,
		valueLabel: spec.valueLabel,
		unit: spec.unit,
		decimals: spec.decimals,
		source: spec.source,
		sourceUrl: spec.sourceUrl,
		license: spec.license,
		licenseUrl: spec.licenseUrl,
		attribution: spec.attribution,
		processing: spec.processing,
		fetchedAt,
		start: weekly[ 0 ].date,
		end: weekly.at( - 1 ).date,
		count: weekly.length
	};

}

/** 1 行 1 週の JSON（差分が読みやすい）。 */
export function formatWeekly( weekly ) {

	return '[\n' + weekly.map( row => JSON.stringify( { date: row.date, close: row.close } ) ).join( ',\n' ) + '\n]\n';

}

/** <dir>/<id>.json と <dir>/<id>.meta.json を書き出す。 */
export async function writeDataset( dir, id, weekly, meta ) {

	await mkdir( dir, { recursive: true } );
	await writeFile( join( dir, `${id}.json` ), formatWeekly( weekly ) );
	await writeFile( join( dir, `${id}.meta.json` ), JSON.stringify( meta, null, '\t' ) + '\n' );

}

/** URL から本文をバイト列で取得する。失敗は Error にする。 */
export async function fetchBytes( url ) {

	let response;
	try {

		response = await fetch( url, { headers: { 'User-Agent': USER_AGENT, Accept: '*/*' } } );

	} catch ( error ) {

		throw new Error( `${url} に接続できませんでした：${error.cause?.message ?? error.message}` );

	}

	if ( ! response.ok ) throw new Error( `${url} が HTTP ${response.status} ${response.statusText} を返しました` );
	return new Uint8Array( await response.arrayBuffer() );

}

/** 引数 --name 値 を取り出す。なければ null。 */
export function argValue( args, name ) {

	const index = args.indexOf( name );
	if ( index < 0 ) return null;
	const value = args[ index + 1 ];
	if ( ! value || value.startsWith( '--' ) ) throw new Error( `${name} には値が必要です` );
	return value;

}
