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

test('read interval: none at level 1, 3.2 s at level 2, 2.2 s at level 5, never under 1.2 s', () => {
  assert.equal(readInterval(1), Infinity);
  assert.equal(readInterval(2), 3.2);
  assert.ok(Math.abs(readInterval(5) - 2.2) < 1e-9);
  assert.ok(readInterval(3) < 3.2 && readInterval(3) > 2.2);
  assert.equal(readInterval(50), 1.2);
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

test('unconfident model never makes a READ, only labelled GUESSes', () => {
  const { reads } = run(createModel(), 4, 30);
  assert.ok(reads.every(r => r.read.kind === 'guess' && r.read.label.startsWith('GUESS: ')));
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

test('no shots and no reads while a pillar blocks line of sight', () => {
  const brain = createBrain(1, 0);
  const m = dodgerModel();
  for (let t = 0; t < 20; t += 0.05) {
    const it = think(brain, { ...view(4, t), blocked: true }, m, 0.05);
    assert.equal(it.fire, false);
    assert.equal(it.read, null);
  }
});

test('the first read in round 2 can come within about 2 s, not after a full interval', () => {
  const { reads } = run(dodgerModel(), 2, 4);
  assert.ok(reads.length >= 1 && reads[0].t <= 2.1, `first read at ${reads[0]?.t}`);
});

test('a momentum habit gives a KEEPS MOVING read that shoots ahead of the player', async () => {
  const { recordMomentum } = await import('../src/habit.js');
  const m = createModel();
  for (let i = 0; i < 10; i++) recordMomentum(m, true);
  const brain = createBrain(1, 0);
  let read = null;
  for (let t = 0; t < 8 && !read; t += 0.05) {
    const v = view(3, t);
    v.foe = { ...v.foe, vx: 260, vy: 0 };
    read = think(brain, v, m, 0.05).read;
  }
  assert.ok(read, 'should read momentum');
  assert.equal(read.label, 'READ: KEEPS MOVING RIGHT');
  assert.ok(read.fireAt.x > 400 + 50);
});

test('when it cannot read the player it guesses, labelled GUESS, never READ', () => {
  const brain = createBrain(1, 0);
  const seen = [];
  for (let t = 0; t < 12; t += 0.05) {
    const v = view(3, t);
    v.foe = { ...v.foe, vx: 0, vy: -260 };
    const it = think(brain, v, createModel(), 0.05);
    if (it.read) seen.push(it.read);
  }
  assert.ok(seen.length >= 2, `expected guesses, got ${seen.length}`);
  for (const r of seen) {
    assert.equal(r.kind, 'guess');
    assert.match(r.label, /^GUESS: /);
  }
  assert.ok(seen[0].fireAt.y < 270, 'guess leads the player along their movement');
});
