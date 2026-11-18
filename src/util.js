import { CONFIG } from './config.js';

// A frame after a tab switch can be seconds long; never simulate more than 50 ms at once.
export function clampDt(dt) {
  return Math.max(0, Math.min(dt, 0.05));
}

export function distBand(d) {
  if (d < CONFIG.closeRange) return 'close';
  if (d < CONFIG.midRange) return 'mid';
  return 'far';
}

const COMPASS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

// Screen coords: +y is down, so (0,-1) is N.
export function dir8(x, y) {
  if (Math.hypot(x, y) < 0.2) return null;
  const a = Math.atan2(y, x);
  return COMPASS.at(((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8);
}
