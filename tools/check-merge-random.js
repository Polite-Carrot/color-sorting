#!/usr/bin/env node
/* Random merge puzzles have to be dealt while somebody waits, and be worth
   playing when they arrive. Check both: how long a deal takes, where par
   lands, and that every board really is winnable and unspoilable. */
const P = require('path').join(__dirname, '..', 'js') + '/';
require(P + 'colour.js'); require(P + 'engine.js'); require(P + 'merge.js');
require(P + 'merge-generator.js');
const C = globalThis.Colour, M = globalThis.Merge, { Game } = globalThis.Engine;
const G = globalThis.MergeGenerator;

/* Taken from the generator rather than listed here, so a setting added there
   cannot quietly go unchecked — which is exactly what happened when Extra Hard
   was added and this file still named three. */
let failures = 0;
for (const key of Object.keys(G.DIFFICULTY)) {
  const cfg = G.DIFFICULTY[key];
  const pars = [], times = [], states = [];
  let fallbacks = 0, bad = [];
  const N = 60;
  for (let seed = 1; seed <= N; seed++) {
    const t = Date.now();
    const lvl = G.generate(key, seed);
    times.push(Date.now() - t);
    if (!lvl.parents || lvl.par === 2 && lvl.name === 'Make the purple' && key !== 'easy') fallbacks++;
    pars.push(lvl.par);

    /* it must actually be winnable, and its stored path must be a real win */
    const g = new Game(lvl);
    for (const [from, to] of lvl.path) {
      if (!g.pour('jar' + from, to === -1 ? 'main' : 'jar' + to).ok) { bad.push(lvl.id + ': stored path illegal'); break; }
    }
    if (!g.won) bad.push(lvl.id + ': stored path does not win');

    /* no rival recipe may be on the shelf — no merge can ever be wrong */
    const present = new Set(lvl.jars.flatMap(j => j.fills));
    for (const r of M.RECIPES) {
      if (present.has(r.a) && present.has(r.b) && r.makes !== lvl.target) bad.push(lvl.id + ': rival recipe');
    }
    if (present.has(lvl.target)) bad.push(lvl.id + ': target already on the shelf');

    /* and no two colours on the shelf may be too close to tell apart */
    const used = [...present, lvl.target];
    for (let a = 0; a < used.length; a++) for (let b = a + 1; b < used.length; b++) {
      if (C.distance(used[a], used[b]) < 150) bad.push(lvl.id + ': lookalikes ' + C.name(used[a]) + '/' + C.name(used[b]));
    }
  }
  const med = [...times].sort((a, b) => a - b)[Math.floor(N / 2)];
  console.log(key.padEnd(7) + ' par ' + Math.min(...pars) + '–' + Math.max(...pars) +
    ' (median ' + [...pars].sort((a, b) => a - b)[Math.floor(N / 2)] + ')' +
    '  dealt in ' + med + 'ms median, ' + Math.max(...times) + 'ms worst' +
    '  fallbacks ' + fallbacks +
    (bad.length ? '   ** ' + bad.length + ' PROBLEMS: ' + bad[0] : '   ok'));
  failures += bad.length;
}
console.log(failures ? '\n' + failures + ' PROBLEM(S)' : '\nrandom merge puzzles check out');
process.exit(failures ? 1 : 0);
