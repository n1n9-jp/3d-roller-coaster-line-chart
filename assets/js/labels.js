// 3D 空間に出すラベル（値ラベル・年ラベル・駅名）の、画面上の矩形の登録と衝突判定。DOM と three.js に依存しない。
//
// 矩形はすべて「中心 x, y と幅 w, 高さ h（CSS px、画面の左上が原点、y は下向き）」。
//
// 俯瞰の優先順位は「出来事の年ラベル ＞ 値ラベルの軸 ＞ 駅名」。モジュールの登録順（main.js の MODULES）は
// scale.js（値ラベル・駅名）→ markers.js（年ラベル）なので、毎フレームの update もこの順に呼ばれる。
// そこで、年ラベルは HUD と年ラベルどうしだけを避けて置き、共有の掲示板（getLabelBoard( ctx )）の 'event' 層に、
// 「このフレームのカメラで年ラベルを置き直して矩形を返す関数」を登録する（provide）。
// scale.js は掲示板の 'event' 層を読み（その場で計算される）、それを避けて軸と駅名を置く。
// 年ラベルの位置は値ラベルに依存しないので循環せず、視点の切り替えやリサイズの直後のフレームでも食い違わない。

/** 2 つの矩形が、margin 以内に近い（重なる）か。 */
export function rectsOverlap( a, b, margin = 0 ) {

	return Math.abs( a.x - b.x ) < ( a.w + b.w ) / 2 + margin && Math.abs( a.y - b.y ) < ( a.h + b.h ) / 2 + margin;

}

/** rect が list のどれかと重なるか。 */
export function collidesAny( rect, list, margin = 0 ) {

	for ( const other of list ) if ( rectsOverlap( rect, other, margin ) ) return true;
	return false;

}

/** rect が viewport（{ width, height }）の内側（inset px 内側）に収まるか。 */
export function insideViewport( rect, viewport, inset = 0 ) {

	return rect.x - rect.w / 2 >= inset && rect.x + rect.w / 2 <= viewport.width - inset
		&& rect.y - rect.h / 2 >= inset && rect.y + rect.h / 2 <= viewport.height - inset;

}

/** 矩形の組のうち、重なっている組（添字の対）の一覧。検証用。 */
export function overlappingPairs( rects, margin = 0 ) {

	const pairs = [];
	for ( let i = 0; i < rects.length; i ++ ) {

		for ( let j = i + 1; j < rects.length; j ++ ) if ( rectsOverlap( rects[ i ], rects[ j ], margin ) ) pairs.push( [ i, j ] );

	}

	return pairs;

}

/**
 * 優先順位つきの配置。items：{ priority（大きいほど優先）, rects: [ 候補の矩形, … ]（先頭ほど望ましい位置） }。
 * 優先順位の高い順（同じなら入力の順）に、候補の位置を先頭から試し、障害物（obstacles）・画面の外・置いたものに
 * 重ならない最初の位置に置く。どの位置も置けなければ隠す（優先順位の低い方が「動く」か「隠れる」）。
 * 戻り値：入力と同じ順の { placed, rect（置いた矩形。隠したときは null）, choice（候補の番号。隠したときは -1） }。
 */
export function placeByPriority( items, { obstacles = [], viewport = null, margin = 0 } = {} ) {

	const order = items.map( ( item, i ) => i ).sort( ( a, b ) => ( items[ b ].priority ?? 0 ) - ( items[ a ].priority ?? 0 ) || a - b );
	const placed = [];
	const result = new Array( items.length );
	for ( const i of order ) {

		const candidates = items[ i ].rects ?? [];
		let chosen = - 1;
		for ( let k = 0; k < candidates.length; k ++ ) {

			const r = candidates[ k ];
			if ( ! ( r.w > 0 && r.h > 0 ) ) continue;
			if ( viewport && ! insideViewport( r, viewport ) ) continue;
			if ( collidesAny( r, obstacles, margin ) || collidesAny( r, placed, margin ) ) continue;
			chosen = k;
			break;

		}

		if ( chosen >= 0 ) {

			placed.push( candidates[ chosen ] );
			result[ i ] = { placed: true, rect: candidates[ chosen ], choice: chosen };

		} else {

			result[ i ] = { placed: false, rect: null, choice: - 1 };

		}

	}

	return result;

}

