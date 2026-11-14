// Web Audio のグラフ（音声ファイルは使わず、その場で合成する）。
//
//   パッド（各音 2 つの発振器を detune でずらす）→ ローパス（LFO で揺らす）→ padAmp（LFO）→ padGate
//   音の粒（正弦波を少し FM。先読みで予約）→ 粒ごとのパン → grainFilter → grainGate
//   出来事の鐘（FM）→ fxBus
//   終わりの和音 → 鳴らすたびに作るゲイン
//   それぞれ → dry ／ ディレイ（左右 2 本、フィードバックにローパス）／ 残響（IR はコードで生成）へ送りの量つきで分ける
//   → コンプレッサ → master → 出力
// 一時停止・終了で絞るのは padGate・grainGate（fadeMusic）と master（fadeMaster）。
// 時刻はすべて AudioContext の currentTime の秒で受け取る（OfflineAudioContext で、実時間によらず書き出せる）。
// 音量の変更は必ずランプで行う（rampParam。クリックノイズを出さない）。
//
// createEngine( { AudioContext, contextOptions, context, sound, random } )
//   AudioContext：コンストラクタ（既定は window.AudioContext ?? webkitAudioContext）。OfflineAudioContext を渡すと書き出しに使える
//   contextOptions：コンストラクタへ渡す引数（OfflineAudioContext なら { numberOfChannels, length, sampleRate }）
//   context：作成済みの context をそのまま使う（AudioContext より優先）

import { SOUND } from '../config.js';
import { pickGrain, bellFrequency } from './mapping.js';

