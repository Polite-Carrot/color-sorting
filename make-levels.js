#!/usr/bin/env node
/* make-levels.js — build the 25-level campaign into js/levels.js.
 *
 *   node make-levels.js
 *
 * The first five levels are written by hand, because each one exists to teach
 * a single rule and that is not something a generator can be asked for. The
 * rest are dealt by the ordinary puzzle generator along a widening curve, then
 * kept only if they pass every check below.
 *
 * Boards are baked into the file rather than dealt when the game loads, so the
 * campaign is the same for everyone, par is known to be the true minimum, and
 * starting a level costs nothing.
 *
 * Re-run only when the curve or the taught levels change. */

'use strict';
const fs = require('fs');
const path = require('path');

require('./js/colour.js');
require('./js/engine.js');
require('./js/solver.js');
require('./js/generator.js');
const C = globalThis.Colour, { Game, top } = globalThis.Engine,
      S = globalThis.Solver, G = globalThis.Generator;

const TOTAL = 25, TAUGHT = 5;

/* ── the five that teach ───────────────────────────────────────────────── */

const TEACH = [
  {
    name: 'First Pour',
    teaches: 'Picking up and pouring',
    brief: 'Tap a jar to pick it up, then tap the big jar to pour. The big jar ' +
           'only ever accepts red, so you cannot spoil it — try the blue and see.',
    target: 'red',
    main: { cap: 4 },
    jars: [
      { cap: 4, fills: ['red', 'red'] },
      { cap: 4, fills: ['blue', 'blue', 'blue'] },
      { cap: 4, fills: ['red', 'red'] }
    ]
  },
  {
    name: 'Gather It Up',
    teaches: 'Collecting from several jars',
    brief: 'The blue is spread around, but all of it is already on top. ' +
           'Every last drop has to go in — the big jar must be full.',
    target: 'blue',
    main: { cap: 4 },
    jars: [
      { cap: 4, fills: ['blue', 'blue'] },
      { cap: 4, fills: ['green', 'blue'] },
      { cap: 4, fills: ['green', 'green'] },
      { cap: 4, fills: ['blue'] }
    ]
  },
  {
    name: 'Out of the Way',
    teaches: 'Uncovering a buried colour',
    brief: 'Some yellow is trapped under blue. A colour can be poured onto the ' +
           'same colour, so move the blue onto the blue and the yellow is free.',
    target: 'yellow',
    main: { cap: 4 },
    jars: [
      { cap: 4, fills: ['yellow', 'yellow', 'blue', 'blue'] },
      { cap: 4, fills: ['blue'] },
      { cap: 4, fills: ['yellow', 'yellow'] }
    ]
  },
  {
    name: 'Mind the Room',
    teaches: 'Only what fits will move',
    brief: 'A pour stops when the jar it is going into runs out of room, so a ' +
           'block of colour can be split across two jars.',
    target: 'teal',
    main: { cap: 5 },
    jars: [
      { cap: 5, fills: ['teal', 'teal', 'red', 'red', 'red'] },
      { cap: 3, fills: ['red'] },
      { cap: 5, fills: ['teal', 'teal', 'teal'] },
      { cap: 3, fills: [] }
    ]
  }
,
  {
    name: 'Empty Space',
    teaches: 'Working through an empty jar',
    brief: 'Nothing matches this time. An empty jar takes any colour, so it is ' +
           'the way in — but there is only one, so think before you fill it.',
    target: 'green',
    main: { cap: 6 },
    jars: [
      { cap: 4, fills: ['green', 'green', 'red', 'red'] },
      { cap: 4, fills: ['green', 'green', 'blue', 'blue'] },
      { cap: 4, fills: ['green', 'green'] },
      { cap: 4, fills: [] },
      { cap: 4, fills: ['red', 'blue'] }
    ]
  },
];

/* ── the curve the rest are dealt along ────────────────────────────────── */

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function shape(level) {
  const t = (level - (TAUGHT + 1)) / (TOTAL - (TAUGHT + 1));
  const jars = lerp(6, 11, t);
  const cap = lerp(4, 7, t);
  const mainCap = lerp(5, 14, t);
  /* Room to work in grows with the board. Too little and an ordinary run of
     moves can leave a level unwinnable, which is unacceptable in a campaign
     someone has to get through in order. */
  const slack = lerp(10, 23, t);
  return {
    label: 'Campaign', blurb: '',
    mainCap, sideJars: jars, sideCap: cap,
    fillers: lerp(3, 7, t),
    fillerUnits: jars * cap - mainCap - slack,
    burial: t > 0.65 ? 0.6 : 0,
    sizeUp: cap >= 7 ? 600 : 2500,
    par: [1, 999]
  };
}

