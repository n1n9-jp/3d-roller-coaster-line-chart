// スタート画面の背景で見せるデモ走行の区間を選ぶ（純粋関数。three.js のレンダラにも DOM にも依存しない）。
//
//   chooseDemoRange( curve, options ) → { from, to, fromYear, toYear, variation, maxSlope }
//
// 区間は約 DEMO.years 年の窓。候補の窓（DEMO.stepYears ごとにずらす）のうち、
//   1. 窓の中の「上げ下げの合計」（レールの高さの全変動 Σ|Δy|。週ごとに標本化）がいちばん大きく、
//   2. 窓の中のどこでも、レールの勾配（水平の長さあたり。前後 DEMO.slopeHalfLength の弦）が DEMO.maxSlope 以下
// のものを選ぶ。急すぎる区間（国債金利の 1987 年など）は、一人称の視点が大きく上下に振られて背景として荒れるので避ける。
// 条件 2 を満たす窓がないときは、最大勾配がいちばん小さい窓にする。
// 窓の両端は、データの端から DEMO.edgeYears 年は離す（始点のすぐ後ろはカメラがレールの外になり、終点では 'finish' に近づくため）。

/** デモ走行の定数（config.js は別の担当が編集中なので、ここに置く）。 */
export const DEMO = {
	/** 見せる区間の長さ（年）。 */
	years: 6,
	/** 候補の窓をずらす間隔（年）。 */
	stepYears: 1 / 12,
	/** 高さを標本化する間隔（年）。 */
	sampleYears: 1 / 52,
	/** 勾配の上限（レールの高さ / 水平の長さ）。 */
	maxSlope: 0.35,
	/** 勾配を測る弦の半分の長さ（ワールドの単位。ride.js の RAIL_SLOPE_WINDOW と同じ 5）。 */
	slopeHalfLength: 5,
	/** データの両端から離す年数。 */
	edgeYears: 0.5,
	/** prefers-reduced-motion のときに止めて見せる位置（区間の中の割合）。 */
	stillAt: 0.5
};

/**
 * @param curve TrackCurve（years・progressToYear・getYAt・lengthPerProgressAt を使う）
 * @param options DEMO の一部を差し替える（テスト用）
 */
export function chooseDemoRange( curve, options = {} ) {

	const o = { ...DEMO, ...options };
	const years = curve.years;
	const edge = Math.min( o.edgeYears, years / 4 ) / years;
	const span = Math.min( o.years / years, 1 - 2 * edge );

	// 週ごとの標本：高さと勾配
	const n = Math.max( 2, Math.ceil( years / o.sampleYears ) );
	const ys = new Float64Array( n + 1 );
	const slopes = new Float64Array( n + 1 );
	for ( let i = 0; i <= n; i ++ ) {

		const t = i / n;
		ys[ i ] = curve.getYAt( t );
		const h = o.slopeHalfLength / curve.lengthPerProgressAt( t );
		const t1 = Math.max( 0, t - h ), t2 = Math.min( 1, t + h );
		slopes[ i ] = t2 > t1 ? Math.abs( curve.getYAt( t2 ) - curve.getYAt( t1 ) ) / ( ( t2 - t1 ) * curve.lengthPerProgressAt( t ) ) : 0;

	}

	// 累積の全変動（窓ごとの合計を差で引く）
	const cumulative = new Float64Array( n + 1 );
	for ( let i = 1; i <= n; i ++ ) cumulative[ i ] = cumulative[ i - 1 ] + Math.abs( ys[ i ] - ys[ i - 1 ] );

	const step = o.stepYears / years;
	let best = null; // 勾配の上限を満たす中で全変動が最大
	let gentlest = null; // 上限を満たすものがないとき用：最大勾配が最小
	for ( let from = edge; from + span <= 1 - edge + 1e-9; from += step ) {

		const to = from + span;
		const i0 = Math.round( from * n ), i1 = Math.round( to * n );
		let maxSlope = 0;
		for ( let i = i0; i <= i1; i ++ ) maxSlope = Math.max( maxSlope, slopes[ i ] );
		const candidate = { from, to, variation: cumulative[ i1 ] - cumulative[ i0 ], maxSlope };
		if ( maxSlope <= o.maxSlope && ( ! best || candidate.variation > best.variation ) ) best = candidate;
		if ( ! gentlest || maxSlope < gentlest.maxSlope ) gentlest = candidate;

	}

	const chosen = best ?? gentlest ?? { from: edge, to: edge + span, variation: 0, maxSlope: 0 };
	return {
		...chosen,
		fromYear: curve.progressToYear( chosen.from ),
		toYear: curve.progressToYear( chosen.to )
	};

}

/** prefers-reduced-motion のときに止めて見せる位置（区間の途中）。 */
export function demoStillProgress( range, at = DEMO.stillAt ) {

	return range.from + ( range.to - range.from ) * at;

}