/** 再現できる乱数（残響のインパルス応答用）。 */
export function seededRandom( seed ) {

	let a = seed >>> 0;
	return () => {

		a = ( a + 0x6D2B79F5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

/**
 * 残響のインパルス応答：左右で独立なノイズに、seconds で −60 dB になる指数の減衰。一次のローパス（toneHz）で少し丸める。
 * 戻り値は [ 左, 右 ] の Float32Array。
 */
export function impulseResponse( sampleRate, { seconds, preDelaySeconds = 0, toneHz = 6000, seed = 1 } ) {

	const length = Math.max( 1, Math.round( sampleRate * seconds ) );
	const pre = Math.round( sampleRate * preDelaySeconds );
	const random = seededRandom( seed );
	const k = Math.exp( - 2 * Math.PI * toneHz / sampleRate );
	const channels = [ new Float32Array( length ), new Float32Array( length ) ];
	for ( const data of channels ) {

		let y = 0;
		for ( let i = pre; i < length; i ++ ) {

			const t = ( i - pre ) / sampleRate;
			const env = Math.pow( 10, - 3 * t / seconds ); // −60 dB at seconds
			y = ( 1 - k ) * ( random() * 2 - 1 ) + k * y;
			data[ i ] = y * env;

		}

	}

	return channels;

}

/**
 * 値をランプで変える：when の時点の値 from（省略時は今の値 param.value）から、seconds かけて直線で target へ。
 * 始まりの値を必ず setValueAtTime で置く（置かないと、直線のランプは「前のイベントの時刻と値」から引かれ、
 * 前のランプが終わってから時間がたっていると、いきなり途中の値へ飛ぶ = クリックノイズ）。
 * when が未来のときは、その時点の値が今の値と違うことがあるので、呼び出し側が from を渡す。
 */
export function rampParam( param, target, when, seconds, from = param.value ) {

	if ( typeof param.cancelAndHoldAtTime === 'function' ) param.cancelAndHoldAtTime( when );
	else param.cancelScheduledValues( when );
	param.setValueAtTime( from, when );
	param.linearRampToValueAtTime( target, when + Math.max( 0.01, seconds ) );

}

function defaultAudioContext() {

	return globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null;

}

export function createEngine( { AudioContext = defaultAudioContext(), contextOptions, context = null, sound = SOUND, random = Math.random } = {} ) {

	const ac = context ?? ( contextOptions === undefined ? new AudioContext() : new AudioContext( contextOptions ) );

	// ---- 出口：コンプレッサ → master ----
	const compressor = ac.createDynamicsCompressor();
	compressor.threshold.value = sound.compressor.thresholdDb;
	compressor.knee.value = sound.compressor.kneeDb;
	compressor.ratio.value = sound.compressor.ratio;
	compressor.attack.value = sound.compressor.attackSeconds;
	compressor.release.value = sound.compressor.releaseSeconds;
	const master = ac.createGain();
	master.gain.value = 0;
	compressor.connect( master );
	master.connect( ac.destination );

	const dry = ac.createGain();
	dry.connect( compressor );

	// ---- 残響 ----
	const reverbIn = ac.createGain();
	const convolver = ac.createConvolver();
	convolver.normalize = true;
	const ir = impulseResponse( ac.sampleRate, sound.reverb );
	const irBuffer = ac.createBuffer( 2, ir[ 0 ].length, ac.sampleRate );
	irBuffer.getChannelData( 0 ).set( ir[ 0 ] );
	irBuffer.getChannelData( 1 ).set( ir[ 1 ] );
	convolver.buffer = irBuffer;
	const reverbReturn = ac.createGain();
	reverbReturn.gain.value = sound.reverb.returnLevel;
	reverbIn.connect( convolver );
	convolver.connect( reverbReturn );
	reverbReturn.connect( compressor );

	// ---- ディレイ（左右 2 本。フィードバックの経路にローパス）----
	const delayIn = ac.createGain();
	const merger = ac.createChannelMerger( 2 );
	const delayReturn = ac.createGain();
	delayReturn.gain.value = sound.delay.returnLevel;
	[ sound.delay.leftSeconds, sound.delay.rightSeconds ].forEach( ( seconds, channel ) => {

		const delay = ac.createDelay( 4 );
		delay.delayTime.value = seconds;
		const tone = ac.createBiquadFilter();
		tone.type = 'lowpass';
		tone.frequency.value = sound.delay.toneHz;
		const feedback = ac.createGain();
		feedback.gain.value = sound.delay.feedback;
		delayIn.connect( delay );
		delay.connect( tone );
		tone.connect( feedback );
		feedback.connect( delay );
		tone.connect( merger, 0, channel );

	} );
	merger.connect( delayReturn );
	delayReturn.connect( compressor );
	// 反復にも少し残響をかける
	const delayToReverb = ac.createGain();
	delayToReverb.gain.value = 0.3;
	delayReturn.connect( delayToReverb );
	delayToReverb.connect( reverbIn );

	/** source を dry・ディレイ・残響へ送る（送りの量つき）。 */
	function route( source, { dryLevel = 1, delaySend = 0, reverbSend = 0 } ) {

		const sends = [ [ dry, dryLevel ], [ delayIn, delaySend ], [ reverbIn, reverbSend ] ];
		for ( const [ target, level ] of sends ) {

			if ( ! ( level > 0 ) ) continue;
			const g = ac.createGain();
			g.gain.value = level;
			source.connect( g );
			g.connect( target );

		}

	}

	// ---- 音楽のバス（パッドと音の粒。一時停止・終了で padGate・grainGate を絞る）----
	// パッド：各音 → padFilter（ローパス）→ padAmp（LFO で揺らす）→ padGate → dry・ディレイ・残響
	const padFilter = ac.createBiquadFilter();
	padFilter.type = 'lowpass';
	padFilter.frequency.value = sound.pad.cutoffMinHz;
	padFilter.Q.value = sound.pad.q;
	const padAmp = ac.createGain();
	padAmp.gain.value = sound.pad.level;
	padFilter.connect( padAmp );
	const padGate = ac.createGain();
	padAmp.connect( padGate );
	route( padGate, { dryLevel: 1, delaySend: sound.pad.delaySend, reverbSend: sound.pad.reverbSend } );

	const oscillators = [];
	const thirdGains = {};
	// 声部ごとの左右の位置（根音は中央。3 度は長短を同じ位置に）
	const PAD_PAN = { root: 0, fifth: - 0.35, majorThird: 0.2, minorThird: 0.2, ninth: 0.35 };
	for ( const [ name, [ semitones, type, ratio ] ] of Object.entries( sound.pad.voices ) ) {

		const voiceGain = ac.createGain();
		voiceGain.gain.value = name === 'majorThird' || name === 'minorThird' ? ratio * Math.SQRT1_2 : ratio;
		voiceGain.connect( padFilter );
		if ( name === 'majorThird' ) thirdGains.major = { gain: voiceGain, ratio };
		if ( name === 'minorThird' ) thirdGains.minor = { gain: voiceGain, ratio };
		const frequency = sound.rootHz * Math.pow( 2, semitones / 12 );
		const panner = ac.createStereoPanner();
		panner.pan.value = PAD_PAN[ name ] ?? 0;
		panner.connect( voiceGain );
		for ( const sign of [ - 1, 1 ] ) {

			const osc = ac.createOscillator();
			osc.type = type;
			osc.frequency.value = frequency;
			osc.detune.value = sign * sound.pad.detuneCents;
			const half = ac.createGain();
			half.gain.value = 0.5;
			osc.connect( half );
			half.connect( panner );
			oscillators.push( osc );

		}

	}

	// LFO：カットオフと音量のゆっくりした揺れ
	const cutoffLfo = ac.createOscillator();
	cutoffLfo.frequency.value = sound.pad.lfoHz;
	const cutoffDepth = ac.createGain();
	cutoffDepth.gain.value = sound.pad.lfoDepthHz;
	cutoffLfo.connect( cutoffDepth );
	cutoffDepth.connect( padFilter.frequency );
	const ampLfo = ac.createOscillator();
	ampLfo.frequency.value = sound.pad.ampLfoHz;
	const ampDepth = ac.createGain();
	ampDepth.gain.value = sound.pad.level * sound.pad.ampLfoDepth;
	ampLfo.connect( ampDepth );
	ampDepth.connect( padAmp.gain );
	oscillators.push( cutoffLfo, ampLfo );

	// 音の粒：粒ごとのパン → grainFilter → grainGate → dry・ディレイ・残響
	const grainFilter = ac.createBiquadFilter();
	grainFilter.type = 'lowpass';
	grainFilter.frequency.value = sound.grain.cutoffMinHz;
	grainFilter.Q.value = 0.5;
	const grainGate = ac.createGain();
	grainFilter.connect( grainGate );
	route( grainGate, { dryLevel: 1, delaySend: sound.grain.delaySend, reverbSend: sound.grain.reverbSend } );
	const musicParams = [ padGate.gain, grainGate.gain ];

	// 出来事の鐘のバス（padGate・grainGate を通らない）
	const fxBus = ac.createGain();
	route( fxBus, { dryLevel: 1, delaySend: sound.bell.delaySend, reverbSend: sound.bell.reverbSend } );

	let started = false;
	let nextGrainTime = null;
	let lastBellTime = - Infinity;
	let params = null;
	let chord = null;
	// ランプの行き先（未来の時刻からランプを始めるとき、その時点の値として使う）
	let masterLevel = 0;
	let musicLevel = 1;
	const stats = { grainsScheduled: 0, bellsPlayed: 0, chordsPlayed: 0 };

	function grain( when, pick ) {

		const g = sound.grain;
		const carrier = ac.createOscillator();
		carrier.type = 'sine';
		carrier.frequency.value = pick.frequency;
		const mod = ac.createOscillator();
		mod.type = 'sine';
		mod.frequency.value = pick.frequency * g.fmRatio;
		const modGain = ac.createGain();
		const index = pick.frequency * g.fmIndex;
		modGain.gain.setValueAtTime( index, when );
		modGain.gain.exponentialRampToValueAtTime( index * 0.02, when + g.decaySeconds * 0.6 );
		mod.connect( modGain );
		modGain.connect( carrier.frequency );
		const env = ac.createGain();
		env.gain.setValueAtTime( 0, when );
		env.gain.linearRampToValueAtTime( g.level, when + g.attackSeconds );
		env.gain.exponentialRampToValueAtTime( g.level * 0.001, when + g.attackSeconds + g.decaySeconds );
		const panner = ac.createStereoPanner();
		panner.pan.value = pick.pan;
		carrier.connect( env );
		env.connect( panner );
		panner.connect( grainFilter );
		const end = when + g.attackSeconds + g.decaySeconds + 0.05;
		carrier.start( when );
		mod.start( when );
		carrier.stop( end );
		mod.stop( end );
		carrier.onended = () => {

			carrier.disconnect();
			mod.disconnect();
			modGain.disconnect();
			env.disconnect();
			panner.disconnect();

		};
		stats.grainsScheduled ++;

	}

	const engine = {
		context: ac,
		master,
		/** 音楽のバス（パッド）の音量。読み取り用。 */
		musicGain: padGate,
		compressor,
		stats,
		get params() {

			return params;

		},
		get nextGrainTime() {

			return nextGrainTime;

		},

		/** パッドの発振器を動かし始める（1 回だけ）。 */
		start( when = ac.currentTime ) {

			if ( started ) return;
			started = true;
			for ( const osc of oscillators ) osc.start( when );

		},

		/** 音のパラメータ（mapping.js の soundParams）を when から反映する（時定数 paramGlideSeconds で近づく）。 */
		setParams( next, when = ac.currentTime ) {

			params = next;
			const tau = sound.mapping.paramGlideSeconds;
			padFilter.frequency.setTargetAtTime( next.padCutoff, when, tau );
			grainFilter.frequency.setTargetAtTime( next.grainCutoff, when, tau );
			thirdGains.major.gain.gain.setTargetAtTime( thirdGains.major.ratio * next.third.major, when, tau );
			thirdGains.minor.gain.gain.setTargetAtTime( thirdGains.minor.ratio * next.third.minor, when, tau );

		},

		/** 先読み：until（秒）までの音の粒を予約する。from より前に予定があれば from から数え直す（再開のあと）。戻り値は予約した数。 */
		scheduleGrains( from, until ) {

			if ( ! params ) return 0;
			if ( nextGrainTime === null || nextGrainTime < from ) nextGrainTime = from + 0.05;
			let count = 0;
			while ( nextGrainTime < until ) {

				const pick = pickGrain( params, random, sound );
				if ( pick ) {

					grain( nextGrainTime, pick );
					count ++;

				}

				const jitter = 1 + ( random() * 2 - 1 ) * sound.grain.jitter;
				nextGrainTime += params.interval * jitter;

			}

			return count;

		},

		/** 予約を数え直す（一時停止・再開・最初から）。 */
		resetGrains() {

			nextGrainTime = null;

		},

		/** 出来事の鐘（FM）。h は出来事の位置の値の高さ。続けて鳴らすときは minGapSeconds ずらす。戻り値は鳴らした時刻。 */
		bell( when, h ) {

			const b = sound.bell;
			const at = Math.max( when, lastBellTime + b.minGapSeconds );
			lastBellTime = at;
			const f = bellFrequency( h, sound );
			const carrier = ac.createOscillator();
			carrier.frequency.value = f;
			const mod = ac.createOscillator();
			mod.frequency.value = f * b.modRatio;
			const modGain = ac.createGain();
			modGain.gain.setValueAtTime( f * b.modIndex, at );
			modGain.gain.exponentialRampToValueAtTime( f * b.modIndex * 0.01, at + b.modDecaySeconds );
			mod.connect( modGain );
			modGain.connect( carrier.frequency );
			// 1 オクターブ下の柔らかい倍音（三角波）
			const body = ac.createOscillator();
			body.type = 'triangle';
			body.frequency.value = f / 2;
			const bodyGain = ac.createGain();
			bodyGain.gain.value = 0.35;
			body.connect( bodyGain );
			const env = ac.createGain();
			env.gain.setValueAtTime( 0, at );
			env.gain.linearRampToValueAtTime( b.level, at + 0.006 );
			env.gain.exponentialRampToValueAtTime( b.level * 0.001, at + b.decaySeconds );
			carrier.connect( env );
			bodyGain.connect( env );
			env.connect( fxBus );
			const end = at + b.decaySeconds + 0.05;
			for ( const osc of [ carrier, mod, body ] ) {

				osc.start( at );
				osc.stop( end );

			}

			carrier.onended = () => {

				for ( const node of [ carrier, mod, modGain, body, bodyGain, env ] ) node.disconnect();

			};
			stats.bellsPlayed ++;
			return at;

		},

		/** 終わりの和音。戻り値は鳴り終える時刻。 */
		finalChord( when = ac.currentTime ) {

			const f = sound.finish;
			const gain = ac.createGain();
			gain.gain.value = 1;
			route( gain, { dryLevel: 1, reverbSend: f.reverbSend } );
			const voices = [];
			let end = when;
			f.semitones.forEach( ( semitones, i ) => {

				const at = when + i * f.strumSeconds;
				const frequency = sound.rootHz * Math.pow( 2, semitones / 12 );
				const env = ac.createGain();
				const level = f.level / Math.sqrt( f.semitones.length );
				env.gain.setValueAtTime( 0, at );
				env.gain.linearRampToValueAtTime( level, at + f.attackSeconds );
				env.gain.setValueAtTime( level, at + f.attackSeconds + f.holdSeconds );
				env.gain.exponentialRampToValueAtTime( level * 0.001, at + f.attackSeconds + f.holdSeconds + f.releaseSeconds );
				const voiceEnd = at + f.attackSeconds + f.holdSeconds + f.releaseSeconds + 0.05;
				end = Math.max( end, voiceEnd );
				const panner = ac.createStereoPanner();
				panner.pan.value = ( i / Math.max( 1, f.semitones.length - 1 ) ) * 0.8 - 0.4;
				env.connect( panner );
				panner.connect( gain );
				for ( const [ type, ratio, detune ] of [ [ 'sine', 0.7, - 3 ], [ 'triangle', 0.3, 4 ] ] ) {

					const osc = ac.createOscillator();
					osc.type = type;
					osc.frequency.value = frequency;
					osc.detune.value = detune;
					const g = ac.createGain();
					g.gain.value = ratio;
					osc.connect( g );
					g.connect( env );
					osc.start( at );
					osc.stop( voiceEnd );
					voices.push( osc );

				}

			} );
			chord = { gain, voices, end };
			stats.chordsPlayed ++;
			return end;

		},

		/** 鳴っている終わりの和音を seconds かけて消す（最初から）。 */
		stopChord( when = ac.currentTime, seconds = sound.fade.outSeconds ) {

			if ( ! chord ) return;
			rampParam( chord.gain.gain, 0, when, seconds, when > ac.currentTime + 0.02 ? 1 : chord.gain.gain.value );
			for ( const osc of chord.voices ) {

				try {

					osc.stop( when + seconds + 0.05 );

				} catch {

					// すでに止めてある
				}

			}

			chord = null;

		},

		/** パッドと音の粒（音楽のバス）の音量。 */
		fadeMusic( target, when = ac.currentTime, seconds = sound.fade.outSeconds ) {

			const from = when > ac.currentTime + 0.02 ? musicLevel : undefined;
			for ( const param of musicParams ) rampParam( param, target, when, seconds, from ?? param.value );
			musicLevel = target;

		},

		/** マスター音量（target は 0..1 の倍率。1 で SOUND.masterVolume）。 */
		fadeMaster( target, when = ac.currentTime, seconds = sound.fade.outSeconds ) {

			const level = target * sound.masterVolume;
			rampParam( master.gain, level, when, seconds, when > ac.currentTime + 0.02 ? masterLevel : master.gain.value );
			masterLevel = level;

		},

		resume() {

			return typeof ac.resume === 'function' ? ac.resume() : Promise.resolve();

		},

		suspend() {

			return typeof ac.suspend === 'function' ? ac.suspend() : Promise.resolve();

		},

		close() {

			return typeof ac.close === 'function' && ac.state !== 'closed' ? ac.close() : Promise.resolve();

		}
	};

	return engine;

}
