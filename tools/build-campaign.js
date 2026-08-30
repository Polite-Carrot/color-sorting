#!/usr/bin/env node
/* build-campaign.js — builds js/levels.js for Sort Colors.
 *
 * Every level past the tutorial is a seeded deal from the same generator the
 * Random Puzzle screen uses, at a (setting, jar count) slot on a ladder. The
 * ladder walks width-major and setting-minor: the shelf grows one jar at a
 * time, and at each width the four settings are swept in order, several times
 * over as the shelf gets wider. Each sweep draws a board of higher par than
 * the last, so par saws gently up inside a block and each block peaks above
 * the one before it.
 *
 * The seeds below were chosen by dealing eighty boards per slot, solving each
 * for its true par, and keeping the one nearest that slot's target. They are
 * written out rather than re-picked so a build is reproducible and reviewable
 * — and the par each was chosen for is recorded beside it, so if the generator
 * ever changes under this table the build FAILS rather than quietly shipping a
 * different campaign.
 *
 * Boards are baked into js/levels.js in full. Shipping bare seeds would mean a
 * later tweak to the generator silently rewriting levels people had played.
 *
 *   node tools/build-campaign.js            build and write
 *   node tools/build-campaign.js --check    verify only, write nothing
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), J = path.join(ROOT, 'js') + path.sep;
require(J + 'colour.js'); require(J + 'engine.js');
require(J + 'solver.js'); require(J + 'generator.js');
require(J + 'merge.js'); require(J + 'merge-generator.js');
const C = globalThis.Colour, S = globalThis.Solver, { Game } = globalThis.Engine;
const G = globalThis.Generator;

const TOTAL = 200, TAUGHT = 5;
const LABEL = { easy: 'Easy', normal: 'Normal', hard: 'Hard', extraHard: 'Extra Hard' };

/* [level, setting, jars, seed, par-it-was-chosen-for, jar depth (optional)]
 *
 * Depth is absent for levels 6-150, which take the jar height their setting
 * ships with. From 151 it is given, because depth is the axis the width ladder
 * never uses and the one that lifts par once the shelf cannot get any wider:
 * measured at fourteen jars, going from six deep to seven takes par from 29 to
 * 49, and the solver does not notice -- a deal is still under ten milliseconds.
 * Nine deep is the ceiling, and not for the search but for the screen: at ten
 * the fitter can no longer show a whole shelf on a 390px phone. */
