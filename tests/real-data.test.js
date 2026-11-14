import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mondayOf, aggregateWeekly, mergeDaily, toDays } from '../scripts/lib/weekly.mjs';
import { warekiToIso, decodeShiftJis, parseJgbCsv } from '../scripts/lib/jgb.mjs';
import { parseFrbH10 } from '../scripts/lib/frb.mjs';
import { buildRealMeta, formatWeekly } from '../scripts/lib/output.mjs';
import { buildJgb10Weekly, JGB10_SPEC } from '../scripts/fetch-jgb10.mjs';
import { buildUsdjpyWeekly, USDJPY_SPEC } from '../scripts/fetch-usdjpy.mjs';
import { readJson } from './helpers.js';

// ---- 和暦 → 西暦 ----

test( 'warekiToIso：昭和 64 年 1 月 7 日と平成元年 1 月 8 日の境目', () => {

	assert.equal( warekiToIso( 'S64.1.6' ), '1989-01-06' );
	assert.equal( warekiToIso( 'S64.1.7' ), '1989-01-07' );
	assert.equal( warekiToIso( 'H1.1.8' ), '1989-01-08' );
	assert.equal( warekiToIso( 'H1.1.9' ), '1989-01-09' );
	assert.throws( () => warekiToIso( 'S64.1.8' ), /元号の範囲/ ); // 昭和は 1 月 7 日まで
	assert.throws( () => warekiToIso( 'H1.1.7' ), /元号の範囲/ ); // 平成は 1 月 8 日から

} );

test( 'warekiToIso：平成 31 年 4 月 30 日と令和元年 5 月 1 日の境目', () => {

	assert.equal( warekiToIso( 'H31.4.26' ), '2019-04-26' );
	assert.equal( warekiToIso( 'H31.4.30' ), '2019-04-30' );
	assert.equal( warekiToIso( 'R1.5.1' ), '2019-05-01' );
	assert.equal( warekiToIso( 'R1.5.7' ), '2019-05-07' );
	assert.throws( () => warekiToIso( 'H31.5.1' ), /元号の範囲/ );
	assert.throws( () => warekiToIso( 'R1.4.30' ), /元号の範囲/ );

} );

test( 'warekiToIso：元年は数字の 1（財務省の CSV の書き方）でも「元」でも読める', () => {

	assert.equal( warekiToIso( 'H1.2.1' ), '1989-02-01' );
	assert.equal( warekiToIso( 'H元.2.1' ), '1989-02-01' );
	assert.equal( warekiToIso( 'R元.6.3' ), '2019-06-03' );
	assert.equal( warekiToIso( 'S元.12.25' ), '1926-12-25' );

} );

test( 'warekiToIso：年の下 2 桁、月日の 0 埋め、最初と最近の値', () => {

	assert.equal( warekiToIso( 'S49.9.24' ), '1974-09-24' );
	assert.equal( warekiToIso( 'S61.7.5' ), '1986-07-05' );
	assert.equal( warekiToIso( 'H12.12.31' ), '2000-12-31' );
	assert.equal( warekiToIso( 'R8.10.30' ), '2026-10-30' );

} );

test( 'warekiToIso：存在しない日付や和暦でない文字列は Error', () => {

	assert.throws( () => warekiToIso( 'H2.2.30' ), /存在しない/ );
	assert.throws( () => warekiToIso( 'H3.2.29' ), /存在しない/ ); // 平成 3 年（1991）はうるう年ではない
	assert.equal( warekiToIso( 'H4.2.29' ), '1992-02-29' );
	assert.throws( () => warekiToIso( '2024-01-04' ), /解釈できません/ );
	assert.throws( () => warekiToIso( 'X1.1.1' ), /解釈できません/ );

} );

// ---- 財務省の CSV（Shift_JIS） ----

