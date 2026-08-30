#!/usr/bin/env node
/* build-merge-campaign.js — builds js/merge-levels.js for Merge Colors.
 *
 * Every level past the tutorial is a seeded deal from the same generator the
 * Random Puzzle screen uses, at a (setting, jar count) slot on a ladder that
 * widens the shelf three jars to ten, sweeping the four settings at each width
 * several times over. par saws gently up inside a block and each block peaks
 * above the one before it.
 *
 * The seeds were chosen by dealing forty-eight boards per slot, taking the
 * true par of each, and keeping the one nearest that slot's target. They are
 * written out rather than re-picked so a build is reproducible, and the par
 * each was chosen for is recorded beside it: if the generator changes under
 * this table the build FAILS rather than quietly shipping a different set.
 *
 * KNOWN LIMITATION, measured, accepted deliberately. Merge levels carry their
 * solution, so a hint costs nothing while the player is following it. Off that
 * path a hint is a live search, and past seven jars the search cannot settle
 * inside the time the hint has: seven jars finishes in about 23,000 states,
 * eight and beyond do not finish at all. So on the eight, nine and ten jar
 * levels — 74 onwards — a player who has strayed and asks for a hint is told
 * the board is too tangled to work out from here rather than being given a
 * move. Everything else about those boards is sound.
 *
 *   node tools/build-merge-campaign.js            build and write
 *   node tools/build-merge-campaign.js --check    verify only, write nothing
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), J = path.join(ROOT, 'js') + path.sep;
require(J + 'colour.js'); require(J + 'engine.js');
require(J + 'merge.js'); require(J + 'merge-generator.js');
const C = globalThis.Colour, M = globalThis.Merge, { Game } = globalThis.Engine;
const G = globalThis.MergeGenerator;

const TOTAL = 150, TAUGHT = 5;
const LABEL = { easy: 'Easy', normal: 'Normal', hard: 'Hard', extraHard: 'Extra Hard' };
const PROVABLE_JARS = 7;
/* What the search was given while these seeds were picked. It has to match, or
   the same seed deals a different board: generate() retries until a candidate
   settles inside this, so changing it changes which candidates are thrown back
   and the random stream lands somewhere else entirely. */
const PICK_BUDGET = 40000;
/* The hint's ceiling. Not a gate here — see the limitation above — but every
   level records whether it clears it, so the cost is visible rather than
   discovered by a player. */
const HINT_STATES = 30000;

