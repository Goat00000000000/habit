# Habit

A 60-second 1v1 arena duel against an AI rival that learns your habits, tells you when it is reading you, and remembers you tomorrow.

Play: open `index.html` from any static host (no build step, no libraries).

## Controls
- Desktop: WASD move, mouse aim, click shoot, Space dash
- Mobile (landscape): left thumb moves, right thumb drags to aim and releases to fire, quick swipe on the right to dash

## Code map
- `src/habit.js`: the habit model (counts what you do in each situation, predicts, builds the Habit Report)
- `src/rival.js`: the rival's brain (baseline play + budgeted, telegraphed reads)
- `src/save.js`: saving, welcome back line, daily challenge
- `src/game.js`: loop, input, simulation, screens, drawing
- `src/arena.js`: the three pillars (movement, bullets, line of sight, cover)
- `src/config.js`: every tuning number, including the per-round difficulty curve

## Tests
```bash
node --test tests/*.test.js   # model, rival, save, arena, OUTPLAYED, and a new-player bot that checks the difficulty curve
python3 tests/smoke.py        # loads the game in headless Chrome and plays 10 s
```

## Deploy to GitHub Pages
```bash
gh repo create habit --public --source=. --push
gh api -X POST repos/{owner}/habit/pages -f "source[branch]=main" -f "source[path]=/"
```
Then play at `https://<your-username>.github.io/habit/`.
