// Habit: game loop, input, simulation, screens, rendering.
import { CONFIG as C } from './config.js';
import { record, decay, topHabits, predictability } from './habit.js';
import { loadSave, writeSave, welcomeLine } from './save.js';
import { createBrain, think } from './rival.js';
import { clampDt, distBand, dir8 } from './util.js';
import { createFeel, hitStop, slowMo, shake, flash, burst, ghost, updateFeel, cameraOffset, drawFeel } from './feel.js';

const COLORS = { bg: '#0d0f14', wall: '#2a3040', player: '#4fd1ff', rival: '#ff6b4a', text: '#e8ecf4', quiet: '#8a93a6', read: '#ffd84a' };

// ---------- input ----------
function createInput() {
  return {
    keys: new Set(), mouse: { x: C.arenaW / 2, y: C.arenaH / 2 }, mouseDown: false, dashPressed: false, clicked: false,
    touch: false, stick: null, aimTouch: null, dashDir: null, fireOnce: false, releaseAim: null,
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

function newState() {
  const save = loadSave(safeStorage(), today());
  return {
    phase: 'title', phaseT: 0, round: 0, score: { player: 0, rival: 0 }, time: 0,
    player: fighter(240, C.arenaH / 2), rival: fighter(C.arenaW - 240, C.arenaH / 2),
    bullets: [], save, model: save.model, brain: null,
    sampleT: 0, lastAction: null, lastRivalShot: -9, readLabel: null, roundWinner: null, paused: false,
    feel: createFeel(),
    roundStats: { dashedLeft: false, farShot: false },
    ui: { welcome: welcomeLine(save), challenge: challengeLine(save), report: null, matchLine: null },
  };
}

function challengeLine(save) {
  return `Today: ${save.challenge.text}${save.challengeDone ? '  (done)' : ''}`;
}

// ---------- audio: one short beep for reads ----------
let audio = null;
function unlockAudio() {
  try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch { audio = null; }
}
function beep(freq = 880, len = 0.08) {
  if (!audio) return;
  try {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.06, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + len);
    o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + len);
  } catch { /* no sound is fine */ }
}

function startRound(s, input) {
  if (input) {
    // A touch or key held through the end of a round must not fire or dash in the next one.
    input.fireOnce = false; input.dashPressed = false; input.dashDir = null;
    input.aimTouch = null; input.stick = null; input.releaseAim = null; input.mouseDown = false;
  }
  s.killTimer = null;
  s.round += 1;
  s.time = 0; s.sampleT = 0; s.bullets = []; s.readLabel = null; s.lastRivalShot = -9;
  s.player = fighter(240, C.arenaH / 2);
  s.rival = fighter(C.arenaW - 240, C.arenaH / 2);
  s.brain = createBrain(s.save.rivalLevel, s.save.bonusReads);
  s.roundStats = { dashedLeft: false, farShot: false };
  s.phase = 'round'; s.phaseT = 0;
}

function playerCtx(s) {
  const d = Math.hypot(s.player.x - s.rival.x, s.player.y - s.rival.y);
  return { dist: distBand(d), shotAt: s.time - s.lastRivalShot < 0.6, lowHp: s.player.hp <= 1, last: s.lastAction };
}

function logAction(s, action) {
  record(s.model, playerCtx(s), action);
  s.lastAction = action;
}

// ---------- simulation ----------
function fire(s, who, tx, ty, owner) {
  const dx = tx - who.x, dy = ty - who.y;
  const l = Math.hypot(dx, dy) || 1;
  s.bullets.push({ x: who.x + dx / l * (C.radius + 6), y: who.y + dy / l * (C.radius + 6), vx: dx / l * C.bulletSpeed, vy: dy / l * C.bulletSpeed, owner });
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
  if (input.dashPressed && startDash(p, dash.x, dash.y)) {
    const d = dir8(dash.x, dash.y) ?? (dash.x < 0 ? 'W' : 'E');
    if (d.includes('W')) s.roundStats.dashedLeft = true;
    logAction(s, `dash:${d}`);
    shake(s.feel, 3);
  }
  const wantFire = input.mouseDown || input.fireOnce;
  input.fireOnce = false;
  if (wantFire && p.fireCd <= 0) {
    fire(s, p, p.aimX, p.aimY, 'player');
    p.fireCd = C.fireCooldown;
    if (playerCtx(s).dist === 'far') s.roundStats.farShot = true;
    logAction(s, 'shoot');
  }
  moveFighter(p, mv.x, mv.y, dt);
  if (p.dashT > 0) ghost(s.feel, p.x, p.y, COLORS.player, C.radius);
  s.sampleT += dt;
  if (s.sampleT >= C.sampleEvery) {
    s.sampleT -= C.sampleEvery;
    if (p.dashT <= 0) { const d = dir8(mv.x, mv.y); logAction(s, d ? `move:${d}` : 'still'); }
  }
}

