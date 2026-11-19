// Arena geometry: three square pillars that block movement, bullets and line of sight.
const S = 56;
export const PILLARS = Object.freeze([
  { x: 330 - S / 2, y: 150 - S / 2, w: S, h: S },
  { x: 480 - S / 2, y: 270 - S / 2, w: S, h: S },
  { x: 630 - S / 2, y: 390 - S / 2, w: S, h: S },
]);

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
