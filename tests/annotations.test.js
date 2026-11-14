import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readJson, loadFixtures } from './helpers.js';
import { buildDataset } from '../assets/js/data.js';
import { indexToProgress } from '../assets/js/loop.js';
import { createEvents } from '../assets/js/events.js';
import { ANNOT, LOOP } from '../assets/js/config.js';
import {
	TITLE_MAX,
	NOTE_MAX,
	validateEvent,
	validateEvents,
	resolveEvents,
	formatCaption,
	fetchEvents,
	ensureEvents,
	createCaptionScheduler
} from '../assets/js/events-data.js';

const events = readJson( 'data/events.json' );
const hasLocal = existsSync( new URL( '../data/local/nikkei225.json', import.meta.url ) );

// ---- data/events.json の形式 ----

test( 'data/events.json：12〜14 件で、形式の誤りがない', () => {

	assert.ok( events.length >= 12 && events.length <= 14, `件数 ${events.length}` );
	assert.deepEqual( validateEvents( events ), [] );

} );

test( 'data/events.json：必須の項目、日付の書式、見出しと補足の長さ、URL の形式', () => {

	for ( const e of events ) {

		assert.match( e.date, /^\d{4}-\d{2}-\d{2}$/ );
		assert.ok( typeof e.title === 'string' && [ ...e.title ].length <= TITLE_MAX, e.title );
		assert.ok( typeof e.note === 'string' && [ ...e.note ].length <= NOTE_MAX, e.note );
		assert.ok( Number.isFinite( e.close ) && e.close > 0, `${e.date} close` );
		assert.match( e.source, /^https?:\/\/\S+$/, e.date );
		if ( e.closeDate !== undefined ) assert.match( e.closeDate, /^\d{4}-\d{2}-\d{2}$/ );

	}

} );

test( 'data/events.json：日付は昇順で重複せず、1990 年代から 2026 年までに散らばっている', () => {

	const dates = events.map( ( e ) => e.date );
	assert.deepEqual( dates, [ ...dates ].sort() );
	assert.equal( new Set( dates ).size, dates.length );
	assert.ok( dates[ 0 ] < '1991' && dates.at( - 1 ) >= '2026' );

	// 10 年の区切りごとに 1 件以上ある
	for ( const decade of [ '199', '200', '201', '202' ] ) {

		assert.ok( dates.some( ( d ) => d.startsWith( decade ) ), `${decade}0 年代の出来事がない` );

	}

} );

test( 'data/events.json：休場日の出来事は、翌営業日の日付を closeDate に持つ', () => {

	for ( const e of events ) {

		if ( e.closeDate ) assert.ok( e.closeDate !== e.date, e.date );

	}

	// 山一證券の廃業（1997-11-24、月曜の休場）とリーマン（2008-09-15、休場）
	assert.equal( events.find( ( e ) => e.date === '1997-11-24' ).closeDate, '1997-11-25' );
	assert.equal( events.find( ( e ) => e.date === '2008-09-15' ).closeDate, '2008-09-16' );

} );

test( 'validateEvent：誤りを見つける', () => {

	const ok = { date: '2008-09-15', title: '見出し', note: '補足', close: 100, source: 'https://example.com/x' };
	assert.deepEqual( validateEvent( ok ), [] );
	assert.ok( validateEvent( { ...ok, date: '2008-9-15' } ).length > 0 );
	assert.ok( validateEvent( { ...ok, date: '2008-02-30' } ).length > 0 );
	assert.ok( validateEvent( { ...ok, title: '' } ).length > 0 );
	assert.ok( validateEvent( { ...ok, title: 'あ'.repeat( TITLE_MAX + 1 ) } ).length > 0 );
	assert.ok( validateEvent( { ...ok, note: 'あ'.repeat( NOTE_MAX + 1 ) } ).length > 0 );
	assert.ok( validateEvent( { ...ok, close: '100' } ).length > 0 );
	assert.ok( validateEvent( { ...ok, source: 'example.com' } ).length > 0 );
	assert.ok( validateEvent( { ...ok, closeDate: '2008-09-15' } ).length > 0 );
	assert.ok( validateEvents( [ ok, { ...ok, date: '2008-09-14' } ] ).length > 0, '昇順でない' );
	assert.ok( validateEvents( { not: 'array' } ).length > 0 );

} );

