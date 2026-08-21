# Colour Jars

A browser puzzle game about pouring liquid between jars to fill one big jar
with a single colour.

Colours never mix. Every jar is a stack of solid bands, and a band can only be
poured onto the same colour or into an empty jar. Exactly one jarful of the
target colour is scattered across the shelf, usually buried — so the puzzle is
working out where to park everything that is in the way.

**To play:** open `index.html` in a browser. No install, no build step, no server.
Or run `node build.js --standalone` for the whole game as one shareable file.

## What's in it

**Beginner's Guide** — three hand-built levels that teach the whole game:

| # | Level | Teaches |
|---|-------|---------|
| 1 | Top Pour | Picking a jar up and pouring it |
| 2 | Dig It Out | Uncovering a buried colour by stacking on a match |
| 3 | Make Room | Working through the one empty jar |

Each level unlocks the next. Stars and best scores are kept in `localStorage`.

**Random Puzzle** — endlessly generated, in three settings:

| Mode | Big jar | Jars | Colours in the way | Par |
|------|---------|------|--------------------|-----|
| Easy | 4 units | 4 | 2 | 3–6 moves |
| Normal | 6 units | 5 | 3 | 7–12 moves |
| Hard | 8 units | 6 | 4 | 13–22 moves |

Puzzles are built from a seed, so typing the same seed replays the same puzzle.
Leave the seed blank for a fresh one.

## Rules

- Tap a jar to pick it up, then tap another to pour. The whole top block of one
  colour moves at once. Tap it again to put it down.
- A colour can only go onto the same colour, or into an empty jar.
- The big jar accepts nothing but the target colour, and never pours back out,
  so a wrong tap cannot spoil it.
- **Par** is the fewest moves possible. Match it for three stars.

Keyboard: `1`–`9` jars · `0` big jar · `U` undo · `H` hint · `R` restart ·
`Esc` put down.

## The solver

`js/solver.js` is a breadth-first search over pour states, and it does three
jobs: it proves a generated puzzle can be finished, it sets par to the genuine
fewest moves rather than an estimate, and it answers the hint button from
wherever the player currently is — so a hint is always correct even after a
detour. A hint shows its move as two beats: the jar to pick up shakes, then a
moment later so does where it goes. It also means the game can say *"this position cannot be finished any
more"* the moment it becomes true, instead of leaving someone stuck without
knowing why.

Two things keep it fast enough to run inside a keypress:

- Jars holding the same thing are interchangeable, so states are compared by a
  canonical key with the side jars sorted.
- Pouring the target colour into the big jar is never wrong — the big jar takes
  nothing else, always has room until it is finished, and emptying that run
  frees space. Merging target runs elsewhere first costs a move and saves at
  most one, so it can never come out ahead. When such a move exists the search
  takes it and ignores everything else.

That second shortcut is a claim about optimality, so it is checked rather than
assumed: re-solving puzzles with it removed gives an identical par every time.

## How puzzles are generated

The generator deals the liquid out at random and then hands the board to the
solver. A puzzle is kept only if the solver can finish it **and** the
fewest-moves count lands in the band for that difficulty. So par is always the
true optimum, "hard" means measurably more moves rather than just more jars,
and an unsolvable board can never reach the player.

Two colours that look alike are never used together, and a board where the
target is already sitting on top of more than one jar is thrown away.

## Building

```
node build.js               # artifact fragment, no <!doctype> wrapper
node build.js --standalone  # complete document, opens from disk
```

Both inline every stylesheet, script and font face, so the result has no
external references at all. The default output is a fragment meant to be
embedded in a host page that supplies its own `<!doctype>` — opened directly it
would fall into quirks mode and lay out differently, which is what
`--standalone` is for.

Typefaces are Baloo 2 for display and Nunito for interface text, both rounded,
to match the toy-shelf look. They live in `fonts.css` as inlined latin subsets,
committed so the game never depends on the network. Re-run `node
fetch-fonts.js` only if the type stack changes.

## Layout

```
index.html        markup and screens
styles.css        all styling
fonts.css         generated — inlined webfont subsets
build.js          bundles everything into one file
fetch-fonts.js    regenerates fonts.css from Google Fonts
js/colour.js      the palette, and how far apart two colours look
js/levels.js      the three guide levels
js/engine.js      stacked jars, pouring, undo, win check  (no DOM)
js/solver.js      breadth-first search: par, hints, solvability  (no DOM)
js/generator.js   seeded random puzzles, validated by the solver
js/ui.js          jar rendering and sound
js/app.js         screens, progress, input
```

The engine and solver are pure logic with no DOM dependency, so they run under
Node. That is how the game is checked: 820 generated puzzles across the three
difficulties were each verified to hold exactly one jarful of the target, to
use no two lookalike colours, to fall inside their difficulty's par band, and
to have the solver's own path play back through the engine to a win in exactly
par moves.

## Look

One committed visual world — a bright shelf under a summer sky, drawn with
cartoon weight: thick ink outlines and hard, unblurred drop shadows. The weight
earns its place rather than being decoration. The liquids are vivid and so is
the ground, so without an outline around every jar and band the two would sit
at the same brightness and flatten into each other. For the same reason the
glass is tinted cool: a jar of white liquid has to read as liquid and not as an
empty jar, since white is one of the ten playable colours.

There are deliberately no `prefers-color-scheme` blocks. A game screen is a
place, not a document, so it does not follow the reader's theme — every colour
is painted explicitly, including the ground, so the page holds whatever the
host paints behind it.

## Accessibility

Colour is the mechanic, so it is never the only signal. Every band carries the
initial of its colour — the palette is picked so all ten differ — and each jar
reads out its contents top-down for screen readers, which is the order that
matters when pouring. Everything is keyboard-operable, focus is always visible,
and animation honours `prefers-reduced-motion`.