const LADDER = [
  [6, 'easy', 4, 100005, 7],
  [7, 'normal', 4, 200011, 8],
  [8, 'hard', 4, 300009, 10],
  [9, 'extraHard', 4, 400002, 11],
  [10, 'easy', 5, 500004, 8],
  [11, 'normal', 5, 600015, 9],
  [12, 'hard', 5, 700005, 13],
  [13, 'extraHard', 5, 800011, 14],
  [14, 'easy', 6, 900001, 8],
  [15, 'normal', 6, 1000006, 9],
  [16, 'hard', 6, 1100033, 13],
  [17, 'extraHard', 6, 1200005, 14],
  [18, 'easy', 6, 900009, 9],
  [19, 'normal', 6, 1000003, 11],
  [20, 'hard', 6, 1100030, 16],
  [21, 'extraHard', 6, 1200042, 17],
  [22, 'easy', 7, 1300002, 9],
  [23, 'normal', 7, 1400006, 11],
  [24, 'hard', 7, 1500018, 15],
  [25, 'extraHard', 7, 1600002, 16],
  [26, 'easy', 7, 1300001, 11],
  [27, 'normal', 7, 1400001, 13],
  [28, 'hard', 7, 1500006, 18],
  [29, 'extraHard', 7, 1600007, 19],
  [30, 'easy', 8, 1700007, 11],
  [31, 'normal', 8, 1800008, 13],
  [32, 'hard', 8, 1900004, 18],
  [33, 'extraHard', 8, 2000007, 19],
  [34, 'easy', 8, 1700001, 13],
  [35, 'normal', 8, 1800005, 15],
  [36, 'hard', 8, 1900013, 22],
  [37, 'extraHard', 8, 2000039, 23],
  [38, 'easy', 9, 2100005, 11],
  [39, 'normal', 9, 2200007, 12],
  [40, 'hard', 9, 2300011, 19],
  [41, 'extraHard', 9, 2400005, 20],
  [42, 'easy', 9, 2100003, 13],
  [43, 'normal', 9, 2200001, 15],
  [44, 'hard', 9, 2300005, 22],
  [45, 'extraHard', 9, 2400011, 23],
  [46, 'easy', 9, 2100008, 15],
  [47, 'normal', 9, 2200006, 16],
  [48, 'hard', 9, 2300009, 24],
  [49, 'extraHard', 9, 2400001, 25],
  [50, 'easy', 10, 2500009, 12],
  [51, 'normal', 10, 2600022, 15],
  [52, 'hard', 10, 2700017, 22],
  [53, 'extraHard', 10, 2800010, 23],
  [54, 'easy', 10, 2500003, 14],
  [55, 'normal', 10, 2600002, 17],
  [56, 'hard', 10, 2700004, 24],
  [57, 'extraHard', 10, 2800001, 25],
  [58, 'easy', 10, 2500005, 16],
  [59, 'normal', 10, 2600015, 18],
  [60, 'hard', 10, 2700006, 28],
  [61, 'extraHard', 10, 2800029, 29],
  [62, 'easy', 11, 2900003, 14],
  [63, 'normal', 11, 3000007, 16],
  [64, 'hard', 11, 3100009, 25],
  [65, 'extraHard', 11, 3200025, 26],
  [66, 'easy', 11, 2900001, 16],
  [67, 'normal', 11, 3000002, 19],
  [68, 'hard', 11, 3100005, 28],
  [69, 'extraHard', 11, 3200002, 29],
  [70, 'easy', 11, 2900005, 18],
  [71, 'normal', 11, 3000004, 21],
  [72, 'hard', 11, 3100003, 31],
  [73, 'extraHard', 11, 3200001, 32],
  [74, 'easy', 12, 3300019, 14],
  [75, 'normal', 12, 3400009, 17],
  [76, 'hard', 12, 3500017, 24],
  [77, 'extraHard', 12, 3600018, 27],
  [78, 'easy', 12, 3300018, 16],
  [79, 'normal', 12, 3400036, 19],
  [80, 'hard', 12, 3500007, 27],
  [81, 'extraHard', 12, 3600003, 29],
  [82, 'easy', 12, 3300007, 17],
  [83, 'normal', 12, 3400011, 21],
  [84, 'hard', 12, 3500030, 30],
  [85, 'extraHard', 12, 3600011, 31],
  [86, 'easy', 12, 3300011, 19],
  [87, 'normal', 12, 3400010, 23],
  [88, 'hard', 12, 3500001, 33],
  [89, 'extraHard', 12, 3600034, 34],
  [90, 'easy', 13, 3700018, 16],
  [91, 'normal', 13, 3800010, 19],
  [92, 'hard', 13, 3900010, 29],
  [93, 'extraHard', 13, 4000014, 31],
  [94, 'easy', 13, 3700011, 18],
  [95, 'normal', 13, 3800001, 21],
  [96, 'hard', 13, 3900002, 32],
  [97, 'extraHard', 13, 4000029, 33],
  [98, 'easy', 13, 3700003, 20],
  [99, 'normal', 13, 3800033, 23],
  [100, 'hard', 13, 3900026, 35],
  [101, 'extraHard', 13, 4000001, 36],
  [102, 'easy', 13, 3700006, 21],
  [103, 'normal', 13, 3800007, 25],
  [104, 'hard', 13, 3900005, 38],
  [105, 'extraHard', 13, 4000011, 39],
  [106, 'easy', 14, 4100004, 15],
  [107, 'normal', 14, 4200001, 19],
  [108, 'hard', 14, 4300005, 30],
  [109, 'extraHard', 14, 4400009, 31],
  [110, 'easy', 14, 4100015, 18],
  [111, 'normal', 14, 4200011, 22],
  [112, 'hard', 14, 4300009, 34],
  [113, 'extraHard', 14, 4400001, 35],
  [114, 'easy', 14, 4100006, 19],
  [115, 'normal', 14, 4200008, 23],
  [116, 'hard', 14, 4300016, 36],
  [117, 'extraHard', 14, 4400010, 37],
  [118, 'easy', 14, 4100001, 21],
  [119, 'normal', 14, 4200003, 24],
  [120, 'hard', 14, 4300018, 37],
  [121, 'extraHard', 14, 4400005, 38],
  [122, 'easy', 14, 4100007, 23],
  [123, 'normal', 14, 4200028, 26],
  [124, 'hard', 14, 4300025, 40],
  [125, 'extraHard', 14, 4400013, 41],
  [126, 'extraHard', 14, 4400004, 40],
  [127, 'extraHard', 14, 4400049, 40],
  [128, 'extraHard', 14, 4400075, 40],
  [129, 'extraHard', 14, 4400076, 40],
  [130, 'extraHard', 14, 4400003, 39],
  [131, 'extraHard', 14, 4400019, 39],
  [132, 'extraHard', 14, 4400036, 39],
  [133, 'extraHard', 14, 4400038, 39],
  [134, 'extraHard', 14, 4400074, 39],
  [135, 'extraHard', 14, 4400079, 39],
  [136, 'extraHard', 14, 4400014, 41],
  [137, 'extraHard', 14, 4400035, 41],
  [138, 'extraHard', 14, 4400077, 41],
  [139, 'extraHard', 14, 4400012, 38],
  [140, 'extraHard', 14, 4400017, 38],
  [141, 'extraHard', 14, 4400026, 38],
  [142, 'extraHard', 14, 4400069, 38],
  [143, 'extraHard', 14, 4400002, 42],
  [144, 'extraHard', 14, 4400042, 42],
  [145, 'extraHard', 14, 4400070, 42],
  [146, 'extraHard', 14, 4400025, 37],
  [147, 'extraHard', 14, 4400078, 37],
  [148, 'extraHard', 14, 4400048, 43],
  [149, 'extraHard', 14, 4400023, 36],
  [150, 'extraHard', 14, 4400024, 36],

  /* Levels 151-200: the depth-7 block. */
  [151, 'easy', 9, 500100004, 26, 7],
  [152, 'normal', 9, 500200027, 27, 7],
  [153, 'hard', 9, 500300018, 28, 7],
  [154, 'extraHard', 9, 500400012, 29, 7],
  [155, 'easy', 10, 500500005, 29, 7],
  [156, 'normal', 10, 500600008, 30, 7],
  [157, 'hard', 10, 500700002, 31, 7],
  [158, 'extraHard', 10, 500800004, 32, 7],
  [159, 'easy', 11, 500900011, 29, 7],
  [160, 'normal', 11, 501000004, 30, 7],
  [161, 'hard', 11, 501100002, 32, 7],
  [162, 'extraHard', 11, 501200023, 33, 7],
  [163, 'easy', 11, 500900006, 33, 7],
  [164, 'normal', 11, 501000006, 35, 7],
  [165, 'hard', 11, 501100004, 36, 7],
  [166, 'extraHard', 11, 501200001, 37, 7],
  [167, 'easy', 12, 501300011, 32, 7],
  [168, 'normal', 12, 501400005, 33, 7],
  [169, 'hard', 12, 501500009, 34, 7],
  [170, 'extraHard', 12, 501600002, 35, 7],
  [171, 'easy', 12, 501300014, 35, 7],
  [172, 'normal', 12, 501400013, 36, 7],
  [173, 'hard', 12, 501500001, 39, 7],
  [174, 'extraHard', 12, 501600001, 40, 7],
  [175, 'easy', 13, 501700004, 34, 7],
  [176, 'normal', 13, 501800004, 35, 7],
  [177, 'hard', 13, 501900011, 36, 7],
  [178, 'extraHard', 13, 502000002, 37, 7],
  [179, 'easy', 13, 501700001, 38, 7],
  [180, 'normal', 13, 501800080, 39, 7],
  [181, 'hard', 13, 501900015, 40, 7],
  [182, 'extraHard', 13, 502000034, 41, 7],
  [183, 'easy', 13, 501700014, 41, 7],
  [184, 'normal', 13, 501800006, 42, 7],
  [185, 'hard', 13, 501900003, 43, 7],
  [186, 'extraHard', 13, 502000012, 44, 7],
  [187, 'easy', 14, 502100014, 36, 7],
  [188, 'normal', 14, 502200004, 37, 7],
  [189, 'hard', 14, 502300005, 40, 7],
  [190, 'extraHard', 14, 502400003, 41, 7],
  [191, 'easy', 14, 502100001, 38, 7],
  [192, 'normal', 14, 502200005, 39, 7],
  [193, 'hard', 14, 502300001, 44, 7],
  [194, 'extraHard', 14, 502400017, 45, 7],
  [195, 'easy', 14, 502100002, 42, 7],
  [196, 'normal', 14, 502200016, 43, 7],
  [197, 'hard', 14, 502300003, 48, 7],
  [198, 'extraHard', 14, 502400043, 49, 7],
  [199, 'extraHard', 14, 502400006, 50, 7],
  [200, 'extraHard', 14, 502400024, 50, 7]
];