// ---- 実データとの突き合わせ ----

test( 'data/events.json：close が、その日付（または closeDate）を含む週の値と大きく矛盾しない', { skip: ! hasLocal && '実データ（data/local/nikkei225.json）がない' }, () => {

	const weekly = readJson( 'data/local/nikkei225.json' );

	for ( const e of events ) {

		const target = e.closeDate ?? e.date;
		// その日以前で最後の週（月曜始まり。週の値はその週の最終営業日の終値）。コース開始前の日付は最初の週
		let week = weekly[ 0 ];
		for ( const w of weekly ) {

			if ( w.date <= target ) week = w;
			else break;

		}

		const difference = Math.abs( e.close - week.close ) / week.close;
		assert.ok( difference <= 0.15, `${target}：close ${e.close} と、${week.date} の週の ${week.close} の差が ${( difference * 100 ).toFixed( 1 )}%` );

	}

} );

// ---- 位置の計算 ----

function sampleDataset() {

	const { nikkei } = loadFixtures();
	return buildDataset( nikkei, 4, { kind: 'real' } );

}

const toProgress = ( dataset ) => ( u ) => indexToProgress( u, dataset.raw.length, LOOP.linkFraction );

test( 'resolveEvents：index と progress を付け、範囲外を除き、progress の昇順で返す', () => {

	const dataset = sampleDataset();
	const first = dataset.raw[ 0 ].date;
	const last = dataset.raw.at( - 1 ).date;
	const list = [
		{ date: '1980-01-01', title: 'a', note: 'a', close: 1, source: 'https://example.com/a' },
		{ date: first, title: 'b', note: 'b', close: 1, source: 'https://example.com/b' },
		{ date: '2008-09-15', title: 'c', note: 'c', close: 1, source: 'https://example.com/c' },
		{ date: last, title: 'd', note: 'd', close: 1, source: 'https://example.com/d' },
		{ date: '2099-01-01', title: 'e', note: 'e', close: 1, source: 'https://example.com/e' },
		{ date: '2010-01-01', title: '', note: 'f', close: 1, source: 'https://example.com/f' } // 形式の誤り
	];
	const resolved = resolveEvents( dataset, toProgress( dataset ), list );

	assert.deepEqual( resolved.map( ( e ) => e.title ), [ 'b', 'c', 'd' ] );
	assert.equal( resolved[ 0 ].index, 0 );
	assert.equal( resolved[ 0 ].progress, 0 );
	assert.equal( resolved[ 2 ].index, dataset.raw.length - 1 );
	assert.ok( Math.abs( resolved[ 2 ].progress - ( 1 - LOOP.linkFraction ) ) < 1e-12 );
	assert.ok( resolved[ 1 ].progress > 0 && resolved[ 1 ].progress < resolved[ 2 ].progress );
	for ( const e of resolved ) assert.ok( [ 'date', 'index', 'progress', 'title', 'note', 'close' ].every( ( k ) => k in e ) );

} );

test( 'resolveEvents：実データの範囲では、すべての出来事に位置がつき、その日付の週を指す', { skip: ! hasLocal && '実データがない' }, () => {

	const dataset = buildDataset( readJson( 'data/local/nikkei225.json' ), 4, { kind: 'real' } );
	const resolved = resolveEvents( dataset, toProgress( dataset ), events );
	assert.equal( resolved.length, events.length );

	for ( const e of resolved ) {

		const week = dataset.raw[ Math.floor( e.index ) ].date;
		assert.ok( week <= e.date, `${e.date}：index ${e.index} は ${week} の週` );
		assert.ok( e.progress >= 0 && e.progress <= 1 - LOOP.linkFraction );

	}

	for ( let i = 1; i < resolved.length; i ++ ) assert.ok( resolved[ i ].progress > resolved[ i - 1 ].progress );

} );

