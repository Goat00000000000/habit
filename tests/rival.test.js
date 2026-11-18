import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readInterval, createBrain, think } from '../src/rival.js';
import { createModel, record } from '../src/habit.js';

const foeCtx = { dist: 'mid', shotAt: false, lowHp: false, last: 'shoot' };

function dodgerModel() {
  const m = createModel();
  for (let i = 0; i < 10; i++) record(m, { ...foeCtx, shotAt: true }, 'dash:W');
  return m;
}

function view(round, time) {
  return {
    me: { x: 700, y: 270, hp: 3, dashReady: true, fireReady: true },
    foe: { x: 400, y: 270, vx: 0, vy: 0, hp: 3 },
    round, time, foeCtx, bullets: [],
  };
}

// Runs the brain for `seconds` and returns every read and every read-shot with its time.
function run(model, round, seconds, dt = 0.05) {
  const brain = createBrain(1, 0);
  const reads = [], punishes = [];
  for (let t = 0; t < seconds; t += dt) {
    const it = think(brain, view(round, t), model, dt);
    if (it.read) reads.push({ t, read: it.read });
    if (it.readShot) punishes.push({ t, shot: it.readShot });
  }
  return { reads, punishes };
}

test('read interval: none in round 1, 5 s at round 2, 3 s at round 5', () => {
  assert.equal(readInterval(1), Infinity);
  assert.equal(readInterval(2), 5);
  assert.equal(readInterval(5), 3);
  assert.ok(readInterval(3) < 5 && readInterval(3) > 3);
});

test('round 1 never reads even with a confident model', () => {
  assert.equal(run(dodgerModel(), 1, 30).reads.length, 0);
});

test('confident dodge habit produces a READ: DASH LEFT aimed left of the player', () => {
  const { reads } = run(dodgerModel(), 3, 10);
  assert.ok(reads.length >= 1);
  assert.equal(reads[0].read.label, 'READ: DASH LEFT');
  assert.equal(reads[0].read.kind, 'dodge');
  assert.ok(reads[0].read.fireAt.x < 400);
});

test('unconfident model never reads', () => {
  assert.equal(run(createModel(), 4, 30).reads.length, 0);
});

test('reads respect the per-round budget', () => {
  const { reads } = run(dodgerModel(), 3, 60);
  assert.ok(reads.length >= 2);
  for (let i = 1; i < reads.length; i++) {
    assert.ok(reads[i].t - reads[i - 1].t >= readInterval(3) - 1e-6);
  }
});

test('the read shot fires 0.3 s after the telegraph', () => {
  const { reads, punishes } = run(dodgerModel(), 3, 10, 0.01);
  assert.ok(punishes.length >= 1);
  const gap = punishes[0].t - reads[0].t;
  assert.ok(Math.abs(gap - 0.3) <= 0.05, `gap was ${gap}`);
  assert.deepEqual(punishes[0].shot, reads[0].read.fireAt);
});
