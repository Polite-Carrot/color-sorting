# Color Match & Merge

A browser puzzle game about pouring liquid between jars to fill one big jar
with a single color.

Colors never mix. Every jar is a stack of solid bands, and a band can only be
poured onto the same color or into an empty jar. Exactly one jarful of the
target color is scattered across the shelf, usually buried — so the puzzle is
working out where to park everything that is in the way.

**To play:** open `index.html` in a browser. No install, no build step, no server.
Or run `node build.js --standalone` for the whole game as one shareable file.

## What it is called

The game ships as **Color Match & Merge**, and its two main modes are **Sort
Colors** and **Merge Colors**. Player-facing text uses US spelling throughout —
*color*, not *colour*. The code does not: `js/colour.js`, the `wrong-colour`
move-refusal code and a good deal of internal prose still say *colour*, because
renaming a module and the identifiers that reach into it is a change with real
risk and no player-visible benefit. The rule is the boundary, not the file:
**anything a player reads says color; anything only a developer reads may say
either.**

The bundle identifier stayed `com.politecarrot.colorjars` on both platforms
even though the display name changed. That is deliberate — the identifier is
how a store recognises an app as an update to one already installed, so
changing it would strand every existing install rather than update it.

The name is set in six places, and they do **not** all say the same thing —
which is deliberate, and worth knowing before anyone "fixes" it:

| Where | Says |
|-------|------|
| `<title>` and the masthead in `index.html` | Color Match & Merge |
| `appName` in `capacitor.config.js` | Color Match & Merge |
| `CFBundleDisplayName` in `ios/App/App/Info.plist` | Color Match |
| `app_name`, `title_activity_main` in `android/.../values/strings.xml` | Color Match |

The long name is what the game calls itself once you are in it. The short one
is what sits under the icon on a home screen, where both platforms truncate
anything much longer — so the two native files carry a name that fits, and the
web build carries the full one. `appName` in the Capacitor config only seeds a
native project at creation, so it never overwrites those two; it is the one
entry that agrees with the web build purely because nothing forces it not to.

Both native files are generated projects that are checked in, so they hold
whatever they were last set to, and a rename has to edit them by hand. They
are the two most likely to be left behind, and a stale one shows up as the
wrong name under the icon rather than as a build failure.

Two internal names still say `color-sort-and-merge`: the `name` in
`package.json` and the filenames `build.js` writes. Neither reaches a player —
one is a private npm package name, the other is what the bundle is called on
disk — so they are left alone rather than churned.

## What's in it

The home screen offers four ways in — Sort Colors, Merge Colors, Daily Puzzle
and Random Puzzle — and each opens its own screen. Sort Colors' icon is a jar
that fills with how far through you are; the daily's is a calendar page whose
squares light up as the week is played.

**Sort Colors** — one hundred and fifty levels, in order. The first five are
written by hand and teach one rule each; the rest widen steadily from six jars
to twenty-two, and then deepen.

| Levels | | Par |
|--------|--|-----|
| 1–5 | Taught: pouring, collecting, uncovering, how much fits, the empty jar | 2–5 |
| 6–12 | Six to eight jars, three or four colors in the way | 7–15 |
| 13–19 | Eight to nine jars, deeper stacks | 16–26 |
| 20–25 | Ten to eleven deep jars, up to seven colors | 29–41 |
| 26–31 | Twelve to thirteen jars, eight colors | 41–48 |
| 32–37 | Jars eight deep, and the whole palette bar one | 49–51 |
| 38–43 | A big jar taking twenty-odd, colors split across the shelf | 54–59 |
| 44–50 | Fourteen jars eight deep, nine colors, nowhere spare to park | 59–62 |
| 51–56 | Sixteen to eighteen jars, a big jar taking thirty | 62–67 |
| 57–62 | The same shelf again, holding more | 67–69 |
| 63–69 | Up to nineteen jars, ninety-odd units to move | 70–73 |
| 70–75 | Nineteen jars, a hundred units to move | 74–83 |
| 76–81 | Twenty jars, and colors scattered far thinner | 87–91 |
| 82–88 | Twenty-one jars, a big jar taking forty | 93–101 |
| 89–94 | Over a hundred moves at their shortest | 102–105 |
| 95–100 | Twenty-two jars — the widest shelf that still shows whole | 107–114 |
| 101–115 | The same shelf, jars **ten** deep instead of eight | 115–123 |
| 116–130 | Up to 153 units to move, a big jar taking fifty | 123–132 |
| 131–142 | Every color split thin across twenty-two jars | 132–138 |
| 143–150 | 162 units — the most the shelf holds and stays winnable | 139–145 |