/**
 * 候補を前から順に置いていき、画面からはみ出すもの、障害物や置いたものに重なるものを間引く（優先順は入力の順）。
 * candidates：{ x, y, w, h, group?, limit?, firstOf? }。w が 0 以下なら置かない。group ごとに limit 個まで。
 * firstOf：同じ値の候補のうち、最初に置けた 1 つだけを置く。戻り値：候補と同じ順の true / false。
 */
export function placeLabels( candidates, obstacles, viewport, margin = 0 ) {

	const placed = [];
	const counts = new Map();
	const firsts = new Set();
	return candidates.map( ( c ) => {

		if ( c.firstOf !== undefined && firsts.has( c.firstOf ) ) return false;
		if ( ! ( c.w > 0 ) || ! insideViewport( c, viewport ) ) return false;
		if ( c.group !== undefined && c.limit !== undefined && ( counts.get( c.group ) ?? 0 ) >= c.limit ) return false;
		if ( collidesAny( c, obstacles, margin ) || collidesAny( c, placed, margin ) ) return false;
		placed.push( c );
		if ( c.firstOf !== undefined ) firsts.add( c.firstOf );
		if ( c.group !== undefined ) counts.set( c.group, ( counts.get( c.group ) ?? 0 ) + 1 );
		return true;

	} );

}

/**
 * 軸のラベルの間隔を広げる（1 次元）。ys：望ましい位置（この順に並べる。出力は昇順）。
 * 出力は ys と同じ長さで、out[ i + 1 ] - out[ i ] >= minGap、順序を保つ。詰まったところは、望ましい位置の平均を中心に広げる
 * （隣り合うかたまりを、重なる限りまとめていく。各かたまりは望ましい位置からのずれの二乗和が最小）。
 * bounds（{ min, max }）があれば、その中に収める（収まりきらないときは min から並べる）。
 */
export function spreadAxis( ys, minGap, bounds = null ) {

	const n = ys.length;
	if ( n === 0 ) return [];
	// かたまり：start（最初の添字）、count、top（最初の位置）
	const blocks = [];
	for ( let i = 0; i < n; i ++ ) {

		blocks.push( { start: i, count: 1, sum: ys[ i ], top: ys[ i ] } );
		while ( blocks.length > 1 ) {

			const b = blocks[ blocks.length - 1 ];
			const a = blocks[ blocks.length - 2 ];
			if ( a.top + a.count * minGap <= b.top ) break;
			// まとめる：各要素 k の位置は top + ( k - start ) * minGap。top は (ys[k] - (k - start) * minGap) の平均
			const count = a.count + b.count;
			const sum = a.sum + b.sum - b.count * a.count * minGap;
			blocks.splice( blocks.length - 2, 2, { start: a.start, count, sum, top: sum / count } );

		}

	}

	const out = new Array( n );
	for ( const b of blocks ) for ( let k = 0; k < b.count; k ++ ) out[ b.start + k ] = b.top + k * minGap;

	if ( bounds ) {

		const { min = - Infinity, max = Infinity } = bounds;
		if ( ( n - 1 ) * minGap > max - min ) {

			for ( let i = 0; i < n; i ++ ) out[ i ] = min + i * minGap;

		} else {

			out[ n - 1 ] = Math.min( out[ n - 1 ], max );
			for ( let i = n - 2; i >= 0; i -- ) out[ i ] = Math.min( out[ i ], out[ i + 1 ] - minGap );
			out[ 0 ] = Math.max( out[ 0 ], min );
			for ( let i = 1; i < n; i ++ ) out[ i ] = Math.max( out[ i ], out[ i - 1 ] + minGap );

		}

	}

	return out;

}

