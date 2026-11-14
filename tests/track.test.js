// 螺旋のコース（track.js の TrackCurve）：角度と半径、進行位置と日付、両端、弧長の対応。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrackCurve, decimalYear, spiralAngle, normalizeAngle } from '../assets/js/track.js';
import { buildDataset, dateToIndex } from '../assets/js/data.js';
import { Y_MIN, Y_MAX, SPIRAL } from '../assets/js/config.js';
import { series1990 as makeSeries1990, stretchedSeries } from './helpers.js';

const series1990 = makeSeries1990();

// 開始年の違う 3 つのデータ（1971 年始まり 約 5.6 周、1986 年始まり 約 4 周、1990 年始まりの仮のデータ）
const SERIES = [
	[ '1971 年始まり', stretchedSeries( series1990, '1971-01-04', '2026-11-09' ) ],
	[ '1986 年始まり', stretchedSeries( series1990, '1986-07-07', '2026-11-09' ) ],
	[ '1990 年始まり', series1990 ]
];
const curves = SERIES.map( ( [ name, data ] ) => [ name, new TrackCurve( buildDataset( data ).smoothed ) ] );
const sample = new TrackCurve( series1990 );

const DAY_ANGLE = 2 * Math.PI / ( SPIRAL.yearsPerTurn * 365.25 ); // 1 日分の角度
/** 2 つの角度の差（周回を除いた最小の差）。 */
const angleDiff = ( a, b ) => {

	const d = normalizeAngle( a - b );
	return Math.min( d, 2 * Math.PI - d );

};
/** 水平位置の角度（北が 0、時計回り）。 */
const bearing = ( p ) => Math.atan2( p.x, - p.z );

test( 'decimalYear：1 月 1 日で整数、年の途中は時間の割合', () => {

	assert.equal( decimalYear( Date.UTC( 1990, 0, 1 ) ), 1990 );
	assert.equal( decimalYear( Date.UTC( 2000, 0, 1 ) ), 2000 );
	assert.ok( Math.abs( decimalYear( Date.UTC( 2001, 6, 2, 12 ) ) - 2001.5 ) < 1e-12 ); // 2001 年は 365 日。7 月 2 日 12 時が半分
	assert.ok( decimalYear( Date.UTC( 1999, 11, 31, 23 ) ) < 2000 );

} );

test( '設定：1 周 10 年、内側の半径 16、間隔 13（config.js の SPIRAL）。options で変えられる', () => {

	assert.deepEqual( SPIRAL, { yearsPerTurn: 10, innerRadius: 16, turnGap: 13 } );
	const curve = new TrackCurve( series1990, { yearsPerTurn: 5, innerRadius: 20, turnGap: 10 } );
	assert.ok( Math.abs( curve.radiusAt( 0 ) - 20 ) < 1e-9 );
	assert.ok( Math.abs( curve.turns - curve.years / 5 ) < 1e-12 );
	assert.ok( Math.abs( curve.radiusAt( 1 ) - ( 20 + 10 * curve.years / 5 ) ) < 1e-9 );

} );

test( '年代の境目（1980 年・1990 年…の 1 月 1 日）は、開始年の違うどのデータでも北を向く', () => {

	const expectedYears = {
		'1971 年始まり': [ 1980, 1990, 2000, 2010, 2020 ],
		'1986 年始まり': [ 1990, 2000, 2010, 2020 ],
		'1990 年始まり': [ 1990, 2000, 2010, 2020 ]
	};
	for ( const [ name, curve ] of curves ) {

		const boundaries = curve.decadeBoundaries();
		assert.deepEqual( boundaries.map( ( b ) => b.year ), expectedYears[ name ], name );
		for ( const { year, progress } of boundaries ) {

			// 進行位置は、その年の 1 月 1 日
			assert.ok( Math.abs( curve.timeAt( progress ) - Date.UTC( year, 0, 1 ) ) < 1, `${name} ${year}` );
			assert.ok( Math.abs( curve.dateToProgress( `${year}-01-01` ) - progress ) < 1e-12 );
			assert.ok( Math.abs( curve.progressToYear( progress ) - year ) < 1e-9 );
			// 北（x = 0、z < 0）
			const p = curve.getXZAt( progress );
			assert.ok( Math.abs( p.x ) < 1e-6 && p.z < 0, `${name} ${year}: ${p.x}, ${p.z}` );
			assert.ok( angleDiff( curve.angleAt( progress ), 0 ) < 1e-9, `${name} ${year}` );
			assert.ok( Math.abs( - p.z - curve.radiusAt( progress ) ) < 1e-6 );

		}

		// 半径は 1 周ごとに turnGap ずつ外へ
		for ( let i = 1; i < boundaries.length; i ++ ) {

			const r0 = curve.radiusAt( boundaries[ i - 1 ].progress );
			const r1 = curve.radiusAt( boundaries[ i ].progress );
			assert.ok( Math.abs( r1 - r0 - SPIRAL.turnGap ) < 1e-6, `${name}: 周の間隔 ${r1 - r0}` );

		}

	}

	// 1990 年 1 月 1 日始まりのデータは、始点（t = 0）が境目
	assert.equal( sample.decadeBoundaries()[ 0 ].progress, 0 );

} );