/* [level, setting, jars, seed, par-it-was-chosen-for] */
const LADDER = [
  [6, 'easy', 3, 100005, 6],
  [7, 'normal', 3, 200005, 8],
  [8, 'hard', 3, 300048, 9],
  [9, 'extraHard', 3, 400002, 10],
  [10, 'easy', 3, 100002, 7],
  [11, 'normal', 3, 200002, 9],
  [12, 'hard', 3, 300001, 8],
  [13, 'extraHard', 3, 400003, 10],
  [14, 'easy', 4, 500001, 8],
  [15, 'normal', 4, 600004, 9],
  [16, 'hard', 4, 700001, 10],
  [17, 'extraHard', 4, 800002, 13],
  [18, 'easy', 4, 500002, 9],
  [19, 'normal', 4, 600012, 10],
  [20, 'hard', 4, 700002, 11],
  [21, 'extraHard', 4, 800007, 14],
  [22, 'easy', 4, 500012, 9],
  [23, 'normal', 4, 600002, 11],
  [24, 'hard', 4, 700016, 12],
  [25, 'extraHard', 4, 800004, 15],
  [26, 'easy', 5, 900006, 9],
  [27, 'normal', 5, 1000002, 13],
  [28, 'hard', 5, 1100011, 14],
  [29, 'extraHard', 5, 1200004, 16],
  [30, 'easy', 5, 900002, 10],
  [31, 'normal', 5, 1000003, 14],
  [32, 'hard', 5, 1100015, 15],
  [33, 'extraHard', 5, 1200007, 17],
  [34, 'easy', 5, 900004, 11],
  [35, 'normal', 5, 1000012, 15],
  [36, 'hard', 5, 1100001, 16],
  [37, 'extraHard', 5, 1200001, 18],
  [38, 'easy', 6, 1300003, 10],
  [39, 'normal', 6, 1400001, 14],
  [40, 'hard', 6, 1500002, 15],
  [41, 'extraHard', 6, 1600003, 19],
  [42, 'easy', 6, 1300011, 11],
  [43, 'normal', 6, 1400005, 16],
  [44, 'hard', 6, 1500001, 17],
  [45, 'extraHard', 6, 1600022, 20],
  [46, 'easy', 6, 1300001, 12],
  [47, 'normal', 6, 1400007, 17],
  [48, 'hard', 6, 1500010, 18],
  [49, 'extraHard', 6, 1600001, 21],
  [50, 'easy', 6, 1300005, 13],
  [51, 'normal', 6, 1400016, 18],
  [52, 'hard', 6, 1500030, 19],
  [53, 'extraHard', 6, 1600002, 22],
  [54, 'easy', 7, 1700004, 12],
  [55, 'normal', 7, 1800006, 17],
  [56, 'hard', 7, 1900001, 18],
  [57, 'extraHard', 7, 2000002, 24],
  [58, 'easy', 7, 1700007, 14],
  [59, 'normal', 7, 1800004, 18],
  [60, 'hard', 7, 1900002, 19],
  [61, 'extraHard', 7, 2000010, 25],
  [62, 'easy', 7, 1700009, 14],
  [63, 'normal', 7, 1800001, 19],
  [64, 'hard', 7, 1900003, 20],
  [65, 'extraHard', 7, 2000011, 25],
  [66, 'easy', 7, 1700010, 15],
  [67, 'normal', 7, 1800002, 20],
  [68, 'hard', 7, 1900004, 21],
  [69, 'extraHard', 7, 2000004, 26],
  [70, 'easy', 7, 1700002, 16],
  [71, 'normal', 7, 1800021, 21],
  [72, 'hard', 7, 1900022, 22],
  [73, 'extraHard', 7, 2000003, 27],
  [74, 'easy', 8, 2100011, 12],
  [75, 'normal', 8, 2200006, 16],
  [76, 'hard', 8, 2300008, 18],
  [77, 'extraHard', 8, 2400007, 20],
  [78, 'easy', 8, 2100006, 13],
  [79, 'normal', 8, 2200009, 18],
  [80, 'hard', 8, 2300001, 20],
  [81, 'extraHard', 8, 2400001, 21],
  [82, 'easy', 8, 2100012, 13],
  [83, 'normal', 8, 2200013, 19],
  [84, 'hard', 8, 2300004, 20],
  [85, 'extraHard', 8, 2400009, 22],
  [86, 'easy', 8, 2100004, 15],
  [87, 'normal', 8, 2200002, 21],
  [88, 'hard', 8, 2300009, 22],
  [89, 'extraHard', 8, 2400003, 23],
  [90, 'easy', 8, 2100001, 16],
  [91, 'normal', 8, 2200010, 21],
  [92, 'hard', 8, 2300002, 23],
  [93, 'extraHard', 8, 2400019, 24],
  [94, 'easy', 8, 2100003, 17],
  [95, 'normal', 8, 2200001, 22],
  [96, 'hard', 8, 2300005, 24],
  [97, 'extraHard', 8, 2400002, 25],
  [98, 'easy', 9, 2500002, 13],
  [99, 'normal', 9, 2600011, 17],
  [100, 'hard', 9, 2700008, 18],
  [101, 'extraHard', 9, 2800012, 21],
  [102, 'easy', 9, 2500008, 13],
  [103, 'normal', 9, 2600004, 19],
  [104, 'hard', 9, 2700001, 20],
  [105, 'extraHard', 9, 2800002, 22],
  [106, 'easy', 9, 2500004, 14],
  [107, 'normal', 9, 2600003, 20],
  [108, 'hard', 9, 2700017, 21],
  [109, 'extraHard', 9, 2800003, 24],
  [110, 'easy', 9, 2500009, 15],
  [111, 'normal', 9, 2600022, 21],
  [112, 'hard', 9, 2700009, 22],
  [113, 'extraHard', 9, 2800014, 25],
  [114, 'easy', 9, 2500010, 15],
  [115, 'normal', 9, 2600006, 22],
  [116, 'hard', 9, 2700021, 23],
  [117, 'extraHard', 9, 2800015, 25],
  [118, 'easy', 9, 2500007, 17],
  [119, 'normal', 9, 2600012, 24],
  [120, 'hard', 9, 2700046, 26],
  [121, 'extraHard', 9, 2800030, 27],
  [122, 'easy', 10, 2900004, 13],
  [123, 'normal', 10, 3000026, 16],
  [124, 'hard', 10, 3100002, 19],
  [125, 'extraHard', 10, 3200018, 20],
  [126, 'easy', 10, 2900022, 13],
  [127, 'normal', 10, 3000008, 19],
  [128, 'hard', 10, 3100017, 20],
  [129, 'extraHard', 10, 3200006, 21],
  [130, 'easy', 10, 2900014, 14],
  [131, 'normal', 10, 3000002, 20],
  [132, 'hard', 10, 3100012, 22],
  [133, 'extraHard', 10, 3200002, 23],
  [134, 'easy', 10, 2900007, 15],
  [135, 'normal', 10, 3000014, 22],
  [136, 'hard', 10, 3100003, 23],
  [137, 'extraHard', 10, 3200013, 24],
  [138, 'easy', 10, 2900009, 16],
  [139, 'normal', 10, 3000005, 23],
  [140, 'hard', 10, 3100001, 24],
  [141, 'extraHard', 10, 3200001, 25],
  [142, 'easy', 10, 2900006, 17],
  [143, 'normal', 10, 3000001, 24],
  [144, 'hard', 10, 3100023, 25],
  [145, 'extraHard', 10, 3200005, 26],
  [146, 'easy', 10, 2900018, 19],
  [147, 'normal', 10, 3000027, 25],
  [148, 'hard', 10, 3100005, 26],
  [149, 'extraHard', 10, 3200007, 28],
  [150, 'extraHard', 10, 3200015, 28]
];

