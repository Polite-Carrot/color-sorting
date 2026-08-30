#!/usr/bin/env node
/* Sort Colors builds its campaign from seeds dealt by the Random Puzzle
 * generator (see tools/build-campaign.js). That does not transfer to this
 * mode, and the reason is measured rather than suspected.
 *
 * A campaign board here has to do two things a random one never does: answer
 * a hint after the player has strayed off the stored path, and survive being
 * played carelessly. Both bite hard.
 *
 *   - The hint is a live search with an eight second cap, which is what the
 *     30,000 state ceiling below stands for. Seven jars settles inside it at
 *     around 23,000 states. Eight, nine and ten do not settle at all -- so a
 *     stuck player on a wide shelf would be told the board is too tangled to
 *     work out. Width past seven is therefore unusable here, however cheap it
 *     is to deal.
 *   - A narrow shelf at a hard setting has no spare room, so ordinary careless
 *     play deadlocks it. Screening the random generator's own presets against
 *     both gates, seventy deals a cell yielded nothing usable at all for Extra
 *     Hard at four, five or six jars, or for Hard at six.
 *
 * Which is why this file defines its own shape spaces rather than reaching for
 * the random presets: those are tuned for a board somebody plays once, not for
 * one that has to hold up under a hint and a bad run of moves. */
/* make-merge-levels.js — build the Merge Colours levels into js/merge-levels.js.
 *
 *   node tools/make-merge-levels.js
 *
 * The first five are written by hand — each teaches one thing about mixing,
 * which a generator cannot be asked for — and are read back from the file and
 * re-verified rather than rebuilt. The rest are dealt along a widening curve
 * and kept only if they pass every check below.
 *
 * What limits this curve is the search: the states climb steeply with the size
 * of the big jar, and the in-game hint has 1.2 seconds to answer.
 *
 * Measuring where that bites gave the way past it. The dearest hint on every
 * board tried is the one from the opening position — by some distance, and in
 * every trial — and that is the single position whose answer can be worked out
 * here, once, and carried in the level. So each level ships its optimal path,
 * the first hint costs nothing at all, and the ceiling is set by the dearest
 * hint AFTER the first move instead. */

'use strict';
const fs = require('fs');
const path = require('path');

require('../js/colour.js');
require('../js/engine.js');
require('../js/merge.js');
const C = globalThis.Colour, { Game } = globalThis.Engine, M = globalThis.Merge;
/* The dealer the game itself uses, so the levels shipped here and the puzzles
   dealt on the player's phone are built by one piece of code. There used to be
   a copy of it in this folder, and the copy had already drifted — it never
   gained the check that keeps two hard-to-tell-apart colours off one shelf. */
require('../js/merge-generator.js');
const { deal, rng } = globalThis.MergeGenerator;

const TOTAL = 150, TAUGHT = 5, FIRST_DEALT = TAUGHT + 1;
/* Each ramp is pinned to the end it was built against rather than to TOTAL, so
   adding levels after it cannot redeal boards people have progress against.
   Levels already on disk are read back and re-verified, never rebuilt;
   --rebuild-all deals everything again. */
const RAMP_ONE_END = 25;
const RAMP_TWO_END = 50;
const RAMP_THREE_END = 100;
const REBUILD_ALL = process.argv.includes('--rebuild-all');

/* The ceiling, in states the search has to visit from the opening position.
   Raised once the opening stopped being searched at all: with that answer
   carried in the level, the dearest hint a player can actually provoke is one
   asked after straying, and Merge Colours gives that four seconds behind a
   "working it out" line rather than the ordinary game's 1.2. Every level built
   here is then checked on a six-times-throttled CPU in a real browser, which
   is what this number is really standing in for — and that check is what set
   it. At sixty thousand the hardest level took just over four seconds on that
   throttled CPU and gave up; the levels that came in around thirty thousand
   answered in about two and a half, which leaves real margin. */
