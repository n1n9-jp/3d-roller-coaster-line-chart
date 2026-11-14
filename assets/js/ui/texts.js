// スタート画面と情報パネルの文言を作る純粋な関数（DOM に触れない。node:test で確かめる）。
// 期間・年数・出典は、データ（dataset.raw と dataset.meta）から作る。データの名前・単位・チップ・出典の短い形は
// config.js の DATASETS（dataset.def）から取り、ここにあるのは、そこに置かない言い回しだけ。値の直書きはしない。

import { DATASETS, DEFAULT_DATASET } from '../config.js';

/** 'YYYY-MM-DD' を { y, m, d } にする。 */
export function parseYMD( text ) {

	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec( String( text ) );
	if ( ! match ) throw new Error( `日付の形式が正しくありません：${text}` );
	return { y: Number( match[ 1 ] ), m: Number( match[ 2 ] ), d: Number( match[ 3 ] ) };

}

/** '2025-12-29' → '2025年12月' */
export function formatYearMonth( text ) {

	const { y, m } = parseYMD( text );
	return `${y}年${m}月`;

}

/** '2026-11-14' → '2026年11月14日'。読み取れない文字列はそのまま返す。 */
export function formatDate( text ) {

	try {

		const { y, m, d } = parseYMD( text );
		return `${y}年${m}月${d}日`;

	} catch {

		return String( text );

	}

}

/**
 * 系列（{ date, close } の配列。日付の昇順）から、表示に使う期間を作る。
 * years は最初の週から最後の週までの年数（四捨五入、最小 1）。
 */
export function periodOf( series ) {

	const first = series[ 0 ].date;
	const last = series[ series.length - 1 ].date;
	const a = parseYMD( first );
	const b = parseYMD( last );
	const days = ( Date.UTC( b.y, b.m - 1, b.d ) - Date.UTC( a.y, a.m - 1, a.d ) ) / 86400000;

	return {
		startYear: `${a.y}年`,
		startLabel: formatYearMonth( first ),
		endLabel: formatYearMonth( last ),
		years: Math.max( 1, Math.round( days / 365.25 ) )
	};

}

// ---- データごとの言い回し（config.js の DATASETS に無いもの） ----

const DATASET_TEXTS = {
	usdjpy: {
		lead: 'レールの高さが、その週の1ドルあたりの円の値段です。高いほど円安、低いほど円高です。',
		loading: '為替レートのデータを読み込んでいます',
		metaSubject: 'ドル円の為替レート（週次）',
		metaWave: '円高と円安の波',
		reading: '値が大きいほど円安です。'
	},
	jgb10: {
		lead: 'レールの高さが、その週の10年国債の金利（利回り）です。長期金利の代表的な指標です。',
		loading: '金利のデータを読み込んでいます',
		metaSubject: '10年国債の金利（週次）',
		metaWave: '金利の上げ下げ',
		reading: ''
	},
	nikkei: {
		lead: 'レールの高さが、その週の日経平均株価です。',
		loading: '株価のデータを読み込んでいます',
		metaSubject: '日経平均株価（週次終値）',
		metaWave: '株価の上げ下げ',
		reading: ''
	}
};

function textsOf( def ) {

	return DATASET_TEXTS[ def?.id ] ?? {
		lead: `レールの高さが、その週の${def?.name ?? '値'}です。`,
		loading: 'データを読み込んでいます',
		metaSubject: `${def?.name ?? ''}（週次）`,
		metaWave: '値の上げ下げ',
		reading: ''
	};

}

export const TITLE_SUFFIX = '3Dジェットコースター';

/** タイトルの2行（<h1> の2つの span）。 */
export function titleParts( def ) {

	return [ def.name, TITLE_SUFFIX ];

}

/** document.title */
export function documentTitle( def ) {

	return `${def.name} ${TITLE_SUFFIX}`;

}

export function kickerText( period ) {

	return `${period.startLabel}〜${period.endLabel}`;

}

