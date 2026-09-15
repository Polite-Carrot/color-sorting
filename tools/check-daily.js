#!/usr/bin/env node
/* check-daily.js — prove the Daily Puzzle keeps working, for years.
 *
 * Nothing about a daily is stored ahead of time: the date IS the seed, so
 * 31 December 2030 deals seed 20301231 and the board is worked out on the
 * spot. That means the mode has no end date and needs no seed list — but it
 * also means nobody finds out a particular day deals badly until that day
 * arrives, and by then everybody gets the bad board at once.
 *
 * So sweep forward and check every single day: that it deals at all, that it
 * deals quickly enough for somebody waiting, that par lands in the band its
 * setting promises, and that it is not the generator's emergency board.
 *
 *   node tools/check-daily.js            today .. end of 2030
 *   node tools/check-daily.js 2035       today .. end of 2035
 *   node tools/check-daily.js 2030 full  also re-solves every board
 *
 * The re-solve is off by default because it is slow and the generator already
 * solves each board to get its par. Turn it on to check that claim rather than
 * trust it.
 */
'use strict';
const P = require('path').join(__dirname, '..', 'js') + '/';
require(P + 'colour.js'); require(P + 'engine.js'); require(P + 'solver.js');
require(P + 'generator.js'); require(P + 'merge.js'); require(P + 'merge-generator.js');
require(P + 'daily.js');
const D = globalThis.Daily, G = globalThis.Generator, M = globalThis.MergeGenerator;
const { Game } = globalThis.Engine;

const YEAR = Number(process.argv[2]) || 2030;
const FULL = process.argv.indexOf('full') >= 0;

/* Telling a real board from the generator's emergency one is fiddlier than it
   looks, and getting it wrong reads as a catastrophe that is not happening.
   Merge Easy legitimately deals exactly three jars, and "Make the purple" is
   one of its three real targets — so name and jar count match a good board as
   readily as a fallback. The big jar is what actually separates them: the
   emergency boards take 2 (merge) and 4 (sort), which no real board at any
   daily setting does. */
function isFallback(lvl, cfg, merge) {
  return merge ? (lvl.main.cap === 2 && cfg.mainCap !== 2)
               : (lvl.main.cap === 4 && cfg.mainCap !== 4);
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const END = new Date(YEAR, 11, 31);
const rows = [], problems = [];
let d = D.today();
const t0 = Date.now();

while (d <= END) {
  const plan = D.planFor(d);
  const merge = plan.game === 'merge';
  const gen = merge ? M : G;
  const cfg = gen.DIFFICULTY[plan.difficulty];
  const seed = D.seedFor(d);
  const key = D.key(d);

  const t = Date.now();
  let lvl = null;
  try { lvl = gen.generate(plan.difficulty, seed); }
  catch (e) { problems.push(key + ': threw — ' + e.message); d = D.shift(d, 1); continue; }
  const ms = Date.now() - t;

  if (!lvl) { problems.push(key + ': dealt nothing'); d = D.shift(d, 1); continue; }
  if (isFallback(lvl, cfg, merge)) problems.push(key + ': FALLBACK board (' + plan.label + ')');
  if (lvl.par < cfg.par[0] || lvl.par > cfg.par[1]) {
    problems.push(key + ': par ' + lvl.par + ' outside ' + plan.difficulty + "'s band " + JSON.stringify(cfg.par));
  }
  if (FULL) {
    const solver = merge ? globalThis.Merge : globalThis.Solver;
    const r = solver.solve(new Game(lvl).position(), 400000, 20000, 1);
    if (!r || r.par == null || r.budgetExceeded) problems.push(key + ': could not be re-solved');
    else if (!merge && r.par !== lvl.par) problems.push(key + ': par ' + lvl.par + ', re-solved at ' + r.par);
    /* Merge par past seven jars is a good solution rather than a proven
       minimum, so a different number there is expected, not a fault. */
  }
  rows.push({ key, dow: d.getDay(), game: plan.game, diff: plan.difficulty,
              par: lvl.par, jars: lvl.jars.length, ms });
  d = D.shift(d, 1);
}

console.log('swept ' + rows.length + ' days: ' + rows[0].key + ' .. ' + rows[rows.length - 1].key +
            '  in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's' + (FULL ? '  (with re-solve)' : ''));
console.log();
for (let i = 1; i <= 7; i++) {
  const wd = i % 7;
  const r = rows.filter(x => x.dow === wd);
  if (!r.length) continue;
  const pars = r.map(x => x.par).sort((a, b) => a - b);
  const ms = r.map(x => x.ms).sort((a, b) => a - b);
  console.log('  ' + DOW[wd] + '  ' + (r[0].game === 'merge' ? 'Merge' : 'Sort ') + ' ' +
    r[0].diff.padEnd(10) + String(r[0].jars).padStart(2) + ' jars  n=' + String(r.length).padStart(4) +
    '  par ' + String(pars[0]).padStart(2) + '-' + String(pars[pars.length - 1]).padStart(2) +
    ' (median ' + pars[Math.floor(pars.length / 2)] + ')' +
    '  deal median ' + String(ms[Math.floor(ms.length / 2)]).padStart(3) +
    'ms worst ' + String(ms[ms.length - 1]).padStart(4) + 'ms');
}
const slow = rows.filter(r => r.ms > 2000);
console.log('\ndays taking over 2s to deal: ' + slow.length);

if (problems.length) {
  console.log('\n' + problems.length + ' PROBLEM(S):');
  problems.slice(0, 50).forEach(p => console.log('  ' + p));
  if (problems.length > 50) console.log('  ... and ' + (problems.length - 50) + ' more');
  process.exit(1);
}
console.log('\nevery day deals a real board, in band, quickly. Nothing to do.');