test( 'formatCaption：「{YYYY}年{M}月　見出し」「当時 {n,nnn}円」', () => {

	const e = events.find( ( x ) => x.date === '2008-09-15' );
	assert.deepEqual( formatCaption( e ), { heading: `2008年9月　${e.title}`, note: e.note, value: '当時 11,610円' } );
	assert.equal( formatCaption( { date: '1990-01-04', title: 't', note: 'n', close: 38915.87 } ).value, '当時 38,916円' );

} );

// ---- 読み込み ----

function fakeCtx( kind ) {

	const emitter = createEvents();
	const emitted = [];
	emitter.on( 'eventsready', ( payload ) => emitted.push( payload ) );
	const dataset = sampleDataset();
	dataset.meta = { kind };
	return { ctx: { dataset, events: emitter, curve: { indexToProgress: toProgress( dataset ) } }, emitted };

}

function fakeFetch( responder ) {

	const calls = [];
	const impl = async ( url ) => {

		calls.push( url );
		return responder( url );

	};

	return { impl, calls };

}

test( 'ensureEvents：サンプルデータでは、リクエストも発行も行わない', async () => {

	const { ctx, emitted } = fakeCtx( 'sample' );
	const { impl, calls } = fakeFetch( () => {

		throw new Error( '呼ばれてはいけない' );

	} );
	assert.deepEqual( await ensureEvents( ctx, { fetchImpl: impl } ), [] );
	assert.equal( calls.length, 0 );
	assert.equal( emitted.length, 0 );

} );

test( 'ensureEvents：実データでは 1 回だけ読み、eventsready を 1 回だけ発行する', async () => {

	const { ctx, emitted } = fakeCtx( 'real' );
	const { impl, calls } = fakeFetch( () => ( { ok: true, status: 200, json: async () => events } ) );

	const [ a, b ] = await Promise.all( [ ensureEvents( ctx, { fetchImpl: impl } ), ensureEvents( ctx, { fetchImpl: impl } ) ] );
	assert.equal( calls.length, 1 );
	assert.equal( calls[ 0 ], ANNOT.eventsUrl );
	assert.equal( emitted.length, 1 );
	assert.equal( a, b );
	assert.ok( a.length > 0 && a.length <= events.length ); // 範囲外（サンプルの終わりより後）は除かれる
	assert.deepEqual( emitted[ 0 ].events, a );
	for ( const e of a ) assert.ok( Number.isFinite( e.index ) && Number.isFinite( e.progress ) );

} );

test( 'ensureEvents：404 などで失敗したら、警告を 1 回だけ出して空で続ける（eventsready は出さない）', async () => {

	const { ctx, emitted } = fakeCtx( 'real' );
	const { impl } = fakeFetch( () => ( { ok: false, status: 404, json: async () => ( {} ) } ) );
	const warnings = [];
	const warn = ( ...args ) => warnings.push( args );

	assert.deepEqual( await ensureEvents( ctx, { fetchImpl: impl, warn } ), [] );
	assert.deepEqual( await ensureEvents( ctx, { fetchImpl: impl, warn } ), [] );
	assert.equal( warnings.length, 1 );
	assert.equal( emitted.length, 0 );

	await assert.rejects( fetchEvents( './x.json', impl ), /404/ );

} );

test( 'ensureEvents：形式の誤りのある項目は警告して除き、残りで続ける', async () => {

	const { ctx, emitted } = fakeCtx( 'real' );
	const broken = [ { ...events[ 0 ], title: '' }, events[ 5 ] ];
	const { impl } = fakeFetch( () => ( { ok: true, status: 200, json: async () => broken } ) );
	const warnings = [];

	const resolved = await ensureEvents( ctx, { fetchImpl: impl, warn: ( ...args ) => warnings.push( args ) } );
	assert.equal( warnings.length, 1 );
	assert.deepEqual( resolved.map( ( e ) => e.date ), [ events[ 5 ].date ] );
	assert.equal( emitted.length, 1 );

} );

// ---- キャプションを出す順番の制御 ----

/** progress だけを持つ出来事。 */
const ev = ( name, progress ) => ( { name, progress } );
const names = ( action ) => ( action?.type === 'show' ? action.event.name : action?.type ?? null );

