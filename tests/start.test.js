import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DATASETS, DEFAULT_DATASET } from '../assets/js/config.js';
import {
	parseYMD, formatYearMonth, formatDate, periodOf, titleParts, documentTitle, kickerText, descriptionText, descriptionParts,
	chipTexts, loadingText, creditLine, metaDescription, BASE_DESCRIPTION, canvasLabel, datasetHref, dataSwitchItems,
	stepLabel, mechanismParagraphs, decadeExamples, linkify, dataSourceItems, eventsSourceItem, ERROR_TEXTS
} from '../assets/js/ui/texts.js';
import { readJson, loadFixtures, series1990 } from './helpers.js';
import { buildDataset } from '../assets/js/data.js';
import { TrackCurve } from '../assets/js/track.js';

const fixtures = loadFixtures();
const METAS = {
	usdjpy: readJson( 'data/usdjpy.meta.json' ),
	jgb10: readJson( 'data/jgb10.meta.json' )
};
// 手元のデータ（日経平均）のメタ情報。data/local はリポジトリに無いので、形だけの仮のデータを使う
const NIKKEI_META = {
	kind: 'real',
	label: '日経平均株価（週次終値）',
	attribution: '日本経済新聞社「日経平均株価」（©日本経済新聞社）。米セントルイス連邦準備銀行 FRED（系列 NIKKEI225）経由',
	processing: '週次値は各週の最終営業日の終値です。',
	sourceUrl: 'https://fred.stlouisfed.org/series/NIKKEI225',
	fetchedAt: '2026-11-14'
};
const NIKKEI_LEGACY_META = {
	kind: 'real',
	label: '日経平均株価（週次終値）',
	source: '日本経済新聞社「日経平均株価」',
	via: 'FRED（系列 NIKKEI225）',
	sourceUrl: 'https://fred.stlouisfed.org/series/NIKKEI225',
	fetchedAt: '2026-11-14'
};
const NIKKEI_PERIOD = periodOf( [ { date: '1990-01-01', close: 1 }, { date: '2026-11-09', close: 2 } ] );

test( '日付の読み取りと表記', () => {

	assert.deepEqual( parseYMD( '2025-12-29' ), { y: 2025, m: 12, d: 29 } );
	assert.equal( formatYearMonth( '1990-01-01' ), '1990年1月' );
	assert.equal( formatDate( '2026-11-14' ), '2026年11月14日' );
	assert.equal( formatDate( 'きのう' ), 'きのう' );
	assert.throws( () => parseYMD( 'x' ) );

} );

test( '期間は、データの最初と最後の週から作る', () => {

	const usdjpy = periodOf( fixtures.usdjpy );
	assert.equal( usdjpy.startYear, '1971年' );
	assert.equal( usdjpy.startLabel, '1971年1月' );
	assert.equal( usdjpy.endLabel, formatYearMonth( fixtures.usdjpy.at( - 1 ).date ) );
	assert.ok( usdjpy.years >= 55 );

	const jgb = periodOf( fixtures.jgb10 );
	assert.equal( jgb.startLabel, '1986年6月' );
	assert.equal( periodOf( [ { date: '2000-01-03', close: 1 }, { date: '2000-01-10', close: 2 } ] ).years, 1 );

} );

test( 'タイトル：3種類のデータで、長い名前と固定の2行目', () => {

	assert.deepEqual( titleParts( DATASETS.usdjpy ), [ 'ドル円の為替レート', '3Dジェットコースター' ] );
	assert.deepEqual( titleParts( DATASETS.jgb10 ), [ '10年国債の金利', '3Dジェットコースター' ] );
	assert.deepEqual( titleParts( DATASETS.nikkei ), [ '日経平均株価', '3Dジェットコースター' ] );
	assert.equal( documentTitle( DATASETS.usdjpy ), 'ドル円の為替レート 3Dジェットコースター' );
	assert.equal( documentTitle( DATASETS.jgb10 ), '10年国債の金利 3Dジェットコースター' );
	assert.equal( documentTitle( DATASETS.nikkei ), '日経平均株価 3Dジェットコースター' );

} );

