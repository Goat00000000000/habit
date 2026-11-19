import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PILLARS, pushOut, inPillar, segmentBlocked, nearCover } from '../src/arena.js';

const centre = PILLARS[1];
const cx = centre.x + centre.w / 2, cy = centre.y + centre.h / 2;

test('there are 3 pillars and none overlaps a spawn point', () => {
  assert.equal(PILLARS.length, 3);
  for (const [x, y] of [[240, 270], [720, 270]]) assert.equal(inPillar(x, y, 30), false);
});

test('a fighter inside a pillar is pushed out to its edge', () => {
  const p = pushOut(centre.x - 5, cy, 16); // overlapping the left edge
  assert.ok(p.x <= centre.x - 16 + 1e-9, `x ${p.x}`);
  assert.equal(p.y, cy);
});

test('a fighter clear of pillars is not moved', () => {
  assert.deepEqual(pushOut(100, 100, 16), { x: 100, y: 100 });
});

test('inPillar detects bullets inside a pillar', () => {
  assert.equal(inPillar(cx, cy), true);
  assert.equal(inPillar(10, 10), false);
});

test('line of sight through the centre pillar is blocked, around it is clear', () => {
  assert.equal(segmentBlocked(cx - 200, cy, cx + 200, cy), true);
  assert.equal(segmentBlocked(cx - 200, 20, cx + 200, 20), false);
});

test('nearCover is true next to a pillar and false in the open', () => {
  assert.equal(nearCover(centre.x - 40, cy), true);
  assert.equal(nearCover(40, 40), false);
});

test('every layout keeps both spawns clear, stays inside the arena and has no overlapping pillars', async () => {
  const { LAYOUTS, setLayoutFor } = await import('../src/arena.js');
  assert.ok(LAYOUTS.length >= 6);
  for (const layout of LAYOUTS) {
    for (const p of layout) {
      assert.ok(p.x > 30 && p.y > 30 && p.x + p.w < 930 && p.y + p.h < 510, 'inside the arena');
      for (const [x, y] of [[240, 270], [720, 270]]) {
        const near = x > p.x - 40 && x < p.x + p.w + 40 && y > p.y - 40 && y < p.y + p.h + 40;
        assert.equal(near, false, 'spawn clear');
      }
    }
    for (let i = 0; i < layout.length; i++) for (let j = i + 1; j < layout.length; j++) {
      const a = layout[i], b = layout[j];
      assert.ok(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y, 'no overlap');
    }
  }
  setLayoutFor(1);
  const one = JSON.stringify(PILLARS);
  setLayoutFor(2);
  assert.notEqual(JSON.stringify(PILLARS), one, 'level 2 looks different from level 1');
  setLayoutFor(1);
  assert.equal(JSON.stringify(PILLARS), one, 'same level, same layout');
});
