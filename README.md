# Habit

A 1v1 arena duel against an AI rival that learns how you fight, tells you when it is reading you, and remembers you tomorrow.

**Play:** https://goat00000000000.github.io/habit/ (desktop or phone in landscape, nothing to install)

Created and designed by Vedant Vats.

## The idea

The best feeling in PvP is beating someone because you read them. Habit gives you that solo, in short levels, against an opponent that reads you back.

The rival watches what you do: where you dodge when shot at, which way you move, whether you keep running the same direction. When it is confident, it shows its hand ("READ: DASH LEFT") and fires where it expects you to be. Do the opposite and you get OUTPLAYED. When it cannot read you, it says so honestly ("GUESS: ..."), and dodging a guess shows UNREADABLE. Predictable players see READs. Good players see GUESSes.

## Controls

- Desktop: WASD move, mouse aim, click shoot, Space dash
- Mobile (landscape): left thumb moves, right thumb drags to aim and releases to shoot, quick swipe on the right to dash

## What is in it

- **Levels:** an endless ladder. Win a level to go up, lose and the run ends. Checkpoints every 5 levels.
- **Habit Report** after every level: your top 3 habits with percentages and a predictability score.
- **Day 1 hook:** the rival remembers you between sessions ("Welcome back. Last time: Dodges left when shot at (80%)"), studies overnight, and there is a daily challenge.
- **Three pillars** for cover. Peeking from cover becomes a habit the rival can read too.

## Design decisions

- **Level 1 is the confidence level.** I wanted about 90% of new players to win it so nobody quits in the first minute. My first build was far too hard: a simulated new player won only 4% of level 1. I added a per-level difficulty curve and tuned level 1 to about 90%.
- **Endless levels instead of best of 5.** In playtesting I won every match, because best of 5 ended before the hard rounds. A level ladder lets good players reach the real difficulty.
- **Harder by reading, not by aiming.** Past level 5 the rival never aims better. It gets tougher (more HP, more dodges) and smarter: it reads more often and commits on less evidence. An aimbot feels unfair. A rival that knows you feels personal.
- **Reads must actually happen.** In my own playtests the rival read me only twice in 7 levels, so reviewers would never see the core mechanic. I measured why (the rival only tried a read when its gun was ready, and was rarely confident against a player who mixes it up), then added momentum reads and honest GUESSes. A skilled-style player now sees a READ or GUESS about every 4 seconds, up from every 6.
- **Fair reads.** Every read is telegraphed 0.3 s early with text and a target ring, and beating one is rewarded with OUTPLAYED.

## How I used AI

I developed the concept with Claude (Anthropic), then shaped it through my own playtesting: I made level 1 a confidence level, replaced best of 5 with an endless ladder, and made reads actually happen after the AI barely read me in my own runs. Claude wrote most of the code and tests under my direction, and I playtested every build.

The AI inside the game is not an LLM. It is a small pattern model (counts of what you do in each situation, with fallbacks when data is thin) that runs entirely in the browser, so it is explainable and has no server or API key.

## Code map

- `src/habit.js`: the habit model (records what you do, predicts your next move, builds the Habit Report)
- `src/rival.js`: the rival's brain (baseline play plus budgeted, telegraphed reads and guesses)
- `src/game.js`: loop, input, levels, screens, drawing
- `src/arena.js`: the three pillars (movement, bullets, line of sight, cover)
- `src/save.js`: saving, welcome back line, daily challenge
- `src/feel.js`: hit stop, screen shake, slow motion, particles
- `src/config.js`: every tuning number, including the per-level difficulty curve

## Tests

```bash
node --test tests/*.test.js   # model, rival, levels, reads, and bots that check the difficulty curve
python3 tests/smoke.py        # loads the game in headless Chrome and plays it
```

The difficulty tests use two bots: a "new player" (wanders, sprays shots, never dodges) that must win level 1 about 90% of the time, and a "skilled player" (leads shots, dodges) whose runs must end around levels 5 to 12.
