# Habit Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-click browser duel where a rival learns, telegraphs and punishes the player's habits, and remembers them next day.

**Architecture:** Plain ES modules, no build step. Pure logic (habit model, rival brain, save/daily) lives in DOM-free files tested with `node --test`. `game.js` owns the loop, input, rendering and screens; `feel.js` owns juice. Playwright + system Chrome runs a smoke test against a local static server.

**Tech Stack:** HTML5 canvas, JavaScript ES modules, Node 22 `node:test`, Python Playwright with `/usr/bin/google-chrome`.

**Spec:** `docs/2026-11-18-habit-prototype-design.md` (full GDD: https://claude.ai/artifact/FwZC2JQRHTFuK6igdaa8p6)

## Global Constraints

- No libraries, no npm installs, no build step. Must run from GitHub Pages as static files.
- Logical arena 960 x 540 (16:9), scaled to fit the window, letterboxed.
- Mobile: landscape only; portrait shows a "Rotate your phone" overlay and pauses.
- Match: best of 5 rounds. Round ends at 3 hits taken or 45 s (more HP wins, equal = draw).
- Player and rival share one kit: HP 3, fire cooldown 0.5 s, dash 0.15 s with invincibility, dash cooldown 1.2 s.
- Rival reaction time 250 ms. Reads only when top action p > 0.55 and samples >= 6.
- Read telegraph "READ: <ACTION>" shows 0.3 s before the punish.
- Read budget: round 1 none; then one read per 5 s at round 2 falling linearly to one per 3 s at round 5.
- Model counts decay by 10% at the end of each round. Event sampled every 0.25 s plus on every dash and shot.
- Saves only to localStorage under key `habit.save.v1`.
- All tuning values live in `src/config.js`.

## Review Focus

1. localStorage missing, blocked (throws) or holding junk → game runs with a fresh rival, no crash. (Task 2 test)
2. Long frame after tab switch → dt clamped to 0.05 s, nothing teleports or skips a round. (Task 4 test)
3. Phone held upright → overlay shown, game paused; rotating resumes. (Task 5 smoke check)
4. Player who never moves or shoots → report still shows a habit ("Stands still"), predictability is a number, no NaN. (Task 1 test)
5. Window resized mid-round → canvas rescales, input coordinates still map to arena. (Task 5 smoke check)

---

### Task 1: Project skeleton + habit model

**Files:**
- Create: `index.html` (canvas + module script tag only), `src/config.js`, `src/habit.js`
- Test: `tests/habit.test.js`

**Interfaces:**
- Produces:
  - `Action` strings: `move:<dir>`, `dash:<dir>`, `shoot`, `still`; `<dir>` in `N NE E SE S SW W NW`.
  - `Ctx` object `{ dist: 'close'|'mid'|'far', shotAt: boolean, lowHp: boolean, last: Action|null }`.
  - `createModel(): Model` → `{ counts: {} }`
  - `ctxKey(ctx: Ctx): string`
  - `record(model, ctx, action): void`
  - `predict(model, ctx, kind?: 'move'|'dash'|'shoot'): { action, p, n } | null` (`n` = samples in that ctx for that kind; null if none)
  - `isConfident(pred): boolean` (p > 0.55 and n >= 6, from config)
  - `decay(model, factor = 0.9): void`
  - `topHabits(model, k = 3): Array<{ text: string, p: number }>` (p in 0..100, integer)
  - `predictability(model): number` (0..100 integer; 0 for empty model)
  - `serialize(model): string`, `deserialize(str): Model` (bad input → fresh model)

- [ ] **Step 1: Write failing tests** in `tests/habit.test.js`:
  - `predict returns null on empty model`
  - `predict finds the dominant dash`: record 8× `dash:W` and 2× `dash:E` in ctx `{dist:'mid',shotAt:true,lowHp:false,last:'shoot'}` → `predict(...,'dash')` gives `action 'dash:W'`, `p 0.8`, `n 10`, and `isConfident` true.
  - `not confident under 6 samples`: 5× `dash:W` → `isConfident` false.
  - `not confident at 0.55 or below`: 11 `dash:W` + 9 `dash:E` → false.
  - `decay scales counts by 0.9`.
  - `alternation is a pattern`: record alternating `dash:W`/`dash:E` with `last` set to previous action, 10 each → predicting with `last:'dash:W'` gives `dash:E` with p 1.
  - `topHabits names a dodge`: dominant `dash:W` when `shotAt` → first habit text `Dodges left when shot at`, p 80.
  - `idle player still gets a habit`: 10× `still` → `topHabits(...)[0].text === 'Stands still'`, `predictability` is a finite number.
  - `serialize round trips` and `deserialize('junk')` returns empty model.
- [ ] **Step 2: Run** `node --test tests/` → FAIL (module missing).
- [ ] **Step 3: Implement** `src/habit.js`. Counts nested as `counts[ctxKey][action] = number`. Direction words: N up, S down, E right, W left, diagonals "up-left" etc. Habit texts: dash with shotAt → `Dodges <dir> when shot at`; dash otherwise → `Dashes <dir> at <dist> range`; move → `Moves <dir> at <dist> range`; shoot → `Shoots at <dist> range`; still → `Stands still`. `topHabits` ranks contexts by (top-action share × min(n,20)) and returns distinct texts. `predictability` = sample-weighted mean of top-action share across contexts. `config.js` exports one frozen `CONFIG` object holding every number in Global Constraints plus speeds (player 260 px/s, bullet 520 px/s, dash speed 1066 px/s, radius 16).
- [ ] **Step 4: Run** `node --test tests/` → all PASS.
- [ ] **Step 5: Commit** `feat: habit model with tests`.

### Task 2: Save, welcome back and daily challenge

**Files:**
- Create: `src/save.js`
- Test: `tests/save.test.js`

**Interfaces:**
- Consumes: `serialize`, `deserialize`, `createModel`, `topHabits` from Task 1.
- Produces:
  - `loadSave(storage, today: string /* YYYY-MM-DD */): Save` where `Save = { model, rivalLevel: number, lastDay: string|null, isNewDay: boolean, bonusReads: number, challenge: Challenge, challengeDone: boolean }`
  - `writeSave(storage, save): void` (never throws)
  - `welcomeLine(save): string | null` (null on first visit or empty model; else `Welcome back. Last time: <habit> (<p>%). Let's see if you changed.`)
  - `Challenge = { id: 'lowPred'|'noLeftDash'|'noFarShot', text: string }`, picked by days-since-epoch mod 3.
  - Challenge texts: `Win a round under 50% predictability`, `Win a round without dashing left`, `Win a round without shooting from far range`.
  - `isNewDay` true when `lastDay` differs from `today`; then `bonusReads` = previous + 1, max 3.

- [ ] **Step 1: Write failing tests**: first visit (empty storage) → level 1, `welcomeLine` null; returning visit with dominant `dash:W` habit → line equals `Welcome back. Last time: Dodges left when shot at (80%). Let's see if you changed.`; new day increments `bonusReads` and caps at 3; same day keeps it; storage whose `getItem` throws → fresh save; storage holding `"{{"` → fresh save; `writeSave` with `setItem` throwing does not throw; challenge for `2026-11-19` is deterministic.
- [ ] **Step 2: Run** `node --test tests/` → FAIL.
- [ ] **Step 3: Implement** `src/save.js` under key `habit.save.v1`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: persistence, welcome back, daily challenge`.

### Task 3: Rival brain

**Files:**
- Create: `src/rival.js`
- Test: `tests/rival.test.js`

**Interfaces:**
- Consumes: `predict`, `isConfident` from Task 1; `CONFIG`.
- Produces:
  - `readInterval(round: number): number` (seconds; `Infinity` for round 1; 5 at 2, 3 at 5, linear between)
  - `createBrain(level: number, bonusReads: number): Brain`
  - `think(brain, view, model, dt): Intent` where `view = { me:{x,y,hp,dashReady,fireReady}, foe:{x,y,vx,vy,hp}, round, time, foeCtx: Ctx }` and `Intent = { moveX, moveY, aimX, aimY, fire: boolean, dash: null|{x,y}, read: null|{ label: string, kind: 'dodge'|'shot'|'space', fireAt?:{x,y} } }`
  - Read labels are uppercase, e.g. `READ: DASH LEFT`, `READ: SHOOTS NOW`, `READ: STRAFES RIGHT`.
  - Intents lag sensed state by 250 ms (brain keeps a short history of `view.foe`).
  - When a read commits, `read` is returned once; the punish (fire at `fireAt`, or dash) happens 0.3 s later from inside the brain.
  - `bonusReads` shortens the interval by 0.5 s each (floor 2 s).

- [ ] **Step 1: Write failing tests**: `readInterval(1) === Infinity`, `readInterval(2) === 5`, `readInterval(5) === 3`; round 1 with a confident model never returns a read over 30 s of `think` at dt 0.05; round 3 with a confident `dash:W` model returns a dodge read whose label is `READ: DASH LEFT` and whose `fireAt.x` is left of the foe; an unconfident model never returns a read; two reads are never closer than `readInterval(round)` seconds apart; the punish fire happens 0.3 s (±0.05) after the read.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/rival.js`. Baseline behaviour (no read): keep mid range (~260 px) by strafing, fire when `fireReady` aimed at lagged foe position with simple lead, dash away when a player bullet is predicted to hit within 0.25 s (bullets passed in `view.bullets` array `{x,y,vx,vy,owner}`). Level scales lead accuracy only.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: rival brain with budgeted, telegraphed reads`.

### Task 4: Playable desktop duel (tonight's milestone)

**Files:**
- Create: `src/game.js`, `src/util.js`, `tests/util.test.js`, `tests/smoke.py`, `README.md`
- Modify: `index.html`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `util.js` → `clampDt(dt): number` (max 0.05), `distBand(d): 'close'|'mid'|'far'` (<180 close, <380 mid). `game.js` → `start(canvas)`; exposes `window.__habit = { state }` for the smoke test.

- [ ] **Step 1: Write failing tests**: `clampDt(1.2) === 0.05`, `clampDt(0.016) === 0.016`, `distBand(100)==='close'`, `distBand(300)==='mid'`, `distBand(500)==='far'`.
- [ ] **Step 2: Run** → FAIL. **Step 3:** implement `util.js` → PASS.
- [ ] **Step 4: Implement `game.js`**: states `title → round → roundEnd → report → … → matchEnd`; WASD move, mouse aim, click fire, Space dash; arena walls; bullets; hits; HP; 45 s timer; best of 5; records an event into the model every 0.25 s and on each dash/shot via `record`; calls `decay` and `writeSave` at round end. Placeholder report screen (text only).
- [ ] **Step 5: Write `tests/smoke.py`**: start `python3 -m http.server` on a free port, open the page in Chrome (`executable_path='/usr/bin/google-chrome'`, headless), fail on any console error or page error, press keys and click for 10 s, assert `window.__habit.state` left `title`, save `tests/out/desktop.png`.
- [ ] **Step 6: Run** `node --test tests/ && python3 tests/smoke.py` → PASS. Look at the screenshot.
- [ ] **Step 7:** `README.md` with the two GitHub Pages commands. **Commit** `feat: playable desktop duel`.

### Task 5: Mobile touch, scaling and rotate prompt

**Files:**
- Modify: `src/game.js`, `index.html`, `tests/smoke.py`

- [ ] **Step 1: Extend smoke test**: iPhone-like landscape viewport (844×390, `has_touch`, `is_mobile`) → canvas fills height, no console errors, screenshot `mobile.png`; portrait viewport (390×844) → element `#rotate` visible and `__habit.state.paused === true`; resize desktop 1280×720 → 800×600 mid-round → arena letterboxed, a click at the canvas centre maps to arena (480,270) via exposed `__habit.toArena(x,y)`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: left half = floating move stick; right half = drag to aim, release to fire; a swipe (> 60 px in < 150 ms) on the right half = dash in swipe direction; `#rotate` overlay via `matchMedia('(orientation: portrait)')` and pointer coarse; scale with devicePixelRatio, letterbox.
- [ ] **Step 4: Run** → PASS; review screenshots.
- [ ] **Step 5: Commit** `feat: touch controls and responsive scaling`.

### Task 6: Game feel

**Files:**
- Create: `src/feel.js`
- Modify: `src/game.js`

**Interfaces:** `feel.js` → `createFeel()`, `hitStop(feel, seconds)`, `shake(feel, strength)`, `burst(feel, x, y, color, count)`, `slowMo(feel, seconds, scale)`, `updateFeel(feel, dt): number /* scaled dt for the sim */`, `drawFeel(feel, ctx)`, `cameraOffset(feel): {x,y}`.

- [ ] **Step 1:** Implement with values: hit stop 0.06 s per hit, white flash 0.08 s, shake 6 px on hit / 3 px on dash, dash trail of 6 ghosts, slow-mo 0.6 s at 0.25× on the round-winning hit, 12-particle bursts on hits and wall impacts.
- [ ] **Step 2:** Smoke test still passes; capture a mid-hit screenshot by forcing a hit via `__habit.debugHit()`.
- [ ] **Step 3: Commit** `feat: hit stop, shake, trails, slow-mo, particles`.

### Task 7: Reads on screen, Habit Report, D1 hook UI

**Files:**
- Modify: `src/game.js`

- [ ] **Step 1: Extend smoke test**: seed localStorage with a save holding a confident `dash:W` model and yesterday's date → title shows text starting `Welcome back. Last time:`; daily challenge text visible; report screen after a forced round end (`__habit.debugEndRound()`) lists 3 habit lines and a `Predictability` value with `%`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: read label pops above the rival (scale-in 0.1 s, held through the 0.3 s telegraph, plus a short beep via WebAudio if available); report card for 5 s or tap to skip (top 3 habits, predictability, round score); match end shows the rival's one-liner from the top habit and "Rival level N" + "I'll study this tonight. Come back tomorrow."; challenge tracking for the three challenge ids, ticked on success and saved.
- [ ] **Step 4: Run** → PASS; review screenshots.
- [ ] **Step 5: Commit** `feat: telegraphed reads, Habit Report, welcome back and daily challenge`.

### Task 8: Final check and ship

- [ ] **Step 1:** Run `node --test tests/ && python3 tests/smoke.py` → PASS.
- [ ] **Step 2:** Play-through review of all screenshots against the GDD pillars; fix anything that reads as cheating or unclear.
- [ ] **Step 3:** Vedant pushes to GitHub, enables Pages, tests on his phone and with 3 to 5 friends; notes go into the Q1 writeup.
- [ ] **Step 4: Commit** `chore: ship v1`.

## Schedule

| When | Tasks |
| --- | --- |
| Wed 7 pm onward | 1, 2, 3, 4 (live link tonight) |
| Thu morning | 5, 6 |
| Thu afternoon | 7 |
| Thu evening | 8 + playtests |
