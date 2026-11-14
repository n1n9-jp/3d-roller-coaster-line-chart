// 螺旋のコース（水平）と系列の値（高さ）から、ジェットコースターのレール曲線を作る。
//
// ■ 形：アルキメデスの螺旋。上から見て時計回りに、内側（古い）から外側（新しい）へ進む。
//   ワールド座標は x：東、z：南。角度 θ は北（−z）が 0 で、時計回り（北 → 東 → 南 → 西）に増える。
//     x = r sin θ、z = − r cos θ
//   角度は日付から決める（SPIRAL.yearsPerTurn 年で 1 周。西暦がその倍数の年の 1 月 1 日が北）。
//   年の中の位置は「その年の 1 月 1 日から翌年の 1 月 1 日までの時間の割合」（decimalYear）。
//   半径は、データの最初の日付で innerRadius、そこから経過年数に比例して 1 周ごとに turnGap ずつ広がる。
//
// ■ 進行位置 t（0..1）は時間に比例する。t = 0 が系列の最初の日付、t = 1 が最後の日付。
//   系列の添字ではなく日付で決めるので、営業日のない週が抜けていても角度はずれない
//   （高さは、その日付を挟む 2 つのデータ点を日数で線形補間する。data.js の timeToIndex）。
//   両端で折り返さない（t は 0..1 に収める）。
//
// ■ t は弧長に比例しない（外側の周ほど t あたりの距離が長い）。そのため曲線は次を持つ：
//   lengthPerProgressAt( t )：その位置での「t あたりの水平距離」（車体の傾き・カメラの後ろの点の換算に使う）
//   arcFractionAt( t ) / progressAtArcFraction( f )：t ↔ 弧長（水平）の割合（対応表と線形補間）
//   arcCurve：弧長の割合で引ける曲線（getPointAt / getTangentAt）。レール・支柱・足跡・カーテンの標本化に渡す
//
// three.js のレンダラには依存しないので、Node からもそのまま読み込める。
// （Vector3 だけは three.core.js から相対パスで読む。ブラウザの importmap が指す
//  three.module.js は three.core.js を再エクスポートしているので、同じクラスになる。）

import { Vector3 } from './three.core.js';
import { SPIRAL, Y_MIN, Y_MAX } from './config.js';
import { closeRange, seriesTimes, timeToIndex, indexToTime, toTime } from './data.js';

export const MS_PER_DAY = 86400000;

/** その年の長さ（ms）。 */
function yearLengthMs( year ) {

	return Date.UTC( year + 1, 0, 1 ) - Date.UTC( year, 0, 1 );

}

/** ミリ秒 → 小数の年（その年の 1 月 1 日 0 時（UTC）で整数）。 */
export function decimalYear( ms ) {

	const year = new Date( ms ).getUTCFullYear();
	return year + ( ms - Date.UTC( year, 0, 1 ) ) / yearLengthMs( year );

}

/**
 * 小数の年 → 螺旋の角度（ラジアン。北が 0、時計回りが正）。yearsPerTurn の倍数の年の 1 月 1 日で 2π の整数倍。
 * 年とともに単調に増える（0..2π には収めない。収めるときは normalizeAngle）。
 */
export function spiralAngle( year, yearsPerTurn = SPIRAL.yearsPerTurn ) {

	return 2 * Math.PI * year / yearsPerTurn;

}

/** 角度を 0..2π に収める（北 = 0）。 */
export function normalizeAngle( angle ) {

	const a = angle % ( 2 * Math.PI );
	return a < 0 ? a + 2 * Math.PI : a;

}

const clamp01 = ( t ) => ( t > 0 ? ( t < 1 ? t : 1 ) : 0 );

/**
 * RollerCoaster.js のジオメトリクラスが要求するインターフェース（getPointAt / getTangentAt）を持つ曲線。
 * 引数は進行位置 t（時間に比例）。弧長で等間隔に標本化するときは arcCurve を使う。
 * 戻り値のベクトルは使い回すので、呼び出し側は copy して使うこと。
 */
export class TrackCurve {