/* The shape a slot deals at is derived exactly as the Random Puzzle screen
   derives it, by lifting shapeFor out of app.js rather than restating it here
   — a second copy would drift from the game the first time either changed. At
   a setting's own width shapeFor declines, meaning "the preset already is this
   shape"; the preset is then used as it stands, with its par band opened up so
   the ladder's target picks the board rather than the band. */
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
    src.slice(at, end) + '; return shapeFor;')(() => G, { randomMerge: false }, provable);
}
const shapeFor = liftShapeFor();

function shapeOf(tier, jars, depth) {
  if (depth) return deepShape(tier, jars, depth);
  const derived = shapeFor(tier, jars);
  if (derived) return derived;
  return Object.assign({}, G.DIFFICULTY[tier], { par: [1, 999] });
}

/* Depth is not something shapeFor can express: the Random Puzzle screen has no
   depth control, so its rule derives everything from width alone. This is that
   same arithmetic with the jar height given rather than read off the setting.
   Kept separate rather than folded into shapeFor, so the screen's behaviour is
   never changed by a campaign requirement. */
function deepShape(tier, jars, depth) {
  const base = G.DIFFICULTY[tier];
  const cells = jars * depth, slack = Math.round(cells * 0.33);
  const mainCap = Math.max(2, Math.round(cells * (base.mainCap / (base.sideJars * base.sideCap))));
  const fillers = Math.max(1, Math.min(7, jars - 1,
    Math.max(base.fillers, Math.round(jars * (base.fillers / base.sideJars)))));
  const fillerUnits = cells - slack - mainCap;
  if (fillerUnits < fillers)
    throw new Error(tier + '@' + jars + 'x' + depth + ': no room for obstacle colours');
  return Object.assign({}, base, { sideJars: jars, sideCap: depth, mainCap,
    fillers, fillerUnits, par: [1, 999], sizeUp: 250000 });
}