Each level unlocks the next. See **Keeping progress** below for how stars and
best scores are stored.

**Merge Colors** — one hundred and fifty levels, and a rule the ordinary game
does not have.
Pour a color onto one it mixes with and the two become a third, so the color
the big jar wants is usually not on the shelf at all — it has to be made.

| | Makes |
|--|-------|
| red + yellow | orange |
| red + blue | purple |
| blue + yellow | green |

Only the three primaries mix, and each pair makes the secondary between them on
the wheel. Everything else is inert: still stackable on its own color, still
parkable in an empty jar, but it will not combine. Three recipes is the whole
of the rule, which is what keeps the mode readable — and they are drawn above
the shelf so nobody has to remember them.

Mixing pairs one unit for one: two reds landing on five blues make two purple
and leave three blue underneath. A merge turns units already in the jar into
the new color rather than stacking on top of them, so it never needs room —
a full jar will still take one. The big jar itself never mixes, so it still
cannot be spoiled.

| Levels | | Par |
|--------|--|-----|
| 1–2 | Taught: mixing at all, then that it pairs one for one | 2 |
| 3 | A color that mixes with nothing, in the way | 3 |
| 4 | Gathering a color before mixing it | 3 |
| 5 | All three at once, with nothing to spare | 4 |
| 6–10 | Four or five jars, the parents lightly scattered | 5–10 |
| 11–16 | Five or six jars, deeper, more in the way | 12–14 |
| 17–21 | Six jars, the parents buried and split | 16–21 |
| 22–25 | Seven jars six deep | 22–25 |
| 26–31 | Five to eight jars, five obstacle colors | 26 |
| 32–38 | Deeper, and the two colors in ribbons | 27 |
| 39–44 | Seven jars, a big jar taking eight or more | 28–30 |
| 45–50 | The end of what a shelf seven deep will give | 31–34 |
| 51–59 | Still seven jars, but eight and nine deep | 35–36 |
| 60–72 | Ten deep appears; a big jar taking up to nineteen | 37–38 |
| 73–86 | The same shelf, wound tighter | 39–41 |
| 87–95 | Nine and ten deep throughout | 42–46 |
| 96–100 | Ten deep, every one — the hardest the search can prove | 47–51 |
| 101–120 | Eleven and twelve deep, a big jar taking twenty-odd | 52–54 |
| 121–140 | The same shelf wound tighter — par climbs a point at a time | 54–57 |
| 141–150 | Where the search stops, not where the boards do | 57–67 |

The dealt levels are built so that **no wrong merge is possible**. Only the two
parents of the target ever appear as mixable colors — the third primary is
left out entirely — so every merge a player can make produces the target, and
no careless pour can destroy a unit that was needed. Everything else on the
shelf is inert: no partner present, so it can only stack on its own color or
sit in an empty jar. What is left to get wrong is space and order, which is
what the ordinary game asks too.

The five taught levels are the exception, deliberately: level 4 puts a rival
recipe on the shelf precisely because spending a color on the wrong partner is
the thing it teaches. They are the only levels in the mode that can be spoiled.

Levels 26 to 100 are not built from a curve at all, and that is the point.

A shape is not what has to pass the checks — a *board* is, and three things
have to hold at once: par above the level before, a search small enough to
answer a hint on a phone, and a shelf that survives being played carelessly.
Those pull against each other. Clutter makes a board cheap to search, because
the bound counts every inert run sitting on a parent — but it also makes the
shelf easy to deadlock. Thinning it out does the reverse. Pinning each level to
one hand-drawn shape and demanding a board that satisfies all three means
asking a one-in-twenty event to happen on command, which is exactly what it did
not do: shape after shape came back with nothing.

So the builder samples the whole space instead — jars, depth, big jar,
obstacle colors, churn and slack all drawn at random — deals from whatever it
draws, keeps the board if it passes, and goes again until it has a pool. The
pool is then sorted by the par the solver measured and spread across the
levels. Difficulty is what the boards turned out to be, not what a curve
predicted they would be.

It also settled a question the curves had got wrong. Eight jars had been
written off as a wall; the sampler found eight-jar boards that pass, because
the wall was a property of the shapes being tried and not of the width.

What caps it is still the search, and where the cap sits was measured rather
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

Levels 51 to 100 were dealt the same way, and they overturned the conclusion
this section used to end on. It said going past par 34 would need a tighter
lower bound for the mode rather than bigger boards. That was wrong, and wrong
in an instructive way: it generalised from a space that had been searched
mostly along its width. Sampling the *depth* instead found boards up to par 51
that the same bound settles in under thirty thousand states — level 100 needs
12,086, less than half of what level 96 costs at par 47.