function updateRival(s, dt) {
  const r = s.rival, p = s.player;
  const view = {
    me: { x: r.x, y: r.y, hp: r.hp, dashReady: r.dashCd <= 0, fireReady: r.fireCd <= 0 },
    foe: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, hp: p.hp },
    round: s.round, time: s.time, foeCtx: playerCtx(s), bullets: s.bullets,
  };
  const it = think(s.brain, view, s.model, dt);
  if (it.read) { s.readLabel = { text: it.read.label, t: 0, kind: it.read.kind, at: it.read.fireAt }; beep(880); }
  if (it.readShot) beep(440, 0.12);
  if (it.dash && startDash(r, it.dash.x, it.dash.y)) shake(s.feel, 2);
  if (it.readShot) { fire(s, r, it.readShot.x, it.readShot.y, 'rival'); s.lastRivalShot = s.time; }
  if (it.fire && (r.fireCd <= 0 || it.readShot)) {
    fire(s, r, it.aimX, it.aimY, 'rival');
    r.fireCd = C.fireCooldown * (s.round === 1 ? C.round1FireMult : 1);
    s.lastRivalShot = s.time;
  }
  r.aimX = it.aimX; r.aimY = it.aimY;
  moveFighter(r, it.moveX, it.moveY, dt);
  if (r.dashT > 0) ghost(s.feel, r.x, r.y, COLORS.rival, C.radius);
}

function hit(s, target, color) {
  target.hp -= 1; target.hitFlash = 0.12;
  hitStop(s.feel, 0.06); flash(s.feel, 0.08); shake(s.feel, 6);
  burst(s.feel, target.x, target.y, color, 12);
  if (target.hp <= 0) slowMo(s.feel, 0.6, 0.25);
}

