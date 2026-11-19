// A skilled player bot: leads its shots, dodges incoming bullets most of the time, changes direction often.
// Design target: a skilled player clears the early levels easily but a run ends somewhere around levels 5-12.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, createInput, step, settings } from '../src/game.js';

settings.tutorial = false; // these tests measure the game itself, not the first-run lesson
import { CONFIG } from '../src/config.js';

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEYS = [['w'], ['s'], ['a'], ['d'], ['w', 'a'], ['w', 'd'], ['s', 'a'], ['s', 'd']];

function incoming(s) {
  const p = s.player;
  for (const b of s.bullets) {
    if (b.owner !== 'rival') continue;
    const rx = p.x - b.x, ry = p.y - b.y, v2 = b.vx * b.vx + b.vy * b.vy;
    const t = (rx * b.vx + ry * b.vy) / v2;
    if (t < 0 || t > 0.3) continue;
    if (Math.hypot(b.x + b.vx * t - p.x, b.y + b.vy * t - p.y) < 30) return b;
  }
  return null;
}

export function skilledRun(rand, maxLevel = 25) {
  const s = newState();
  const input = createInput();
  input.clicked = true;
  step(s, input, 1 / 60);
  let next = 0;
  while (s.round <= maxLevel) {
    if (s.phase === 'runOver') return s.ui.runLevel;
    if (s.phase === 'report') { input.clicked = true; step(s, input, 1 / 60); continue; }
    if (s.phase === 'trickPick') { input.pick = 0; step(s, input, 1 / 60); continue; }
    if (s.phase === 'round') {
      if (s.time >= next) { input.keys = new Set(KEYS[Math.floor(rand() * KEYS.length)]); next = s.time + 0.3 + rand() * 0.6; }
      const r = s.rival, d = Math.hypot(r.x - s.player.x, r.y - s.player.y), travel = d / CONFIG.bulletSpeed;
      input.mouse = { x: r.x + r.vx * travel + (rand() - 0.5) * 30, y: r.y + r.vy * travel + (rand() - 0.5) * 30 };
      input.mouseDown = true;
      const b = incoming(s);
      if (b && s.player.dashCd <= 0 && rand() < 0.04) { // ~70% of threats dodged over their approach
        const side = rand() < 0.5 ? 1 : -1, l = Math.hypot(b.vx, b.vy);
        const dx = -b.vy / l * side, dy = b.vx / l * side;
        input.keys = new Set([dx > 0.3 ? 'd' : dx < -0.3 ? 'a' : '', dy > 0.3 ? 's' : dy < -0.3 ? 'w' : ''].filter(Boolean));
        input.dashPressed = true;
      }
    }
    step(s, input, 1 / 60);
  }
  return maxLevel;
}

test('a skilled player clears early levels but runs end around levels 5-12', () => {
  const rand = rng(42);
  const levels = Array.from({ length: 30 }, () => skilledRun(rand)).sort((a, b) => a - b);
  const median = levels[15];
  console.log('skilled bot run ends at levels:', levels.join(' '), '| median', median);
  assert.ok(median >= 5 && median <= 12, `median run ended at level ${median}`);
  assert.ok(levels.filter(l => l <= 2).length <= 3, 'skilled players should rarely lose in levels 1-2');
});