Three things came out of measuring it, and the first two say where the room
was hiding:

- **Width is the wall, and only width.** Sampling seven to ten jars gave 219
  boards, and every one of the 19 that settled inside the budget was seven jars
  wide; the other 200 were all too dear. That is the same cliff the first ramp
  hit, and it has not moved.
- **Depth is free by comparison.** Every board that beat par 34 had jars eight
  deep or more, and the last five levels are ten deep throughout. Going deeper
  raises par without giving the search more branches to weigh, because the jars
  it can pour *into* are what multiply the states, not how much they hold.
- **Five obstacle colors, exactly.** Not a tuned figure but a forced one, and
  hemmed in from both sides. Below five the search cannot settle these boards
  at all — three and four were tried 282 times between them and produced
  nothing but "too dear", because the bound counts inert runs sitting on a
  parent and thinning them out blinds it. Above five is arithmetic: the
  obstacle pool is the palette minus the three primaries and the target, which
  leaves six, and the lookalike rule always bars one of those six. Six
  obstacles becomes possible the day cyan sits a legal distance from teal — see
  **Accessibility**. The palette bug is costing level design, not just
  legibility.

What has not changed is the bound itself, and levels 101-150 are where that
finally bites. Three things were measured while building them, and together
they say the mode is at its ceiling rather than short of a wider space:

- **Eight jars is impossible, and not because of the hint.** Wide boards were
  offered three budgets: the builder's 30,000 states, a generous 500,000, and
  an offline 4,000,000 with a four-minute wall. Eight jars and nine jars are
  over all three. The width limit is the search itself, so no amount of
  offline patience buys it.
- **A tighter bound is worth a great deal, and hard to get.** The bound reaches
  45% of the true remaining distance, measured over 3,123 states along 100
  optimal paths. Dividing by the longest run rather than the largest jar takes
  that to 76% and cuts states 4.5x — six boards that could not be settled at
  400,000 states became solvable, one of them in 194 — but it is **not
  admissible**: runs grow when they are gathered, so a later pour can move more
  than the longest run that existed when the bound was taken, and it returned
  par 49 on two boards whose true par is 48. Counting *jars* holding each
  colour instead is sound, because gathering only ever reduces a jar count —
  and it is worth 0.3%.
- **A bigger search finds more boards, not harder ones.** Sampled deeper than
  this ramp draws, 0 of 40 boards settle at 30,000 states and 13 of 40 at
  500,000 — but those 13 come in at par 48-66, against the 52-67 already
  reached here. Spending the player's hint time would buy volume, not
  difficulty.

So par 67 is where the *search* stops rather than where the boards do, and the
next ramp needs a tighter bound or a rule that prunes the tree — not a wider
shelf.

**Random Puzzle** — endlessly generated, in either game. A selector at the top
of the screen chooses between **Sort Colors** and **Merge Colors**; everything
below it is the same screen, and each game keeps its own record.

Sort Colors offers four settings, and the shelf roughly doubles each step:

| Mode | Big jar | Jars | Colors in the way | Par |
|------|---------|------|--------------------|-----|
| Easy | 3 units | 3 | 2 | 4–7 moves |
| Normal | 6 units | 6 | 3 | 9–15 moves |
| Hard | 12 units | 10 | 5 | 21–29 moves |
| Extra Hard | 18 units | 16 | 7 | 36–49 moves |

Merge Colors offers the same four, but stops at seven jars:

| Mode | Big jar | Jars | In the way | Par |
|------|---------|------|------------|-----|
| Easy | 3 units | 3 | 1 | 5–10 moves |
| Normal | 5 units | 6 | 3 | 10–17 moves |
| Hard | 5 units | 7 | 5 | 16–21 moves |
| Extra Hard | 7 units | 7 deep | 5 | 21–29 moves |

**Why merge stops at seven where Sort Colors reaches sixteen.** Not an
oversight — every wider shape was measured, timing a whole deal end to end with
its retries, since a random puzzle is dealt while somebody waits:

| Shape | Par | Median deal | Worst |
|-------|-----|-------------|-------|
| 7 jars, 6 deep, big jar 6 | 22–27 | 169ms | 499ms |
| 8 jars, 5 deep, big jar 4 | 11–19 | 89ms | 195ms |
| 8 jars, 5 deep, big jar 5 | 14–20 | 498ms | 2,669ms |
| 8 jars, 6 deep, big jar 4 | 14–20 | 4,135ms | 11,067ms |
| 8 jars, 6 deep, big jar 5 | 14–20 | 16,624ms | 106,296ms |

