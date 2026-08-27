/* merge-generator.js — seeded random puzzles for Merge Colors.
 *
 * The same shape as generator.js: deal a board, ask the solver to finish it,
 * keep it only if it lands inside the setting's par band. What differs is the
 * construction and what limits it.
 *
 * Boards are built so that NO WRONG MERGE IS POSSIBLE. Only the two parents of
 * the target ever appear as mixable colours — the third primary is left out
 * entirely — so every merge a player can make produces the target, and no
 * careless pour can destroy a unit that was needed. Everything else on the
 * shelf is inert: it has no partner present, so it can only stack on its own
 * colour or sit in an empty jar. What is left to get wrong is space and order.
 *
 * The settings stop well short of the Sort Colors mode's hardest merge levels, and
 * deliberately. A random puzzle is dealt while somebody waits, and this mode's
 * search has no tight bound to lean on: the states climb steeply with the size
 * of the big jar, so a board that would be fine to ship after an overnight
 * build is not fine to deal on a tap. Every setting here settles in a few
 * thousand states. */
(function (global) {
  'use strict';

  var C = global.Colour, M = global.Merge;

  var DIFFICULTY = {
    easy: {
      label: 'Easy',
      blurb: 'Two colors to mix, four jars, and room to spare.',
      mainCap: 3, sideJars: 4, sideCap: 4, fillers: 1, fillerUnits: 4,
      burial: 0, churn: 0.1, par: [4, 9]
    },
    normal: {
      label: 'Normal',
      blurb: 'Five jars, the two colors spread about, and something in the way.',
      mainCap: 5, sideJars: 5, sideCap: 5, fillers: 2, fillerUnits: 6,
      burial: 0.3, churn: 0.3, par: [9, 16]
    },
    hard: {
      label: 'Hard',
      blurb: 'Six jars, with what you need buried and split into thin layers.',
      mainCap: 6, sideJars: 6, sideCap: 5, fillers: 3, fillerUnits: 7,
      burial: 0.5, churn: 0.45, par: [15, 24]
    },
    /* Seven jars is as wide as this game's search reaches, so the rest of the
       step up comes from depth, a bigger jar to fill, and clutter.

       Clutter is the surprise: heaping five obstacle colours on and churning
       them hard makes these boards CHEAPER to deal, not dearer. The bound in
       merge.js counts every inert run sitting on a parent, so a shelf strewn
       with them is one the search can see the bottom of. Emptier seven-jar
       shapes with the same big jar were measured at three to fifty seconds a
       deal; this one takes about a fifth of a second and comes out harder. */
    extraHard: {
      label: 'Extra Hard',
      blurb: 'Seven deep jars, five colors in the way, and nothing left in one piece.',
      mainCap: 7, sideJars: 7, sideCap: 6, fillers: 5, fillerUnits: 14,
      burial: 0.6, churn: 0.65, par: [20, 30]
    }
  };

  /* Ceiling on the search while sizing up a deal. A board it cannot settle
     inside this is thrown back rather than waited for — there are always more
     deals, and the player is watching. */
  var SIZE_UP_BUDGET = 12000;

  /* Two colours closer than this are too easily confused to put on one shelf.
     The same figure generator.js uses, and enforced here for the same reason:
     the palette is meant to guarantee it, but a generator that assumes the
     palette rather than checking it will happily deal a board nobody can
     read the moment a colour is retuned. */
  var MIN_GAP = 150;

  function farEnough(colour, chosen) {
    for (var i = 0; i < chosen.length; i++) {
      if (C.distance(colour, chosen[i]) < MIN_GAP) return false;
    }
    return true;
  }

  /* Only the primaries mix, so a target is always one of the three
     secondaries, and its two parents come with it. */
  function targets() {
    return M.RECIPES.map(function (r) { return { target: r.makes, a: r.a, b: r.b }; });
  }

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function deal(cfg, rand) {
    var picks = targets();
    var pick = picks[Math.floor(rand() * picks.length)];

    var primaries = {};
    M.RECIPES.forEach(function (r) { primaries[r.a] = true; primaries[r.b] = true; });

    /* Anything with no partner on the shelf is inert and safe as an obstacle.
       The third primary is excluded so no rival recipe can exist. */
    var pool = C.KEYS.filter(function (k) {
      return k !== pick.target && k !== pick.a && k !== pick.b && !primaries[k];
    });

    /* Every colour that will share the shelf has to be told apart from every
       other, the target and its parents included. */
    var chosen = [pick.target, pick.a, pick.b];
    var fillers = [];
    while (fillers.length < cfg.fillers && pool.length) {
      var take = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      if (!farEnough(take, chosen)) continue;
      chosen.push(take);
      fillers.push(take);
    }
    if (fillers.length < cfg.fillers) return null;

    /* Exactly one jarful of target can be made and every drop of it is
       needed: one of each parent per unit of target, and not a unit more. */
    var units = [], i, k;
    for (i = 0; i < cfg.mainCap; i++) { units.push(pick.a); units.push(pick.b); }

    var counts = [];
    for (i = 0; i < fillers.length; i++) counts.push(1);
    for (i = fillers.length; i < cfg.fillerUnits; i++) {
      counts[Math.floor(rand() * fillers.length)]++;
    }
    for (i = 0; i < fillers.length; i++) {
      for (k = 0; k < counts[i]; k++) units.push(fillers[i]);
    }

    var jars = [];
    for (i = 0; i < cfg.sideJars; i++) jars.push({ cap: cfg.sideCap, fills: [] });

    /* burial pushes the parents towards the bottom, so there is more to clear
       away before they can be brought together. */
    var deck = units.map(function (u) {
      return { unit: u, order: rand() - ((u === pick.a || u === pick.b) ? (cfg.burial || 0) : 0) };
    }).sort(function (x, y) { return x.order - y.order; })
      .map(function (x) { return x.unit; });

    for (i = 0; i < deck.length; i++) {
      var open = jars.filter(function (j) { return j.fills.length < j.cap; });
      if (!open.length) return null;
      var choice = open;
      /* churn steers a unit away from a jar already showing its colour, so the
         parents settle in thin layers and take more pours to gather. */
      if (cfg.churn && rand() < cfg.churn) {
        var mixed = open.filter(function (j) {
          return !j.fills.length || j.fills[j.fills.length - 1] !== deck[i];
        });
        if (mixed.length) choice = mixed;
      }
      choice[Math.floor(rand() * choice.length)].fills.push(deck[i]);
    }

    /* The board says which rules it is played by, and every caller needs that:
       an Engine built without it plays the ordinary game and refuses every
       merge, which reads as the solver producing illegal moves. */
    return { mode: 'merge', target: pick.target, parents: [pick.a, pick.b],
             main: { cap: cfg.mainCap }, jars: jars };
  }

  function generate(difficulty, seed) {
    var cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    if (seed == null) seed = (Math.random() * 0xFFFFFFFF) >>> 0;
    var rand = rng(seed);

    var level = null, solved = null;
    for (var tries = 0; tries < 400 && !level; tries++) {
      var candidate = deal(cfg, rand);
      if (!candidate) continue;

      var result = M.solve({
        target: candidate.target,
        main: { capacity: candidate.main.cap, cells: [] },
        jars: candidate.jars.map(function (j, i) {
          return { id: 'jar' + i, capacity: j.cap, cells: j.fills.slice() };
        })
      }, cfg.sizeUp || SIZE_UP_BUDGET);

      if (result.budgetExceeded || result.par == null) continue;
      if (result.par < cfg.par[0] || result.par > cfg.par[1]) continue;

      level = candidate;
      solved = result;
    }

    if (!level) return fallback(difficulty, seed);

    level.id = 'merge-random-' + difficulty + '-' + seed;
    level.mode = 'merge';
    level.difficulty = difficulty;
    level.seed = seed;
    level.par = solved.par;
    /* The opening hint is the dearest one to work out and it has just been
       worked out, so keep it — the same trick the built levels use. */
    level.path = solved.path.map(function (m) { return [m.from, m.to]; });
    level.name = 'Make the ' + C.name(level.target);
    level.subtitle = cfg.label + ' · seed ' + seed;
    level.brief = 'There is no ' + C.name(level.target) + ' on the shelf — mix ' +
                  C.name(level.parents[0]) + ' and ' + C.name(level.parents[1]) +
                  ' to make it, then fill the big jar.';
    return level;
  }

  /* Only reachable if 400 deals in a row miss the par band. Small, always
     solvable, and clearly a puzzle rather than a broken board. */
  function fallback(difficulty, seed) {
    return {
      id: 'merge-random-' + difficulty + '-' + seed,
      mode: 'merge', difficulty: difficulty, seed: seed, par: 2,
      name: 'Make the purple',
      subtitle: (DIFFICULTY[difficulty] || DIFFICULTY.normal).label + ' · seed ' + seed,
      brief: 'There is no purple on the shelf — mix red and blue to make it, ' +
             'then fill the big jar.',
      target: 'purple',
      parents: ['red', 'blue'],
      main: { cap: 2 },
      path: [[0, 1], [1, -1]],
      jars: [
        { cap: 4, fills: ['red', 'red'] },
        { cap: 4, fills: ['blue', 'blue'] }
      ]
    };
  }

  global.MergeGenerator = { generate: generate, deal: deal, rng: rng, DIFFICULTY: DIFFICULTY };
})(typeof window !== 'undefined' ? window : globalThis);
