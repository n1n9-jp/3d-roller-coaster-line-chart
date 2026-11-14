// 主要な出来事の読み込み、系列上の位置の計算、キャプションを出す順番の制御。
// DOM と three.js には依存しない（Node でそのままテストできる）。
//
// 出来事の一覧はデータごと（config.js の DATASETS[ id ].eventsUrl = data/events/<id>.json）。選んだデータの分だけ読む。
// ファイルには日付・見出し・補足・出所だけを書き、値は書かない。キャプションの「当時 ○○」は、
// その出来事の日付を含む週の、表示中のデータの値（dataset.raw）を dataset.format.value で書式にして出す
// （現在値の帯・ミニグラフと必ず一致する）。
//
// ctx.events へは、読み込みが終わったときに一度だけ 'eventsready' を発行する（0 件、失敗、ファイルなしのときも空の配列で）：
//   { events: [ { date, index, progress, title, note, value, valueText } ], sources: [ 出所のホスト名 ] }
// index は系列（dataset.raw）上の位置（小数）、progress は ctx.curve.dateToProgress( date )。
// value は週の値（数値）、valueText は書式にした文字列（'157.88円'）。値を出さない出来事（showValue: false、
// データのない週）は両方 null。

import { ANNOT, DATASETS, maxProgressPerFrame, SPEED } from './config.js';
import { dateToIndex } from './data.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const URL_PATTERN = /^https?:\/\/[^\s/$.?#][^\s]*$/;
const DAY_MS = 86400000;

/** 見出しと補足の長さの上限（文字数）。画面の 1〜2 行に収めるための目安。 */
export const TITLE_MAX = 20;
export const NOTE_MAX = 40;

function isValidDate( value ) {

	if ( typeof value !== 'string' || ! DATE_PATTERN.test( value ) ) return false;
	const time = Date.parse( `${value}T00:00:00Z` );
	return ! Number.isNaN( time ) && new Date( time ).toISOString().startsWith( value );

}

/** 出来事 1 件の形式の誤りを、日本語の文のリストで返す（空なら正しい）。 */
export function validateEvent( event ) {

	const errors = [];
	if ( ! event || typeof event !== 'object' ) return [ '項目がオブジェクトではありません' ];

	if ( ! isValidDate( event.date ) ) errors.push( `date が YYYY-MM-DD ではありません：${event.date}` );
	if ( typeof event.title !== 'string' || event.title.length === 0 ) errors.push( 'title がありません' );
	else if ( [ ...event.title ].length > TITLE_MAX ) errors.push( `title が ${TITLE_MAX} 字を超えています：${event.title}` );
	if ( typeof event.note !== 'string' || event.note.length === 0 ) errors.push( 'note がありません' );
	else if ( [ ...event.note ].length > NOTE_MAX ) errors.push( `note が ${NOTE_MAX} 字を超えています：${event.note}` );
	if ( event.showValue !== undefined && typeof event.showValue !== 'boolean' ) errors.push( `showValue が真偽値ではありません：${event.showValue}` );
	if ( typeof event.source !== 'string' || ! URL_PATTERN.test( event.source ) ) errors.push( `source が URL ではありません：${event.source}` );
	return errors;

}

/** 一覧全体の形式の誤り（項目ごとの誤りに加えて、日付の昇順と重複）。空なら正しい。 */
export function validateEvents( list ) {

	if ( ! Array.isArray( list ) ) return [ '一覧が配列ではありません' ];

	const errors = [];
	list.forEach( ( event, i ) => {

		for ( const message of validateEvent( event ) ) errors.push( `#${i + 1}：${message}` );

	} );

	for ( let i = 1; i < list.length; i ++ ) {

		const a = list[ i - 1 ]?.date;
		const b = list[ i ]?.date;
		if ( typeof a === 'string' && typeof b === 'string' && a >= b ) errors.push( `#${i + 1}：日付が昇順ではありません（${a} の次が ${b}）` );

	}

	return errors;

}

/**
 * 日付を含む週の行（週の月曜日付 <= date の最後の行）の添字。その行が 7 日より前（週が抜けている）なら null。
 */
export function weekRowIndex( series, date ) {

	let lo = 0;
	let hi = series.length - 1;
	let found = - 1;
	while ( lo <= hi ) {

		const mid = ( lo + hi ) >> 1;
		if ( series[ mid ].date <= date ) {

			found = mid;
			lo = mid + 1;

		} else hi = mid - 1;

	}

	if ( found < 0 ) return null;
	const days = ( Date.parse( `${date}T00:00:00Z` ) - Date.parse( `${series[ found ].date}T00:00:00Z` ) ) / DAY_MS;
	return days < 7 ? found : null;

}

