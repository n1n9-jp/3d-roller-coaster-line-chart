// 音：写像（audio/mapping.js）、エンジン（audio/engine.js。AudioContext を模したオブジェクトで組み立て）、
// sound.js のイベントへの追従。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOUND, START_PROGRESS } from '../assets/js/config.js';
import {
	normalizeValue, expLerp, stepFrequency, grainCenterStep, padCutoff, grainCutoff, slopeColor, smoothToward,
	thirdMix, grainInterval, pickGrain, bellFrequency, passedEvents, soundParams
} from '../assets/js/audio/mapping.js';
import { createEngine, impulseResponse, rampParam } from '../assets/js/audio/engine.js';
import { createSound, slopePerYearAt } from '../assets/js/sound.js';
import { createEvents } from '../assets/js/events.js';
import { captionStepLimit } from '../assets/js/events-data.js';

const near = ( a, b, eps = 1e-9 ) => assert.ok( Math.abs( a - b ) <= eps, `${a} ≉ ${b}` );

// ---- 写像 ----

test( 'normalizeValue：最小 0・最大 1・中間、範囲外は端、数でない・範囲 0 は 0.5', () => {

	assert.equal( normalizeValue( 75, 75, 359 ), 0 );
	assert.equal( normalizeValue( 359, 75, 359 ), 1 );
	near( normalizeValue( 217, 75, 359 ), 0.5 );
	assert.equal( normalizeValue( 10, 75, 359 ), 0 );
	assert.equal( normalizeValue( 999, 75, 359 ), 1 );
	assert.equal( normalizeValue( NaN, 0, 1 ), 0.5 );
	assert.equal( normalizeValue( 1, 2, 2 ), 0.5 );

} );

test( '値の高さ → カットオフ：0 で下限、1 で上限、中間は幾何平均（指数の補間）、範囲外は端', () => {

	const { cutoffMinHz: lo, cutoffMaxHz: hi } = SOUND.pad;
	near( padCutoff( 0 ), lo );
	near( padCutoff( 1 ), hi );
	near( padCutoff( 0.5 ), Math.sqrt( lo * hi ), 1e-6 );
	near( padCutoff( - 3 ), lo );
	near( padCutoff( 7 ), hi );
	near( grainCutoff( 1 ), SOUND.grain.cutoffMaxHz );
	assert.ok( grainCutoff( 0.3 ) < grainCutoff( 0.6 ) );
	near( expLerp( 100, 400, NaN ), 200, 1e-9 );

} );

test( '値の高さ → 音の粒の音域：0 で stepLow、1 で stepHigh、範囲外は端', () => {

	const g = SOUND.grain;
	assert.equal( grainCenterStep( 0 ), g.stepLow );
	assert.equal( grainCenterStep( 1 ), g.stepHigh );
	near( grainCenterStep( 0.5 ), ( g.stepLow + g.stepHigh ) / 2 );
	assert.equal( grainCenterStep( - 1 ), g.stepLow );
	assert.equal( grainCenterStep( 2 ), g.stepHigh );

} );

test( 'stepFrequency：5 段で 1 オクターブ、負の段も音階の上', () => {

	const scale = [ 0, 2, 4, 7, 9 ];
	near( stepFrequency( 0, scale, 110 ), 110 );
	near( stepFrequency( 5, scale, 110 ), 220 );
	near( stepFrequency( 3, scale, 110 ), 110 * Math.pow( 2, 7 / 12 ) );
	near( stepFrequency( - 1, scale, 110 ), 55 * Math.pow( 2, 9 / 12 ) );

} );

test( '勾配 → 色：平らで 0、上りで正（明るい）、下りで負、なめらかに飽和、数でなければ 0', () => {

	assert.equal( slopeColor( 0 ), 0 );
	assert.ok( slopeColor( 3 ) > 0 && slopeColor( 3 ) < slopeColor( 6 ) );
	assert.ok( slopeColor( - 3 ) < 0 );
	near( slopeColor( - 4 ), - slopeColor( 4 ) );
	assert.ok( slopeColor( 1000 ) <= 1 && slopeColor( 1000 ) > 0.999 );
	assert.ok( slopeColor( - 1000 ) >= - 1 );
	assert.equal( slopeColor( NaN ), 0 );

} );