test( '同じ月日は、どの年代でも同じ角度（1975 年・1985 年・1995 年…の 6 月 30 日。うるう年の違いは 1 日分まで）。データが違っても同じ', () => {

	const isLeap = ( year ) => new Date( Date.UTC( year, 1, 29 ) ).getUTCMonth() === 1;
	for ( const monthDay of [ '01-01', '03-15', '06-30', '09-01', '12-31' ] ) {

		const angles = [];
		for ( const [ name, curve ] of curves ) {

			for ( let year = 1971; year <= 2025; year ++ ) {

				const date = `${year}-${monthDay}`;
				const ms = Date.parse( `${date}T00:00:00Z` );
				if ( ms < curve.startMs || ms > curve.endMs ) continue;
				angles.push( { name, year, leap: isLeap( year ), angle: bearing( curve.getXZAt( curve.dateToProgress( date ) ) ) } );

			}

		}

		for ( const a of angles ) {

			// 年代の中の同じ年（西暦の下 1 桁が同じ）で、うるう年でない最初の年と比べる
			const base = angles.find( ( b ) => ! b.leap && ( b.year - a.year ) % SPIRAL.yearsPerTurn === 0 );
			if ( ! base ) continue;

			// うるう年は 2 月 29 日の分だけ（3 月以降で 1 日分まで）ずれる。それ以外の年はぴったり同じ
			const limit = a.leap ? DAY_ANGLE * 1.01 : 1e-9;
			assert.ok( angleDiff( a.angle, base.angle ) < limit, `${monthDay} ${a.name} ${a.year}: ${angleDiff( a.angle, base.angle )}` );

		}

		// 比べた組が十分にある（下 1 桁ごとに複数の年代）
		assert.ok( angles.length > 100 );

	}

	// 角度は暦だけで決まる（spiralAngle）：2001 年の真ん中は 1.5 年分 = 0.15 周
	assert.ok( angleDiff( spiralAngle( 2001.5 ), 2 * Math.PI * 0.15 ) < 1e-9 );
	assert.ok( angleDiff( spiralAngle( decimalYear( Date.UTC( 2001, 6, 2, 12 ) ) ), 2 * Math.PI * 0.15 ) < 1e-9 );

} );

test( '上から見て時計回り（北 → 東 → 南 → 西）、内側から外側へ', () => {

	for ( const [ name, curve ] of curves ) {

		// 角度も半径も単調に増える
		let prevAngle = - Infinity;
		let prevRadius = - Infinity;
		for ( let i = 0; i <= 400; i ++ ) {

			const t = i / 400;
			const a = curve.angleAt( t );
			const r = curve.radiusAt( t );
			assert.ok( a > prevAngle && r > prevRadius, `${name} t=${t}` );
			prevAngle = a;
			prevRadius = r;
			const p = curve.getXZAt( t );
			assert.ok( Math.abs( Math.hypot( p.x, p.z ) - r ) < 1e-9 );

		}

	}

	// 1990 年 1 月（北）の 2.5 年後は東、5 年後は南、7.5 年後は西
	const at = ( date ) => sample.getXZAt( sample.dateToProgress( date ) );
	const east = at( '1992-07-02' );
	const south = at( '1995-01-01' );
	const west = at( '1997-07-02' );
	assert.ok( east.x > 0 && Math.abs( east.z ) < 0.2, JSON.stringify( east ) );
	assert.ok( south.z > 0 && Math.abs( south.x ) < 1e-6, JSON.stringify( south ) );
	assert.ok( west.x < 0 && Math.abs( west.z ) < 0.2, JSON.stringify( west ) );

} );

