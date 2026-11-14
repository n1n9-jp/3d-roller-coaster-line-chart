// 終了画面の要約（DOM に依存しない純粋な関数）。
// 入力は生データ（dataset.raw）：{ date: 'YYYY-MM-DD', close: number } の配列（古い順）。
// 値の書式は dataset.format（format.js）。表示値は生データの値（レール用の移動平均後の値は使わない）。

import { SPIRAL } from './config.js';
import { formatWeek, formatYearMonth, parseDate } from './format.js';
import { formatCaption } from './events-data.js';

// 「1,923週分」の途中（数と「週」の間、「週」と「分」の間）で行を折り返さない（幅のない文字）
export const WORD_JOINER = '\u2060';

const DAY_MS = 86400000;
const YEAR_DAYS = 365.2425;

/**
 * 系列の要約。最高値と最安値は、同じ値が複数あるときは最初の週を採る。
 * 系列が空なら null。
 * turns：螺旋を回った周数（最初の週から最後の週までの年数 ÷ 1 周の年数）。
 */
export function summarize( raw ) {

	if ( ! Array.isArray( raw ) || raw.length === 0 ) return null;

	let max = raw[ 0 ];
	let min = raw[ 0 ];
	for ( const point of raw ) {

		if ( point.close > max.close ) max = point;
		if ( point.close < min.close ) min = point;

	}

	const first = raw[ 0 ];
	const last = raw[ raw.length - 1 ];
	const days = ( Date.parse( `${last.date}T00:00:00Z` ) - Date.parse( `${first.date}T00:00:00Z` ) ) / DAY_MS;

	return {
		weeks: raw.length,
		first,
		last,
		max,
		min,
		startLabel: formatYearMonth( first.date ),
		endLabel: formatYearMonth( last.date ),
		endYear: parseDate( last.date ).year,
		turns: days / YEAR_DAYS / SPIRAL.yearsPerTurn
	};

}

/**
 * 走行で最後に通った出来事（位置が progress 以下の出来事のうち、いちばん後ろのもの）。なければ null。
 * events は 'eventsready' の payload の events（progress と valueText を持つ）。終点（progress 1）では、一覧の最後の出来事。
 */
export function lastPassedEvent( events, progress = 1 ) {

	let found = null;
	for ( const event of Array.isArray( events ) ? events : [] ) {

		if ( event.progress <= progress + 1e-9 && ( found === null || event.progress >= found.progress ) ) found = event;

	}

	return found;

}

/** 終了画面の「最後に通った出来事」の文言：{ label, heading, value }。出来事がなければ null。value は値を出さない出来事で null。 */
export function lastEventTexts( event ) {

	if ( ! event ) return null;
	const caption = formatCaption( event );
	return { label: '最後に通った出来事', heading: caption.heading, value: caption.value };

}

/**
 * 要約から、終了画面に出す文言をまとめる。
 * dataset：{ def, format }（data.js の buildDataset の戻り値）。
 */
export function summaryTexts( summary, dataset ) {

	const { def, format } = dataset;
	const stat = ( label, point ) => ( { label, value: format.number( point.close ), unit: format.unit, date: formatWeek( point.date ) } );
	const overall = format.overall( summary.last.close, summary.first.close );

	return {
		title: `${summary.endLabel}に到着しました`,
		lead: `${summary.startLabel}から、らせんを約${summary.turns.toFixed( 1 )}周、${summary.weeks.toLocaleString( 'en-US' )}${WORD_JOINER}週${WORD_JOINER}分の${def.name}を走りました。`,
		stats: {
			first: stat( '最初の週', summary.first ),
			last: stat( '最後の週', summary.last ),
			max: stat( def.statLabels.max, summary.max ),
			min: stat( def.statLabels.min, summary.min )
		},
		change: `最初の週と比べて ${overall.text}`,
		changeDirection: overall.direction,
		restartLabel: `${summary.startLabel}からもう一度乗る`
	};

}
