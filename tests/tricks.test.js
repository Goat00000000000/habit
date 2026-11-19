// Tricks: run-long tools built to beat reads. Pick one after level 2, get the other at the level 5 checkpoint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, createInput, step, settings } from '../src/game.js';

settings.tutorial = false; // these tests measure the game itself, not the first-run lesson
import { CONFIG as C } from '../src/config.js';
import { PILLARS } from '../src/arena.js';

const DT = 1 / 60;

function begin(level = 0) {
  const s = newState();
  const input = createInput();
  s.round = level;
  input.clicked = true;
  step(s, input, DT);
  return { s, input };
}

function winLevel(s, input) {
  s.rival.hp = 0;
  for (let i = 0; i < 120 && s.phase !== 'report'; i++) step(s, input, DT);
  input.clicked = true;
  step(s, input, DT);
}

test('clearing level 2 offers a choice of two tricks; picking one grants it and starts level 3', () => {
  const { s, input } = begin(1);
  assert.equal(s.round, 2);
  winLevel(s, input);
  assert.equal(s.phase, 'trickPick');
  assert.deepEqual(s.trickOffer, ['overclock', 'ricochet']);
  input.pick = 1;
  step(s, input, DT);
  assert.deepEqual(s.tricks, ['ricochet']);
  assert.equal(s.phase, 'round');
  assert.equal(s.round, 3);
});

test('the level 5 checkpoint grants the remaining trick', () => {
  const { s, input } = begin(1);
  winLevel(s, input);
  input.pick = 0;
  step(s, input, DT);
  for (const lvl of [3, 4]) { assert.equal(s.round, lvl); winLevel(s, input); }
  assert.equal(s.round, 5);
  winLevel(s, input);
  assert.equal(s.phase, 'trickPick');
  assert.deepEqual(s.trickOffer, ['ricochet']);
  input.pick = 0;
  step(s, input, DT);
  assert.deepEqual(s.tricks.slice().sort(), ['overclock', 'ricochet']);
});

test('levels without a trick reward go straight to the next level', () => {
  const { s, input } = begin(2);
  assert.equal(s.round, 3);
  winLevel(s, input);
  assert.equal(s.phase, 'round');
  assert.equal(s.round, 4);
});

test('a new run starts with no tricks', () => {
  const { s, input } = begin(1);
  winLevel(s, input);
  input.pick = 0;
  step(s, input, DT);
  s.player.hp = 0;
  for (let i = 0; i < 120 && s.phase !== 'report'; i++) step(s, input, DT);
  input.clicked = true; step(s, input, DT);
  assert.equal(s.phase, 'runOver');
  for (let i = 0; i < 40; i++) step(s, input, DT);
  input.clicked = true; step(s, input, DT);
  assert.deepEqual(s.tricks, []);
});

function outplayOnce(s, input) {
  s.activeRead = { id: 99, firedAt: s.time, hit: false, guess: false };
  s.bullets = [];
  step(s, input, DT);
}

test('Overclock: after an OUTPLAYED you fire twice as fast for 2 s', () => {
  const { s, input } = begin(2);
  s.tricks = ['overclock'];
  s.player.hp = 99; s.rival.hp = 99;
  outplayOnce(s, input);
  assert.ok(s.overclockT > 1.9, 'overclock should be running');
  input.mouseDown = true;
  s.player.fireCd = 0;
  step(s, input, DT);
  assert.ok(Math.abs(s.player.fireCd - C.fireCooldown / 2) < 0.02, `cooldown ${s.player.fireCd}`);
  for (let i = 0; i < 130; i++) step(s, input, DT);
  s.player.fireCd = 0;
  step(s, input, DT);
  assert.ok(Math.abs(s.player.fireCd - C.fireCooldown) < 0.02, 'back to normal after 2 s');
});

test('without Overclock an OUTPLAYED does not change fire rate', () => {
  const { s, input } = begin(2);
  s.player.hp = 99; s.rival.hp = 99;
  outplayOnce(s, input);
  input.mouseDown = true;
  s.player.fireCd = 0;
  step(s, input, DT);
  assert.ok(Math.abs(s.player.fireCd - C.fireCooldown) < 0.02);
});

function shotAt(s, x, y, vx, vy) {
  s.bullets = [{ x, y, vx, vy, owner: 'player' }];
}

test('Ricochet: a shot bounces once off a wall, then is gone on the next wall', () => {
  const { s, input } = begin(2);
  s.tricks = ['ricochet'];
  s.player.hp = 99; s.rival.hp = 99;
  s.rival.x = 900; s.rival.y = 500;
  shotAt(s, 5, 60, -520, 0);
  step(s, input, DT);
  assert.equal(s.bullets.filter(b => b.owner === 'player').length, 1, 'survives the first wall');
  assert.ok(s.bullets[0].vx > 0, 'reflected off the left wall');
  s.bullets[0].x = C.arenaW - 2;
  step(s, input, DT);
  assert.equal(s.bullets.filter(b => b.owner === 'player').length, 0, 'gone on the second wall');
});

test('Ricochet: a shot into a pillar bounces back off the face it hit', () => {
  const { s, input } = begin(2);
  s.tricks = ['ricochet'];
  s.player.hp = 99; s.rival.hp = 99;
  s.rival.x = 900; s.rival.y = 500;
  const p = PILLARS[1];
  shotAt(s, p.x - 4, p.y + p.h / 2, 520, 0);
  step(s, input, DT);
  const b = s.bullets.find(x => x.owner === 'player');
  assert.ok(b, 'bounced shot still flying');
  assert.ok(b.vx < 0 && b.vy === 0, 'reflected off the left face');
});

test('without Ricochet shots stop at walls and pillars', () => {
  const { s, input } = begin(2);
  s.player.hp = 99; s.rival.hp = 99;
  shotAt(s, 5, 60, -520, 0);
  step(s, input, DT);
  assert.equal(s.bullets.filter(b => b.owner === 'player').length, 0);
});
