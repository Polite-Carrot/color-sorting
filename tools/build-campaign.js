#!/usr/bin/env node
/* build-campaign.js — builds js/levels.js for Sort Colors.
 *
 * Every level past the tutorial is a seeded deal from the same generator the
 * Random Puzzle screen uses, at a (setting, jar count) slot on a ladder. The
 * ladder walks width-major and setting-minor: the shelf grows one jar at a
 * time, and at each width the five settings are swept in order, several times
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

const TOTAL = 350, TAUGHT = 5;
const LABEL = { easy: 'Easy', normal: 'Normal', hard: 'Hard',
                extraHard: 'Extra Hard', expert: 'Expert' };

/* [level, setting, jars, seed, par-it-was-chosen-for]
 *
 * Three numbers and a seed, and nothing else: a setting, a jar count, and the
 * seed. That is exactly what the Random Puzzle screen deals from, so every
 * level in this campaign is a board a player can reproduce there by picking
 * the same setting and jar count and typing the seed.
 *
 * An earlier version carried a sixth column for jar depth, which bought par
 * past what any setting could reach and broke that property: no combination of
 * controls on the Random screen produces a nine-deep jar. Depth now lives
 * where it belongs, in a setting of its own -- Expert -- so the campaign can
 * use it without leaving the generator behind. */
