// データに連動するアンビエントサウンド（Web Audio でその場で合成。音声ファイルは使わない）。
//
//   値の高さ → 音の粒の音域とローパスの明るさ／勾配 → 和音の色（上りで明るく、下りで暗く）／速さ → 音の粒の密度／
//   出来事の通過 → 鐘／終点 → 終わりの和音。写像は audio/mapping.js、音のグラフは audio/engine.js、値は config.js の SOUND。
//
// 始まり：AudioContext は 'start'（「乗車する」のクリックの処理の中で同期して発行される。ui/start.js → main.js の
//   startScreen.ready( () => ride.start() ) → ride.js の start() → events.emit( 'start' )）を受けたときに作って resume() する。
//   ブラウザの自動再生の制限（と iOS）では、ユーザー操作の中で作る・始める必要があるため。
// 音のオン・オフ：初期値は ctx.sound.enabled（なければオン）。'soundchange' { enabled } で切り替える（ボタンのクリックの中で
//   同期して発行される。オフのまま乗車して、あとからオンにしたときも、そこで AudioContext を作る）。
// 一時停止・終了でフェードアウト、再開・最初からでフェードイン。終了では終わりの和音を鳴らしてから静かにする。
// タブが隠れたら suspend()、戻ったら（走行中で音がオンなら）resume()。乗車前は音を出さない（AudioContext も作らない）。

import { SOUND, START_PROGRESS, Y_MIN, Y_MAX } from './config.js';
import { createEngine } from './audio/engine.js';
import { normalizeValue, slopeColor, smoothToward, soundParams, passedEvents } from './audio/mapping.js';
import { captionStepLimit } from './events-data.js';

/** 進行位置 t の前後 windowYears 年の弦の勾配（1 年あたりのレールの高さの変化）。曲線が持たなければ 0。 */
export function slopePerYearAt( curve, t, windowYears = SOUND.mapping.slopeWindowYears ) {

	const years = curve?.years > 0 ? curve.years : null;
	if ( ! years || typeof curve.getPointAt !== 'function' ) return 0;
	const half = windowYears / 2 / years;
	const t1 = Math.max( 0, t - half );
	const t2 = Math.min( 1, t + half );
	if ( ! ( t2 > t1 ) ) return 0;
	return ( curve.getPointAt( t2 ).y - curve.getPointAt( t1 ).y ) / ( ( t2 - t1 ) * years );

}

/**
 * @param ctx 共有の ctx（events・ride・curve・dataset・sound を使う）
 * @param options テスト用の差し替え：{ AudioContext, createEngine, document, sound, setTimeout, clearTimeout, random }
 */