test( '色の切り替わりはなめらか：smoothToward は時定数で近づき、dt 0 では変えない', () => {

	near( smoothToward( 0, 1, 1, 1 ), 1 - Math.exp( - 1 ) );
	assert.equal( smoothToward( 0.3, 1, 0, 1 ), 0.3 );
	assert.equal( smoothToward( null, 0.7, 0.1, 1 ), 0.7 );
	// 1/60 秒ごとに 10 秒：ほぼ目標
	let c = - 1;
	for ( let i = 0; i < 600; i ++ ) c = smoothToward( c, 1, 1 / 60, SOUND.mapping.colorSmoothingSeconds );
	assert.ok( c > 0.95 );

} );

test( '色 → 長 3 度・短 3 度の混ぜ方：両端で片方だけ、中間で等しく、電力は一定', () => {

	assert.deepEqual( thirdMix( 1 ), { major: 1, minor: 0 } );
	assert.deepEqual( thirdMix( - 1 ), { major: 0, minor: 1 } );
	const mid = thirdMix( 0 );
	near( mid.major, mid.minor );
	for ( const c of [ - 0.7, 0.2, 0.9, 5 ] ) {

		const m = thirdMix( c );
		near( m.major ** 2 + m.minor ** 2, 1 );

	}

} );

test( '速さ → 音の粒の間隔：基準で intervalCruise、速いほど短く、範囲に収まり、不正な値は基準', () => {

	const g = SOUND.grain;
	near( grainInterval( 1 ), g.intervalCruise );
	assert.ok( grainInterval( 2 ) < grainInterval( 1.2 ) );
	assert.ok( grainInterval( 0.85 ) > grainInterval( 1 ) );
	assert.equal( grainInterval( 100 ), g.intervalMin );
	assert.equal( grainInterval( 0.01 ), g.intervalMax );
	near( grainInterval( 0 ), g.intervalCruise );
	near( grainInterval( NaN ), g.intervalCruise );
	// 走行の速さの範囲（SPEED.minFactor 0.85 .. maxFactor 2.5）では、上限・下限に張り付かず変わる
	assert.ok( grainInterval( 2.5 ) >= g.intervalMin && grainInterval( 2.5 ) < grainInterval( 2 ) );

} );

test( 'pickGrain：休符、音階は色の確率、段は音域の中心 ±spread', () => {

	const seq = ( values ) => {

		let i = 0;
		return () => values[ i ++ % values.length ];

	};
	assert.equal( pickGrain( { h: 0.5, color: 0 }, seq( [ 0 ] ) ), null ); // 0 < restProbability
	const bright = pickGrain( { h: 1, color: 1 }, seq( [ 0.99, 0.99, 0.5, 0.5 ] ) );
	assert.equal( bright.scale, SOUND.scales.bright );
	assert.equal( bright.step, SOUND.grain.stepHigh );
	const dark = pickGrain( { h: 0, color: - 1 }, seq( [ 0.99, 0.01, 0.5, 0.5 ] ) );
	assert.equal( dark.scale, SOUND.scales.dark );
	for ( let i = 0; i < 200; i ++ ) {

		const p = pickGrain( { h: 0.3, color: 0.2 } );
		if ( ! p ) continue;
		assert.ok( Math.abs( p.step - grainCenterStep( 0.3 ) ) <= SOUND.grain.spread + 0.5 );
		assert.ok( Math.abs( p.pan ) <= SOUND.grain.pan );

	}

} );

test( 'bellFrequency：値が高いほど高い', () => {

	assert.ok( bellFrequency( 1 ) > bellFrequency( 0 ) );
	near( bellFrequency( 0 ), stepFrequency( SOUND.bell.stepLow, SOUND.scales.bright ) );

} );

test( 'soundParams：範囲外の入力を収める', () => {

	const p = soundParams( { h: 3, color: - 9, speedRatio: 1 } );
	assert.equal( p.h, 1 );
	assert.equal( p.color, - 1 );
	near( p.padCutoff, SOUND.pad.cutoffMaxHz );
	assert.deepEqual( p.third, { major: 0, minor: 1 } );
	near( p.interval, SOUND.grain.intervalCruise );

} );

// ---- 出来事の通過 ----