// 表題・見出し・昭和 64 年・平成元年・令和元年の行・値のない行（10 年物が "-"）・空行・注意書きを、
// Shift_JIS のバイト列にした見本（CRLF）。
const JGB_SAMPLE_HEX = [
	'8d918dc28be097988fee95f12c2c2c2c2c2c2c2c2c2c2c2c2c2c2c28925088ca203a2025290d0a8aee8f8093fa2c3194',
	'4e2c32944e2c33944e2c34944e2c35944e2c36944e2c37944e2c38944e2c39944e2c3130944e2c3135944e2c3230944e',
	'2c3235944e2c3330944e2c3430944e0d0a5336342e312e362c332e3834342c332e3936382c342e3031312c332e393938',
	'2c342e3034362c342e3131322c342e3137342c342e3636352c342e36392c342e3834332c2d2c342e3937312c2d2c2d2c',
	'2d0d0a48312e312e392c332e3835372c332e3936332c342e3030312c332e3938332c342e30332c342e3038362c342e31',
	'34382c342e3630332c342e3633312c342e3739312c2d2c342e3934372c2d2c2d2c2d0d0a48312e312e31302c332e3830',
	'342c332e39332c332e3937382c332e3936362c342e3031352c342e3037322c342e3133342c342e3539312c342e363536',
	'2c2d2c2d2c342e3934322c2d2c2d2c2d0d0a52312e352e312c2d302e312c2d302e322c2d302e332c2d302e342c2d302e',
	'352c2d302e362c2d302e372c2d302e382c2d302e392c2d302e3130332c302e322c302e332c302e342c302e352c302e36',
	'0d0a2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c0d0a81a68dc5905682cc6373768366815b835e82aa835f83458393838d815b',
	'836882c582ab82c882a28fea8d87814182b29798977082cc837583898345835582c982a882a282c4834c838383628356',
	'838582cc8ded8f9c82f08ec08e7b82b58dc49378835f83458393838d815b836882ad82be82b382a281422c2c2c2c2c2c',
	'2c2c2c2c2c2c2c2c2c0d0a'
].join( '' );
const jgbSampleBytes = () => new Uint8Array( Buffer.from( JGB_SAMPLE_HEX, 'hex' ) );

test( 'decodeShiftJis：Shift_JIS のバイト列を日本語の文字列にする', () => {

	const text = decodeShiftJis( jgbSampleBytes() );
	assert.ok( text.startsWith( '国債金利情報,' ) );
	assert.ok( text.includes( '基準日,1年,2年' ) );
	assert.ok( text.includes( '※最新のcsvデータ' ) );
	assert.throws( () => decodeShiftJis( new Uint8Array( [ 0x81 ] ) ) ); // 壊れたバイト

} );

test( 'parseJgbCsv：10 年物を日付つきで取り出し、"-"・空行・注意書きは除く', () => {

	const rows = parseJgbCsv( decodeShiftJis( jgbSampleBytes() ) );
	assert.deepEqual( rows, [
		{ date: '1989-01-06', close: 4.843 }, // S64.1.6
		{ date: '1989-01-09', close: 4.791 }, // H1.1.9
		// H1.1.10 は 10 年物が "-" なので除く
		{ date: '2019-05-01', close: - 0.103 } // R1.5.1（負の金利）
	] );

} );

test( 'parseJgbCsv：年限を指定でき、列の位置は見出しから決める', () => {

	const csv = '国債金利情報\n基準日,5年,10年\nH1.1.9,1.5,2.5\nH1.1.10,-,3.5\n';
	assert.deepEqual( parseJgbCsv( csv ), [ { date: '1989-01-09', close: 2.5 }, { date: '1989-01-10', close: 3.5 } ] );
	assert.deepEqual( parseJgbCsv( csv, '5年' ), [ { date: '1989-01-09', close: 1.5 } ] );
	assert.throws( () => parseJgbCsv( csv, '40年' ), /40年/ );

} );

test( 'parseJgbCsv：値が数値でも "-" でもなければ Error、見出しより前のデータ行も Error', () => {

	assert.throws( () => parseJgbCsv( '基準日,10年\nH1.1.9,abc\n' ), /読めません/ );
	assert.throws( () => parseJgbCsv( 'H1.1.9,1.0\n' ), /見出し/ );

} );

test( 'mergeDaily：同じ日付は後の列が優先で、日付の昇順', () => {

	const merged = mergeDaily(
		[ { date: '2026-10-29', close: 1 }, { date: '2026-10-30', close: 2 } ],
		[ { date: '2026-10-30', close: 2.5 }, { date: '2026-11-02', close: 3 } ]
	);
	assert.deepEqual( merged, [
		{ date: '2026-10-29', close: 1 },
		{ date: '2026-10-30', close: 2.5 },
		{ date: '2026-11-02', close: 3 }
	] );

} );