/** 説明文を、途中で折り返したくない部分（終了年月）で区切った配列にする。{ text, nowrap? } */
export function descriptionParts( def, period ) {

	return [
		{ text: `${textsOf( def ).lead}らせんを内側から外側へ、10年で1周しながら、${period.startLabel}から` },
		{ text: period.endLabel, nowrap: true },
		{ text: 'までの' },
		{ text: `約${period.years}年`, nowrap: true },
		{ text: 'を走り抜けます。' }
	];

}

export function descriptionText( def, period ) {

	return descriptionParts( def, period ).map( ( part ) => part.text ).join( '' );

}

/** チップ（2つ）。 */
export function chipTexts( def ) {

	return [ ...def.chips ];

}

/** 読み込み中の状態テキスト（#start-message）。 */
export function loadingText( def ) {

	return textsOf( def ).loading;

}

/** 出典の一行（スタート画面の下端）。「データ」と「描画」のあいだは全角空白（CREDIT_SEPARATOR）。 */
export const CREDIT_SEPARATOR = '　';

export function creditLine( def, meta ) {

	const short = def.creditShort;
	let source = short;
	if ( meta?.fetchedAt ) {

		const date = `${formatDate( meta.fetchedAt )}取得`;
		// 出典の短い形がすでに括弧で終わるとき（手元で取得）は、括弧を重ねず、その中に足す
		source = short.endsWith( '）' ) ? `${short.slice( 0, - 1 )}、${date}）` : `${short}（${date}）`;

	}

	return `データ：${source}${CREDIT_SEPARATOR}描画：three.js`;

}

/** HTML に静的に書く meta description と og:description（クローラーは JavaScript を実行しないので、データによらない）。 */
export const BASE_DESCRIPTION = 'ドル円の為替レートと10年国債の金利を、レールの高さにしたらせん形のジェットコースター。10年で1周し、年代ごとの上げ下げを一人称視点で体感できます。';

/** 選んだデータの meta description。 */
export function metaDescription( def, period ) {

	const t = textsOf( def );
	return `${period.startYear}からの${t.metaSubject}をレールの高さにした、らせん形のジェットコースター。10年で1周し、${t.metaWave}を一人称視点で体感できます。`;

}

/** 3D の canvas の aria-label。 */
export function canvasLabel( def ) {

	return `${def.name}をレールの高さにした、らせん形のジェットコースターの3D表示`;

}

// ---- データの切り替え（スタート画面） ----

/**
 * いまの URL の検索部（'?debug&data=jgb10' など）の data だけを差し替えた href を作る。ほかのパラメータはそのまま残す。
 * 既定のデータのときは data を付けない。ほかに何も無ければ './'。
 */
export function datasetHref( search, id ) {

	const kept = String( search ?? '' ).replace( /^\?/, '' ).split( '&' )
		.filter( ( pair ) => pair !== '' && pair.split( '=' )[ 0 ] !== 'data' );
	if ( id !== DEFAULT_DATASET ) kept.push( `data=${id}` );
	return kept.length > 0 ? `?${kept.join( '&' )}` : './';

}

/**
 * 切り替えの項目。同梱のデータは常に出す。手元だけのデータ（日経平均）は、読み込めたとき（includeLocal）だけ。
 * currentId が null のとき（日経平均のデータが無くてエラーになったとき）は、どれも選んでいない状態になる。
 * 戻り値：[ { id, label, href, current } ]
 */
export function dataSwitchItems( search, { currentId = null, includeLocal = false } = {} ) {

	return Object.values( DATASETS )
		.filter( ( def ) => ! def.localOnly || includeLocal )
		.map( ( def ) => ( {
			id: def.id,
			label: def.short,
			href: datasetHref( search, def.id ),
			current: def.id === currentId
		} ) );

}

// ---- 情報パネル ----

/** 目盛りの刻みの言い方：50円、1%、1万円。 */
export function stepLabel( def ) {

	if ( def.unit === '%' ) return `${def.step}%`;
	if ( def.step >= 10000 && def.step % 10000 === 0 ) return `${def.step / 10000}万円`;
	return `${def.step}${def.unit}`;

}

