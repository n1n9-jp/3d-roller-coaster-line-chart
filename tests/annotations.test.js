import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readJson, loadFixtures } from './helpers.js';
import { buildDataset } from '../assets/js/data.js';
import { TrackCurve } from '../assets/js/track.js';
import { createEvents } from '../assets/js/events.js';
import { ANNOT, DATASETS, maxProgressPerFrame } from '../assets/js/config.js';
import {
	TITLE_MAX,
	NOTE_MAX,
	validateEvent,
	validateEvents,
	resolveEvents,
	sourceHosts,
	formatCaption,
	captionStepLimit,
	fetchEvents,
	ensureEvents,
	createCaptionScheduler
} from '../assets/js/events-data.js';

const events = readJson( 'data/events/usdjpy.json' );

// ---- validateEvent ----

test( 'validateEvent：誤りを見つける', () => {

	const ok = { date: '2008-09-15', title: '見出し', note: '補足', source: 'https://example.com/x' };
	assert.deepEqual( validateEvent( ok ), [] );
	assert.deepEqual( validateEvent( { ...ok, showValue: false } ), [] );
	assert.ok( validateEvent( { ...ok, date: '2008-9-15' } ).length > 0 );
	assert.ok( validateEvent( { ...ok, date: '2008-02-30' } ).length > 0 );
	assert.ok( validateEvent( { ...ok, title: '' } ).length > 0 );
	assert.ok( validateEvent( { ...ok, title: 'あ'.repeat( TITLE_MAX + 1 ) } ).length > 0 );
	assert.ok( validateEvent( { ...ok, note: 'あ'.repeat( NOTE_MAX + 1 ) } ).length > 0 );
	assert.ok( validateEvent( { ...ok, showValue: 'no' } ).length > 0 );
	assert.ok( validateEvent( { ...ok, source: 'example.com' } ).length > 0 );
	assert.ok( validateEvents( [ ok, { ...ok, date: '2008-09-14' } ] ).length > 0, '昇順でない' );
	assert.ok( validateEvents( { not: 'array' } ).length > 0 );

} );

// ---- 位置と値の計算 ----

function usdjpyDataset() {

	const { usdjpy } = loadFixtures();
	return buildDataset( usdjpy, 4, { kind: 'real' }, DATASETS.usdjpy );

}

function jgbDataset() {

	const { jgb10 } = loadFixtures();
	return buildDataset( jgb10, 4, { kind: 'real' }, DATASETS.jgb10 );

}

// 螺旋の曲線は、main.js と同じく移動平均後の系列で作る（日付は同じ）
const curveOf = ( dataset ) => new TrackCurve( dataset.smoothed );
const toProgress = ( dataset ) => {

	const curve = curveOf( dataset );
	return ( date ) => curve.dateToProgress( date );

};

const item = ( date, extra = {} ) => ( { date, title: 't', note: 'n', source: 'https://example.com/x', ...extra } );

test( 'resolveEvents：位置と週の値を付け、範囲外と形式の誤りを除き、progress の昇順で返す', () => {

	const dataset = usdjpyDataset();
	const first = dataset.raw[ 0 ].date;
	const last = dataset.raw.at( - 1 ).date;
	const list = [
		item( '1960-01-01' ),
		item( first, { title: 'b' } ),
		item( '1985-09-22', { title: 'c' } ),
		item( last, { title: 'd' } ),
		item( '2099-01-01' ),
		item( '2010-01-01', { title: '' } ) // 形式の誤り
	];
	const resolved = resolveEvents( dataset, toProgress( dataset ), list );

	assert.deepEqual( resolved.map( ( e ) => e.title ), [ 'b', 'c', 'd' ] );
	assert.equal( resolved[ 0 ].index, 0 );
	assert.equal( resolved[ 0 ].progress, 0 );
	assert.equal( resolved[ 2 ].index, dataset.raw.length - 1 );
	assert.ok( Math.abs( resolved[ 2 ].progress - 1 ) < 1e-12 );
	assert.ok( resolved[ 1 ].progress > 0 && resolved[ 1 ].progress < resolved[ 2 ].progress );
	for ( const e of resolved ) assert.ok( [ 'date', 'index', 'progress', 'title', 'note', 'value', 'valueText' ].every( ( k ) => k in e ) );

} );