const HINT_STATES = 30000;

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function shape(level) {
  const u = (level - FIRST_DEALT) / (RAMP_ONE_END - FIRST_DEALT);
  /* Seven jars is as wide as this can go, and a big jar of seven as deep.
     Past that the search does not degrade, it falls off a cliff: eight jars
     stalled the builder outright, and at nine a board takes fifteen seconds to
     settle even when barely shuffled, against a quarter of a second at seven.
     It is the width that does it and not the shuffling — the two were measured
     separately — so the curve grows the jars' depth and the burial rather than
     the shelf. */
  const jars = lerp(4, 7, u);
  const cap = lerp(4, 6, u);
  const mainCap = lerp(3, 7, u);
  const cells = jars * cap;
  /* Room to work in, as a share of the shelf. Too little and an ordinary run
     of moves can deadlock — and unlike the ordinary game there is no way to
     take a merge back, so the room matters more here, not less. */
  const slack = Math.round(cells * 0.35);
  return {
    mainCap,
    sideJars: jars,
    sideCap: cap,
    fillers: lerp(1, 4, u),
    fillerUnits: cells - slack - mainCap * 2,
    burial: u * 0.6,
    churn: 0.15 + 0.45 * u
  };
}

/* Beyond the first ramp there is no curve, because a curve was the wrong tool.

   A shape is not what has to pass the checks — a BOARD is. Three things have
   to hold at once: par above the level before, a search small enough to answer
   a hint on a phone, and a shelf that survives being played carelessly. Those
   pull against each other. Clutter makes a board cheap to search but easy to
   deadlock; thinning it out makes it survivable but too dear to search. Pin a
   level to one shape and demand a board that satisfies all three and you are
   asking a one-in-twenty event to happen on command — which is exactly what
   kept coming back empty.

   So this samples the whole space instead: draw a shape at random, deal from
   it, keep the board if it passes, and go again. Whatever survives is real,
   and the pool is then sorted by the par the solver measured and dealt out in
   order. Difficulty comes from what the boards turned out to be, not from what
   a curve predicted they would be. */
const SPACE_TWO = {
  jars:   [5, 6, 7, 8],
  cap:    [5, 6, 7],
  mainCap:[5, 6, 7, 8, 9, 10],
  fillers:[3, 4, 5],
  churn:  [0.40, 0.50, 0.60, 0.70, 0.80],
  slack:  [0.30, 0.33, 0.36, 0.40]
};

/* Levels 51-100 have to start above par 34, where the second ramp finished,
   and the space that got there does not reach: its best boards ARE levels
   45-50. Sampling wider settled where the room actually is, and it is not
   where the second ramp looked for it.

   Width stays the wall. Nothing at eight jars or more settled inside the
   search budget at all — 200 boards in a row, every one of them too dear —
   which is the same cliff the first ramp found. Depth is a different matter:
   every board that beat par 34 had jars eight deep or more, and at ten deep
   with a big jar of twenty the par reaches the fifties while the search still
   settles in twenty-odd thousand states. So this ramp holds the shelf at seven
   jars and grows downwards instead.

   `fillers` is a single value because five is the only count that works, and
   it is worth saying why, because it looks arbitrary. Below five the search
   cannot settle these boards: three and four obstacle colours were tried 282
   times between them and produced nothing but "too dear", since the bound
   counts inert runs sitting on a parent and thinning them out blinds it. Above
   five is not refused but impossible — the obstacle pool is the palette minus
   the three primaries and the target, which is six colours, and one of those
   six is always barred by the lookalike rule. Six obstacles becomes dealable
   the moment cyan sits a legal distance from teal; see the palette note in the
   README. */