/** 一定の速さ（progress / ms）で dt ms ずつ進めて、動作の記録（時刻つき）を返す。 */
function run( scheduler, { from = 0, to, speed, dt = 16, timeMs = 0 } ) {

	const log = [];
	let progress = from;
	let time = timeMs;
	while ( progress < to ) {

		time += dt;
		progress = Math.min( to, progress + speed * dt );
		const action = scheduler.update( { timeMs: time, progress, finished: false } );
		if ( action ) log.push( [ Math.round( time ), names( action ) ] );

	}

	return { log, timeMs: time, progress };

}

const options = { showMs: 6000, minShowMs: 3000, maxWaitMs: 3000, maxStepProgress: 0.0036 };

test( 'scheduler：通過した出来事が出て、showMs たつと消える', () => {

	const scheduler = createCaptionScheduler( { events: [ ev( 'A', 0.1 ), ev( 'B', 0.5 ) ], ...options } );
	const { log, timeMs } = run( scheduler, { to: 0.7, speed: 1e-5 } ); // 1 ms あたり 1e-5 → 全体で 70 秒

	assert.deepEqual( log.map( ( x ) => x[ 1 ] ), [ 'A', 'hide', 'B', 'hide' ] );
	const [ showA, hideA, showB ] = log.map( ( x ) => x[ 0 ] );
	assert.ok( Math.abs( showA - 10000 ) <= 32, `A は位置 0.1（10 秒）を通過したとき：${showA}` );
	assert.ok( hideA - showA >= 6000 && hideA - showA < 6032, `A は 6 秒表示：${hideA - showA}` );
	assert.ok( Math.abs( showB - 50000 ) <= 32 );
	assert.ok( timeMs > 0 );

} );

test( 'scheduler：一時停止中（timeMs が進まない）は時間も表示も進まない', () => {

	const scheduler = createCaptionScheduler( { events: [ ev( 'A', 0.1 ) ], ...options } );
	assert.equal( names( scheduler.update( { timeMs: 100, progress: 0.0999 } ) ), null );
	assert.equal( names( scheduler.update( { timeMs: 116, progress: 0.1001 } ) ), 'A' );
	// 一時停止：timeMs も progress も動かない
	for ( let i = 0; i < 1000; i ++ ) assert.equal( scheduler.update( { timeMs: 116, progress: 0.1001 } ), null );
	assert.equal( scheduler.current.name, 'A' );
	// 再開してから 6 秒で消える
	assert.equal( scheduler.update( { timeMs: 116 + 5900, progress: 0.1002 } ), null );
	assert.equal( names( scheduler.update( { timeMs: 116 + 6000, progress: 0.1003 } ) ), 'hide' );

} );

test( 'scheduler：showMs は関数でもよい（prefers-reduced-motion では 8000ms）', () => {

	let reduced = true;
	const scheduler = createCaptionScheduler( { events: [ ev( 'A', 0.1 ) ], ...options, showMs: () => ( reduced ? 8000 : 6000 ) } );
	scheduler.update( { timeMs: 0, progress: 0.0999 } );
	assert.equal( names( scheduler.update( { timeMs: 10, progress: 0.1001 } ) ), 'A' );
	assert.equal( scheduler.update( { timeMs: 7900, progress: 0.1002 } ), null );
	assert.equal( names( scheduler.update( { timeMs: 8010, progress: 0.1003 } ) ), 'hide' );

	// 通常は 6000ms
	reduced = false;
	assert.equal( names( scheduler.update( { timeMs: 8020, progress: 0.1004 } ) ), null );

} );

test( 'scheduler：位置が飛んだときは、飛び越えた出来事を出さない（進む方向も、戻る方向も）', () => {

	const scheduler = createCaptionScheduler( { events: [ ev( 'A', 0.1 ), ev( 'B', 0.2 ), ev( 'C', 0.3 ) ], ...options } );
	assert.equal( scheduler.update( { timeMs: 0, progress: 0 } ), null );
	assert.equal( scheduler.update( { timeMs: 16, progress: 0.25 } ), null, 'A と B を飛び越えた' );
	assert.equal( scheduler.pending, 0 );
	// 飛んだあとは、ふつうに進めば次の出来事が出る
	assert.equal( names( scheduler.update( { timeMs: 32, progress: 0.2999 } ) ), null );
	assert.equal( names( scheduler.update( { timeMs: 48, progress: 0.3001 } ) ), 'C' );
	// 後ろへ戻る：出ていた C は消え、何も出ない。戻った先から進めば、通過した出来事がまた出る
	assert.equal( names( scheduler.update( { timeMs: 64, progress: 0.15 } ) ), 'hide' );
	assert.equal( scheduler.update( { timeMs: 80, progress: 0.1999 } ), null );
	assert.equal( names( scheduler.update( { timeMs: 96, progress: 0.2001 } ) ), 'B' );

} );