test( '高さ：t = 0 は最初の週、t = 1 は最後の週の高さ。範囲は Y_MIN..Y_MAX', () => {

	const curve = new TrackCurve( series1990 );
	assert.ok( Math.abs( curve.getPointAt( 0 ).y - curve.valueToY( series1990[ 0 ].close ) ) < 1e-9 );
	assert.ok( Math.abs( curve.getPointAt( 1 ).y - curve.valueToY( series1990.at( - 1 ).close ) ) < 1e-9 );
	assert.ok( Math.abs( curve.valueToY( curve.closeMin ) - Y_MIN ) < 1e-9 );
	assert.ok( Math.abs( curve.valueToY( curve.closeMax ) - Y_MAX ) < 1e-9 );
	for ( let i = 0; i <= 500; i ++ ) {

		const y = curve.getPointAt( i / 500 ).y;
		assert.ok( y >= Y_MIN - 1e-9 && y <= Y_MAX + 1e-9 );

	}

	// 各週の日付の位置で、その週の値の高さ
	for ( const i of [ 1, 100, 1000, series1990.length - 2 ] ) {

		const t = curve.dateToProgress( series1990[ i ].date );
		assert.ok( Math.abs( curve.getYAt( t ) - curve.valueToY( series1990[ i ].close ) ) < 1e-9, `i=${i}` );

	}

} );

test( 't = 0 と t = 1 で折り返さない：t = 1 の点は外の端で、範囲外は端に張り付く', () => {

	for ( const [ name, curve ] of curves ) {

		const end = curve.getPointAt( 1 ).clone();
		const start = curve.getPointAt( 0 ).clone();
		// 外の端：半径が最大（内側の半径 + 間隔 × 周の数）。始点は内側の半径
		assert.ok( Math.abs( Math.hypot( end.x, end.z ) - ( SPIRAL.innerRadius + SPIRAL.turnGap * curve.turns ) ) < 1e-6, name );
		assert.ok( Math.abs( Math.hypot( start.x, start.z ) - SPIRAL.innerRadius ) < 1e-9, name );
		// 終点は直前の点のすぐ隣（中心へ飛ばない）
		const before = curve.getPointAt( 1 - 1e-6 ).clone();
		assert.ok( end.distanceTo( before ) < 0.01, `${name}: ${end.distanceTo( before )}` );
		// 範囲外は端
		assert.ok( curve.getPointAt( 1.2 ).distanceTo( end ) < 1e-9 );
		assert.ok( curve.getPointAt( 1 + 1e-9 ).distanceTo( end ) < 1e-9 );
		assert.ok( curve.getPointAt( - 0.3 ).distanceTo( start ) < 1e-9 );
		// 標本化の終わり（同梱の RollerCoaster.js は i / D を D まで引く）で、隣の標本との距離は 1 区間分
		const D = 2000;
		const a = curve.arcCurve.getPointAt( ( D - 1 ) / D ).clone();
		const b = curve.arcCurve.getPointAt( 1 ).clone();
		assert.ok( Math.hypot( a.x - b.x, a.z - b.z ) < 1.5 * curve.totalLength / D, name );

	}

} );