const SPACE_THREE = {
  jars:   [7],
  cap:    [8, 9, 10],
  mainCap:[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  fillers:[5],
  churn:  [0.40, 0.55, 0.70, 0.85],
  slack:  [0.28, 0.32, 0.36, 0.40]
};

/* Levels 101-150, and this is where the mode runs out of room. Three probes
   said so, and they are worth recording because they are what a later ramp
   should not repeat:

   - Width is still the wall, and it has not moved. Eight and nine jars were
     tried 268 times against a par floor of 40 — deliberately low, to give them
     every chance — and not one settled inside the search budget. Not a thin
     yield: zero.
   - Raising the state budget a little buys almost nothing: 30,000 yields 0.50
     boards a minute, 55,000 yields 0.57, and both stop at the same place.
     Raising it a lot buys volume but not difficulty — sampled deeper than this
     ramp draws, 0 of 40 boards settle at 30,000 states and 13 of 40 at
     500,000, and those 13 come in at par 48-66 against the 52-67 this ramp
     already reaches. So a bigger search finds more of the same boards rather
     than harder ones, which is worth knowing before anyone spends the player's
     hint time on it.
   - Depth still works, and it is all that is left: eleven and twelve deep with
     a big jar into the twenties is where every keeper came from.

   So this ramp reaches par 67, and most of the way up it is the board growing
   rather than par climbing — deeper jars, a
   bigger jar to fill. Going past this needs a tighter lower bound for the
   mode, which is the same conclusion the third ramp reached about par 34 and
   was wrong about; the difference is that this time the space either side has
   been measured rather than assumed. */
const SPACE_FOUR = {
  jars:   [7],
  cap:    [10, 11, 12],
  mainCap:[18, 19, 20, 21, 22, 23, 24, 25, 26],
  fillers:[5],
  churn:  [0.40, 0.55, 0.70, 0.85],
  slack:  [0.28, 0.32, 0.36, 0.40]
};

function sampleShape(rand, space) {
  const pick = a => a[Math.floor(rand() * a.length)];
  const jars = pick(space.jars), cap = pick(space.cap), mainCap = pick(space.mainCap);
  const fillers = pick(space.fillers);
  const cells = jars * cap;
  const slack = Math.round(cells * pick(space.slack));
  const fillerUnits = cells - slack - mainCap * 2;
  if (fillerUnits < fillers) return null;          /* no room for the obstacles */
  if (mainCap * 2 > cells - slack) return null;    /* no room for the colours themselves */
  return { mainCap, sideJars: jars, sideCap: cap, fillers, fillerUnits,
           burial: 0.4 + rand() * 0.3, churn: pick(space.churn) };
}

/* ── checks every level has to pass ────────────────────────────────────── */

/* `strict` is for boards this tool deals. The five taught levels are held to
   the first half only: level 4 deliberately puts a rival recipe on the shelf,
   because being able to spend a colour on the wrong partner is the very thing
   it teaches. The dealt levels take the opposite line on purpose — there are
   twenty of them in a row and no way to take a merge back. */
function inspect(lvl, strict) {
  const g = new Game(lvl);
  /* A board being dealt is given exactly the ceiling to settle inside, because
     going over it IS the rejection — there is nothing to learn by letting it
     run on. Handing every candidate two million states first meant a board was
     turned down after thirty seconds rather than one, and the sampler managed
     twenty-five boards in five minutes. A level already on disk gets a
     generous budget instead, since there its real par is wanted. */
  const solved = strict
    ? M.solve(g.position(), HINT_STATES, 6000)
    : M.solve(g.position(), 2000000, 30000);
  if (solved.budgetExceeded) return { bad: 'too dear to search' };
  if (solved.par == null) return { bad: 'cannot be finished' };

  for (const mv of solved.path) {
    const from = 'jar' + mv.from, to = mv.to === -1 ? 'main' : 'jar' + mv.to;
    if (!g.pour(from, to).ok) return { bad: 'solution move is illegal in the engine' };
  }
  if (!g.won) return { bad: 'solution does not win' };

  const counts = {};
  for (const jar of lvl.jars) for (const f of jar.fills) counts[f] = (counts[f] || 0) + 1;
  const present = new Set(Object.keys(counts));

  if (strict) {
    /* Exactly one jarful of target must be makeable, and every drop of it
       needed: one unit of each parent for each unit of target, no spares. */
    for (const parent of lvl.parents) {
      if (counts[parent] !== lvl.main.cap) {
        return { bad: parent + ' appears ' + (counts[parent] || 0) + ' times, needs ' + lvl.main.cap };
      }
    }
    if (counts[lvl.target]) return { bad: 'the target is already on the shelf' };

    /* Nothing on the shelf may mix with anything but the two parents, so no
       wrong move can ever destroy a unit that was needed. */
    for (const r of M.RECIPES) {
      if (present.has(r.a) && present.has(r.b) && r.makes !== lvl.target) {
        return { bad: 'a rival recipe is on the shelf: ' + r.a + '+' + r.b };
      }
    }
  }

  /* Colours too close to tell apart reject a board this tool is dealing, but
     only warn about one already shipped: it is a known problem with a known
     fix, and it must not stop the level's par and solution coming back. */
  let lookalike = null;
  const used = [...present, lvl.target];
  for (let a = 0; a < used.length && !lookalike; a++) {
    for (let b = a + 1; b < used.length && !lookalike; b++) {
      if (C.distance(used[a], used[b]) < 150) lookalike = 'lookalikes ' + used[a] + '/' + used[b];
    }
  }
  if (lookalike && strict) return { bad: lookalike };

  return { par: solved.par, states: solved.explored, path: solved.path, warn: lookalike };
}

/* Can it be played badly and still finished? No merge can be wrong here, so
   what is being tested is whether careless shuffling can deadlock the shelf.

   "Carelessly" is the word that matters, and this used to model it as picking
   uniformly among every legal move — which on a seven-jar shelf means tipping
   colours into the last empty jar for no reason, over and over. That is not
   careless play, it is adversarial, and it gets harsher the bigger the board
   gets regardless of whether a person would ever struggle: twenty-eight boards
   in a row at the right par were turned down without one surviving. The
   campaign's own check has always played semi-sensibly for exactly this
   reason. This one now does the same — take the target when it is there,
   otherwise usually do something with a point to it, and only sometimes
   squander a jar. */
let rs = 4242;
const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };

function survivable(lvl, trials) {
  for (let t = 0; t < trials; t++) {
    const g = new Game(lvl);
    for (let step = 1; step <= 80 && !g.won; step++) {
      const ids = g.jars.map(j => j.id);
      const legal = [];
      for (const f of ids) for (const to of ids.concat(['main'])) {
        if (f !== to && g.pourable(f, to)) legal.push([f, to]);
      }
      if (!legal.length) return false;

      /* Into the big jar whenever that is on offer. */
      let pool = legal.filter(m => m[1] === 'main');

      if (!pool.length) {
        /* Otherwise a move that does something: a merge, or a colour landing
           on its own kind. Squandering an empty jar is left to the one time in
           four when nothing better is picked. */
        const useful = legal.filter(m => {
          if (m[1] === 'main') return false;
          const to = g.get(m[1]);
          return to.cells.length > 0;            /* merge, or stacking on like */
        });
        pool = useful.length && rnd() < 0.75 ? useful : legal;
      }

      const mv = pool[Math.floor(rnd() * pool.length)];
      g.pour(mv[0], mv[1]);
      if (step % 6 === 0 && !g.won) {
        const r = M.solve(g.position(), 300000, 3000);
        if (!r.budgetExceeded && r.par == null) return false;
      }
    }
  }
  return true;
}

/* ── build ─────────────────────────────────────────────────────────────── */

const OUT = path.join(__dirname, '..', 'js', 'merge-levels.js');
/* Always read the file, even under --rebuild-all: the five taught levels are
   written by hand and no generator can produce them, so "rebuild everything"
   has to mean "deal every level that was dealt", not "start from nothing".
   Emptying this map outright used to leave the taught levels unfindable and
   the build died claiming they were missing from a file that had them. */
const EXISTING = (() => {
  try {
    require(OUT);
    return new Map(globalThis.MergeLevels.list.map(l => [l.id, l]));
  } catch (e) { return new Map(); }
})();