test( 'キッカー・説明文・チップ・読み込み中の文言：3種類のデータ', () => {

	const usdjpy = periodOf( fixtures.usdjpy );
	const jgb = periodOf( fixtures.jgb10 );

	assert.equal( kickerText( usdjpy ), `1971年1月〜${usdjpy.endLabel}` );
	assert.equal( kickerText( jgb ), `1986年6月〜${jgb.endLabel}` );
	assert.equal( kickerText( NIKKEI_PERIOD ), '1990年1月〜2026年11月' );

	assert.equal(
		descriptionText( DATASETS.usdjpy, usdjpy ),
		`レールの高さが、その週の1ドルあたりの円の値段です。高いほど円安、低いほど円高です。らせんを内側から外側へ、10年で1周しながら、1971年1月から${usdjpy.endLabel}までの約${usdjpy.years}年を走り抜けます。`
	);
	assert.match( descriptionText( DATASETS.jgb10, jgb ), /^レールの高さが、その週の10年国債の金利（利回り）です。長期金利の代表的な指標です。らせんを内側から外側へ、10年で1周しながら、1986年6月から/ );
	assert.equal(
		descriptionText( DATASETS.nikkei, NIKKEI_PERIOD ),
		'レールの高さが、その週の日経平均株価です。らせんを内側から外側へ、10年で1周しながら、1990年1月から2026年11月までの約37年を走り抜けます。'
	);

	// 終了年月は折り返さない部分として分かれている
	const parts = descriptionParts( DATASETS.nikkei, NIKKEI_PERIOD );
	assert.deepEqual( parts.filter( ( part ) => part.nowrap ).map( ( part ) => part.text ), [ '2026年11月', '約37年' ] );

	assert.deepEqual( chipTexts( DATASETS.usdjpy ), [ '高さ＝1ドルの円の値段', '高いほど円安' ] );
	assert.deepEqual( chipTexts( DATASETS.jgb10 ), [ '高さ＝10年国債の金利', '長期金利の代表的な指標' ] );
	assert.deepEqual( chipTexts( DATASETS.nikkei ), [ '高さ＝株価（週次終値）', '手元で取得したデータ' ] );

	assert.equal( loadingText( DATASETS.usdjpy ), '為替レートのデータを読み込んでいます' );
	assert.equal( loadingText( DATASETS.jgb10 ), '金利のデータを読み込んでいます' );
	assert.equal( loadingText( DATASETS.nikkei ), '株価のデータを読み込んでいます' );

	// 以前の山手線のコースと合成データの言い回しは残っていない
	for ( const def of Object.values( DATASETS ) ) {

		const all = [ descriptionText( def, usdjpy ), ...chipTexts( def ) ].join( '' );
		assert.ok( ! /山手線|一周|サンプル/.test( all ), def.id );

	}

} );

test( 'meta description と canvas の aria-label：データごと。静的な文言はデータによらない', () => {

	const usdjpy = periodOf( fixtures.usdjpy );
	const jgb = periodOf( fixtures.jgb10 );
	assert.equal( metaDescription( DATASETS.usdjpy, usdjpy ), '1971年からのドル円の為替レート（週次）をレールの高さにした、らせん形のジェットコースター。10年で1周し、円高と円安の波を一人称視点で体感できます。' );
	assert.equal( metaDescription( DATASETS.jgb10, jgb ), '1986年からの10年国債の金利（週次）をレールの高さにした、らせん形のジェットコースター。10年で1周し、金利の上げ下げを一人称視点で体感できます。' );
	assert.equal( metaDescription( DATASETS.nikkei, NIKKEI_PERIOD ), '1990年からの日経平均株価（週次終値）をレールの高さにした、らせん形のジェットコースター。10年で1周し、株価の上げ下げを一人称視点で体感できます。' );

	assert.equal( canvasLabel( DATASETS.usdjpy ), 'ドル円の為替レートをレールの高さにした、らせん形のジェットコースターの3D表示' );
	assert.equal( canvasLabel( DATASETS.nikkei ), '日経平均株価をレールの高さにした、らせん形のジェットコースターの3D表示' );

	assert.ok( ! /日経|山手線|1990/.test( BASE_DESCRIPTION ), 'データによらない言い回し' );

} );