/* ── the checks every dealt level has to pass ──────────────────────────── */

function inspect(lvl) {
  const g = new Game(lvl);
  const solved = S.solve(g.position(), 500000, 15000);
  if (solved.budgetExceeded) return { bad: 'solver ran out of room' };
  if (solved.par == null) return { bad: 'cannot be finished' };
  for (const mv of solved.path)
    if (!g.pour('jar' + mv.from, mv.to === -1 ? 'main' : 'jar' + mv.to).ok)
      return { bad: 'illegal solution move' };
  if (!g.won) return { bad: 'solution does not win' };

  const units = lvl.jars.reduce((n, j) => n + j.fills.filter(c => c === lvl.target).length, 0);
  if (units !== lvl.main.cap)
    return { bad: 'target units ' + units + ' != big jar capacity ' + lvl.main.cap };

  /* Two colours too close to tell apart only warn on a board being shipped.
     The palette is meant to guarantee the gap; when a colour is retuned under
     boards that already exist that is a known problem with a known fix, and
     being unable to build until somebody settles it helps nobody. */
  const used = [...new Set(lvl.jars.flatMap(j => j.fills))];
  let warn = null;
  for (let a = 0; a < used.length && !warn; a++)
    for (let b = a + 1; b < used.length && !warn; b++)
      if (C.distance(used[a], used[b]) < 150) warn = 'lookalikes ' + used[a] + '/' + used[b];
  return { par: solved.par, colours: used.length, warn: warn };
}

/* Can it be played badly and still be finished? A campaign level an ordinary
   run of careless moves can kill is a wall, not a puzzle. */
let rs = 99;
const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
const top = s => s.length ? s[s.length - 1] : null;

