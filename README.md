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

The home screen offers two ways in — Campaign and Random Puzzle — and each
opens its own screen. The campaign's icon is a jar that fills with how far
through you are.

**Campaign** — one hundred levels, in order. The first five are written by
hand and teach one rule each; the rest widen steadily from six jars to
twenty-two.

| Levels | | Par |
|--------|--|-----|
| 1–5 | Taught: pouring, collecting, uncovering, how much fits, the empty jar | 2–5 |
| 6–12 | Six to eight jars, three or four colours in the way | 7–15 |
| 13–19 | Eight to nine jars, deeper stacks | 16–26 |
| 20–25 | Ten to eleven deep jars, up to seven colours | 29–41 |
| 26–31 | Twelve to thirteen jars, eight colours | 41–48 |
| 32–37 | Jars eight deep, and the whole palette bar one | 49–51 |
| 38–43 | A big jar taking twenty-odd, colours split across the shelf | 54–59 |
| 44–50 | Fourteen jars eight deep, nine colours, nowhere spare to park | 59–62 |
| 51–56 | Sixteen to eighteen jars, a big jar taking thirty | 62–67 |
| 57–62 | The same shelf again, holding more | 67–69 |
| 63–69 | Up to nineteen jars, ninety-odd units to move | 70–73 |
| 70–75 | Nineteen jars, a hundred units to move | 74–83 |
| 76–81 | Twenty jars, and colours scattered far thinner | 87–91 |
| 82–88 | Twenty-one jars, a big jar taking forty | 93–101 |
| 89–94 | Over a hundred moves at their shortest | 102–105 |
| 95–100 | Twenty-two jars — the widest shelf that still shows whole | 107–114 |

Each level unlocks the next. See **Keeping progress** below for how stars and
best scores are stored.

**Merge Colours** — twenty-five levels, and a rule the ordinary game does not
have.
Pour a colour onto one it mixes with and the two become a third, so the colour
the big jar wants is usually not on the shelf at all — it has to be made.

| | Makes |
|--|-------|
| red + yellow | orange |
| red + blue | purple |
| blue + yellow | green |

Only the three primaries mix, and each pair makes the secondary between them on
the wheel. Everything else is inert: still stackable on its own colour, still
parkable in an empty jar, but it will not combine. Three recipes is the whole
of the rule, which is what keeps the mode readable — and they are drawn above
the shelf so nobody has to remember them.

Mixing pairs one unit for one: two reds landing on five blues make two purple
and leave three blue underneath. A merge turns units already in the jar into
the new colour rather than stacking on top of them, so it never needs room —
a full jar will still take one. The big jar itself never mixes, so it still
cannot be spoiled.

| Levels | | Par |
|--------|--|-----|
| 1–2 | Taught: mixing at all, then that it pairs one for one | 2 |
| 3 | A colour that mixes with nothing, in the way | 3 |
| 4 | Gathering a colour before mixing it | 3 |
| 5 | All three at once, with nothing to spare | 4 |
| 6–10 | Four or five jars, the parents lightly scattered | 5–10 |
| 11–16 | Five or six jars, deeper, more in the way | 12–14 |
| 17–21 | Six jars, the parents buried and split | 16–21 |
| 22–25 | Seven jars six deep — as far as the search reaches | 22–25 |

The dealt levels are built so that **no wrong merge is possible**. Only the two
parents of the target ever appear as mixable colours — the third primary is
left out entirely — so every merge a player can make produces the target, and
no careless pour can destroy a unit that was needed. Everything else on the
shelf is inert: no partner present, so it can only stack on its own colour or
sit in an empty jar. What is left to get wrong is space and order, which is
what the ordinary game asks too.

The five taught levels are the exception, deliberately: level 4 puts a rival
recipe on the shelf precisely because spending a colour on the wrong partner is
the thing it teaches. They are the only levels in the mode that can be spoiled.

What caps the curve is the search, and where the cap sits was measured rather
than guessed. Three things set it:

- **The hint from the opening position is by far the dearest**, and on every
  board tried it is the dearest by a wide margin. It is also the one answer
  that is the same for everybody every time, so each level now ships its own
  optimal path and that hint costs nothing at all. A hint asked after the
  player strays is searched — once — and then followed, so straying costs one
  search rather than one per hint.