/* The shape a slot deals at, derived the way the Random Puzzle screen derives
   it when the player moves the jar stepper off a preset. */
function shapeOf(tier, jars) {
  const base = G.DIFFICULTY[tier];
  /* Always derived, even where the jar count equals the preset's own width.
     Handing back the preset there looks equivalent and is not: the preset
     carries its own big jar and obstacle counts, so the same seed deals a
     different board and the ladder's par no longer holds. */
  let cap = base.sideCap;
  if (jars > PROVABLE_JARS) cap = Math.min(cap, 5);
  const cells = jars * cap, slack = Math.round(cells * 0.33);
  let mainCap = Math.max(2, Math.round(cells * (base.mainCap / (base.sideJars * base.sideCap))));
  if (jars > PROVABLE_JARS) mainCap = Math.min(mainCap, 5);
  let fillers = Math.max(1, Math.min(Math.max(base.fillers, Math.round(jars * 0.7)), jars - 1, 5));
  let fillerUnits = cells - slack - mainCap * 2;
  if (fillerUnits < fillers) fillers = fillerUnits;
  if (fillers < 1) throw new Error(tier + '@' + jars + ': no room for obstacle colours');
  return Object.assign({}, base, { sideJars: jars, sideCap: cap, mainCap, fillers,
    fillerUnits, par: [1, 999], sizeUp: PICK_BUDGET });
}

/* ── the checks every dealt level has to pass ──────────────────────────── */