/**
 * ラベルの掲示板：層（'event'、'axis'、'station' など）ごとに、いま画面に出している矩形を持つ。
 * set で層の中身を置き換え、get で読む（層を省くと全部）。
 */
export function createLabelBoard() {

	const layers = new Map();
	const providers = new Map();
	return {
		set( layer, rects ) {

			layers.set( layer, rects.slice() );

		},
		/**
		 * 層の中身を、読むときに計算し直す関数を登録する（provide( layer, null ) で外す）。
		 * 先に update される側が、後から update される側の「このフレームの」矩形を読めるようにするためのもの。
		 */
		provide( layer, fn ) {

			if ( fn ) providers.set( layer, fn );
			else providers.delete( layer );

		},
		clear( layer ) {

			layers.delete( layer );
			providers.delete( layer );

		},
		get( ...names ) {

			const keys = names.length > 0 ? names : [ ...new Set( [ ...layers.keys(), ...providers.keys() ] ) ];
			for ( const k of keys ) if ( providers.has( k ) ) layers.set( k, providers.get( k )().slice() );
			return keys.flatMap( ( k ) => layers.get( k ) ?? [] );

		},
		/** 層ごとの写し（検証用）。 */
		snapshot() {

			return Object.fromEntries( [ ...layers.entries() ].map( ( [ k, v ] ) => [ k, v.map( ( r ) => ( { ...r } ) ) ] ) );

		}
	};

}

/**
 * HUD のパネルの矩形を読む関数を作る（ラベルを重ねない相手）。値ラベル・駅名・年ラベルで同じものを使う。
 * slots：ctx.ui.slots（readout、legend、chart、map、caption、controls）。要素は getBoundingClientRect を持つものなら何でもよい
 * （DOM に依存しない。テストでは偽の要素を渡せる）。操作ボタンの入れ物は横いっぱいに広がることがあるので、ボタンごとに見る。
 * 読み直しは intervalMs ごと（レイアウトの強制計算を毎フレーム起こさない）。画面の大きさ（sizeKey）が変わったときと、
 * invalidate() の後は、すぐに読み直す。戻り値の read( nowMs, sizeKey ) は矩形の配列を返す。
 */
export function createHudReader( slots, { intervalMs = 400 } = {} ) {

	let rects = [];
	let readAt = - Infinity;
	let lastKey = null;

	function readNow() {

		const list = [];
		const push = ( el ) => {

			const r = el?.getBoundingClientRect?.();
			if ( r && r.width > 0 && r.height > 0 ) list.push( { x: ( r.left + r.right ) / 2, y: ( r.top + r.bottom ) / 2, w: r.width, h: r.height } );

		};

		const s = slots ?? {};
		push( s.readout );
		push( s.readout?.querySelector?.( '.ro-badge' ) );
		push( s.legend );
		push( s.chart );
		push( s.map );
		push( s.caption );
		for ( const child of s.controls?.children ?? [] ) push( child );
		return list;

	}

	return {
		read( nowMs, sizeKey = '' ) {

			if ( nowMs - readAt >= intervalMs || sizeKey !== lastKey ) {

				rects = readNow();
				readAt = nowMs;
				lastKey = sizeKey;

			}

			return rects;

		},
		invalidate() {

			readAt = - Infinity;

		}
	};

}

/** ctx に共有の掲示板を 1 つだけ作って返す（ctx.labels）。HUD の矩形の読み取り（board.hud）も 1 つだけ持つ。 */
export function getLabelBoard( ctx ) {

	if ( ! ctx.labels ) {

		ctx.labels = createLabelBoard();
		ctx.labels.hud = createHudReader( ctx.ui?.slots, { intervalMs: 400 } );

	}

	return ctx.labels;

}