- **Width is the wall, not shuffling.** The two were measured separately: at
  seven jars a board settles in a quarter of a second, at eight the builder
  stalls outright, and at nine it takes fifteen seconds even when barely
  shuffled. Growing the shelf is what breaks it, so the curve grows the big jar
  and the depth of the jars instead.
- **The ceiling is checked on a throttled CPU**, not a desktop. Every level is
  played in a real browser with the processor slowed six times and asked for a
  hint both on the opening and after straying. At sixty thousand states the
  hardest level took over four seconds and gave up; at thirty thousand the same
  levels answer in about two and a half, against a four second budget.

Going past par 25 needs a tighter lower bound for the mode, not bigger boards.
The one it has reaches only about two thirds of par, because the moves that
dominate these solutions are gathering pours — consolidating a scattered colour
— and no sound way to count those in advance has been found yet.

**Random Puzzle** — endlessly generated, in either game. A selector at the top
of the screen chooses between **Classic** and **Merge Colours**; everything
below it is the same screen, and each game keeps its own record.

Classic offers four settings:

| Mode | Big jar | Jars | Colours in the way | Par |
|------|---------|------|--------------------|-----|
| Easy | 5 units | 6 | 3 | 5–10 moves |
| Normal | 7 units | 7 | 4 | 11–17 moves |
| Hard | 10 units | 9 | 6 | 18–28 moves |
| Extra Hard | 14 units | 11 deep | 7 | 28–44 moves |

Merge Colours offers three, and stops at Hard on purpose:

| Mode | Big jar | Jars | In the way | Par |
|------|---------|------|------------|-----|
| Easy | 3 units | 4 | 1 | 4–9 moves |
| Normal | 5 units | 5 | 2 | 9–16 moves |
| Hard | 6 units | 6 | 3 | 15–24 moves |

Those are well short of the mode's hardest built levels, and deliberately. A
random puzzle is dealt while somebody waits, and this game's search has no
tight bound to lean on — the states climb steeply with the size of the big jar,
so a board that is fine to ship after an overnight build is not fine to deal on
a tap. Measured over sixty deals each, these settle in 1ms, 11ms and 72ms.

Random merge boards are built the same way the mode's levels are, so **no wrong
merge is possible**: only the target's two parents are mixable, everything else
on the shelf is inert, and the opening solution is worked out at deal time and
carried with the board so the first hint is instant. `tools/check-merge-random.js`
checks all of that, along with par landing inside its band and no two colours on
a shelf being too close to tell apart.

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

Merge Colours has its own search, in `js/merge.js`, and deliberately does not
share the one below. That bound is proved against rules where every pour keeps
the number of units on the shelf the same; merging destroys units, so it does
not hold there, and quietly reusing it would give a wrong par. The merge search
is a plain breadth-first one instead — slower, but optimal by construction,
which matters more on boards that size.

It is a best-first search like the ordinary game's, guided by a bound of its
own: every unit of target still owed to the big jar needs a pour, every unit
that does not exist yet needs a merge to make it, and every run of a colour
that mixes with nothing, sitting on top of a target or one of its parents, has
to move at least once. No single move serves two of those, so they add.

It also keeps one shortcut from the ordinary game: when the target can go into
the big jar, nothing else is worth considering. The reasoning carries over
because the target here is always a secondary colour and so is never an
ingredient — nothing can consume it and no merge needs it — and the big jar
never gives it back. That is an optimality claim, so it is checked rather than
assumed: against a search with the shortcut removed, over 120 dealt boards,
every par identical. It roughly halves the states on the largest levels.

The bound is checked the same way — against the breadth-first search it
replaced, which had no estimate to get wrong — over 200 dealt boards, every par
identical, and with the bound itself never once claiming more moves were needed
than the remaining solution actually took.

`tools/make-merge-levels.js` builds the mode's levels and `tools/check-merge.js`
checks them, the way `make-levels.js` does both for the campaign.

`js/solver.js` is a best-first (A*) search over pour states, and it does three
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
- It is a best-first search, guided by a lower bound on the moves still
  needed. The bound walks each jar from its **deepest** target cell upwards and
  counts runs: target runs still needing a pour, and everything above them that
  is in the way. One pour moves exactly one run and no pour serves both counts,
  so the two add and never overshoot — which is why the first finished position
  off the queue is reached by a shortest route, and par stays exact. Each move
  also shifts the bound by at most one either way, which is what lets a
  position be closed off once reached.