test( 'resolveEvents：値は、日付を含む週の値（dataset.raw）を dataset.format.value で書式にしたもの', () => {

	const dataset = usdjpyDataset();
	const [ e ] = resolveEvents( dataset, toProgress( dataset ), [ item( '1985-09-22' ) ] ); // 日曜日。週は 09-16（月）
	assert.equal( e.value, 240.1 );
	assert.equal( e.valueText, dataset.format.value( 240.1 ) );
	assert.equal( e.valueText, '240.10円' );

	const jgb = jgbDataset();
	const [ g ] = resolveEvents( jgb, toProgress( jgb ), [ item( '2025-12-19' ) ] );
	assert.equal( g.value, 2.021 );
	assert.equal( g.valueText, '2.021%' );

	// 月曜日の当日、その週の最終日（日曜日）
	assert.equal( resolveEvents( dataset, toProgress( dataset ), [ item( '1985-09-16' ) ] )[ 0 ].value, 240.1 );
	assert.equal( resolveEvents( dataset, toProgress( dataset ), [ item( '1985-09-22' ) ] )[ 0 ].value, 240.1 );
	assert.equal( resolveEvents( dataset, toProgress( dataset ), [ item( '1985-09-23' ) ] )[ 0 ].value, 220.1 );

} );

test( 'resolveEvents：値のない週（1971 年 8 月の空白）の日付と、showValue: false は、値を出さない', () => {

	const dataset = usdjpyDataset();
	const resolved = resolveEvents( dataset, toProgress( dataset ), [
		item( '1971-08-20' ), // 08-16〜08-29 の 2 週は行がない
		item( '1971-08-15', { showValue: false } ),
		item( '1971-09-01' )
	] );
	assert.equal( resolved.length, 3 );
	assert.equal( resolved[ 0 ].value, null ); // 08-15 は 08-20 より先
	assert.equal( resolved[ 0 ].valueText, null );
	assert.equal( resolved[ 1 ].date, '1971-08-20' );
	assert.equal( resolved[ 1 ].value, null );
	assert.equal( resolved[ 2 ].value, 340.14 ); // 08-30 の週
	assert.ok( resolved[ 0 ].progress < resolved[ 1 ].progress && resolved[ 1 ].progress < resolved[ 2 ].progress );

} );

test( 'resolveEvents：progress は curve.dateToProgress、index は dateToIndex と同じ位置を指す', () => {

	const dataset = jgbDataset();
	const curve = curveOf( dataset );
	const [ e ] = resolveEvents( dataset, ( d ) => curve.dateToProgress( d ), [ item( '2016-01-29' ) ] );
	assert.equal( e.progress, curve.dateToProgress( '2016-01-29' ) );
	assert.ok( Math.abs( curve.indexToProgress( e.index ) - e.progress ) < 1e-9 );

} );

test( 'formatCaption：「{YYYY}年{M}月　見出し」「当時 {値}」。値がなければ null', () => {

	assert.deepEqual( formatCaption( { date: '1985-09-22', title: 'プラザ合意', note: 'n', value: 240.1, valueText: '240.10円' } ), { heading: '1985年9月　プラザ合意', note: 'n', value: '当時 240.10円' } );
	assert.equal( formatCaption( { date: '1971-08-15', title: 't', note: 'n', value: null, valueText: null } ).value, null );

} );

test( 'sourceHosts：出所のホスト名を、初めて出てきた順に重複なしで返す', () => {

	assert.deepEqual( sourceHosts( [
		{ source: 'https://www.boj.or.jp/a.pdf' },
		{ source: 'https://www.mof.go.jp/b' },
		{ source: 'https://www.boj.or.jp/c.pdf' }
	] ), [ 'www.boj.or.jp', 'www.mof.go.jp' ] );
	assert.deepEqual( sourceHosts( [] ), [] );

} );

// ---- 読み込み ----

function fakeCtx( id = 'usdjpy' ) {

	const emitter = createEvents();
	const emitted = [];
	emitter.on( 'eventsready', ( payload ) => emitted.push( payload ) );
	const dataset = id === 'jgb10' ? jgbDataset() : usdjpyDataset();
	return { ctx: { dataset, events: emitter, curve: curveOf( dataset ) }, emitted };

}

function fakeFetch( responder ) {

	const calls = [];
	const impl = async ( url ) => {

		calls.push( url );
		return responder( url );

	};

	return { impl, calls };

}