Eight jars is affordable only with a target so small the board comes out
*easier* than seven — par 11–19 against 22–27 — and adding depth to win that
back costs seconds a deal. Ten jars needs a target of four or less and still
takes a second and a half; eleven, twelve and sixteen produce nothing at all
inside 200,000 states. Width and difficulty trade against each other here, and
seven jars is where the trade stops being worth making.

Sort Colors has no such problem because its bound is near-exact: a sixteen-jar
board deals in about 11ms, worst measured 22ms.

Par is also deliberately kept short of the ceiling. Sixteen jars eight deep
with a big jar of thirty measures par 62–76, which is campaign territory and
too much to hand somebody who just tapped for a new puzzle — so Extra Hard
takes the same sixteen jars at six deep and lands at 36–49. The width is the
step up; the length of the solution is not.

A random puzzle is dealt while somebody waits, and this game's search has no
tight bound to lean on, so what a setting can ask for is limited by what can be
dealt on a tap. Measured over sixty deals each, these settle in 1ms, 18ms, 94ms
and 146ms; on a processor slowed six times, Extra Hard deals in about 0.7s and
answers a hint in a quarter of one.

Extra Hard is where that limit shows, and it went somewhere unexpected. Seven
jars is as wide as the search reaches, so the rest of the step up had to come
from depth, a bigger jar to fill, and clutter — and **clutter turned out to
make these boards cheaper to deal, not dearer**. The bound in `merge.js` counts
every inert run sitting on a parent, so a shelf strewn with obstacles is one
the search can see the bottom of. Emptier seven-jar shapes with the same big
jar were measured at three to fifty seconds a deal; heaping five obstacle
colors on and churning them hard brought it to a fifth of a second, and came
out harder as well — par 20–28 against 18–19.

Random merge boards are built the same way the mode's levels are, so **no wrong
merge is possible**: only the target's two parents are mixable, everything else
on the shelf is inert, and the opening solution is worked out at deal time and
carried with the board so the first hint is instant. `tools/check-merge-random.js`
checks all of that, along with par landing inside its band and no two colors on
a shelf being too close to tell apart.

**The shelf width is also a dial.** Under the four settings is a stepper that
takes the jar count anywhere from 3 to 16 in Sort Colors, or 3 to 7 in Merge
Colors. Picking a difficulty resets it to that preset's own width, so the
presets stay meaningful and the stepper reads as an adjustment from one.

Moving it off the preset builds a derived shape rather than just changing a
number, because everything that depends on the shelf has to move with it: the
big jar and the obstacle count are taken as a share of the cells available, so
three jars is never asked to hold a jarful of eighteen. The preset's par band
is dropped, since that band described the preset's width — whatever par the
board deals at is the honest answer, and it is shown on the board.

Obstacle colours grow with the width, and in merge that is not garnish. The
bound counts every inert run sitting on a parent, so a wide shelf with few
obstacles is one the search cannot see the bottom of: Easy stretched to seven
jars while keeping its single obstacle took **eleven seconds** to deal, and
letting the count follow the width brought the same board back to 353ms.

Puzzles are built from a seed, so typing the same seed replays the same puzzle.
Leave the seed blank for a fresh one.

**Daily Puzzle** — one board a day, the same board for everybody, dealt by the
two generators above. The screen is a calendar: tap a day to play it, and days
already solved go green.

The week gives each day its own game, so the mode rotates rather than settling
into one thing:

| | Game | Setting |
|--|------|---------|
| Monday | Sort Colors | Normal |
| Tuesday | Merge Colors | Easy |
| Wednesday | Sort Colors | Hard |
| Thursday | Merge Colors | Normal |
| Friday | Sort Colors | Extra Hard |
| Saturday | Merge Colors | Hard |
| Sunday | Merge Colors | Extra Hard |

Nothing is downloaded and nothing is stored ahead of time. **The date is the
seed** — 1 May 2026 deals seed `20260501` — so the board is worked out on the
spot from the generator the weekday names, and two people opening the same date
get the same shelf because they ran the same deal, not because they fetched the
same file. It also means the whole back catalogue exists without anyone having
built it: every day from **1 May 2026** onward can be played, and the calendar
pages back to that month and stops.

Days ahead of today are shown but cannot be opened. The board for tomorrow is
perfectly derivable — the seed is just a number — so locking it is a rule of
the mode rather than a secret being kept, and the calendar draws those days
dashed and disabled to say so plainly.

**The streak counts back from today**, and today not being done yet does not
break it: a streak of three on Thursday means Monday to Wednesday are done and
Thursday is still open. Missing a day ends it. Playing an old day fills that
date in, and if it joins two runs together the streak grows accordingly — going
back to fill a gap is the point of having the back catalogue at all. Each date
keeps its own stars and best score under its own key, and replaying a day only
ever improves them.

