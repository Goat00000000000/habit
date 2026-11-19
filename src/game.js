// Habit: game loop, input, simulation, screens, rendering.
import { CONFIG as C } from './config.js';
import { record, recordMomentum, decay, topHabits, predictability } from './habit.js';
import { loadSave, writeSave, welcomeLine } from './save.js';
import { createBrain, think, readInterval } from './rival.js';
import { clampDt, distBand, dir8 } from './util.js';
import { PILLARS, pushOut, inPillar, pillarAt, segmentBlocked, nearCover } from './arena.js';
import { createFeel, hitStop, slowMo, shake, flash, burst, ghost, updateFeel } from './feel.js';
import { render, INK } from './ink.js';
import { createSound } from './sound.js';

// Effect colours: black ink for the player, seal red for the rival (see ink.js).
const COLORS = { player: INK.ink, rival: INK.red };

// ---------- input ----------
export function createInput() {
  return {
    keys: new Set(), mouse: { x: C.arenaW / 2, y: C.arenaH / 2 }, mouseDown: false, dashPressed: false, clicked: false,
    touch: false, stick: null, aimTouch: null, dashDir: null, fireOnce: false, releaseAim: null, pick: null, skip: false,
  };
}

function moveVector(input) {
  if (input.stick) {
    const dx = input.stick.x - input.stick.ox, dy = input.stick.y - input.stick.oy;
    const l = Math.hypot(dx, dy);
    if (l < 8) return { x: 0, y: 0 };
    const m = Math.min(1, l / 50);
    return { x: dx / l * m, y: dy / l * m };
  }
  const k = input.keys;
  let x = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
  let y = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
  const l = Math.hypot(x, y);
  return l ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}

// ---------- state ----------
function fighter(x, y) {
  return { x, y, vx: 0, vy: 0, hp: C.hp, fireCd: 0, dashCd: 0, dashT: 0, dashX: 0, dashY: 0, aimX: 0, aimY: 0, hitFlash: 0 };
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function safeStorage() {
  try { return window.localStorage; } catch { return { getItem: () => null, setItem: () => {} }; }
}

export function newState() {
  const save = loadSave(safeStorage(), today());
  return {
    // `round` is the current level number. 0 = no run in progress.
    phase: 'title', phaseT: 0, round: 0, time: 0, runBest: 0,
    player: fighter(240, C.arenaH / 2), rival: fighter(C.arenaW - 240, C.arenaH / 2),
    bullets: [], save, model: save.model, brain: null,
    sampleT: 0, lastAction: null, lastRivalShot: -9, readLabel: null, roundWinner: null, paused: false,
    feel: createFeel(),
    tricks: [], trickOffer: [], overclockT: 0,
    roundStats: { dashedLeft: false, farShot: false },
    stats: { reads: 0, readsBeaten: 0, guesses: 0, guessesBeaten: 0 }, activeRead: null, outplayed: null, readSeq: 0,
    ui: { welcome: welcomeLine(save), challenge: challengeLine(save), report: null, matchLine: null },
  };
}

function challengeLine(save) {
  return `Today: ${save.challenge.text}${save.challengeDone ? '  (done)' : ''}`;
}

// ---------- full screen ----------
// Phones: ask for full screen and landscape on the first tap (Android allows it; iPhone needs Add to Home Screen).
function goFullscreen() {
  if (typeof document === 'undefined' || document.fullscreenElement || document.webkitFullscreenElement) return;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try {
    Promise.resolve(req.call(el, { navigationUI: 'hide' }))
      .then(() => screen.orientation?.lock?.('landscape')?.catch?.(() => {}))
      .catch(() => {});
  } catch { /* not allowed here: keep playing in the window */ }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {});
  else goFullscreen();
}

function isIphoneBrowser() {
  const ios = /iPhone|iPod/.test(navigator.userAgent);
  const installed = navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches;
  return ios && !installed;
}