const EVENTS = [ { progress: 0.1, title: 'a' }, { progress: 0.1005, title: 'b' }, { progress: 0.5, title: 'c' } ];
const STEP = captionStepLimit( 40 );

test( 'passedEvents：区間 ( 前回, 今回 ] にある出来事を位置の順に返す', () => {

	assert.deepEqual( passedEvents( 0.0999, 0.1, EVENTS, STEP ).map( ( e ) => e.title ), [ 'a' ] );
	assert.deepEqual( passedEvents( 0.1, 0.1001, EVENTS, STEP ), [] ); // 前回ちょうどの位置は含めない
	assert.deepEqual( passedEvents( 0.0999, 0.1006, EVENTS, STEP ).map( ( e ) => e.title ), [ 'a', 'b' ] );
	assert.deepEqual( passedEvents( 0.2, 0.2001, EVENTS, STEP ), [] );

} );

test( 'passedEvents：位置が飛んだ（1 フレームの進みが上限を超える）ときは返さない', () => {

	assert.ok( 0.5 - 0.0999 > STEP );
	assert.deepEqual( passedEvents( 0.0999, 0.5, EVENTS, STEP ), [] );
	// 上限ちょうどは通常の通過
	assert.deepEqual( passedEvents( 0.5 - STEP, 0.5, EVENTS, STEP ).map( ( e ) => e.title ), [ 'c' ] );

} );

test( 'passedEvents：巻き戻った・進んでいない・前回がないときは返さない', () => {

	assert.deepEqual( passedEvents( 0.1001, 0.0999, EVENTS, STEP ), [] );
	assert.deepEqual( passedEvents( 0.1, 0.1, EVENTS, STEP ), [] );
	assert.deepEqual( passedEvents( null, 0.1, EVENTS, STEP ), [] );
	assert.deepEqual( passedEvents( 0.0999, 0.1, null, STEP ), [] );

} );

// ---- AudioContext を模したオブジェクト ----

class FakeParam {

	constructor( value = 0 ) {

		this.value = value;
		this.calls = [];

	}

	setValueAtTime( v, t ) {

		this.calls.push( [ 'set', v, t ] );
		this.value = v;
		return this;

	}

	linearRampToValueAtTime( v, t ) {

		this.calls.push( [ 'linear', v, t ] );
		this.target = v; // 模擬：ランプの行き先
		return this;

	}

	exponentialRampToValueAtTime( v, t ) {

		assert.ok( v > 0, 'exponentialRamp の値は正' );
		this.calls.push( [ 'exp', v, t ] );
		return this;

	}

	setTargetAtTime( v, t, tau ) {

		this.calls.push( [ 'target', v, t, tau ] );
		return this;

	}

	cancelScheduledValues( t ) {

		this.calls.push( [ 'cancel', t ] );
		return this;

	}

}

class FakeNode {

	constructor( ac, params = {} ) {

		this.context = ac;
		this.connections = [];
		for ( const [ k, v ] of Object.entries( params ) ) this[ k ] = new FakeParam( v );
		ac.nodes.push( this );

	}

	connect( target ) {

		this.connections.push( target );
		return target;

	}

	disconnect() {

		this.connections = [];

	}

	start( t ) {

		this.startedAt = t;

	}

	stop( t ) {

		this.stoppedAt = t;

	}

}

class FakeAudioContext {

	static instances = [];

	constructor() {

		this.currentTime = 0;
		this.sampleRate = 8000;
		this.state = 'running';
		this.nodes = [];
		this.destination = { connections: [] };
		this.log = [];
		FakeAudioContext.instances.push( this );

	}

	createGain() {

		return new FakeNode( this, { gain: 1 } );

	}

	createOscillator() {

		const n = new FakeNode( this, { frequency: 440, detune: 0 } );
		n.type = 'sine';
		return n;

	}

	createBiquadFilter() {

		return new FakeNode( this, { frequency: 350, Q: 1 } );

	}

	createDelay() {

		return new FakeNode( this, { delayTime: 0 } );

	}

	createConvolver() {

		return new FakeNode( this );

	}

	createDynamicsCompressor() {

		return new FakeNode( this, { threshold: - 24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 } );

	}

	createStereoPanner() {

		return new FakeNode( this, { pan: 0 } );

	}

	createChannelMerger() {

		return new FakeNode( this );

	}

