#!/usr/bin/env node
/* make-merge-levels.js — build the Merge Colours levels into js/merge-levels.js.
 *
 *   node tools/make-merge-levels.js
 *
 * The first five are written by hand — each teaches one thing about mixing,
 * which a generator cannot be asked for — and are read back from the file and
 * re-verified rather than rebuilt. The rest are dealt along a widening curve
 * and kept only if they pass every check below.
 *
 * What limits this curve is the search. Merge Colours has no admissible
 * estimate to guide it (see merge.js), so it is a plain breadth-first search,
 * and the states it has to visit climb steeply: a board needing six units of
 * target settles in a few thousand, one needing ten in half a million. The
 * in-game hint has 1.2 seconds to answer from the opening position, which is
 * the worst case, and that works out at roughly forty thousand states. Boards
 * here stay inside it. Going further would mean giving the mode a real
 * estimate first, not simply dealing bigger boards. */

'use strict';
const fs = require('fs');
const path = require('path');

require('../js/colour.js');
require('../js/engine.js');
require('../js/merge.js');
const C = globalThis.Colour, { Game } = globalThis.Engine, M = globalThis.Merge;
const { deal } = require('./merge-deal.js');

const TOTAL = 25, TAUGHT = 5, FIRST_DEALT = TAUGHT + 1;

/* The hint's own budget, which is what the ceiling above is really about. */
const HINT_STATES = 40000;

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function shape(level) {
  const u = (level - FIRST_DEALT) / (TOTAL - FIRST_DEALT);
  const jars = lerp(4, 7, u);
  const cap = lerp(4, 5, u);
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

/* ── checks every level has to pass ────────────────────────────────────── */

/* `strict` is for boards this tool deals. The five taught levels are held to
   the first half only: level 4 deliberately puts a rival recipe on the shelf,
   because being able to spend a colour on the wrong partner is the very thing
   it teaches. The dealt levels take the opposite line on purpose — there are
   twenty of them in a row and no way to take a merge back. */
function inspect(lvl, strict) {
  const g = new Game(lvl);
  const solved = M.solve(g.position(), 2000000, 30000);
  if (solved.budgetExceeded) return { bad: 'search ran out' };
  if (solved.par == null) return { bad: 'cannot be finished' };
  if (solved.explored > HINT_STATES) {
    return { bad: 'too slow to hint (' + solved.explored + ' states)' };
  }

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

  const used = [...present, lvl.target];
  for (let a = 0; a < used.length; a++) {
    for (let b = a + 1; b < used.length; b++) {
      if (C.distance(used[a], used[b]) < 150) return { bad: 'lookalikes ' + used[a] + '/' + used[b] };
    }
  }
  return { par: solved.par, states: solved.explored };
}

/* Can it be played badly and still finished? No merge can be wrong here, so
   what is being tested is whether careless shuffling can deadlock the shelf. */
let rs = 4242;
const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };

function survivable(lvl, trials) {
  for (let t = 0; t < trials; t++) {
    const g = new Game(lvl);
    for (let step = 1; step <= 60 && !g.won; step++) {
      const ids = g.jars.map(j => j.id);
      const legal = [];
      for (const f of ids) for (const to of ids.concat(['main'])) if (f !== to && g.pourable(f, to)) legal.push([f, to]);
      if (!legal.length) return false;
      const grab = legal.filter(m => m[1] === 'main');
      const mv = grab.length ? grab[Math.floor(rnd() * grab.length)]
                             : legal[Math.floor(rnd() * legal.length)];
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
const EXISTING = (() => {
  try {
    require(OUT);
    return new Map(globalThis.MergeLevels.list.map(l => [l.id, l]));
  } catch (e) { return new Map(); }
})();

const ADJECTIVES = ['Stirred', 'Folded', 'Steeped', 'Tinted', 'Blended', 'Swirled',
                    'Clouded', 'Deepened', 'Layered', 'Muddled', 'Wound', 'Sunken',
                    'Threaded', 'Scattered', 'Buried', 'Knotted', 'Split', 'Braided',
                    'Fractured', 'Distilled'];

const built = [];

/* The five that teach are read back and checked, never rebuilt. */
for (let n = 1; n <= TAUGHT; n++) {
  const id = 'merge-' + String(n).padStart(2, '0');
  const lvl = EXISTING.get(id);
  if (!lvl) throw new Error('taught level ' + id + ' is missing from ' + OUT);
  const r = inspect(lvl);
  if (r.bad) throw new Error(id + ' (' + lvl.name + '): ' + r.bad);
  if (r.par !== lvl.par) throw new Error(id + ': stored par ' + lvl.par + ', solver makes it ' + r.par);
  built.push(lvl);
  console.log('  ' + String(n).padStart(2) + '. ' + lvl.name.padEnd(18) +
    ' taught   jars ' + lvl.jars.length + '  par ' + String(lvl.par).padStart(2) + '   (verified)');
}

/* The rest are dealt as a set and then put in order of the par the solver
   measured, the same way the campaign's later ramps are built: dealing in
   order decays, because one lucky board early sets a bar the shape cannot
   clear again. */
const floor = built[built.length - 1].par;
const dealt = [];
for (let level = FIRST_DEALT; level <= TOTAL; level++) {
  const cfg = shape(level);
  let chosen = null;
  for (let seed = level * 1000; seed < level * 1000 + 400 && !chosen; seed++) {
    const board = deal(cfg, seed);
    if (!board) continue;
    const r = inspect(board, true);
    if (r.bad) continue;
    if (r.par < floor + 1) continue;               /* never easier than the taught five */
    if (!survivable(board, 4)) continue;
    chosen = { board, par: r.par, states: r.states };
  }
  if (!chosen) throw new Error('level ' + level + ': nothing dealt that passes');
  dealt.push(chosen);
  console.log('     dealt ' + (level - FIRST_DEALT + 1) + '/' + (TOTAL - FIRST_DEALT + 1) +
    ' — ' + chosen.board.jars.length + ' jars, main ' + chosen.board.main.cap +
    ', par ' + chosen.par + ' (' + chosen.states + ' states)');
}

dealt.sort((a, b) => a.par - b.par);
dealt.forEach((pick, i) => {
  const level = FIRST_DEALT + i;
  const colour = C.name(pick.board.target);
  built.push({
    id: 'merge-' + String(level).padStart(2, '0'),
    mode: 'merge',
    name: ADJECTIVES[i % ADJECTIVES.length] + ' ' + colour.charAt(0).toUpperCase() + colour.slice(1),
    teaches: pick.board.jars.length + ' jars · ' + pick.par + ' moves',
    brief: '',
    target: pick.board.target,
    parents: pick.board.parents,
    main: { cap: pick.board.main.cap },
    par: pick.par,
    jars: pick.board.jars.map(j => ({ cap: j.cap, fills: j.fills }))
  });
  console.log('  ' + String(level).padStart(2) + '. ' + built[built.length - 1].name.padEnd(18) +
    ' dealt    jars ' + pick.board.jars.length + '  par ' + String(pick.par).padStart(2) +
    '  (' + pick.states + ' states)');
});

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

console.log('\nwrote js/merge-levels.js — ' + built.length + ' levels, par ' +
  built[0].par + ' to ' + built[built.length - 1].par);
