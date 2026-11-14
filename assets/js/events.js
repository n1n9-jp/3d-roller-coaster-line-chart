// 小さなイベント発行器。on( name, handler ) と emit( name, payload ) だけ。
// イベント名：'start' 'pause' 'resume' 'restart' 'finish' 'viewchange' 'yearchange'（payload は specs/contract.md）。

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
