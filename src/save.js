// Persistence + D1 hook: the rival remembers you, studies overnight, and sets a daily challenge.
import { CONFIG } from './config.js';
import { createModel, serialize, deserialize, topHabits } from './habit.js';

export const CHALLENGES = [
  { id: 'lowPred', text: 'Clear a level under 50% predictability' },
  { id: 'noLeftDash', text: 'Clear a level without dashing left' },
  { id: 'noFarShot', text: 'Clear a level without shooting from far range' },
];

function challengeFor(today) {
  const day = Math.floor(Date.parse(today + 'T00:00:00Z') / 864e5);
  return CHALLENGES[((day % 3) + 3) % 3];
}

function read(storage) {
  try {
    const raw = JSON.parse(storage.getItem(CONFIG.saveKey));
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

export function loadSave(storage, today) {
  const raw = read(storage);
  const lastDay = typeof raw?.lastDay === 'string' ? raw.lastDay : null;
  const isNewDay = lastDay !== null && lastDay !== today;
  const prevBonus = Number.isFinite(raw?.bonusReads) ? raw.bonusReads : 0;
  return {
    model: raw?.model ? deserialize(JSON.stringify(raw.model)) : createModel(),
    rivalLevel: Number.isFinite(raw?.rivalLevel) ? raw.rivalLevel : 1,
    bestLevel: Number.isFinite(raw?.bestLevel) ? raw.bestLevel : 0,
    checkpoint: Number.isFinite(raw?.checkpoint) && raw.checkpoint >= 1 ? raw.checkpoint : 1,
    tutorialDone: raw?.tutorialDone === true,
    lastDay,
    today,
    isNewDay,
    bonusReads: isNewDay ? Math.min(prevBonus + 1, 3) : prevBonus,
    challenge: challengeFor(today),
    challengeDone: !isNewDay && raw?.challengeDone === true,
  };
}

export function writeSave(storage, save) {
  try {
    storage.setItem(CONFIG.saveKey, JSON.stringify({
      model: JSON.parse(serialize(save.model)),
      rivalLevel: save.rivalLevel,
      bestLevel: save.bestLevel,
      checkpoint: save.checkpoint,
      tutorialDone: save.tutorialDone,
      lastDay: save.today,
      bonusReads: save.bonusReads,
      challengeDone: save.challengeDone,
    }));
  } catch { /* storage blocked: play on without saving */ }
}

export function welcomeLine(save) {
  if (save.lastDay === null) return null;
  const [top] = topHabits(save.model, 1);
  if (!top) return null;
  return `Welcome back. Last time: ${top.text} (${top.p}%). Let's see if you changed.`;
}
