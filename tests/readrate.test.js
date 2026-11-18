// A skilled-style player (mixes directions, leads shots) must still get read regularly from level 2,
// or reviewers never see the game's core mechanic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, createInput, step } from '../src/game.js';
import { CONFIG } from '../src/config.js';

test('a skilled-style player sees a READ or GUESS at least once every 3.5 s from level 2 on', () => {
  let seed = 5;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const KEYS = [['w'], ['s'], ['a'], ['d'], ['w', 'a'], ['w', 'd'], ['s', 'a'], ['s', 'd']];
  let reads = 0, secs = 0;
  for (let run = 0; run < 6; run++) {
    const s = newState(), input = createInput();
    input.clicked = true;
    step(s, input, 1 / 60);
    let next = 0;
    while (s.phase !== 'runOver' && s.round < 12) {
      if (s.phase === 'report') { input.clicked = true; step(s, input, 1 / 60); continue; }
      if (s.phase === 'round') {
        if (s.time >= next) { input.keys = new Set(KEYS[Math.floor(rand() * 8)]); next = s.time + 0.3 + rand() * 0.6; }
        const r = s.rival, d = Math.hypot(r.x - s.player.x, r.y - s.player.y);
        input.mouse = { x: r.x + r.vx * d / CONFIG.bulletSpeed, y: r.y + r.vy * d / CONFIG.bulletSpeed };
        input.mouseDown = true;
        if (s.round >= 2) secs += 1 / 60;
      }
      const before = s.stats.reads + s.stats.guesses;
      step(s, input, 1 / 60);
      if (s.stats.reads + s.stats.guesses > before) reads++;
    }
  }
  const every = secs / reads;
  console.log(`skilled-style player read once every ${every.toFixed(1)} s (${reads} reads in ${secs.toFixed(0)} s)`);
  assert.ok(every <= 3.5, `read only once every ${every.toFixed(1)} s`);
});