const ADJECTIVES = ['Stirred', 'Folded', 'Steeped', 'Tinted', 'Blended', 'Swirled',
                    'Clouded', 'Deepened', 'Layered', 'Muddled', 'Wound', 'Sunken',
                    'Threaded', 'Scattered', 'Buried', 'Knotted', 'Split', 'Braided',
                    'Fractured', 'Distilled',
                    'Churned', 'Marbled', 'Streaked', 'Riddled', 'Tangled',
                    'Sifted', 'Strewn', 'Warped', 'Lodged', 'Ravelled',
                    'Sundered', 'Flooded', 'Winnowed', 'Harrowed', 'Shattered',
                    'Interleaved', 'Combed', 'Sieved', 'Decanted', 'Scrambled',
                    'Unspooled', 'Overlaid', 'Entwined', 'Meshed', 'Roiled',
                    /* Levels 51-100 need their own, because the list is
                       indexed by level and 45 names cannot cover 95 dealt
                       levels without handing level 51 the name on level 6. */
                    'Submerged', 'Quenched', 'Sedimented', 'Undertowed',
                    'Silted', 'Drowned', 'Fathomed', 'Plumbed', 'Sounded',
                    'Trawled', 'Dredged', 'Cascaded', 'Eddied', 'Whirled',
                    'Sluiced', 'Percolated', 'Infused', 'Macerated', 'Steeled',
                    'Tempered', 'Annealed', 'Quarried', 'Seamed', 'Veined',
                    'Stranded', 'Coiled', 'Spiralled', 'Helixed', 'Latticed',
                    'Compounded', 'Confounded', 'Bewildered', 'Labyrinthine',
                    'Serpentine', 'Byzantine', 'Convoluted', 'Impacted',
                    'Congested', 'Gridlocked', 'Wedged', 'Jammed', 'Clotted',
                    'Snarled', 'Bristling', 'Thorned', 'Barbed', 'Cragged',
                    'Riven', 'Cloven', 'Sheared', 'Splintered', 'Fissured',
                    'Crazed', 'Webbed', 'Filigreed', 'Damascened',
                    /* Levels 101-150. */
                    'Alloyed', 'Amalgamated', 'Retempered', 'Requenched',
                    'Vitrified', 'Glazed', 'Enamelled', 'Lacquered', 'Varnished',
                    'Pigmented', 'Saturated', 'Suffused', 'Imbued', 'Permeated',
                    'Decocted', 'Reduced', 'Concentrated', 'Condensed', 'Rendered',
                    'Emulsified', 'Colloidal', 'Suspended', 'Precipitated', 'Settled',
                    'Stratified', 'Ribboned', 'Laminated', 'Interlaced', 'Plied',
                    'Cabled', 'Twisted', 'Corded', 'Roped', 'Hawsered',
                    'Anchored', 'Moored', 'Fastened', 'Riveted', 'Welded',
                    'Fused', 'Bonded', 'Cemented', 'Mortared', 'Grouted',
                    'Immured', 'Entombed', 'Sepulchral', 'Unyielding', 'Final'];

/* 95 levels are dealt and the list is indexed by level, so a short list would
   silently start repeating rather than fail. Say so here instead. */
if (ADJECTIVES.length < TOTAL - TAUGHT) {
  throw new Error('ADJECTIVES has ' + ADJECTIVES.length + ' names, ' +
    (TOTAL - TAUGHT) + ' dealt levels need naming');
}

const built = [];
const warnings = [];

/* Everything already on disk is read back and re-verified rather than dealt
   again: the five taught levels, which a generator could not produce anyway,
   and the whole of the first ramp, whose boards people have progress against.
   Verifying is also the stronger check — it proves the levels that actually
   ship are sound, rather than that a fresh deal would have been. */
for (let n = 1; n <= TOTAL; n++) {
  if (REBUILD_ALL && n > TAUGHT) break;
  const id = 'merge-' + String(n).padStart(2, '0');
  const lvl = EXISTING.get(id);
  if (!lvl) break;
  const r = inspect(lvl);
  /* A level already shipped is reported on, not refused. Par being wrong means
     the file itself is wrong, so that still stops everything — but a board that
     has become unreadable because a colour was retuned under it is a known
     problem with a known fix, and being unable to add levels until somebody
     settles it helps nobody. Newly dealt boards are still held to the full
     standard; see inspect()'s strict mode. */
  if (r.bad) throw new Error(id + ' (' + lvl.name + '): ' + r.bad);
  if (r.warn) warnings.push(id + ' (' + lvl.name + '): ' + r.warn);
  if (r.par !== lvl.par) throw new Error(id + ': stored par ' + lvl.par + ', solver makes it ' + r.par);
  built.push(Object.assign({}, lvl, { path: r.path }));
  console.log('  ' + String(n).padStart(2) + '. ' + lvl.name.padEnd(18) +
    (n <= TAUGHT ? ' taught  ' : ' kept    ') +
    ' jars ' + lvl.jars.length + '  par ' + String(lvl.par).padStart(2) + '   (verified)');
}
if (built.length < TAUGHT) throw new Error('the taught levels are missing from ' + OUT);