const respondFromFiles = ( url ) => {

	const path = url.replace( /^\.\//, '' );
	if ( ! existsSync( new URL( `../${path}`, import.meta.url ) ) ) return { ok: false, status: 404, json: async () => ( {} ) };
	return { ok: true, status: 200, json: async () => readJson( path ) };

};

test( 'ensureEvents：選んだデータの出来事のファイルだけを、1 回だけ読み、eventsready を 1 回だけ発行する', async () => {

	for ( const id of [ 'usdjpy', 'jgb10' ] ) {

		const { ctx, emitted } = fakeCtx( id );
		const { impl, calls } = fakeFetch( respondFromFiles );

		const [ a, b ] = await Promise.all( [ ensureEvents( ctx, { fetchImpl: impl } ), ensureEvents( ctx, { fetchImpl: impl } ) ] );
		assert.deepEqual( calls, [ DATASETS[ id ].eventsUrl ], `${id}：選んだデータのファイルだけ` );
		assert.equal( emitted.length, 1 );
		assert.equal( a, b );
		assert.ok( a.length >= 10, `${id}：${a.length} 件` );
		assert.deepEqual( emitted[ 0 ].events.map( ( e ) => e.date ), a.map( ( e ) => e.date ) );
		assert.deepEqual( Object.keys( emitted[ 0 ].events[ 0 ] ).sort(), [ 'date', 'index', 'note', 'progress', 'title', 'value', 'valueText' ] );
		assert.ok( emitted[ 0 ].sources.length > 0 && emitted[ 0 ].sources.every( ( h ) => /^[\w.-]+$/.test( h ) ) );
		for ( const e of a ) assert.ok( Number.isFinite( e.index ) && Number.isFinite( e.progress ) );

	}

} );

test( 'ensureEvents：ドル円の出来事に、日経平均の出来事は入らない', async () => {

	const { ctx, emitted } = fakeCtx( 'usdjpy' );
	await ensureEvents( ctx, { fetchImpl: fakeFetch( respondFromFiles ).impl } );
	const nikkei = readJson( 'data/events/nikkei.json' ).map( ( e ) => e.title );
	for ( const e of emitted[ 0 ].events ) assert.ok( ! nikkei.includes( e.title ), e.title );

} );

test( 'ensureEvents：ファイルがない（404）・壊れているときは、警告を 1 回だけ出して、空の eventsready で続ける', async () => {

	const { ctx, emitted } = fakeCtx();
	const { impl } = fakeFetch( () => ( { ok: false, status: 404, json: async () => ( {} ) } ) );
	const warnings = [];
	const warn = ( ...args ) => warnings.push( args );

	assert.deepEqual( await ensureEvents( ctx, { fetchImpl: impl, warn } ), [] );
	assert.deepEqual( await ensureEvents( ctx, { fetchImpl: impl, warn } ), [] );
	assert.equal( warnings.length, 1 );
	assert.deepEqual( emitted, [ { events: [], sources: [] } ] );
	await assert.rejects( fetchEvents( './x.json', impl ), /404/ );

	// JSON が壊れている
	const broken = fakeCtx();
	const warnings2 = [];
	await ensureEvents( broken.ctx, { fetchImpl: async () => ( { ok: true, status: 200, json: async () => { throw new SyntaxError( 'bad' ); } } ), warn: ( ...a ) => warnings2.push( a ) } );
	assert.equal( warnings2.length, 1 );
	assert.deepEqual( broken.emitted, [ { events: [], sources: [] } ] );

} );

test( 'ensureEvents：出来事のファイルを持たないデータは、読み込みも警告もなしで、空の eventsready', async () => {

	const { ctx, emitted } = fakeCtx();
	ctx.dataset = { ...ctx.dataset, def: { ...ctx.dataset.def, eventsUrl: undefined }, id: 'none' };
	const { impl, calls } = fakeFetch( () => {

		throw new Error( '呼ばれてはいけない' );

	} );
	const warnings = [];
	assert.deepEqual( await ensureEvents( ctx, { fetchImpl: impl, warn: ( ...a ) => warnings.push( a ) } ), [] );
	assert.equal( calls.length, 0 );
	assert.equal( warnings.length, 0 );
	assert.deepEqual( emitted, [ { events: [], sources: [] } ] );

} );

test( 'ensureEvents：形式の誤りのある項目は警告して除き、残りで続ける', async () => {

	const { ctx, emitted } = fakeCtx();
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

test( 'scheduler：最後の週で止まったら（finished）表示を消し、待ちも捨てる', () => {

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
	const dataset = usdjpyDataset();
	const list = resolveEvents( dataset, toProgress( dataset ), events ).map( ( e ) => ( { name: e.date, progress: e.progress } ) );

	for ( const speed of [ 3.6e-6, 6e-6, 1e-5, 1.8e-5 ] ) { // 37 年分のデータでの速さの下限（外側、約 4e-6）〜上限（内側、約 1.7e-5）を含む（progress / ms）

		const scheduler = createCaptionScheduler( { events: list, ...options } );
		const passedAt = new Map();
		const shownAt = new Map();
		const showTimes = [];
		let time = 0;
		let progress = 0;
		scheduler.update( { timeMs: 0, progress: 0 } );
		while ( progress < 1 ) {

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
		// ゆっくりのときは、すべて出る
		if ( speed === 3.6e-6 ) assert.equal( shownAt.size, list.length );

	}

} );

test( 'ANNOT.caption：仕様の値（表示 6000ms、reduced は 8000ms、入れ替えまで最低 3000ms）', () => {

	assert.equal( ANNOT.caption.showMs, 6000 );
	assert.equal( ANNOT.caption.showMsReduced, 8000 );
	assert.equal( ANNOT.caption.minShowMs, 3000 );
	assert.equal( ANNOT.caption.stepMargin, 2 );
	assert.ok( Math.abs( ANNOT.caption.maxStepProgress - 2 * maxProgressPerFrame( 30 ) ) < 1e-15, '期間が分からないときの既定値（30 年分）' );

} );

test( '通過の判定：1 フレームで進みうる量は、データの期間ごとに maxProgressPerFrame( years ) から求める', () => {

	const fx = curveOf( usdjpyDataset() );
	const jgb = curveOf( jgbDataset() );
	assert.ok( fx.years > jgb.years + 10, `${fx.years} 年と ${jgb.years} 年` );
	assert.equal( captionStepLimit( fx.years ), 2 * maxProgressPerFrame( fx.years ) );
	assert.ok( captionStepLimit( jgb.years ) > captionStepLimit( fx.years ), '短いデータほど 1 フレームの進みが大きい' );
	assert.ok( Number.isFinite( captionStepLimit( undefined ) ) && captionStepLimit( undefined ) > 0, '期間が分からないときは既定の年数' );

	// それぞれのデータで、最速（内側の周・下り・100ms のフレーム）でも「飛んだ」と判定されず、
	// その 2 倍を超える変化（デバッグの setProgress など）は飛んだと判定される
	for ( const curve of [ fx, jgb ] ) {

		const limit = captionStepLimit( curve.years );
		const list = [ ev( 'A', 0.5 ) ];

		const normal = createCaptionScheduler( { events: list, ...options, maxStepProgress: limit } );
		normal.update( { timeMs: 0, progress: 0.5 - maxProgressPerFrame( curve.years ) } );
		assert.equal( names( normal.update( { timeMs: 100, progress: 0.5 + 1e-9 } ) ), 'A', '1 フレームで進みうる最大でも通過を拾う' );

		const jump = createCaptionScheduler( { events: list, ...options, maxStepProgress: limit } );
		jump.update( { timeMs: 0, progress: 0.5 - limit * 1.5 } );
		assert.equal( jump.update( { timeMs: 16, progress: 0.5 + limit * 0.6 } ), null, '位置が飛んだときは出さない' );

	}

	// 56 年分のデータで、固定値 0.0036 のままだと飛んだ変化を見逃す（期間に合わせる理由）
	assert.ok( captionStepLimit( fx.years ) < 0.0036 );

} );

test( '通過の判定：期間の違うデータで、各出来事の少し手前から走ると、すべての出来事が 1 回ずつ出る', () => {

	for ( const [ name, dataset, list ] of [
		[ 'usdjpy', usdjpyDataset(), readJson( 'data/events/usdjpy.json' ) ],
		[ 'jgb10', jgbDataset(), readJson( 'data/events/jgb10.json' ) ]
	] ) {

		const curve = curveOf( dataset );
		const resolved = resolveEvents( dataset, ( d ) => curve.dateToProgress( d ), list );
		assert.equal( resolved.length, list.length, name );
		const scheduler = createCaptionScheduler( { events: resolved.map( ( e ) => ( { ...e, name: e.date } ) ), ...options, maxStepProgress: captionStepLimit( curve.years ) } );
		const speed = 0.244 / ( curve.years * 1000 ); // 基準の速さ（progress / ms）
		const shown = [];
		let time = 0;
		for ( const e of resolved ) {

			time += 20000; // 前の表示が消えるまで待つ
			const start = Math.max( 0, e.progress - 0.003 );
			scheduler.update( { timeMs: time, progress: start } ); // 飛んで、手前に着く
			const result = run( scheduler, { from: start, to: Math.min( 1, e.progress + 0.003 ), speed, timeMs: time } );
			time = result.timeMs;
			shown.push( ...result.log.filter( ( x ) => x[ 1 ] !== 'hide' ).map( ( x ) => x[ 1 ] ) );

		}

		assert.equal( shown.length, resolved.length, `${name}：出た ${shown.length} 件` );
		assert.equal( new Set( shown ).size, shown.length );

	}

} );

test( 'scheduler：startProgress があれば、最初のフレームが開始のすぐ後ろの出来事を飛び越えても拾う（最初の update で位置を覚えるだけにしない）', () => {

	const list = [ ev( 'A', 0.0002 ) ];
	const first = { timeMs: 100, progress: 0.0006 }; // 開始後、最初のフレームで A を通過した
	assert.equal( createCaptionScheduler( { events: list, ...options } ).update( first ), null, '指定なし：最初の位置を覚えるだけ' );

	const scheduler = createCaptionScheduler( { events: list, ...options, startProgress: 0 } );
	assert.equal( names( scheduler.update( first ) ), 'A' );
	scheduler.reset();
	assert.equal( names( scheduler.update( first ) ), 'A', 'reset のあとも開始位置から' );

} );
