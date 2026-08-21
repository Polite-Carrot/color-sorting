/* generator.js — builds random puzzles at easy / normal / hard.
 *
 * Puzzles are built backwards from a known answer: pick the recipe first,
 * then scatter it across jars and bury it in decoys. That guarantees every
 * generated puzzle is solvable, and gives us a hint path for free. */
(function (global) {
  'use strict';

  var C = global.Colour;

  var DIFFICULTY = {
    easy: {
      label: 'Easy',
      blurb: 'Two colours, tidy amounts, one decoy.',
      mainCap: 6, parts: [2, 2], sourceJars: 4, decoys: 1, premix: 0, spare: 1, jarCap: 6
    },
    normal: {
      label: 'Normal',
      blurb: 'Up to three colours, split jars and a pre-mix.',
      mainCap: 8, parts: [2, 3], sourceJars: 5, decoys: 1, premix: 1, spare: 2, jarCap: 6
    },
    hard: {
      label: 'Hard',
      blurb: 'Four colours, several pre-mixes and plenty of spare liquid.',
      mainCap: 12, parts: [3, 4], sourceJars: 7, decoys: 2, premix: 2, spare: 3, jarCap: 8
    }
  };

  var POOL = ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'teal', 'pink', 'white'];

  /* mulberry32 — small seeded PRNG so a puzzle can be replayed from its seed. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randInt(rand, lo, hi) { return lo + Math.floor(rand() * (hi - lo + 1)); }
  function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }

  function shuffle(rand, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* Random positive integers of length n summing to total. */
  function composition(rand, total, n) {
    var counts = new Array(n).fill(1);
    var left = total - n;
    while (left > 0) {
      counts[Math.floor(rand() * n)]++;
      left--;
    }
    return counts;
  }

  function jarVolume(spec) {
    return spec.fills.reduce(function (n, f) { return n + f[1]; }, 0);
  }

  function jarColour(spec) {
    return C.mixAll(spec.fills);
  }

  function attempt(cfg, rand) {
    var partCount = randInt(rand, cfg.parts[0], cfg.parts[1]);
    var colours = shuffle(rand, POOL).slice(0, partCount);
    var counts = composition(rand, cfg.mainCap, partCount);

    /* A recipe dominated by one colour is barely a mix. */
    for (var i = 0; i < counts.length; i++) {
      if (counts[i] > cfg.mainCap - partCount + 1 - 1 && partCount > 1 && counts[i] >= cfg.mainCap - 1) return null;
    }

    var recipe = colours.map(function (c, i) { return [c, counts[i]]; });
    var target = C.mixAll(recipe);

    /* Reject targets that a single pure colour already matches — the puzzle
     * should always need mixing. */
    for (var p = 0; p < POOL.length; p++) {
      if (C.distance(target, C.parse(POOL[p])) < 26) return null;
    }

    /* One chunk per colour, then split chunks until we have enough jars. */
    var chunks = recipe.map(function (r) { return { colour: r[0], units: r[1] }; });
    var wanted = cfg.sourceJars - cfg.decoys + cfg.premix;
    var guard = 0;
    while (chunks.length < wanted && guard++ < 60) {
      var candidates = chunks.filter(function (c) { return c.units >= 2; });
      if (!candidates.length) break;
      var victim = pick(rand, candidates);
      var take = randInt(rand, 1, victim.units - 1);
      victim.units -= take;
      chunks.push({ colour: victim.colour, units: take });
    }
    if (chunks.length < wanted - 1) return null;

    /* Turn each chunk into a jar that must be poured in full. */
    var jars = chunks.map(function (c) {
      return { cap: cfg.jarCap, fills: [[c.colour, c.units]], need: c.units };
    });

    /* Pre-mix a few pairs: harder to read, still poured in full. */
    for (var m = 0; m < cfg.premix; m++) {
      var pairs = [];
      for (var a = 0; a < jars.length; a++) {
        for (var b = a + 1; b < jars.length; b++) {
          if (jars[a].fills.length + jars[b].fills.length > 2) continue;
          if (jars[a].fills[0][0] === jars[b].fills[0][0]) continue;
          if (jarVolume(jars[a]) + jarVolume(jars[b]) > cfg.jarCap) continue;
          pairs.push([a, b]);
        }
      }
      if (!pairs.length) break;
      var chosen = pick(rand, pairs);
      var ja = jars[chosen[0]], jb = jars[chosen[1]];
      var merged = { cap: cfg.jarCap, fills: ja.fills.concat(jb.fills), need: ja.need + jb.need };
      jars.splice(chosen[1], 1);
      jars.splice(chosen[0], 1, merged);
    }

    /* Spare liquid, so the amounts are not simply "empty every jar". */
    var spareLeft = cfg.spare;
    guard = 0;
    while (spareLeft > 0 && guard++ < 40) {
      var pure = jars.filter(function (j) { return j.fills.length === 1 && jarVolume(j) < j.cap; });
      if (!pure.length) break;
      var jar = pick(rand, pure);
      jar.fills[0][1] += 1;
      spareLeft--;
    }

    /* Decoys in colours the recipe never uses. */
    var unused = POOL.filter(function (c) { return colours.indexOf(c) === -1; });
    var decoyCount = Math.max(cfg.decoys, cfg.sourceJars - jars.length);
    for (var d = 0; d < decoyCount && unused.length; d++) {
      var colour = unused.splice(Math.floor(rand() * unused.length), 1)[0];
      jars.push({
        cap: cfg.jarCap,
        fills: [[colour, randInt(rand, 2, cfg.jarCap - 1)]],
        need: 0
      });
    }

    /* A jar that on its own equals the answer would make this a one-tap puzzle. */
    for (var k = 0; k < jars.length; k++) {
      if (jars[k].need >= cfg.mainCap && C.distance(jarColour(jars[k]), target) <= C.TOLERANCE) return null;
    }

    jars = shuffle(rand, jars);

    var solution = [];
    for (var s = 0; s < jars.length; s++) {
      if (jars[s].need > 0) solution.push({ jar: s, units: jars[s].need });
    }

    /* Final check: does the recorded answer actually land on the target? */
    var poured = solution.map(function (st) { return [jarColour(jars[st.jar]), st.units]; });
    var total = solution.reduce(function (n, st) { return n + st.units; }, 0);
    if (total !== cfg.mainCap) return null;
    if (C.distance(C.mixAll(poured), target) > 1e-6) return null;
    for (var v = 0; v < jars.length; v++) {
      if (jarVolume(jars[v]) > jars[v].cap) return null;
      if (jarVolume(jars[v]) < (jars[v].need || 0)) return null;
    }

    return {
      main: { cap: cfg.mainCap },
      target: recipe,
      drain: true,
      jars: jars.map(function (j) { return { cap: j.cap, fills: j.fills }; }),
      solution: solution
    };
  }

  function generate(difficulty, seed) {
    var cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    if (seed == null) seed = (Math.random() * 0xFFFFFFFF) >>> 0;
    var rand = rng(seed);

    var level = null;
    for (var tries = 0; tries < 400 && !level; tries++) level = attempt(cfg, rand);
    /* Fall back to the simplest shape that always works. */
    if (!level) {
      level = {
        main: { cap: 6 },
        target: [['red', 3], ['blue', 3]],
        drain: true,
        jars: [
          { cap: 6, fills: [['red', 4]] },
          { cap: 6, fills: [['blue', 4]] },
          { cap: 6, fills: [['yellow', 3]] }
        ],
        solution: [{ jar: 0, units: 3 }, { jar: 1, units: 3 }]
      };
    }

    level.id = 'random-' + difficulty + '-' + seed;
    level.difficulty = difficulty;
    level.seed = seed;
    level.name = 'Make ' + C.name(C.mixAll(level.target));
    level.subtitle = cfg.label + ' · seed ' + seed;
    level.brief = 'Fill the big jar to the brim so it matches the target shade exactly.';
    level.hint = null;
    return level;
  }

  global.Generator = { generate: generate, DIFFICULTY: DIFFICULTY };
})(typeof window !== 'undefined' ? window : globalThis);