function survivable(lvl, trials) {
  /* Reset the stream per board. Left running, a level's verdict depends on how
     many random moves the levels before it happened to use, so the same board
     passes or fails according to its neighbours -- and a seed picked to replace
     a failure could fail again once it sat in a different position. */
  rs = 99;
  for (let a = 0; a < trials; a++) {
    const g = new Game(lvl);
    for (let step = 1; step <= 250; step++) {
      const ids = g.jars.map(j => j.id);
      const legal = [];
      for (const f of ids) for (const to of ids.concat(['main']))
        if (f !== to && g.pourable(f, to)) legal.push([f, to]);
      if (!legal.length) return false;
      const grab = legal.filter(m => m[1] === 'main');
      let pick;
      if (grab.length) pick = grab;
      else {
        const covering = legal.filter(m => {
          const s = g.get(m[0]).cells;
          return s.includes(g.target) && top(s) !== g.target;
        });
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

/* ── names ─────────────────────────────────────────────────────────────── */

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
  'Overlaid', 'Entwined', 'Meshed',
  'Furrowed', 'Plaited', 'Stippled', 'Culled', 'Racked',
  'Fathomed', 'Barrelled', 'Cellared', 'Brimming', 'Capsized',
  'Sedimented', 'Percolated', 'Clarified', 'Filtered',
  'Distilled', 'Fermented', 'Casked', 'Crated', 'Siloed',
  'Stowed', 'Ballasted', 'Bilged', 'Hoarded', 'Vaulted',
  'Labyrinthine',
  'Compacted', 'Impacted', 'Congested', 'Gridlocked', 'Jammed',
  'Clotted', 'Thickened', 'Curdled', 'Coagulated', 'Encrusted',
  'Petrified', 'Fossilised', 'Calcified', 'Mineralised', 'Seamed',
  'Veined', 'Quarried', 'Mined', 'Tunnelled', 'Burrowed',
  'Cavernous', 'Abyssal', 'Benthic', 'Sounded', 'Plumbed',
  'Trawled', 'Netted', 'Seined', 'Creeled', 'Beached',
  'Shoaled', 'Reefed', 'Estuarine', 'Tidal', 'Undertowed',
  'Whirlpooled', 'Maelstromed', 'Vortexed', 'Spiralled', 'Helixed',
  'Coiled', 'Serpentine', 'Byzantine', 'Convoluted', 'Bewildering',
  'Confounded', 'Inextricable', 'Unfathomed', 'Uncharted', 'Terminal',
  'Sheer',
  /* Levels 151-200, the deep-jar block. */
  'Deepened', 'Steepened', 'Trenched', 'Underlaid', 'Subsided',
  'Compressed', 'Condensed', 'Crammed', 'Stuffed', 'Freighted',
  'Laden', 'Weighted', 'Anchored', 'Moored', 'Berthed',
  'Keeled', 'Hulled', 'Ribbed', 'Planked', 'Caulked',
  'Tarred', 'Lashed', 'Rigged', 'Furled', 'Belayed',
  'Cleated', 'Winched', 'Hauled', 'Heaved', 'Stratified',
  'Bedded', 'Terraced', 'Tiered', 'Storeyed', 'Shelved',
  'Stepped', 'Graded', 'Banked', 'Ledged', 'Pillared',
  'Buttressed', 'Girdered', 'Trussed', 'Scaffolded', 'Bricked',
  'Mortared', 'Cemented', 'Grouted', 'Slabbed', 'Flagged'];
if (ADJECTIVES.length < TOTAL - TAUGHT)
  throw new Error('ADJECTIVES has ' + ADJECTIVES.length + ' names, ' +
    (TOTAL - TAUGHT) + ' dealt levels need naming');

/* ── the five taught levels, carried over verbatim ─────────────────────── */

/* Read back out of the file being replaced rather than restated here, so the
   boards that teach the rules cannot drift while the rest is regenerated. */
function taughtSource() {
  const src = fs.readFileSync(J + 'levels.js', 'utf8');
  const start = src.indexOf('  var LEVELS = [');
  if (start < 0) throw new Error('cannot find LEVELS in js/levels.js');
  const body = src.slice(src.indexOf('[', start) + 1);
  const out = [];
  let depth = 0, from = -1, taken = 0;
  for (let i = 0; i < body.length && taken < TAUGHT; i++) {
    if (body[i] === '{') { if (!depth) from = i; depth++; }
    else if (body[i] === '}') {
      depth--;
      if (!depth) { out.push(body.slice(from, i + 1)); taken++; }
    }
  }
  if (out.length !== TAUGHT) throw new Error('found ' + out.length + ' taught levels, want ' + TAUGHT);
  /* Their boards carry over untouched, but the subtitle counts the campaign and
     the campaign has grown, so that one line is rewritten. */
  return out.map(s => '    ' + s.trim().replace(/subtitle: 'Level (\d+) of \d+'/,
    (m, n) => "subtitle: 'Level " + n + " of " + TOTAL + "'"));
}

/* ── build ─────────────────────────────────────────────────────────────── */

const CHECK = process.argv.includes('--check');
const built = [], problems = [], warns = [];
let lastPar = 0;

for (const [level, tier, jars, seed, wantPar, depth] of LADDER) {
  G.DIFFICULTY.__slot = shapeOf(tier, jars, depth);
  const board = G.generate('__slot', seed);

  if (board.jars.length !== jars) {
    problems.push('level ' + level + ': dealt ' + board.jars.length + ' jars, ladder says ' + jars);
    continue;
  }
  if (depth && board.jars.some(j => j.cap !== depth)) {
    problems.push('level ' + level + ': jars are not all ' + depth + ' deep');
    continue;
  }
  const seen = inspect(board);
  if (seen.bad) { problems.push('level ' + level + ': ' + seen.bad); continue; }
  if (seen.par !== wantPar) {
    problems.push('level ' + level + ': par ' + seen.par + ', but the seed was chosen for par ' +
      wantPar + ' — the generator has changed under this table');
    continue;
  }
  if (!survivable(board, 12))
    problems.push('level ' + level + ': can be played badly into a dead end');
  if (seen.warn) warns.push('level ' + level + ': ' + seen.warn);

  const colour = C.name(board.target);
  built.push({
    id: 'level-' + String(level).padStart(2, '0'),
    name: ADJECTIVES[(level - TAUGHT - 1) % ADJECTIVES.length] + ' ' +
          colour.charAt(0).toUpperCase() + colour.slice(1),
    teaches: jars + ' jars · ' + seen.par + ' moves',
    target: board.target,
    main: { cap: board.main.cap },
    par: seen.par,
    jars: board.jars.map(j => ({ cap: j.cap, fills: j.fills })),
    setting: LABEL[tier], seed: seed
  });
  process.stdout.write('  ' + String(level).padStart(3) + '. ' +
    built[built.length - 1].name.padEnd(20) + LABEL[tier].padEnd(11) +
    String(jars).padStart(2) + ' jars  par ' + String(seen.par).padStart(2) +
    '  seed ' + seed + '\n');
  lastPar = seen.par;
}

if (problems.length) {
  console.error('\n' + problems.length + ' PROBLEM(S):');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
if (warns.length) {
  console.error('\n' + warns.length + ' warning(s) — palette, not board:');
  for (const w of warns.slice(0, 6)) console.error('  ' + w);
  if (warns.length > 6) console.error('  … and ' + (warns.length - 6) + ' more');
}
if (built.length !== TOTAL - TAUGHT)
  throw new Error('built ' + built.length + ' levels, want ' + (TOTAL - TAUGHT));

const dealt = built.map((l, i) => {
  const jars = l.jars.map(j => '        { cap: ' + j.cap + ', fills: [' +
    j.fills.map(f => "'" + f + "'").join(', ') + '] }').join(',\n');
  return '    {\n' +
    "      id: '" + l.id + "',\n" +
    "      name: '" + l.name.replace(/'/g, "\\'") + "',\n" +
    "      subtitle: 'Level " + (i + 1 + TAUGHT) + " of " + TOTAL + "',\n" +
    "      teaches: '" + l.teaches.replace(/'/g, "\\'") + "',\n" +
    "      brief: '',\n" +
    "      target: '" + l.target + "',\n" +
    '      main: { cap: ' + l.main.cap + ' },\n' +
    '      par: ' + l.par + ',\n' +
    '      jars: [\n' + jars + '\n      ]\n' +
    '    }';
});

const body = taughtSource().concat(dealt).join(',\n');
const out = `/* levels.js — GENERATED by tools/build-campaign.js. Do not edit by hand.
 *
 * A ${TOTAL}-level campaign. The first ${TAUGHT} are written by hand, one rule each.
 * The rest are seeded deals from the same generator the Random Puzzle screen
 * uses, laid along a ladder that widens the shelf a jar at a time and sweeps
 * the four settings at each width. par saws gently up inside a block and each
 * block peaks above the one before it.
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

if (CHECK) {
  console.log('\nchecked ' + built.length + ' dealt levels, nothing written');
} else {
  fs.writeFileSync(path.join(ROOT, 'js', 'levels.js'), out);
  console.log('\nwrote js/levels.js — ' + TOTAL + ' levels, par ' +
    built[0].par + ' to ' + Math.max(...built.map(b => b.par)));
}
