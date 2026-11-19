// Level 1 on a first-ever run is a lesson: move, shoot, dash, then beat one scripted READ, then the real fight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, createInput, step } from '../src/game.js';
import { CONFIG as C } from '../src/config.js';

const DT = 1 / 60;
const frames = (s, input, n) => { for (let i = 0; i < n; i++) step(s, input, DT); };

function firstRun() {
  const s = newState();
  const input = createInput();
  input.clicked = true;
  step(s, input, DT);
  return { s, input };
}

// Plays the lesson up to the READ step.
function toReadStep() {
  const { s, input } = firstRun();
  input.keys = new Set(['w']); frames(s, input, 60); input.keys = new Set();
  s.bullets = [{ x: s.rival.x - 30, y: s.rival.y, vx: 520, vy: 0, owner: 'player' }];
  frames(s, input, 10);
  input.keys = new Set(['s']); input.dashPressed = true; frames(s, input, 2); input.keys = new Set();
  return { s, input };
}

test('a first-ever run opens level 1 with the lesson, and the clock does not run', () => {
  const { s, input } = firstRun();
  assert.equal(s.round, 1);
  assert.equal(s.tutorial.step, 'move');
  frames(s, input, 120);
  assert.equal(s.time, 0);
});

test('the rival never shoots during the lesson', () => {
  const { s, input } = firstRun();
  frames(s, input, 60 * 8);
  assert.equal(s.bullets.filter(b => b.owner === 'rival').length, 0);
});

test('moving, then hitting the rival, then dashing walks through the steps', () => {
  const { s, input } = firstRun();
  input.keys = new Set(['w']); frames(s, input, 60); input.keys = new Set();
  assert.equal(s.tutorial.step, 'shoot');
  const hp = s.rival.hp;
  s.bullets = [{ x: s.rival.x - 30, y: s.rival.y, vx: 520, vy: 0, owner: 'player' }];
  frames(s, input, 10);
  assert.equal(s.tutorial.step, 'dash');
  assert.equal(s.rival.hp, hp, 'lesson hits do no damage');
  input.keys = new Set(['s']); input.dashPressed = true; frames(s, input, 2);
  assert.equal(s.tutorial.step, 'read');
});

test('the lesson stamps a scripted READ: DASH LEFT, and beating it starts the real fight', () => {
  const { s, input } = toReadStep();
  frames(s, input, 70);
  assert.equal(s.readLabel?.text, 'READ: DASH LEFT');
  frames(s, input, 15);
  assert.ok(s.activeRead, 'the read shot is in the air');
  s.bullets = s.bullets.filter(b => !b.readId); // dodged
  frames(s, input, 3);
  assert.equal(s.outplayed?.text, 'OUTPLAYED');
  frames(s, input, 120);
  assert.equal(s.tutorial.step, 'fight');
  assert.equal(s.save.tutorialDone, true);
  assert.equal(s.player.hp, C.hp);
  assert.equal(s.stats.readsBeaten, 0, 'lesson does not count toward run stats');
  frames(s, input, 60);
  assert.ok(s.time > 0.5, 'the clock runs in the real fight');
});

test('getting hit by the lesson READ costs nothing and the READ comes again', () => {
  const { s, input } = toReadStep();
  frames(s, input, 85);
  const b = s.bullets.find(x => x.readId);
  b.x = s.player.x; b.y = s.player.y;
  frames(s, input, 3);
  assert.equal(s.player.hp, C.hp);
  assert.equal(s.tutorial.step, 'read');
  s.readLabel = null;
  frames(s, input, 120);
  assert.equal(s.readLabel?.text, 'READ: DASH LEFT', 'it tries again');
});

test('skip jumps straight to the real fight and remembers it', () => {
  const { s, input } = firstRun();
  input.skip = true;
  step(s, input, DT);
  assert.equal(s.tutorial.step, 'fight');
  assert.equal(s.save.tutorialDone, true);
});

test('after the lesson is done, level 1 is a normal fight', () => {
  const s = newState();
  s.save.tutorialDone = true;
  const input = createInput();
  input.clicked = true;
  step(s, input, DT);
  assert.equal(s.tutorial, null);
});
