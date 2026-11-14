import { test } from 'node:test';
import assert from 'node:assert/strict';
import { focusTargetAfterClose } from '../assets/js/ui/endscreen.js';

const controls = ( { pause = false, view = false, restart = false, info = false } = {} ) => [
	{ id: 'pause-btn', disabled: pause },
	{ id: 'view-btn', hidden: view },
	{ id: 'restart-btn', disabled: restart },
	{ id: 'info-btn', disabled: info }
];

test( '終了画面を閉じたあと：俯瞰と Esc は視点のボタン（一時停止は最後の週で止まったあと無効）', () => {

	assert.equal( focusTargetAfterClose( 'overview', controls( { pause: true } ) ), 'view-btn' );
	assert.equal( focusTargetAfterClose( 'overview', controls() ), 'view-btn' );

} );

test( '終了画面を閉じたあと：「もう一度乗る」は一時停止のボタン', () => {

	assert.equal( focusTargetAfterClose( 'restart', controls() ), 'pause-btn' );

} );

test( '移す先が無効や非表示のときは、最初の有効なボタン', () => {

	assert.equal( focusTargetAfterClose( 'restart', controls( { pause: true } ) ), 'view-btn' );
	assert.equal( focusTargetAfterClose( 'overview', controls( { view: true } ) ), 'pause-btn' );
	assert.equal( focusTargetAfterClose( 'overview', controls( { pause: true, view: true } ) ), 'restart-btn' );
	assert.equal( focusTargetAfterClose( 'overview', controls( { pause: true, view: true, restart: true } ) ), 'info-btn' );

} );

test( '移せるボタンがないときは null', () => {

	assert.equal( focusTargetAfterClose( 'overview', controls( { pause: true, view: true, restart: true, info: true } ) ), null );
	assert.equal( focusTargetAfterClose( 'overview', [] ), null );

} );
