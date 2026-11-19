// Balance tests replace Math.random with a seeded generator so the rival's aim jitter and dodge rolls
// are the same on every run: a result then changes only when the game changes.
export function seedRandom(seed) {
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
