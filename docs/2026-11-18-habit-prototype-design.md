# Habit prototype: design (approved 2026-11-18)

Full GDD: https://claude.ai/artifact/FwZC2JQRHTFuK6igdaa8p6

## Intent
Playable browser prototype for the Lila Games designer test (Q1). A reviewer clicks one link and plays a best-of-5 1v1 duel against a rival that learns the player's habits, telegraphs its reads, shows a Habit Report, and remembers the player next day. Submit by Fri 2026-11-20.

## Goals
- Fun core duel in 30 seconds (game feel first).
- Visible, fair AI reads ("READ: DASH LEFT" ~0.3 s before punish).
- D1 hook: persistent rival + welcome-back line + daily challenge.
- Works on desktop (WASD/mouse/space) and mobile landscape (twin stick + swipe dash).

## Non-goals
Clone Duels, cosmetics, shop, accounts, extra arenas, real art, backend, LLM.

## Anti-goals
- AI that feels like cheating (unreadable or aimbot).
- Slow load or install step.
- Code Vedant cannot explain in interview.

## Approaches
1. Plain JS ES modules, no libraries (PICKED): instant load, testable, explainable.
2. Phaser: extra weight and install/CDN step, not needed for one arena.
3. Single HTML file: easy hosting, hard to test the model separately.

## Decided
- Files: index.html, src/habit.js (pure model), src/rival.js (AI decisions), src/game.js (loop, input, render), src/feel.js (hit stop, shake, particles).
- Fixed 16:9 logical arena scaled to fit; mobile landscape with rotate prompt.
- localStorage persistence only.
- Tests: node --test for habit.js; Playwright smoke test (loads, no console errors, 10 s scripted input).
- Tuning start values: per GDD Controls section.

## Left to builder
Exact numbers, visual style within "plain shapes", sound (only if time).
