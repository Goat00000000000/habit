// Game feel: hit stop, slow motion, screen shake, white flash, particles, dash ghosts.
// updateFeel(f, realDt) returns the dt the simulation should use this frame.

export function createFeel() {
  return { stop: 0, slowT: 0, slowScale: 1, shakeAmp: 0, shakeT: 0, shakeMax: 0.25, offset: { x: 0, y: 0 }, flash: 0, particles: [] };
}

export function hitStop(f, seconds) { f.stop = Math.max(f.stop, seconds); }
export function slowMo(f, seconds, scale) { f.slowT = seconds; f.slowScale = scale; }
export function shake(f, strength) { f.shakeAmp = Math.max(f.shakeAmp * (f.shakeT / f.shakeMax), strength); f.shakeT = f.shakeMax; }
export function flash(f, seconds) { f.flash = Math.max(f.flash, seconds); }

// Ink splatter: droplets fly out and stop fast, plus a few stains that soak in and fade slowly.
export function burst(f, x, y, color, count, speed = 220) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const v = speed * (0.4 + Math.random() * 0.6);
    const life = 0.5 + Math.random() * 0.5;
    f.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: 1.5 + Math.random() * 3, color });
  }
  for (let i = 0; i < Math.ceil(count / 4); i++) {
    f.particles.push({ x: x + (Math.random() - 0.5) * 18, y: y + (Math.random() - 0.5) * 18, vx: 0, vy: 0, life: 2.5, max: 2.5, size: 4 + Math.random() * 6, color, stain: true });
  }
}

export function ghost(f, x, y, color, radius) {
  f.particles.push({ x, y, vx: 0, vy: 0, life: 0.15, max: 0.15, size: radius, color, ghost: true });
}

export function updateFeel(f, dt) {
  // Effects run on real time so they keep moving during hit stop.
  f.flash = Math.max(0, f.flash - dt);
  f.shakeT = Math.max(0, f.shakeT - dt);
  const amp = f.shakeAmp * (f.shakeT / f.shakeMax);
  f.offset = amp > 0 ? { x: (Math.random() * 2 - 1) * amp, y: (Math.random() * 2 - 1) * amp } : { x: 0, y: 0 };
  for (const p of f.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.85; p.vy *= 0.85; }
  f.particles = f.particles.filter(p => p.life > 0);

  if (f.stop > 1e-9) { f.stop -= dt; return 0; }
  if (f.slowT > 0) { f.slowT -= dt; return dt * f.slowScale; }
  return dt;
}

export function cameraOffset(f) { return f.offset; }

export function drawFeel(f, ctx, w, h) {
  for (const p of f.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max) * (p.ghost ? 0.3 : p.stain ? 0.22 : 0.9);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (f.flash > 0) {
    ctx.fillStyle = `rgba(22,19,15,${Math.min(0.14, f.flash * 2)})`; // ink wash, not a white flash
    ctx.fillRect(0, 0, w, h);
  }
}