/**
 * 出来事の一覧に、系列上の位置・progress・週の値を付ける。データの範囲（先頭の週〜最後の週）の外の出来事は除く。
 * 形式が正しくない項目も除く（読み込み側で警告を出す）。progress の昇順で返す。
 * @param dataset buildDataset の戻り値（raw と format を使う）
 * @param dateToProgress 日付 → progress（ctx.curve.dateToProgress）
 */
export function resolveEvents( dataset, dateToProgress, list ) {

	const series = dataset.raw;
	const first = series[ 0 ].date;
	const last = series[ series.length - 1 ].date;
	const result = [];

	for ( const event of Array.isArray( list ) ? list : [] ) {

		if ( validateEvent( event ).length > 0 ) continue;
		if ( event.date < first || event.date > last ) continue;

		const row = event.showValue === false ? null : weekRowIndex( series, event.date );
		const value = row === null ? null : series[ row ].close;
		result.push( {
			date: event.date,
			index: dateToIndex( dataset, event.date ),
			progress: dateToProgress( event.date ),
			title: event.title,
			note: event.note,
			value,
			valueText: value === null ? null : dataset.format.value( value ),
			source: event.source
		} );

	}

	return result.sort( ( a, b ) => a.progress - b.progress );

}

/** 出所の URL のホスト名の一覧（初めて出てきた順、重複なし）。 */
export function sourceHosts( events ) {

	const hosts = [];
	for ( const { source } of events ) {

		try {

			const host = new URL( source ).hostname;
			if ( host && ! hosts.includes( host ) ) hosts.push( host );

		} catch {

			// 形式の誤りは validateEvent が見つける
		}

	}

	return hosts;

}

/** キャプションの文字列：{ heading: '1985年9月　プラザ合意', note, value: '当時 240.10円' }。値がない出来事は value が null。 */
export function formatCaption( event ) {

	const [ year, month ] = event.date.split( '-' ).map( Number );
	return {
		heading: `${year}年${month}月　${event.title}`,
		note: event.note,
		value: event.valueText ? `当時 ${event.valueText}` : null
	};

}

/** 「位置が飛んだ」とみなす 1 フレームの progress の変化の下限：データの期間 years 年での、1 フレームで進みうる量の stepMargin 倍。 */
export function captionStepLimit( years ) {

	const span = Number.isFinite( years ) && years > 0 ? years : SPEED.fallbackYears;
	return ANNOT.caption.stepMargin * maxProgressPerFrame( span );

}

// ---- 読み込み ----

/** 出来事のファイルを取得して JSON を返す。失敗（404 など）は例外。 */
export async function fetchEvents( url, fetchImpl = globalThis.fetch ) {

	const response = await fetchImpl( url );
	if ( ! response.ok ) throw new Error( `${url} の取得に失敗しました（HTTP ${response.status}）` );
	return response.json();

}

// createMarkers と createAnnotations が同じ読み込みを共有する（ctx.events ごとに 1 回だけ）
const loading = new WeakMap();

/**
 * 選んだデータの出来事を読み込んで位置を計算し、完了したら 'eventsready' を 1 回だけ発行する。戻り値は位置つきの一覧の Promise。
 * - データの定義に eventsUrl がなければ何も読まず、空の一覧で 'eventsready' を発行する。
 * - 読み込みに失敗したとき（ファイルがない、JSON が壊れている）は、警告を 1 回だけ出し、空の一覧で 'eventsready' を発行する（走行は注釈なしで続く）。
 * 何度呼んでも、読み込みは 1 回。
 */
export function ensureEvents( ctx, { fetchImpl = globalThis.fetch, warn = console.warn.bind( console ) } = {} ) {

	const key = ctx.events ?? ctx;
	if ( loading.has( key ) ) return loading.get( key );

	const url = ctx.dataset?.def?.eventsUrl ?? DATASETS[ ctx.dataset?.id ]?.eventsUrl;

	const finish = ( events ) => {

		ctx.events?.emit?.( 'eventsready', {
			events: events.map( ( { date, index, progress, title, note, value, valueText } ) => ( { date, index, progress, title, note, value, valueText } ) ),
			sources: sourceHosts( events )
		} );
		return events;

	};

	const promise = ( url ? fetchEvents( url, fetchImpl ).then( ( raw ) => {

		const problems = validateEvents( raw );
		if ( problems.length > 0 ) warn( `${url} に問題があります。正しい項目だけを使います：${problems.join( ' / ' )}` );
		return resolveEvents( ctx.dataset, ( date ) => ctx.curve.dateToProgress( date ), raw );

	} ).catch( ( error ) => {

		warn( `出来事の注釈を読み込めませんでした。注釈なしで続けます：${error?.message ?? error}` );
		return [];

	} ) : Promise.resolve( [] ) ).then( finish );

	loading.set( key, promise );
	return promise;

}

