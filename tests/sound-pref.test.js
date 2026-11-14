import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSoundPref, SOUND_STORAGE_KEY } from '../assets/js/sound-pref.js';
import { createEvents } from '../assets/js/events.js';

function memoryStorage( initial = {} ) {

	const data = { ...initial };
	return {
		data,
		getItem: ( k ) => ( k in data ? data[ k ] : null ),
		setItem: ( k, v ) => {

			data[ k ] = String( v );

		}
	};

}

const throwing = {
	getItem() {

		throw new Error( 'denied' );

	},
	setItem() {

		throw new Error( 'denied' );

	}
};

test( '既定はオン（値がないとき）', () => {

	assert.equal( createSoundPref( { events: createEvents(), storage: memoryStorage() } ).enabled, true );

} );

test( '保存した値を読み込む', () => {

	assert.equal( createSoundPref( { events: createEvents(), storage: memoryStorage( { [ SOUND_STORAGE_KEY ]: 'off' } ) } ).enabled, false );
	assert.equal( createSoundPref( { events: createEvents(), storage: memoryStorage( { [ SOUND_STORAGE_KEY ]: 'on' } ) } ).enabled, true );
	assert.equal( createSoundPref( { events: createEvents(), storage: memoryStorage( { [ SOUND_STORAGE_KEY ]: 'x' } ) } ).enabled, true );

} );

test( 'storage が例外を投げても、オンで動き、切り替えもできる', () => {

	const events = createEvents();
	const pref = createSoundPref( { events, storage: throwing } );
	assert.equal( pref.enabled, true );
	pref.toggle();
	assert.equal( pref.enabled, false );

} );

test( '値が変わったときだけ、保存して soundchange を発行する', () => {

	const events = createEvents();
	const storage = memoryStorage();
	const got = [];
	events.on( 'soundchange', ( p ) => got.push( p ) );
	const pref = createSoundPref( { events, storage } );

	pref.setEnabled( true );
	assert.deepEqual( got, [] );
	assert.equal( storage.data[ SOUND_STORAGE_KEY ], undefined );

	pref.setEnabled( false );
	assert.deepEqual( got, [ { enabled: false } ] );
	assert.equal( storage.data[ SOUND_STORAGE_KEY ], 'off' );

	pref.setEnabled( false );
	assert.equal( got.length, 1 );

	pref.toggle();
	assert.deepEqual( got.at( - 1 ), { enabled: true } );
	assert.equal( storage.data[ SOUND_STORAGE_KEY ], 'on' );
	assert.equal( got.length, 2 );

} );

test( '発行は同期（呼び出しの中で、すでに値が変わっている）', () => {

	const events = createEvents();
	const pref = createSoundPref( { events, storage: memoryStorage() } );
	let seen = null;
	events.on( 'soundchange', ( { enabled } ) => {

		seen = { enabled, getter: pref.enabled };

	} );
	pref.toggle();
	assert.deepEqual( seen, { enabled: false, getter: false } );

} );