// ---------- sound ----------
// Synthesised samurai sounds (see sound.js). Silent until the first click or tap, as browsers require.
const sfx = createSound(() => new (window.AudioContext || window.webkitAudioContext)());
try { sfx.setMuted(window.localStorage.getItem('habit.muted') === '1'); } catch { /* no storage: sound on */ }
function toggleMute() {
  sfx.setMuted(!sfx.isMuted());
  try { window.localStorage.setItem('habit.muted', sfx.isMuted() ? '1' : '0'); } catch { /* fine */ }
}

function startRound(s, input) {
  if (input) {
    // A touch or key held through the end of a round must not fire or dash in the next one.
    input.fireOnce = false; input.dashPressed = false; input.dashDir = null;
    input.aimTouch = null; input.stick = null; input.releaseAim = null; input.mouseDown = false;
  }
  s.killTimer = null;
  s.activeRead = null; s.outplayed = null; s.lastMoveDir = null; s.overclockT = 0; s.rivalSlowT = 0;
  s.tutorial = settings.tutorial && s.round + 1 === 1 && !s.save.tutorialDone ? { step: 'move', t: 0, moved: 0 } : null;
  s.round += 1;
  if (s.round > s.save.bestLevel) s.save.bestLevel = s.round;
  if (isCheckpoint(s.round)) s.save.checkpoint = Math.max(s.save.checkpoint, s.round);
  s.time = 0; s.sampleT = 0; s.bullets = []; s.readLabel = null; s.lastRivalShot = -9;
  s.player = fighter(240, C.arenaH / 2);
  s.tuning = tuningFor(s.round);
  s.rival = fighter(C.arenaW - 240, C.arenaH / 2);
  s.rival.hp = s.rival.maxHp = s.tuning.rivalHp;
  s.brain = createBrain(s.save.rivalLevel, s.save.bonusReads, s.tuning);
  s.roundStats = { dashedLeft: false, farShot: false };
  s.phase = 'round'; s.phaseT = 0;
}

function playerCtx(s) {
  const d = Math.hypot(s.player.x - s.rival.x, s.player.y - s.rival.y);
  return { dist: distBand(d), shotAt: s.time - s.lastRivalShot < 0.6, lowHp: s.player.hp <= 1, cover: nearCover(s.player.x, s.player.y), last: s.lastAction };
}

function logAction(s, action) {
  if (inLesson(s)) return; // the lesson tells you what to do, so it says nothing about your habits
  record(s.model, playerCtx(s), action);
  s.lastAction = action;
}

// ---------- simulation ----------
// Levels 1-5 use the table. Past that the rival keeps level 5's aim but gets tougher
// (+1 HP every 3 levels, more dodges) and smarter (reads more often, with less evidence).
function tuningFor(level) {
  const base = C.difficulty.at(Math.min(Math.max(level, 1), C.difficulty.length) - 1);
  const extra = Math.max(0, level - C.difficulty.length);
  return {
    ...base,
    rivalHp: base.rivalHp + Math.floor(extra / 3),
    dodgeChance: Math.min(0.85, base.dodgeChance + 0.03 * extra),
    readInterval: readInterval(level),
    readDash: Math.max(0.45, C.readThreshold - 0.015 * extra),
    readMove: Math.max(0.3, C.readThresholdMove - 0.015 * extra),
    readMomentum: Math.max(0.5, C.readThresholdMomentum - 0.015 * extra),
  };
}

// A run starts at level 1, or at the highest checkpoint reached.
// ---------- the lesson ----------
// A first-ever run turns level 1 into a lesson: move, shoot, dash, beat one scripted READ, then the real fight.
// The rival never shoots, nothing does damage and the clock is stopped until the fight starts.
export const settings = { tutorial: true }; // tests that measure balance switch the lesson off

function inLesson(s) {
  return !!s.tutorial && s.tutorial.step !== 'fight';
}

function lessonNext(s, step) {
  s.tutorial.step = step;
  s.tutorial.t = 0;
}