test( '出典の一行：3種類のデータ（取得日つき）', () => {

	assert.equal(
		creditLine( DATASETS.usdjpy, METAS.usdjpy ),
		`データ：米連邦準備制度理事会（FRB）「H.10」（${formatDate( METAS.usdjpy.fetchedAt )}取得）　描画：three.js`
	);
	assert.equal(
		creditLine( DATASETS.jgb10, METAS.jgb10 ),
		`データ：財務省「国債金利情報」を加工して作成（${formatDate( METAS.jgb10.fetchedAt )}取得）　描画：three.js`
	);
	// すでに括弧で終わる短い形は、括弧を重ねない
	assert.equal(
		creditLine( DATASETS.nikkei, NIKKEI_META ),
		'データ：日本経済新聞社「日経平均株価」（手元で取得、2026年11月14日取得）　描画：three.js'
	);
	// 取得日がないときは短い形だけ
	assert.equal( creditLine( DATASETS.usdjpy, {} ), 'データ：米連邦準備制度理事会（FRB）「H.10」　描画：three.js' );
	assert.equal( creditLine( DATASETS.usdjpy, undefined ), 'データ：米連邦準備制度理事会（FRB）「H.10」　描画：three.js' );

} );

test( 'データの切り替えの href：data だけを差し替え、ほかのパラメータを保つ。既定のデータには data を付けない', () => {

	assert.equal( DEFAULT_DATASET, 'usdjpy' );
	assert.equal( datasetHref( '', 'usdjpy' ), './' );
	assert.equal( datasetHref( '', 'jgb10' ), '?data=jgb10' );
	assert.equal( datasetHref( '?data=jgb10', 'usdjpy' ), './' );
	assert.equal( datasetHref( '?data=jgb10', 'nikkei' ), '?data=nikkei' );
	assert.equal( datasetHref( '?debug', 'jgb10' ), '?debug&data=jgb10' );
	assert.equal( datasetHref( '?debug', 'usdjpy' ), '?debug' );
	assert.equal( datasetHref( '?debug&data=jgb10', 'usdjpy' ), '?debug' );
	assert.equal( datasetHref( '?data=nikkei&debug=1&x=a%20b', 'jgb10' ), '?debug=1&x=a%20b&data=jgb10' );
	// 古いリンクの ?data=local や知らない値も、差し替えで消える
	assert.equal( datasetHref( '?data=local', 'jgb10' ), '?data=jgb10' );
	assert.equal( datasetHref( '?mydata=1', 'jgb10' ), '?mydata=1&data=jgb10' );

} );

test( 'データの切り替えの項目：日経平均は、読み込めたときだけ', () => {

	const plain = dataSwitchItems( '', { currentId: 'usdjpy' } );
	assert.deepEqual( plain.map( ( item ) => item.id ), [ 'usdjpy', 'jgb10' ] );
	assert.deepEqual( plain.map( ( item ) => item.label ), [ 'ドル円', '国債金利' ] );
	assert.deepEqual( plain.map( ( item ) => item.current ), [ true, false ] );
	assert.deepEqual( plain.map( ( item ) => item.href ), [ './', '?data=jgb10' ] );

	const jgb = dataSwitchItems( '?data=jgb10&debug', { currentId: 'jgb10' } );
	assert.deepEqual( jgb.map( ( item ) => item.current ), [ false, true ] );
	assert.deepEqual( jgb.map( ( item ) => item.href ), [ '?debug', '?debug&data=jgb10' ] );

	// 日経平均を読み込めたとき：3つ目に足され、選ばれている
	const loaded = dataSwitchItems( '?data=nikkei', { currentId: 'nikkei', includeLocal: true } );
	assert.deepEqual( loaded.map( ( item ) => item.id ), [ 'usdjpy', 'jgb10', 'nikkei' ] );
	assert.deepEqual( loaded.map( ( item ) => item.current ), [ false, false, true ] );
	assert.equal( loaded[ 2 ].label, '日経平均' );

	// データが無くてエラーになったとき：2つだけで、どれも選んでいない。ドル円へ移れる
	const missing = dataSwitchItems( '?data=nikkei', { currentId: null } );
	assert.deepEqual( missing.map( ( item ) => item.id ), [ 'usdjpy', 'jgb10' ] );
	assert.ok( missing.every( ( item ) => ! item.current ) );
	assert.equal( missing[ 0 ].href, './' );

} );

