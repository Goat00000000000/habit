// OUTPLAYED: when the rival commits a read and none of its read bullets hit within 0.6 s, the player beat the read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, createInput, step } from '../src/game.js';
import { record } from '../src/habit.js';

// Round 3 with a strong "dodges left when shot at" habit, player standing still until the read shot fires.
function untilReadShot() {
  const s = newState();
  const input = createInput();
  for (const last of [null, 'still', 'shoot', 'move:W', 'move:E', 'dash:W']) {
    for (const dist of ['close', 'mid', 'far']) {
      for (let i = 0; i < 10; i++) record(s.model, { dist, shotAt: true, lowHp: false, last }, 'dash:W');
    }
  }
  s.round = 2;
  input.clicked = true;
  step(s, input, 1 / 60);
  s.player.hp = 99; s.rival.hp = 99;
  for (let i = 0; i < 60 * 15 && !s.activeRead; i++) step(s, input, 1 / 60);
  assert.ok(s.activeRead, 'a read shot should fire within 15 s');
  return { s, input };
}

test('dodging every read bullet counts as OUTPLAYED and delays the next read', () => {
  const { s, input } = untilReadShot();
  const readsBefore = s.stats.reads;
  for (let i = 0; i < 60; i++) {
    s.bullets = s.bullets.filter(b => b.readId !== s.activeRead?.id); // the player dodged them
    step(s, input, 1 / 60);
  }
  assert.equal(s.stats.readsBeaten, 1);
  assert.equal(s.activeRead, null);
  assert.ok(s.outplayed && s.outplayed.t >= 0, 'OUTPLAYED pop should be showing');
  assert.ok(s.brain.sinceRead < 0, 'next read should be delayed');
  assert.ok(s.stats.reads >= readsBefore);
});

test('getting hit by a read bullet is not OUTPLAYED', () => {
  const { s, input } = untilReadShot();
  const b = s.bullets.find(x => x.readId === s.activeRead.id);
  b.x = s.player.x; b.y = s.player.y;
  for (let i = 0; i < 60; i++) step(s, input, 1 / 60);
  assert.equal(s.stats.readsBeaten, 0);
  assert.equal(s.activeRead, null);
});

test('report shows reads beaten out of reads', () => {
  const { s, input } = untilReadShot();
  for (let i = 0; i < 60; i++) {
    s.bullets = s.bullets.filter(b => b.readId !== s.activeRead?.id);
    step(s, input, 1 / 60);
  }
  s.player.hp = 0;
  for (let i = 0; i < 30; i++) step(s, input, 1 / 60);
  assert.match(s.ui.report.readsLine, /^Reads beaten: 1\/\d+$/);
});

test('beating a guess shows UNREADABLE and counts separately from reads', () => {
  const s = newState();
  const input = createInput();
  s.round = 2;
  input.clicked = true;
  step(s, input, 1 / 60);
  s.player.hp = 99; s.rival.hp = 99;
  input.keys = new Set(['w']);
  for (let i = 0; i < 60 * 15 && !s.activeRead; i++) {
    input.keys = new Set([(Math.floor(i / 20) % 2) ? 'w' : 'd', (Math.floor(i / 13) % 2) ? 's' : 'a']);
    step(s, input, 1 / 60);
  }
  assert.ok(s.activeRead, 'a read or guess should fire');
  const wasGuess = s.activeRead.guess;
  for (let i = 0; i < 60; i++) {
    s.bullets = s.bullets.filter(b => b.readId !== s.activeRead?.id);
    step(s, input, 1 / 60);
  }
  if (wasGuess) {
    assert.equal(s.stats.guessesBeaten, 1);
    assert.equal(s.stats.readsBeaten, 0);
    assert.equal(s.outplayed.text, 'UNREADABLE');
  } else {
    assert.equal(s.outplayed.text, 'OUTPLAYED');
  }
});
