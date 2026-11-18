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
  closeRange: 180,
  midRange: 380,
  saveKey: 'habit.save.v1',
  // Rival difficulty per round (1-5). Round 1 is the confidence round: ~90% of new players should win it.
  // fireCd = seconds between rival shots, lead = how much it aims ahead of you (0-1),
  // aimJitter = random aim error in px, dodgeChance = chance it dashes away from each of your bullets.
  difficulty: [
    { rivalHp: 2, fireCd: 1.5, bulletSpeed: 320, lead: 0.0, aimJitter: 70, dodgeChance: 0 },
    { rivalHp: 3, fireCd: 1.2, bulletSpeed: 360, lead: 0.1, aimJitter: 60, dodgeChance: 0 },
    { rivalHp: 3, fireCd: 1.0, bulletSpeed: 420, lead: 0.4, aimJitter: 40, dodgeChance: 0.25 },
    { rivalHp: 3, fireCd: 0.8, bulletSpeed: 470, lead: 0.7, aimJitter: 20, dodgeChance: 0.45 },
    { rivalHp: 3, fireCd: 0.6, bulletSpeed: 520, lead: 1.0, aimJitter: 0, dodgeChance: 0.65 },
  ],
});