/* ── checks every level has to pass ────────────────────────────────────── */

function inspect(lvl) {
  const g = new Game(lvl);
  const solved = S.solve(g.position(), 400000, 8000);
  if (solved.budgetExceeded) return { bad: 'solver ran out of room' };
  if (solved.par == null) return { bad: 'cannot be finished' };

  for (const mv of solved.path) {
    if (!g.pour('jar' + mv.from, mv.to === -1 ? 'main' : 'jar' + mv.to).ok) return { bad: 'illegal solution move' };
  }
  if (!g.won) return { bad: 'solution does not win' };

  const units = lvl.jars.reduce((n, j) => n + j.fills.filter(c => c === lvl.target).length, 0);
  if (units !== lvl.main.cap) return { bad: 'target units ' + units + ' != jar capacity ' + lvl.main.cap };

  const used = [...new Set(lvl.jars.flatMap(j => j.fills))];
  for (let a = 0; a < used.length; a++) {
    for (let b = a + 1; b < used.length; b++) {
      if (C.distance(used[a], used[b]) < 150) return { bad: 'lookalikes ' + used[a] + '/' + used[b] };
    }
  }
  return { par: solved.par, colours: used.length };
}

/* Can it be played badly and still finished? A campaign level that an ordinary
   run of moves can kill is a wall, not a puzzle. */
let rs = 99;
const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };

function survivable(lvl, trials) {
  for (let a = 0; a < trials; a++) {
    const g = new Game(lvl);
    for (let step = 1; step <= 250; step++) {
      const ids = g.jars.map(j => j.id);
      const legal = [];
      for (const f of ids) for (const to of ids.concat(['main'])) if (f !== to && g.pourable(f, to)) legal.push([f, to]);
      if (!legal.length) return false;
      const grab = legal.filter(m => m[1] === 'main');
      let pick;
      if (grab.length) pick = grab;
      else {
        const covering = legal.filter(m => { const s = g.get(m[0]).cells; return s.includes(g.target) && top(s) !== g.target; });
        const pool = covering.length ? covering : legal;
        const empties = pool.filter(m => m[1] !== 'main' && g.get(m[1]).cells.length === 0);
        pick = empties.length && rnd() < 0.7 ? empties : pool;
      }
      const mv = pick[Math.floor(rnd() * pick.length)];
      g.pour(mv[0], mv[1]);
      if (g.won) break;
      if (step % 8 === 0) {
        const r = S.solve(g.position(), 60000, 400);
        if (!r.budgetExceeded && r.par == null) return false;
      }
    }
  }
  return true;
}

/* ── build ─────────────────────────────────────────────────────────────── */

const ADJECTIVES = ['Stacked', 'Buried', 'Layered', 'Sunken', 'Packed', 'Tangled',
                    'Jumbled', 'Deep', 'Crowded', 'Knotted', 'Folded', 'Heaped',
                    'Wedged', 'Sealed', 'Nested', 'Hidden', 'Pressed', 'Bottled',
                    'Locked', 'Drowned'];

const built = [];
let prevPar = 0;

TEACH.forEach((spec, i) => {
  const lvl = Object.assign({ id: 'level-' + String(i + 1).padStart(2, '0') }, spec);
  const r = inspect(lvl);
  if (r.bad) throw new Error('taught level ' + (i + 1) + ' (' + spec.name + '): ' + r.bad);
  lvl.par = r.par;
  prevPar = Math.max(prevPar, r.par);
  built.push(lvl);
  console.log('  ' + String(i + 1).padStart(2) + '. ' + spec.name.padEnd(18) +
    ' taught  jars ' + String(lvl.jars.length).padStart(2) + '  par ' + String(r.par).padStart(2));
});

