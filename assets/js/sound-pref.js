// 音のオン・オフの設定。値を持ち、変わったときだけ保存して 'soundchange' を同期で発行する。
// 既定はオン。保存先は localStorage のキー 'coaster:sound'（'on' / 'off'）。使えない（例外を投げる）ときも、オンで動く。
// 音を鳴らす側は、クリックの処理の中で AudioContext を開始するため、発行は同期で行う。

export const SOUND_STORAGE_KEY = 'coaster:sound';

function defaultStorage() {

	try {

		return globalThis.localStorage ?? null;

	} catch {

		return null;

	}

}

export function createSoundPref( { events, storage = defaultStorage() } = {} ) {

	let enabled = true;

	try {

		if ( storage?.getItem( SOUND_STORAGE_KEY ) === 'off' ) enabled = false;

	} catch {
		// 読めないときは、既定のオン
	}

	function setEnabled( value ) {

		const next = Boolean( value );
		if ( next === enabled ) return;
		enabled = next;

		try {

			storage?.setItem( SOUND_STORAGE_KEY, enabled ? 'on' : 'off' );

		} catch {
			// 保存できなくても、このページの中では切り替わる
		}

		events?.emit( 'soundchange', { enabled } );

	}

	return {
		get enabled() {

			return enabled;

		},
		setEnabled,
		toggle() {

			setEnabled( ! enabled );

		}
	};

}
