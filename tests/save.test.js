import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSave, writeSave, welcomeLine } from '../src/save.js';
import { createModel, record } from '../src/habit.js';

function memStorage(init = {}) {
  const s = { ...init };
  return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, _s: s };
}
const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

function dodgerModel() {
  const m = createModel();
  const ctx = { dist: 'mid', shotAt: true, lowHp: false, last: 'shoot' };
  for (let i = 0; i < 8; i++) record(m, ctx, 'dash:W');
  for (let i = 0; i < 2; i++) record(m, ctx, 'dash:E');
  return m;
}

test('first visit gives a fresh level 1 save with no welcome line', () => {
  const save = loadSave(memStorage(), '2026-11-19');
  assert.equal(save.rivalLevel, 1);
  assert.equal(save.lastDay, null);
  assert.equal(welcomeLine(save), null);
});

test('returning player gets a welcome line naming the top habit', () => {
  const st = memStorage();
  const s = loadSave(st, '2026-11-19');
  s.model = dodgerModel();
  writeSave(st, s);
  const back = loadSave(st, '2026-11-20');
  assert.equal(welcomeLine(back), "Welcome back. Last time: Dodges left when shot at (80%). Let's see if you changed.");
});

test('new day adds a bonus read, capped at 3', () => {
  const st = memStorage();
  let s = loadSave(st, '2026-11-19');
  writeSave(st, s);
  for (const day of ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23']) {
    s = loadSave(st, day);
    writeSave(st, s);
  }
  assert.equal(s.bonusReads, 3);
  assert.equal(s.isNewDay, true);
});

test('same day keeps bonus reads and is not a new day', () => {
  const st = memStorage();
  writeSave(st, loadSave(st, '2026-11-19'));
  writeSave(st, loadSave(st, '2026-11-20'));
  const s = loadSave(st, '2026-11-20');
  assert.equal(s.bonusReads, 1);
  assert.equal(s.isNewDay, false);
});

test('blocked storage gives a fresh save and writeSave does not throw', () => {
  const s = loadSave(throwing, '2026-11-19');
  assert.equal(s.rivalLevel, 1);
  assert.doesNotThrow(() => writeSave(throwing, s));
});

test('junk in storage gives a fresh save', () => {
  const s = loadSave(memStorage({ 'habit.save.v1': '{{' }), '2026-11-19');
  assert.equal(s.rivalLevel, 1);
  assert.deepEqual(s.model, createModel());
});

test('daily challenge is deterministic per day and resets on a new day', () => {
  const a = loadSave(memStorage(), '2026-11-19').challenge;
  const b = loadSave(memStorage(), '2026-11-19').challenge;
  assert.deepEqual(a, b);
  assert.ok(['lowPred', 'noLeftDash', 'noFarShot'].includes(a.id));
  const ids = new Set(['2026-11-19', '2026-11-20', '2026-11-21'].map(d => loadSave(memStorage(), d).challenge.id));
  assert.equal(ids.size, 3);
});