function startFight(s) {
  s.tutorial.step = 'fight';
  s.tutorial.fightT = 0;
  s.save.tutorialDone = true;
  writeSave(safeStorage(), s.save);
  s.time = 0; s.sampleT = 0; s.bullets = []; s.activeRead = null; s.readLabel = null;
  s.player.hp = C.hp; s.rival.hp = s.rival.maxHp;
  s.brain = createBrain(s.save.rivalLevel, s.save.bonusReads, s.tuning);
  s.stats = { reads: 0, readsBeaten: 0, guesses: 0, guessesBeaten: 0 };
}

function updateLesson(s, input, dt) {
  const L = s.tutorial;
  if (input.skip) { input.skip = false; if (L.step !== 'fight') startFight(s); return; }
  if (L.step === 'fight') { L.fightT += dt; return; }
  L.t += dt;
  if (L.step === 'read') {
    // Stamp a scripted read, then fire at you and at where it says you will dash.
    if (!L.stamped && L.t > 1) {
      const at = { x: Math.max(C.radius, s.player.x - C.dashSpeed * C.dashTime), y: s.player.y };
      s.readLabel = { text: 'READ: DASH LEFT', t: 0, kind: 'dodge', at };
      L.stamped = true; L.at = at;
      sfx.play('read');
    }
    if (L.stamped && !L.fired && L.t > 1.3) {
      L.fired = true;
      s.activeRead = { id: ++s.readSeq, firedAt: s.time, hit: false, guess: false, lesson: true };
      // Lesson shots pass through pillars so the player always gets to dodge them.
      for (const t of [s.player, L.at]) Object.assign(fire(s, s.rival, t.x, t.y, 'rival', 300), { readId: s.activeRead.id, ghost: true });
      sfx.play('rivalShoot');
    }
    // Hit by it: no damage, and it tries again.
    if (L.fired && !s.activeRead && !s.outplayed) { L.stamped = false; L.fired = false; L.t = 0; }
    if (s.outplayed) lessonNext(s, 'beaten');
  } else if (L.step === 'beaten' && L.t > 1.6) {
    startFight(s);
  }
}

// Checkpoints: levels 2, 4 and 5, then every 3 levels. Reaching one means your next run starts there.
export function isCheckpoint(level) {
  const last = C.checkpoints.at(-1);
  if (C.checkpoints.includes(level)) return true;
  return level > last && (level - last) % C.checkpointEvery === 0;
}

// Tricks: pick one after clearing level 2, and get the other after clearing level 5.
export const TRICKS = ['overclock', 'ricochet'];
function trickOffer(s) {
  const left = TRICKS.filter(t => !s.tricks.includes(t));
  return s.round === 2 || s.round === 5 ? left : [];
}

function startRun(s, input) {
  if (s.round === 0) s.round = Math.max(0, s.save.checkpoint - 1);
  s.stats = { reads: 0, readsBeaten: 0, guesses: 0, guessesBeaten: 0 };
  s.runBest = 0;
  s.tricks = [];
  sfx.play('start');
  startRound(s, input);
}

function fire(s, who, tx, ty, owner, speed = C.bulletSpeed) {
  const dx = tx - who.x, dy = ty - who.y;
  const l = Math.hypot(dx, dy) || 1;
  const b = { x: who.x + dx / l * (C.radius + 6), y: who.y + dy / l * (C.radius + 6), vx: dx / l * speed, vy: dy / l * speed, owner };
  s.bullets.push(b);
  return b;
}

function moveFighter(f, mx, my, dt) {
  f.fireCd = Math.max(0, f.fireCd - dt);
  f.dashCd = Math.max(0, f.dashCd - dt);
  f.hitFlash = Math.max(0, f.hitFlash - dt);
  if (f.dashT > 0) {
    f.dashT -= dt;
    f.vx = f.dashX * C.dashSpeed; f.vy = f.dashY * C.dashSpeed;
  } else {
    f.vx = mx * C.playerSpeed; f.vy = my * C.playerSpeed;
  }
  f.x = Math.max(C.radius, Math.min(C.arenaW - C.radius, f.x + f.vx * dt));
  f.y = Math.max(C.radius, Math.min(C.arenaH - C.radius, f.y + f.vy * dt));
  const out = pushOut(f.x, f.y, C.radius);
  f.x = out.x; f.y = out.y;
}