test( '接線：水平な単位ベクトルで、進行方向を向く。両端で反対側の点を混ぜない', () => {

	for ( const [ name, curve ] of curves ) {

		for ( const t of [ 0, 1e-7, 0.01, 0.2, 0.37, 0.5, 0.73, 0.95, 1 - 1e-7, 1 ] ) {

			const tangent = curve.getTangentAt( t ).clone();
			assert.equal( tangent.y, 0 );
			assert.ok( Math.abs( tangent.length() - 1 ) < 1e-9 );
			// 差分の向き（両端では内側だけを使う）
			const a = curve.getXZAt( Math.max( 0, t - 1e-5 ) );
			const b = curve.getXZAt( Math.min( 1, t + 1e-5 ) );
			const len = Math.hypot( b.x - a.x, b.z - a.z );
			const dot = ( tangent.x * ( b.x - a.x ) + tangent.z * ( b.z - a.z ) ) / len;
			assert.ok( dot > 0.9999, `${name} t=${t} dot=${dot}` );

		}

		// 弧長で引ける曲線の接線も同じ
		const f = 0.5;
		const t = curve.progressAtArcFraction( f );
		assert.ok( curve.arcCurve.getTangentAt( f ).clone().distanceTo( curve.getTangentAt( t ).clone() ) < 1e-12 );

	}

} );

test( '高さの勾配：両端では内側の片側差分（反対側の高さを混ぜない）', () => {

	const curve = new TrackCurve( buildDataset( series1990 ).smoothed );
	const h = 86400000 / curve.spanMs;
	const g0 = curve.getHeightGradientAt( 0 );
	assert.ok( Math.abs( g0 - ( curve.getYAt( h ) - curve.getYAt( 0 ) ) / h ) < 1e-6 );
	const g1 = curve.getHeightGradientAt( 1 );
	assert.ok( Math.abs( g1 - ( curve.getYAt( 1 ) - curve.getYAt( 1 - h ) ) / h ) < 1e-6 );
	assert.equal( curve.getHeightGradientAt( 1.5 ), g1 );
	assert.ok( Number.isFinite( curve.getHeightGradientAt( 0.5 ) ) );

} );

test( 't あたりの水平距離：位置ごとの差分と一致し、外側の周ほど長い', () => {

	for ( const [ name, curve ] of curves ) {

		for ( const t of [ 0.001, 0.1, 0.5, 0.9, 0.999 ] ) {

			const h = 1e-6;
			const a = curve.getXZAt( t - h );
			const b = curve.getXZAt( t + h );
			const numeric = Math.hypot( b.x - a.x, b.z - a.z ) / ( 2 * h );
			const analytic = curve.lengthPerProgressAt( t );
			assert.ok( Math.abs( numeric / analytic - 1 ) < 1e-4, `${name} t=${t}: ${numeric} / ${analytic}` );

		}

		assert.ok( curve.lengthPerProgressAt( 0.9 ) > 2 * curve.lengthPerProgressAt( 0.05 ), name );

	}

} );

test( '弧長：全長は折れ線の長さと一致。弧長の割合で引いた点は等間隔。t ↔ 弧長の割合は往復で一致する', () => {

	for ( const [ name, curve ] of curves ) {

		// 全長は、細かく標本化した折れ線の長さとほぼ同じ
		let length = 0;
		let prev = curve.getXZAt( 0 );
		for ( let i = 1; i <= 200000; i ++ ) {

			const p = curve.getXZAt( i / 200000 );
			length += Math.hypot( p.x - prev.x, p.z - prev.z );
			prev = p;

		}

		assert.ok( Math.abs( length / curve.totalLength - 1 ) < 1e-4, `${name}: ${length} / ${curve.totalLength}` );
		assert.equal( curve.arcCurve.totalLength, curve.totalLength );

		// 等間隔：隣り合う点の距離が、全長 / 分割数の ±1%（内側の周でも外側の周でも）
		const D = 3000;
		const step = curve.totalLength / D;
		let prevP = curve.arcCurve.getPointAt( 0 ).clone();
		let min = Infinity;
		let max = 0;
		for ( let i = 1; i <= D; i ++ ) {

			const p = curve.arcCurve.getPointAt( i / D ).clone();
			const d = Math.hypot( p.x - prevP.x, p.z - prevP.z );
			min = Math.min( min, d );
			max = Math.max( max, d );
			prevP = p;

		}

		assert.ok( min > step * 0.99 && max < step * 1.01, `${name}: ${min}..${max}（${step}）` );

		// 往復
		assert.equal( curve.arcFractionAt( 0 ), 0 );
		assert.ok( Math.abs( curve.arcFractionAt( 1 ) - 1 ) < 1e-12 );
		for ( const t of [ 0, 0.001, 0.123, 0.5, 0.77, 0.999, 1 ] ) {

			assert.ok( Math.abs( curve.progressAtArcFraction( curve.arcFractionAt( t ) ) - t ) < 1e-9, `${name} t=${t}` );

		}

		for ( const f of [ 0, 0.01, 0.4, 0.95, 1 ] ) {

			assert.ok( Math.abs( curve.arcFractionAt( curve.progressAtArcFraction( f ) ) - f ) < 1e-9, `${name} f=${f}` );

		}

		// 内側の周は t あたりの距離が短いので、弧長の割合は t より遅れる
		assert.ok( curve.arcFractionAt( 0.3 ) < 0.3, name );

	}

} );

