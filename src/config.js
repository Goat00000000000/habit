// Every tuning number lives here so playtest changes touch one file.
export const CONFIG = Object.freeze({
  arenaW: 960,
  arenaH: 540,
  radius: 16,
  hp: 3,
  playerSpeed: 260,      // px/s
  bulletSpeed: 520,      // px/s
  bulletRadius: 5,
  fireCooldown: 0.5,     // s
  dashTime: 0.15,        // s, invincible while dashing
  dashSpeed: 1066,       // px/s (about 160 px per dash)
  dashCooldown: 1.2,     // s
  roundTime: 45,         // s
  rounds: 5,             // best of 5
  sampleEvery: 0.25,     // s between habit samples
  reactionTime: 0.25,    // s rival lag
  readThreshold: 0.55,   // top action share needed to commit a read
  readMinSamples: 6,
  readTelegraph: 0.3,    // s between READ text and punish
  decayPerRound: 0.9,
  round1FireMult: 2,     // round 1 is the confidence round: rival fires half as often
  closeRange: 180,
  midRange: 380,
  saveKey: 'habit.save.v1',
});
