import { readFileSync } from 'node:fs';

export function readJson( relativePath ) {

	return JSON.parse( readFileSync( new URL( `../${relativePath}`, import.meta.url ), 'utf8' ) );

}

export function loadFixtures() {

	return {
		nikkei: readJson( 'data/nikkei225.json' ),
		stations: readJson( 'data/train-yamanote.json' )[ 0 ].station_l
	};

}
