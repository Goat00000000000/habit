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
