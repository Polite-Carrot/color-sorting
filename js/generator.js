/* generator.js — builds random puzzles at easy / normal / hard.
 *
 * Deals the liquid out at random, then hands the result to the solver. A
 * puzzle is kept only if the solver can finish it AND the fewest-moves count
 * lands in the band set for that difficulty — so par is always the genuine
 * optimum, and "hard" means measurably more moves rather than just more jars. */
(function (global) {
  'use strict';

  var C = global.Colour;

  var DIFFICULTY = {
    easy: {
      label: 'Easy',
      blurb: 'Six jars, three colours in the way, and room to work.',
      mainCap: 5, sideJars: 6, sideCap: 4, fillers: 3, fillerUnits: 10, par: [5, 10]
    },
    normal: {
      label: 'Normal',
      blurb: 'Seven jars and four colours, with less spare space to park them.',
      mainCap: 7, sideJars: 7, sideCap: 5, fillers: 4, fillerUnits: 17, par: [11, 17]
    },
    hard: {
      label: 'Hard',
      blurb: 'Nine jars, six colours, and the target buried right down.',
      mainCap: 10, sideJars: 9, sideCap: 6, fillers: 6, fillerUnits: 30, par: [18, 28]
    },
    extraHard: {
      label: 'Extra Hard',
      blurb: 'Eleven jars, seven colours, and a big jar that takes some filling.',
      mainCap: 14, sideJars: 11, sideCap: 6, fillers: 7, fillerUnits: 40,
      burial: 0.6, par: [28, 42]
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
      open[Math.floor(rand() * open.length)].fills.push(deck[i]);
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
      }, SIZE_UP_BUDGET);

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
                  '. Pour a colour onto the same colour, or into an empty jar.';
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
      brief: 'Fill the big jar with red. Pour a colour onto the same colour, or into an empty jar.',
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