test( '情報パネルのしくみ：データの名前・読み・目盛りの刻み。以前の山手線のコースの記述はない', () => {

	assert.equal( stepLabel( DATASETS.usdjpy ), '50円' );
	assert.equal( stepLabel( DATASETS.jgb10 ), '1%' );
	assert.equal( stepLabel( DATASETS.nikkei ), '1万円' );

	const usdjpy = mechanismParagraphs( DATASETS.usdjpy, 4 );
	assert.equal( usdjpy.length, 3 );
	assert.match( usdjpy[ 0 ], /^レールの高さはドル円の為替レートの週次の値です。値が大きいほど円安です。乗り心地をなめらかにするため、レールの形には4週の移動平均を使っています（画面の数値は実際の値です）。$/ );
	assert.match( usdjpy[ 1 ], /上から見て時計回り/ );
	assert.match( usdjpy[ 1 ], /10年で1周/ );
	assert.match( usdjpy[ 1 ], /北を向く線が年代の境目/ );
	assert.match( usdjpy[ 1 ], /「年代の輪」/ );
	assert.match( usdjpy[ 2 ], /西側に立つ目盛りの壁で、50円ごと/ );

	assert.match( mechanismParagraphs( DATASETS.jgb10, 4 )[ 0 ], /^レールの高さは10年国債の金利の週次の値です。乗り心地/ );
	assert.match( mechanismParagraphs( DATASETS.jgb10, 4 )[ 2 ], /1%ごと/ );
	assert.match( mechanismParagraphs( DATASETS.nikkei, 4 )[ 2 ], /1万円ごと/ );

	for ( const def of Object.values( DATASETS ) ) {

		assert.ok( ! /山手線|駅|連絡区間|大崎/.test( mechanismParagraphs( def, 4 ).join( '' ) ), def.id );

	}

} );

test( 'linkify：文中の URL をリンクの部品にする', () => {

	assert.deepEqual( linkify( '出典：A（https://example.com/a?x=1）を加工して作成' ), [
		{ text: '出典：A（' },
		{ text: 'https://example.com/a?x=1', href: 'https://example.com/a?x=1' },
		{ text: '）を加工して作成' }
	] );
	assert.deepEqual( linkify( 'URL なし' ), [ { text: 'URL なし' } ] );

} );

test( '情報パネルのデータ出典：ドル円と金利は、メタ情報の attribution・processing・取得日・利用条件', () => {

	for ( const id of [ 'usdjpy', 'jgb10' ] ) {

		const meta = METAS[ id ];
		const [ source, license, ...more ] = dataSourceItems( DATASETS[ id ], meta );
		assert.equal( more.length, 0, id );
		assert.equal( source.name, DATASETS[ id ].name );
		assert.ok( source.text.startsWith( meta.attribution ), `${id}：attribution をそのまま載せる` );
		assert.ok( source.text.includes( meta.processing ), `${id}：加工の内容` );
		assert.ok( source.text.includes( `${formatDate( meta.fetchedAt )}取得。` ), `${id}：取得日` );
		assert.ok( ! source.text.includes( 'リポジトリに含まれず' ), id );
		// 出典の URL はリンクになる（本文の中の URL）
		assert.ok( source.parts.some( ( part ) => part.href === meta.sourceUrl ), `${id}：出典ページのリンク` );
		assert.equal( source.parts.map( ( part ) => part.text ).join( '' ), source.text );

		assert.ok( license.text.startsWith( `利用条件：${meta.license}` ), id );
		assert.ok( license.parts.some( ( part ) => part.href === meta.licenseUrl ), `${id}：規約のリンク` );

	}

	assert.match( dataSourceItems( DATASETS.jgb10, METAS.jgb10 )[ 0 ].text, /加工して作成/, 'PDL1.0：加工して作成' );

} );