## Rules

- Tap a jar to pick it up, then tap another to pour. The whole top block of one
  color moves at once. Tap it again to put it down.
- A color can only go onto the same color, or into an empty jar.
- The big jar accepts nothing but the target color, and never pours back out,
  so a wrong tap cannot spoil it.
- **Par** is the fewest moves possible. Match it for three stars.

Keyboard: `1`–`9` jars · `0` big jar · `U` undo · `H` hint · `R` restart ·
`Esc` put down.

## The solver

Merge Colors has its own search, in `js/merge.js`, and deliberately does not
share the one below. That bound is proved against rules where every pour keeps
the number of units on the shelf the same; merging destroys units, so it does
not hold there, and quietly reusing it would give a wrong par. The merge search
is a plain breadth-first one instead — slower, but optimal by construction,
which matters more on boards that size.

It is a best-first search like the ordinary game's, guided by a bound of its
own: every unit of target still owed to the big jar needs a pour, every unit
that does not exist yet needs a merge to make it, and every run of a color
that mixes with nothing, sitting on top of a target or one of its parents, has
to move at least once. No single move serves two of those, so they add.

It also keeps one shortcut from the ordinary game: when the target can go into
the big jar, nothing else is worth considering. The reasoning carries over
because the target here is always a secondary color and so is never an
ingredient — nothing can consume it and no merge needs it — and the big jar
never gives it back. That is an optimality claim, so it is checked rather than
assumed: against a search with the shortcut removed, over 120 dealt boards,
every par identical. It roughly halves the states on the largest levels.

The bound is checked the same way — against the breadth-first search it
replaced, which had no estimate to get wrong — over 200 dealt boards, every par
identical, and with the bound itself never once claiming more moves were needed
than the remaining solution actually took.

`tools/make-merge-levels.js` builds the mode's levels and `tools/check-merge.js`
checks them, the way `make-levels.js` does both for the Sort Colors campaign.
The builder deals only the levels that do not yet exist: everything already in
`js/merge-levels.js` is read back and re-verified, so adding a ramp cannot
redeal boards people have progress against, and each dealt ramp keeps its own
sampling space so a rebuild of one cannot deal it from another's shapes.
`MERGE_POOL_MINUTES` caps how long it will sample for (45 by default; the
fifty levels of the third ramp pooled in six). `--rebuild-all` deals every
dealt level again, keeping only the five taught ones, which no generator could
produce.

`js/solver.js` is a best-first (A*) search over pour states, and it does three
jobs: it proves a generated puzzle can be finished, it sets par to the genuine
fewest moves rather than an estimate, and it answers the hint button from
wherever the player currently is — so a hint is always correct even after a
detour. A hint shows its move as two beats: the jar to pick up shakes, then a
moment later so does where it goes. Both stay ringed — the one to lift in pink,
its destination in green — until the next move, so the pair can still be seen
once the shakes have finished. The jars carry no numbers, so the rings and the
color named in the hint are what identify them. It also means the game can say *"this position cannot be finished any
more"* the moment it becomes true, instead of leaving someone stuck without
knowing why.

Three things keep it fast enough to run inside a keypress:

- Jars holding the same thing are interchangeable, so states are compared by a
  canonical key with the side jars sorted.
- Pouring the target color into the big jar is never wrong — the big jar takes
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
so a color lying between two target runs — `[target, blue, target]` — was
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

Two colors that look alike are never used together. A board with too many
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

Pinch-zoom is switched off (`maximum-scale=1, user-scalable=no`, with
`touch-action: pan-x pan-y`), so a two-finger gesture or a double-tap on a jar
cannot leave the board zoomed halfway off the screen. That is a real
accessibility cost — magnifying the page is exactly how some people read it —
and it is only defensible because the board already scales itself to the
window (see **Fitting the window**) and the text has no fixed pixel ceiling.
Anyone changing it should weigh those two facts, not just the gesture.

The config is `capacitor.config.js` rather than `.json`, and the reason is the
side effect at the top of it: requiring the file runs `sync-web.js`. Capacitor
loads its config before every `cap` command, so `npx cap sync` on its own is
now honest — `www/` is rebuilt from the current sources first. Before, `sync`
copied whatever snapshot `www/` happened to hold, so a module newly added to
`index.html` could be missing from a native build while the browser played it
perfectly. If `sync-web.js` fails the config throws rather than returning a
half-built app.

`sync-web.js` takes the file list from `index.html`'s tags, but the startup
lockup's two SVGs are named in it explicitly — they are referenced from markup
rather than from a `<script>` or `<link>`, so nothing would otherwise pick
them up.

