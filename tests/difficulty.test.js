// Plays many rounds with a scripted "new player" bot to measure win rate per round.
// Design target: ~90% of new players win round 1, and it gets harder after that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, createInput, step } from '../src/game.js';

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOVES = [['w'], ['s'], ['a'], ['d'], ['w', 'a'], ['w', 'd'], ['s', 'a'], ['s', 'd'], []];

// New player: wanders, sprays shots roughly at the rival, dashes now and then, never dodges on purpose.
function playRound(round, rand) {
  const s = newState();
  const input = createInput();
  s.round = round - 1;
  input.clicked = true;
  step(s, input, 1 / 60);
  let nextTurn = 0;
  const dt = 1 / 60;
  while (s.phase === 'round') {
    if (s.time >= nextTurn) {
      input.keys = new Set(MOVES[Math.floor(rand() * MOVES.length)]);
      nextTurn = s.time + 0.6 + rand() * 0.6;
    }
    input.mouse = { x: s.rival.x + (rand() - 0.5) * 120, y: s.rival.y + (rand() - 0.5) * 120 };
    input.mouseDown = true;
    if (rand() < 0.1 * dt) input.dashPressed = true;
    step(s, input, dt);
  }
  return s.roundWinner;
}

export function winRate(round, n = 150) {
  const rand = rng(round * 1000 + 7);
  let wins = 0;
  for (let i = 0; i < n; i++) if (playRound(round, rand) === 'player') wins++;
  return wins / n;
}

test('about 90% of new players win round 1, and later rounds get harder', () => {
  const r1 = winRate(1), r3 = winRate(3), r5 = winRate(5);
  console.log(`new-player win rate: round 1 ${(r1 * 100).toFixed(0)}%, round 3 ${(r3 * 100).toFixed(0)}%, round 5 ${(r5 * 100).toFixed(0)}%`);
  assert.ok(r1 >= 0.85 && r1 <= 0.97, `round 1 win rate ${r1}`);
  assert.ok(r3 < r1 - 0.15, `round 3 (${r3}) should be clearly harder than round 1 (${r1})`);
  assert.ok(r5 <= 0.5, `round 5 win rate ${r5} should be 50% or less for a new player`);
});