const LADDER = [
  /* Five settings across widths four to fourteen. Seeds only. */
  [6, 'easy', 4, 700100007, 5],
  [7, 'normal', 4, 700200009, 6],
  [8, 'hard', 4, 700300011, 8],
  [9, 'extraHard', 4, 700400003, 9],
  [10, 'expert', 4, 700500009, 10],
  [11, 'easy', 4, 700100006, 6],
  [12, 'normal', 4, 700200003, 7],
  [13, 'hard', 4, 700300004, 10],
  [14, 'extraHard', 4, 700400019, 11],
  [15, 'expert', 4, 700500006, 12],
  [16, 'easy', 4, 700100001, 7],
  [17, 'normal', 4, 700200006, 8],
  [18, 'hard', 4, 700300007, 12],
  [19, 'extraHard', 4, 700400001, 13],
  [20, 'expert', 4, 700500008, 14],
  [21, 'easy', 5, 700600005, 6],
  [22, 'normal', 5, 700700018, 7],
  [23, 'hard', 5, 700800013, 11],
  [24, 'extraHard', 5, 700900001, 12],
  [25, 'expert', 5, 701000001, 13],
  [26, 'easy', 5, 700600003, 7],
  [27, 'normal', 5, 700700007, 9],
  [28, 'hard', 5, 700800004, 14],
  [29, 'extraHard', 5, 700900011, 15],
  [30, 'expert', 5, 701000009, 16],
  [31, 'easy', 5, 700600002, 9],
  [32, 'normal', 5, 700700001, 10],
  [33, 'hard', 5, 700800010, 15],
  [34, 'extraHard', 5, 700900035, 16],
  [35, 'expert', 5, 701000023, 17],
  [36, 'easy', 6, 701100003, 6],
  [37, 'normal', 6, 701200010, 8],
  [38, 'hard', 6, 701300022, 12],
  [39, 'extraHard', 6, 701400017, 13],
  [40, 'expert', 6, 701500005, 16],
  [41, 'easy', 6, 701100007, 8],
  [42, 'normal', 6, 701200012, 9],
  [43, 'hard', 6, 701300012, 14],
  [44, 'extraHard', 6, 701400007, 15],
  [45, 'expert', 6, 701500001, 17],
  [46, 'easy', 6, 701100001, 9],
  [47, 'normal', 6, 701200001, 10],
  [48, 'hard', 6, 701300001, 17],
  [49, 'extraHard', 6, 701400014, 18],
  [50, 'expert', 6, 701500040, 19],
  [51, 'easy', 6, 701100002, 11],
  [52, 'normal', 6, 701200006, 12],
  [53, 'hard', 6, 701300002, 18],
  [54, 'extraHard', 6, 701400009, 19],
  [55, 'expert', 6, 701500004, 22],
  [56, 'easy', 7, 701600005, 8],
  [57, 'normal', 7, 701700008, 9],
  [58, 'hard', 7, 701800007, 13],
  [59, 'extraHard', 7, 701900043, 14],
  [60, 'expert', 7, 702000002, 18],
  [61, 'easy', 7, 701600007, 9],
  [62, 'normal', 7, 701700001, 10],
  [63, 'hard', 7, 701800005, 16],
  [64, 'extraHard', 7, 701900001, 17],
  [65, 'expert', 7, 702000011, 20],
  [66, 'easy', 7, 701600001, 10],
  [67, 'normal', 7, 701700003, 11],
  [68, 'hard', 7, 701800012, 18],
  [69, 'extraHard', 7, 701900004, 19],
  [70, 'expert', 7, 702000018, 22],
  [71, 'easy', 7, 701600002, 11],
  [72, 'normal', 7, 701700017, 13],
  [73, 'hard', 7, 701800009, 19],
  [74, 'extraHard', 7, 701900026, 20],
  [75, 'expert', 7, 702000017, 24],
  [76, 'easy', 7, 701600009, 13],
  [77, 'normal', 7, 701700007, 14],
  [78, 'hard', 7, 701800040, 21],
  [79, 'extraHard', 7, 701900053, 22],
  [80, 'expert', 7, 702000005, 25],
  [81, 'easy', 8, 702100004, 9],
  [82, 'normal', 8, 702200003, 11],
  [83, 'hard', 8, 702300013, 16],
  [84, 'extraHard', 8, 702400007, 17],
  [85, 'expert', 8, 702500024, 21],
  [86, 'easy', 8, 702100003, 10],
  [87, 'normal', 8, 702200004, 12],
  [88, 'hard', 8, 702300007, 18],
  [89, 'extraHard', 8, 702400002, 19],
  [90, 'expert', 8, 702500002, 23],
  [91, 'easy', 8, 702100002, 12],
  [92, 'normal', 8, 702200001, 13],
  [93, 'hard', 8, 702300001, 20],
  [94, 'extraHard', 8, 702400017, 21],
  [95, 'expert', 8, 702500007, 24],
  [96, 'easy', 8, 702100007, 12],
  [97, 'normal', 8, 702200008, 14],
  [98, 'hard', 8, 702300019, 21],
  [99, 'extraHard', 8, 702400010, 22],
  [100, 'expert', 8, 702500029, 25],
  [101, 'easy', 8, 702100001, 13],
  [102, 'normal', 8, 702200007, 15],
  [103, 'hard', 8, 702300016, 22],
  [104, 'extraHard', 8, 702400018, 23],
  [105, 'expert', 8, 702500005, 27],
  [106, 'easy', 8, 702100013, 14],
  [107, 'normal', 8, 702200009, 16],
  [108, 'hard', 8, 702300032, 24],
  [109, 'extraHard', 8, 702400068, 25],
  [110, 'expert', 8, 702500045, 28],
  [111, 'easy', 9, 702600015, 9],
  [112, 'normal', 9, 702700008, 11],
  [113, 'hard', 9, 702800016, 18],
  [114, 'extraHard', 9, 702900018, 19],
  [115, 'expert', 9, 703000012, 23],
  [116, 'easy', 9, 702600024, 10],
  [117, 'normal', 9, 702700004, 12],
  [118, 'hard', 9, 702800025, 20],
  [119, 'extraHard', 9, 702900011, 21],
  [120, 'expert', 9, 703000006, 25],
  [121, 'easy', 9, 702600001, 11],
  [122, 'normal', 9, 702700005, 13],
  [123, 'hard', 9, 702800011, 21],
  [124, 'extraHard', 9, 702900007, 22],
  [125, 'expert', 9, 703000021, 26],
  [126, 'easy', 9, 702600011, 13],
  [127, 'normal', 9, 702700002, 14],
  [128, 'hard', 9, 702800001, 23],
  [129, 'extraHard', 9, 702900012, 24],
  [130, 'expert', 9, 703000003, 28],
  [131, 'easy', 9, 702600002, 14],
  [132, 'normal', 9, 702700006, 16],
  [133, 'hard', 9, 702800003, 24],
  [134, 'extraHard', 9, 702900001, 25],
  [135, 'expert', 9, 703000019, 29],
  [136, 'easy', 9, 702600013, 14],
  [137, 'normal', 9, 702700007, 17],
  [138, 'hard', 9, 702800012, 25],
  [139, 'extraHard', 9, 702900004, 26],
  [140, 'expert', 9, 703000005, 30],
  [141, 'easy', 9, 702600003, 15],
  [142, 'normal', 9, 702700015, 18],
  [143, 'hard', 9, 702800002, 27],
  [144, 'extraHard', 9, 702900002, 28],
  [145, 'expert', 9, 703000017, 32],
  [146, 'easy', 10, 703100008, 11],
  [147, 'normal', 10, 703200028, 12],
  [148, 'hard', 10, 703300043, 19],
  [149, 'extraHard', 10, 703400009, 21],
  [150, 'expert', 10, 703500003, 25],
  [151, 'easy', 10, 703100002, 12],
  [152, 'normal', 10, 703200001, 14],
  [153, 'hard', 10, 703300003, 21],
  [154, 'extraHard', 10, 703400025, 23],
  [155, 'expert', 10, 703500019, 27],
  [156, 'easy', 10, 703100011, 13],
  [157, 'normal', 10, 703200008, 15],
  [158, 'hard', 10, 703300012, 24],
  [159, 'extraHard', 10, 703400036, 25],
  [160, 'expert', 10, 703500012, 29],
  [161, 'easy', 10, 703100001, 14],
  [162, 'normal', 10, 703200005, 16],
  [163, 'hard', 10, 703300041, 25],
  [164, 'extraHard', 10, 703400008, 26],
  [165, 'expert', 10, 703500002, 31],
  [166, 'easy', 10, 703100009, 15],
  [167, 'normal', 10, 703200003, 17],
  [168, 'hard', 10, 703300005, 26],
  [169, 'extraHard', 10, 703400003, 27],
  [170, 'expert', 10, 703500029, 32],
  [171, 'easy', 10, 703100022, 16],
  [172, 'normal', 10, 703200004, 18],
  [173, 'hard', 10, 703300014, 28],
  [174, 'extraHard', 10, 703400007, 29],
  [175, 'expert', 10, 703500015, 33],
  [176, 'easy', 10, 703100003, 17],
  [177, 'normal', 10, 703200019, 20],
  [178, 'hard', 10, 703300001, 30],
  [179, 'extraHard', 10, 703400031, 31],
  [180, 'expert', 10, 703500037, 35],
  [181, 'easy', 11, 703600008, 13],
  [182, 'normal', 11, 703700002, 14],
  [183, 'hard', 11, 703800027, 22],
  [184, 'extraHard', 11, 703900005, 23],
  [185, 'expert', 11, 704000008, 27],
  [186, 'easy', 11, 703600006, 14],
  [187, 'normal', 11, 703700001, 16],
  [188, 'hard', 11, 703800006, 24],
  [189, 'extraHard', 11, 703900011, 25],
  [190, 'expert', 11, 704000015, 30],
  [191, 'easy', 11, 703600009, 14],
  [192, 'normal', 11, 703700003, 17],
  [193, 'hard', 11, 703800025, 26],
  [194, 'extraHard', 11, 703900002, 27],
  [195, 'expert', 11, 704000007, 31],
  [196, 'easy', 11, 703600015, 15],
  [197, 'normal', 11, 703700006, 18],
  [198, 'hard', 11, 703800010, 28],
  [199, 'extraHard', 11, 703900016, 29],
  [200, 'expert', 11, 704000030, 33],
  [201, 'easy', 11, 703600002, 16],
  [202, 'normal', 11, 703700005, 19],
  [203, 'hard', 11, 703800029, 29],
  [204, 'extraHard', 11, 703900003, 30],
  [205, 'expert', 11, 704000001, 34],
  [206, 'easy', 11, 703600001, 17],
  [207, 'normal', 11, 703700009, 20],
  [208, 'hard', 11, 703800019, 30],
  [209, 'extraHard', 11, 703900008, 31],
  [210, 'expert', 11, 704000012, 35],
  [211, 'easy', 11, 703600003, 18],
  [212, 'normal', 11, 703700030, 21],
  [213, 'hard', 11, 703800004, 32],
  [214, 'extraHard', 11, 703900006, 33],
  [215, 'expert', 11, 704000003, 36],
  [216, 'easy', 11, 703600012, 19],
  [217, 'normal', 11, 703700054, 22],
  [218, 'hard', 11, 703800002, 34],
  [219, 'extraHard', 11, 703900033, 35],
  [220, 'expert', 11, 704000034, 40],
  [221, 'easy', 12, 704100003, 13],
  [222, 'normal', 12, 704200001, 16],
  [223, 'hard', 12, 704300001, 24],
  [224, 'extraHard', 12, 704400021, 25],
  [225, 'expert', 12, 704500020, 29],
  [226, 'easy', 12, 704100011, 14],
  [227, 'normal', 12, 704200011, 16],
  [228, 'hard', 12, 704300008, 27],
  [229, 'extraHard', 12, 704400003, 28],
  [230, 'expert', 12, 704500009, 32],
  [231, 'easy', 12, 704100001, 15],
  [232, 'normal', 12, 704200008, 18],
  [233, 'hard', 12, 704300012, 29],
  [234, 'extraHard', 12, 704400036, 30],
  [235, 'expert', 12, 704500015, 34],
  [236, 'easy', 12, 704100008, 17],
  [237, 'normal', 12, 704200019, 18],
  [238, 'hard', 12, 704300005, 30],
  [239, 'extraHard', 12, 704400004, 31],
  [240, 'expert', 12, 704500010, 36],
  [241, 'easy', 12, 704100002, 18],
  [242, 'normal', 12, 704200005, 20],
  [243, 'hard', 12, 704300003, 31],
  [244, 'extraHard', 12, 704400005, 32],
  [245, 'expert', 12, 704500003, 37],
  [246, 'easy', 12, 704100005, 18],
  [247, 'normal', 12, 704200017, 21],
  [248, 'hard', 12, 704300010, 32],
  [249, 'extraHard', 12, 704400016, 33],
  [250, 'expert', 12, 704500025, 38],
  [251, 'easy', 12, 704100025, 19],
  [252, 'normal', 12, 704200010, 22],
  [253, 'hard', 12, 704300006, 34],
  [254, 'extraHard', 12, 704400001, 35],
  [255, 'expert', 12, 704500001, 40],
  [256, 'easy', 12, 704100047, 21],
  [257, 'normal', 12, 704200002, 23],
  [258, 'hard', 12, 704300040, 36],
  [259, 'extraHard', 12, 704400044, 37],
  [260, 'expert', 12, 704500008, 42],
  [261, 'easy', 13, 704600012, 14],
  [262, 'normal', 13, 704700012, 17],
  [263, 'hard', 13, 704800012, 27],
  [264, 'extraHard', 13, 704900010, 28],
  [265, 'expert', 13, 705000006, 33],
  [266, 'easy', 13, 704600004, 16],
  [267, 'normal', 13, 704700015, 19],
  [268, 'hard', 13, 704800006, 28],
  [269, 'extraHard', 13, 704900029, 29],
  [270, 'expert', 13, 705000010, 34],
  [271, 'easy', 13, 704600005, 17],
  [272, 'normal', 13, 704700009, 20],
  [273, 'hard', 13, 704800005, 30],
  [274, 'extraHard', 13, 704900006, 31],
  [275, 'expert', 13, 705000003, 36],
  [276, 'easy', 13, 704600002, 18],
  [277, 'normal', 13, 704700014, 21],
  [278, 'hard', 13, 704800002, 31],
  [279, 'extraHard', 13, 704900008, 32],
  [280, 'expert', 13, 705000045, 38],
  [281, 'easy', 13, 704600008, 18],
  [282, 'normal', 13, 704700025, 21],
  [283, 'hard', 13, 704800001, 32],
  [284, 'extraHard', 13, 704900007, 33],
  [285, 'expert', 13, 705000009, 40],
  [286, 'easy', 13, 704600003, 19],
  [287, 'normal', 13, 704700001, 22],
  [288, 'hard', 13, 704800004, 34],
  [289, 'extraHard', 13, 704900031, 35],
  [290, 'expert', 13, 705000007, 41],
  [291, 'easy', 13, 704600022, 20],
  [292, 'normal', 13, 704700003, 23],
  [293, 'hard', 13, 704800011, 35],
  [294, 'extraHard', 13, 704900014, 36],
  [295, 'expert', 13, 705000001, 42],
  [296, 'easy', 13, 704600028, 21],
  [297, 'normal', 13, 704700028, 24],
  [298, 'hard', 13, 704800009, 37],
  [299, 'extraHard', 13, 704900044, 38],
  [300, 'expert', 13, 705000023, 43],
  [301, 'easy', 13, 704600041, 23],
  [302, 'normal', 13, 704700023, 26],
  [303, 'hard', 13, 704800007, 39],
  [304, 'extraHard', 13, 704900009, 40],
  [305, 'expert', 13, 705000018, 45],
  [306, 'easy', 14, 705100022, 16],
  [307, 'normal', 14, 705200001, 19],
  [308, 'hard', 14, 705300025, 29],
  [309, 'extraHard', 14, 705400019, 30],
  [310, 'expert', 14, 705500016, 37],
  [311, 'easy', 14, 705100032, 17],
  [312, 'normal', 14, 705200023, 20],
  [313, 'hard', 14, 705300023, 31],
  [314, 'extraHard', 14, 705400012, 32],
  [315, 'expert', 14, 705500017, 40],
  [316, 'easy', 14, 705100005, 18],
  [317, 'normal', 14, 705200021, 21],
  [318, 'hard', 14, 705300010, 32],
  [319, 'extraHard', 14, 705400017, 33],
  [320, 'expert', 14, 705500005, 41],
  [321, 'easy', 14, 705100006, 19],
  [322, 'normal', 14, 705200003, 22],
  [323, 'hard', 14, 705300008, 33],
  [324, 'extraHard', 14, 705400005, 34],
  [325, 'expert', 14, 705500014, 43],
  [326, 'easy', 14, 705100016, 20],
  [327, 'normal', 14, 705200006, 23],
  [328, 'hard', 14, 705300004, 35],
  [329, 'extraHard', 14, 705400003, 36],
  [330, 'expert', 14, 705500002, 44],
  [331, 'easy', 14, 705100004, 21],
  [332, 'normal', 14, 705200025, 24],
  [333, 'hard', 14, 705300015, 36],
  [334, 'extraHard', 14, 705400001, 37],
  [335, 'expert', 14, 705500003, 45],
  [336, 'easy', 14, 705100013, 22],
  [337, 'normal', 14, 705200004, 26],
  [338, 'hard', 14, 705300003, 37],
  [339, 'extraHard', 14, 705400007, 38],
  [340, 'expert', 14, 705500021, 47],
  [341, 'easy', 14, 705100009, 23],
  [342, 'normal', 14, 705200009, 27],
  [343, 'hard', 14, 705300009, 39],
  [344, 'extraHard', 14, 705400004, 40],
  [345, 'expert', 14, 705500008, 48],
  [346, 'easy', 14, 705100041, 24],
  [347, 'normal', 14, 705200005, 28],
  [348, 'hard', 14, 705300049, 41],
  [349, 'extraHard', 14, 705400015, 43],
  [350, 'expert', 14, 705500013, 49]
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

function shapeOf(tier, jars) {
  const derived = shapeFor(tier, jars);
  if (derived) return derived;
  return Object.assign({}, G.DIFFICULTY[tier], { par: [1, 999] });
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
  'Mortared', 'Cemented', 'Grouted', 'Slabbed', 'Flagged',
  /* Levels beyond 200. */
  'Alluvial', 'Aqueous', 'Argillite', 'Ashen', 'Basalt',
  'Bedrock', 'Bituminous', 'Brackish', 'Brine', 'Calcite',
  'Chalky', 'Cindered', 'Clayey', 'Cobbled', 'Conglomerate',
  'Craggy', 'Detrital', 'Diluvial', 'Dolomite', 'Drift',
  'Dune', 'Eluvial', 'Eroded', 'Estuary', 'Feldspar',
  'Ferrous', 'Fissured', 'Flinty', 'Fluvial', 'Gabbro',
  'Garnet', 'Geode', 'Glacial', 'Gneiss', 'Granitic',
  'Gravelly', 'Greywacke', 'Gritstone', 'Gypsum', 'Halite',
  'Hornfels', 'Igneous', 'Jasper', 'Karst', 'Kaolin',
  'Lacustrine', 'Laminar', 'Lava', 'Lignite', 'Limestone',
  'Loamy', 'Loess', 'Magmatic', 'Malachite', 'Marl',
  'Metamorphic', 'Mica', 'Moraine', 'Mudstone', 'Obsidian',
  'Ochre', 'Olivine', 'Onyx', 'Opaline', 'Outcrop',
  'Peaty', 'Pebbled', 'Pegmatite', 'Phyllite', 'Pumice',
  'Pyrite', 'Quartzite', 'Rhyolite', 'Sandstone', 'Sapphire',
  'Schist', 'Scoria', 'Sedimentary', 'Serpentinite', 'Shale',
  'Silica', 'Siltstone', 'Slaty', 'Soapstone', 'Stalactite',
  'Stalagmite', 'Strata', 'Sulphurous', 'Talc', 'Tectonic',
  'Terracotta', 'Till', 'Topaz', 'Travertine', 'Tuff',
  'Turbid', 'Ultramafic', 'Volcanic', 'Weathered', 'Zeolite',
  'Zircon', 'Alkaline', 'Amber', 'Ammonite', 'Anthracite',
  'Aquifer', 'Artesian', 'Basaltic', 'Bituminate', 'Bornite',
  'Brackened', 'Brecciated', 'Cambrian', 'Carboniferous', 'Chalcedony',
  'Cherty', 'Chondrite', 'Cinnabar', 'Clastic', 'Colluvial',
  'Corundum', 'Cretaceous', 'Crystalline', 'Cuprous', 'Dendritic',
  'Devonian', 'Diorite', 'Dolomitic', 'Druse', 'Ductile',
  'Effusive', 'Eocene', 'Epidote', 'Erratic', 'Evaporite',
  'Exfoliated', 'Fault', 'Ferric', 'Flint', 'Fossil',
  'Friable', 'Fumarole', 'Gangue', 'Geothermal', 'Glauconite',
  'Gneissic', 'Goethite', 'Graphite', 'Greisen'];
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
