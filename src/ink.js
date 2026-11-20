// Ink duel look: rice paper, black ink for the player, seal red for the rival and its reads.
// Everything here only draws; game logic lives in game.js.
import { CONFIG as C } from './config.js';
import { PILLARS } from './arena.js';
import { cameraOffset, drawFeel } from './feel.js';

// One line summing up the run for the run-over screen. Never prints "0 of 0".
export function runSummary({ readsBeaten, reads, guessesBeaten, guesses }) {
  const n = (count, word) => (count === 1 ? word : word.endsWith('s') ? word + 'es' : word + 's');
  const readPart = `beat ${readsBeaten} of ${reads} ${n(reads, 'read')}`;
  const guessPart = `dodged ${guessesBeaten} of ${guesses} ${n(guesses, 'guess')}`;
  if (reads > 0 && guesses > 0) return `This run you ${readPart} and ${guessPart}.`;
  if (reads > 0) return `This run you ${readPart}.`;
  if (guesses > 0) return `It never read you this run. You ${guessPart}.`;
  return 'It never read you this run.';
}

export const INK = {
  paper: '#e4e1d8',
  paperShade: '#d3cfc3',
  ink: '#16130f',
  inkSoft: 'rgba(22, 19, 15, 0.55)',
  wash: '#a9a397',
  red: '#b3141c',
  redSoft: 'rgba(179, 20, 28, 0.18)',
};

const BRUSH = '"Yuji Syuku", "Shippori Mincho", serif';
const SERIF = '"Shippori Mincho", Georgia, serif';

// Small seeded random so paper grain and ink edges look the same every frame.
function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