	createBuffer( channels, length ) {

		const data = Array.from( { length: channels }, () => new Float32Array( length ) );
		return { getChannelData: ( i ) => data[ i ] };

	}

	resume() {

		this.log.push( 'resume' );
		this.state = 'running';
		return Promise.resolve();

	}

	suspend() {

		this.log.push( 'suspend' );
		this.state = 'suspended';
		return Promise.resolve();

	}

	close() {

		this.state = 'closed';
		return Promise.resolve();

	}

}

test( 'engine：模した AudioContext で組み立て、パッドを始め、粒を先読みで予約し、鐘・終わりの和音を鳴らす', () => {

	const engine = createEngine( { AudioContext: FakeAudioContext, random: () => 0.5 } );
	const ac = engine.context;
	assert.ok( ac instanceof FakeAudioContext );
	assert.equal( engine.master.gain.value, 0, 'マスターは 0 から（フェードインで上げる）' );
	engine.start( 0 );
	const oscs = ac.nodes.filter( ( n ) => n.frequency && n.startedAt === 0 );
	assert.ok( oscs.length >= 10 );
	engine.setParams( soundParams( { h: 0.5, color: 0, speedRatio: 1 } ), 0 );
	const n = engine.scheduleGrains( 0, 10 );
	// 間隔 intervalCruise（random 0.5 で揺らぎなし）で 10 秒、休符なし（0.5 > restProbability）
	assert.equal( n, Math.ceil( ( 10 - 0.05 ) / SOUND.grain.intervalCruise ) );
	assert.equal( engine.scheduleGrains( 0, 10 ), 0, '予約済みは重ねない' );
	const t1 = engine.bell( 1, 0.5 );
	const t2 = engine.bell( 1, 0.5 );
	near( t2 - t1, SOUND.bell.minGapSeconds );
	assert.equal( engine.stats.bellsPlayed, 2 );
	const end = engine.finalChord( 2 );
	assert.ok( end > 2 + SOUND.finish.attackSeconds + SOUND.finish.holdSeconds );
	engine.fadeMaster( 1, 0, 0.5 );
	assert.equal( engine.master.gain.target, SOUND.masterVolume );

} );

test( 'rampParam：始まりの値を置いてから直線のランプ（いきなり値を変えない）。未来から始めるときは from', () => {

	const p = new FakeParam( 0.3 );
	rampParam( p, 0, 2, 0.5 );
	assert.deepEqual( p.calls, [ [ 'cancel', 2 ], [ 'set', 0.3, 2 ], [ 'linear', 0, 2.5 ] ] );
	const q = new FakeParam( 0 );
	rampParam( q, 0, 9, 2, 0.5 );
	assert.deepEqual( q.calls, [ [ 'cancel', 9 ], [ 'set', 0.5, 9 ], [ 'linear', 0, 11 ] ] );

} );

test( 'impulseResponse：seconds の長さで、末尾ほど小さく、左右が違う', () => {

	const [ l, r ] = impulseResponse( 8000, { seconds: 2, seed: 3 } );
	assert.equal( l.length, 16000 );
	const rms = ( a, from, to ) => Math.sqrt( a.slice( from, to ).reduce( ( s, x ) => s + x * x, 0 ) / ( to - from ) );
	assert.ok( rms( l, 0, 1000 ) > 10 * rms( l, 15000, 16000 ) );
	assert.notEqual( l[ 100 ], r[ 100 ] );

} );

// ---- sound.js ----

function fakeCurve() {

	// 前半は上り、後半は下り（高さ 3..35）
	return { years: 40, getPointAt: ( t ) => ( { y: t < 0.5 ? 3 + 64 * t : 35 - 64 * ( t - 0.5 ) } ) };

}

