import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampDt, distBand, dir8 } from '../src/util.js';

test('clampDt caps long frames at 0.05 s', () => {
  assert.equal(clampDt(1.2), 0.05);
  assert.equal(clampDt(0.016), 0.016);
  assert.equal(clampDt(-1), 0);
});

test('distBand splits close, mid, far', () => {
  assert.equal(distBand(100), 'close');
  assert.equal(distBand(300), 'mid');
  assert.equal(distBand(500), 'far');
});

test('dir8 maps a vector to a compass direction', () => {
  assert.equal(dir8(-1, 0), 'W');
  assert.equal(dir8(1, 0), 'E');
  assert.equal(dir8(0, -1), 'N');
  assert.equal(dir8(0.7, 0.7), 'SE');
  assert.equal(dir8(0, 0), null);
});
