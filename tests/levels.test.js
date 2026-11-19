// Level mode: an endless ladder. Win a level, go to the next. Lose, the run ends.
// Checkpoints every 5 levels: the next run starts from the highest checkpoint reached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, createInput, step, settings } from '../src/game.js';

settings.tutorial = false; // these tests measure the game itself, not the first-run lesson

const DT = 1 / 60;

function begin(level = 0) {
  const s = newState();
  const input = createInput();
  s.round = level;
  input.clicked = true;
  step(s, input, DT);
  return { s, input };
}

// Ends the current level with the given winner and clicks through the report.
function finish(s, input, winner) {
  if (winner === 'player') s.rival.hp = 0;
  else if (winner === 'rival') s.player.hp = 0;
  else s.time = 999;
  for (let i = 0; i < 120 && s.phase !== 'report'; i++) step(s, input, DT);
  assert.equal(s.phase, 'report');
  input.clicked = true;
  step(s, input, DT);
  if (s.phase === 'trickPick') { input.pick = 0; step(s, input, DT); } // take the offered trick
}

test('a fresh run starts at level 1', () => {
  const { s } = begin();
  assert.equal(s.round, 1);
  assert.equal(s.phase, 'round');
});

test('winning a level moves to the next one', () => {
  const { s, input } = begin();
  finish(s, input, 'player');
  assert.equal(s.round, 2);
  assert.equal(s.phase, 'round');
  finish(s, input, 'player');
  assert.equal(s.round, 3);
});

test('a draw replays the same level', () => {
  const { s, input } = begin(2);
  assert.equal(s.round, 3);
  finish(s, input, 'draw');
  assert.equal(s.round, 3);
  assert.equal(s.phase, 'round');
});

test('losing ends the run and records the best level', () => {
  const { s, input } = begin(3);
  assert.equal(s.round, 4);
  finish(s, input, 'rival');
  assert.equal(s.phase, 'runOver');
  assert.equal(s.save.bestLevel, 4);
  assert.equal(s.save.checkpoint, 4, 'level 4 is a checkpoint');
});

test('reaching level 5 sets a checkpoint, and the next run starts there', () => {
  const { s, input } = begin(4);
  assert.equal(s.round, 5);
  assert.equal(s.save.checkpoint, 5);
  finish(s, input, 'player');
  finish(s, input, 'rival'); // lose at level 6
  assert.equal(s.phase, 'runOver');
  assert.equal(s.save.bestLevel, 6);
  for (let i = 0; i < 40; i++) step(s, input, DT);
  input.clicked = true;
  step(s, input, DT);
  assert.equal(s.round, 5, 'next run starts at the checkpoint');
  assert.equal(s.stats.reads, 0, 'run stats reset');
});

test('past level 5 the rival gets tougher and reads more, but never aims better than level 5', () => {
  const lvl = n => { const { s } = begin(n - 1); return s.tuning; };
  const t5 = lvl(5), t9 = lvl(9), t15 = lvl(15);
  assert.equal(t9.lead, t5.lead);
  assert.equal(t9.aimJitter, t5.aimJitter);
  assert.ok(t9.rivalHp > t5.rivalHp);
  assert.ok(t9.readInterval < t5.readInterval);
  assert.ok(t9.readMove < t5.readMove);
  assert.ok(t15.readInterval >= 1.2);
});

test('checkpoints are levels 2, 4 and 5, then every 3 levels', async () => {
  const { isCheckpoint } = await import('../src/game.js');
  const yes = [2, 4, 5, 8, 11, 14, 17], no = [1, 3, 6, 7, 9, 10, 12, 13, 15];
  for (const l of yes) assert.equal(isCheckpoint(l), true, `level ${l}`);
  for (const l of no) assert.equal(isCheckpoint(l), false, `level ${l}`);
});