/**
 * 年代の境目の例：そのデータの最初の 2 つの境目の年から「（1980年1月、1990年1月…）」を作る。
 * boundaries：年の配列（ctx.curve.decadeBoundaries() の year）。境目がないときは空文字、1 つだけのときは「（1990年1月）」。
 */
export function decadeExamples( boundaries ) {

	const years = ( Array.isArray( boundaries ) ? boundaries : [] ).slice( 0, 2 ).map( ( b ) => `${typeof b === 'number' ? b : b?.year}年1月` );
	if ( years.length === 0 ) return '';
	return `（${years.join( '、' )}${years.length === 2 ? '…' : ''}）`;

}

/**
 * 「しくみ」の段落（3つ）。windowWeeks は移動平均の週数。
 * boundaries：年代の境目（ctx.curve.decadeBoundaries() の戻り値、または年の配列）。データごとに最初の境目の年が違う
 * （ドル円は 1980 年、10年国債の金利は 1990 年、日経平均は 1990 年）ので、ここから文言を作る。
 */
export function mechanismParagraphs( def, windowWeeks, boundaries = [] ) {

	const t = textsOf( def );
	return [
		`レールの高さは${def.name}の週次の値です。${t.reading}乗り心地をなめらかにするため、レールの形には${windowWeeks}週の移動平均を使っています（画面の数値は実際の値です）。`,
		`コースは、上から見て時計回りに、内側から外側へ広がるらせんです。10年で1周するので、どの周でも同じ向きが同じ時期を表します。北を向く線が年代の境目${decadeExamples( boundaries )}で、俯瞰すると年代が同心の輪として並びます。右下の「年代の輪」は、上から見たらせんと現在位置の図で、北の線の上の数字が年代の境目です。`,
		`高さの目盛りは、一人称ではレールの脇の線、俯瞰では西側に立つ目盛りの壁で、${stepLabel( def )}ごとに引いています。`
	];

}

const URL_PATTERN = /https?:\/\/[^\s）)、。」]+/g;

/** 文中の URL をリンクの部品に分ける。[ { text, href? } ] */
export function linkify( text ) {

	const parts = [];
	let last = 0;
	for ( const match of String( text ).matchAll( URL_PATTERN ) ) {

		if ( match.index > last ) parts.push( { text: text.slice( last, match.index ) } );
		parts.push( { text: match[ 0 ], href: match[ 0 ] } );
		last = match.index + match[ 0 ].length;

	}

	if ( last < text.length ) parts.push( { text: text.slice( last ) } );
	return parts;

}

function sentence( text ) {

	const trimmed = String( text ).trim();
	return /[。．.！？]$/.test( trimmed ) ? trimmed : `${trimmed}。`;

}

export const LOCAL_DATA_NOTE = 'このデータはリポジトリに含まれず、手元で取得したものを表示しています。';

/** attribution が無い古いメタ情報（data/local/meta.json）のときの出典表記。 */
function fallbackAttribution( def, meta ) {

	const source = meta?.source ?? meta?.label ?? def.name;
	const via = meta?.via ? `（${/^FRED/.test( meta.via ) ? `米セントルイス連邦準備銀行 ${meta.via}` : meta.via} 経由）` : '';
	const copyright = def.id === 'nikkei' ? '（©日本経済新聞社）' : '';
	return `出典：${source}${copyright}${via}`;

}

/**
 * 情報パネル「データ出典」の、データの出どころの段落。
 * 各要素は { name?, parts, text }。parts は [ { text, href? } ]（href があればリンク）、text は parts をつないだ文字列。
 * 1つ目は出典・加工・取得日（手元のデータはその旨）、2つ目は利用条件（メタ情報に license があるとき）。
 */