// ---- FRB H.10 ----

const FRB_OLD_HTML = '<table><tr><th id="header1">Date</th><th id="header2">Rate</th></tr>'
	+ '<tr><th id="rowheader1" axis="Date">&nbsp;4-<ABBR title="January">Jan-</ABBR>71&nbsp;</th><td headers="header2 rowheader1">&nbsp;&nbsp;&nbsp;357.7300&nbsp;</td></tr>\n'
	+ '<tr><th id="rowheader2" axis="Date">&nbsp;5-<ABBR title="January">Jan-</ABBR>71&nbsp;</th><td headers="header2 rowheader2">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<ABBR title="No Data">&nbsp;ND&nbsp;</ABBR></td></tr>\n'
	+ '<tr><th id="rowheader3" axis="Date">29-<ABBR title="December">Dec-</ABBR>99&nbsp;</th><td headers="header2 rowheader3">&nbsp;&nbsp;&nbsp;102.1600&nbsp;</td></tr></table>';

const FRB_NEW_HTML = '<table class="pubtables"><thead><th scope=col>Date</th><th scope=col>Rate</th></thead>\n'
	+ '<tr>\n<th id="r1" headers="a1"> 3-JAN-00 </th>\n<td headers="a2 a1 r1">            101.7000                                                  </td>\n</tr>\n'
	+ '<tr>\n<th id="r1" headers="a1">17-JAN-00 </th>\n<td headers="a2 a1 r1">                  ND                                                  </td>\n</tr>\n'
	+ '<tr>\n<th id="r1" headers="a1"> 6-NOV-26 </th>\n<td headers="a2 a1 r1">            158.2300                                                  </td>\n</tr></table>';

test( 'parseFrbH10：古い HTML（〜1999）。2 桁の年を西暦にし、ND の日は除く', () => {

	assert.deepEqual( parseFrbH10( FRB_OLD_HTML ), [
		{ date: '1971-01-04', close: 357.73 },
		{ date: '1999-12-29', close: 102.16 }
	] );

} );

test( 'parseFrbH10：新しい HTML（2000〜）。月は大文字で、ND の日は除く', () => {

	assert.deepEqual( parseFrbH10( FRB_NEW_HTML ), [
		{ date: '2000-01-03', close: 101.7 },
		{ date: '2026-11-06', close: 158.23 }
	] );

} );

test( 'parseFrbH10：ASCII 版のテキストも読める', () => {

	const txt = ' 4-Jan-71                              357.7300\n 5-Jan-71                                    ND\n31-Dec-70                              358.0000\n';
	assert.deepEqual( parseFrbH10( txt ), [
		{ date: '1971-01-04', close: 357.73 },
		{ date: '2070-12-31', close: 358 } // 年の境目は 71（H.10 の日本円は 1971 年から）。70 以下は 20xx
	] );

} );

test( 'parseFrbH10：日付の形をした記述が読めなければ（形式が変わった）Error、存在しない日付も Error', () => {

	assert.throws( () => parseFrbH10( ' 4-Jan-71   n/a-value\n 5-Jan-71   357.8\n' ), /読めませんでした/ );
	assert.throws( () => parseFrbH10( '30-Feb-99   100.0' ), /存在しない/ );
	assert.deepEqual( parseFrbH10( '<html>日付なし</html>' ), [] );

} );

// ---- 週次の集計（共通モジュール） ----

test( 'mondayOf：週は月曜始まり', () => {

	assert.equal( mondayOf( '1971-01-04' ), '1971-01-04' ); // 月
	assert.equal( mondayOf( '1971-01-10' ), '1971-01-04' ); // 日
	assert.equal( mondayOf( '2026-11-06' ), '2026-11-02' ); // 金
	assert.equal( mondayOf( '2000-01-01' ), '1999-12-27' ); // 年をまたぐ
	assert.equal( toDays( '1970-01-01' ), 0 );

} );