test( 'scheduler：位置が飛んだとき、表示中のキャプションは消える', () => {

	const scheduler = createCaptionScheduler( { events: [ ev( 'A', 0.1 ) ], ...options } );
	scheduler.update( { timeMs: 0, progress: 0.0999 } );
	assert.equal( names( scheduler.update( { timeMs: 16, progress: 0.1001 } ) ), 'A' );
	assert.equal( names( scheduler.update( { timeMs: 32, progress: 0.5 } ) ), 'hide' );
	assert.equal( scheduler.current, null );

} );

test( 'scheduler：飛んだ直後から進めて、各出来事の手前から走らせると 1 回ずつ出る', () => {

	const list = [ ev( 'A', 0.1 ), ev( 'B', 0.2 ), ev( 'C', 0.3 ) ];
	const scheduler = createCaptionScheduler( { events: list, ...options } );
	const shown = [];
	let time = 0;
	for ( const e of list ) {

		// 出来事の少し手前へ飛ぶ（前の表示が消えるまで待たない）
		time += 20000;
		scheduler.update( { timeMs: time, progress: e.progress - 0.005 } );
		const result = run( scheduler, { from: e.progress - 0.005, to: e.progress + 0.005, speed: 5e-6, timeMs: time } );
		time = result.timeMs;
		shown.push( ...result.log.filter( ( x ) => x[ 1 ] !== 'hide' ).map( ( x ) => x[ 1 ] ) );

	}

	assert.deepEqual( shown, [ 'A', 'B', 'C' ] );

} );

test( 'scheduler：最初から（reset）で、表示も待ちも位置の記憶も消える', () => {

	const scheduler = createCaptionScheduler( { events: [ ev( 'A', 0.1 ), ev( 'B', 0.1005 ) ], ...options } );
	scheduler.update( { timeMs: 0, progress: 0.0999 } );
	assert.equal( names( scheduler.update( { timeMs: 16, progress: 0.1006 } ) ), 'A' );
	assert.equal( scheduler.pending, 1 );

	scheduler.reset();
	assert.equal( scheduler.current, null );
	assert.equal( scheduler.pending, 0 );
	assert.equal( scheduler.dropped, 0 );

	// reset 後の最初の呼び出しは位置を覚えるだけ（0 から始まる）。最初から走ると A がまた出る
	assert.equal( scheduler.update( { timeMs: 0, progress: 0 } ), null );
	const { log } = run( scheduler, { to: 0.11, speed: 5e-6 } );
	assert.equal( log[ 0 ][ 1 ], 'A' );

} );

test( 'scheduler：一周して止まったら（finished）表示を消し、待ちも捨てる', () => {

	const scheduler = createCaptionScheduler( { events: [ ev( 'A', 0.1 ), ev( 'B', 0.1005 ) ], ...options } );
	scheduler.update( { timeMs: 0, progress: 0.0999 } );
	scheduler.update( { timeMs: 16, progress: 0.1006 } );
	assert.equal( scheduler.current.name, 'A' );
	assert.equal( scheduler.pending, 1 );

	assert.equal( names( scheduler.update( { timeMs: 100, progress: 0.97, finished: true } ) ), 'hide' );
	assert.equal( scheduler.current, null );
	assert.equal( scheduler.pending, 0 );
	assert.equal( scheduler.update( { timeMs: 200, progress: 0.97, finished: true } ), null );

} );

