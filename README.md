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

| # | Level | Jars | Par | Teaches |
|---|-------|------|-----|---------|
| 1 | Top Pour | 6 | 3 | Picking a jar up and pouring it |
| 2 | Dig It Out | 6 | 6 | Uncovering a buried colour by stacking on a match |
| 3 | Make Room | 7 | 8 | Working through the one empty jar |

Each level unlocks the next. Stars and best scores are kept in `localStorage`.

**Random Puzzle** — endlessly generated, in three settings:

| Mode | Big jar | Jars | Colours in the way | Par |
|------|---------|------|--------------------|-----|
| Easy | 5 units | 6 | 3 | 5–10 moves |
| Normal | 7 units | 7 | 4 | 11–17 moves |
| Hard | 10 units | 9 | 6 | 18–28 moves |
| Extra Hard | 14 units | 11 deep | 7 | 28–44 moves |

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
moment later so does where it goes. Both stay ringed — the one to lift in pink,
its destination in green — until the next move, so the pair can still be seen
once the shakes have finished. The jars carry no numbers, so the rings and the
colour named in the hint are what identify them. It also means the game can say *"this position cannot be finished any
more"* the moment it becomes true, instead of leaving someone stuck without
knowing why.

Three things keep it fast enough to run inside a keypress:

- Jars holding the same thing are interchangeable, so states are compared by a
  canonical key with the side jars sorted.
- Pouring the target colour into the big jar is never wrong — the big jar takes
  nothing else, always has room until it is finished, and emptying that run
  frees space. Merging target runs elsewhere first costs a move and saves at
  most one, so it can never come out ahead. When such a move exists the search
  takes it and ignores everything else.
- It is a best-first search, guided by a lower bound on the moves still needed:
  every run of the target still outside the big jar needs a pour to get there,
  and every run sitting on top of the target has to move at least once. No pour
  can serve both, so the two counts add. Because the bound never overshoots,
  the first finished position to come off the queue is reached by a shortest
  route, so par stays exact.

A plain breadth-first search managed six jars and became hopeless at eight; the
bound is what makes the nine-jar boards searchable at all.

Both shortcuts are claims about optimality, so they are checked rather than
assumed. See **Checking** below.

Proving a position *cannot* be won is the slow case — there is no goal to home
in on, so the search must exhaust the space. Both searches that run while
someone is playing are therefore capped in milliseconds as well as in states,
so the game never stalls between taps whatever the board size. A position too
tangled to settle in time gets no dead-end warning rather than a freeze.

## How puzzles are generated

The generator deals the liquid out at random and then hands the board to the
solver. A puzzle is kept only if the solver can finish it **and** the
fewest-moves count lands in the band for that difficulty. So par is always the
true optimum, "hard" means measurably more moves rather than just more jars,
and an unsolvable board can never reach the player.

Two colours that look alike are never used together. A board with too many
jars already showing the target on top is thrown back — that allowance scales
with the size of the shelf, since more jars simply means more chances of it.

Sizing up a candidate uses a much smaller search limit than play does. Deals
that cannot be settled quickly are discarded rather than proved impossible,
which is what keeps dealing a nine-jar board down to a fraction of a second.

Extra Hard's jars are deeper rather than more numerous. Depth is what makes it
hard — there is more sitting on top of the target — while the extra capacity
leaves somewhere to put things down. An earlier version had the same eleven
jars one unit shallower, and with only twelve free cells across the whole
shelf, an ordinary run of moves could leave it unwinnable about one game in
ten. Twenty-three free cells later, that is nought in sixty, with par
unchanged.

It also deals the target nearer the bottom of the jars, so there is more
sitting on top of it to clear away. That is not only a difficulty knob:
adding jars on its own barely raises par, because extra jars bring extra room
to work in, whereas burying the target raises it properly. It also makes far
more deals land in the intended range, so far fewer are dealt and thrown
away — which is why the largest boards are quick to produce rather than the
slowest.

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

## Checking

The engine and solver are pure logic with no DOM dependency, so they run under
Node. 880 generated puzzles across the four difficulties are each verified to
hold exactly one jarful of the target, to use no two lookalike colours, to fall
inside their difficulty's par band, and to have the solver's own path play back
through the engine to a win in exactly par moves.

Par being the *true* minimum is checked in three tiers, because no single
reference reaches every board size:

| Tier | Boards | Checked against |
|------|--------|-----------------|
| 1 | Guide + easy | The old exhaustive breadth-first search, optimal by construction |
| 2 | Normal | The same search run with a deliberately weaker bound — still never an overestimate, so it must agree, but it takes a very different route (~290x more states) |
| 3 | Normal, hard, extra hard | The bound itself: walking real solutions and confirming it never claims more moves are needed than the remaining path actually takes |

## Fitting the window

While a puzzle is on screen the whole game is sized to the window and nothing
scrolls, so the shelf, the buttons and the hint line are always in view. The
jars are what give way: `fitBoard()` searches for the largest jar height that
still fits.

It searches against real layout rather than calculating a size, because how
many jars land on a row — and so how tall the shelf is — depends on the very
size being chosen. Measuring sidesteps that circularity, and eight steps of
bisection settle it. If even the smallest readable jars will not fit, the
optional lines go first (the keyboard legend, then the level briefing), and
only then does the shelf scroll inside itself — the buttons and the hint line
stay put either way.

Jars have a floor, because below about 13px a band stops being a band and
becomes a stripe. The floor therefore follows how many bands a jar can hold —
a deeper jar has to be taller to stay legible.

Seeing every jar at once beats seeing big ones, so the search first looks for
a size that shows the whole shelf, and only lets the shelf scroll inside
itself when no readable size manages that.

The shelf reserves head-room at the top, because a picked-up jar lifts and
tilts, and the shelf can scroll on a short window — without it the top row was
clipped mid-lift while lower rows were fine. A picked-up jar also rises above
its neighbours, so it is never behind the next jar along.

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