test( 'aggregateWeekly：週の途中の休場日があっても、その週の最後の営業日の値', () => {

	const daily = [
		{ date: '2024-01-08', close: 1 },
		{ date: '2024-01-09', close: 2 },
		{ date: '2024-01-10', close: 3 } // 木・金が休場
	];
	assert.deepEqual( aggregateWeekly( daily, 2 ), [ { date: '2024-01-08', close: 3 } ] );

} );

test( 'aggregateWeekly：営業日のない週は行を作らず、年をまたぐ週は月曜の年で数える', () => {

	const daily = [
		{ date: '2024-12-27', close: 1 }, // 週 12-23
		// 12-30 の週は 12-30（月）に営業日なし、翌年 01-03（金）にある
		{ date: '2025-01-03', close: 2 },
		// 01-06 の週は営業日なし
		{ date: '2025-01-14', close: 3 } // 週 01-13
	];
	assert.deepEqual( aggregateWeekly( daily ), [
		{ date: '2024-12-23', close: 1 },
		{ date: '2024-12-30', close: 2 },
		{ date: '2025-01-13', close: 3 }
	] );

} );

test( 'aggregateWeekly：小数の桁数を指定でき（負の値も）、入力が逆順でも同じ', () => {

	const daily = [ { date: '2016-07-08', close: - 0.2934 }, { date: '2016-07-06', close: 1 } ];
	assert.deepEqual( aggregateWeekly( daily, 3 ), [ { date: '2016-07-04', close: - 0.293 } ] );
	assert.deepEqual( aggregateWeekly( [ { date: '2024-01-05', close: 130.456 } ] ), [ { date: '2024-01-01', close: 130.46 } ] );

} );

// ---- 取得スクリプトの組み立て ----

test( 'buildUsdjpyWeekly：3 つの期間のページをつなぎ、小数 2 桁の週次にする', () => {

	const { daily, weekly } = buildUsdjpyWeekly( [ FRB_OLD_HTML, FRB_NEW_HTML ] );
	assert.equal( daily.length, 4 );
	assert.deepEqual( weekly, [
		{ date: '1971-01-04', close: 357.73 },
		{ date: '1999-12-27', close: 102.16 },
		{ date: '2000-01-03', close: 101.7 },
		{ date: '2026-11-02', close: 158.23 }
	] );

} );

test( 'buildJgb10Weekly：全期間と当月分の CSV をつなぎ、同じ日付は当月分を優先して週次にする', () => {

	// 見出し「基準日,5年,10年」を Shift_JIS のバイト列で書き、行は ASCII
	const csv = lines => new Uint8Array( Buffer.concat( [
		Buffer.from( '8aee8f8093fa' + '2c35' + '944e' + '2c3130' + '944e' + '0d0a', 'hex' ), // 基準日,5年,10年
		Buffer.from( lines.join( '\r\n' ) + '\r\n', 'latin1' )
	] ) );

	const all = csv( [ 'R8.10.29,2.0,2.876', 'R8.10.30,2.0,2.817' ] );
	const month = csv( [ 'R8.10.30,2.0,2.8175', 'R8.11.2,2.0,2.9' ] );
	const { daily, weekly } = buildJgb10Weekly( [ all, month ] );
	assert.equal( daily.length, 3 );
	assert.deepEqual( weekly, [
		{ date: '2026-10-26', close: 2.818 }, // 当月分の 10-30 が優先（2.8175 を小数 3 桁へ）
		{ date: '2026-11-02', close: 2.9 }
	] );

} );

test( 'buildRealMeta・formatWeekly：項目の順序と、1 行 1 週の JSON', () => {

	const weekly = [ { date: '2024-01-01', close: 1.5 }, { date: '2024-01-08', close: 2 } ];
	const meta = buildRealMeta( USDJPY_SPEC, weekly, '2026-11-14' );
	assert.deepEqual( Object.keys( meta ), [
		'id', 'kind', 'label', 'valueLabel', 'unit', 'decimals', 'source', 'sourceUrl', 'license', 'licenseUrl',
		'attribution', 'processing', 'fetchedAt', 'start', 'end', 'count'
	] );
	assert.equal( meta.start, '2024-01-01' );
	assert.equal( meta.end, '2024-01-08' );
	assert.equal( meta.count, 2 );
	assert.throws( () => buildRealMeta( USDJPY_SPEC, [], '2026-11-14' ) );
	assert.equal( formatWeekly( weekly ), '[\n{"date":"2024-01-01","close":1.5},\n{"date":"2024-01-08","close":2}\n]\n' );

} );