test( '情報パネルのデータ出典：日経平均は、手元で取得したデータである旨を添える', () => {

	const [ item ] = dataSourceItems( DATASETS.nikkei, NIKKEI_META );
	assert.equal( item.name, '日経平均株価' );
	assert.ok( item.text.startsWith( NIKKEI_META.attribution ) );
	assert.match( item.text, /週次値は各週の最終営業日の終値です。/ );
	assert.match( item.text, /2026年11月14日取得。/ );
	assert.match( item.text, /このデータはリポジトリに含まれず、手元で取得したものを表示しています。$/ );
	// attribution に URL が無いので、出典ページのリンクを添える
	assert.ok( item.parts.some( ( part ) => part.href === NIKKEI_META.sourceUrl && part.text === '出典ページ' ) );
	assert.equal( dataSourceItems( DATASETS.nikkei, NIKKEI_META ).length, 1, '利用条件の行はメタ情報に license があるときだけ' );

	// attribution の無い古いメタ情報（source と via）でも、出典を組み立てる
	const [ legacy ] = dataSourceItems( DATASETS.nikkei, NIKKEI_LEGACY_META );
	assert.match( legacy.text, /^出典：日本経済新聞社「日経平均株価」（©日本経済新聞社）（米セントルイス連邦準備銀行 FRED（系列 NIKKEI225） 経由）。/ );
	assert.match( legacy.text, /リポジトリに含まれず、手元で取得した/ );

} );

test( '情報パネルのしくみ：年代の境目の例は、そのデータの最初の 2 つの境目の年から作る（1980 年の境目がないデータに 1980 年と書かない）', () => {

	assert.equal( decadeExamples( [ 1980, 1990, 2000 ] ), '（1980年1月、1990年1月…）' );
	assert.equal( decadeExamples( [ { year: 1990, progress: 0 }, { year: 2000, progress: 0.3 }, { year: 2010, progress: 0.6 } ] ), '（1990年1月、2000年1月…）' );
	assert.equal( decadeExamples( [ 1990 ] ), '（1990年1月）' );
	assert.equal( decadeExamples( [] ), '' );
	assert.equal( decadeExamples( undefined ), '' );

	// 実際の螺旋（TrackCurve）の境目から。ドル円は 1971 年始まり、10年国債の金利は 1986 年始まり、日経平均は 1990 年始まり
	const { usdjpy, jgb10 } = loadFixtures();
	const sets = { usdjpy, jgb10, nikkei: series1990() };
	const expected = { usdjpy: '（1980年1月、1990年1月…）', jgb10: '（1990年1月、2000年1月…）', nikkei: '（1990年1月、2000年1月…）' };
	for ( const [ id, raw ] of Object.entries( sets ) ) {

		const dataset = buildDataset( raw, 4, undefined, DATASETS[ id ] );
		const boundaries = new TrackCurve( dataset.smoothed ).decadeBoundaries();
		const text = mechanismParagraphs( DATASETS[ id ], 4, boundaries )[ 1 ];
		assert.ok( text.includes( `北を向く線が年代の境目${expected[ id ]}で、俯瞰すると` ), `${id}：${text}` );
		if ( id !== 'usdjpy' ) assert.ok( ! text.includes( '1980' ), `${id} に 1980 年の境目はない` );

	}

	// 境目を渡さないとき（古い呼び方）も文が崩れない
	assert.ok( mechanismParagraphs( DATASETS.usdjpy, 4 )[ 1 ].includes( '北を向く線が年代の境目で、俯瞰すると' ) );

} );

