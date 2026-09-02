/* generator.js — builds random puzzles at easy / normal / hard.
 *
 * Deals the liquid out at random, then hands the result to the solver. A
 * puzzle is kept only if the solver can finish it AND the fewest-moves count
 * lands in the band set for that difficulty — so par is always the genuine
 * optimum, and "hard" means measurably more moves rather than just more jars. */
(function (global) {
  'use strict';

  var C = global.Colour;

  /* Jar counts are 3, 6, 10, 16 across the four settings — a shelf that
     visibly doubles each step rather than creeping up by one or two. Classic
     can afford that because its bound is near-exact, so a sixteen-jar board
     deals in about 11ms and the solver settles it immediately; measured over
     eight deals a step, the worst deal at sixteen jars was 22ms.

     Par is deliberately not pushed to the ceiling. Sixteen jars eight deep
     with a big jar of thirty reaches par 62-76, which is campaign territory
     and too much to hand somebody who tapped "new puzzle" — so Extra Hard
     takes the same sixteen jars at six deep and lands at 39-48. The width is
     the step up; the length of the solution is not. */
  var DIFFICULTY = {
    easy: {
      label: 'Easy',
      blurb: 'Three jars, two colors in the way, and room to work.',
      mainCap: 3, sideJars: 3, sideCap: 4, fillers: 2, fillerUnits: 5, par: [4, 8]
    },
    normal: {
      label: 'Normal',
      blurb: 'Six jars and three colors, with less spare space to park them.',
      mainCap: 6, sideJars: 6, sideCap: 5, fillers: 3, fillerUnits: 14, par: [9, 17]
    },
    hard: {
      label: 'Hard',
      blurb: 'Nine jars, five colors, and the target buried right down.',
      mainCap: 12, sideJars: 10, sideCap: 6, fillers: 5, fillerUnits: 28,
      burial: 0.55, par: [21, 36],
      /* The width the shelf opens on, which is no longer the same thing as the
         width the preset describes. sideJars is the shape dealt when a board is
         asked for at exactly that width -- the campaign does that -- while this
         is what the Random screen hands a player who picks the setting. */
      defaultJars: 9
    },
    /* Wide rather than deep on purpose:
       six deep keeps the bands legible on a phone, and the spare capacity is
       what stops an ordinary run of careless moves leaving the board
       unwinnable. Fourteen rather than sixteen: the search is happy either way,
       but fourteen is where the shelf still reads as a shelf on a phone. */
    extraHard: {
      label: 'Extra Hard',
      blurb: 'Twelve jars, seven colors, and a big jar that takes some filling.',
      mainCap: 16, sideJars: 14, sideCap: 6, fillers: 7, fillerUnits: 40,
      burial: 0.6, sizeUp: 600, par: [32, 48],
      /* Twelve on the Random screen, leaving the full fourteen to Expert so
         the last step up is a step in something. */
      defaultJars: 12
    },
    /* The same fourteen jars, a unit deeper. Depth rather than width, because
       width has run out: fourteen is where the shelf still reads as a shelf on
       a phone, while depth had never been used at all -- every other setting
       takes the jar height it ships with, four to six.

       Seven deep and not nine, and the reason is the browser rather than the
       search or even the screen. Measured by dealing through the Random screen
       at 390px: with Safari's chrome taking 145px, six and seven deep show the
       whole shelf clear of the toolbar, while eight and nine push a row under
       the buttons and make the shelf scroll. On the full 844px all four fit.
       Seven is what fits the phone people actually hold.

       98 cells against Extra Hard's 84, and par follows the unit count as it
       always does: about 50 against 35, on a big jar of nineteen. The jar comes
       out the same size Extra Hard gets -- around 78 to 97px depending on the
       window -- holding more lines rather than standing taller, which is the
       whole point of turning depth instead of width. */
    expert: {
      label: 'Expert',
      blurb: 'Fourteen jars seven deep, and a big jar taking nineteen.',
      mainCap: 19, sideJars: 14, sideCap: 7, fillers: 7, fillerUnits: 47,
      burial: 0.6, sizeUp: 250000, par: [40, 58]
    }
  };

  /* Two colours closer than this are too easily confused to use together. */
  var MIN_GAP = 150;

  /* Ceiling on the search when sizing up a candidate deal. Proving a board
     CANNOT be finished is the expensive case — there is no goal for the
     search to home in on, so it has to exhaust the space, and on a nine-jar
     shelf that takes seconds. Generation never needs that proof: a deal it
     cannot settle quickly is simply thrown back. Boards that do work are
     settled in a few thousand states, far inside this. */
  var SIZE_UP_BUDGET = 2500;

  /* Deeper jars make each abandoned deal more expensive to give up on, so the
     deepest setting gives up sooner. It costs nothing: the boards that come
     out have the same spread of par either way, it simply stops sooner on the
     ones that were never going to work. Kept per setting rather than lowered
     across the board so the other three still deal exactly what they did
     before for a given seed. */

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(rand, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* A target plus n fillers, no two of them close in appearance. */
  function pickColours(rand, n) {
    var pool = shuffle(rand, C.KEYS);
    var chosen = [];
    for (var i = 0; i < pool.length && chosen.length < n + 1; i++) {
      var ok = true;
      for (var j = 0; j < chosen.length; j++) {
        if (C.distance(pool[i], chosen[j]) < MIN_GAP) { ok = false; break; }
      }
      if (ok) chosen.push(pool[i]);
    }
    return chosen.length === n + 1 ? chosen : null;
  }

  function attempt(cfg, rand) {
    var colours = pickColours(rand, cfg.fillers);
    if (!colours) return null;

    var target = colours[0];
    var fillers = colours.slice(1);

    /* Every unit of the target has to end up in the big jar, so there is
       exactly a jarful of it and not a drop more. */
    var units = [];
    var i;
    for (i = 0; i < cfg.mainCap; i++) units.push(target);

    /* Spread the filler across its colours, at least one unit each. */
    var counts = new Array(fillers.length).fill(1);
    for (i = fillers.length; i < cfg.fillerUnits; i++) counts[Math.floor(rand() * fillers.length)]++;
    for (i = 0; i < fillers.length; i++) {
      for (var k = 0; k < counts[i]; k++) units.push(fillers[i]);
    }

    /* Deal at random into jars that still have room. */
    var jars = [];
    for (i = 0; i < cfg.sideJars; i++) jars.push({ cap: cfg.sideCap, fills: [] });

    /* burial nudges the target towards the front of the deck, and so towards
       the bottom of the jars, leaving more on top of it to clear away.
       
       It is not only a difficulty knob. Simply adding jars barely raises par,
       because extra jars bring extra room to work in; burying the target
       raises it properly. And because more of the deals it produces land in
       the intended range, far fewer are dealt and thrown away — which is what
       keeps the largest boards quick to produce rather than the slowest. */
    var deck = cfg.burial
      ? units
          .map(function (u) { return { unit: u, order: rand() - (u === target ? cfg.burial : 0) }; })
          .sort(function (a, b) { return a.order - b.order; })
          .map(function (x) { return x.unit; })
      : shuffle(rand, units);
    for (i = 0; i < deck.length; i++) {
      var open = jars.filter(function (j) { return j.fills.length < j.cap; });
      if (!open.length) return null;

      /* churn steers a unit away from a jar already showing its colour, so
         colours settle in thin layers rather than gathering into blocks.
         
         It is the only lever that really raises par on a big board. Par counts
         pours, not units, so simply widening the shelf or enlarging the big
         jar changes little — the same liquid just arrives in fewer, larger
         runs. Breaking it up means more runs to deliver and more runs sitting
         in the way, which is what actually makes a board long.
         
         The cost is deadlock: a fragmented board is likelier to be
         unwinnable, so anything using churn needs more room spare to
         compensate. `cfg.churn &&` short-circuits so a setting without it
         draws no random number here and deals exactly as it did before. */
      var pool = open;
      if (cfg.churn && rand() < cfg.churn) {
        var mixed = open.filter(function (j) {
          return !j.fills.length || j.fills[j.fills.length - 1] !== deck[i];
        });
        if (mixed.length) pool = mixed;
      }
      pool[Math.floor(rand() * pool.length)].fills.push(deck[i]);
    }

    /* A jar showing the target on top from the start is a free move. A couple
       are fine; a board full of them is not a puzzle. The allowance scales
       with the shelf — on a nine-jar board a flat limit of one would throw
       away most deals, since more jars simply means more chances of it. */
    var freebies = jars.filter(function (j) {
      return j.fills.length && j.fills[j.fills.length - 1] === target;
    }).length;
    if (freebies > Math.max(1, Math.floor(cfg.sideJars / 3))) return null;

    return { target: target, main: { cap: cfg.mainCap }, jars: jars, colours: colours };
  }

  function generate(difficulty, seed) {
    var cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    if (seed == null) seed = (Math.random() * 0xFFFFFFFF) >>> 0;
    var rand = rng(seed);

    var level = null, solution = null;
    for (var tries = 0; tries < 600 && !level; tries++) {
      var candidate = attempt(cfg, rand);
      if (!candidate) continue;

      var result = global.Solver.solve({
        target: candidate.target,
        main: { capacity: candidate.main.cap, cells: [] },
        jars: candidate.jars.map(function (j, i) {
          return { id: 'jar' + i, capacity: j.cap, cells: j.fills.slice() };
        })
      }, cfg.sizeUp || SIZE_UP_BUDGET);

      if (result.budgetExceeded || result.par == null) continue;
      if (result.par < cfg.par[0] || result.par > cfg.par[1]) continue;

      level = candidate;
      solution = result;
    }

    if (!level) return fallback(difficulty, seed);

    level.id = 'random-' + difficulty + '-' + seed;
    level.difficulty = difficulty;
    level.seed = seed;
    level.par = solution.par;
    level.name = 'Collect the ' + C.name(level.target);
    level.subtitle = cfg.label + ' · seed ' + seed;
    level.brief = 'Fill the big jar with ' + C.name(level.target) +
                  '. Pour a color onto the same color, or into an empty jar.';
    level.hint = null;
    return level;
  }

  /* Only reachable if 600 deals in a row miss the par band. Small, always
     solvable, and clearly a puzzle rather than a broken board. */
  function fallback(difficulty, seed) {
    return {
      id: 'random-' + difficulty + '-' + seed,
      difficulty: difficulty, seed: seed, par: 3,
      name: 'Collect the red',
      subtitle: (DIFFICULTY[difficulty] || DIFFICULTY.normal).label + ' · seed ' + seed,
      brief: 'Fill the big jar with red. Pour a color onto the same color, or into an empty jar.',
      target: 'red',
      main: { cap: 4 },
      jars: [
        { cap: 4, fills: ['red', 'red', 'blue', 'blue'] },
        { cap: 4, fills: ['blue'] },
        { cap: 4, fills: ['red', 'red'] }
      ]
    };
  }

  global.Generator = { generate: generate, DIFFICULTY: DIFFICULTY };
})(typeof window !== 'undefined' ? window : globalThis);
