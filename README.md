# Colour Jars

A browser puzzle game about pouring liquids between jars to mix an exact shade.

There is one big jar and a shelf of smaller ones. Fill the big jar **to the brim**
so its colour matches the target exactly. Liquids blend by volume, and once two
colours are in the same jar there is no separating them again — so the puzzle is
working out which jars, and how much of each, before you commit.

**To play:** open `index.html` in a browser. No install, no build step, no server.

## What's in it

**Beginner's Guide** — three hand-built levels that teach the whole game:

| # | Level | Teaches |
|---|-------|---------|
| 1 | Straight Pour | Picking a jar up and pouring it |
| 2 | Two Make One | Mixing two colours in the right ratio, and the sink |
| 3 | Already Stirred | Pre-mixed jars, and pouring only part of a jar |

Each level unlocks the next. Stars and best scores are kept in `localStorage`.

**Random Puzzle** — endlessly generated, in three settings:

| Mode | Big jar | Colours in the recipe | Jars | Roughly |
|------|---------|----------------------|------|---------|
| Easy | 6 units | 2 | 4 | 1 winning fill in ~14 |
| Normal | 8 units | 2–3, plus a pre-mixed jar | 5 | 1 in ~29 |
| Hard | 12 units | 3–4, two pre-mixes, lots of spare liquid | 7 | 1 in ~242 |

Puzzles are built from a seed, so typing the same seed replays the same puzzle.
Leave the seed blank for a fresh one.

## Rules

- Tap a jar to pick it up, then tap another to pour into it. Tap it again to put it down.
- One unit poured is one move. **Par** is the fewest moves possible.
- Colours blend by volume: 2 crimson + 2 yellow makes 4 orange.
- The big jar must be **full *and* the right shade**. Full but wrong does not count.
- The **sink** throws liquid away, so an overpour is recoverable — but it costs moves.
- Not every jar is meant to be used, and not every jar is meant to be emptied.

Three stars for finishing at or under par, fewer for going over or taking a hint.

Keyboard: `1`–`9` shelf jars · `0` big jar · `D` sink · `U` undo · `H` hint ·
`R` restart · `Esc` deselect.

## How puzzles are generated

Random puzzles are built **backwards from a known answer**, which is what
guarantees they are always solvable. The generator picks the recipe first, then
splits it across jars, merges some pairs into pre-mixed jars, adds spare liquid
so the answer is not simply "empty everything", and pads with decoy colours the
recipe never uses. The recorded answer also drives the hint button.

Anything that would spoil the puzzle is rejected and regenerated: recipes a
single pure colour already matches, and single jars that on their own equal the
answer.

## Layout

```
index.html        markup and screens
styles.css        all styling
js/colour.js      palette, volume-weighted mixing, colour matching
js/levels.js      the three guide levels
js/engine.js      jars, pouring, undo, win check  (no DOM)
js/generator.js   seeded random puzzle generation
js/ui.js          jar rendering and sound
js/app.js         screens, progress, input
```

The engine is pure logic with no DOM dependency, so it runs under Node — which is
how the generator was verified: 9,000 generated puzzles (3,000 per difficulty)
were each played through both their recorded answer and their hint path, and all
9,000 were solvable.