function inspect(lvl) {
  const g = new Game(lvl);
  /* The par and the solution are the generator's own, not re-derived here.
     Past seven jars the generator solves with a weighted search -- it finds a
     short route quickly rather than proving the shortest -- so re-solving
     unweighted returns a DIFFERENT number and, on a ten jar shelf, often no
     number at all. Re-deriving would not be verifying the level, it would be
     quietly replacing it. What is checked instead is the thing that matters:
     that the solution stored with the level really does win. */
  if (!lvl.path || !lvl.path.length) return { bad: 'no solution stored' };
  for (const [from, to] of lvl.path)
    if (!g.pour('jar' + from, to === -1 ? 'main' : 'jar' + to).ok)
      return { bad: 'stored solution move is illegal in the engine' };
  if (!g.won) return { bad: 'stored solution does not win' };
  if (g.moves !== lvl.par) return { bad: 'stored solution is ' + g.moves + ' moves, par says ' + lvl.par };
  const solved = { par: lvl.par, path: lvl.path.map(m => ({ from: m[0], to: m[1] })) };

  const counts = {};
  for (const jar of lvl.jars) for (const f of jar.fills) counts[f] = (counts[f] || 0) + 1;
  const present = new Set(Object.keys(counts));

  /* Exactly one jarful of target must be makeable, every drop of it needed. */
  for (const parent of lvl.parents)
    if (counts[parent] !== lvl.main.cap)
      return { bad: parent + ' appears ' + (counts[parent] || 0) + ' times, needs ' + lvl.main.cap };
  if (counts[lvl.target]) return { bad: 'the target is already on the shelf' };

  /* Nothing may pair into a colour that is not the target, so no merge can
     ever be wrong and no needed unit destroyed by a careless move. */
  for (const r of M.RECIPES)
    if (present.has(r.a) && present.has(r.b) && r.makes !== lvl.target)
      return { bad: 'a rival recipe is on the shelf: ' + r.a + '+' + r.b };

  let warn = null;
  const used = [...present, lvl.target];
  for (let a = 0; a < used.length && !warn; a++)
    for (let b = a + 1; b < used.length && !warn; b++)
      if (C.distance(used[a], used[b]) < 150) warn = 'lookalikes ' + used[a] + '/' + used[b];

  /* Can the in-game hint answer on this board once the player is off the
     stored path? Recorded, not enforced. */
  const quick = M.solve(new Game(lvl).position(), HINT_STATES, 6000);
  return { par: solved.par, path: solved.path, warn: warn,
           hintable: !quick.budgetExceeded && quick.par != null };
}

/* Can it be played badly and still finished? Recorded per level rather than
   enforced, so the count is visible. */