export function createSound( ctx, options = {} ) {

	const sound = options.sound ?? SOUND;
	const makeEngine = options.createEngine ?? createEngine;
	const AudioContextClass = 'AudioContext' in options ? options.AudioContext : ( globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null );
	const doc = 'document' in options ? options.document : globalThis.document;
	const setTimer = options.setTimeout ?? globalThis.setTimeout.bind( globalThis );
	const clearTimer = options.clearTimeout ?? globalThis.clearTimeout.bind( globalThis );
	const { events, ride, curve, dataset } = ctx;

	let enabled = ctx.sound ? Boolean( ctx.sound.enabled ) : true;
	let engine = null;
	let unavailable = false;
	let eventList = [];
	let previous = null;
	let color = null;
	let h = 0.5;
	let lastParamTime = - Infinity;
	let suspendTimer = null;
	const maxStep = captionStepLimit( curve?.years );
	const range = dataset?.rawRange ?? null;

	const now = () => engine.context.currentTime;
	const hidden = () => Boolean( doc?.hidden );
	/** 走行中で音がオン（鳴っているべき状態）。 */
	const audible = () => enabled && ride.started && ! ride.paused && ! ride.finished;

	/** AudioContext を作る（1 回だけ）。作れない環境（Web Audio がない）では、以後は何もしない。 */
	function ensureEngine() {

		if ( engine || unavailable ) return Boolean( engine );
		if ( ! AudioContextClass && ! options.createEngine ) {

			unavailable = true;
			return false;

		}

		try {

			engine = makeEngine( { AudioContext: AudioContextClass, sound, random: options.random } );
			engine.start( engine.context.currentTime );

		} catch ( error ) {

			console.warn( '音を鳴らせませんでした（Web Audio を使えません）。音なしで続けます', error );
			engine = null;
			unavailable = true;

		}

		return Boolean( engine );

	}

	function resumeContext() {

		if ( ! engine || hidden() ) return;
		const state = engine.context.state;
		if ( state !== 'running' && state !== 'closed' ) engine.resume()?.catch?.( () => {} );

	}

	function clearSuspend() {

		if ( suspendTimer !== null ) clearTimer( suspendTimer );
		suspendTimer = null;

	}

	/** seconds 後に、まだ condition() が真なら suspend する（フェードアウトを待ってから止める）。 */
	function suspendLater( seconds, condition ) {

		clearSuspend();
		suspendTimer = setTimer( () => {

			suspendTimer = null;
			if ( engine && condition() ) engine.suspend()?.catch?.( () => {} );

		}, Math.max( 0, seconds * 1000 ) );

	}

	function heightAt( t ) {

		if ( typeof curve?.getPointAt !== 'function' ) return 0.5;
		return normalizeValue( curve.getPointAt( Math.min( 1, Math.max( 0, t ) ) ).y, Y_MIN, Y_MAX );

	}

	function currentHeight( point, t ) {

		if ( point && range && Number.isFinite( point.close ) ) return normalizeValue( point.close, range.min, range.max );
		return heightAt( t );

	}

	function writeParams( time ) {

		engine.setParams( soundParams( { h, color, speedRatio: ride.factor }, sound ), time );
		lastParamTime = time;

	}

	/** 鳴らし始める・再開する（フェードイン）。 */
	function begin() {

		if ( ! audible() || ! ensureEngine() ) return;
		clearSuspend();
		resumeContext();
		const t = now();
		h = currentHeight( null, ride.progress );
		if ( color === null ) color = slopeColor( slopePerYearAt( curve, ride.progress, sound.mapping.slopeWindowYears ), sound.mapping );
		writeParams( t );
		engine.resetGrains();
		engine.fadeMusic( 1, t, sound.fade.inSeconds );
		engine.fadeMaster( 1, t, sound.fade.inSeconds );

	}

	/** 消音（フェードアウト）。 */
	function silence() {

		if ( ! engine ) return;
		engine.fadeMaster( 0, now(), sound.fade.outSeconds );

	}

	const offs = [
		events.on( 'eventsready', ( payload ) => {

			eventList = Array.isArray( payload?.events ) ? payload.events.filter( ( e ) => Number.isFinite( e?.progress ) ) : [];

		} ),
		events.on( 'start', () => {

			previous = START_PROGRESS;
			if ( enabled ) begin();

		} ),
		events.on( 'pause', () => silence() ),
		events.on( 'resume', () => begin() ),
		events.on( 'restart', () => {

			previous = START_PROGRESS;
			color = null;
			if ( engine ) engine.stopChord( now(), sound.fade.outSeconds );
			begin();

		} ),
		events.on( 'finish', () => {

			if ( ! engine || ! enabled ) return;
			const t = now();
			engine.fadeMusic( 0, t, sound.fade.outSeconds );
			const end = engine.finalChord( t + 0.05 );
			engine.fadeMaster( 0, end, sound.finish.fadeOutSeconds );
			suspendLater( end - t + sound.finish.fadeOutSeconds + 0.3, () => ride.finished );

		} ),
		events.on( 'soundchange', ( payload ) => {

			const next = Boolean( payload?.enabled );
			if ( next === enabled ) return;
			enabled = next;
			if ( enabled ) begin();
			else if ( engine ) {

				silence();
				suspendLater( sound.fade.outSeconds + 0.05, () => ! enabled );

			}

		} )
	];

	function onVisibility() {

		if ( ! engine ) return;
		if ( hidden() ) {

			clearSuspend();
			engine.suspend()?.catch?.( () => {} );

		} else if ( audible() ) resumeContext();

	}

	doc?.addEventListener?.( 'visibilitychange', onVisibility );

	const debug = {
		/** 読み取り用（?debug の window.__coaster.sound）。 */
		getState() {

			return {
				enabled,
				contextState: engine ? engine.context.state : 'none',
				masterGain: engine ? engine.master.gain.value : 0,
				grainsScheduled: engine ? engine.stats.grainsScheduled : 0,
				bellsPlayed: engine ? engine.stats.bellsPlayed : 0,
				chordsPlayed: engine ? engine.stats.chordsPlayed : 0,
				events: eventList.length,
				params: engine?.params ?? null
			};

		},
		/** 検証用：audio/engine.js のエンジン（作る前は null）。 */
		get engine() {

			return engine;

		}
	};

	return {
		debug,

		update( state ) {

			const progress = state.progress;
			if ( ! engine || ! audible() || hidden() || ! state.started ) {

				if ( state.started ) previous = progress;
				return;

			}

			const t = now();
			h = currentHeight( state.point, progress );
			const target = slopeColor( slopePerYearAt( curve, progress, sound.mapping.slopeWindowYears ), sound.mapping );
			color = smoothToward( color, target, ( state.deltaMs ?? 0 ) / 1000, sound.mapping.colorSmoothingSeconds );
			if ( t - lastParamTime >= sound.mapping.paramUpdateSeconds || t < lastParamTime ) writeParams( t );
			engine.scheduleGrains( t, t + sound.grain.lookaheadSeconds );

			for ( const event of passedEvents( previous, progress, eventList, maxStep ) ) {

				const eventHeight = range && Number.isFinite( event.value ) ? normalizeValue( event.value, range.min, range.max ) : heightAt( event.progress );
				engine.bell( t + 0.02, eventHeight );

			}

			previous = progress;

		},

		onReset() {

			previous = START_PROGRESS;

		},

		dispose() {

			for ( const off of offs ) off();
			doc?.removeEventListener?.( 'visibilitychange', onVisibility );
			clearSuspend();
			engine?.close()?.catch?.( () => {} );
			engine = null;

		}
	};

}