	/**
	 * @param series  レールの高さに使う系列（移動平均後。{ date: 'YYYY-MM-DD', close } の配列、日付の昇順）
	 * @param options { yearsPerTurn, innerRadius, turnGap }（省略時は config.js の SPIRAL）
	 */
	constructor( series, { yearsPerTurn = SPIRAL.yearsPerTurn, innerRadius = SPIRAL.innerRadius, turnGap = SPIRAL.turnGap } = {} ) {

		if ( ! Array.isArray( series ) || series.length < 2 ) throw new Error( 'TrackCurve: 系列には 2 点以上が必要です' );

		this.series = series;
		this.yearsPerTurn = yearsPerTurn;
		this.innerRadius = innerRadius;
		this.turnGap = turnGap;

		this.times = seriesTimes( series );
		this.startMs = this.times[ 0 ];
		this.endMs = this.times[ this.times.length - 1 ];
		this.spanMs = this.endMs - this.startMs;
		if ( ! ( this.spanMs > 0 ) ) throw new Error( 'TrackCurve: 系列の日付が昇順ではありません' );

		/** 最初と最後の日付の小数の年。 */
		this.startYear = decimalYear( this.startMs );
		this.endYear = decimalYear( this.endMs );
		/** データの期間（年）。 */
		this.years = this.endYear - this.startYear;
		/** 周の数（小数）。 */
		this.turns = this.years / yearsPerTurn;

		const { min, max } = closeRange( series );
		this.closeMin = min;
		this.closeMax = max;

		this._point = new Vector3();
		this._tangent = new Vector3();

		this._buildArcTable();

		const curve = this;
		/** 弧長（水平）の割合 f（0..1）で引ける曲線。等間隔の f で、等間隔の距離の点を返す。 */
		this.arcCurve = {
			get totalLength() {

				return curve.totalLength;

			},
			getPointAt( f ) {

				return curve.getPointAt( curve.progressAtArcFraction( f ) );

			},
			getTangentAt( f ) {

				return curve.getTangentAt( curve.progressAtArcFraction( f ) );

			}
		};

	}

	// ---- 時間 ----

	/** 進行位置 → 日時（ms）。 */
	timeAt( t ) {

		return this.startMs + clamp01( t ) * this.spanMs;

	}

	/** 日時（ms）→ 進行位置（0..1 に収める）。 */
	progressAtTime( ms ) {

		return clamp01( ( ms - this.startMs ) / this.spanMs );

	}

	/** 日付（'YYYY-MM-DD' または ms）→ 進行位置。範囲外は両端に張り付く。 */
	dateToProgress( date ) {

		return this.progressAtTime( toTime( date ) );

	}

	/** 進行位置 → 小数の年（2008.5 なら 2008 年の半ば）。 */
	progressToYear( t ) {

		return decimalYear( this.timeAt( t ) );

	}

	/** progress → 系列上の位置（小数の添字）。日付で補間する。 */
	progressToIndex( t ) {

		return timeToIndex( this.times, this.timeAt( t ) );

	}

	/** 系列上の位置（小数）→ progress。 */
	indexToProgress( u ) {

		return this.progressAtTime( indexToTime( this.times, u ) );

	}

	/**
	 * 年代の境目の一覧：各周で北を通る点（yearsPerTurn の倍数の年の 1 月 1 日）。データの範囲内（両端を含む）だけ。
	 * @returns {{ year: number, progress: number }[]}
	 */
	decadeBoundaries() {

		const P = this.yearsPerTurn;
		const result = [];
		for ( let year = Math.ceil( Math.floor( this.startYear ) / P ) * P; year <= this.endYear; year += P ) {

			const ms = Date.UTC( year, 0, 1 );
			if ( ms < this.startMs || ms > this.endMs ) continue;
			result.push( { year, progress: this.progressAtTime( ms ) } );

		}

		return result;

	}

	// ---- 形 ----

	/** 小数の年 → 半径。 */
	radiusAtYear( year ) {

		return this.innerRadius + this.turnGap * ( year - this.startYear ) / this.yearsPerTurn;

	}

	/** 進行位置 → 螺旋の角度（北が 0、時計回り。単調に増える）。 */
	angleAt( t ) {

		return spiralAngle( this.progressToYear( t ), this.yearsPerTurn );

	}

	/** 進行位置 → 半径。 */
	radiusAt( t ) {

		return this.radiusAtYear( this.progressToYear( t ) );

	}

	/** 進行位置 → 水平位置 { x, z }。 */
	getXZAt( t ) {

		const year = this.progressToYear( t );
		const r = this.radiusAtYear( year );
		const a = spiralAngle( year, this.yearsPerTurn );
		return { x: r * Math.sin( a ), z: - r * Math.cos( a ) };

	}

	/** 終値 → レールの高さ（ワールド座標の y）。 */
	valueToY( close ) {

		return Y_MIN + ( close - this.closeMin ) / ( this.closeMax - this.closeMin ) * ( Y_MAX - Y_MIN );

	}

