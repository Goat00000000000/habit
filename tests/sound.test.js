import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSound, SOUNDS } from '../src/sound.js';

// Minimal stand-in for the Web Audio API that counts the nodes a sound creates.
function fakeAudio() {
  const made = { osc: 0, noise: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = () => ({ connect(n) { return n; }, disconnect() {}, gain: param(), frequency: param(), Q: param(), detune: param(), start() {}, stop() {}, type: '' });
  const ctx = {
    currentTime: 0, sampleRate: 44100, state: 'running', destination: node(),
    createOscillator() { made.osc++; return node(); },
    createGain: node, createBiquadFilter: node, createDynamicsCompressor: node,
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; },
    createBufferSource() { made.noise++; return { ...node(), buffer: null }; },
    resume() {},
  };
  return { ctx, made };
}

test('every named sound plays without throwing and makes some noise', () => {
  for (const name of SOUNDS) {
    const { ctx, made } = fakeAudio();
    const sfx = createSound(() => ctx);
    sfx.unlock();
    sfx.play(name);
    assert.ok(made.osc + made.noise > 0, `${name} made no nodes`);
  }
});

test('muted sound makes nothing, and mute can be toggled back', () => {
  const { ctx, made } = fakeAudio();
  const sfx = createSound(() => ctx);
  sfx.unlock();
  sfx.setMuted(true);
  sfx.play('playerHit');
  assert.equal(made.osc + made.noise, 0);
  sfx.setMuted(false);
  sfx.play('playerHit');
  assert.ok(made.osc + made.noise > 0);
});

test('without audio support it stays silent instead of crashing', () => {
  const sfx = createSound(() => { throw new Error('no audio'); });
  assert.doesNotThrow(() => { sfx.unlock(); sfx.play('read'); });
});

test('nothing plays before the first user gesture unlocks audio', () => {
  const { ctx, made } = fakeAudio();
  const sfx = createSound(() => ctx);
  sfx.play('read');
  assert.equal(made.osc + made.noise, 0);
});
