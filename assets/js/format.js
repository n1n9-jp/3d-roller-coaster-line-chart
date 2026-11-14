// 値の書式：単位・桁数・前週比の書き方・目盛りの刻みを、データの定義（config.js の DATASETS の 1 件）から作る。
// DOM にも three.js にも依存しない。現在値の帯・ミニグラフ・終了画面・3D の目盛り・出来事のキャプションが、これを共有する。
//
//   const format = createFormatter( DATASETS.usdjpy );   // dataset.format（data.js の buildDataset が作る）
//   format.value( 152.344 )      → '152.34円'    （金利は '1.234%'、日経平均は '38,275円'）
//   format.number( 152.344 )     → '152.34'      （単位なし。数字と単位を別の要素に入れるとき）
//   format.compact( 150 )        → '150円'       （金利 '2%'、日経平均 '2万円'。目盛りやラベル用の短い形）
//   format.label( 150 )          → '150円'       （金利 '2%'、日経平均 '20,000円'。目盛りの値ラベル）
//   format.tick( 20000 )         → '2万'         （単位なし。ミニグラフの Y 軸。ドル円 '100'、金利 '−1'）
//   format.change( 151.2, 150 )  → { text: '前週比 ▲1.20円安（+0.8%）', compactText: '▲1.20円安', direction: 'up' }
//   format.overall( last, first ) → { text: '▼199.50円の円高（−55.8%）', direction: 'down' }（終了画面の「最初の週と比べて …」）
//   format.ticks( min, max )     → { step, axisMin, axisMax, values, labelEvery, labelValues }
//
// マイナスは U+2212「−」（ハイフンより幅が数字に近い）。四捨五入は表示の桁で行う。

export const MINUS = '−'; // U+2212

/** この本数（軸の下限の線も数える）を超えると、ラベルを 1 本おきにする。 */
export const DENSE_LINE_COUNT = 7;

// ---- 日付 ----

/** 'YYYY-MM-DD' → { year, month, day }（数値）。Date を通さないので時差の影響を受けない。 */
export function parseDate( date ) {

	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec( date );
	if ( ! m ) throw new Error( `日付の形式が正しくありません：${date}` );
	return { year: Number( m[ 1 ] ), month: Number( m[ 2 ] ), day: Number( m[ 3 ] ) };

}

/** 'YYYY-MM-DD' → 「2024年7月1日の週」。 */
export function formatWeek( date ) {

	const { year, month, day } = parseDate( date );
	return `${year}年${month}月${day}日の週`;

}

/** 'YYYY-MM-DD' → 「2024年7月」。 */
export function formatYearMonth( date ) {

	const { year, month } = parseDate( date );
	return `${year}年${month}月`;

}

// ---- 値 ----

/** 浮動小数点の誤差を丸める（刻みが小数でも floor / ceil が 1 つずれないように）。 */
function clean( x ) {

	return Math.round( x * 1e9 ) / 1e9;

}

/** 整数部に 3 桁区切りを入れる（Intl に頼らない）。 */
function groupDigits( integerDigits ) {

	return integerDigits.replace( /\B(?=(\d{3})+(?!\d))/g, ',' );

}

/**
 * 数字だけの文字列（符号なし）：絶対値を decimals 桁に四捨五入する。
 * @returns {{ text: string, zero: boolean }} zero：表示の桁で 0 になるか（符号を付けない）
 */
function digits( value, decimals, group ) {

	const text = Math.abs( value ).toFixed( decimals );
	const [ integer, fraction ] = text.split( '.' );
	const shown = ( group ? groupDigits( integer ) : integer ) + ( fraction !== undefined ? `.${fraction}` : '' );
	return { text: shown, zero: Number( text ) === 0 };

}

/** 末尾の 0 を落とす：'150.00' → '150'、'2.50' → '2.5'。 */
function trimZeros( text ) {

	return text.includes( '.' ) ? text.replace( /\.?0+$/, '' ) : text;

}

/** 符号つき（負のときだけ −）。 */
function signed( value, decimals, group ) {

	const { text, zero } = digits( value, decimals, group );
	return ( value < 0 && ! zero ? MINUS : '' ) + text;

}

/**
 * 書式の関数一式を作る。
 * def：{ unit, decimals, group, step, stepCompact?, changeMode }（config.js の DATASETS の 1 件）。
 */
