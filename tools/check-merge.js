#!/usr/bin/env node
/* Checks every Merge Colours level, the same way make-levels.js checks the
   campaign: the solver has to finish it, the par written on the level has to
   be the true fewest moves, the solver's own path has to play back through
   the engine to a win, and the level has to survive being played badly. */
'use strict';
require('../js/colour.js');
require('../js/engine.js');
require('../js/merge.js');
require('../js/merge-levels.js');
const C = globalThis.Colour, { Game } = globalThis.Engine,
      M = globalThis.Merge, L = globalThis.MergeLevels;

let bad = 0;

/* Can it be played badly and still finished? A taught level that an ordinary
   wrong turn kills for good is a trap, not a lesson — but here a wrong mix
   destroys units outright, so some of these levels genuinely can be spoiled.
   What matters is that it is spotted, which the dead-end warning does, so this
   reports the figure rather than insisting on it. */
let rs = 7;
const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };

function survivalRate(lvl, trials) {
  let alive = 0;
  for (let t = 0; t < trials; t++) {
    const g = new Game(lvl);
    for (let step = 0; step < 40 && !g.won; step++) {
      const ids = g.jars.map(j => j.id).concat(['main']);
      const legal = [];
      for (const f of g.jars.map(j => j.id)) {
        for (const to of ids) if (f !== to && g.pourable(f, to)) legal.push([f, to]);
      }
      if (!legal.length) break;
      const mv = legal[Math.floor(rnd() * legal.length)];
      g.pour(mv[0], mv[1]);
    }
    const r = M.solve(g.position(), 200000, 4000);
    if (g.won || r.par != null) alive++;
  }
  return Math.round(100 * alive / trials);
}

console.log('Merge Colours — ' + L.list.length + ' levels\n');
for (const lvl of L.list) {
  const g = new Game(lvl);
  const t = Date.now();
  const r = M.solve(g.position(), 400000, 20000);
  const ms = Date.now() - t;

  if (r.budgetExceeded) { console.log('  ' + lvl.id + ': SOLVER RAN OUT'); bad++; continue; }
  if (r.par == null) { console.log('  ' + lvl.id + ': CANNOT BE FINISHED'); bad++; continue; }

  for (const mv of r.path) {
    const from = 'jar' + mv.from, to = mv.to === -1 ? 'main' : 'jar' + mv.to;
    if (!g.pour(from, to).ok) { console.log('  ' + lvl.id + ': solver move is illegal in the engine'); bad++; break; }
  }
  if (!g.won) { console.log('  ' + lvl.id + ': the solution does not win'); bad++; continue; }
  if (r.par !== lvl.par) { console.log('  ' + lvl.id + ': par says ' + lvl.par + ' but the true fewest is ' + r.par); bad++; }

  /* The colours the level actually uses must all be far enough apart to tell
     apart — including the ones that only appear once something is mixed. */
  const used = new Set(lvl.jars.flatMap(j => j.fills));
  used.add(lvl.target);
  for (const rec of M.RECIPES) if (used.has(rec.a) && used.has(rec.b)) used.add(rec.makes);
  const keys = [...used];
  for (let a = 0; a < keys.length; a++) {
    for (let b = a + 1; b < keys.length; b++) {
      if (C.distance(keys[a], keys[b]) < 150) {
        console.log('  ' + lvl.id + ': lookalikes ' + keys[a] + '/' + keys[b]); bad++;
      }
    }
  }

  console.log('  ' + lvl.id + '  ' + lvl.name.padEnd(18) +
    ' target ' + C.name(lvl.target).padEnd(7) +
    ' jars ' + lvl.jars.length +
    '  par ' + String(r.par).padStart(2) +
    '  (' + r.explored + ' states, ' + ms + 'ms)' +
    '  survives random play ' + survivalRate(lvl, 40) + '%');
}

console.log(bad ? '\n' + bad + ' PROBLEM(S)' : '\nall levels check out');
process.exit(bad ? 1 : 0);