A plain breadth-first search managed six jars and became hopeless at eight; the
bound is what makes the large boards searchable at all.

Counting from the deepest target rather than the shallowest is the whole point
of it, and getting that wrong was for a long time the single biggest limit on
the game. An earlier version looked only above the *highest* target in a jar,
so a colour lying between two target runs — `[target, blue, target]` — was
invisible to it, even though the blue plainly has to move before the lower
target can come out. That is the commonest shape on a deeply shuffled board.

The symptom was that boards of twenty jars could not be generated at all: six
hundred deals thrown back in two minutes, every one of them because the search
ran out of budget and *not one* because it was unwinnable. That split is what
pointed at the bound rather than at the boards. With it corrected, the first
deal of every shape is accepted in under a second, generating a Hard random
puzzle went from 14 seconds to 3 and an Extra Hard one from 5 seconds to under
half of one, and a hint on the largest board in the game — twenty-two jars, 114
moves — takes 73ms.

All of this is a claim about optimality, so it is checked rather than assumed.
See **Checking** below.

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

## Running on a phone

The game is wrapped as a native app with Capacitor, which puts the same web
build inside an iOS and an Android shell.

```
npm install
npm run sync                # refresh www/ and copy it into both projects
npx cap open ios            # or: npx cap open android
```

Capacitor copies a single folder (`webDir`) into the native projects, and the
game lives at the repo root next to `package.json` and `node_modules`. Rather
than move the game, `sync-web.js` copies just the files the page actually loads
into a clean `www/`. It takes that list from the `<script>` and `<link>` tags in
`index.html` rather than keeping a second copy, so a new module cannot silently
miss the build — the same trick `build.js` uses.

The page allows for a native shell in three ways: `viewport-fit=cover` plus
`env(safe-area-inset-*)` padding keeps it clear of the notch and the Android
gesture bar; `overflow: hidden` and `overscroll-behavior: none` stop the whole
page rubber-banding when a jar is tapped; and `app.js` sets a `is-native` class
when `window.Capacitor` is present, which drops the keyboard-shortcut line
since there is no keyboard to shortcut.

`ios/` and `android/` are generated projects and are checked in, as Capacitor
intends — they carry the icons, splash screens and signing configuration.

## Building

```
node build.js               # artifact fragment, no <!doctype> wrapper
node build.js --standalone  # complete document, opens from disk
node make-levels.js         # rebuild the campaign into js/levels.js
```

`make-levels.js` writes the campaign. The five taught levels are written by
hand — each exists to teach one rule, which is not something a generator can be
asked for. The rest are dealt by the ordinary puzzle generator along a widening
curve and kept only if the solver can finish them, their par is no lower than
the level before, and playing them badly still leaves them winnable. Boards are
baked into the file rather than dealt on load, so the campaign is the same for
everyone and par is known to be the true minimum.

Difficulty is left to the board shapes; par is used only as a ratchet. Chasing
a separate par curve fights the shapes and stalls the moment the two disagree,
and picking the gentlest board that merely beats the level before leaves the
middle of the campaign flat while the boards visibly grow. Each level takes a
board from the harder end of what its shape produces.

The curve is in two parts, and the second is built differently, because the
first ran out of the room it was using. Measuring it settled what par actually
follows: not the number of jars, and not the size of the big jar, but the
number of units on the shelf, at roughly par = units − 10. Widening the shelf
while raising the room to work in alongside it cancels out — an early attempt
at levels 26–50 did exactly that, held the unit count still at 50, and left par
flat at 41–45 for twenty-five levels. So the second ramp sets units directly,
one more per level, and takes the leftover capacity as slack, which stays
between 30% and 38% of the shelf throughout. Colours split further apart as it
goes, which is what fills the gap between the unit count and par.

The second ramp is also dealt as a whole set and then put in order of the par
the solver measured, rather than each board being ratcheted past the one dealt
before it. Ratcheting in order does not survive here: one lucky board early
sets a bar the shape cannot clear again, and every level after it settles for
less, so the ramp decays instead of climbing. Ordering afterwards makes the
progression a fact about the boards rather than a hope about the dealing.

