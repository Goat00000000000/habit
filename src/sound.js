// Samurai sound set, synthesised with the Web Audio API (no audio files to load).
// Wooden clacks (hyoshigi), taiko hits, blade swishes, a sword clang and koto plucks.

export const SOUNDS = ['start', 'shoot', 'rivalShoot', 'dash', 'rivalHit', 'playerHit', 'read', 'guess', 'outplayed', 'unreadable', 'clear', 'defeat'];

// Miyako-bushi scale on D, the classic koto sound: D Eb G A Bb D.
const KOTO = [293.66, 311.13, 392.0, 440.0, 466.16, 587.33];

export function createSound(makeContext) {
  let a = null, out = null, noiseBuf = null, muted = false;

  function unlock() {
    try {
      if (!a) {
        a = makeContext();
        const comp = a.createDynamicsCompressor();
        out = a.createGain();
        out.gain.value = 0.7;
        out.connect(comp).connect(a.destination);
        noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      a.resume?.()?.catch?.(() => {});
    } catch { a = null; }
  }

  // Shaped noise: filter sweeps from f0 to f1 over the sound.
  function noise(dur, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, gain = 0.3, attack = 0.005, delay = 0 } = {}) {
    const t = a.currentTime + delay;
    const src = a.createBufferSource(); src.buffer = noiseBuf;
    const f = a.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t); src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, { type = 'sine', gain = 0.3, attack = 0.003, freqEnd = freq, delay = 0 } = {}) {
    const t = a.currentTime + delay;
    const o = a.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // Koto: a bright pluck that bends down a touch and darkens as it rings.
  function pluck(freq, delay = 0, gain = 0.22) {
    const t = a.currentTime + delay;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(4000, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.9);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    f.connect(g).connect(out);
    for (const [mult, type] of [[1, 'triangle'], [2, 'sawtooth']]) {
      const o = a.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(freq * mult * 1.012, t);
      o.frequency.exponentialRampToValueAtTime(freq * mult, t + 0.06);
      o.connect(f); o.start(t); o.stop(t + 1.4);
    }
  }

  // Taiko: a deep drum whose pitch drops fast, with a skin thump.
  function taiko(pitch = 70, delay = 0, gain = 0.6) {
    tone(pitch * 1.7, 0.55, { freqEnd: pitch, gain, delay });
    noise(0.12, { type: 'lowpass', f0: 600, f1: 120, gain: gain * 0.5, delay });
  }

  // Hyoshigi: two hardwood blocks struck together.
  function clack(delay = 0, gain = 0.5) {
    noise(0.05, { f0: 2600, f1: 1800, q: 7, gain, delay });
    tone(1750, 0.045, { type: 'triangle', gain: gain * 0.5, delay });
  }

  const SFX = {
    start: () => { clack(0); clack(0.16); },
    // blade swishes: noise that swells and sweeps upward, like a cut through air
    shoot: () => noise(0.17, { f0: 900, f1: 4200, q: 1.2, gain: 0.55, attack: 0.04 }),
    rivalShoot: () => noise(0.14, { f0: 700, f1: 2800, q: 1.2, gain: 0.22, attack: 0.03 }),
    dash: () => noise(0.26, { f0: 350, f1: 1800, q: 0.8, gain: 0.6, attack: 0.07 }),
    rivalHit: () => {
      // sword clang: inharmonic metal partials ringing out
      for (const [ratio, g] of [[1, 0.16], [2.76, 0.1], [5.4, 0.06], [8.93, 0.03]]) tone(560 * ratio, 0.7 / Math.sqrt(ratio), { type: 'sine', gain: g });
      noise(0.04, { type: 'highpass', f0: 4000, gain: 0.25 });
    },
    playerHit: () => taiko(62, 0, 0.7),
    read: () => { clack(0, 0.9); tone(880, 0.14, { type: 'triangle', gain: 0.35 }); },
    guess: () => clack(0, 0.35),
    outplayed: () => { pluck(KOTO[2]); pluck(KOTO[3], 0.09); pluck(KOTO[5], 0.18, 0.26); },
    unreadable: () => { pluck(KOTO[1]); pluck(KOTO[4], 0.1); },
    clear: () => { taiko(80); taiko(80, 0.18); pluck(KOTO[0], 0.3); pluck(KOTO[2], 0.42); pluck(KOTO[5], 0.54, 0.26); },
    defeat: () => { taiko(48, 0, 0.8); pluck(KOTO[4], 0.25); pluck(KOTO[1], 0.45); pluck(KOTO[0] / 2, 0.7, 0.26); },
  };

  return {
    unlock,
    play(name) {
      if (!a || muted || !SFX[name]) return;
      try { SFX[name](); } catch { /* a missing sound never breaks the game */ }
    },
    setMuted(m) { muted = m; },
    isMuted: () => muted,
  };
}