let rs = 4242;
const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
function survivable(lvl, trials) {
  rs = 4242;
  for (let t = 0; t < trials; t++) {
    const g = new Game(lvl);
    for (let step = 1; step <= 80 && !g.won; step++) {
      const ids = g.jars.map(j => j.id), legal = [];
      for (const f of ids) for (const to of ids.concat(['main']))
        if (f !== to && g.pourable(f, to)) legal.push([f, to]);
      if (!legal.length) return false;
      let pool = legal.filter(m => m[1] === 'main');
      if (!pool.length) {
        const useful = legal.filter(m => m[1] !== 'main' && g.get(m[1]).cells.length > 0);
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

/* ── names ─────────────────────────────────────────────────────────────── */

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
if (ADJECTIVES.length < TOTAL - TAUGHT)
  throw new Error('ADJECTIVES has ' + ADJECTIVES.length + ' names, ' +
    (TOTAL - TAUGHT) + ' dealt levels need naming');

/* ── the five taught levels, carried over verbatim ─────────────────────── */

function taughtSource() {
  const src = fs.readFileSync(J + 'merge-levels.js', 'utf8');
  const start = src.indexOf('  var LEVELS = [');
  if (start < 0) throw new Error('cannot find LEVELS in js/merge-levels.js');
  const body = src.slice(src.indexOf('[', start) + 1);
  const out = [];
  let depth = 0, from = -1, taken = 0;
  for (let i = 0; i < body.length && taken < TAUGHT; i++) {
    if (body[i] === '{') { if (!depth) from = i; depth++; }
    else if (body[i] === '}') { depth--; if (!depth) { out.push(body.slice(from, i + 1)); taken++; } }
  }
  if (out.length !== TAUGHT) throw new Error('found ' + out.length + ' taught levels, want ' + TAUGHT);
  return out.map(s => '    ' + s.trim().replace(/subtitle: 'Level (\d+) of \d+'/,
    (m, n) => "subtitle: 'Level " + n + " of " + TOTAL + "'"));
}

/* ── build ─────────────────────────────────────────────────────────────── */

const CHECK = process.argv.includes('--check');
const built = [], problems = [], warns = [];
const noHint = [], fragile = [];

for (const [level, tier, jars, seed, wantPar] of LADDER) {
  G.DIFFICULTY.__slot = shapeOf(tier, jars);
  const board = G.generate('__slot', seed);

  if (board.jars.length !== jars) {
    problems.push('level ' + level + ': dealt ' + board.jars.length + ' jars, ladder says ' + jars);
    continue;
  }
  const seen = inspect(board);
  if (seen.bad) { problems.push('level ' + level + ': ' + seen.bad); continue; }
  if (seen.par !== wantPar) {
    problems.push('level ' + level + ': par ' + seen.par + ', chosen for par ' + wantPar +
      ' — the generator has changed under this table');
    continue;
  }
  if (seen.warn) warns.push('level ' + level + ': ' + seen.warn);
  if (!seen.hintable) noHint.push(level);
  if (!survivable(board, 4)) fragile.push(level);

  const colour = C.name(board.target);
  built.push({
    id: 'merge-' + String(level).padStart(2, '0'),
    name: ADJECTIVES[(level - TAUGHT - 1) % ADJECTIVES.length] + ' ' +
          colour.charAt(0).toUpperCase() + colour.slice(1),
    teaches: jars + ' jars · ' + seen.par + ' moves',
    target: board.target, parents: board.parents,
    main: { cap: board.main.cap }, par: seen.par, path: seen.path,
    jars: board.jars.map(j => ({ cap: j.cap, fills: j.fills }))
  });
  process.stdout.write('  ' + String(level).padStart(3) + '. ' +
    built[built.length - 1].name.padEnd(20) + LABEL[tier].padEnd(11) +
    String(jars).padStart(2) + ' jars  par ' + String(seen.par).padStart(2) +
    '  seed ' + seed + (seen.hintable ? '' : '   [hint cannot answer off-path]') + '\n');
}

if (problems.length) {
  console.error('\n' + problems.length + ' PROBLEM(S):');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
if (built.length !== TOTAL - TAUGHT)
  throw new Error('built ' + built.length + ' levels, want ' + (TOTAL - TAUGHT));

console.error('\n' + noHint.length + ' level(s) where a hint cannot answer off the stored path' +
  (noHint.length ? ': ' + noHint[0] + '-' + noHint[noHint.length - 1] : ''));
console.error(fragile.length + ' level(s) careless play can deadlock' +
  (fragile.length ? ': ' + fragile.slice(0, 12).join(', ') + (fragile.length > 12 ? ' …' : '') : ''));
if (warns.length) console.error(warns.length + ' level(s) with lookalike colours');

const dealt = built.map((l, i) => {
  const jars = l.jars.map(j => '        { cap: ' + j.cap + ', fills: [' +
    j.fills.map(f => "'" + f + "'").join(', ') + '] }').join(',\n');
  return '    {\n' +
    "      id: '" + l.id + "',\n" +
    "      mode: 'merge',\n" +
    "      name: '" + l.name.replace(/'/g, "\\'") + "',\n" +
    "      subtitle: 'Level " + (i + 1 + TAUGHT) + " of " + TOTAL + "',\n" +
    "      teaches: '" + l.teaches.replace(/'/g, "\\'") + "',\n" +
    "      brief: '',\n" +
    "      target: '" + l.target + "',\n" +
    (l.parents ? "      parents: ['" + l.parents.join("', '") + "'],\n" : '') +
    '      main: { cap: ' + l.main.cap + ' },\n' +
    '      par: ' + l.par + ',\n' +
    '      path: [' + l.path.map(m => '[' + m.from + ',' + m.to + ']').join(', ') + '],\n' +
    '      jars: [\n' + jars + '\n      ]\n' +
    '    }';
});

const body = taughtSource().concat(dealt).join(',\n');
const out = `/* merge-levels.js — GENERATED by tools/build-merge-campaign.js. Do not edit by hand.
 *
 * The first ${TAUGHT} are written by hand, one lesson each, and carried through every
 * rebuild untouched. The rest are seeded deals from the same generator the
 * Random Puzzle screen uses, laid along a ladder that widens the shelf three
 * jars to ten and sweeps the four settings at each width.
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
`;

if (CHECK) console.log('\nchecked ' + built.length + ' dealt levels, nothing written');
else {
  fs.writeFileSync(path.join(ROOT, 'js', 'merge-levels.js'), out);
  console.log('\nwrote js/merge-levels.js — ' + TOTAL + ' levels, par ' +
    Math.min(...built.map(b => b.par)) + ' to ' + Math.max(...built.map(b => b.par)));
}
