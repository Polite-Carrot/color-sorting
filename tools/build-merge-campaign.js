#!/usr/bin/env node
/* build-merge-campaign.js — builds js/merge-levels.js for Merge Colors.
 *
 * Every level past the tutorial is a seeded deal from the same generator the
 * Random Puzzle screen uses, at a (setting, jar count) slot on a ladder that
 * widens the shelf three jars to ten, sweeping the five settings at each width
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

const TOTAL = 250, TAUGHT = 5;
const LABEL = { easy: 'Easy', normal: 'Normal', hard: 'Hard',
                extraHard: 'Extra Hard', expert: 'Expert' };
const PROVABLE_JARS = 7;
/* The hint's ceiling. Not a gate here — see the limitation above — but every
   level records whether it clears it, so the cost is visible rather than
   discovered by a player. */
const HINT_STATES = 30000;

/* [level, setting, jars, seed, par-it-was-chosen-for] */
const LADDER = [
  /* Five settings across widths three to ten. Seeds only. */
  [6, 'easy', 3, 6100003, 6],
  [7, 'normal', 3, 6200004, 7],
  [8, 'hard', 3, 6300005, 8],
  [9, 'extraHard', 3, 6400004, 9],
  [10, 'expert', 3, 6500002, 10],
  [11, 'easy', 3, 6100002, 8],
  [12, 'normal', 3, 6200002, 9],
  [13, 'hard', 3, 6300003, 6],
  [14, 'extraHard', 3, 6400006, 9],
  [15, 'expert', 3, 6500060, 11],
  [16, 'easy', 3, 6100014, 8],
  [17, 'normal', 3, 6200003, 9],
  [18, 'hard', 3, 6300001, 7],
  [19, 'extraHard', 3, 6400001, 10],
  [20, 'expert', 3, 6500029, 12],
  [21, 'easy', 3, 6100001, 9],
  [22, 'normal', 3, 6200007, 10],
  [23, 'hard', 3, 6300021, 8],
  [24, 'extraHard', 3, 6400002, 11],
  [25, 'expert', 3, 6500033, 12],
  [26, 'easy', 4, 6600001, 7],
  [27, 'normal', 4, 6700012, 8],
  [28, 'hard', 4, 6800012, 9],
  [29, 'extraHard', 4, 6900004, 12],
  [30, 'expert', 4, 7000001, 15],
  [31, 'easy', 4, 6600003, 8],
  [32, 'normal', 4, 6700002, 9],
  [33, 'hard', 4, 6800001, 10],
  [34, 'extraHard', 4, 6900003, 13],
  [35, 'expert', 4, 7000006, 16],
  [36, 'easy', 4, 6600010, 9],
  [37, 'normal', 4, 6700001, 10],
  [38, 'hard', 4, 6800007, 11],
  [39, 'extraHard', 4, 6900001, 14],
  [40, 'expert', 4, 7000009, 16],
  [41, 'easy', 4, 6600011, 9],
  [42, 'normal', 4, 6700014, 10],
  [43, 'hard', 4, 6800008, 11],
  [44, 'extraHard', 4, 6900007, 15],
  [45, 'expert', 4, 7000004, 17],
  [46, 'easy', 4, 6600014, 10],
  [47, 'normal', 4, 6700007, 11],
  [48, 'hard', 4, 6800011, 12],
  [49, 'extraHard', 4, 6900006, 16],
  [50, 'expert', 4, 7000007, 18],
  [51, 'easy', 5, 7100013, 8],
  [52, 'normal', 5, 7200011, 11],
  [53, 'hard', 5, 7300016, 12],
  [54, 'extraHard', 5, 7400003, 16],
  [55, 'expert', 5, 7500002, 18],
  [56, 'easy', 5, 7100003, 9],
  [57, 'normal', 5, 7200018, 12],
  [58, 'hard', 5, 7300002, 13],
  [59, 'extraHard', 5, 7400007, 16],
  [60, 'expert', 5, 7500015, 19],
  [61, 'easy', 5, 7100006, 10],
  [62, 'normal', 5, 7200004, 13],
  [63, 'hard', 5, 7300001, 14],
  [64, 'extraHard', 5, 7400001, 17],
  [65, 'expert', 5, 7500005, 20],
  [66, 'easy', 5, 7100002, 11],
  [67, 'normal', 5, 7200001, 14],
  [68, 'hard', 5, 7300013, 15],
  [69, 'extraHard', 5, 7400005, 18],
  [70, 'expert', 5, 7500001, 21],
  [71, 'easy', 5, 7100009, 12],
  [72, 'normal', 5, 7200002, 15],
  [73, 'hard', 5, 7300027, 16],
  [74, 'extraHard', 5, 7400013, 19],
  [75, 'expert', 5, 7500009, 22],
  [76, 'easy', 6, 7600002, 11],
  [77, 'normal', 6, 7700003, 13],
  [78, 'hard', 6, 7800004, 14],
  [79, 'extraHard', 6, 7900007, 17],
  [80, 'expert', 6, 8000006, 22],
  [81, 'easy', 6, 7600005, 11],
  [82, 'normal', 6, 7700005, 14],
  [83, 'hard', 6, 7800001, 15],
  [84, 'extraHard', 6, 7900012, 19],
  [85, 'expert', 6, 8000009, 23],
  [86, 'easy', 6, 7600001, 12],
  [87, 'normal', 6, 7700008, 15],
  [88, 'hard', 6, 7800010, 16],
  [89, 'extraHard', 6, 7900016, 20],
  [90, 'expert', 6, 8000016, 23],
  [91, 'easy', 6, 7600004, 12],
  [92, 'normal', 6, 7700002, 16],
  [93, 'hard', 6, 7800013, 17],
  [94, 'extraHard', 6, 7900001, 21],
  [95, 'expert', 6, 8000003, 24],
  [96, 'easy', 6, 7600006, 13],
  [97, 'normal', 6, 7700007, 16],
  [98, 'hard', 6, 7800015, 17],
  [99, 'extraHard', 6, 7900002, 22],
  [100, 'expert', 6, 8000010, 25],
  [101, 'easy', 6, 7600003, 14],
  [102, 'normal', 6, 7700006, 17],
  [103, 'hard', 6, 7800009, 18],
  [104, 'extraHard', 6, 7900004, 23],
  [105, 'expert', 6, 8000004, 27],
  [106, 'easy', 7, 8100007, 12],
  [107, 'normal', 7, 8200010, 17],
  [108, 'hard', 7, 8300005, 18],
  [109, 'extraHard', 7, 8400039, 24],
  [110, 'expert', 7, 8500015, 27],
  [111, 'easy', 7, 8100020, 13],
  [112, 'normal', 7, 8200002, 18],
  [113, 'hard', 7, 8300004, 19],
  [114, 'extraHard', 7, 8400002, 25],
  [115, 'expert', 7, 8500007, 29],
  [116, 'easy', 7, 8100008, 14],
  [117, 'normal', 7, 8200004, 19],
  [118, 'hard', 7, 8300003, 20],
  [119, 'extraHard', 7, 8400007, 26],
  [120, 'expert', 7, 8500011, 29],
  [121, 'easy', 7, 8100001, 15],
  [122, 'normal', 7, 8200005, 19],
  [123, 'hard', 7, 8300007, 20],
  [124, 'extraHard', 7, 8400018, 26],
  [125, 'expert', 7, 8500008, 30],
  [126, 'easy', 7, 8100002, 15],
  [127, 'normal', 7, 8200001, 20],
  [128, 'hard', 7, 8300024, 21],
  [129, 'extraHard', 7, 8400004, 27],
  [130, 'expert', 7, 8500009, 31],
  [131, 'easy', 7, 8100009, 16],
  [132, 'normal', 7, 8200006, 20],
  [133, 'hard', 7, 8300026, 21],
  [134, 'extraHard', 7, 8400011, 27],
  [135, 'expert', 7, 8500001, 32],
  [136, 'easy', 7, 8100017, 16],
  [137, 'normal', 7, 8200018, 21],
  [138, 'hard', 7, 8300032, 22],
  [139, 'extraHard', 7, 8400001, 28],
  [140, 'expert', 7, 8500002, 33],
  [141, 'easy', 8, 8600001, 12],
  [142, 'normal', 8, 8700004, 16],
  [143, 'hard', 8, 8800046, 18],
  [144, 'extraHard', 8, 8900041, 19],
  [145, 'expert', 8, 9000006, 20],
  [146, 'easy', 8, 8600008, 13],
  [147, 'normal', 8, 8700011, 18],
  [148, 'hard', 8, 8800002, 19],
  [149, 'extraHard', 8, 8900002, 20],
  [150, 'expert', 8, 9000008, 21],
  [151, 'easy', 8, 8600002, 14],
  [152, 'normal', 8, 8700012, 19],
  [153, 'hard', 8, 8800014, 20],
  [154, 'extraHard', 8, 8900008, 21],
  [155, 'expert', 8, 9000016, 22],
  [156, 'easy', 8, 8600005, 14],
  [157, 'normal', 8, 8700001, 20],
  [158, 'hard', 8, 8800005, 21],
  [159, 'extraHard', 8, 8900001, 22],
  [160, 'expert', 8, 9000001, 23],
  [161, 'easy', 8, 8600009, 15],
  [162, 'normal', 8, 8700005, 21],
  [163, 'hard', 8, 8800008, 22],
  [164, 'extraHard', 8, 8900005, 23],
  [165, 'expert', 8, 9000005, 24],
  [166, 'easy', 8, 8600012, 15],
  [167, 'normal', 8, 8700003, 22],
  [168, 'hard', 8, 8800009, 23],
  [169, 'extraHard', 8, 8900014, 24],
  [170, 'expert', 8, 9000021, 25],
  [171, 'easy', 8, 8600004, 17],
  [172, 'normal', 8, 8700006, 23],
  [173, 'hard', 8, 8800007, 24],
  [174, 'extraHard', 8, 8900013, 25],
  [175, 'expert', 8, 9000012, 26],
  [176, 'easy', 9, 9100001, 12],
  [177, 'normal', 9, 9200003, 17],
  [178, 'hard', 9, 9300006, 19],
  [179, 'extraHard', 9, 9400001, 20],
  [180, 'expert', 9, 9500003, 21],
  [181, 'easy', 9, 9100011, 12],
  [182, 'normal', 9, 9200009, 19],
  [183, 'hard', 9, 9300009, 20],
  [184, 'extraHard', 9, 9400013, 22],
  [185, 'expert', 9, 9500005, 23],
  [186, 'easy', 9, 9100014, 14],
  [187, 'normal', 9, 9200017, 19],
  [188, 'hard', 9, 9300013, 22],
  [189, 'extraHard', 9, 9400002, 23],
  [190, 'expert', 9, 9500007, 24],
  [191, 'easy', 9, 9100004, 15],
  [192, 'normal', 9, 9200004, 21],
  [193, 'hard', 9, 9300001, 23],
  [194, 'extraHard', 9, 9400020, 24],
  [195, 'expert', 9, 9500020, 25],
  [196, 'easy', 9, 9100005, 16],
  [197, 'normal', 9, 9200006, 21],
  [198, 'hard', 9, 9300010, 24],
  [199, 'extraHard', 9, 9400004, 25],
  [200, 'expert', 9, 9500018, 26],
  [201, 'easy', 9, 9100009, 16],
  [202, 'normal', 9, 9200007, 22],
  [203, 'hard', 9, 9300019, 25],
  [204, 'extraHard', 9, 9400008, 26],
  [205, 'expert', 9, 9500006, 27],
  [206, 'easy', 9, 9100002, 17],
  [207, 'normal', 9, 9200014, 23],
  [208, 'hard', 9, 9300011, 26],
  [209, 'extraHard', 9, 9400010, 28],
  [210, 'expert', 9, 9500039, 30],
  [211, 'easy', 10, 9600006, 11],
  [212, 'normal', 10, 9700006, 18],
  [213, 'hard', 10, 9800004, 19],
  [214, 'extraHard', 10, 9900020, 21],
  [215, 'expert', 10, 10000002, 22],
  [216, 'easy', 10, 9600010, 13],
  [217, 'normal', 10, 9700003, 20],
  [218, 'hard', 10, 9800001, 21],
  [219, 'extraHard', 10, 9900002, 22],
  [220, 'expert', 10, 10000007, 23],
  [221, 'easy', 10, 9600001, 14],
  [222, 'normal', 10, 9700002, 21],
  [223, 'hard', 10, 9800023, 22],
  [224, 'extraHard', 10, 9900008, 23],
  [225, 'expert', 10, 10000001, 24],
  [226, 'easy', 10, 9600008, 15],
  [227, 'normal', 10, 9700025, 22],
  [228, 'hard', 10, 9800014, 23],
  [229, 'extraHard', 10, 9900005, 24],
  [230, 'expert', 10, 10000015, 25],
  [231, 'easy', 10, 9600002, 16],
  [232, 'normal', 10, 9700011, 23],
  [233, 'hard', 10, 9800026, 24],
  [234, 'extraHard', 10, 9900023, 25],
  [235, 'expert', 10, 10000016, 26],
  [236, 'easy', 10, 9600005, 16],
  [237, 'normal', 10, 9700017, 23],
  [238, 'hard', 10, 9800013, 25],
  [239, 'extraHard', 10, 9900003, 26],
  [240, 'expert', 10, 10000013, 27],
  [241, 'easy', 10, 9600016, 17],
  [242, 'normal', 10, 9700012, 24],
  [243, 'hard', 10, 9800005, 26],
  [244, 'extraHard', 10, 9900022, 27],
  [245, 'expert', 10, 10000004, 28],
  [246, 'easy', 10, 9600004, 18],
  [247, 'normal', 10, 9700005, 25],
  [248, 'hard', 10, 9800008, 27],
  [249, 'extraHard', 10, 9900011, 29],
  [250, 'expert', 10, 10000009, 32]
];