function setup( { soundSetting, AudioContext = FakeAudioContext } = {} ) {

	FakeAudioContext.instances = [];
	const events = createEvents();
	const ride = { started: false, paused: false, finished: false, progress: START_PROGRESS, factor: 1 };
	const listeners = {};
	const doc = { hidden: false, addEventListener: ( name, fn ) => ( listeners[ name ] = fn ), removeEventListener: () => {} };
	const timers = [];
	const ctx = { events, ride, curve: fakeCurve(), dataset: { rawRange: { min: 100, max: 200 } } };
	if ( soundSetting !== undefined ) ctx.sound = soundSetting;
	const sound = createSound( ctx, {
		AudioContext,
		document: doc,
		random: () => 0.5,
		setTimeout: ( fn, ms ) => timers.push( { fn, ms } ),
		clearTimeout: () => {}
	} );
	const state = ( extra = {} ) => ( { progress: ride.progress, deltaMs: 16, started: ride.started, paused: ride.paused, finished: ride.finished, point: { close: 150 }, ...extra } );
	const flush = () => {

		while ( timers.length ) timers.shift().fn();

	};
	return { events, ride, sound, doc, listeners, state, flush, timers, ctx: () => FakeAudioContext.instances[ 0 ] };

}

test( 'sound：乗車前は AudioContext を作らず、update でも音を出さない', () => {

	const s = setup();
	s.sound.update( s.state() );
	s.events.emit( 'soundchange', { enabled: true } );
	assert.equal( FakeAudioContext.instances.length, 0 );
	assert.equal( s.sound.debug.getState().contextState, 'none' );
	assert.equal( s.sound.debug.getState().masterGain, 0 );

} );

test( "sound：'start' で AudioContext を作って resume し、マスターをフェードインする。update で粒を予約する", () => {

	const s = setup();
	s.ride.started = true;
	s.events.emit( 'start' );
	assert.equal( FakeAudioContext.instances.length, 1 );
	const engine = s.sound.debug.engine;
	assert.equal( engine.master.gain.target, SOUND.masterVolume );
	assert.equal( s.sound.debug.getState().contextState, 'running' );
	s.ctx().currentTime = 5;
	s.sound.update( s.state() );
	assert.ok( s.sound.debug.getState().grainsScheduled >= 1 );
	assert.ok( engine.params.h > 0.49 && engine.params.h < 0.51 );

} );

test( "sound：'start' のときに suspended なら resume() を呼ぶ", () => {

	class Suspended extends FakeAudioContext {

		constructor() {

			super();
			this.state = 'suspended';

		}

	}
	const s = setup( { AudioContext: Suspended } );
	s.ride.started = true;
	s.events.emit( 'start' );
	assert.deepEqual( s.ctx().log, [ 'resume' ] );

} );

test( "sound：'pause' で音量を 0 へ、'resume' で戻す。一時停止中は粒を予約しない", () => {

	const s = setup();
	s.ride.started = true;
	s.events.emit( 'start' );
	const master = s.sound.debug.engine.master.gain;
	s.ride.paused = true;
	s.events.emit( 'pause' );
	assert.equal( master.target, 0 );
	const before = s.sound.debug.getState().grainsScheduled;
	s.ctx().currentTime = 20;
	s.sound.update( s.state() );
	assert.equal( s.sound.debug.getState().grainsScheduled, before );
	s.ride.paused = false;
	s.events.emit( 'resume' );
	assert.equal( master.target, SOUND.masterVolume );

} );

test( "sound：'soundchange' でオン・オフ（オフは 0 へランプして suspend、オンは resume してフェードイン）", () => {

	const s = setup();
	s.ride.started = true;
	s.events.emit( 'start' );
	const master = s.sound.debug.engine.master.gain;
	s.events.emit( 'soundchange', { enabled: false } );
	assert.equal( master.target, 0 );
	assert.equal( s.sound.debug.getState().enabled, false );
	s.flush();
	assert.equal( s.ctx().state, 'suspended' );
	s.events.emit( 'soundchange', { enabled: true } );
	assert.equal( s.ctx().state, 'running' );
	assert.equal( master.target, SOUND.masterVolume );

} );

test( 'sound：ctx.sound.enabled が false なら、乗車しても作らない。あとからオンにすると、そこで作って鳴らす', () => {

	const s = setup( { soundSetting: { enabled: false } } );
	s.ride.started = true;
	s.events.emit( 'start' );
	assert.equal( FakeAudioContext.instances.length, 0 );
	assert.equal( s.sound.debug.getState().enabled, false );
	s.events.emit( 'soundchange', { enabled: true } );
	assert.equal( FakeAudioContext.instances.length, 1 );
	assert.equal( s.sound.debug.engine.master.gain.target, SOUND.masterVolume );

} );