for (let level = TAUGHT + 1; level <= TOTAL; level++) {
  const cfg = shape(level);
  G.DIFFICULTY.__campaign = cfg;

  /* Collect a spread of workable boards for this shape, then take the gentlest
     one that is still no easier than the level before. Letting the shape set
     the difficulty and using par only as a ratchet keeps the ramp as smooth as
     the shapes allow — an independent par curve just fights them, and stalls
     the moment the two disagree. */
  const pool = [];
  const deal = (from, until, want) => {
    for (let seed = from; seed < until && pool.length < 20; seed++) {
      const cand = G.generate('__campaign', seed);
      if (cand.jars.length !== cfg.sideJars) continue;        /* the fallback board */
      const r = inspect(cand);
      if (r.bad) continue;
      if (want && r.par < want) continue;
      pool.push({ level: cand, par: r.par });
    }
  };
  deal(level * 1000, level * 1000 + 500, 0);
  /* Two shapes running back to back can produce the same spread, so a level
     can find nothing harder than the one before it purely by luck. Go looking
     specifically before settling for a step backwards. */
  if (!pool.some(c => c.par >= prevPar)) deal(level * 1000 + 500, level * 1000 + 3000, prevPar);
  pool.sort((a, b) => a.par - b.par);

  /* Aim at the harder end of what this shape produces, not the gentlest board
     that merely beats the level before. Hugging the bottom of each range left
     the middle of the campaign flat — five levels running at the same par
     while the boards visibly grew — and a finale easier than a random puzzle. */
  const eligible = pool.filter(c => c.par >= prevPar);
  var ordered;
  if (eligible.length) {
    const aim = eligible[Math.min(eligible.length - 1, Math.floor(eligible.length * 0.65))].par;
    ordered = eligible.slice().sort((a, b) => Math.abs(a.par - aim) - Math.abs(b.par - aim));
  } else {
    ordered = pool.slice().reverse();      /* nothing harder exists: take the hardest there is */
  }
  let chosen = null;
  for (const c of ordered) {
    if (survivable(c.level, level > 20 ? 4 : 3)) { chosen = c; break; }
  }
  if (!chosen) throw new Error('level ' + level + ': no board that can be played badly and still won');

  const colour = C.name(chosen.level.target);
  built.push({
    id: 'level-' + String(level).padStart(2, '0'),
    name: ADJECTIVES[(level - TAUGHT - 1) % ADJECTIVES.length] + ' ' +
          colour.charAt(0).toUpperCase() + colour.slice(1),
    teaches: chosen.level.jars.length + ' jars · ' + chosen.par + ' moves',
    brief: '',
    target: chosen.level.target,
    main: { cap: chosen.level.main.cap },
    par: chosen.par,
    jars: chosen.level.jars.map(j => ({ cap: j.cap, fills: j.fills }))
  });
  prevPar = chosen.par;
  console.log('  ' + String(level).padStart(2) + '. ' + built[built.length - 1].name.padEnd(18) +
    ' dealt   jars ' + String(chosen.level.jars.length).padStart(2) +
    '  cap ' + chosen.level.jars[0].cap + '  par ' + String(chosen.par).padStart(2) +
    '  (from ' + pool.length + ' candidates)');
}

/* ── emit ──────────────────────────────────────────────────────────────── */

const body = built.map((l, i) => {
  const jars = l.jars.map(j => '        { cap: ' + j.cap + ', fills: [' +
    j.fills.map(f => "'" + f + "'").join(', ') + '] }').join(',\n');
  return '    {\n' +
    "      id: '" + l.id + "',\n" +
    "      name: '" + l.name.replace(/'/g, "\\'") + "',\n" +
    "      subtitle: 'Level " + (i + 1) + " of " + TOTAL + "',\n" +
    "      teaches: '" + l.teaches.replace(/'/g, "\\'") + "',\n" +
    (l.brief ? "      brief: " + JSON.stringify(l.brief) + ",\n" : "      brief: '',\n") +
    "      target: '" + l.target + "',\n" +
    '      main: { cap: ' + l.main.cap + ' },\n' +
    '      par: ' + l.par + ',\n' +
    '      jars: [\n' + jars + '\n      ]\n' +
    '    }';
}).join(',\n');

const out = `/* levels.js — GENERATED by make-levels.js. Do not edit by hand.
 *
 * A ${TOTAL}-level campaign. The first ${TAUGHT} are written by hand, one rule each;
 * the rest are dealt along a widening curve and kept only if the solver can
 * finish them, their par rises on the level before, and playing them badly
 * still leaves them winnable.
 *
 * par is the true fewest moves, not an estimate. Jar fills are listed BOTTOM
 * first. */
(function (global) {
  'use strict';

  var LEVELS = [
${body}
  ];

  global.Levels = {
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
`;

fs.writeFileSync(path.join(__dirname, 'js', 'levels.js'), out);
console.log('\nwrote js/levels.js — ' + built.length + ' levels, par ' +
  built[0].par + ' to ' + built[built.length - 1].par);
