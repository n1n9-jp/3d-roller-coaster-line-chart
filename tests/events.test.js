import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvents } from '../assets/js/events.js';

test( 'on / emit：登録順に payload つきで呼ばれ、解除できる', () => {

	const events = createEvents();
	const log = [];
	const off = events.on( 'a', ( p ) => log.push( [ 1, p ] ) );
	events.on( 'a', ( p ) => log.push( [ 2, p ] ) );
	events.emit( 'a', 'x' );
	off();
	events.emit( 'a', 'y' );
	events.emit( 'unknown' );
	assert.deepEqual( log, [ [ 1, 'x' ], [ 2, 'x' ], [ 2, 'y' ] ] );

} );

test( 'emit：handler が例外を投げても、残りの handler は呼ばれる', () => {

	const events = createEvents();
	const original = console.error;
	console.error = () => {};
	try {

		let called = false;
		events.on( 'a', () => {

			throw new Error( 'boom' );

		} );
		events.on( 'a', () => {

			called = true;

		} );
		events.emit( 'a' );
		assert.equal( called, true );

	} finally {

		console.error = original;

	}

} );