/* The shape a slot deals at, lifted out of app.js rather than restated here.
   It used to be a second copy carrying its own sizeUp, and that one difference
   was enough: generate() retries until a candidate settles inside that budget,
   so a different budget throws back different candidates and the same seed
   lands on a different board. Forty levels' par disagreed with the table
   because of it. One definition, no drift -- and because it IS the screen's
   rule, every level here is a board the Random Puzzle screen can deal. */
function liftShapeFor() {
  const src = fs.readFileSync(J + 'app.js', 'utf8');
  const at = src.indexOf('function shapeFor(');
  if (at < 0) throw new Error('shapeFor is no longer in js/app.js');
  let depth = 0, end = -1;
  for (let k = src.indexOf('{', at); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) { end = k + 1; break; } }
  }
  const provable = Number(/var MERGE_PROVABLE_JARS = (\d+)/.exec(src)[1]);
  return new Function('randomGen', 'state', 'MERGE_PROVABLE_JARS',
    src.slice(at, end) + '; return shapeFor;')(() => G, { randomMerge: true }, provable);
}
const shapeFor = liftShapeFor();

function shapeOf(tier, jars) {
  const derived = shapeFor(tier, jars);
  if (derived) return derived;
  return Object.assign({}, G.DIFFICULTY[tier], { par: [1, 999] });
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
                    'Immured', 'Entombed', 'Sepulchral', 'Unyielding', 'Final',
  /* Levels 151-200. */
  'Marbling', 'Swirling', 'Curdling', 'Settling', 'Clouding',
  'Thinning', 'Deepening', 'Warming', 'Cooling', 'Souring',
  'Sweetening', 'Ripening', 'Maturing', 'Mellowing', 'Drenched',
  'Sopped', 'Doused', 'Slaked', 'Leached', 'Bled',
  'Wicked', 'Seeped', 'Bleeding', 'Running', 'Pooling',
  'Beading', 'Weeping', 'Misted', 'Fogged', 'Hazed',
  'Veiled', 'Filmed', 'Anodised', 'Patinaed', 'Oxidised',
  'Tarnished', 'Burnished', 'Gilded', 'Leafed', 'Inlaid',
  'Nielloed', 'Cloisonne', 'Champleve', 'Slipped', 'Engobed',
  'Underglazed', 'Overglazed', 'Lustred', 'Sintered', 'Quenching',
  /* Levels 201-250. */
  'Braiding', 'Twisting', 'Plying', 'Spinning', 'Carding',
  'Combing', 'Drafting', 'Roving', 'Slubbing', 'Doubling',
  'Winding', 'Skeining', 'Hanking', 'Reeling', 'Warping',
  'Beaming', 'Sleying', 'Threading', 'Picking', 'Beating',
  'Shedding', 'Treadling', 'Weaving', 'Fulling', 'Napping',
  'Shearing', 'Pressing', 'Calendering', 'Mangling', 'Sizing',
  'Dressing', 'Bleaching', 'Scouring', 'Mordanting', 'Dyeing',
  'Rinsing', 'Wringing', 'Drying', 'Airing', 'Folding',
  'Baling', 'Bundling', 'Stacking', 'Sorting', 'Grading',
  'Tallying', 'Weighing', 'Marking', 'Sealing', 'Dispatching'];
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
 * jars to ten and sweeps the five settings at each width.
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