export function createFormatter( def ) {

	const { unit, decimals, group = false, changeMode } = def;
	const step = def.step;
	const stepCompact = def.stepCompact ?? step * 2;
	// 万円単位の短い形（'2万円'）にするか：3 桁区切りで、刻みが 1 万以上のデータ（日経平均）
	const man = group && step >= 10000;

	/** 単位なしの値：'152.34'、'−0.293'、'38,275'。 */
	function number( v ) {

		return signed( v, decimals, group );

	}

	/** 単位つきの値：'152.34円'、'−0.293%'、'38,275円'。 */
	function value( v ) {

		return number( v ) + unit;

	}

	/** 単位なしの短い形。整数の目盛りなら '150'、'2'、'−1'、日経平均は '2万'（0 は '0'）。 */
	function tick( v ) {

		if ( man ) {

			if ( Math.round( v ) === 0 ) return '0';
			if ( v % 10000 === 0 ) return `${v < 0 ? MINUS : ''}${Math.abs( v ) / 10000}万`;

		}

		const { text, zero } = digits( v, decimals, group );
		return ( v < 0 && ! zero ? MINUS : '' ) + trimZeros( text );

	}

	/** 目盛りやラベル用の短い形：'150円'、'2%'、'2万円'。 */
	function compact( v ) {

		return tick( v ) + unit;

	}

	/** 目盛りの値ラベル：'150円'、'2%'、'20,000円'（日経平均も万にしない）。 */
	function label( v ) {

		const { text, zero } = digits( v, group ? 0 : decimals, group );
		return ( v < 0 && ! zero ? MINUS : '' ) + trimZeros( text ) + unit;

	}

	/**
	 * 前週比。previous が無い（最初の週）か、変化率が計算できないときは direction 'none'。
	 * 表示の桁で差が 0 になるときは 'flat'。戻り値：
	 *   { text: '前週比 ▲1.20円安（+0.8%）', compactText: '▲1.20円安', direction: 'up' | 'down' | 'flat' | 'none' }
	 * ドル円の「円安・円高」は、値が上がれば円安、下がれば円高（1 方向だけ）。
	 */
	function change( current, previous ) {

		const none = { text: '前週比 —', compactText: '—', direction: 'none' };
		if ( ! Number.isFinite( current ) || ! Number.isFinite( previous ) ) return none;
		const usesPercent = changeMode !== 'point';
		if ( usesPercent && previous === 0 ) return none;

		const diff = current - previous;
		// 差は、金額の表記（円は整数、為替は小数 2 桁、金利は小数 3 桁）の桁で丸める
		const amountDecimals = changeMode === 'percent' ? 0 : decimals;
		const amount = digits( diff, amountDecimals, group );

		if ( amount.zero ) {

			const zero = `±${amount.text}${changeMode === 'point' ? 'ポイント' : unit}`;
			return {
				text: `前週比 ${zero}`,
				compactText: changeMode === 'percent' ? '±0%' : zero,
				direction: 'flat'
			};

		}

		const up = diff > 0;
		const mark = up ? '▲' : '▼';
		const percent = usesPercent ? Math.abs( diff / previous * 100 ).toFixed( 1 ) : '';
		const percentText = usesPercent ? `（${up ? '+' : MINUS}${percent}%）` : '';
		let body;
		let compactBody;

		if ( changeMode === 'yen-fx' ) {

			body = `${amount.text}${unit}${up ? '安' : '高'}`;
			compactBody = body;

		} else if ( changeMode === 'point' ) {

			body = `${amount.text}ポイント`;
			compactBody = body;

		} else {

			body = `${amount.text}${unit}`;
			compactBody = `${percent}%`;

		}

		return {
			text: `前週比 ${mark}${body}${percentText}`,
			compactText: `${mark}${compactBody}`,
			direction: up ? 'up' : 'down'
		};

	}

	/**
	 * 最初の週と比べた変化（終了画面の「最初の週と比べて ▼199.50円の円高（−55.8%）」の後ろ）。戻り値：{ text, direction }
	 *   ドル円：▼199.50円の円高（−55.8%）　金利：▼2.262ポイント　日経平均：▲12.3%
	 * 変化がない（表示の桁で 0）ときは direction 'flat'：±0.00円、±0.000ポイント、±0.0%。
	 */
	function overall( current, base ) {

		if ( ! Number.isFinite( current ) || ! Number.isFinite( base ) || ( changeMode !== 'point' && base === 0 ) ) {

			return { text: '—', direction: 'none' };

		}

		const diff = current - base;
		const up = diff > 0;
		const mark = up ? '▲' : '▼';
		const percent = changeMode === 'point' ? '' : Math.abs( diff / base * 100 ).toFixed( 1 );

		if ( changeMode === 'percent' ) {

			if ( percent === '0.0' ) return { text: '±0.0%', direction: 'flat' };
			return { text: `${mark}${percent}%`, direction: up ? 'up' : 'down' };

		}

		const amount = digits( diff, decimals, group );
		if ( amount.zero ) return { text: `±${amount.text}${changeMode === 'point' ? 'ポイント' : unit}`, direction: 'flat' };

		if ( changeMode === 'point' ) return { text: `${mark}${amount.text}ポイント`, direction: up ? 'up' : 'down' };

		return {
			text: `${mark}${amount.text}${unit}の${up ? '円安' : '円高'}（${up ? '+' : MINUS}${percent}%）`,
			direction: up ? 'up' : 'down'
		};

	}

	/**
	 * 軸の範囲と目盛り（全データ共通の規則）：axisMin = floor( min / step ) × step、axisMax = ceil( max / step ) × step。
	 * values は axisMin から axisMax まで step ごとの値（下端の線も含む）。
	 * labelEvery：ラベルを何本おきに付けるか（線が 7 本を超えたら 2）。ラベルは「値が step × labelEvery の倍数」の線だけ（labelValues）。
	 * compact が true のときは、狭い画面用の粗い刻み（stepCompact）。
	 */
	function ticks( min, max, { compact: coarse = false } = {} ) {

		const s = coarse ? stepCompact : step;
		const axisMin = clean( Math.floor( clean( min / s ) ) * s ) + 0;
		let axisMax = clean( Math.ceil( clean( max / s ) ) * s ) + 0;
		if ( axisMax <= axisMin ) axisMax = clean( axisMin + s );

		const values = [];
		const count = Math.round( ( axisMax - axisMin ) / s );
		for ( let k = 0; k <= count; k ++ ) values.push( clean( axisMin + k * s ) );

		const labelEvery = values.length > DENSE_LINE_COUNT ? 2 : 1;
		const labelValues = values.filter( ( v ) => Math.round( v / s ) % labelEvery === 0 );
		return { step: s, axisMin, axisMax, values, labelEvery, labelValues };

	}

	return {
		unit,
		decimals,
		changeMode,
		step,
		stepCompact,
		number,
		value,
		tick,
		compact,
		label,
		change,
		overall,
		ticks
	};

}
