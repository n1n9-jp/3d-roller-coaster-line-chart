// スタート画面と情報パネルの文言を作る純粋な関数（DOM に触れない。node:test で確かめる）。
// 期間・年数・出典は、データ（dataset.raw と dataset.meta）から作る。値の直書きはしない。

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

export function kickerText( period ) {

	return `${period.startLabel}〜${period.endLabel}`;

}

/** 説明文を、途中で折り返したくない部分（終了年月）で区切った配列にする。{ text, nowrap? } */
export function descriptionParts( period ) {

	return [
		{ text: `レールの高さが、その週の日経平均株価です。山手線を一周するあいだに、${period.startYear}から` },
		{ text: period.endLabel, nowrap: true },
		{ text: `までの約${period.years}年を走り抜けます。` }
	];

}

export function descriptionText( period ) {

	return descriptionParts( period ).map( ( part ) => part.text ).join( '' );

}

export function chipTexts( period ) {

	return [ '高さ＝株価（週次終値）', `一周＝${period.startYear}→${period.endLabel}` ];

}

export const SAMPLE_NOTE = 'サンプルデータ（実際の日経平均ではありません）';

/** 出典の一行（スタート画面の下端）。「データ」と「描画」のあいだは全角空白（CREDIT_SEPARATOR）。 */
export const CREDIT_SEPARATOR = '　';

export function creditLine( meta ) {

	if ( meta?.kind !== 'real' ) {

		return `データ：${SAMPLE_NOTE}${CREDIT_SEPARATOR}描画：three.js`;

	}

	const source = meta.source ?? meta.label ?? '日経平均株価';
	const detail = [];
	if ( meta.via ) detail.push( `${meta.via} 経由` );
	if ( meta.fetchedAt ) detail.push( `${formatDate( meta.fetchedAt )}取得` );
	const paren = detail.length > 0 ? `（${detail.join( '、' )}）` : '';
	return `データ：${source}${paren}${CREDIT_SEPARATOR}描画：three.js`;

}

export const BASE_DESCRIPTION = '1990年からの日経平均株価（週次終値）をレールの高さにした、山手線一周のジェットコースター。株価の上げ下げを一人称視点で体感できます。';

/** meta description。サンプルデータのときは末尾に断り書きを付ける（仕様 1-4）。 */
export function metaDescription( kind ) {

	return kind === 'sample' ? `${BASE_DESCRIPTION}（表示はサンプルデータです）` : BASE_DESCRIPTION;

}

export const CANVAS_LABEL = '日経平均株価をレールの高さにしたジェットコースターの3D表示';

/**
 * 情報パネル「データ出典」の、データの出どころの段落。
 * 各要素は { text, link?: { href, label } }。
 */
export function dataSourceItems( meta ) {

	if ( meta?.kind !== 'real' ) {

		return [ { text: '同梱のデータはサンプル（合成）で、実際の日経平均株価ではありません。実データで動かす手順は README を参照してください。' } ];

	}

	const source = meta.source ?? meta.label ?? '日経平均株価';
	let text = `日経平均株価：${source}（©日本経済新聞社）。`;
	if ( meta.via ) {

		// README の出典表記に合わせる（FRED は米セントルイス連邦準備銀行のデータベース）
		const via = /^FRED/.test( meta.via ) ? `米セントルイス連邦準備銀行 ${meta.via}` : meta.via;
		text += `${via}経由で取得`;
		text += meta.fetchedAt ? `（${formatDate( meta.fetchedAt )}取得）。` : '。';

	} else if ( meta.fetchedAt ) {

		text += `${formatDate( meta.fetchedAt )}取得。`;

	}

	text += '週次値は各週の最終営業日の終値です。';

	const item = { text };
	if ( meta.sourceUrl ) item.link = { href: meta.sourceUrl, label: '出典ページ' };
	return [ item ];

}

/** 起動の失敗の種類ごとの表示。reload は「再読み込み」ボタンを出すか。 */
export const ERROR_TEXTS = {
	data: {
		title: 'データを読み込めませんでした',
		body: '通信状況を確認して、ページを再読み込みしてください。',
		reload: true
	},
	local: {
		title: '実データがまだありません',
		body: 'npm run fetch-data を実行してから、再読み込みしてください。（URL の ?data=local を外すとサンプルデータで動きます）',
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