/* The rest are dealt as a set and then put in order of the par the solver
   measured, the same way the campaign's later ramps are built: dealing in
   order decays, because one lucky board early sets a bar the shape cannot
   clear again. */
const floor = built[built.length - 1].par;
const firstToDeal = built.length + 1;
const wanted = TOTAL - firstToDeal + 1;

/* Sample, verify, keep. The pool is deliberately larger than the number of
   levels needed, so the ones that ship can be spread across the par range
   rather than being whatever happened to turn up.

   When every level already exists this whole stage is skipped: the run has
   then verified the file and re-emitted it, which is exactly what a rebuild
   with nothing new to add should do. Dealing them again instead would hand
   people different boards under the level numbers they have progress against,
   which is the one thing this tool must never do. */
const dealt = [];
if (wanted > 0) {
/* Which space to sample depends on the block being dealt, so a rebuild of the
   second ramp cannot accidentally deal it from the third ramp's shapes and
   hand level 26 a par-fifty board. */
const SPACE = firstToDeal > RAMP_THREE_END ? SPACE_FOUR
            : firstToDeal > RAMP_TWO_END   ? SPACE_THREE
            : SPACE_TWO;

/* The pool is normally larger than the number of levels needed, so the ones
   that ship can be spread across the par range rather than being whatever
   turned up. That only pays while there is a range to spread across. The
   fourth ramp spans four points of par and yields about one board every two
   minutes, so a 60% surplus would cost an extra hour to choose between boards
   that are, by par, the same board. There it takes what it finds. */
const POOL_TARGET = Math.round(wanted * (SPACE === SPACE_FOUR ? 1.05 : 1.6));
const POOL_MINUTES = Number(process.env.MERGE_POOL_MINUTES || 45);

const pool = [];
const rand = rng(0xC0FFEE);
let tried = 0, tooEasy = 0, fragile = 0;
const rejected = Object.create(null);
const until = Date.now() + POOL_MINUTES * 60000;

while (pool.length < POOL_TARGET && Date.now() < until) {
  const cfg = sampleShape(rand, SPACE);
  if (!cfg) continue;
  const board = deal(cfg, rand);
  if (!board || board.jars.length !== cfg.sideJars) continue;
  tried++;

  if (tried % 50 === 0) {
    const why = Object.keys(rejected).sort((a, b) => rejected[b] - rejected[a])
      .map(k => rejected[k] + ' ' + k).join(', ');
    console.log('     ' + tried + ' tried, ' + pool.length + ' kept  |  ' +
      tooEasy + ' not hard enough, ' + fragile + ' deadlock too easily' +
      (why ? ', ' + why : ''));
  }

  const r = inspect(board, true);
  if (r.bad) {
    /* Tallied by the reason the board actually gave. Lumping every rejection
       under one label sent me hunting a search problem that was not there. */
    const key = r.bad.replace(/\b(red|orange|yellow|green|teal|blue|purple|magenta|white|slate)\b/g, '…')
                     .replace(/\d+/g, 'n');
    rejected[key] = (rejected[key] || 0) + 1;
    continue;
  }
  if (r.par <= floor) { tooEasy++; continue; }
  if (!survivable(board, 4)) { fragile++; continue; }

  pool.push({ board, par: r.par, states: r.states, path: r.path });
  if (true) {
    console.log('     pool ' + pool.length + '/' + POOL_TARGET +
      '  (par ' + Math.min(...pool.map(p => p.par)) + '-' + Math.max(...pool.map(p => p.par)) + ')' +
      '  from ' + tried + ' boards: ' +
      tooEasy + ' not hard enough, ' + fragile + ' too easily deadlocked' +
      '  [' + Math.round((Date.now() - (until - POOL_MINUTES * 60000)) / 60000) + ' min]');
  }
}

if (pool.length < wanted) {
  throw new Error('only ' + pool.length + ' boards passed, ' + wanted + ' needed — ' +
    'give it longer with MERGE_POOL_MINUTES, or widen SPACE');
}

/* Spread the chosen levels across the par the pool actually reached, so the
   climb uses the whole range rather than bunching at whatever par was easiest
   to find. */
pool.sort((a, b) => a.par - b.par);
for (let i = 0; i < wanted; i++) {
  /* wanted === 1 would divide by zero; take the hardest board in that case. */
  dealt.push(wanted === 1 ? pool[pool.length - 1]
                          : pool[Math.round(i * (pool.length - 1) / (wanted - 1))]);
}

console.log('\n  pool of ' + pool.length + ' spanning par ' + pool[0].par + '-' + pool[pool.length - 1].par +
  '; ' + wanted + ' taken across that range\n');

dealt.sort((a, b) => a.par - b.par);
dealt.forEach((pick, i) => {
  const level = firstToDeal + i;
  const colour = C.name(pick.board.target);
  built.push({
    id: 'merge-' + String(level).padStart(2, '0'),
    mode: 'merge',
    /* Keyed to the level, not to this run's position in the dealt set — with
       the first ramp now read back rather than rebuilt, i restarts at zero
       and would hand levels 26 onwards the names already on levels 6-25. */
    name: ADJECTIVES[(level - FIRST_DEALT) % ADJECTIVES.length] + ' ' +
          colour.charAt(0).toUpperCase() + colour.slice(1),
    teaches: pick.board.jars.length + ' jars · ' + pick.par + ' moves',
    brief: '',
    target: pick.board.target,
    parents: pick.board.parents,
    main: { cap: pick.board.main.cap },
    par: pick.par,
    path: pick.path,
    jars: pick.board.jars.map(j => ({ cap: j.cap, fills: j.fills }))
  });
  console.log('  ' + String(level).padStart(2) + '. ' + built[built.length - 1].name.padEnd(18) +
    ' dealt    jars ' + pick.board.jars.length + '  par ' + String(pick.par).padStart(2) +
    '  (' + pick.states + ' states)');
});
} else {
  console.log('\n  all ' + TOTAL + ' levels already exist and verified; nothing to deal\n');
}

