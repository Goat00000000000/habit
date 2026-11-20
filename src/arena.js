// Arena geometry: pillars that block movement, bullets and line of sight.
// Each level uses one of six layouts, so the arena (and the habits it creates) changes every level.
// A layout is a list of [centre x, centre y, width, height]; spawns at (240, 270) and (720, 270) stay clear.
const RAW = [
  [[330, 150, 56, 56], [480, 270, 56, 56], [630, 390, 56, 56]],          // diagonal
  [[480, 130, 48, 96], [480, 410, 48, 96]],                              // gate: open middle lane
  [[360, 170, 48, 48], [600, 170, 48, 48], [360, 370, 48, 48], [600, 370, 48, 48]], // square
  [[480, 270, 200, 36], [480, 110, 40, 40], [480, 430, 40, 40]],         // wall
  [[380, 120, 44, 44], [560, 200, 44, 44], [400, 360, 44, 44], [580, 430, 44, 44]], // scatter
  [[360, 270, 40, 140], [600, 270, 40, 140]],                            // columns
];
export const LAYOUTS = RAW.map(l => l.map(([cx, cy, w, h]) => Object.freeze({ x: cx - w / 2, y: cy - h / 2, w, h })));

// The pillars in play right now. One live array, swapped in place at the start of each level.
export const PILLARS = [...LAYOUTS[0]];

export function setLayoutFor(level) {
  PILLARS.length = 0;
  PILLARS.push(...LAYOUTS.at((Math.max(1, level) - 1) % LAYOUTS.length));
}

// The first-run lesson is played on open floor.
export function clearPillars() {
  PILLARS.length = 0;
}

export function inPillar(x, y, pad = 0) {
  return PILLARS.some(p => x > p.x - pad && x < p.x + p.w + pad && y > p.y - pad && y < p.y + p.h + pad);
}

// Push a circle (fighter) out of any pillar it overlaps, along the shortest way out.
export function pushOut(x, y, r) {
  for (const p of PILLARS) {
    const nx = Math.max(p.x, Math.min(x, p.x + p.w));
    const ny = Math.max(p.y, Math.min(y, p.y + p.h));
    const dx = x - nx, dy = y - ny, d = Math.hypot(dx, dy);
    if (d >= r) continue;
    if (d > 0) { x = nx + dx / d * r; y = ny + dy / d * r; continue; }
    // centre inside the pillar: leave through the nearest side
    const left = x - p.x, right = p.x + p.w - x, upEdge = y - p.y, down = p.y + p.h - y;
    const m = Math.min(left, right, upEdge, down);
    if (m === left) x = p.x - r; else if (m === right) x = p.x + p.w + r;
    else if (m === upEdge) y = p.y - r; else y = p.y + p.h + r;
  }
  return { x, y };
}

// Does the segment from (x1,y1) to (x2,y2) pass through a pillar? (slab test)
export function segmentBlocked(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return PILLARS.some(p => {
    let t0 = 0, t1 = 1;
    for (const [d, lo, hi, o] of [[dx, p.x, p.x + p.w, x1], [dy, p.y, p.y + p.h, y1]]) {
      if (Math.abs(d) < 1e-9) { if (o <= lo || o >= hi) return false; continue; }
      let a = (lo - o) / d, b = (hi - o) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 >= t1) return false;
    }
    return true;
  });
}

export function pillarAt(x, y) {
  return PILLARS.find(p => x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h) ?? null;
}

export function nearCover(x, y, range = 70) {
  return inPillar(x, y, range);
}