`ios/` and `android/` are generated projects and are checked in, as Capacitor
intends — they carry the icons, splash screens and signing configuration.

## Building

```
node build.js               # artifact fragment, no <!doctype> wrapper
node build.js --standalone  # complete document, opens from disk
node make-levels.js         # rebuild the Sort Colors campaign into js/levels.js
```

`make-levels.js` writes the Sort Colors campaign. The five taught levels are written by
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
between 30% and 38% of the shelf throughout. Colors split further apart as it
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
makes a board expensive to search, because scattering each color into thin
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

### Going deeper instead of wider

Levels 101-150 keep the shelf at twenty-two jars and take the jars from eight
deep to ten. The reason is the screen, not the search.

Twenty-two is where the fourth ramp stopped, because it is the widest shelf a
desktop still shows whole. Depth is nearly free there, and measuring said why:
the shelf wraps into rows and scrolls, so jars past twenty-two only add rows,
while a band's height is set by how deep a jar is and how tall the window is.
Across five screen sizes, going from eight deep to ten takes a band on a phone
from 33.4px to 26.7px, and on the smallest phone from 12.4px to 12.4px — the
floor the campaign's last levels already sat on. Nothing is clipped and nothing
runs off the side at any size tried.

Ten more cells per jar is 44 more places to put units, and par follows the unit
count here as everywhere else: 128 units measured par 117, 160 gave 148. What
stops it going further is slack rather than par. At nine deep, 160 units leaves
38 free cells of 198 — 19%, against the 30% earlier ramps kept — and a shelf
that tight deadlocks under careless play. Ten deep puts the same units in 220
cells and leaves 27%.

The search is not the constraint at all here, which was the surprise. On these
boards the estimate is near-exact — it spends about one state per move of par —
so the solver settles a 162-unit board in under a fifth of a second, and a hint
on a six-times-throttled phone comes back in about half a second against a
1.2-second budget, cold or after straying.

## Layout

```
index.html        markup and screens
styles.css        all styling
fonts.css         generated — inlined webfont subsets
build.js          bundles everything into one file
fetch-fonts.js    regenerates fonts.css from Google Fonts
make-levels.js    builds and verifies the 100-level Sort Colors campaign
tools/make-merge-levels.js  builds the Merge Colors levels
tools/check-merge.js  checks the Merge Colors levels the same way
tools/check-merge-random.js  checks random Merge Colors puzzles
js/store.js       progress storage, and whether it can be trusted
js/colour.js      the palette, and how far apart two colors look
js/levels.js      generated — the 100 Sort Colors levels
js/merge.js       Merge Colors: the recipes, and its own search  (no DOM)
js/merge-generator.js  seeded random Merge Colors puzzles  (no DOM)
js/merge-levels.js  generated — the 100 Merge Colors levels
js/daily.js       the daily schedule, seeds, calendar grid and streak  (no DOM)
js/engine.js      stacked jars, pouring, undo, win check  (no DOM)
js/solver.js      best-first search: par, hints, solvability  (no DOM)
js/generator.js   seeded random puzzles, validated by the solver
js/ui.js          jar rendering and sound
js/app.js         screens, progress, input
assets/           app icon and Polite Carrot lockup, as SVG sources
sync-web.js       copies the files index.html loads into www/ for Capacitor
capacitor.config.js  native shell configuration — also runs sync-web.js
package.json      Capacitor dependencies and the sync scripts
ios/ android/     generated native projects (Capacitor)
```

## Checking

The engine and solver are pure logic with no DOM dependency, so they run under
Node. Every Sort Colors level is verified to solve at par for three stars with a
par no lower than the level before, `tools/check-merge.js` does the same for all
100 Merge Colors levels and additionally plays each one carelessly to check it
cannot be deadlocked, and 880 generated puzzles across the four
difficulties are each verified to
hold exactly one jarful of the target, to use no two lookalike colors, to fall
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

Merge Colors allows its search eight seconds rather than the ordinary game's
1.2, behind a "Working it out…" line and a yield so the message paints first.
That figure was measured, not chosen: on a six-times-throttled processor the
dearest levels finish in three to four seconds, and at eight times throttled a
four-second budget gave up on four of them. Being told a position cannot be
worked out when the search simply had not finished is worse than waiting.

Whatever a hint works out is kept and followed. A shortest route from here
stays a shortest route as long as the player takes it, so every hint after the
first is read off it and costs no search at all. Merge Colors levels start
with that route already in the level file, because the opening is both the
dearest position to work out and the same for everybody. When the search does
have to run there — it can take a second or two on a phone — the game says
"Working it out…" and yields first, so the message paints rather than the page
simply freezing.

## Keeping progress

