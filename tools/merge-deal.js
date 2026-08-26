/* Deals Merge Colours boards. Shared by the probe and the level builder.
 *
 * The construction is deliberately one that CANNOT be spoiled. Only the two
 * parents of the target ever appear as mixable colours — the third primary is
 * left out entirely — so every merge a player can make produces the target,
 * and no amount of wrong play can destroy a unit that was needed. Everything
 * else on the shelf is inert: it has no partner present, so it can only stack
 * on its own colour or sit in an empty jar. What is left to get wrong is
 * space and order, which is exactly what the ordinary game asks too. */
'use strict';
const C = globalThis.Colour, M = globalThis.Merge;

/* Only the primaries mix, so a target is always one of the three secondaries. */
const TARGETS = M.RECIPES.map(r => ({ target: r.makes, a: r.a, b: r.b }));

function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deal(cfg, seed) {
  const rand = rng(seed);
  const pick = TARGETS[Math.floor(rand() * TARGETS.length)];
  const primaries = M.RECIPES.reduce((set, r) => set.add(r.a).add(r.b), new Set());

  /* Anything with no partner on the shelf is inert and safe to use as an
     obstacle. The third primary is excluded so no rival recipe exists. */
  const inert = C.KEYS.filter(k =>
    k !== pick.target && k !== pick.a && k !== pick.b && !primaries.has(k));

  const fillers = [];
  const pool = inert.slice();
  for (let i = 0; i < cfg.fillers && pool.length; i++) {
    fillers.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }

  /* Exactly one jarful of target can be made and every drop of it is needed:
     mainCap of each parent, and not a unit more. */
  const units = [];
  for (let i = 0; i < cfg.mainCap; i++) { units.push(pick.a); units.push(pick.b); }

  const counts = new Array(fillers.length).fill(1);
  for (let i = fillers.length; i < cfg.fillerUnits; i++) {
    counts[Math.floor(rand() * fillers.length)]++;
  }
  fillers.forEach((f, i) => { for (let k = 0; k < counts[i]; k++) units.push(f); });

  const jars = [];
  for (let i = 0; i < cfg.sideJars; i++) jars.push({ cap: cfg.sideCap, fills: [] });

  /* burial pushes the parents towards the bottom of the jars, so there is more
     to clear away before they can be brought together. */
  const deck = units
    .map(u => ({ u, order: rand() - ((u === pick.a || u === pick.b) ? (cfg.burial || 0) : 0) }))
    .sort((x, y) => x.order - y.order)
    .map(x => x.u);

  for (const unit of deck) {
    const open = jars.filter(j => j.fills.length < j.cap);
    if (!open.length) return null;
    let choice = open;
    /* churn steers a unit away from a jar already showing its colour, so the
       parents end up in thin layers and take more pours to gather. */
    if (cfg.churn && rand() < cfg.churn) {
      const mixed = open.filter(j => !j.fills.length || j.fills[j.fills.length - 1] !== unit);
      if (mixed.length) choice = mixed;
    }
    choice[Math.floor(rand() * choice.length)].fills.push(unit);
  }

  return {
    mode: 'merge',
    target: pick.target,
    parents: [pick.a, pick.b],
    main: { cap: cfg.mainCap },
    jars
  };
}

module.exports = { deal, TARGETS };