// ---- キャプションを出す順番の制御 ----

/**
 * 出来事を通過したときに、キャプションを「いつ・どれを」出すかを決める（DOM に触らない。時間は ride の時間）。
 *
 * 方針
 *  - 通過：前回から今回までに進んだ progress の区間 ( 前回, 今回 ] に位置がある出来事が通過。
 *    1 フレームで進みうる量（maxStepProgress）を超える変化、または逆戻りは「位置が飛んだ」とみなし、
 *    飛び越えた出来事は出さない（待ちも捨て、表示中のものも消す）。
 *  - 表示は showMs。表示中に次の出来事が来たら、minShowMs 見せてから入れ替える。
 *  - 待ち行列は先着順。ただし、通過から maxWaitMs 以上待たされた出来事は捨てる。
 *    走行が速くて出来事が詰まるとき、古い出来事を後から出すと、いま画面に見えている位置と合わないため。
 *    これで「出る時刻は通過の最大 maxWaitMs 後」「どのキャプションも最低 minShowMs は読める」が保証される。
 *
 * startProgress：走行の開始位置。最初の update の前に、ここから進んだものとして扱う（開始のすぐ後ろにある出来事を、最初のフレームが飛び越えて見逃さないため。省略時は最初の update の位置から）。
 * update( { timeMs, progress, finished } ) は動作を返す：
 *   { type: 'show', event }（すでに表示中なら入れ替え）／ { type: 'hide' } ／ null（変化なし）
 * 終点に着いて止まった（finished）ときは、表示中のキャプションを消さずに残す（そのフレームで通った出来事があれば、いちばん新しい 1 件に入れ替える）。
 * 位置が飛んだときは消す。reset() は最初から（onReset）用。
 */
export function createCaptionScheduler( { events, showMs = 6000, minShowMs = 3000, maxWaitMs = 3000, maxStepProgress = 0.0036, startProgress = null } ) {

	let previous = startProgress;
	let current = null;
	let shownAt = 0;
	let queue = [];
	let dropped = 0;

	const showTime = () => ( typeof showMs === 'function' ? showMs() : showMs );

	return {
		update( { timeMs, progress, finished = false } ) {

			if ( previous === null ) previous = progress;
			const step = progress - previous;

			if ( step > 0 && step <= maxStepProgress ) {

				// 終点に着いたフレーム（finished）も含めて、通過した出来事を数える（最後のフレームで通った出来事を取りこぼさない）
				for ( const event of events ) {

					if ( event.progress > previous && event.progress <= progress ) queue.push( { event, passedAt: timeMs } );

				}

			} else if ( step !== 0 ) {

				// 位置が飛んだ（デバッグ用の setProgress、逆戻りなど）：飛び越えた出来事は出さない。見せていたものも、いまの位置とは関係がなくなるので消す
				queue = [];
				previous = progress;
				if ( current === null ) return null;
				current = null;
				return { type: 'hide' };

			}

			previous = progress;

			if ( finished ) {

				// 終点に着いた：表示中のものは消さずに残す（最新の出来事は終点のすぐ手前にあり、時間で消すと読めない。終了画面が出て HUD が隠れるだけ）。
				// ride の時間は止まるので、待っていた出来事は待たずに、いちばん新しい 1 件へ入れ替える
				if ( queue.length === 0 ) return null;
				current = queue.at( - 1 ).event;
				queue = [];
				shownAt = timeMs;
				return { type: 'show', event: current };

			}

			let expired = false;
			if ( current !== null && timeMs - shownAt >= showTime() ) {

				current = null;
				expired = true;

			}

			const fresh = queue.filter( ( item ) => timeMs - item.passedAt <= maxWaitMs );
			dropped += queue.length - fresh.length;
			queue = fresh;

			if ( queue.length > 0 && ( current === null || timeMs - shownAt >= minShowMs ) ) {

				current = queue.shift().event;
				shownAt = timeMs;
				return { type: 'show', event: current };

			}

			return expired ? { type: 'hide' } : null;

		},
		/** 最初から。表示も待ちも位置の記憶も捨てる。 */
		reset() {

			previous = startProgress;
			current = null;
			shownAt = 0;
			queue = [];
			dropped = 0;

		},
		get current() {

			return current;

		},
		get pending() {

			return queue.length;

		},
		/** 待たされすぎて出さなかった出来事の数（reset まで）。 */
		get dropped() {

			return dropped;

		}
	};

}