The third ramp is dealt and ordered the same way, but what limits it is neither
the shelf nor the palette — it is the solver. Every level's par has to be
*proven* minimal, and that search grows steeply with the board. Churn is what
makes a board expensive to search, because scattering each colour into thin
layers is exactly what denies the search anything to home in on. At fifteen
jars with the second ramp's churn of 0.75, not one deal in two hundred seconds
could be settled at all; lowering churn to 0.45 on the same shape produced
boards of par 58–67 that the solver settled in ten milliseconds. So the third
ramp winds that lever back and lets the unit count do the work instead — which
it could not do in the second ramp, where the shelf had nowhere left to grow.

The fourth ramp could not be dealt at all until the solver's estimate was
fixed — see **Searching** below. With that corrected it needed nothing new of
its own, and it could afford to wind churn back up, since churn is the
strongest lever on par there is and only the search cost had been holding it
down.

Each ramp is pinned to the end point it was built against rather than to the
campaign total. Every one of those numbers appears in a curve that would
quietly redeal every earlier level if it moved, and people have progress
against those boards. Levels that already exist are read back from
`js/levels.js` and re-verified rather than dealt again, which is both far
faster and the stronger check: it proves the boards that actually ship are
sound, rather than proving a fresh deal would have been. `node make-levels.js
--rebuild-all` deals everything from scratch.

## Layout

```
index.html        markup and screens
styles.css        all styling
fonts.css         generated — inlined webfont subsets
build.js          bundles everything into one file
fetch-fonts.js    regenerates fonts.css from Google Fonts
make-levels.js    builds and verifies the 100-level campaign
tools/make-merge-levels.js  builds the Merge Colours levels
tools/merge-deal.js   deals Merge Colours boards
tools/check-merge.js  checks the Merge Colours levels the same way
tools/check-merge-random.js  checks random Merge Colours puzzles
js/store.js       progress storage, and whether it can be trusted
js/colour.js      the palette, and how far apart two colours look
js/levels.js      generated — the 100 campaign levels
js/merge.js       Merge Colours: the recipes, and its own search  (no DOM)
js/merge-generator.js  seeded random Merge Colours puzzles  (no DOM)
js/merge-levels.js  generated — the 25 Merge Colours levels
js/engine.js      stacked jars, pouring, undo, win check  (no DOM)
js/solver.js      best-first search: par, hints, solvability  (no DOM)
js/generator.js   seeded random puzzles, validated by the solver
js/ui.js          jar rendering and sound
js/app.js         screens, progress, input
sync-web.js       copies the files index.html loads into www/ for Capacitor
capacitor.config.json  native shell configuration
package.json      Capacitor dependencies and the sync scripts
ios/ android/     generated native projects (Capacitor)
```

## Checking

The engine and solver are pure logic with no DOM dependency, so they run under
Node. Every campaign level is verified to solve at par for three stars with a
par no lower than the level before, and 880 generated puzzles across the four
difficulties are each verified to
hold exactly one jarful of the target, to use no two lookalike colours, to fall
inside their difficulty's par band, and to have the solver's own path play back
through the engine to a win in exactly par moves.

Par being the *true* minimum is checked in three tiers, because no single
reference reaches every board size. Tier 2 builds its weaker reference by
cutting a term out of the bound's own source, which means it can stop matching
if that source is reworded — it did exactly that once, and spent a run
comparing the solver against an identical copy of itself and passing. It now
refuses to run rather than pass vacuously.

| Tier | Boards | Checked against |
|------|--------|-----------------|
| 1 | Guide + easy | The old exhaustive breadth-first search, optimal by construction |
| 2 | Normal | The same search run with a deliberately weaker bound — still never an overestimate, so it must agree, but it takes a very different route (~350x more states) |
| 3 | Normal, hard, extra hard | The bound itself: walking real solutions and confirming it never claims more moves are needed than the remaining path actually takes (it is exactly right 94% of the time) |

## Hints

A hint works the next move out from wherever the player actually is, not from
some remembered solution, so it stays right after any detour. They are
rationed: **one hint for every ten moves of par, rounded up**, and the button
counts them down — `Hint (5)`. Rounding up rather than down is what makes the
small levels work; a floor would leave everything under par ten with no hint at
all, including the five that teach.

A hint is only charged for when a move is actually shown. Asking on a position
the search cannot settle, or one that can no longer be won, costs nothing —
those answers are warnings, not help. Restarting a level hands the whole
allowance back, since that is a fresh attempt; undo deliberately does not,
which would make the ration free.

