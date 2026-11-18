// Rival brain. Plays a simple baseline, and on a budget commits "reads":
// it predicts the player's habit, telegraphs it ("READ: DASH LEFT"), then
// 0.3 s later fires a read shot at where the habit says the player will be.
import { CONFIG } from './config.js';
import { predict, isConfident, predictMomentum } from './habit.js';
import { dir8 } from './util.js';

const DIRS = {
  N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0],
  NE: [0.707, -0.707], NW: [-0.707, -0.707], SE: [0.707, 0.707], SW: [-0.707, 0.707],
};
const WORDS = { N: 'UP', S: 'DOWN', E: 'RIGHT', W: 'LEFT', NE: 'UP-RIGHT', NW: 'UP-LEFT', SE: 'DOWN-RIGHT', SW: 'DOWN-LEFT' };

// Seconds between reads at each level: none at 1, 3 s at 2 down to 2.2 s at 5, then faster to a 1.2 s floor.
export function readInterval(level) {
  if (level <= 1) return Infinity;
  if (level <= 5) return 3 - (level - 2) * (0.8 / 3);
  return Math.max(1.2, 2.2 - 0.15 * (level - 5));
}

const DEFAULT_TUNING = {
  lead: 1, aimJitter: 0, dodgeChance: 1,
  readDash: CONFIG.readThreshold, readMove: CONFIG.readThresholdMove, readMomentum: CONFIG.readThresholdMomentum,
};

export function createBrain(level, bonusReads, tuning = DEFAULT_TUNING) {
    return { level, bonusReads, tuning, rolled: new WeakSet(), t: 0, history: [], sinceRead: 0, firstRead: true, pending: null, strafe: 1, nextFlip: 1.8 };
}

// Player state as the rival "sees" it: 250 ms old, like a human reaction.
function sensed(brain, foe) {
  brain.history.push({ t: brain.t, foe: { ...foe } });
  while (brain.history.length > 1 && brain.t - brain.history[1].t >= CONFIG.reactionTime) brain.history.shift();
  return brain.history[0].foe;
}

function tryRead(brain, view, model, foe) {
  const dodge = predict(model, { ...view.foeCtx, shotAt: true }, 'dash');
  if (isConfident(dodge, brain.tuning.readDash ?? CONFIG.readThreshold)) {
    const dir = dodge.action.split(':')[1];
    const d = CONFIG.dashSpeed * CONFIG.dashTime;
    const [dx, dy] = DIRS[dir];
    return { label: `READ: DASH ${WORDS[dir]}`, kind: 'dodge', fireAt: { x: foe.x + dx * d, y: foe.y + dy * d } };
  }
  const move = predict(model, view.foeCtx, 'move');
  if (isConfident(move, brain.tuning.readMove ?? CONFIG.readThresholdMove) && move.action.startsWith('move:')) {
    const dir = move.action.split(':')[1];
    const [dx, dy] = DIRS[dir];
    const travel = Math.hypot(foe.x - view.me.x, foe.y - view.me.y) / CONFIG.bulletSpeed;
    const lead = CONFIG.playerSpeed * (travel + CONFIG.readTelegraph);
    return { label: `READ: MOVES ${WORDS[dir]}`, kind: 'space', fireAt: { x: foe.x + dx * lead, y: foe.y + dy * lead } };
  }
  // Momentum: most players keep moving the same way for a moment. Shoot where they will be if they don't turn.
  const mom = predictMomentum(model);
  const speed = Math.hypot(foe.vx, foe.vy);
  if (speed > 40 && isConfident(mom, brain.tuning.readMomentum ?? CONFIG.readThresholdMomentum)) {
    const dir = dir8(foe.vx, foe.vy);
    const lead = Math.hypot(foe.x - view.me.x, foe.y - view.me.y) / (view.rivalBulletSpeed ?? CONFIG.bulletSpeed) + CONFIG.readTelegraph;
    return { label: `READ: KEEPS MOVING ${WORDS[dir]}`, kind: 'space', fireAt: { x: foe.x + foe.vx * lead, y: foe.y + foe.vy * lead } };
  }
  return null;
}

// No confident read? Guess, and say so. A skilled player sees GUESS instead of READ.
function guess(view, foe) {
  const speed = Math.hypot(foe.vx, foe.vy);
  if (speed > 40) {
    const dir = dir8(foe.vx, foe.vy);
    const lead = Math.hypot(foe.x - view.me.x, foe.y - view.me.y) / (view.rivalBulletSpeed ?? CONFIG.bulletSpeed) + CONFIG.readTelegraph;
    return { label: `GUESS: KEEPS MOVING ${WORDS[dir]}`, kind: 'guess', fireAt: { x: foe.x + foe.vx * lead, y: foe.y + foe.vy * lead } };
  }
  return { label: 'GUESS: STAYS PUT', kind: 'guess', fireAt: { x: foe.x, y: foe.y } };
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
  // Stuck on a pillar (barely moved in 0.4 s)? Strafe the other way to get around it.
  brain.track ??= { x: me.x, y: me.y, t: brain.t };
  if (brain.t - brain.track.t > 0.4) {
    if (Math.hypot(me.x - brain.track.x, me.y - brain.track.y) < 20) { brain.strafe *= -1; brain.nextFlip = brain.t + 1.2; }
    brain.track = { x: me.x, y: me.y, t: brain.t };
  }
  // Close in when out of range or when a pillar blocks the shot.
  const push = dist > 300 || (view.blocked && dist > 180) ? 1 : dist < 220 ? -1 : 0;
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

  const full = Math.max(1.2, readInterval(view.round) - 0.3 * brain.bonusReads);
  const interval = brain.firstRead && full !== Infinity ? Math.min(full, CONFIG.firstReadAfter) : full;
  if (brain.sinceRead >= interval && !view.blocked) {
    let read = tryRead(brain, view, model, foe);
    if (!read) {
      brain.failedReads = (brain.failedReads ?? 0) + 1;
      if (brain.failedReads >= 1) read = guess(view, foe);
    }
    if (read) {
      brain.failedReads = 0;
      brain.sinceRead = 0;
      brain.firstRead = false;
      brain.pending = { left: CONFIG.readTelegraph, fireAt: read.fireAt };
      intent.read = read;
      return intent;
    }
  }

  // Baseline: dodge an incoming bullet, else shoot with some lead.
  // One dodge roll per incoming bullet, so dodgeChance is the share of bullets it tries to dodge.
  let threat = me.dashReady && incomingBullet(view);
  if (threat && !brain.rolled.has(threat)) {
    brain.rolled.add(threat);
    threat.dodge = Math.random() < brain.tuning.dodgeChance;
  }
  if (threat && !threat.dodge) threat = null;
  if (threat) {
    const s = Math.hypot(threat.vx, threat.vy);
    intent.dash = { x: -threat.vy / s * brain.strafe, y: threat.vx / s * brain.strafe };
  }
  if (me.fireReady && !view.blocked) {
    // Higher rival levels aim slightly better on top of the round's tuning.
    const lead = Math.min(1, brain.tuning.lead + 0.05 * (brain.level - 1));
    const travel = dist / (view.rivalBulletSpeed ?? CONFIG.bulletSpeed);
    const j = brain.tuning.aimJitter;
    intent.aimX = foe.x + foe.vx * travel * lead + (Math.random() - 0.5) * 2 * j;
    intent.aimY = foe.y + foe.vy * travel * lead + (Math.random() - 0.5) * 2 * j;
    intent.fire = true;
  }
  return intent;
}