test( 'sound：一時停止中にオンにしても鳴らさない（再開で鳴らす）', () => {

	const s = setup( { soundSetting: { enabled: false } } );
	s.ride.started = true;
	s.events.emit( 'start' );
	s.ride.paused = true;
	s.events.emit( 'pause' );
	s.events.emit( 'soundchange', { enabled: true } );
	assert.equal( FakeAudioContext.instances.length, 0 );
	s.ride.paused = false;
	s.events.emit( 'resume' );
	assert.equal( FakeAudioContext.instances.length, 1 );

} );

test( "sound：'finish' で終わりの和音を鳴らし、そのあとマスターを 0 へ。'restart' で戻す", () => {

	const s = setup();
	s.ride.started = true;
	s.events.emit( 'start' );
	const engine = s.sound.debug.engine;
	s.ride.finished = true;
	s.events.emit( 'finish', { progress: 1 } );
	assert.equal( engine.stats.chordsPlayed, 1 );
	const calls = engine.master.gain.calls.filter( ( c ) => c[ 0 ] === 'linear' );
	const last = calls.at( - 1 );
	assert.equal( last[ 1 ], 0 );
	assert.ok( last[ 2 ] > SOUND.finish.attackSeconds + SOUND.finish.holdSeconds, '和音のあとで 0 へ' );
	s.flush();
	assert.equal( s.ctx().state, 'suspended' );
	s.ride.finished = false;
	s.events.emit( 'restart' );
	assert.equal( s.ctx().state, 'running' );
	assert.equal( engine.master.gain.target, SOUND.masterVolume );

} );

test( 'sound：出来事の通過で鐘。位置が飛んだときは鳴らさない', () => {

	const s = setup();
	s.events.emit( 'eventsready', { events: [ { progress: 0.01, value: 180 }, { progress: 0.6, value: null } ] } );
	s.ride.started = true;
	s.events.emit( 'start' );
	const step = captionStepLimit( 40 ) / 2;
	for ( let p = 0; p < 0.012; p += step ) {

		s.ride.progress = p;
		s.sound.update( s.state() );

	}

	assert.equal( s.sound.debug.getState().bellsPlayed, 1 );
	s.ride.progress = 0.7; // 飛ぶ
	s.sound.update( s.state() );
	assert.equal( s.sound.debug.getState().bellsPlayed, 1 );

} );

test( 'sound：タブが隠れたら suspend、戻ったら（走行中なら）resume', () => {

	const s = setup();
	s.ride.started = true;
	s.events.emit( 'start' );
	s.doc.hidden = true;
	s.listeners.visibilitychange();
	assert.equal( s.ctx().state, 'suspended' );
	s.doc.hidden = false;
	s.listeners.visibilitychange();
	assert.equal( s.ctx().state, 'running' );
	// 一時停止中に戻ったときは resume しない
	s.ride.paused = true;
	s.events.emit( 'pause' );
	s.doc.hidden = true;
	s.listeners.visibilitychange();
	s.doc.hidden = false;
	s.listeners.visibilitychange();
	assert.equal( s.ctx().state, 'suspended' );

} );

test( 'sound：Web Audio がない環境では何もしない（例外を出さない）', () => {

	const s = setup( { AudioContext: null } );
	s.ride.started = true;
	s.events.emit( 'start' );
	s.sound.update( s.state() );
	assert.equal( s.sound.debug.getState().contextState, 'none' );
	s.sound.dispose();

} );

test( 'slopePerYearAt：上りで正、下りで負、曲線に年数がなければ 0', () => {

	const curve = fakeCurve();
	assert.ok( slopePerYearAt( curve, 0.2 ) > 0 );
	assert.ok( slopePerYearAt( curve, 0.8 ) < 0 );
	near( slopePerYearAt( curve, 0.2, 1 ), 64 / 40, 1e-9 );
	assert.equal( slopePerYearAt( { getPointAt: () => ( { y: 0 } ) }, 0.5 ), 0 );

} );

test( 'main.js：createSound を MODULES に登録し、?debug の __coaster に sound を出す', async () => {

	const { readFileSync } = await import( 'node:fs' );
	const source = readFileSync( new URL( '../assets/js/main.js', import.meta.url ), 'utf8' );
	assert.match( source, /^\s*createSound\b/m );
	assert.match( source, /sound: modules\.find/ );

} );