export function dataSourceItems( def, meta ) {

	const parts = [];
	const attribution = meta?.attribution ? meta.attribution : fallbackAttribution( def, meta );
	parts.push( ...linkify( sentence( attribution ) ) );

	// 出典ページの URL が出典表記の中に無いときは、リンクを添える
	if ( meta?.sourceUrl && ! attribution.includes( meta.sourceUrl ) ) {

		parts.push( { text: ' ' }, { text: '出典ページ', href: meta.sourceUrl } );

	}

	let rest = '';
	const processing = meta?.processing ?? ( def.id === 'nikkei' ? '週次値は各週の最終営業日の終値です。' : '' );
	if ( processing ) rest += sentence( processing );
	if ( meta?.fetchedAt ) rest += `${formatDate( meta.fetchedAt )}取得。`;
	if ( def.localOnly ) rest += LOCAL_DATA_NOTE;
	if ( rest ) parts.push( ...linkify( ` ${rest}` ) );

	const items = [ { name: def.name, parts } ];

	if ( meta?.license ) {

		const licenseParts = [ { text: `利用条件：${meta.license}` } ];
		if ( meta.licenseUrl ) licenseParts.push( { text: ' ' }, { text: '規約のページ', href: meta.licenseUrl } );
		items.push( { parts: licenseParts } );

	}

	return items.map( ( item ) => ( { ...item, text: item.parts.map( ( part ) => part.text ).join( '' ) } ) );

}

function hostOf( url ) {

	try {

		return new URL( url ).hostname;

	} catch {

		return null;

	}

}

/**
 * 出来事の日付と内容の出典の段落（キャプションの値は同梱データから引くので、値の出典ではない）。出来事が 1 件も無いとき、出典が分からないときは null。
 * sources：'eventsready' の payload の sources（文字列、または { name, url }）。なければ、各出来事の source（URL）のホスト名を、
 * 重複なく並べる。戻り値は dataSourceItems の要素と同じ形。
 */
export function eventsSourceItem( events, sources ) {

	if ( ! Array.isArray( events ) || events.length === 0 ) return null;

	const entries = [];
	if ( Array.isArray( sources ) && sources.length > 0 ) {

		for ( const source of sources ) {

			if ( typeof source === 'string' ) {

				const host = /^https?:\/\//.test( source ) ? hostOf( source ) : null;
				entries.push( host ? { text: host, href: source } : { text: source } );

			} else if ( source && ( source.name || source.label || source.text ) ) {

				entries.push( { text: source.name ?? source.label ?? source.text, href: source.url ?? source.href } );

			}

		}

	} else {

		const seen = new Set();
		for ( const event of events ) {

			const url = event?.source ?? event?.raw?.source;
			const host = typeof url === 'string' ? hostOf( url ) : null;
			if ( ! host || seen.has( host ) ) continue;
			seen.add( host );
			entries.push( { text: host, href: url } );

		}

	}

	if ( entries.length === 0 ) return null;

	const parts = [ { text: '出来事の日付と内容：' } ];
	entries.forEach( ( entry, i ) => {

		if ( i > 0 ) parts.push( { text: '、' } );
		parts.push( entry.href ? { text: entry.text, href: entry.href } : { text: entry.text } );

	} );
	return { parts, text: parts.map( ( part ) => part.text ).join( '' ) };

}

/** 起動の失敗の種類ごとの表示。reload は「再読み込み」ボタンを出すか。 */
export const ERROR_TEXTS = {
	data: {
		title: 'データを読み込めませんでした',
		body: '通信状況を確認して、ページを再読み込みしてください。',
		reload: true
	},
	// ?data=nikkei で手元のデータが無いとき（main.js は LocalDataMissingError でこの種類を使う）
	local: {
		title: '日経平均株価のデータがありません',
		body: '手元で npm run fetch-nikkei を実行すると選べます。ほかのデータは、上の切り替えから選べます。',
		reload: true
	},
	webgl: {
		title: '3D表示を利用できません',
		body: 'お使いのブラウザまたは端末では WebGL が無効か、対応していません。別のブラウザか端末でお試しください。',
		reload: false
	},
	file: {
		title: 'ページを開けませんでした',
		body: 'このページはファイルを直接開くと動きません。README の手順でローカルサーバーから開いてください。',
		reload: false
	},
	boot: {
		title: '起動中に問題が起きました',
		body: 'ページを再読み込みしてください。解決しないときは、別のブラウザでお試しください。',
		reload: true
	}
};