// ---------- paper ----------
let paperCanvas = null;
function paper() {
  if (paperCanvas || typeof document === 'undefined') return paperCanvas;
  const c = document.createElement('canvas');
  c.width = C.arenaW; c.height = C.arenaH;
  const g = c.getContext('2d');
  g.fillStyle = INK.paper;
  g.fillRect(0, 0, c.width, c.height);
  const rand = seeded(7);
  // grain
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgba(22,19,15,${0.015 + rand() * 0.04})`;
    g.fillRect(rand() * c.width, rand() * c.height, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }
  // fibres
  g.lineWidth = 0.6;
  for (let i = 0; i < 90; i++) {
    const x = rand() * c.width, y = rand() * c.height, a = rand() * Math.PI, l = 8 + rand() * 26;
    g.strokeStyle = `rgba(22,19,15,${0.04 + rand() * 0.05})`;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + rand() * 4, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // soft vignette toward the edges, like paper that has been handled
  const v = g.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.3, c.width / 2, c.height / 2, c.width * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(60,50,35,0.16)');
  g.fillStyle = v; g.fillRect(0, 0, c.width, c.height);
  // rough brush border
  roughRect(g, 14, 14, c.width - 28, c.height - 28, INK.ink, 2.4, seeded(11));
  roughRect(g, 17, 16, c.width - 33, c.height - 31, 'rgba(22,19,15,0.25)', 1.2, seeded(12));
  paperCanvas = c;
  return c;
}

function roughRect(g, x, y, w, h, color, width, rand) {
  g.strokeStyle = color; g.lineWidth = width; g.lineJoin = 'round';
  const pts = [];
  const side = (x0, y0, x1, y1) => {
    const n = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / 40));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push([x0 + (x1 - x0) * t + (rand() - 0.5) * 2.2, y0 + (y1 - y0) * t + (rand() - 0.5) * 2.2]);
    }
  };
  side(x, y, x + w, y); side(x + w, y, x + w, y + h); side(x + w, y + h, x, y + h); side(x, y + h, x, y);
  g.beginPath();
  pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
  g.closePath(); g.stroke();
}

// ---------- type ----------
function write(ctx, str, x, y, size, { color = INK.ink, align = 'left', font = SERIF, weight = 400, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
  ctx.restore();
}

// A hanko seal: red square, character in paper colour, slightly rotated as if stamped by hand.
function seal(ctx, x, y, size, char, { color = INK.red, rot = -0.07, outline = false } = {}) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  const r = seeded(char.charCodeAt(0));
  ctx.beginPath();
  const h = size / 2;
  ctx.moveTo(-h + r() * 2, -h + r() * 2);
  ctx.lineTo(h - r() * 2, -h + r() * 2);
  ctx.lineTo(h - r() * 2, h - r() * 2);
  ctx.lineTo(-h + r() * 2, h - r() * 2);
  ctx.closePath();
  if (outline) { ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke(); }
  else { ctx.fillStyle = color; ctx.fill(); }
  write(ctx, char, 0, size * 0.04, size * 0.66, { color: outline ? color : INK.paper, align: 'center', font: BRUSH });
  ctx.restore();
}

// Brush stroke from (x0,y0) to (x1,y1): thick in the middle, tapered at both ends.
function brushLine(ctx, x0, y0, x1, y1, width, color) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l, ny = dx / l;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + x1) / 2 + nx * width, (y0 + y1) / 2 + ny * width, x1, y1);
  ctx.quadraticCurveTo((x0 + x1) / 2 - nx * width * 0.7, (y0 + y1) / 2 - ny * width * 0.7, x0, y0);
  ctx.fill();
}

// ---------- fighters, bullets, pillars ----------
function blob(ctx, x, y, r, seed, wobble) {
  const rand = seeded(seed);
  const n = 22;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.92 + rand() * 0.16) + Math.sin(a * 3 + wobble) * 0.6;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function drawPlayer(ctx, f, t) {
  ctx.save();
  ctx.globalAlpha = f.dashT > 0 ? 0.55 : 1;
  blob(ctx, f.x, f.y, C.radius, 3, t * 2);
  ctx.fillStyle = f.hitFlash > 0 ? INK.paper : INK.ink;
  ctx.fill();
  if (f.hitFlash > 0) { ctx.strokeStyle = INK.ink; ctx.lineWidth = 2; ctx.stroke(); }
  const a = Math.atan2(f.aimY - f.y, f.aimX - f.x);
  brushLine(ctx, f.x + Math.cos(a) * (C.radius + 2), f.y + Math.sin(a) * (C.radius + 2), f.x + Math.cos(a) * (C.radius + 16), f.y + Math.sin(a) * (C.radius + 16), 3, INK.ink);
  ctx.restore();
}

function drawRival(ctx, f, t) {
  ctx.save();
  ctx.globalAlpha = f.dashT > 0 ? 0.55 : 1;
  blob(ctx, f.x, f.y, C.radius, 5, t * 2);
  ctx.fillStyle = f.hitFlash > 0 ? INK.ink : INK.paper;
  ctx.fill();
  ctx.strokeStyle = INK.red; ctx.lineWidth = 4.5; ctx.stroke();
  ctx.fillStyle = INK.red;
  ctx.beginPath(); ctx.arc(f.x, f.y, 4.5, 0, Math.PI * 2); ctx.fill();
  const a = Math.atan2(f.aimY - f.y, f.aimX - f.x);
  brushLine(ctx, f.x + Math.cos(a) * (C.radius + 3), f.y + Math.sin(a) * (C.radius + 3), f.x + Math.cos(a) * (C.radius + 16), f.y + Math.sin(a) * (C.radius + 16), 3, INK.red);
  ctx.restore();
}

function drawBullet(ctx, b) {
  const v = Math.hypot(b.vx, b.vy) || 1;
  const tx = b.x - (b.vx / v) * 12, ty = b.y - (b.vy / v) * 12;
  const color = b.owner === 'player' ? INK.ink : INK.red;
  brushLine(ctx, tx, ty, b.x, b.y, 2.5, color);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(b.x, b.y, C.bulletRadius, 0, Math.PI * 2); ctx.fill();
}

function drawPillars(ctx) {
  PILLARS.forEach((p, i) => {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = INK.wash;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = INK.ink;
    ctx.fillRect(p.x, p.y + p.h * 0.72, p.w, p.h * 0.28);
    ctx.globalAlpha = 1;
    roughRect(ctx, p.x, p.y, p.w, p.h, INK.ink, 1.6, seeded(30 + i));
    ctx.restore();
  });
}

// ---------- reads ----------
function readParts(label) {
  // "READ: DASH LEFT" -> { guess: false, what: "dash left" }
  const guess = label.startsWith('GUESS');
  const what = label.split(': ')[1]?.toLowerCase() ?? '';
  return { guess, what };
}

function drawReadTarget(ctx, s) {
  const r = s.readLabel;
  if (!r || !r.at || r.t > 0.6) return;
  const guess = r.kind === 'guess';
  ctx.save();
  ctx.globalAlpha = r.t < 0.3 ? 0.9 : Math.max(0, 1 - (r.t - 0.3) / 0.3);
  ctx.strokeStyle = guess ? INK.inkSoft : INK.red; ctx.lineWidth = 2.5; ctx.setLineDash([3, 7]); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(r.at.x, r.at.y, C.radius + 7, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s.player.x, s.player.y); ctx.lineTo(r.at.x, r.at.y); ctx.stroke();
  ctx.restore();
}

function drawRead(ctx, s) {
  const r = s.readLabel;
  if (!r || r.t > 1.2) return;
  const { guess, what } = readParts(r.text);
  const slam = r.t < 0.08 ? 1.6 - (r.t / 0.08) * 0.6 : 1;
  const x = Math.max(70, Math.min(C.arenaW - 200, s.rival.x - 26));
  const y = s.rival.y < 90 ? s.rival.y + 48 : s.rival.y - 48;
  ctx.save();
  ctx.globalAlpha = r.t > 0.9 ? Math.max(0, 1 - (r.t - 0.9) / 0.3) : 1;
  ctx.translate(x, y); ctx.scale(slam, slam);
  if (guess) seal(ctx, 0, 0, 34, '?', { color: INK.inkSoft, outline: true, rot: 0.05 });
  else seal(ctx, 0, 0, 34, '読');
  write(ctx, guess ? `${what}?` : what, 26, 1, 22, { color: guess ? INK.inkSoft : INK.red, font: BRUSH });
  ctx.restore();
}

function drawOutplayed(ctx, s) {
  const o = s.outplayed;
  if (!o) return;
  const read = o.text === 'OUTPLAYED';
  const slam = o.t < 0.08 ? 1.5 - (o.t / 0.08) * 0.5 : 1;
  const x = Math.max(160, Math.min(C.arenaW - 200, s.player.x - 60));
  const y = Math.max(96, s.player.y - 74);
  ctx.save();
  ctx.globalAlpha = o.t > 0.9 ? Math.max(0, 1 - (o.t - 0.9) / 0.3) : 1;
  ctx.translate(x, y); ctx.scale(slam, slam);
  write(ctx, read ? 'Outplayed' : 'Unreadable', 0, 0, read ? 44 : 36, { font: BRUSH });
  if (read) seal(ctx, -30, -2, 30, '破', { rot: 0.12 });
  write(ctx, read ? `${s.stats.readsBeaten} of ${s.stats.reads} reads beaten` : 'it could not read you', 2, 32, 14, { color: INK.inkSoft });
  ctx.restore();
}

// ---------- tricks ----------
const ROMAN = ['', 'I', 'II', 'III'];
const TRICK_INFO = {
  overclock: { seal: '速', name: 'Overclock', lines: n => ['Beat a read and you fire', `twice as fast for ${n + 1} seconds.`] },
  ricochet: { seal: '跳', name: 'Ricochet', lines: n => [`Your shots bounce ${['', 'once', 'twice', 'three times'].at(n)}`, 'off walls and pillars.'] },
};

function trickPickScreen(ctx, s, input) {
  sheet(ctx);
  const one = s.trickOffer.length === 1;
  const up = s.trickUpgrade;
  write(ctx, up ? (one ? 'Upgrade a trick' : 'Upgrade a trick') : one ? 'A new trick' : 'Choose a trick', 84, 96, 42, { font: BRUSH });
  write(ctx, up ? 'You reached a checkpoint. Make one of your tricks stronger.' : one ? 'You reached a checkpoint. It is yours for the rest of the run.' : 'It lasts for the rest of this run.', 86, 134, 16, { color: INK.inkSoft });
  s.trickOffer.forEach((id, i) => {
    const t = TRICK_INFO[id];
    const lvl = up ? (s.trickLevel?.[id] ?? 1) + 1 : 1;
    const x = one ? 84 : 84 + i * 440;
    roughRect(ctx, x, 176, 380, 236, INK.ink, 1.6, seeded(70 + i));
    seal(ctx, x + 56, 236, 54, t.seal, { color: INK.ink, rot: -0.06 + i * 0.1 });
    write(ctx, lvl > 1 ? `${t.name} ${ROMAN.at(lvl)}` : t.name, x + 104, 236, 34, { font: BRUSH });
    const [l1, l2] = t.lines(lvl);
    write(ctx, l1, x + 32, 318, 18);
    write(ctx, l2, x + 32, 346, 18);
    if (!one) write(ctx, input.touch ? (i ? 'tap right' : 'tap left') : `press ${i + 1}`, x + 32, 388, 14, { color: INK.inkSoft });
  });
  cta(ctx, one ? `${input.touch ? 'Tap' : 'Click'} to take it` : `${input.touch ? 'Tap a side' : 'Click a side'} to choose`, 84, 470);
}

function drawTricks(ctx, s) {
  s.tricks.forEach((id, i) => {
    seal(ctx, 52 + i * 44, 112, 22, TRICK_INFO[id].seal, { color: INK.ink, rot: -0.05 });
    const lvl = s.trickLevel?.[id] ?? 1;
    if (lvl > 1) write(ctx, ROMAN.at(lvl), 66 + i * 44, 116, 13, { color: INK.ink });
  });
}

function drawOverclock(ctx, s, t) {
  if (!(s.overclockT > 0)) return;
  const p = s.player;
  ctx.save();
  ctx.globalAlpha = Math.min(1, s.overclockT);
  ctx.strokeStyle = INK.ink; ctx.lineWidth = 2; ctx.setLineDash([10, 6]); ctx.lineDashOffset = -t * 60;
  ctx.beginPath(); ctx.arc(p.x, p.y, C.radius + 9, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// ---------- HUD ----------
function drawHud(ctx, s) {
  write(ctx, `Level ${s.round}`, 40, 46, 26, { font: BRUSH });
  for (let i = 0; i < C.hp; i++) {
    ctx.fillStyle = INK.ink;
    blob(ctx, 46 + i * 20, 76, 6, 40 + i, 0);
    if (i < s.player.hp) ctx.fill(); else { ctx.strokeStyle = INK.inkSoft; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  const max = s.rival.maxHp ?? C.hp;
  for (let i = 0; i < max; i++) {
    blob(ctx, C.arenaW - 46 - i * 20, 46, 6, 60 + i, 0);
    if (i < s.rival.hp) { ctx.fillStyle = INK.red; ctx.fill(); } else { ctx.strokeStyle = INK.red; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  // time left: a brush stroke that shortens from both ends
  const left = Math.max(0, 1 - s.time / C.roundTime);
  const half = 170 * left;
  if (half > 2) brushLine(ctx, C.arenaW / 2 - half, 40, C.arenaW / 2 + half, 40, 4, left < 0.2 ? INK.red : INK.ink);
}

// ---------- lesson ----------
const LESSON = {
  move: { title: 'Move', key: 'Use W A S D to move.', touch: 'Drag your left thumb to move.' },
  shoot: { title: 'Shoot it', key: 'Aim with the mouse and click to shoot.', touch: 'Drag your right thumb to aim, lift to shoot.' },
  dash: { title: 'Dash', key: 'Press Space to dash. Nothing can hit you mid-dash.', touch: 'Tap the dash button. Nothing can hit you mid-dash.' },
  read: { title: 'It reads you', key: 'A red seal means it predicted your move. Do the opposite.', touch: 'A red seal means it predicted your move. Do the opposite.' },
  beaten: { title: 'That is the whole game', key: 'Beat its reads. Now beat it for real.', touch: 'Beat its reads. Now beat it for real.' },
};
const ORDER = ['move', 'shoot', 'dash', 'read', 'beaten'];

// A paper card behind lesson text, so the words never sit on top of a pillar.
function lessonCard(ctx, cx, top, w, h, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = INK.paper;
  ctx.globalAlpha *= 0.94;
  ctx.fillRect(cx - w / 2, top, w, h);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha *= alpha;
  brushLine(ctx, cx - w / 2, top, cx + w / 2, top, 2.5, INK.ink);
  brushLine(ctx, cx - w / 2, top + h, cx + w / 2, top + h, 2.5, INK.ink);
  ctx.restore();
}

function textWidth(ctx, str, size, font = SERIF) {
  ctx.save();
  ctx.font = `400 ${size}px ${font}`;
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

function drawLesson(ctx, s, input) {
  const L = s.tutorial;
  if (!L) return;
  if (L.step === 'fight') {
    if (L.fightT < 2) {
      const a = Math.min(1, 2 - L.fightT);
      lessonCard(ctx, C.arenaW / 2, 88, textWidth(ctx, 'Now beat it.', 40, BRUSH) + 80, 64, a);
      write(ctx, 'Now beat it.', C.arenaW / 2, 120, 40, { align: 'center', font: BRUSH, alpha: a });
    }
    return;
  }
  const info = LESSON[L.step];
  const line = input.touch ? info.touch : info.key;
  const cardW = Math.max(textWidth(ctx, info.title, 40, BRUSH), textWidth(ctx, line, 18)) + 80;
  lessonCard(ctx, C.arenaW / 2, 74, cardW, 116);
  const sb = C.skipButton;
  lessonCard(ctx, sb.x, sb.y - 15, textWidth(ctx, input.touch ? 'skip lesson' : 'skip lesson (Enter)', 15) + 40, 30);
  write(ctx, info.title, C.arenaW / 2, 104, 40, { align: 'center', font: BRUSH });
  write(ctx, line, C.arenaW / 2, 142, 18, { align: 'center', color: L.step === 'read' ? INK.red : INK.ink });
  // progress: one ink dot per step
  ORDER.forEach((step, i) => {
    blob(ctx, C.arenaW / 2 - 40 + i * 20, 172, 4.5, 80 + i, 0);
    if (i <= ORDER.indexOf(L.step)) { ctx.fillStyle = INK.ink; ctx.fill(); } else { ctx.strokeStyle = INK.inkSoft; ctx.lineWidth = 1.2; ctx.stroke(); }
  });
  const b = C.skipButton;
  write(ctx, input.touch ? 'skip lesson' : 'skip lesson (Enter)', b.x, b.y, 15, { align: 'center', color: INK.inkSoft });
}

function drawDashButton(ctx, s, input) {
  if (!input.touch) return;
  const b = C.dashButton;
  const ready = s.player.dashCd <= 0;
  ctx.save();
  ctx.globalAlpha = ready ? 0.85 : 0.35;
  blob(ctx, b.x, b.y, b.r, 120, 0);
  ctx.strokeStyle = INK.ink; ctx.lineWidth = 2.5; ctx.stroke();
  write(ctx, 'dash', b.x, b.y + 1, 20, { align: 'center', font: BRUSH });
  ctx.restore();
}

// Health right under each fighter, where your eyes already are mid-fight.
function hpDots(ctx, f, hp, max, color) {
  const gap = 12, x0 = f.x - ((max - 1) * gap) / 2, y = f.y + C.radius + 13;
  for (let i = 0; i < max; i++) {
    blob(ctx, x0 + i * gap, y, 4.4, 200 + i, 0);
    if (i < hp) { ctx.fillStyle = color; ctx.fill(); } else { ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1; }
  }
}

// On your last hit point the edges of the paper pulse dark red.
function lastHitWarning(ctx, s, t) {
  if (s.phase !== 'round' || s.player.hp !== 1) return;
  const a = 0.18 + 0.1 * Math.sin(t * 6);
  const g = ctx.createRadialGradient(C.arenaW / 2, C.arenaH / 2, C.arenaH * 0.35, C.arenaW / 2, C.arenaH / 2, C.arenaW * 0.62);
  g.addColorStop(0, 'rgba(179,20,28,0)');
  g.addColorStop(1, `rgba(179,20,28,${a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, C.arenaW, C.arenaH);
}

function drawSticks(ctx, input) {
  if (!input.touch || !input.stick) return;
  const st = input.stick;
  ctx.save();
  ctx.strokeStyle = INK.inkSoft; ctx.lineWidth = 2; ctx.setLineDash([2, 6]);
  ctx.beginPath(); ctx.arc(st.ox, st.oy, 50, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = INK.inkSoft;
  blob(ctx, st.x, st.y, 16, 99, 0); ctx.fill();
  ctx.restore();
}

// ---------- screens ----------
function sheet(ctx) {
  // A fresh sheet of paper laid over the arena.
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.drawImage(paper(), 0, 0);
  ctx.restore();
}

function cta(ctx, str, x, y) {
  write(ctx, str, x, y, 20, { font: BRUSH });
  ctx.font = `400 20px ${BRUSH}`;
  const w = ctx.measureText(str).width;
  brushLine(ctx, x, y + 16, x + w, y + 14, 2.5, INK.red);
}

function titleScreen(ctx, s, input) {
  write(ctx, 'Habit', 78, 196, 132, { font: BRUSH });
  seal(ctx, 452, 150, 62, '習', { rot: 0.09 });
  write(ctx, 'A rival that learns how you fight.', 84, 286, 22);
  let y = 336;
  if (s.ui.welcome) { write(ctx, s.ui.welcome, 84, y, 18, { color: INK.red, font: BRUSH }); y += 34; }
  if (s.save.bestLevel) {
    const from = s.save.checkpoint > 1 ? `, and you start from the level ${s.save.checkpoint} checkpoint` : '';
    write(ctx, `Your best is level ${s.save.bestLevel}${from}.`, 84, y, 15, { color: INK.inkSoft }); y += 30;
  }
  cta(ctx, input.touch ? 'Tap to begin' : 'Click to begin', 84, y + 22);
  write(ctx, s.ui.challenge.replace(/^Today: /, "Today's challenge: "), 84, y + 76, 15, { color: INK.inkSoft });
  write(ctx, input.touch
    ? 'Left thumb moves. Right thumb drags to aim and lifts to shoot. Swipe right side to dash.'
    : `WASD to move, mouse to aim, click to shoot, Space to dash. M turns sound ${s.ui.soundOn?.() === false ? 'on' : 'off'}, F for full screen.`, 84, 500, 14, { color: INK.inkSoft });
  if (s.ui.iphoneHint) {
    write(ctx, 'For full screen on iPhone:', C.arenaW - 60, 58, 15, { color: INK.ink, align: 'right' });
    write(ctx, 'tap Share, then Add to Home Screen.', C.arenaW - 60, 82, 15, { color: INK.ink, align: 'right' });
  }
}

function reportScreen(ctx, s, input) {
  const rep = s.ui.report;
  sheet(ctx);
  write(ctx, 'What it learned', 84, 100, 42, { font: BRUSH });
  write(ctx, `after level ${s.round}`, 84, 138, 15, { color: INK.inkSoft });
  const rows = rep.habits.length ? rep.habits : ['Not enough to go on yet'];
  rows.forEach((h, i) => {
    const m = h.match(/^(.*?)\s+(\d+)%$/);
    const label = m ? m[1] : h, p = m ? +m[2] : 0;
    const y = 192 + i * 58;
    write(ctx, label, 84, y, 20);
    if (m) {
      write(ctx, `${p}%`, 540, y, 20, { align: 'right', color: INK.red, font: BRUSH });
      brushLine(ctx, 84, y + 20, 84 + 456 * p / 100, y + 19, 3, INK.red);
    }
  });
  const pred = rep.predictability.match(/(\d+)%/)?.[1] ?? '0';
  write(ctx, `${pred}%`, 640, 230, 76, { font: BRUSH, color: INK.red });
  write(ctx, 'how predictable you were', 644, 286, 15, { color: INK.inkSoft });
  const reads = rep.readsLine.match(/(\d+)\/(\d+)/), guesses = rep.guessLine.match(/(\d+)\/(\d+)/);
  const tries = +reads[2] + +guesses[2];
  write(ctx, tries ? `You beat ${reads[1]} of ${reads[2]} reads and dodged ${guesses[1]} of ${guesses[2]} guesses.` : 'It has not tried to read you yet. It is still watching.', 84, 384, 16, { color: INK.inkSoft });
  if (rep.challengeJustDone) { seal(ctx, 100, 432, 30, '済', { rot: -0.1 }); write(ctx, "Today's challenge done.", 126, 432, 16); }
  const tap = input.touch ? 'Tap' : 'Click';
  const next = s.roundWinner === 'player' ? `${tap} for level ${s.round + 1}` : s.roundWinner === 'draw' ? `${tap} to replay level ${s.round}` : `${tap} to continue`;
  cta(ctx, next, 84, 486);
}

function runOverScreen(ctx, s, input) {
  sheet(ctx);
  write(ctx, 'Run over', 84, 112, 72, { font: BRUSH });
  write(ctx, `You reached level ${s.ui.runLevel}. Your best is level ${s.save.bestLevel}.`, 88, 176, 18);
  write(ctx, (s.ui.matchLine ?? '').replace(/^"/, '\u201C').replace(/"$/, '\u201D'), 88, 250, 24, { color: INK.red, font: BRUSH });
  write(ctx, "I'll study this tonight. Come back tomorrow.", 88, 292, 17, { color: INK.red, font: BRUSH, alpha: 0.8 });
  write(ctx, runSummary(s.stats), 88, 352, 15, { color: INK.inkSoft });
  cta(ctx, `${input.touch ? 'Tap' : 'Click'} to try again from level ${s.save.checkpoint}`, 88, 440);
}

export function render(ctx, s, input) {
  const t = performance.now() / 1000;
  ctx.drawImage(paper(), 0, 0);
  if (s.phase === 'title') { titleScreen(ctx, s, input); return; }
  const cam = cameraOffset(s.feel);
  ctx.save();
  ctx.translate(cam.x, cam.y);
  drawPillars(ctx);
  for (const b of s.bullets) drawBullet(ctx, b);
  drawReadTarget(ctx, s);
  drawOverclock(ctx, s, t);
  drawPlayer(ctx, s.player, t);
  hpDots(ctx, s.player, s.player.hp, C.hp, INK.ink);
  hpDots(ctx, s.rival, s.rival.hp, s.rival.maxHp ?? C.hp, INK.red);
  drawRival(ctx, s.rival, t);
  if (s.rivalSlowT > 0) {
    // slowed: ink drips under the rival
    ctx.save(); ctx.fillStyle = INK.red; ctx.globalAlpha = Math.min(1, s.rivalSlowT);
    for (let i = -1; i <= 1; i++) { blob(ctx, s.rival.x + i * 8, s.rival.y + C.radius + 6 + ((t * 30 + i * 7) % 10), 2.4, 140 + i, 0); ctx.fill(); }
    ctx.restore();
  }
  drawFeel(s.feel, ctx, C.arenaW, C.arenaH);
  ctx.restore();
  lastHitWarning(ctx, s, t);
  drawRead(ctx, s);
  drawOutplayed(ctx, s);
  drawHud(ctx, s);
  drawTricks(ctx, s);
  drawSticks(ctx, input);
  if (s.phase === 'round') { drawLesson(ctx, s, input); drawDashButton(ctx, s, input); }
  if (s.phase === 'roundEnd') {
    const won = s.roundWinner === 'player', lost = s.roundWinner === 'rival';
    write(ctx, won ? `Level ${s.round} cleared` : lost ? 'Defeated' : 'A draw. Again.', C.arenaW / 2, C.arenaH / 2, 64,
      { align: 'center', font: BRUSH, color: lost ? INK.red : INK.ink });
  }
  if (s.phase === 'report') reportScreen(ctx, s, input);
  if (s.phase === 'runOver') runOverScreen(ctx, s, input);
  if (s.phase === 'trickPick') trickPickScreen(ctx, s, input);
}
