// Rival brain. Plays a simple baseline, and on a budget commits "reads":
// it predicts the player's habit, telegraphs it ("READ: DASH LEFT"), then
// 0.3 s later fires a read shot at where the habit says the player will be.
import { CONFIG } from './config.js';
import { predict, isConfident } from './habit.js';

const DIRS = {
  N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0],
  NE: [0.707, -0.707], NW: [-0.707, -0.707], SE: [0.707, 0.707], SW: [-0.707, 0.707],
};
const WORDS = { N: 'UP', S: 'DOWN', E: 'RIGHT', W: 'LEFT', NE: 'UP-RIGHT', NW: 'UP-LEFT', SE: 'DOWN-RIGHT', SW: 'DOWN-LEFT' };

export function readInterval(round) {
  if (round <= 1) return Infinity;
  return 5 - (Math.min(round, 5) - 2) * (2 / 3);
}

export function createBrain(level, bonusReads) {
  return { level, bonusReads, t: 0, history: [], sinceRead: 0, pending: null, strafe: 1, nextFlip: 1.8 };
}

// Player state as the rival "sees" it: 250 ms old, like a human reaction.
function sensed(brain, foe) {
  brain.history.push({ t: brain.t, foe: { ...foe } });
  while (brain.history.length > 1 && brain.t - brain.history[1].t >= CONFIG.reactionTime) brain.history.shift();
  return brain.history[0].foe;
}

function tryRead(brain, view, model, foe) {
  const dodge = predict(model, { ...view.foeCtx, shotAt: true }, 'dash');
  if (isConfident(dodge)) {
    const dir = dodge.action.split(':')[1];
    const d = CONFIG.dashSpeed * CONFIG.dashTime;
    const [dx, dy] = DIRS[dir];
    return { label: `READ: DASH ${WORDS[dir]}`, kind: 'dodge', fireAt: { x: foe.x + dx * d, y: foe.y + dy * d } };
  }
  const move = predict(model, view.foeCtx, 'move');
  if (isConfident(move) && move.action.startsWith('move:')) {
    const dir = move.action.split(':')[1];
    const [dx, dy] = DIRS[dir];
    const travel = Math.hypot(foe.x - view.me.x, foe.y - view.me.y) / CONFIG.bulletSpeed;
    const lead = CONFIG.playerSpeed * (travel + CONFIG.readTelegraph);
    return { label: `READ: MOVES ${WORDS[dir]}`, kind: 'space', fireAt: { x: foe.x + dx * lead, y: foe.y + dy * lead } };
  }
  return null;
}

function incomingBullet(view) {
  const { me } = view;
  for (const b of view.bullets ?? []) {
    if (b.owner !== 'player') continue;
    const rx = me.x - b.x, ry = me.y - b.y;
    const v2 = b.vx * b.vx + b.vy * b.vy;
    const tHit = (rx * b.vx + ry * b.vy) / v2;
    if (tHit < 0 || tHit > 0.25) continue;
    const miss = Math.hypot(b.x + b.vx * tHit - me.x, b.y + b.vy * tHit - me.y);
    if (miss < CONFIG.radius * 2.5) return b;
  }
  return null;
}

export function think(brain, view, model, dt) {
  brain.t += dt;
  brain.sinceRead += dt;
  const { me } = view;
  const foe = sensed(brain, view.foe);
  const intent = { moveX: 0, moveY: 0, aimX: foe.x, aimY: foe.y, fire: false, dash: null, read: null, readShot: null };

  // Movement: hold about 260 px and strafe, flipping direction every ~2 s.
  const dx = foe.x - me.x, dy = foe.y - me.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist, ny = dy / dist;
  if (brain.t >= brain.nextFlip) { brain.strafe *= -1; brain.nextFlip = brain.t + 1.5 + ((brain.t * 7.3) % 1); }
  const push = dist > 300 ? 1 : dist < 220 ? -1 : 0;
  intent.moveX = nx * push - ny * brain.strafe;
  intent.moveY = ny * push + nx * brain.strafe;
  const len = Math.hypot(intent.moveX, intent.moveY) || 1;
  intent.moveX /= len; intent.moveY /= len;

  // Pending read: fire the read shot after the telegraph.
  if (brain.pending) {
    brain.pending.left -= dt;
    if (brain.pending.left <= 1e-9) {
      intent.readShot = brain.pending.fireAt;
      intent.fire = true; // plus a normal shot at the player: dodge the habit, not just the bullet
      brain.pending = null;
    }
    return intent;
  }

  const interval = Math.max(2, readInterval(view.round) - 0.5 * brain.bonusReads);
  if (brain.sinceRead >= interval && me.fireReady) {
    const read = tryRead(brain, view, model, foe);
    if (read) {
      brain.sinceRead = 0;
      brain.pending = { left: CONFIG.readTelegraph, fireAt: read.fireAt };
      intent.read = read;
      return intent;
    }
  }

  // Baseline: dodge an incoming bullet, else shoot with some lead.
  const threat = me.dashReady && incomingBullet(view);
  if (threat) {
    const s = Math.hypot(threat.vx, threat.vy);
    intent.dash = { x: -threat.vy / s * brain.strafe, y: threat.vx / s * brain.strafe };
  }
  if (me.fireReady) {
    const lead = Math.min(1, 0.4 + 0.15 * brain.level);
    const travel = dist / CONFIG.bulletSpeed;
    intent.aimX = foe.x + foe.vx * travel * lead;
    intent.aimY = foe.y + foe.vy * travel * lead;
    intent.fire = true;
  }
  return intent;
}
