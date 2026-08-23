#!/usr/bin/env node
/* make-levels.js — build the 75-level campaign into js/levels.js.
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

const TOTAL = 75, TAUGHT = 5;
/* Each ramp is pinned to the end point it was built against rather than to
   TOTAL. People have progress against these levels, so a later ramp being
   added must not change the shape of a single board that came before it —
   and every one of these numbers appears in a curve that would quietly redeal
   the lot if it moved. */
const FIRST_DEALT = TAUGHT + 1, RAMP_ONE_END = 25, RAMP_TWO_END = 50;

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
  if (level <= RAMP_ONE_END) {
    /* First ramp: six jars to eleven, widening and deepening. */
    const t = (level - FIRST_DEALT) / (RAMP_ONE_END - FIRST_DEALT);
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

  /* Second ramp, driven by how much liquid is on the shelf.
     Measuring the first ramp settled what par actually follows: not the
     number of jars, not the size of the big jar, but the number of units in
     play, at roughly par = units - 10 (54 units gave par 43, 59 gave 51, 69
     gave 59). An earlier attempt at this ramp widened the shelf while raising
     slack alongside it, and the two cancelled: the unit count went from 50
     down to 49 across twenty-five levels, and par sat flat at 41-45 the whole
     way. So slack is set as a fraction of capacity here rather than as a
     number, which keeps room to work in proportional while the shelf grows.
     Levels 25 and Extra Hard both work at 30%, so 36% down to 33% stays on
     the safe side of proven while leaving churn its room. */
  if (level <= RAMP_TWO_END) {
    const u = (level - (RAMP_ONE_END + 1)) / (RAMP_TWO_END - (RAMP_ONE_END + 1));
    const jars = lerp(12, 14, u);
    const cap = lerp(7, 8, u);
    const cells = jars * cap;
    /* Units are set directly and slack is whatever is left over, rather than
       the other way round. Jars and depth can only move in whole steps, so
       deriving units from them puts the ramp on four flat shelves of six
       levels each; setting units gives a step of roughly one per level, and
       slack still lands between 31% and 37% of the shelf the whole way. */
    const units = lerp(54, 75, u);
    const slack = cells - units;
    const mainCap = lerp(16, 26, u);
    return {
      label: 'Campaign', blurb: '',
      mainCap, sideJars: jars, sideCap: cap,
      /* Nine filler colours plus a target would need the whole palette, and
         orange and yellow are too close to sit on one shelf, so eight is the
         ceiling. */
      fillers: lerp(7, 8, u),
      fillerUnits: units - mainCap,
      burial: 0.6,
      churn: 0.55 + 0.2 * u,
      sizeUp: 600,
      par: [1, 999]
    };
  }

  /* Third ramp. Units still drive par, but what limits this one is neither the
     shelf nor the palette — it is the solver. Every level's par has to be
     PROVEN minimal, and that search grows steeply with the board.

     Two things were measured before settling on these numbers. First, the
     ceiling on colour: nine fillers plus a target would need all ten palette
     entries, and orange and yellow are too close to share a shelf, so ramp two
     already reached the limit at eight. Second, and the real find: churn is
     what makes a board expensive to search, because scattering each colour
     into thin layers is exactly what denies the search anything to home in on.
     At fifteen jars with ramp two's churn of 0.75, not one deal in two hundred
     seconds could be settled at all. Lowering churn to 0.45 on the same shape
     produced boards of par 58-67 that the solver settled in TEN MILLISECONDS.

     So ramp two's lever is deliberately wound back here and the unit count
     does the work instead — which it could not do in ramp two, where the shelf
     had nowhere left to grow. Nineteen jars at eight deep is the widest shelf
     that still shows every jar at once on a laptop. */
  const u = (level - (RAMP_TWO_END + 1)) / (TOTAL - (RAMP_TWO_END + 1));
  const jars = lerp(16, 19, u);
  const cap = 8;
  const cells = jars * cap;
  const units = lerp(86, 102, u);
  return {
    label: 'Campaign', blurb: '',
    mainCap: lerp(29, 34, u),
    sideJars: jars, sideCap: cap,
    fillers: 8,
    fillerUnits: units - lerp(29, 34, u),
    burial: 0.6,
    churn: 0.30 + 0.10 * u,
    /* A wider gate than ramp two's 600. The gate is not only a validity check:
       it is what keeps boards the search cannot settle out of the campaign,
       and on a board this size 600 nodes throws away almost everything. */
    sizeUp: 2500,
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
                    'Locked', 'Drowned', 'Sifted', 'Churned', 'Muddled', 'Scattered',
                    'Riddled', 'Woven', 'Snarled', 'Cluttered', 'Stranded', 'Salted',
                    'Threaded', 'Marbled', 'Shuffled', 'Split', 'Steeped', 'Stirred',
                    'Speckled', 'Banded', 'Sunk', 'Clouded', 'Wound', 'Dredged',
                    'Silted', 'Braided', 'Fractured',
                    'Strewn', 'Warped', 'Lodged', 'Swamped', 'Ravelled', 'Sundered',
                    'Flooded', 'Grated', 'Sluiced', 'Winnowed', 'Quartered', 'Harrowed',
                    'Shattered', 'Wrung', 'Roiled', 'Interleaved', 'Combed',
                    'Sieved', 'Decanted', 'Rifted', 'Scrambled', 'Unspooled',
                    'Overlaid', 'Entwined', 'Meshed'];

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

function pickBoard(level, cfg, floor) {
  let ordered, candidates = 0;

  if (level <= RAMP_ONE_END) {
    /* The first ramp is pinned: this is exactly how levels 6-25 were chosen,
       and changing it would deal a different campaign for anyone who already
       has progress against this one. */
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
    if (!pool.some(c => c.par >= floor)) deal(level * 1000 + 500, level * 1000 + 3000, floor);
    pool.sort((a, b) => a.par - b.par);
    candidates = pool.length;

    const eligible = pool.filter(c => c.par >= floor);
    if (eligible.length) {
      const aim = eligible[Math.min(eligible.length - 1, Math.floor(eligible.length * 0.65))].par;
      ordered = eligible.slice().sort((a, b) => Math.abs(a.par - aim) - Math.abs(b.par - aim));
    } else {
      ordered = pool.slice().reverse();    /* nothing harder exists: take the hardest there is */
    }
  } else {
    /* One board per level, not a pool. These are slow to deal — a fourteen jar
       board takes the best part of a minute — and a pool buys nothing here,
       because the shape pins par tightly: four deals of the same shape came
       back 60, 58, 59, 58. The floor is all the choosing that is needed, and
       the ordering pass afterwards does the rest. */
    const pool = [];
    for (let seed = level * 1000; seed < level * 1000 + 60 && !pool.length; seed++) {
      const cand = G.generate('__campaign', seed);
      if (cand.jars.length !== cfg.sideJars) continue;
      const r = inspect(cand);
      if (r.bad) continue;
      if (r.par < floor) continue;
      pool.push({ level: cand, par: r.par });
      candidates = seed - level * 1000 + 1;
    }
    if (!pool.length) throw new Error('level ' + level + ': nothing dealt at or above par ' + floor);
    ordered = pool;
  }

  /* Only take a board that can be played badly and still finished. */
  for (const c of ordered) {
    if (survivable(c.level, level > 20 ? 4 : 3)) {
      return { board: c.level, par: c.par, candidates: candidates };
    }
  }
  throw new Error('level ' + level + ': no board that can be played badly and still won');
}

function describe(level, picked) {
  const colour = C.name(picked.board.target);
  return {
    id: 'level-' + String(level).padStart(2, '0'),
    name: ADJECTIVES[(level - TAUGHT - 1) % ADJECTIVES.length] + ' ' +
          colour.charAt(0).toUpperCase() + colour.slice(1),
    teaches: picked.board.jars.length + ' jars · ' + picked.par + ' moves',
    brief: '',
    target: picked.board.target,
    main: { cap: picked.board.main.cap },
    par: picked.par,
    jars: picked.board.jars.map(j => ({ cap: j.cap, fills: j.fills }))
  };
}

function emit(level, picked) {
  const entry = describe(level, picked);
  built.push(entry);
  console.log('  ' + String(level).padStart(2) + '. ' + entry.name.padEnd(18) +
    ' dealt   jars ' + String(picked.board.jars.length).padStart(2) +
    '  cap ' + picked.board.jars[0].cap + '  par ' + String(picked.par).padStart(2) +
    '  (from ' + picked.candidates + ' candidates)');
}

for (let level = FIRST_DEALT; level <= RAMP_ONE_END; level++) {
  const cfg = shape(level);
  G.DIFFICULTY.__campaign = cfg;
  const picked = pickBoard(level, cfg, prevPar);
  prevPar = picked.par;
  emit(level, picked);
}

/* The second ramp is dealt as a set and then put in order of the par the
   solver measured, rather than each board being ratcheted past the one before
   as it is dealt.
   
   Dealing in order does not work here: one lucky board early sets a bar the
   shape cannot clear again, and every level after it settles for less, so the
   ramp decays instead of climbing. Ordering afterwards makes the progression a
   fact about the boards rather than a hope about the dealing. */
const rampTwo = [];
const FLOOR = prevPar;
for (let level = RAMP_ONE_END + 1; level <= RAMP_TWO_END; level++) {
  const cfg = shape(level);
  G.DIFFICULTY.__campaign = cfg;
  const picked = pickBoard(level, cfg, FLOOR);
  rampTwo.push(picked);
  console.log('     dealt ' + (level - RAMP_ONE_END) + '/' + (RAMP_TWO_END - RAMP_ONE_END) +
    ' for the second ramp — ' + picked.board.jars.length + ' jars, par ' + picked.par);
}
rampTwo.sort((a, b) => a.par - b.par);
rampTwo.forEach(function (picked, i) { emit(RAMP_ONE_END + 1 + i, picked); });

/* The third ramp, dealt and ordered the same way, with the floor set by where
   the second one finished. */
const rampThree = [];
const FLOOR_THREE = rampTwo[rampTwo.length - 1].par;
for (let level = RAMP_TWO_END + 1; level <= TOTAL; level++) {
  const cfg = shape(level);
  G.DIFFICULTY.__campaign = cfg;
  const picked = pickBoard(level, cfg, FLOOR_THREE);
  rampThree.push(picked);
  console.log('     dealt ' + (level - RAMP_TWO_END) + '/' + (TOTAL - RAMP_TWO_END) +
    ' for the third ramp — ' + picked.board.jars.length + ' jars, par ' + picked.par);
}
rampThree.sort((a, b) => a.par - b.par);
rampThree.forEach(function (picked, i) { emit(RAMP_TWO_END + 1 + i, picked); });

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
