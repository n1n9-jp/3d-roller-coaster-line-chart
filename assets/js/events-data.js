// 主要イベント（出来事）の読み込み、系列上の位置の計算、キャプションを出す順番の制御。
// DOM と three.js には依存しない（Node でそのままテストできる）。
//
// 出来事の一覧は data/events.json。実データ（dataset.meta.kind === 'real'）のときだけ読む。
// サンプルデータは合成で、実際の出来事の日付と値動きが合わないため、注釈は出さない（ファイルも読まない）。
//
// ctx.events へは、読み込みが終わったときに一度だけ 'eventsready' を発行する：
//   { events: [ { date, index, progress, title, note, close, closeDate?, source } ] }
// index は系列（dataset.raw）上の位置（小数）、progress は ctx.curve.indexToProgress( index )。

import { ANNOT } from './config.js';
import { dateToIndex } from './data.js';
import { formatYen } from './hud/readout.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const URL_PATTERN = /^https?:\/\/[^\s/$.?#][^\s]*$/;

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
	if ( typeof event.close !== 'number' || ! Number.isFinite( event.close ) || event.close <= 0 ) errors.push( `close が正の数ではありません：${event.close}` );
	if ( event.closeDate !== undefined ) {

		if ( ! isValidDate( event.closeDate ) ) errors.push( `closeDate が YYYY-MM-DD ではありません：${event.closeDate}` );
		else if ( isValidDate( event.date ) && event.closeDate === event.date ) errors.push( 'closeDate は date と違う日のときだけ付けます' );

	}

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
 * 出来事の一覧に、系列上の位置と progress を付ける。データの範囲（先頭の週〜最後の週）の外の出来事は除く。
 * 形式が正しくない項目も除く（読み込み側で警告を出す）。progress の昇順で返す。
 * @param dataset buildDataset の戻り値（raw と meta を使う）
 * @param indexToProgress 系列上の位置 → progress（ctx.curve.indexToProgress）
 */
export function resolveEvents( dataset, indexToProgress, list ) {

	const series = dataset.raw;
	const first = series[ 0 ].date;
	const last = series[ series.length - 1 ].date;
	const result = [];

	for ( const event of Array.isArray( list ) ? list : [] ) {

		if ( validateEvent( event ).length > 0 ) continue;
		if ( event.date < first || event.date > last ) continue;
		const index = dateToIndex( dataset, event.date );
		result.push( { ...event, index, progress: indexToProgress( index ) } );

	}

	return result.sort( ( a, b ) => a.progress - b.progress );

}

/** キャプションの文字列：{ heading: '2008年9月　見出し', note, value: '当時 11,610円' }。 */
export function formatCaption( event ) {

	const [ year, month ] = event.date.split( '-' ).map( Number );
	return {
		heading: `${year}年${month}月　${event.title}`,
		note: event.note,
		value: `当時 ${formatYen( event.close )}円`
	};

}

// ---- 読み込み ----

/** data/events.json を取得して JSON を返す。失敗（404 など）は例外。 */
export async function fetchEvents( url = ANNOT.eventsUrl, fetchImpl = globalThis.fetch ) {

	const response = await fetchImpl( url );
	if ( ! response.ok ) throw new Error( `${url} の取得に失敗しました（HTTP ${response.status}）` );
	return response.json();

}

// createMarkers と createAnnotations が同じ読み込みを共有する（ctx.events ごとに 1 回だけ）
const loading = new WeakMap();

/**
 * 出来事を読み込んで位置を計算し、完了したら 'eventsready' を 1 回だけ発行する。戻り値は位置つきの一覧の Promise。
 * - 実データでないとき（サンプル）は何も読まず、空の一覧を返す（リクエストも発行しない）。
 * - 読み込みに失敗したときは、警告を 1 回だけ出して空の一覧を返す（走行は注釈なしで続く）。
 * 何度呼んでも、読み込みは 1 回。
 */
export function ensureEvents( ctx, { fetchImpl = globalThis.fetch, warn = console.warn.bind( console ) } = {} ) {

	if ( ctx.dataset?.meta?.kind !== 'real' ) return Promise.resolve( [] );
	if ( loading.has( ctx.events ) ) return loading.get( ctx.events );

	const promise = fetchEvents( ANNOT.eventsUrl, fetchImpl ).then( ( raw ) => {

		const problems = validateEvents( raw );
		if ( problems.length > 0 ) warn( `data/events.json に問題があります。正しい項目だけを使います：${problems.join( ' / ' )}` );
		const events = resolveEvents( ctx.dataset, ( u ) => ctx.curve.indexToProgress( u ), raw );
		ctx.events?.emit( 'eventsready', { events } );
		return events;

	} ).catch( ( error ) => {

		warn( `出来事の注釈を読み込めませんでした。注釈なしで続けます：${error?.message ?? error}` );
		return [];

	} );

	loading.set( ctx.events, promise );
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
 * update( { timeMs, progress, finished } ) は動作を返す：
 *   { type: 'show', event }（すでに表示中なら入れ替え）／ { type: 'hide' } ／ null（変化なし）
 * 一周して止まった（finished）ときは、表示を消して待ちも捨てる。reset() は最初から（onReset）用。
 */
export function createCaptionScheduler( { events, showMs = 6000, minShowMs = 3000, maxWaitMs = 3000, maxStepProgress = 0.0036 } ) {

	let previous = null;
	let current = null;
	let shownAt = 0;
	let queue = [];
	let dropped = 0;

	const showTime = () => ( typeof showMs === 'function' ? showMs() : showMs );

	return {
		update( { timeMs, progress, finished = false } ) {

			if ( finished ) {

				previous = progress;
				queue = [];
				if ( current === null ) return null;
				current = null;
				return { type: 'hide' };

			}

			if ( previous === null ) previous = progress;
			const step = progress - previous;

			if ( step > 0 && step <= maxStepProgress ) {

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

			previous = null;
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