function startDash(f, x, y) {
  const l = Math.hypot(x, y);
  if (!l || f.dashCd > 0) return false;
  f.dashX = x / l; f.dashY = y / l; f.dashT = C.dashTime; f.dashCd = C.dashCooldown;
  return true;
}

function updatePlayer(s, input, dt) {
  const p = s.player;
  const mv = moveVector(input);
  if (input.touch) {
    // Touch aim: drag direction from the right thumb, else auto-aim at the rival.
    const a = input.aimTouch;
    const drag = a ? { x: a.x - a.sx, y: a.y - a.sy } : input.releaseAim;
    input.releaseAim = null;
    if (drag && Math.hypot(drag.x, drag.y) > 15) { p.aimX = p.x + drag.x * 10; p.aimY = p.y + drag.y * 10; }
    else if (!a) { p.aimX = s.rival.x; p.aimY = s.rival.y; }
  } else { p.aimX = input.mouse.x; p.aimY = input.mouse.y; }
  const dash = input.dashDir ?? mv;
  input.dashDir = null;
  if (inLesson(s) && s.tutorial.step === 'move' && Math.hypot(mv.x, mv.y) > 0.1 && (s.tutorial.moved += dt) > 0.8) lessonNext(s, 'shoot');
  if (input.dashPressed && startDash(p, dash.x, dash.y)) {
    if (inLesson(s) && s.tutorial.step === 'dash') lessonNext(s, 'read');
    const d = dir8(dash.x, dash.y) ?? (dash.x < 0 ? 'W' : 'E');
    if (d.includes('W')) s.roundStats.dashedLeft = true;
    logAction(s, `dash:${d}`);
    shake(s.feel, 3);
    sfx.play('dash');
  }
  const wantFire = input.mouseDown || input.fireOnce;
  input.fireOnce = false;
  if (wantFire && p.fireCd <= 0) {
    fire(s, p, p.aimX, p.aimY, 'player');
    p.fireCd = s.overclockT > 0 ? C.fireCooldown / 2 : C.fireCooldown;
    sfx.play('shoot');
    if (playerCtx(s).dist === 'far') s.roundStats.farShot = true;
    logAction(s, 'shoot');
  }
  moveFighter(p, mv.x, mv.y, dt);
  if (p.dashT > 0) ghost(s.feel, p.x, p.y, COLORS.player, C.radius);
  s.sampleT += dt;
  if (s.sampleT >= C.sampleEvery) {
    s.sampleT -= C.sampleEvery;
    if (p.dashT <= 0) {
      const d = dir8(mv.x, mv.y);
      if (d && s.lastMoveDir) recordMomentum(s.model, d === s.lastMoveDir);
      s.lastMoveDir = d;
      logAction(s, d ? `move:${d}` : 'still');
    }
  }
}

