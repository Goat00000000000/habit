# Habit

A 1v1 arena duel against an AI rival that learns how you fight, tells you when it is reading you, and remembers you tomorrow.

**Play:** https://goat00000000000.github.io/habit/ (desktop or phone in landscape, nothing to install)

Created and designed by Vedant Vats.

## The idea

The best feeling in PvP is beating someone because you read them. Habit gives you that solo, in short levels, against an opponent that reads you back.

The rival watches what you do: where you dodge when shot at, which way you move, whether you keep running the same direction. When it is confident, it shows its hand ("READ: DASH LEFT") and fires where it expects you to be. Do the opposite and you get OUTPLAYED. When it cannot read you, it says so honestly ("GUESS: ..."), and dodging a guess shows UNREADABLE. Predictable players see READs. Good players see GUESSes.

## Controls

- Desktop: WASD move, mouse aim, click shoot, Space dash, M to mute
- Mobile (landscape): left thumb moves, right thumb drags to aim and releases to shoot, dash button bottom right (or a quick swipe)

## What is in it

- **A first-run lesson:** level 1 teaches move, shoot and dash, then stamps one scripted READ so you learn the core idea by beating it. Skippable.
- **Levels:** an endless ladder. Win a level to go up, lose and the run ends. Checkpoints at levels 2, 4 and 5, then every 3 levels, so your next run starts from the last one you reached.
- **Habit Report** after every level: your top 3 habits with percentages and a predictability score.
- **Day 1 hook:** the rival remembers you between sessions ("Welcome back. Last time: Dodges left when shot at (80%)"), studies overnight, and there is a daily challenge.
- **Six pillar layouts** that change every level. Peeking from cover becomes a habit the rival can read too.
- **Tricks:** pick one after level 2 and get the other at the level 5 checkpoint. Overclock: beat a read and you fire twice as fast for 2 seconds. Ricochet: your shots bounce once off walls and pillars. Later checkpoints let you upgrade a trick, up to level 3 (Overclock up to 4 seconds, Ricochet up to 3 bounces).

## Design decisions

- **Level 1 is the confidence level.** I wanted about 90% of new players to win it so nobody quits in the first minute. My first build was far too hard: a simulated new player won only 4% of level 1. I added a per-level difficulty curve and tuned level 1 to about 90%.
- **Endless levels instead of best of 5.** In playtesting I won every match, because best of 5 ended before the hard rounds. A level ladder lets good players reach the real difficulty.
- **Harder by reading, not by aiming.** Past level 5 the rival never aims better. It gets tougher (more HP, more dodges) and smarter: it reads more often and commits on less evidence. A rival with perfect aim feels unfair, while one that knows your habits feels personal.
- **Reads must actually happen.** In my own playtests the rival read me only twice in 7 levels, so reviewers would never see the core mechanic. I measured why (the rival only tried a read when its gun was ready, and was rarely confident against a player who mixes it up), then added momentum reads and honest GUESSes. A skilled-style player now sees a READ or GUESS about every 4 seconds, up from every 6.
- **Fair reads.** Every read is telegraphed 0.3 s early with text and a target ring, and beating one is rewarded with OUTPLAYED and a rival slowed to half speed for 1.5 s.

## Playtest

Ten friends played the live build, some on PC and some on phones. Most reached level 5 easily and two got to level 8. Everyone understood the game without me explaining it. Phone players had trouble with the controls, so I added the on-screen dash button and a clearer health display. What they liked most was the competition: beating an AI that is trying to read you.

## How I used AI

I developed the concept with Claude (Anthropic), and Claude wrote most of the code and tests. The design decisions after that were mine, made from playing every build and from playtests with ten friends. I made level 1 easy enough that about 90% of players win it, replaced best of 5 with an endless ladder and checkpoints, picked Overclock and Ricochet as the tricks and cut Bait, slowed the rival after an OUTPLAYED, gave every level its own pillar layout, chose the ink duel art direction and the samurai sounds, and added the phone dash button and a clearer health display after my friends struggled with the controls.

The AI inside the game is not an LLM. It is a small pattern model (counts of what you do in each situation, with fallbacks when data is thin) that runs entirely in the browser, so it is explainable and has no server or API key.

## Code map

- `src/habit.js`: the habit model (records what you do, predicts your next move, builds the Habit Report)
- `src/rival.js`: the rival's brain (baseline play plus budgeted, telegraphed reads and guesses)
- `src/game.js`: loop, input, levels, screens, drawing
- `src/arena.js`: the three pillars (movement, bullets, line of sight, cover)
- `src/save.js`: saving, welcome back line, daily challenge
- `src/feel.js`: hit stop, screen shake, slow motion, ink splatter
- `src/ink.js`: the ink duel look (rice paper, ink fighters, red seal reads, report screens)
- `src/sound.js`: synthesised samurai sounds (wooden clacks, taiko, blade swishes, sword clang, koto)
- `src/config.js`: every tuning number, including the per-level difficulty curve

## Tests

```bash
node --test tests/*.test.js   # model, rival, levels, reads, and bots that check the difficulty curve
python3 tests/smoke.py        # loads the game in headless Chrome and plays it
```

The difficulty tests use two bots: a "new player" (wanders, sprays shots, never dodges) that must win level 1 about 90% of the time, and a "skilled player" (leads shots, dodges) whose runs must end around levels 5 to 12.
