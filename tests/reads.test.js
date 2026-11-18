// A player with obvious habits must get read early in round 2, even with no data from round 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, createInput, step } from '../src/game.js';

test('a habitual player is read within 4 s of round 2', () => {
  let firstRead = null, tries = 0;
  const times = [];
  for (let run = 0; run < 10; run++) {
    const s = newState();
    const input = createInput();
    s.round = 1;
    input.clicked = true;
    step(s, input, 1 / 60);
    s.player.hp = 99; s.rival.hp = 99;
    let flip = 0;
    while (s.time < 10 && !s.readLabel) {
      // Habit: mostly strafes right/down, dashes left whenever shot at, keeps shooting at the rival.
      if (s.time > flip) { input.keys = new Set(Math.random() < 0.75 ? ['d'] : ['s']); flip = s.time + 0.8; }
      input.mouse = { x: s.rival.x, y: s.rival.y };
      input.mouseDown = true;
      if (s.time - s.lastRivalShot < 0.3 && s.player.dashCd <= 0) { input.keys = new Set(['a']); input.dashPressed = true; }
      step(s, input, 1 / 60);
    }
    tries++;
    times.push(s.readLabel ? s.time : Infinity);
  }
  const read = times.filter(t => t < 4).length;
  console.log('first read times (s):', times.map(t => (t === Infinity ? 'none' : t.toFixed(1))).join(', '));
  assert.ok(read >= 8, `only ${read}/${tries} habitual players were read within 4 s`);
});