function updateRival(s, dt) {
  const r = s.rival, p = s.player;
  const view = {
    me: { x: r.x, y: r.y, hp: r.hp, dashReady: r.dashCd <= 0, fireReady: r.fireCd <= 0 },
    foe: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, hp: p.hp },
    round: s.round, time: s.time, foeCtx: playerCtx(s), bullets: s.bullets, rivalBulletSpeed: s.tuning.bulletSpeed,
    blocked: segmentBlocked(r.x, r.y, p.x, p.y),
  };
  const it = think(s.brain, view, s.model, dt);
  if (inLesson(s)) { it.fire = false; it.read = null; it.readShot = null; it.dash = null; }
  if (it.read) {
    s.readLabel = { text: it.read.label, t: 0, kind: it.read.kind, at: it.read.fireAt };
    if (it.read.kind === 'guess') s.stats.guesses += 1; else s.stats.reads += 1;
    sfx.play(it.read.kind === 'guess' ? 'guess' : 'read');
  }
  if (it.dash && startDash(r, it.dash.x, it.dash.y)) shake(s.feel, 2);
  if (it.readShot) {
    s.activeRead = { id: ++s.readSeq, firedAt: s.time, hit: false, guess: s.readLabel?.kind === 'guess' };
    fire(s, r, it.readShot.x, it.readShot.y, 'rival', s.tuning.bulletSpeed).readId = s.activeRead.id;
    s.lastRivalShot = s.time;
  }
  if (it.fire && (r.fireCd <= 0 || it.readShot)) {
    const b = fire(s, r, it.aimX, it.aimY, 'rival', s.tuning.bulletSpeed);
    if (it.readShot) b.readId = s.activeRead.id;
    r.fireCd = s.tuning.fireCd;
    sfx.play('rivalShoot');
    s.lastRivalShot = s.time;
  }
  r.aimX = it.aimX; r.aimY = it.aimY;
  const slow = s.rivalSlowT > 0 ? C.outplayedSlow.speed : 1;
  moveFighter(r, it.moveX * slow, it.moveY * slow, dt);
  if (r.dashT > 0) ghost(s.feel, r.x, r.y, COLORS.rival, C.radius);
}

function hit(s, target, color) {
  if (inLesson(s)) {
    // Lesson hits do no damage; your first hit on the rival finishes the "shoot" step.
    target.hitFlash = 0.12;
    sfx.play(target === s.rival ? 'rivalHit' : 'playerHit');
    burst(s.feel, target.x, target.y, color, 12);
    if (target === s.rival && s.tutorial.step === 'shoot') lessonNext(s, 'dash');
    return;
  }
  target.hp -= 1; target.hitFlash = 0.12;
  sfx.play(target === s.rival ? 'rivalHit' : 'playerHit');
  hitStop(s.feel, 0.06); flash(s.feel, 0.08); shake(s.feel, 6);
  burst(s.feel, target.x, target.y, color, 12);
  if (target.hp <= 0) slowMo(s.feel, 0.6, 0.25);
}

// A read is beaten when every bullet of the read shot is gone and none of them hit.
function resolveRead(s) {
  const r = s.activeRead;
  if (!r) return;
  if (r.hit) { s.activeRead = null; return; }
  const flying = s.bullets.some(b => b.readId === r.id);
  if (flying && s.time - r.firedAt < 2) return;
  s.activeRead = null;
  if (r.guess) { s.stats.guessesBeaten += 1; s.outplayed = { t: 0, text: 'UNREADABLE' }; }
  else {
    if (!r.lesson) s.stats.readsBeaten += 1;
    s.outplayed = { t: 0, text: 'OUTPLAYED' };
    s.rivalSlowT = C.outplayedSlow.time; // it was wrong-footed: punish it
    if (s.tricks.includes('overclock')) s.overclockT = C.overclockTime;
  }
  s.brain.sinceRead = -2; // the rival needs a moment after being outplayed
  slowMo(s.feel, 0.3, 0.35);
  shake(s.feel, 4);
  const dx = s.rival.x - s.player.x, dy = s.rival.y - s.player.y, l = Math.hypot(dx, dy) || 1;
  s.rival.x = Math.max(C.radius, Math.min(C.arenaW - C.radius, s.rival.x + dx / l * 18));
  s.rival.y = Math.max(C.radius, Math.min(C.arenaH - C.radius, s.rival.y + dy / l * 18));
  s.rival.hitFlash = 0.1;
  sfx.play(r.guess ? 'unreadable' : 'outplayed');
}

