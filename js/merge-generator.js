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
 * The settings stop well short of the Merge Colors campaign's hardest levels, and
 * deliberately. A random puzzle is dealt while somebody waits, and this mode's
 * search has no tight bound to lean on: the states climb steeply with the size
 * of the big jar, so a board that would be fine to ship after an overnight
 * build is not fine to deal on a tap. Every setting here settles in a few
 * thousand states. */
(function (global) {
  'use strict';

  var C = global.Colour, M = global.Merge;

  /* Easy and Normal take the 3 and 6 jars the classic mode uses. Hard deals
     at seven. Extra Hard opens at ten, stepping down to a seven-jar shape if
     the player narrows the shelf — sideJars stays seven so that board is the
     one they get.

     Merge has no tight lower bound, so cost climbs with the branching factor
     and width drives it. A random puzzle is dealt while somebody waits, so
     what matters is a whole deal end to end, retries included:

       7 jars, 6 deep, main 6      par 22-27      169ms      worst 499ms
       8 jars, 5 deep, main 4      par 11-19       89ms      worst 195ms
       8 jars, 5 deep, main 5      par 14-20      498ms     worst 2669ms
       8 jars, 6 deep, main 4      par 14-20     4135ms    worst 11067ms
       8 jars, 6 deep, main 5      par 14-20    16624ms   worst 106296ms

     Eight jars is affordable only with a target so small the board comes out
     EASIER than seven — par 11-19 against 22-27 — and the moment depth is
     added to win that back, a deal takes seconds. Ten jars needs a target of
     four or less and still costs a second and a half; eleven, twelve and
     sixteen produce nothing at all inside 200,000 states.

     Those numbers were taken before the search grew a heap and a weight, and
     the weight is what moved the ceiling: a wide board no longer has to have
     its par PROVEN, only found, so ten jars deals in 206ms median where it
     used to be hopeless. Extra Hard therefore opens on ten rather than seven.
     What it buys is width, not difficulty — ten jars has to stay five deep
     with a small target, and measured over forty deals that is par 18-31
     (median 24) against seven jars' 21-29 (median 26). The wider board reads
     as the bigger one and is a shade easier; the deep seven-jar board is
     still there a tap down the stepper for anyone who wants the longer
     solution.

     The tail is the cost: ten jars deals in 206ms median but 2511ms at the
     90th and 4170ms worst, against 139/488/977 at seven. The button says
     "Dealing…" throughout, so this is a wait rather than a fault.

     The other surprise in this mode still holds: heaping obstacle colours on
     and churning them hard makes a board CHEAPER to deal, because the bound
     counts every inert run sitting on a parent. */
  var DIFFICULTY = {
    easy: {
      label: 'Easy',
      blurb: 'Two colors to mix, three jars, and room to spare.',
      mainCap: 3, sideJars: 3, sideCap: 4, fillers: 1, fillerUnits: 4,
      burial: 0, churn: 0.1, par: [4, 11]
    },
    normal: {
      label: 'Normal',
      blurb: 'Six jars, the two colors spread about, and something in the way.',
      mainCap: 5, sideJars: 6, sideCap: 5, fillers: 3, fillerUnits: 9,
      burial: 0.3, churn: 0.35, par: [9, 20]
    },
    hard: {
      label: 'Hard',
      blurb: 'Seven jars, with what you need buried and split into thin layers.',
      mainCap: 5, sideJars: 7, sideCap: 5, fillers: 5, fillerUnits: 13,
      burial: 0.5, churn: 0.5, par: [14, 24]
    },
    extraHard: {
      label: 'Extra Hard',
      blurb: 'Ten jars, five colors in the way, and nothing left in one piece.',
      mainCap: 7, sideJars: 7, sideCap: 6, fillers: 5, fillerUnits: 14,
      burial: 0.6, churn: 0.65, par: [21, 30],
      /* The width the stepper opens on. sideJars is the shape dealt when the
         player picks that width exactly, so this is the only way to land them
         somewhere other than the preset's own shelf. */
      defaultJars: 10
    },
    /* Seven jars a unit deeper. Modest, and that is the ceiling rather than a
       choice: merge cannot widen past ten and cannot deepen much past this.

       Measured over ten deals at seven jars, eight deep reaches par 36 but the
       hint answers on only five of them -- a merge hint off the stored path is
       a live search, and half the boards are past what it can settle. Seven
       deep answers on nine of ten and costs 346ms against 907ms. So seven, and
       the step up over Extra Hard is real but small: par 28-36 against 21-30.
       If the mode is ever to get properly harder it needs a tighter bound, not
       a bigger board. */
    expert: {
      label: 'Expert',
      blurb: 'Seven jars seven deep, and everything in the way of everything.',
      mainCap: 8, sideJars: 7, sideCap: 7, fillers: 5, fillerUnits: 17,
      burial: 0.6, churn: 0.65, sizeUp: 250000, par: [28, 36]
    }
  };

  /* Ceiling on the search while sizing up a deal. A board it cannot settle
     inside this is thrown back rather than waited for — there are always more
     deals, and the player is watching. */
  var SIZE_UP_BUDGET = 12000;

  /* The widest shelf whose true shortest can still be proved while somebody
     waits. Past this the generator inflates the bound instead. */
  var PROVABLE_JARS = 7;

  /* What the bound is multiplied by once the true shortest is out of reach.
     Two: below that the wide boards were still over budget, and above it the
     answers drift further from the shortest for nothing. */
  var PUSH_WEIGHT = 2;

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

      var position = {
        target: candidate.target,
        main: { capacity: candidate.main.cap, cells: [] },
        jars: candidate.jars.map(function (j, i) {
          return { id: 'jar' + i, capacity: j.cap, cells: j.fills.slice() };
        })
      };

      /* Up to seven jars the true shortest is found quickly, so par stays the
         proven minimum it has always been. Past that the search cannot prove
         anything in the time somebody will wait, so the bound is inflated: the
         search then dives for a good solution instead of proving the best one.

         The width decides it rather than trying and failing. Falling back only
         after weight 1 gives up sounds tidier but pays the whole timeout
         first — measured at nine jars, 5.4s a deal that way against 9ms when
         the weight is chosen up front.

         Measured on ten-jar boards: over budget at weight 1, 1.3 and 1.6;
         solved at weight 2 in 176ms to 1.4s. What comes back is a real
         solution — it is replayed through the engine before shipping — and a
         weighted search is never worse than `weight` times the shortest. So
         par on a wide board means "the best this found", not "the fewest
         possible". */
      var wide = candidate.jars.length > PROVABLE_JARS;
      var result = M.solve(position, (cfg.sizeUp || SIZE_UP_BUDGET) * (wide ? 4 : 1),
                           null, wide ? PUSH_WEIGHT : 1);

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
