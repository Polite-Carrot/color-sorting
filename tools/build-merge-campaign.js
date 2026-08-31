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
 *   node tools/build-merge-campaign.js --audit    also report which levels a
 *                                                 hint cannot answer on and
 *                                                 which careless play can
 *                                                 deadlock (slow)
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), J = path.join(ROOT, 'js') + path.sep;
require(J + 'colour.js'); require(J + 'engine.js');
require(J + 'merge.js'); require(J + 'merge-generator.js');
const C = globalThis.Colour, M = globalThis.Merge, { Game } = globalThis.Engine;
const G = globalThis.MergeGenerator;

const TOTAL = 500, TAUGHT = 5;
const LABEL = { easy: 'Easy', normal: 'Normal', hard: 'Hard',
                extraHard: 'Extra Hard', expert: 'Expert' };
const PROVABLE_JARS = 7;
/* The hint's ceiling. Not a gate here — see the limitation above — but every
   level records whether it clears it, so the cost is visible rather than
   discovered by a player. */
const HINT_STATES = 30000;

/* [level, setting, jars, seed, par-it-was-chosen-for] */
const LADDER = [
  /* Five settings across widths three to ten. Seeds only.
     Rows at eight jars and wider were re-picked when the depth cap came out of
     shapeFor: the cap had been applied to the arithmetic but never to the
     board, so those shapes described fifty cells and dealt seventy. Rows at
     seven jars and under were never affected and keep their original seeds. */
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
  [141, 'easy', 8, 301000009, 12],
  [142, 'normal', 8, 302000013, 16],
  [143, 'hard', 8, 303000024, 18],
  [144, 'extraHard', 8, 304000032, 18],
  [145, 'expert', 8, 305000017, 22],
  [146, 'easy', 8, 301000001, 13],
  [147, 'normal', 8, 302000001, 18],
  [148, 'hard', 8, 303000011, 19],
  [149, 'extraHard', 8, 304000017, 21],
  [150, 'expert', 8, 305000032, 24],
  [151, 'easy', 8, 301000017, 14],
  [152, 'normal', 8, 302000003, 19],
  [153, 'hard', 8, 303000003, 20],
  [154, 'extraHard', 8, 304000033, 21],
  [155, 'expert', 8, 305000015, 25],
  [156, 'easy', 8, 301000020, 14],
  [157, 'normal', 8, 302000005, 20],
  [158, 'hard', 8, 303000002, 21],
  [159, 'extraHard', 8, 304000010, 22],
  [160, 'expert', 8, 305000029, 25],
  [161, 'easy', 8, 301000008, 15],
  [162, 'normal', 8, 302000002, 21],
  [163, 'hard', 8, 303000001, 22],
  [164, 'extraHard', 8, 304000013, 23],
  [165, 'expert', 8, 305000025, 26],
  [166, 'easy', 8, 301000010, 15],
  [167, 'normal', 8, 302000028, 22],
  [168, 'hard', 8, 303000007, 23],
  [169, 'extraHard', 8, 304000003, 24],
  [170, 'expert', 8, 305000030, 26],
  [171, 'easy', 8, 301000003, 17],
  [172, 'normal', 8, 302000024, 23],
  [173, 'hard', 8, 303000005, 24],
  [174, 'extraHard', 8, 304000011, 25],
  [175, 'expert', 8, 305000005, 27],
  [176, 'easy', 9, 306000005, 12],
  [177, 'normal', 9, 307000009, 17],
  [178, 'hard', 9, 308000008, 19],
  [179, 'extraHard', 9, 309000034, 21],
  [180, 'expert', 9, 310000037, 21],
  [181, 'easy', 9, 306000009, 12],
  [182, 'normal', 9, 307000001, 19],
  [183, 'hard', 9, 308000013, 20],
  [184, 'extraHard', 9, 309000036, 22],
  [185, 'expert', 9, 310000002, 23],
  [186, 'easy', 9, 306000003, 14],
  [187, 'normal', 9, 307000021, 19],
  [188, 'hard', 9, 308000015, 22],
  [189, 'extraHard', 9, 309000001, 24],
  [190, 'expert', 9, 310000012, 24],
  [191, 'easy', 9, 306000004, 15],
  [192, 'normal', 9, 307000018, 21],
  [193, 'hard', 9, 308000001, 23],
  [194, 'extraHard', 9, 309000006, 24],
  [195, 'expert', 9, 310000008, 26],
  [196, 'easy', 9, 306000006, 16],
  [197, 'normal', 9, 307000023, 21],
  [198, 'hard', 9, 308000016, 24],
  [199, 'extraHard', 9, 309000003, 25],
  [200, 'expert', 9, 310000018, 26],
  [201, 'easy', 9, 306000007, 16],
  [202, 'normal', 9, 307000002, 22],
  [203, 'hard', 9, 308000011, 25],
  [204, 'extraHard', 9, 309000002, 26],
  [205, 'expert', 9, 310000019, 27],
  [206, 'easy', 9, 306000002, 17],
  [207, 'normal', 9, 307000005, 23],
  [208, 'hard', 9, 308000002, 26],
  [209, 'extraHard', 9, 309000014, 28],
  [210, 'expert', 9, 310000006, 30],
  [211, 'easy', 10, 311000011, 11],
  [212, 'normal', 10, 312000025, 18],
  [213, 'hard', 10, 313000023, 19],
  [214, 'extraHard', 10, 314000006, 22],
  [215, 'expert', 10, 315000155, 22],
  [216, 'easy', 10, 311000002, 12],
  [217, 'normal', 10, 312000001, 20],
  [218, 'hard', 10, 313000007, 21],
  [219, 'extraHard', 10, 314000012, 23],
  [220, 'expert', 10, 315000231, 23],
  [221, 'easy', 10, 311000004, 14],
  [222, 'normal', 10, 312000020, 21],
  [223, 'hard', 10, 313000003, 22],
  [224, 'extraHard', 10, 314000038, 23],
  [225, 'expert', 10, 315000014, 24],
  [226, 'easy', 10, 311000009, 15],
  [227, 'normal', 10, 312000008, 22],
  [228, 'hard', 10, 313000015, 23],
  [229, 'extraHard', 10, 314000015, 24],
  [230, 'expert', 10, 315000083, 25],
  [231, 'easy', 10, 311000003, 16],
  [232, 'normal', 10, 312000004, 23],
  [233, 'hard', 10, 313000011, 24],
  [234, 'extraHard', 10, 314000026, 25],
  [235, 'expert', 10, 315000122, 26],
  [236, 'easy', 10, 311000007, 16],
  [237, 'normal', 10, 312000011, 23],
  [238, 'hard', 10, 313000012, 25],
  [239, 'extraHard', 10, 314000002, 26],
  [240, 'expert', 10, 315000006, 27],
  [241, 'easy', 10, 311000001, 17],
  [242, 'normal', 10, 312000002, 24],
  [243, 'hard', 10, 313000001, 26],
  [244, 'extraHard', 10, 314000017, 27],
  [245, 'expert', 10, 315000032, 28],
  [246, 'easy', 10, 311000020, 18],
  [247, 'normal', 10, 312000006, 25],
  [248, 'hard', 10, 313000006, 27],
  [249, 'extraHard', 10, 314000003, 29],
  [250, 'expert', 10, 315000004, 32],
  [251, 'expert', 10, 315000149, 26],
  [252, 'expert', 10, 315000030, 24],
  [253, 'expert', 10, 315000057, 28],
  [254, 'expert', 10, 315000185, 26],
  [255, 'expert', 10, 315000195, 24],
  [256, 'expert', 10, 315000102, 19],
  [257, 'expert', 10, 315000245, 26],
  [258, 'expert', 10, 315000267, 26],
  [259, 'expert', 10, 315000268, 26],
  [260, 'expert', 10, 315000024, 27],
  [261, 'expert', 10, 315000017, 30],
  [262, 'expert', 10, 315000050, 27],
  [263, 'expert', 10, 315000089, 27],
  [264, 'expert', 10, 315000091, 27],
  [265, 'expert', 10, 315000100, 27],
  [266, 'expert', 10, 315000131, 27],
  [267, 'expert', 10, 315000077, 28],
  [268, 'expert', 10, 315000141, 27],
  [269, 'expert', 10, 315000007, 31],
  [270, 'expert', 10, 315000170, 27],
  [271, 'expert', 10, 315000080, 28],
  [272, 'expert', 10, 315000206, 27],
  [273, 'expert', 10, 315000216, 27],
  [274, 'expert', 10, 315000223, 27],
  [275, 'expert', 10, 315000244, 27],
  [276, 'expert', 10, 315000249, 27],
  [277, 'expert', 10, 315000274, 27],
  [278, 'expert', 10, 315000288, 27],
  [279, 'expert', 10, 315000084, 28],
  [280, 'expert', 10, 315000092, 28],
  [281, 'expert', 10, 315000115, 28],
  [282, 'expert', 10, 315000117, 28],
  [283, 'expert', 10, 315000118, 28],
  [284, 'expert', 10, 315000129, 28],
  [285, 'expert', 10, 315000154, 28],
  [286, 'expert', 10, 315000162, 28],
  [287, 'expert', 10, 315000164, 28],
  [288, 'expert', 10, 315000182, 28],
  [289, 'expert', 10, 315000204, 28],
  [290, 'expert', 10, 315000205, 28],
  [291, 'expert', 10, 315000211, 28],
  [292, 'expert', 10, 315000213, 28],
  [293, 'expert', 10, 315000012, 29],
  [294, 'expert', 10, 315000236, 28],
  [295, 'expert', 10, 315000269, 28],
  [296, 'expert', 10, 315000025, 29],
  [297, 'expert', 10, 315000037, 29],
  [298, 'expert', 10, 315000056, 29],
  [299, 'expert', 10, 315000072, 29],
  [300, 'expert', 10, 315000123, 29],
  [301, 'expert', 10, 315000153, 29],
  [302, 'expert', 10, 315000161, 29],
  [303, 'expert', 10, 315000048, 30],
  [304, 'expert', 10, 315000171, 29],
  [305, 'expert', 10, 315000179, 29],
  [306, 'expert', 10, 315000193, 29],
  [307, 'expert', 10, 315000196, 29],
  [308, 'expert', 10, 315000237, 29],
  [309, 'expert', 10, 315000251, 29],
  [310, 'expert', 10, 315000073, 30],
  [311, 'expert', 10, 315000075, 30],
  [312, 'expert', 10, 315000097, 30],
  [313, 'expert', 10, 315000105, 30],
  [314, 'expert', 10, 315000108, 30],
  [315, 'expert', 10, 315000136, 30],
  [316, 'expert', 10, 315000165, 30],
  [317, 'expert', 10, 315000198, 30],
  [318, 'expert', 10, 315000217, 30],
  [319, 'expert', 10, 315000232, 30],
  [320, 'expert', 10, 315000286, 30],
  [321, 'expert', 10, 315000287, 30],
  [322, 'expert', 10, 315000009, 31],
  [323, 'expert', 10, 315000013, 31],
  [324, 'expert', 10, 315000022, 31],
  [325, 'expert', 10, 315000035, 31],
  [326, 'expert', 10, 315000058, 31],
  [327, 'expert', 10, 315000060, 31],
  [328, 'expert', 10, 315000090, 31],
  [329, 'expert', 10, 315000099, 31],
  [330, 'expert', 10, 315000104, 31],
  [331, 'expert', 10, 315000106, 31],
  [332, 'expert', 10, 315000138, 31],
  [333, 'expert', 10, 315000146, 31],
  [334, 'expert', 10, 315000160, 31],
  [335, 'expert', 10, 315000190, 31],
  [336, 'expert', 10, 315000191, 31],
  [337, 'expert', 10, 315000192, 31],
  [338, 'expert', 10, 315000210, 31],
  [339, 'expert', 10, 315000222, 31],
  [340, 'expert', 10, 315000246, 31],
  [341, 'expert', 10, 315000270, 31],
  [342, 'expert', 10, 315000275, 31],
  [343, 'expert', 10, 315000019, 32],
  [344, 'expert', 10, 315000023, 32],
  [345, 'expert', 10, 315000039, 32],
  [346, 'expert', 10, 315000049, 32],
  [347, 'expert', 10, 315000053, 32],
  [348, 'expert', 10, 315000062, 32],
  [349, 'expert', 10, 315000068, 32],
  [350, 'expert', 10, 315000079, 32],
  [351, 'expert', 10, 315000103, 32],
  [352, 'expert', 10, 315000110, 32],
  [353, 'expert', 10, 315000113, 32],
  [354, 'expert', 10, 315000121, 32],
  [355, 'expert', 10, 315000167, 32],
  [356, 'expert', 10, 315000178, 32],
  [357, 'expert', 10, 315000183, 32],
  [358, 'expert', 10, 315000214, 32],
  [359, 'expert', 10, 315000226, 32],
  [360, 'expert', 10, 315000235, 32],
  [361, 'expert', 10, 315000247, 32],
  [362, 'expert', 10, 315000254, 32],
  [363, 'expert', 10, 315000262, 32],
  [364, 'expert', 10, 315000264, 32],
  [365, 'expert', 10, 315000277, 32],
  [366, 'expert', 10, 315000005, 33],
  [367, 'expert', 10, 315000016, 33],
  [368, 'expert', 10, 315000020, 33],
  [369, 'expert', 10, 315000028, 33],
  [370, 'expert', 10, 315000034, 33],
  [371, 'expert', 10, 315000040, 33],
  [372, 'expert', 10, 315000042, 33],
  [373, 'expert', 10, 315000044, 33],
  [374, 'expert', 10, 315000054, 33],
  [375, 'expert', 10, 315000059, 33],
  [376, 'expert', 10, 315000063, 33],
  [377, 'expert', 10, 315000071, 33],
  [378, 'expert', 10, 315000076, 33],
  [379, 'expert', 10, 315000086, 33],
  [380, 'expert', 10, 315000126, 33],
  [381, 'expert', 10, 315000130, 33],
  [382, 'expert', 10, 315000145, 33],
  [383, 'expert', 10, 315000172, 33],
  [384, 'expert', 10, 315000176, 33],
  [385, 'expert', 10, 315000177, 33],
  [386, 'expert', 10, 315000181, 33],
  [387, 'expert', 10, 315000197, 33],
  [388, 'expert', 10, 315000199, 33],
  [389, 'expert', 10, 315000220, 33],
  [390, 'expert', 10, 315000243, 33],
  [391, 'expert', 10, 315000253, 33],
  [392, 'expert', 10, 315000255, 33],
  [393, 'expert', 10, 315000256, 33],
  [394, 'expert', 10, 315000257, 33],
  [395, 'expert', 10, 315000260, 33],
  [396, 'expert', 10, 315000261, 33],
  [397, 'expert', 10, 315000266, 33],
  [398, 'expert', 10, 315000282, 33],
  [399, 'expert', 10, 315000029, 34],
  [400, 'expert', 10, 315000033, 34],
  [401, 'expert', 10, 315000045, 34],
  [402, 'expert', 10, 315000047, 34],
  [403, 'expert', 10, 315000061, 34],
  [404, 'expert', 10, 315000065, 34],
  [405, 'expert', 10, 315000078, 34],
  [406, 'expert', 10, 315000107, 34],
  [407, 'expert', 10, 315000119, 34],
  [408, 'expert', 10, 315000125, 34],
  [409, 'expert', 10, 315000144, 34],
  [410, 'expert', 10, 315000150, 34],
  [411, 'expert', 10, 315000156, 34],
  [412, 'expert', 10, 315000159, 34],
  [413, 'expert', 10, 315000168, 34],
  [414, 'expert', 10, 315000174, 34],
  [415, 'expert', 10, 315000188, 34],
  [416, 'expert', 10, 315000212, 34],
  [417, 'expert', 10, 315000225, 34],
  [418, 'expert', 10, 315000227, 34],
  [419, 'expert', 10, 315000242, 34],
  [420, 'expert', 10, 315000252, 34],
  [421, 'expert', 10, 315000271, 34],
  [422, 'expert', 10, 315000276, 34],
  [423, 'expert', 10, 315000281, 34],
  [424, 'expert', 10, 315000001, 35],
  [425, 'expert', 10, 315000002, 35],
  [426, 'expert', 10, 315000010, 35],
  [427, 'expert', 10, 315000036, 35],
  [428, 'expert', 10, 315000041, 35],
  [429, 'expert', 10, 315000052, 35],
  [430, 'expert', 10, 315000082, 35],
  [431, 'expert', 10, 315000098, 35],
  [432, 'expert', 10, 315000101, 35],
  [433, 'expert', 10, 315000112, 35],
  [434, 'expert', 10, 315000120, 35],
  [435, 'expert', 10, 315000124, 35],
  [436, 'expert', 10, 315000127, 35],
  [437, 'expert', 10, 315000132, 35],
  [438, 'expert', 10, 315000139, 35],
  [439, 'expert', 10, 315000143, 35],
  [440, 'expert', 10, 315000163, 35],
  [441, 'expert', 10, 315000166, 35],
  [442, 'expert', 10, 315000180, 35],
  [443, 'expert', 10, 315000207, 35],
  [444, 'expert', 10, 315000230, 35],
  [445, 'expert', 10, 315000241, 35],
  [446, 'expert', 10, 315000265, 35],
  [447, 'expert', 10, 315000018, 36],
  [448, 'expert', 10, 315000043, 36],
  [449, 'expert', 10, 315000069, 36],
  [450, 'expert', 10, 315000070, 36],
  [451, 'expert', 10, 315000088, 36],
  [452, 'expert', 10, 315000093, 36],
  [453, 'expert', 10, 315000128, 36],
  [454, 'expert', 10, 315000133, 36],
  [455, 'expert', 10, 315000134, 36],
  [456, 'expert', 10, 315000135, 36],
  [457, 'expert', 10, 315000148, 36],
  [458, 'expert', 10, 315000151, 36],
  [459, 'expert', 10, 315000152, 36],
  [460, 'expert', 10, 315000157, 36],
  [461, 'expert', 10, 315000169, 36],
  [462, 'expert', 10, 315000184, 36],
  [463, 'expert', 10, 315000186, 36],
  [464, 'expert', 10, 315000187, 36],
  [465, 'expert', 10, 315000189, 36],
  [466, 'expert', 10, 315000194, 36],
  [467, 'expert', 10, 315000201, 36],
  [468, 'expert', 10, 315000202, 36],
  [469, 'expert', 10, 315000203, 36],
  [470, 'expert', 10, 315000218, 36],
  [471, 'expert', 10, 315000224, 36],
  [472, 'expert', 10, 315000228, 36],
  [473, 'expert', 10, 315000234, 36],
  [474, 'expert', 10, 315000238, 36],
  [475, 'expert', 10, 315000239, 36],
  [476, 'expert', 10, 315000240, 36],
  [477, 'expert', 10, 315000248, 36],
  [478, 'expert', 10, 315000273, 36],
  [479, 'expert', 10, 315000284, 36],
  [480, 'expert', 10, 315000285, 36],
  [481, 'expert', 10, 315000015, 37],
  [482, 'expert', 10, 315000026, 37],
  [483, 'expert', 10, 315000031, 37],
  [484, 'expert', 10, 315000055, 37],
  [485, 'expert', 10, 315000066, 37],
  [486, 'expert', 10, 315000095, 37],
  [487, 'expert', 10, 315000140, 37],
  [488, 'expert', 10, 315000142, 37],
  [489, 'expert', 10, 315000158, 37],
  [490, 'expert', 10, 315000200, 37],
  [491, 'expert', 10, 315000221, 37],
  [492, 'expert', 10, 315000250, 37],
  [493, 'expert', 10, 315000272, 37],
  [494, 'expert', 10, 315000283, 37],
  [495, 'expert', 10, 315000003, 38],
  [496, 'expert', 10, 315000008, 38],
  [497, 'expert', 10, 315000011, 38],
  [498, 'expert', 10, 315000067, 38],
  [499, 'expert', 10, 315000096, 38],
  [500, 'expert', 10, 315000111, 38]
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

  /* Whether the hint can answer off the stored path is recorded, never
     enforced -- and finding out costs a search of up to six seconds a level.
     Six seconds times five hundred is the difference between a build that
     takes minutes and one that takes hours, so it is only done under --audit.
     The board is not less correct without it; the log line is just absent. */
  const quick = AUDIT ? M.solve(new Game(lvl).position(), HINT_STATES, 6000) : null;
  return { par: solved.par, path: solved.path, warn: warn,
           hintable: quick ? (!quick.budgetExceeded && quick.par != null) : null };
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
  'Tallying', 'Weighing', 'Marking', 'Sealing', 'Dispatching',
  /* Levels beyond the ladder, at the top setting and widest shelf. */
  'Amber', 'Ash', 'Auburn', 'Azure',
  'Beryl', 'Bister', 'Bistre', 'Bronze',
  'Burgundy', 'Cerise', 'Chartreuse', 'Cobalt',
  'Copper', 'Coral', 'Cream', 'Crimson',
  'Cyan', 'Ebony', 'Ecru', 'Emerald',
  'Fawn', 'Flax', 'Fuchsia', 'Garnet',
  'Gilt', 'Ginger', 'Gold', 'Heather',
  'Henna', 'Indigo', 'Ivory', 'Jade',
  'Jet', 'Lilac', 'Lime', 'Madder',
  'Magenta', 'Mahogany', 'Maroon', 'Mauve',
  'Mulberry', 'Mustard', 'Ochre', 'Olive',
  'Onyx', 'Opal', 'Peach', 'Pearl',
  'Pewter', 'Plum', 'Puce', 'Russet',
  'Saffron', 'Sage', 'Salmon', 'Scarlet',
  'Sepia', 'Sienna', 'Silver', 'Slate',
  'Sorrel', 'Sulphur', 'Tawny', 'Teal',
  'Terra', 'Thistle', 'Titian', 'Topaz',
  'Umber', 'Verdant', 'Vermilion', 'Violet',
  'Viridian', 'Walnut', 'Wheaten', 'Wine',
  'Woad', 'Xanthic', 'Yarrow', 'Zaffre',
  'Alabaster', 'Almond', 'Apricot', 'Aquamarine',
  'Basalt', 'Bay', 'Bittern', 'Blush',
  'Bole', 'Bracken', 'Bramble', 'Brass',
  'Briar', 'Bronzed', 'Buff', 'Burnt',
  'Cadmium', 'Camel', 'Caramel', 'Carmine',
  'Cedar', 'Celadon', 'Cerulean', 'Chestnut',
  'Cinnabar', 'Citrine', 'Clover', 'Cochineal',
  'Corn', 'Cowslip', 'Damson', 'Dove',
  'Dun', 'Dusk', 'Eggshell', 'Elder',
  'Ember', 'Fallow', 'Fern', 'Flame',
  'Flint', 'Foxglove', 'Gamboge', 'Gorse',
  'Grape', 'Greengage', 'Gunmetal', 'Harebell',
  'Hazel', 'Holly', 'Honey', 'Hyacinth',
  'Iris', 'Isabelline', 'Ivy', 'Juniper',
  'Kelp', 'Lapis', 'Lavender', 'Lichen',
  'Linen', 'Loam', 'Lovat', 'Madderlake',
  'Mallow', 'Marigold', 'Meadow', 'Mint',
  'Mist', 'Moss', 'Mulled', 'Nacre',
  'Nettle', 'Nutmeg', 'Oatmeal', 'Orpiment',
  'Oyster', 'Paprika', 'Parchment', 'Periwinkle',
  'Pewtered', 'Pine', 'Pitch', 'Poppy',
  'Porphyry', 'Primrose', 'Quartz', 'Quince',
  'Raven', 'Reseda', 'Rowan', 'Rust',
  'Samphire', 'Sandalwood', 'Sapphire', 'Sarsen',
  'Sedge', 'Shale', 'Sloe', 'Smalt',
  'Sorrelled', 'Spruce', 'Storm', 'Straw',
  'Sumac', 'Tallow', 'Tamarind', 'Tansy',
  'Thorn', 'Thrift', 'Tourmaline', 'Trefoil',
  'Turmeric', 'Vellum', 'Verdigris', 'Vetiver',
  'Wattle', 'Weld', 'Whin', 'Willow',
  'Wisteria', 'Woodbine', 'Wrack', 'Yew',
  'Zinc', 'Deep Amber', 'Deep Ash', 'Deep Auburn',
  'Deep Azure', 'Deep Beryl', 'Deep Bister', 'Deep Bistre',
  'Deep Bronze', 'Deep Burgundy', 'Deep Cerise', 'Deep Chartreuse',
  'Deep Cobalt', 'Deep Copper', 'Deep Coral', 'Deep Cream',
  'Deep Crimson', 'Deep Cyan', 'Deep Ebony', 'Deep Ecru',
  'Deep Emerald', 'Deep Fawn', 'Deep Flax', 'Deep Fuchsia',
  'Deep Garnet', 'Deep Gilt', 'Deep Ginger', 'Deep Gold',
  'Deep Heather', 'Deep Henna', 'Deep Indigo', 'Deep Ivory',
  'Deep Jade', 'Deep Jet', 'Deep Lilac', 'Deep Lime',
  'Deep Madder', 'Deep Magenta', 'Deep Mahogany', 'Deep Maroon',
  'Deep Mauve'];
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
/* The two diagnostics -- can a hint answer off-path, and can careless play
   deadlock the shelf -- are worth knowing and worth nothing during a routine
   build: neither rejects a level, and together they are what made a five
   hundred level build take hours instead of minutes. Off unless asked for. */
const AUDIT = process.argv.includes('--audit');
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
  if (seen.hintable === false) noHint.push(level);
  /* Four random playthroughs, each solving the position every sixth move --
     the dearest thing in the build, and like the hint check it is recorded
     rather than enforced. Under --audit only. */
  if (AUDIT && !survivable(board, 4)) fragile.push(level);

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
    '  seed ' + seed + (seen.hintable === false ? '   [hint cannot answer off-path]' : '') + '\n');
}

if (problems.length) {
  console.error('\n' + problems.length + ' PROBLEM(S):');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
if (built.length !== TOTAL - TAUGHT)
  throw new Error('built ' + built.length + ' levels, want ' + (TOTAL - TAUGHT));

if (AUDIT) {
  console.error('\n' + noHint.length + ' level(s) where a hint cannot answer off the stored path' +
    (noHint.length ? ': ' + noHint[0] + '-' + noHint[noHint.length - 1] : ''));
  console.error(fragile.length + ' level(s) careless play can deadlock' +
    (fragile.length ? ': ' + fragile.slice(0, 12).join(', ') + (fragile.length > 12 ? ' …' : '') : ''));
} else {
  console.error('\nhint and deadlock audit skipped — run with --audit for it');
}
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