/* ── emit ──────────────────────────────────────────────────────────────── */

const body = built.map((l, i) => {
  const jars = l.jars.map(j => '        { cap: ' + j.cap + ', fills: [' +
    j.fills.map(f => "'" + f + "'").join(', ') + '] }').join(',\n');
  return '    {\n' +
    "      id: '" + l.id + "',\n" +
    "      mode: 'merge',\n" +
    "      name: '" + l.name.replace(/'/g, "\\'") + "',\n" +
    "      subtitle: 'Level " + (i + 1) + " of " + TOTAL + "',\n" +
    "      teaches: '" + l.teaches.replace(/'/g, "\\'") + "',\n" +
    '      brief: ' + JSON.stringify(l.brief || '') + ',\n' +
    "      target: '" + l.target + "',\n" +
    (l.parents ? "      parents: ['" + l.parents.join("', '") + "'],\n" : '') +
    '      main: { cap: ' + l.main.cap + ' },\n' +
    '      par: ' + l.par + ',\n' +
    '      path: [' + l.path.map(m => '[' + m.from + ',' + m.to + ']').join(', ') + '],\n' +
    '      jars: [\n' + jars + '\n      ]\n' +
    '    }';
}).join(',\n');

fs.writeFileSync(OUT, `/* merge-levels.js — GENERATED by tools/make-merge-levels.js.
 *
 * The first ${TAUGHT} are written by hand, one lesson each, and are carried through
 * every rebuild untouched. The rest are dealt along a widening curve and kept
 * only if the search can finish them quickly enough to answer a hint, their
 * par rises on the level before, and careless play cannot deadlock them.
 *
 * Only the two parents of the target ever appear as mixable colours, so no
 * wrong merge is possible: everything else on the shelf is inert.
 *
 * par is the true fewest moves. Jar fills are listed BOTTOM first. */
(function (global) {
  'use strict';

  var LEVELS = [
${body}
  ];

  global.MergeLevels = {
    list: LEVELS,
    byId: function (id) {
      for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i];
      return null;
    },
    indexOf: function (id) {
      for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return i;
      return -1;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
`);

if (warnings.length) {
  console.log('\n' + warnings.length + ' level(s) already on disk have a problem this build did not cause:');
  warnings.forEach(w => console.log('  ' + w));
}

console.log('\nwrote js/merge-levels.js — ' + built.length + ' levels, par ' +
  built[0].par + ' to ' + built[built.length - 1].par);
