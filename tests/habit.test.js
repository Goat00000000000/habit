import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createModel, record, predict, isConfident, decay,
  topHabits, predictability, serialize, deserialize,
} from '../src/habit.js';

const shotCtx = { dist: 'mid', shotAt: true, lowHp: false, last: 'shoot' };

function many(model, ctx, action, n) {
  for (let i = 0; i < n; i++) record(model, ctx, action);
}

test('predict returns null on empty model', () => {
  assert.equal(predict(createModel(), shotCtx, 'dash'), null);
});

test('predict finds the dominant dash', () => {
  const m = createModel();
  many(m, shotCtx, 'dash:W', 8);
  many(m, shotCtx, 'dash:E', 2);
  const p = predict(m, shotCtx, 'dash');
  assert.equal(p.action, 'dash:W');
  assert.equal(p.p, 0.8);
  assert.equal(p.n, 10);
  assert.equal(isConfident(p), true);
});

test('not confident under 6 samples', () => {
  const m = createModel();
  many(m, shotCtx, 'dash:W', 5);
  assert.equal(isConfident(predict(m, shotCtx, 'dash')), false);
});

test('not confident at 0.55 or below', () => {
  const m = createModel();
  many(m, shotCtx, 'dash:W', 11);
  many(m, shotCtx, 'dash:E', 9);
  assert.equal(isConfident(predict(m, shotCtx, 'dash')), false);
});

test('decay scales counts by 0.9', () => {
  const m = createModel();
  many(m, shotCtx, 'dash:W', 10);
  decay(m);
  assert.ok(Math.abs(predict(m, shotCtx, 'dash').n - 9) < 1e-9);
});

test('alternation is a pattern', () => {
  const m = createModel();
  let last = 'dash:E';
  for (let i = 0; i < 20; i++) {
    const a = last === 'dash:E' ? 'dash:W' : 'dash:E';
    record(m, { dist: 'mid', shotAt: true, lowHp: false, last }, a);
    last = a;
  }
  const p = predict(m, { dist: 'mid', shotAt: true, lowHp: false, last: 'dash:W' }, 'dash');
  assert.equal(p.action, 'dash:E');
  assert.equal(p.p, 1);
});

test('topHabits names a dodge', () => {
  const m = createModel();
  many(m, shotCtx, 'dash:W', 8);
  many(m, shotCtx, 'dash:E', 2);
  const h = topHabits(m);
  assert.equal(h[0].text, 'Dodges left when shot at');
  assert.equal(h[0].p, 80);
});

test('idle player still gets a habit', () => {
  const m = createModel();
  many(m, { dist: 'far', shotAt: false, lowHp: false, last: null }, 'still', 10);
  assert.equal(topHabits(m)[0].text, 'Stands still');
  assert.ok(Number.isFinite(predictability(m)));
});

test('predictability is 0 for empty model', () => {
  assert.equal(predictability(createModel()), 0);
});

test('serialize round trips', () => {
  const m = createModel();
  many(m, shotCtx, 'dash:W', 3);
  const back = deserialize(serialize(m));
  assert.deepEqual(back, m);
});

test('deserialize junk returns empty model', () => {
  assert.deepEqual(deserialize('junk'), createModel());
  assert.deepEqual(deserialize(null), createModel());
});