function updateBullets(s, dt) {
  const keep = [];
  for (const b of s.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    const color = b.owner === 'player' ? COLORS.player : COLORS.rival;
    const canBounce = b.owner === 'player' && !b.bounced && s.tricks.includes('ricochet');
    const pillar = b.ghost ? null : pillarAt(b.x, b.y);
    if (pillar && canBounce) {
      // Ricochet: step back out and flip the axis whose face was crossed.
      const px = b.x - b.vx * dt, py = b.y - b.vy * dt;
      if (px <= pillar.x || px >= pillar.x + pillar.w) b.vx = -b.vx; else b.vy = -b.vy;
      b.x = px; b.y = py; b.bounced = true;
      burst(s.feel, b.x, b.y, color, 4, 100);
      keep.push(b);
      continue;
    }
    if (pillar) { burst(s.feel, b.x, b.y, color, 6, 140); continue; }
    const outX = b.x < 0 || b.x > C.arenaW, outY = b.y < 0 || b.y > C.arenaH;
    if ((outX || outY) && canBounce) {
      if (outX) { b.vx = -b.vx; b.x = b.x < 0 ? -b.x : 2 * C.arenaW - b.x; }
      if (outY) { b.vy = -b.vy; b.y = b.y < 0 ? -b.y : 2 * C.arenaH - b.y; }
      b.bounced = true;
      burst(s.feel, b.x, b.y, color, 4, 100);
      keep.push(b);
      continue;
    }
    if (outX || outY) {
      burst(s.feel, Math.max(0, Math.min(C.arenaW, b.x)), Math.max(0, Math.min(C.arenaH, b.y)), color, 6, 140);
      continue;
    }
    const target = b.owner === 'player' ? s.rival : s.player;
    if (target.dashT <= 0 && Math.hypot(b.x - target.x, b.y - target.y) < C.radius + C.bulletRadius) {
      if (b.readId && s.activeRead?.id === b.readId) s.activeRead.hit = true;
      hit(s, target, color);
      continue;
    }
    keep.push(b);
  }
  s.bullets = keep;
}

function endRound(s) {
  const { player: p, rival: r } = s;
  s.roundWinner = p.hp > r.hp ? 'player' : r.hp > p.hp ? 'rival' : 'draw';
  s.outplayed = null; s.readLabel = null;
  if (s.roundWinner === 'player') sfx.play('clear');
  else if (s.roundWinner === 'rival') sfx.play('defeat');
  const pred = predictability(s.model);
  let challengeJustDone = false;
  if (s.roundWinner === 'player' && !s.save.challengeDone) {
    const id = s.save.challenge.id;
    const met = (id === 'lowPred' && pred < 50) || (id === 'noLeftDash' && !s.roundStats.dashedLeft) || (id === 'noFarShot' && !s.roundStats.farShot);
    if (met) { s.save.challengeDone = true; challengeJustDone = true; s.ui.challenge = challengeLine(s.save); }
  }
  s.ui.report = {
    habits: topHabits(s.model, 3).map(h => `${h.text}   ${h.p}%`),
    predictability: `Predictability ${pred}%`,
    readsLine: `Reads beaten: ${s.stats.readsBeaten}/${s.stats.reads}`,
    guessLine: `Guesses dodged: ${s.stats.guessesBeaten}/${s.stats.guesses}`,
    challengeJustDone,
  };
  decay(s.model);
  writeSave(safeStorage(), s.save);
  s.phase = 'roundEnd'; s.phaseT = 0;
}