test( '日付 ↔ t：往復で一致し、t は時間に比例する（系列の添字とは日付で対応する）', () => {

	const curve = new TrackCurve( series1990 );
	const dataset = buildDataset( series1990 );
	assert.equal( curve.dateToProgress( series1990[ 0 ].date ), 0 );
	assert.equal( curve.dateToProgress( series1990.at( - 1 ).date ), 1 );
	assert.equal( curve.dateToProgress( '1980-01-01' ), 0 ); // 範囲外は端
	assert.equal( curve.dateToProgress( '2099-01-01' ), 1 );

	for ( const i of [ 0, 1, 17, 500, 1234, series1990.length - 1 ] ) {

		const t = curve.dateToProgress( series1990[ i ].date );
		assert.ok( Math.abs( curve.indexToProgress( i ) - t ) < 1e-12, `i=${i}` );
		assert.ok( Math.abs( curve.progressToIndex( t ) - i ) < 1e-9, `i=${i}` );
		assert.ok( Math.abs( curve.timeAt( t ) - Date.parse( `${series1990[ i ].date}T00:00:00Z` ) ) < 1e-3 );

	}

	// 時間に比例：t = 0.5 は最初と最後の日付の真ん中
	assert.ok( Math.abs( curve.timeAt( 0.5 ) - ( curve.startMs + curve.endMs ) / 2 ) < 1e-3 );

	// 系列の添字との対応は data.js の dateToIndex と同じ
	for ( const date of [ '1995-05-17', '2008-09-15', '2020-03-01' ] ) {

		assert.ok( Math.abs( curve.progressToIndex( curve.dateToProgress( date ) ) - dateToIndex( dataset, date ) ) < 1e-9, date );

	}

	for ( const u of [ 0, 0.5, 100.25, series1990.length - 1.5, series1990.length - 1 ] ) {

		assert.ok( Math.abs( curve.progressToIndex( curve.indexToProgress( u ) ) - u ) < 1e-9, `u=${u}` );

	}

	// t → 年
	assert.ok( Math.abs( curve.progressToYear( 0 ) - 1990 ) < 1e-12 );
	assert.equal( Math.floor( curve.progressToYear( curve.dateToProgress( '2008-06-30' ) ) ), 2008 );

} );

test( '週が 1 つ抜けたデータでも、各週は日付どおりの角度と高さ（添字で決めない）', () => {

	const full = new TrackCurve( series1990 );
	const gap = series1990.filter( ( _, i ) => i !== 700 ); // 700 番目の週を抜く
	const curve = new TrackCurve( gap );
	assert.equal( curve.startMs, full.startMs );
	assert.equal( curve.endMs, full.endMs );

	for ( const item of [ series1990[ 699 ], series1990[ 701 ], series1990[ 1500 ], series1990[ 1800 ], series1990.at( - 1 ) ] ) {

		const a = full.getXZAt( full.dateToProgress( item.date ) );
		const b = curve.getXZAt( curve.dateToProgress( item.date ) );
		assert.ok( Math.hypot( a.x - b.x, a.z - b.z ) < 1e-9, item.date );
		assert.ok( Math.abs( curve.getYAt( curve.dateToProgress( item.date ) ) - curve.valueToY( item.close ) ) < 1e-9 );

	}

	// 抜けた週の日付は、前後の週の間を日数で補間した位置（添字 699.5）
	assert.ok( Math.abs( curve.progressToIndex( curve.dateToProgress( series1990[ 700 ].date ) ) - 699.5 ) < 1e-9 );

} );