test( 'scheduler：詰まった出来事は、最低 3 秒見せてから先着順で入れ替わる', () => {

	// 0.5 秒おき（速度 1e-7 / ms で 0.00005 離れている）に 3 件通過する
	const list = [ ev( 'A', 0.1 ), ev( 'B', 0.10005 ), ev( 'C', 0.1001 ) ];
	const scheduler = createCaptionScheduler( { events: list, ...options } );
	const log = [];
	let time = 0;
	for ( let progress = 0.0999; progress <= 0.1007; progress += 1e-6 ) {

		time += 10; // 10ms で 1e-6 進む（速度 1e-7 / ms）。0.5 秒で 5e-5
		const action = scheduler.update( { timeMs: time, progress } );
		if ( action ) log.push( [ time, names( action ) ] );

	}

	// A（t≈1000）は出る。B は通過（t≈1500）から A を 3 秒見せた時点（t≈4000）まで待って出る（待ち 3 秒未満）。
	// C は通過（t≈2000）から、B を 3 秒見せるまで（t≈7000）待つと 3 秒を超えるので出さない。
	assert.deepEqual( log.map( ( x ) => x[ 1 ] ), [ 'A', 'B' ] );
	assert.ok( log[ 1 ][ 0 ] - log[ 0 ][ 0 ] >= 3000 && log[ 1 ][ 0 ] - log[ 0 ][ 0 ] <= 3020, `A は最低 3 秒見せる：${log[ 1 ][ 0 ] - log[ 0 ][ 0 ]}` );
	assert.equal( scheduler.dropped, 1 );

} );

test( 'scheduler：どの出来事も、通過から maxWaitMs 以内に出て、最低 minShowMs は見える（速さを変えて確かめる）', () => {

	// 実際の出来事の並び（2024〜2026 年は間隔が短い）を、progress に直して使う
	const dataset = sampleDataset();
	const list = resolveEvents( dataset, toProgress( dataset ), events ).map( ( e ) => ( { name: e.date, progress: e.progress } ) );

	for ( const speed of [ 3.6e-6, 6e-6, 1e-5, 1.8e-5 ] ) { // SPEED_MIN 〜 SPEED_MAX（progress / ms）

		const scheduler = createCaptionScheduler( { events: list, ...options } );
		const passedAt = new Map();
		const shownAt = new Map();
		const showTimes = [];
		let time = 0;
		let progress = 0;
		scheduler.update( { timeMs: 0, progress: 0 } );
		while ( progress < 0.97 ) {

			time += 16;
			const before = progress;
			progress += speed * 16;
			for ( const e of list ) if ( e.progress > before && e.progress <= progress ) passedAt.set( e.name, time );
			const action = scheduler.update( { timeMs: time, progress } );
			if ( action?.type === 'show' ) {

				shownAt.set( action.event.name, time );
				showTimes.push( time );

			}

		}

		for ( const [ name, at ] of shownAt ) {

			assert.ok( at - passedAt.get( name ) <= options.maxWaitMs + 16, `speed ${speed}：${name} は通過から ${at - passedAt.get( name )}ms 後に出た` );

		}

		for ( let i = 1; i < showTimes.length; i ++ ) {

			assert.ok( showTimes[ i ] - showTimes[ i - 1 ] >= options.minShowMs, `speed ${speed}：入れ替えの間隔 ${showTimes[ i ] - showTimes[ i - 1 ]}ms` );

		}

		// 出なかった出来事は、捨てた（dropped）か、まだ待っている（pending）
		assert.equal( list.length - shownAt.size, scheduler.dropped + scheduler.pending, `speed ${speed}` );
		// ゆっくり（SPEED_MIN）のときは、すべて出る
		if ( speed === 3.6e-6 ) assert.equal( shownAt.size, list.length );

	}

} );

test( 'ANNOT.caption：仕様の値（表示 6000ms、reduced は 8000ms、入れ替えまで最低 3000ms）', () => {

	assert.equal( ANNOT.caption.showMs, 6000 );
	assert.equal( ANNOT.caption.showMsReduced, 8000 );
	assert.equal( ANNOT.caption.minShowMs, 3000 );
	assert.ok( ANNOT.caption.maxStepProgress > 0.0018, '1 フレームで進みうる量より大きい' );

} );