export function step(s, input, dt) {
  s.phaseT += dt;
  const click = input.clicked;
  input.clicked = false;
  if (s.paused) return;
  if (s.phase === 'title') { if (click) startRun(s, input); }
  else if (s.phase === 'round') {
    if (s.tutorial) updateLesson(s, input, dt);
    if (!inLesson(s)) s.time += dt;
    if (s.readLabel) s.readLabel.t += dt;
    updatePlayer(s, input, dt);
    updateRival(s, dt);
    updateBullets(s, dt);
    resolveRead(s);
    if (s.outplayed && (s.outplayed.t += dt) > 1.2) s.outplayed = null;
    s.overclockT = Math.max(0, s.overclockT - dt);
    s.rivalSlowT = Math.max(0, (s.rivalSlowT ?? 0) - dt);
    if (s.player.hp <= 0 || s.rival.hp <= 0) {
      // Let the killing blow play out in slow motion before the round ends.
      s.killTimer ??= 0.15;
      s.killTimer -= dt;
      if (s.killTimer <= 0) endRound(s);
    } else if (s.time >= C.roundTime) endRound(s);
  } else if (s.phase === 'roundEnd') { if (s.phaseT > 1.2) { s.phase = 'report'; s.phaseT = 0; } }
  else if (s.phase === 'report') {
    if (click || s.phaseT > 5) {
      if (s.roundWinner === 'rival') {
        // Run over. The rival levels up whenever it ends a run past your checkpoint.
        if (s.round > s.save.checkpoint) s.save.rivalLevel += 1;
        const [top] = topHabits(s.model, 1);
        s.ui.matchLine = top ? `"${top.text}. ${top.p}% of the time. I noticed."` : '"You are hard to read. For now."';
        s.ui.runLevel = s.round;
        writeSave(safeStorage(), s.save);
        s.phase = 'runOver'; s.phaseT = 0;
      } else {
        if (s.roundWinner === 'draw') s.round -= 1; // replay the same level
        const offer = s.roundWinner === 'player' ? trickOffer(s) : [];
        if (offer.length) { s.trickOffer = offer; s.phase = 'trickPick'; s.phaseT = 0; input.pick = null; }
        else startRound(s, input);
      }
    }
  } else if (s.phase === 'trickPick') {
    // Click or tap the left or right half, or press 1 or 2.
    let pick = input.pick;
    if (pick === null && click && s.phaseT > 0.3) pick = input.mouse.x < C.arenaW / 2 ? 0 : 1;
    input.pick = null;
    if (pick !== null && pick !== undefined) {
      s.tricks.push(s.trickOffer.at(Math.min(pick, s.trickOffer.length - 1)));
      s.trickOffer = [];
      sfx.play('unreadable');
      startRound(s, input);
    }
  } else if (s.phase === 'runOver') {
    if (click && s.phaseT > 0.5) { s.round = 0; startRun(s, input); }
  }
  input.dashPressed = false;
}