	/** 進行位置 → レールの高さ。系列の値を日付で補間する。 */
	getYAt( t ) {

		const n = this.series.length;
		const u = this.progressToIndex( t );
		const i0 = Math.min( n - 1, Math.max( 0, Math.floor( u ) ) );
		const i1 = Math.min( i0 + 1, n - 1 );
		const frac = u - i0;
		return this.valueToY( this.series[ i0 ].close * ( 1 - frac ) + this.series[ i1 ].close * frac );

	}

	getPointAt( t ) {

		t = clamp01( t );
		const { x, z } = this.getXZAt( t );
		return this._point.set( x, this.getYAt( t ), z );

	}

	/** 水平方向の単位接線（y 成分は 0）。螺旋の式から解析的に求める（両端でも反対側の点を混ぜない）。 */
	getTangentAt( t ) {

		const year = this.progressToYear( t );
		const r = this.radiusAtYear( year );
		const a = spiralAngle( year, this.yearsPerTurn );
		// d/dθ ( r sin θ, − r cos θ )。dr/dθ = turnGap / 2π
		const k = this.turnGap / ( 2 * Math.PI );
		const s = Math.sin( a ), c = Math.cos( a );
		return this._tangent.set( k * s + r * c, 0, - k * c + r * s ).normalize();

	}

	/**
	 * 進行位置あたりの水平距離 ds/dt（ワールドの単位 / progress）。
	 * ds/dt = d年/dt × √( ( 2πr / P )² + ( gap / P )² )（P = 1 周の年数）。
	 */
	lengthPerProgressAt( t ) {

		const year = this.progressToYear( t );
		const yearsPerProgress = this.spanMs / yearLengthMs( Math.floor( year ) );
		const r = this.radiusAtYear( year );
		const P = this.yearsPerTurn;
		return yearsPerProgress * Math.hypot( 2 * Math.PI * r / P, this.turnGap / P );

	}

	/** 高さの勾配 dy/dt（速度の計算に使う）。前後 1 日の差分で、端（t = 0 と t = 1）では内側へ寄せた片側差分にする。 */
	getHeightGradientAt( t ) {

		t = clamp01( t );
		const delta = MS_PER_DAY / this.spanMs;
		const t1 = Math.max( 0, t - delta );
		const t2 = Math.min( 1, t + delta );
		if ( t2 <= t1 ) return 0;
		return ( this.getYAt( t2 ) - this.getYAt( t1 ) ) / ( t2 - t1 );

	}

	// ---- 弧長 ----

	/** t ↔ 弧長（水平）の対応表。等間隔の t で標本化し、隣り合う点の弦の長さを積み上げる。 */
	_buildArcTable() {

		// 1 日あたり 1 点強（内側の周でも、弦と弧の差は無視できる）
		const steps = Math.max( 2048, Math.ceil( this.spanMs / MS_PER_DAY * 1.2 ) );
		const cumulative = new Float64Array( steps + 1 );
		let prev = this.getXZAt( 0 );
		let total = 0;
		for ( let i = 1; i <= steps; i ++ ) {

			const p = this.getXZAt( i / steps );
			total += Math.hypot( p.x - prev.x, p.z - prev.z );
			cumulative[ i ] = total;
			prev = p;

		}

		/** 全長（水平の弧長）。 */
		this.totalLength = total;
		this._arcSteps = steps;
		this._arcCumulative = cumulative;

	}

	/** 進行位置 → 弧長の割合（0..1）。 */
	arcFractionAt( t ) {

		t = clamp01( t );
		const steps = this._arcSteps;
		const x = t * steps;
		const i = Math.min( steps - 1, Math.floor( x ) );
		const c = this._arcCumulative;
		return ( c[ i ] + ( c[ i + 1 ] - c[ i ] ) * ( x - i ) ) / this.totalLength;

	}

	/** 弧長の割合（0..1）→ 進行位置。 */
	progressAtArcFraction( f ) {

		f = clamp01( f );
		const c = this._arcCumulative;
		const steps = this._arcSteps;
		const target = f * this.totalLength;
		let lo = 0;
		let hi = steps;
		while ( hi - lo > 1 ) {

			const mid = ( lo + hi ) >> 1;
			if ( c[ mid ] <= target ) lo = mid;
			else hi = mid;

		}

		const span = c[ hi ] - c[ lo ];
		const frac = span > 0 ? ( target - c[ lo ] ) / span : 0;
		return ( lo + frac ) / steps;

	}

}