Stars, best scores, the days done and the chosen difficulty live in the
browser's own storage, because progress belongs to the person playing rather
than to everyone who opens the page.

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

Sound, Color Blind Assist and Reset progress live in one dialog, reachable
from the home screen and from **Settings** on the game toolbar, so any of them
can be reached without leaving a level. That toolbar button used to say "Menu",
which collided with the two buttons that genuinely go back to the menu — "←
Menu" above the board and "Menu" on the win card. Those two are navigation and
keep the name; this one opens a dialog, so it says what it opens. They are stored under `colourjars.prefs.v1` — their own key,
well away from the record of stars, for the same reason the chosen difficulty
has always had one: a preference is not something earned, and writing it must
never put anything near progress.

### Erasing progress

Wiping a hundred levels of stars asks twice and then asks for six seconds of
intent: a dialog saying plainly what goes, and then a button that has to be
held down while a bar fills. Letting go early stops the bar dead and nothing is
lost. It used to be a button on the home screen that you tapped twice, which
sat one slip away from erasing everything.

The bar is driven frame by frame from script rather than by a CSS transition,
so releasing stops it exactly where it stood instead of animating on to
somewhere it never reached. Holding works by pointer or by keyboard — space or
enter held down, with auto-repeat ignored, since a key repeating is not a key
being held. The pointer is captured, so a finger sliding off the button still
counts.

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

**A row holds eight jars at most, when that is affordable.** Sixteen jars put
all sixteen in one line on a landscape iPad — small, cramped, and leaving the
lower half of the screen empty — and split 12 and 4 on a desktop. Two rows of
eight read better than either.

It is done with a hard break element every eighth jar rather than a width cap
on the shelf, and that took two tries worth recording. A width cap has to be
expressed in jar widths, and jar width is the very thing the search is
bisecting, so the cap moved underneath the search and it settled somewhere
absurd — eleven rows of two on a phone.

The cap is also offered rather than imposed, because on the campaign's widest
levels it is not affordable: twenty-two jars in rows of eight is three rows,
which no readable size can show all of, so the fitter falls through to letting
the shelf scroll and picks the largest jars it can — worse than the uneven rows
the cap set out to fix. So the board is settled uncapped first; if no row is
over eight there is nothing to do, and if capping would cost the whole shelf
being in view, the uncapped layout stands.

The shelf reserves head-room at the top, because a picked-up jar lifts and
tilts, and the shelf can scroll on a short window — without it the top row was
clipped mid-lift while lower rows were fine. A picked-up jar also rises above
its neighbours, so it is never behind the next jar along.

Dialogs size themselves the same way in spirit but not in mechanism: the
overlay pads itself by `env(safe-area-inset-*)` so a modal cannot sit under
the notch or the home indicator, and the panel inside is capped at the height
that leaves and scrolls its own content past that. How to play is the long
one, and on a short window it used to be clipped with its **Got it** button
below the fold — a dialog nothing could dismiss by tapping. It now scrolls to
reach the button.

That fix had a second-order cost worth recording, because the two changes were
made months apart and only interact. Every dialog puts the keyboard on its
close button when it opens, which is right; but focusing a control inside a
panel that now scrolls makes the browser scroll that control into view, and
the close button is the last thing in the panel. So How to play began opening
at its final line, past its own title — on a 320px window, 643 pixels down.
`openModal()` is the fix: it starts the panel at the top and focuses without
scrolling, and every dialog goes through it, so a dialog that grows long later
cannot quietly reintroduce this.

The home menu has the matching problem and the same shape of fix. It is
declared as content that shrinks rather than scrolls — the footer holds How to
play and Settings, and pushing those off a screen that cannot scroll makes
them unreachable, not merely hidden. `flex: 0 1 auto` alone does
not do that, though: a flex item will not shrink below its content, so once
the menu had four cards the footer sat below the fold on an iPhone SE with no
way to reach it.

The scrolling goes on the *screen*, not on the card list, and that distinction
is the whole of it. Scrolling the list works and was the first attempt, but a
scroll container clips to its padding box, and these cards are drawn with a
6px hard shadow that lives outside theirs — so the bottom card lost its shadow
and every card lost the outer half of its focus ring. Padding the list back
out is not free either: it is a centred grid with a max-width, so padding
comes out of the cards' own width. Scrolling the screen instead leaves the
cards in the middle of the scrolled content, nowhere near a clipping edge, at
no cost to their size.

On wide screens the masthead is the thing in the way rather than the window
height, so a height-conditional rule trades the title-screen scale back on
windows too short to hold both it and four cards.

### The menu turns sideways

