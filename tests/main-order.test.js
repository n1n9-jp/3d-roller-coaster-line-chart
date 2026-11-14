// main.js の購読の順序（契約 6 章：'viewchange' では main.js の onViewChange の配信が、各モジュールのハンドラより先）。
// main.js はブラウザでしか動かないので、ソースの並びで確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync( new URL( '../assets/js/main.js', import.meta.url ), 'utf8' );

test( "main.js は 'viewchange' と 'restart' を、モジュールの生成（MODULES.map）より前に購読する", () => {

	const create = source.indexOf( 'MODULES.map(' );
	assert.ok( create > 0 );
	for ( const name of [ 'viewchange', 'restart' ] ) {

		const at = source.indexOf( `events.on( '${name}'` );
		assert.ok( at > 0, name );
		assert.ok( at < create, `${name} の購読がモジュールの生成より後` );

	}

} );