Whatever a hint works out is kept and followed. A shortest route from here
stays a shortest route as long as the player takes it, so every hint after the
first is read off it and costs no search at all. Merge Colours levels start
with that route already in the level file, because the opening is both the
dearest position to work out and the same for everybody. When the search does
have to run there — it can take a second or two on a phone — the game says
"Working it out…" and yields first, so the message paints rather than the page
simply freezing.

## Keeping progress

Stars, best scores and the chosen difficulty live in the browser's own storage,
because progress belongs to the person playing rather than to everyone who
opens the page.

That storage is not guaranteed. A private window, an embedded view, or a
browser set to block site data can refuse it — sometimes by throwing, and
sometimes, worse, by accepting a write and keeping nothing. So `js/store.js`
picks its backing store by testing it: write a probe, read it back, and only
trust it if the value survives the round trip. Failing that it drops to session
storage, then to memory, and the menu says plainly which of the three is in use
rather than letting someone earn stars that quietly vanish.

Two rules keep a finished level from being lost:

- **A result is written the moment it is earned**, not when the celebration
  appears. The card is on a short timer for its animation, and anyone who
  closed the game in that window — or whose phone put it to sleep — used to
  lose the level they had just finished.
- **Nothing is written when the page closes.** A close-time flush puts whatever
  is in memory over the stored copy, so a page that had failed to read the
  store would wipe real progress with nothing. A guard that checks the store
  first does not help either: the case it exists for is the one where reading
  is what has failed. Not writing at all is the only thing that holds.

The chosen difficulty is kept under its own key for the same reason — it is a
preference, not something earned, and saving it must never put anything near
the record of stars.

## Sound

The blips are made with oscillators rather than audio files, so nothing has to
be downloaded. There is no background music and nothing loops.

The audio device is only held open while something is actually sounding. A
running `AudioContext` keeps the output stream open, and an open stream hums
audibly on a lot of hardware even when the graph feeding it is silent — which,
measured at the destination, it is between sounds. So the context is suspended
once a second and a half has passed with nothing played, and the next sound
resumes it; and it is never opened at all while sound is switched off, which is
what previously made the hum impossible to turn off.

## Settings

Sound and Colour Blind Assist live in one dialog, reachable from the home
screen and from **Menu** on the game toolbar, so either can be flipped without
leaving a level. They are stored under `colourjars.prefs.v1` — their own key,
well away from the record of stars, for the same reason the chosen difficulty
has always had one: a preference is not something earned, and writing it must
never put anything near progress.

## Fitting the window

While a puzzle is on screen the whole game is sized to the window and nothing
scrolls, so the shelf, the buttons and the hint line are always in view. The
jars are what give way: `fitBoard()` searches for the largest jar height that
still fits.

The size it may settle on grows with the window — about a third of its height,
floored at the old fixed maximum and capped at 320px — so a tablet or a desktop
shows big jars instead of phone-sized ones adrift in a sea of sky. The level
grid does the same, laying out as many columns as the width allows: four or
five on a phone, eleven on an iPad. The only place that scrolls is that grid,
which is deliberately taller than the window once there are a hundred tiles.

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

Every jar reads out its contents top-down for screen readers, which is the
order that matters when pouring. Everything is keyboard-operable, focus is
always visible, and animation honours `prefers-reduced-motion`.

Every band also carries the initial of its colour. That letter used to be drawn
always, on the principle that colour is the mechanic and so should never be the
only signal. It is now hidden by default and switched on by **Colour Blind
Assist** in Settings.

Two things follow from that, and both are worth knowing:

- The palette used to guarantee that no two colours could be confused: every
  pair sits at least 150 apart on the distance measure in `colour.js`, and
  `make-levels.js` and `tools/check-merge.js` both refuse a board that breaks
  it. **That guarantee is currently broken.** `slate` was recoloured to a
  bright cyan (`#6b7c9c` → `#22c8ff`), which sits 103 from `teal` — and 80 of
  the 100 campaign levels, plus merge levels 24 and 25, put the two on the same
  shelf. Re-running either builder would now reject those boards.
- With the letters off by default, there is nothing else distinguishing that
  pair unless the player finds the setting.

Neither the boards nor their pars changed — all 125 levels still solve at
exactly the stored figure — so this is a palette matter, not a puzzle one. A
cyan at least 150 from teal, or letters back on by default, would settle it.