Held sideways, the menu goes two across and two down rather than four in a
column. That is what makes the four modes fit an iPad in landscape: Safari
takes about a hundred points of height off an already short window, and a
single column left the fourth card and the whole footer below the fold.

It is keyed to `orientation: landscape` rather than to a height threshold, and
deliberately. A threshold flips the layout between two devices that feel the
same to hold, or on one device when a subtitle happens to wrap onto another
line; *sideways means two across* is a rule somebody can predict. A `min-width`
keeps phones in landscape out of the tablet sizing, where two columns of tablet
type would be two cramped ones.

A phone lying down is the extreme of the same problem — 390 points of height
against a menu wanting 486 — and two columns alone do not close that. Below
500 points the title screen gives up what is decoration, the three jars and the
tagline, and keeps the name and the four modes, which are what the screen is
for. The shortest iPad landscape window sits well clear of that threshold.

Both are CSS alone, so rotating re-lays it out with nothing to listen for.

## Look

One committed visual world — a bright shelf under a summer sky, drawn with
cartoon weight: thick ink outlines and hard, unblurred drop shadows. The weight
earns its place rather than being decoration. The liquids are vivid and so is
the ground, so without an outline around every jar and band the two would sit
at the same brightness and flatten into each other. For the same reason the
glass is tinted cool: a jar of white liquid has to read as liquid and not as an
empty jar, since white is one of the ten playable colors.

There are deliberately no `prefers-color-scheme` blocks. A game screen is a
place, not a document, so it does not follow the reader's theme — every color
is painted explicitly, including the ground, so the page holds whatever the
host paints behind it.

### The startup lockup

The page opens on a black screen carrying the Polite Carrot mark and name,
shared with Tide-Runner so the two read as coming from the same place. It
fades out on `load` after about 1.35 seconds, or 100ms for anyone who has
asked for reduced motion, and removes itself from the document afterwards
rather than lingering as an invisible layer over the board.

Two things guard against it becoming a black screen nobody can get past: a
4-second hard timeout dismisses it whether `load` fired or not, and the
element is `pointer-events: none` throughout, so even a stuck splash cannot
swallow a tap. It is plain markup and a small inline script rather than
anything the game modules own, so it paints before any of them have parsed.

**The lockup does not survive `build.js`.** The two SVGs are referenced by
relative path and the bundler inlines scripts, styles and fonts but not
images, so a single-file build opens on a bare black screen for its first
second unless it happens to be sitting next to `assets/`. That is the one
place the "no external references whatsoever" promise above is currently
untrue.

## Accessibility

Every jar reads out its contents top-down for screen readers, which is the
order that matters when pouring. Everything is keyboard-operable, focus is
always visible, and animation honours `prefers-reduced-motion`.

Every band also carries the initial of its color. That letter used to be drawn
always, on the principle that color is the mechanic and so should never be the
only signal. It is now hidden by default and switched on by **Color Blind
Assist** in Settings.

Two things follow from that, and both are worth knowing:

- The palette used to guarantee that no two colors could be confused: every
  pair sits at least 150 apart on the distance measure in `js/colour.js`, and
  `make-levels.js` and `tools/check-merge.js` both refuse a board that breaks
  it. **That guarantee is currently broken.** `slate` was recoloured to a
  bright cyan (`#6b7c9c` → `#22c8ff`), which sits 103 from `teal` — and 80 of
  the 100 Sort Colors levels, plus merge levels 24 and 25, put the two on the same
  shelf. Re-running either builder would now reject those boards.
- With the letters off by default, there is nothing else distinguishing that
  pair unless the player finds the setting.

Neither the boards nor their pars changed — all 300 levels still solve at
exactly the stored figure — so this is a palette matter, not a puzzle one. A
cyan at least 150 from teal, or letters back on by default, would settle it.

It is no longer only a legibility matter, though. The merge builder draws its
obstacle colors from the palette minus the three primaries and the target,
which leaves six, and the clash always bars one of those six — so a merge board
can carry five obstacle colors and never six. Five happens to be exactly the
count those boards need, so nothing is blocked today; but it means the builder
is working at the edge of what the palette allows rather than inside it, and
the level after this one has nowhere to go. Fixing cyan would hand it back.

`node tools/check-merge.js` reports the affected levels every run, and both
builders warn rather than refusing, so this cannot quietly become invisible.

That second part had to be added to `make-levels.js`, which until now threw on
any lookalike it found — including one on a board already shipped. Adding the
fifth ramp was blocked outright by it: the build died on level 8, a board dealt
long before the palette moved under it. A level being dealt is still refused
for a lookalike pair; a level already on disk is reported and the build carries
on. 80 of the 150 Sort Colors levels and 2 of the 150 Merge Colors levels are
reported every run.
