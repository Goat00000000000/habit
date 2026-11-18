// Habit: game loop, input, simulation, screens, rendering.
import { CONFIG as C } from './config.js';
import { record, decay } from './habit.js';
import { loadSave, writeSave } from './save.js';
import { createBrain, think } from './rival.js';
import { clampDt, distBand, dir8 } from './util.js';

const COLORS = { bg: '#0d0f14', wall: '#2a3040', player: '#4fd1ff', rival: '#ff6b4a', text: '#e8ecf4', quiet: '#8a93a6', read: '#ffd84a' };

// ---------- input ----------
function createInput() {
  return { keys: new Set(), mouse: { x: C.arenaW / 2, y: C.arenaH / 2 }, mouseDown: false, dashPressed: false, clicked: false };
}

function moveVector(input) {
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
  };
}

function startRound(s) {
  s.round += 1;
  s.time = 0; s.sampleT = 0; s.bullets = []; s.readLabel = null; s.lastRivalShot = -9;
  s.player = fighter(240, C.arenaH / 2);
  s.rival = fighter(C.arenaW - 240, C.arenaH / 2);
  s.brain = createBrain(s.save.rivalLevel, s.save.bonusReads);
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
  p.aimX = input.mouse.x; p.aimY = input.mouse.y;
  if (input.dashPressed && startDash(p, mv.x, mv.y)) logAction(s, `dash:${dir8(mv.x, mv.y)}`);
  if (input.mouseDown && p.fireCd <= 0) {
    fire(s, p, p.aimX, p.aimY, 'player');
    p.fireCd = C.fireCooldown;
    logAction(s, 'shoot');
  }
  moveFighter(p, mv.x, mv.y, dt);
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
  if (it.read) s.readLabel = { text: it.read.label, t: 0, kind: it.read.kind };
  if (it.dash) startDash(r, it.dash.x, it.dash.y);
  if (it.readShot) { fire(s, r, it.readShot.x, it.readShot.y, 'rival'); s.lastRivalShot = s.time; }
  if (it.fire && (r.fireCd <= 0 || it.readShot)) {
    fire(s, r, it.aimX, it.aimY, 'rival');
    r.fireCd = C.fireCooldown * (s.round === 1 ? C.round1FireMult : 1);
    s.lastRivalShot = s.time;
  }
  r.aimX = it.aimX; r.aimY = it.aimY;
  moveFighter(r, it.moveX, it.moveY, dt);
}

function updateBullets(s, dt) {
  const keep = [];
  for (const b of s.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < 0 || b.y < 0 || b.x > C.arenaW || b.y > C.arenaH) continue;
    const target = b.owner === 'player' ? s.rival : s.player;
    if (target.dashT <= 0 && Math.hypot(b.x - target.x, b.y - target.y) < C.radius + C.bulletRadius) {
      target.hp -= 1; target.hitFlash = 0.12;
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
  if (s.phase === 'title') { if (click) startRound(s); }
  else if (s.phase === 'round') {
    s.time += dt;
    if (s.readLabel) s.readLabel.t += dt;
    updatePlayer(s, input, dt);
    updateRival(s, dt);
    updateBullets(s, dt);
    if (s.player.hp <= 0 || s.rival.hp <= 0 || s.time >= C.roundTime) endRound(s);
  } else if (s.phase === 'roundEnd') { if (s.phaseT > 1.2) { s.phase = 'report'; s.phaseT = 0; } }
  else if (s.phase === 'report') {
    if (click || s.phaseT > 5) {
      if (matchOver(s)) {
        if (s.score.player > s.score.rival) s.save.rivalLevel += 1;
        writeSave(safeStorage(), s.save);
        s.phase = 'matchEnd'; s.phaseT = 0;
      } else startRound(s);
    }
  } else if (s.phase === 'matchEnd') {
    if (click && s.phaseT > 0.5) { s.round = 0; s.score = { player: 0, rival: 0 }; startRound(s); }
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

function render(ctx, s) {
  ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, C.arenaW, C.arenaH);
  ctx.strokeStyle = COLORS.wall; ctx.lineWidth = 2; ctx.strokeRect(1, 1, C.arenaW - 2, C.arenaH - 2);
  if (s.phase === 'title') {
    text(ctx, 'HABIT', C.arenaW / 2, 190, 72, COLORS.text, 'center', 800);
    text(ctx, 'A rival that learns how you fight.', C.arenaW / 2, 250, 20, COLORS.quiet, 'center', 400);
    text(ctx, 'Click to start', C.arenaW / 2, 330, 22, COLORS.read);
    text(ctx, 'WASD move · mouse aim · click shoot · Space dash', C.arenaW / 2, 470, 15, COLORS.quiet, 'center', 400);
    return;
  }
  for (const b of s.bullets) {
    ctx.fillStyle = b.owner === 'player' ? COLORS.player : COLORS.rival;
    ctx.beginPath(); ctx.arc(b.x, b.y, C.bulletRadius, 0, Math.PI * 2); ctx.fill();
  }
  drawFighter(ctx, s.player, COLORS.player);
  drawFighter(ctx, s.rival, COLORS.rival);
  drawRead(ctx, s);
  drawHud(ctx, s);
  if (s.phase === 'roundEnd') {
    const msg = s.roundWinner === 'player' ? 'ROUND WON' : s.roundWinner === 'rival' ? 'ROUND LOST' : 'DRAW';
    text(ctx, msg, C.arenaW / 2, C.arenaH / 2, 48, COLORS.text, 'center', 800);
  }
  if (s.phase === 'report' || s.phase === 'matchEnd') {
    ctx.fillStyle = 'rgba(13,15,20,0.88)'; ctx.fillRect(0, 0, C.arenaW, C.arenaH);
    text(ctx, s.phase === 'report' ? 'HABIT REPORT' : 'MATCH OVER', C.arenaW / 2, 200, 36, COLORS.text, 'center', 800);
    text(ctx, 'Click to continue', C.arenaW / 2, 420, 18, COLORS.read);
  }
}

// ---------- boot ----------
export function start(canvas) {
  const ctx = canvas.getContext('2d');
  const s = newState();
  const input = createInput();
  let scale = 1;

  function fit() {
    scale = Math.min(window.innerWidth / C.arenaW, window.innerHeight / C.arenaH);
    canvas.width = C.arenaW; canvas.height = C.arenaH;
    canvas.style.width = `${C.arenaW * scale}px`;
    canvas.style.height = `${C.arenaH * scale}px`;
    canvas.style.marginTop = `${(window.innerHeight - C.arenaH * scale) / 2}px`;
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
  window.addEventListener('blur', () => input.keys.clear());
  canvas.addEventListener('mousemove', e => { input.mouse = toArena(e.clientX, e.clientY); });
  canvas.addEventListener('mousedown', e => { input.mouse = toArena(e.clientX, e.clientY); input.mouseDown = true; input.clicked = true; });
  window.addEventListener('mouseup', () => { input.mouseDown = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.__habit = { state: s, toArena };
  let last = performance.now();
  function frame(now) {
    const dt = clampDt((now - last) / 1000);
    last = now;
    step(s, input, dt);
    render(ctx, s);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