test( '出来事の出典の段落：件数が 1 以上のときだけ。sources があればその一覧、なければ source の URL のホスト名', () => {

	const events = [
		{ date: '2008-09-15', source: 'https://www.boj.or.jp/a.pdf' },
		{ date: '2011-03-15', source: 'https://www.fsa.go.jp/b.html' },
		{ date: '2013-04-04', source: 'https://www.boj.or.jp/c.pdf' }
	];

	assert.equal( eventsSourceItem( [], undefined ), null );
	assert.equal( eventsSourceItem( undefined, undefined ), null );

	const hosts = eventsSourceItem( events );
	assert.equal( hosts.text, '出来事の日付と内容：www.boj.or.jp、www.fsa.go.jp' );
	assert.deepEqual( hosts.parts.filter( ( part ) => part.href ).map( ( part ) => part.href ), [ 'https://www.boj.or.jp/a.pdf', 'https://www.fsa.go.jp/b.html' ] );

	const named = eventsSourceItem( events, [ 'FRB H.10', { name: '財務省「国債金利情報」', url: 'https://www.mof.go.jp/' }, '日本銀行の公表資料' ] );
	assert.equal( named.text, '出来事の日付と内容：FRB H.10、財務省「国債金利情報」、日本銀行の公表資料' );
	assert.deepEqual( named.parts.filter( ( part ) => part.href ).map( ( part ) => part.href ), [ 'https://www.mof.go.jp/' ] );

	// source が読めない出来事だけのときは、段落を出さない
	assert.equal( eventsSourceItem( [ { date: '2008-09-15' }, { date: '2009-01-01', source: 'x' } ] ), null );

} );

test( 'エラーの文言は種類ごとに揃っている。合成データ（サンプル）の言い回しは使わない', () => {

	for ( const kind of [ 'data', 'local', 'webgl', 'file', 'boot' ] ) {

		const text = ERROR_TEXTS[ kind ];
		assert.ok( text.title && text.body, kind );
		assert.equal( typeof text.reload, 'boolean', kind );
		assert.ok( ! /サンプル/.test( text.title + text.body ), kind );

	}

	assert.equal( ERROR_TEXTS.local.title, '日経平均株価のデータがありません' );
	assert.match( ERROR_TEXTS.local.body, /npm run fetch-nikkei/ );
	assert.match( ERROR_TEXTS.local.body, /上の切り替え/ );
	assert.equal( ERROR_TEXTS.local.reload, true );
	assert.equal( ERROR_TEXTS.webgl.reload, false );
	assert.equal( ERROR_TEXTS.data.reload, true );

} );

test( 'index.html：フォールバックの文言は ERROR_TEXTS と同じ。静的な title・meta・OGP はデータによらない。切り替えの枠がある', () => {

	const html = readFileSync( new URL( '../index.html', import.meta.url ), 'utf8' );
	for ( const kind of [ 'boot', 'file' ] ) {

		assert.ok( html.includes( ERROR_TEXTS[ kind ].title ), `${kind} の見出し` );
		assert.ok( html.includes( ERROR_TEXTS[ kind ].body ), `${kind} の本文` );

	}

	assert.ok( html.includes( `<meta name="description" content="${BASE_DESCRIPTION}">` ), 'meta description' );
	assert.ok( html.includes( `<meta property="og:description" content="${BASE_DESCRIPTION}">` ), 'og:description' );
	assert.ok( html.includes( '<title>為替と金利の 3Dジェットコースター</title>' ) );
	assert.ok( html.includes( '<meta property="og:title" content="為替と金利の 3Dジェットコースター">' ) );
	assert.match( html, /<meta property="og:image:alt" content="らせん形のレール/ );
	assert.ok( ! /山手線|大崎|外回り|連絡区間|駅データ|サンプル|start-sample/.test( html ) );

	// 切り替え：nav の名前、リンクの組
	assert.match( html, /<nav id="start-data" class="start-data" aria-labelledby="start-data-label">/ );
	assert.match( html, /<a href="\.\/" data-dataset-id="usdjpy" aria-current="page">/ );
	assert.match( html, /<a href="\?data=jgb10" data-dataset-id="jgb10">/ );
	assert.ok( ! html.includes( 'data-dataset-id="nikkei"' ), '日経平均の項目は HTML に書かない（JS が、読み込めたときだけ足す）' );
	for ( const id of [ 'start-btn', 'start-screen', 'start-error', 'start-info-btn', 'info-sources', 'info-mechanism' ] ) {

		assert.ok( html.includes( `id="${id}"` ), id );

	}

} );