function updateBullets(s, dt) {
  const keep = [];
  for (const b of s.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    const color = b.owner === 'player' ? COLORS.player : COLORS.rival;
    if (b.x < 0 || b.y < 0 || b.x > C.arenaW || b.y > C.arenaH) {
      burst(s.feel, Math.max(0, Math.min(C.arenaW, b.x)), Math.max(0, Math.min(C.arenaH, b.y)), color, 6, 140);
      continue;
    }
    const target = b.owner === 'player' ? s.rival : s.player;
    if (target.dashT <= 0 && Math.hypot(b.x - target.x, b.y - target.y) < C.radius + C.bulletRadius) {
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
  if (s.roundWinner !== 'draw') s.score[s.roundWinner] += 1;
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
    challengeJustDone,
  };
  decay(s.model);
  writeSave(safeStorage(), s.save);
  s.phase = 'roundEnd'; s.phaseT = 0;
}

function matchOver(s) {
  const need = Math.ceil(C.rounds / 2);
  return s.score.player >= need || s.score.rival >= need || s.round >= C.rounds;
}

function step(s, input, dt) {
  s.phaseT += dt;
  const click = input.clicked;
  input.clicked = false;
  if (s.paused) return;
  if (s.phase === 'title') { if (click) startRound(s, input); }
  else if (s.phase === 'round') {
    s.time += dt;
    if (s.readLabel) s.readLabel.t += dt;
    updatePlayer(s, input, dt);
    updateRival(s, dt);
    updateBullets(s, dt);
    if (s.player.hp <= 0 || s.rival.hp <= 0) {
      // Let the killing blow play out in slow motion before the round ends.
      s.killTimer ??= 0.15;
      s.killTimer -= dt;
      if (s.killTimer <= 0) endRound(s);
    } else if (s.time >= C.roundTime) endRound(s);
  } else if (s.phase === 'roundEnd') { if (s.phaseT > 1.2) { s.phase = 'report'; s.phaseT = 0; } }
  else if (s.phase === 'report') {
    if (click || s.phaseT > 5) {
      if (matchOver(s)) {
        if (s.score.player > s.score.rival) s.save.rivalLevel += 1;
        const [top] = topHabits(s.model, 1);
        s.ui.matchLine = top ? `"${top.text}. ${top.p}% of the time. I noticed."` : '"You are hard to read. For now."';
        writeSave(safeStorage(), s.save);
        s.phase = 'matchEnd'; s.phaseT = 0;
      } else startRound(s, input);
    }
  } else if (s.phase === 'matchEnd') {
    if (click && s.phaseT > 0.5) { s.round = 0; s.score = { player: 0, rival: 0 }; startRound(s, input); }
  }
  input.dashPressed = false;
}

// ---------- rendering ----------
function text(ctx, str, x, y, size, color = COLORS.text, align = 'center', weight = 600) {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function drawFighter(ctx, f, color) {
  ctx.globalAlpha = f.dashT > 0 ? 0.5 : 1;
  ctx.fillStyle = f.hitFlash > 0 ? '#ffffff' : color;
  ctx.beginPath(); ctx.arc(f.x, f.y, C.radius, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  const a = Math.atan2(f.aimY - f.y, f.aimX - f.x);
  ctx.strokeStyle = color; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * C.radius, f.y + Math.sin(a) * C.radius);
  ctx.lineTo(f.x + Math.cos(a) * (C.radius + 10), f.y + Math.sin(a) * (C.radius + 10)); ctx.stroke();
}

function drawHud(ctx, s) {
  for (let i = 0; i < C.hp; i++) {
    ctx.fillStyle = i < s.player.hp ? COLORS.player : COLORS.wall;
    ctx.fillRect(24 + i * 22, 20, 16, 8);
    ctx.fillStyle = i < s.rival.hp ? COLORS.rival : COLORS.wall;
    ctx.fillRect(C.arenaW - 40 - i * 22, 20, 16, 8);
  }
  text(ctx, `ROUND ${s.round}   ${s.score.player} - ${s.score.rival}`, C.arenaW / 2, 24, 16, COLORS.quiet);
  text(ctx, `${Math.max(0, Math.ceil(C.roundTime - s.time))}`, C.arenaW / 2, 48, 14, COLORS.quiet);
}

function drawReadTarget(ctx, s) {
  const r = s.readLabel;
  if (!r || !r.at || r.t > 0.6) return;
  ctx.save();
  ctx.globalAlpha = r.t < 0.3 ? 0.9 : Math.max(0, 1 - (r.t - 0.3) / 0.3);
  ctx.strokeStyle = COLORS.read; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.arc(r.at.x, r.at.y, C.radius + 6, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s.player.x, s.player.y); ctx.lineTo(r.at.x, r.at.y); ctx.stroke();
  ctx.restore();
}

function drawRead(ctx, s) {
  const r = s.readLabel;
  if (!r || r.t > 1.2) return;
  const pop = Math.min(1, r.t / 0.1);
  ctx.save();
  ctx.translate(s.rival.x, s.rival.y - 44);
  ctx.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
  ctx.globalAlpha = r.t > 0.9 ? Math.max(0, 1 - (r.t - 0.9) / 0.3) : 1;
  text(ctx, r.text, 0, 0, 18, COLORS.read, 'center', 800);
  ctx.restore();
}

function drawSticks(ctx, input) {
  if (!input.touch) return;
  ctx.strokeStyle = 'rgba(232,236,244,0.25)'; ctx.lineWidth = 2;
  const st = input.stick;
  if (st) {
    ctx.beginPath(); ctx.arc(st.ox, st.oy, 50, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(232,236,244,0.25)';
    ctx.beginPath(); ctx.arc(st.x, st.y, 18, 0, Math.PI * 2); ctx.fill();
  }
}

function render(ctx, s, input) {
  ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, C.arenaW, C.arenaH);
  ctx.strokeStyle = COLORS.wall; ctx.lineWidth = 2; ctx.strokeRect(1, 1, C.arenaW - 2, C.arenaH - 2);
  if (s.phase === 'title') {
    text(ctx, 'HABIT', C.arenaW / 2, 190, 72, COLORS.text, 'center', 800);
    text(ctx, 'A rival that learns how you fight.', C.arenaW / 2, 250, 20, COLORS.quiet, 'center', 400);
    if (s.ui.welcome) text(ctx, s.ui.welcome, C.arenaW / 2, 300, 17, COLORS.rival, 'center', 600);
    if (s.save.rivalLevel > 1) text(ctx, `Rival level ${s.save.rivalLevel}`, C.arenaW / 2, 326, 14, COLORS.quiet, 'center', 400);
    text(ctx, input.touch ? 'Tap to start' : 'Click to start', C.arenaW / 2, 372, 22, COLORS.read);
    text(ctx, s.ui.challenge, C.arenaW / 2, 412, 15, COLORS.text, 'center', 400);
    text(ctx, input.touch ? 'Left thumb move · right thumb drag to aim, release to shoot · quick swipe to dash'
      : 'WASD move · mouse aim · click shoot · Space dash', C.arenaW / 2, 470, 15, COLORS.quiet, 'center', 400);
    return;
  }
  const cam = cameraOffset(s.feel);
  ctx.save();
  ctx.translate(cam.x, cam.y);
  for (const b of s.bullets) {
    ctx.fillStyle = b.owner === 'player' ? COLORS.player : COLORS.rival;
    ctx.beginPath(); ctx.arc(b.x, b.y, C.bulletRadius, 0, Math.PI * 2); ctx.fill();
  }
  drawFighter(ctx, s.player, COLORS.player);
  drawFighter(ctx, s.rival, COLORS.rival);
  drawReadTarget(ctx, s);
  drawFeel(s.feel, ctx, C.arenaW, C.arenaH);
  ctx.restore();
  drawRead(ctx, s);
  drawHud(ctx, s);
  drawSticks(ctx, input);
  if (s.phase === 'roundEnd') {
    const msg = s.roundWinner === 'player' ? 'ROUND WON' : s.roundWinner === 'rival' ? 'ROUND LOST' : 'DRAW';
    text(ctx, msg, C.arenaW / 2, C.arenaH / 2, 48, COLORS.text, 'center', 800);
  }
  if (s.phase === 'report' || s.phase === 'matchEnd') {
    ctx.fillStyle = 'rgba(13,15,20,0.92)'; ctx.fillRect(0, 0, C.arenaW, C.arenaH);
    const tap = input.touch ? 'Tap' : 'Click';
    if (s.phase === 'report') {
      const rep = s.ui.report;
      text(ctx, 'HABIT REPORT', C.arenaW / 2, 110, 34, COLORS.text, 'center', 800);
      text(ctx, 'What your rival learned about you', C.arenaW / 2, 146, 15, COLORS.quiet, 'center', 400);
      rep.habits.forEach((h, i) => text(ctx, h, C.arenaW / 2, 210 + i * 36, 20, COLORS.read, 'center', 600));
      if (!rep.habits.length) text(ctx, 'Not enough data yet', C.arenaW / 2, 210, 20, COLORS.quiet, 'center', 400);
      text(ctx, rep.predictability, C.arenaW / 2, 340, 26, COLORS.rival, 'center', 800);
      text(ctx, `Score ${s.score.player} - ${s.score.rival}`, C.arenaW / 2, 380, 16, COLORS.quiet, 'center', 400);
      if (rep.challengeJustDone) text(ctx, 'Daily challenge complete!', C.arenaW / 2, 412, 16, COLORS.player, 'center', 700);
      text(ctx, `${tap} to continue`, C.arenaW / 2, 470, 18, COLORS.text);
    } else {
      const won = s.score.player > s.score.rival;
      text(ctx, won ? 'MATCH WON' : s.score.player === s.score.rival ? 'MATCH DRAWN' : 'MATCH LOST', C.arenaW / 2, 150, 44, COLORS.text, 'center', 800);
      text(ctx, `${s.score.player} - ${s.score.rival}`, C.arenaW / 2, 200, 22, COLORS.quiet, 'center', 600);
      text(ctx, s.ui.matchLine ?? '', C.arenaW / 2, 270, 20, COLORS.rival, 'center', 600);
      text(ctx, `Rival level ${s.save.rivalLevel}`, C.arenaW / 2, 320, 16, COLORS.quiet, 'center', 400);
      text(ctx, "I'll study this tonight. Come back tomorrow.", C.arenaW / 2, 352, 16, COLORS.quiet, 'center', 400);
      text(ctx, `${tap} to play again`, C.arenaW / 2, 440, 18, COLORS.read);
    }
  }
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
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === ' ') { input.dashPressed = true; e.preventDefault(); }
    input.keys.add(k);
  });
  window.addEventListener('keyup', e => input.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => { input.keys.clear(); input.mouseDown = false; });
  canvas.addEventListener('mousemove', e => { input.mouse = toArena(e.clientX, e.clientY); });
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  canvas.addEventListener('mousedown', e => { input.mouse = toArena(e.clientX, e.clientY); input.mouseDown = true; input.clicked = true; });
  window.addEventListener('mouseup', () => { input.mouseDown = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Touch: left half = floating move stick; right half = drag to aim, release to fire, quick swipe to dash.
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    input.touch = true;
    if (s.phase !== 'round') { input.clicked = true; return; }
    for (const t of e.changedTouches) {
      const a = toArena(t.clientX, t.clientY);
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