// ---- 同梱したデータファイル ----

const BUNDLED = [
	{ id: 'usdjpy', spec: USDJPY_SPEC, min: 50, max: 400, expectedAttribution: /FRB|連邦準備制度理事会/ },
	{ id: 'jgb10', spec: JGB10_SPEC, min: - 1, max: 12, expectedAttribution: /財務省/ }
];

for ( const { id, spec, min, max, expectedAttribution } of BUNDLED ) {

	test( `同梱データ ${id}：日付は YYYY-MM-DD の昇順・週の月曜で、間隔は 7 日の倍数、値は妥当な数値`, () => {

		const data = readJson( `data/${id}.json` );
		assert.ok( data.length > 1000 );

		let prev = null;
		for ( const row of data ) {

			assert.deepEqual( Object.keys( row ), [ 'date', 'close' ] );
			assert.match( row.date, /^\d{4}-\d{2}-\d{2}$/ );
			assert.equal( mondayOf( row.date ), row.date, `${row.date} は月曜日` );
			assert.equal( typeof row.close, 'number' );
			assert.ok( Number.isFinite( row.close ) && row.close >= min && row.close <= max, `${row.date} ${row.close}` );
			assert.equal( Number( row.close.toFixed( spec.decimals ) ), row.close, `${row.date} は小数 ${spec.decimals} 桁まで` );

			if ( prev ) {

				const days = toDays( row.date ) - toDays( prev );
				assert.ok( days > 0 && days % 7 === 0, `${prev} → ${row.date}` );
				assert.ok( days <= 21, `${prev} → ${row.date} の間隔が 3 週を超える` );

			}

			prev = row.date;

		}

	} );

	test( `同梱データ ${id}：メタ情報の項目と、start・end・count の一致`, () => {

		const data = readJson( `data/${id}.json` );
		const meta = readJson( `data/${id}.meta.json` );

		assert.equal( meta.id, id );
		assert.equal( meta.kind, 'real' );
		for ( const key of [ 'label', 'valueLabel', 'unit', 'source', 'license', 'attribution', 'processing' ] ) {

			assert.equal( typeof meta[ key ], 'string', key );
			assert.ok( meta[ key ].length > 0, key );

		}

		assert.equal( meta.label, spec.label );
		assert.equal( meta.unit, spec.unit );
		assert.equal( meta.decimals, spec.decimals );
		assert.match( meta.sourceUrl, /^https:\/\// );
		assert.match( meta.licenseUrl, /^https:\/\// );
		assert.match( meta.fetchedAt, /^\d{4}-\d{2}-\d{2}$/ );
		assert.match( meta.attribution, expectedAttribution );
		assert.ok( meta.attribution.includes( meta.sourceUrl ), '出典表記に出所の URL を含む' );
		assert.ok( meta.attribution.endsWith( '加工して作成' ), '加工して作成した旨' );
		assert.equal( meta.start, data[ 0 ].date );
		assert.equal( meta.end, data.at( - 1 ).date );
		assert.equal( meta.count, data.length );
		assert.ok( meta.end <= meta.fetchedAt );

	} );

}

test( '同梱データ：既知の水準（ドル円と 10 年国債）', () => {

	const at = ( data, date ) => data.find( row => row.date === date )?.close;
	const usdjpy = readJson( 'data/usdjpy.json' );
	const jgb10 = readJson( 'data/jgb10.json' );

	assert.ok( usdjpy[ 0 ].date <= '1971-01-04' );
	assert.ok( at( usdjpy, '1971-01-04' ) > 350 ); // 変動相場制の前（固定相場、360 円前後）
	assert.ok( at( usdjpy, '2011-10-24' ) < 76 ); // 2011 年 10 月の戦後最安値圏
	assert.ok( at( usdjpy, '2024-07-01' ) > 158 ); // 2024 年 7 月の円安
	assert.ok( at( jgb10, '1990-09-24' ) > 8 ); // 1990 年 9 月
	assert.ok( jgb10.find( row => row.date.startsWith( '2016-07' ) ).close < 0 ); // 2016 年 7 月のマイナス金利

} );
