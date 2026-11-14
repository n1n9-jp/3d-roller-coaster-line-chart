// 小さなイベント発行器。on( name, handler ) と emit( name, payload ) だけ。
// イベント名と payload：
//   'start' 'pause' 'resume' 'restart'    なし（ride.js）
//   'finish'                              { progress }（ride.js。データ区間の終わりで止まったとき）
//   'viewchange'                          { view: 'ride' | 'overview' }（view.js）
//   'yearchange'                          { year, point, dataIndex }（main.js。年が変わったとき）
//   'eventsready'                         { events }（events-data.js。出来事の読み込みが終わったとき 1 回。位置つきの一覧）
//   'infopanel:open'                      { trigger? }（情報パネルを開く。trigger があれば、閉じたときそこへフォーカスを戻す）
//   'infopanel:toggle'                    { trigger? }（開いていれば閉じ、閉じていれば開く）
//   'infopanel:close'                     なし
//   'infopanel:change'                    { open }（infopanel.js。開閉したあとに発行）
// 'start' から 'yearchange' までの payload は specs/contract.md も参照。

export function createEvents() {

	const handlers = new Map();

	return {
		/** handler を登録する。戻り値は登録解除の関数。 */
		on( name, handler ) {

			if ( ! handlers.has( name ) ) handlers.set( name, [] );
			handlers.get( name ).push( handler );
			return () => {

				const list = handlers.get( name );
				const i = list ? list.indexOf( handler ) : - 1;
				if ( i >= 0 ) list.splice( i, 1 );

			};

		},
		/** 登録順に handler を呼ぶ。1 つが例外を投げても、残りは呼ぶ。 */
		emit( name, payload ) {

			const list = handlers.get( name );
			if ( ! list ) return;
			for ( const handler of [ ...list ] ) {

				try {

					handler( payload );

				} catch ( error ) {

					console.error( error );

				}

			}

		}
	};

}
