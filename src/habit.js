// Habit model: counts what the player does in each situation.
// Situation (Ctx) = { dist, shotAt, lowHp, cover, last }. Action = 'move:W', 'dash:NE', 'shoot', 'still'.
// Each event is counted three times: under the full situation, under a coarse one
// without `last`, and under ALL (every situation together). Predictions use the most
// specific one that has enough samples, so a new player gets read within seconds.
import { CONFIG } from './config.js';

const DIR_WORDS = {
  N: 'up', S: 'down', E: 'right', W: 'left',
  NE: 'up-right', NW: 'up-left', SE: 'down-right', SW: 'down-left',
};

export function createModel() {
  return { counts: {} };
}

export function ctxKey(ctx) {
  return `${ctx.dist}|${ctx.shotAt ? 1 : 0}|${ctx.lowHp ? 1 : 0}|${ctx.cover ? 1 : 0}|${ctx.last ?? '-'}`;
}

const ALL = 'all';

function coarseKey(ctx) {
  return ctxKey({ ...ctx, last: '*' });
}

export function kindOf(action) {
  if (action === 'shoot') return 'shoot';
  if (action.startsWith('dash:')) return 'dash';
  return 'move'; // 'move:<dir>' and 'still'
}

function bump(model, key, action) {
  const bucket = (model.counts[key] ??= {});
  bucket[action] = (bucket[action] ?? 0) + 1;
}

export function record(model, ctx, action) {
  bump(model, ctxKey(ctx), action);
  if (ctx.last !== '*') bump(model, coarseKey(ctx), action);
  bump(model, ALL, action);
}

function bestIn(bucket, kind) {
  if (!bucket) return null;
  let best = null, top = 0, n = 0;
  for (const [action, c] of Object.entries(bucket)) {
    if (kind && kindOf(action) !== kind) continue;
    n += c;
    if (c > top) { top = c; best = action; }
  }
  return best ? { action: best, p: top / n, n } : null;
}

export function predict(model, ctx, kind) {
  const full = bestIn(model.counts[ctxKey(ctx)], kind);
  if (full && full.n >= CONFIG.readMinSamples) return full;
  const coarse = bestIn(model.counts[coarseKey(ctx)], kind);
  if (coarse && coarse.n >= CONFIG.readMinSamples) return coarse;
  return bestIn(model.counts[ALL], kind) ?? coarse ?? full;
}

// Momentum: how often the player keeps moving the same direction from one sample to the next.
const MOMENTUM = 'momentum';

export function recordMomentum(model, kept) {
  bump(model, MOMENTUM, kept ? 'keep' : 'turn');
}

export function predictMomentum(model) {
  const b = model.counts[MOMENTUM];
  const keep = b?.keep ?? 0, n = keep + (b?.turn ?? 0);
  return n ? { p: keep / n, n } : null;
}

export function isConfident(pred, threshold = CONFIG.readThreshold) {
  return !!pred && pred.p > threshold && pred.n >= CONFIG.readMinSamples;
}

export function decay(model, factor = CONFIG.decayPerRound) {
  for (const bucket of Object.values(model.counts)) {
    for (const a of Object.keys(bucket)) bucket[a] *= factor;
  }
}

function describe(key, action) {
  const [dist, shotAt, , cover] = key.split('|');
  if (action === 'still') return 'Stands still';
  if (action === 'shoot') return `Shoots at ${dist} range`;
  const [kind, dir] = action.split(':');
  const word = DIR_WORDS[dir];
  if (kind === 'dash') return shotAt === '1' ? `Dodges ${word} when shot at` : `Dashes ${word} at ${dist} range`;
  if (cover === '1') return `Moves ${word} from cover`;
  return `Moves ${word} at ${dist} range`;
}

// One group per (coarse situation, action kind).
function groups(model) {
  const out = [];
  for (const [key, bucket] of Object.entries(model.counts)) {
    if (!key.endsWith('|*')) continue;
    for (const kind of ['move', 'dash', 'shoot']) {
      const b = bestIn(bucket, kind);
      if (b && kind !== 'shoot') out.push({ key, ...b });
      if (b && kind === 'shoot') out.push({ key, ...b, p: 1 });
    }
  }
  return out;
}

export function topHabits(model, k = 3) {
  const entries = groups(model)
    .filter(g => g.action !== 'shoot' || g.n >= CONFIG.readMinSamples)
    .map(g => ({ ...g, text: describe(g.key, g.action) }));
  const mom = predictMomentum(model);
  if (mom && mom.n >= CONFIG.readMinSamples && mom.p > 0.5) entries.push({ ...mom, text: 'Keeps moving the same way' });
  const ranked = entries.sort((a, b) => b.p * Math.min(b.n, 20) - a.p * Math.min(a.n, 20));
  const seen = new Set();
  const out = [];
  for (const g of ranked) {
    const text = g.text;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push({ text, p: Math.round(g.p * 100) });
    if (out.length === k) break;
  }
  return out;
}

export function predictability(model) {
  let weighted = 0, total = 0;
  for (const g of groups(model)) {
    if (g.action === 'shoot') continue; // shooting alone says nothing about direction
    weighted += g.p * g.n;
    total += g.n;
  }
  return total ? Math.round((weighted / total) * 100) : 0;
}

export function serialize(model) {
  return JSON.stringify(model);
}

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Saved data is untrusted: keep only object buckets holding positive finite counts.
export function deserialize(str) {
  const model = createModel();
  try {
    const m = JSON.parse(str);
    if (!isPlainObject(m?.counts)) return model;
    for (const [key, bucket] of Object.entries(m.counts)) {
      if (!isPlainObject(bucket)) continue;
      const clean = {};
      for (const [a, c] of Object.entries(bucket)) if (Number.isFinite(c) && c > 0) clean[a] = c;
      if (Object.keys(clean).length) model.counts[key] = clean;
    }
  } catch { /* junk: fresh model */ }
  return model;
}