// ---------- boot ----------
export function start(canvas) {
  const ctx = canvas.getContext('2d');
  const s = newState();
  const input = createInput();
  let scale = 1, dpr = 1;
  const rotate = document.getElementById('rotate');
  const coarse = window.matchMedia('(pointer: coarse)');

  function fit() {
    scale = Math.min(window.innerWidth / C.arenaW, window.innerHeight / C.arenaH);
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(C.arenaW * scale * dpr); canvas.height = Math.round(C.arenaH * scale * dpr);
    canvas.style.width = `${C.arenaW * scale}px`;
    canvas.style.height = `${C.arenaH * scale}px`;
    canvas.style.marginTop = `${(window.innerHeight - C.arenaH * scale) / 2}px`;
    const portrait = coarse.matches && window.innerHeight > window.innerWidth;
    s.paused = portrait;
    if (rotate) rotate.style.display = portrait ? 'flex' : 'none';
    input.touch = input.touch || coarse.matches;
  }
  function toArena(x, y) {
    const r = canvas.getBoundingClientRect();
    return { x: (x - r.left) / scale, y: (y - r.top) / scale };
  }
  fit();
  window.addEventListener('resize', fit);
  // Read the physical key (e.code), not the letter: keyboard layouts and input tools can change e.key.
  const CODES = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', ArrowUp: 'arrowup', ArrowDown: 'arrowdown', ArrowLeft: 'arrowleft', ArrowRight: 'arrowright' };
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { input.dashPressed = true; e.preventDefault(); return; }
    const k = CODES[e.code];
    if (k) { input.keys.add(k); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => { const k = CODES[e.code]; if (k) input.keys.delete(k); });
  window.addEventListener('blur', () => { input.keys.clear(); input.mouseDown = false; });
  canvas.addEventListener('mousemove', e => { input.mouse = toArena(e.clientX, e.clientY); });
  window.addEventListener('pointerdown', () => sfx.unlock());
  window.addEventListener('keydown', () => sfx.unlock());
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyM') toggleMute();
    if (e.code === 'KeyF') toggleFullscreen();
    if (e.code === 'Enter' && inLesson(s)) input.skip = true;
    if (e.code === 'Digit1') input.pick = 0;
    if (e.code === 'Digit2') input.pick = 1;
  });
  const onSkip = a => inLesson(s) && s.phase === 'round' && Math.abs(a.x - C.skipButton.x) < C.skipButton.w / 2 && Math.abs(a.y - C.skipButton.y) < C.skipButton.h / 2;
  const onDash = a => s.phase === 'round' && Math.hypot(a.x - C.dashButton.x, a.y - C.dashButton.y) < C.dashButton.r + 10;
  canvas.addEventListener('mousedown', e => {
    input.mouse = toArena(e.clientX, e.clientY);
    if (onSkip(input.mouse)) { input.skip = true; return; }
    input.mouseDown = true; input.clicked = true;
  });
  window.addEventListener('mouseup', () => { input.mouseDown = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Touch: left half = floating move stick; right half = drag to aim, release to fire, quick swipe to dash.
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    input.touch = true;
    goFullscreen();
    if (s.phase !== 'round') {
      const t0 = e.changedTouches[0];
      if (t0) input.mouse = toArena(t0.clientX, t0.clientY);
      input.clicked = true;
      return;
    }
    for (const t of e.changedTouches) {
      const a = toArena(t.clientX, t.clientY);
      if (onSkip(a)) { input.skip = true; continue; }
      if (onDash(a)) {
        // Dash button: dash the way the left thumb is pushing, or away from the rival when standing still.
        const mv = moveVector(input);
        const away = { x: s.player.x - s.rival.x, y: s.player.y - s.rival.y };
        const d = Math.hypot(mv.x, mv.y) > 0.1 ? mv : away;
        const l = Math.hypot(d.x, d.y) || 1;
        input.dashPressed = true; input.dashDir = { x: d.x / l, y: d.y / l };
        continue;
      }
      if (a.x < C.arenaW / 2 && !input.stick) input.stick = { id: t.identifier, ox: a.x, oy: a.y, x: a.x, y: a.y };
      else if (!input.aimTouch) input.aimTouch = { id: t.identifier, sx: a.x, sy: a.y, x: a.x, y: a.y, t0: performance.now() };
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const a = toArena(t.clientX, t.clientY);
      if (input.stick?.id === t.identifier) { input.stick.x = a.x; input.stick.y = a.y; }
      if (input.aimTouch?.id === t.identifier) { input.aimTouch.x = a.x; input.aimTouch.y = a.y; }
    }
  }, { passive: false });
  function touchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (input.stick?.id === t.identifier) input.stick = null;
      const a = input.aimTouch;
      if (a?.id === t.identifier) {
        const dx = a.x - a.sx, dy = a.y - a.sy, d = Math.hypot(dx, dy);
        if (d > 60 && performance.now() - a.t0 < 150) { input.dashPressed = true; input.dashDir = { x: dx / d, y: dy / d }; }
        else { input.fireOnce = true; if (d > 15) input.releaseAim = { x: dx, y: dy }; }
        input.aimTouch = null;
      }
    }
  }
  canvas.addEventListener('touchend', touchEnd, { passive: false });
  canvas.addEventListener('touchcancel', touchEnd, { passive: false });

  s.ui.soundOn = () => !sfx.isMuted();
  if (rotate) rotate.addEventListener('pointerdown', goFullscreen);
  document.addEventListener('fullscreenchange', fit);
  s.ui.iphoneHint = isIphoneBrowser();
  window.__habit = { state: s, input, toArena, debugHit: () => hit(s, s.rival, COLORS.player), debugEndRound: () => endRound(s) };
  let last = performance.now();
  function frame(now) {
    const dt = clampDt((now - last) / 1000);
    last = now;
    step(s, input, updateFeel(s.feel, dt));
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    render(ctx, s, input);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
