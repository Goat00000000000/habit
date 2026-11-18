import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFeel, hitStop, slowMo, shake, burst, updateFeel, cameraOffset } from '../src/feel.js';

test('hit stop freezes the sim, then time resumes', () => {
  const f = createFeel();
  hitStop(f, 0.06);
  assert.equal(updateFeel(f, 0.03), 0);
  assert.equal(updateFeel(f, 0.03), 0);
  assert.equal(updateFeel(f, 0.02), 0.02);
});

test('slow-mo scales time while it lasts', () => {
  const f = createFeel();
  slowMo(f, 0.6, 0.25);
  assert.ok(Math.abs(updateFeel(f, 0.04) - 0.01) < 1e-9);
  for (let i = 0; i < 20; i++) updateFeel(f, 0.04);
  assert.equal(updateFeel(f, 0.04), 0.04);
});

test('shake moves the camera and fades to zero', () => {
  const f = createFeel();
  shake(f, 6);
  updateFeel(f, 0.016);
  const o = cameraOffset(f);
  assert.ok(Math.hypot(o.x, o.y) > 0);
  for (let i = 0; i < 60; i++) updateFeel(f, 0.016);
  const z = cameraOffset(f);
  assert.equal(Math.hypot(z.x, z.y), 0);
});

test('particles expire', () => {
  const f = createFeel();
  burst(f, 100, 100, '#fff', 12);
  assert.equal(f.particles.length, 12);
  for (let i = 0; i < 100; i++) updateFeel(f, 0.016);
  assert.equal(f.particles.length, 0);
});
