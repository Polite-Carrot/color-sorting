/* merge.js — the rules and the search for Merge Colours.
 *
 * The ordinary game moves colours around; this mode makes them. Pouring one
 * colour onto a different one mixes the two, so the colour the big jar wants
 * usually is not on the shelf at the start — it has to be made.
 *
 * Kept apart from solver.js on purpose. That search is an A* whose lower bound
 * is proved against the ordinary rules, where every pour preserves the number
 * of units on the shelf. Merging destroys units, so that bound does not hold
 * here, and quietly reusing it would give a wrong par. This is a plain
 * breadth-first search instead: slower, but optimal by construction, which
 * matters more than speed on boards this size. */
(function (global) {
  'use strict';

  var Engine = global.Engine;
  var topRun = Engine.topRun, top = Engine.top;

  /* Only the three primaries mix, and each pair makes the secondary sitting
     between them on the wheel. Everything else is inert: it can still be
     stacked on its own colour or parked in an empty jar, but it will not
     combine. Three recipes is the whole of the rule, which is what keeps the
     mode readable without a chart to hand. */
  var RECIPES = [
    { a: 'red',  b: 'yellow', makes: 'orange' },
    { a: 'red',  b: 'blue',   makes: 'purple' },
    { a: 'blue', b: 'yellow', makes: 'green'  }
  ];

  function mix(one, other) {
    for (var i = 0; i < RECIPES.length; i++) {
      var r = RECIPES[i];
      if ((r.a === one && r.b === other) || (r.a === other && r.b === one)) return r.makes;
    }
    return null;
  }

  /* How many units pair off when a run of one colour lands on a run of
     another: as many as both sides can match. Whatever is left over stays
     where it was, so a pour is never refused for being the wrong size — it
     simply does as much as it can.

     The destination keeps the same number of units either way (n of its own
     become n mixed), so a merge never needs room to land in. */
  function mergeAmount(fromCells, toCells) {
    return Math.min(topRun(fromCells), topRun(toCells));
  }

  /* ── search ───────────────────────────────────────────────────────────── */

  var DEFAULT_BUDGET = 120000;

  function key(main, jars) {
    var side = jars.map(function (j) { return j.capacity + ':' + j.cells.join(','); });
    side.sort();
    return main.cells.join(',') + '|' + side.join('/');
  }

  function solved(pos, main) {
    if (main.cells.length !== main.capacity) return false;
    for (var i = 0; i < main.cells.length; i++) if (main.cells[i] !== pos.target) return false;
    return true;
  }

  function clone(main, jars) {
    return {
      main: { capacity: main.capacity, cells: main.cells.slice() },
      jars: jars.map(function (j) {
        return { id: j.id, capacity: j.capacity, cells: j.cells.slice() };
      })
    };
  }

  /* Every legal pour, in the same shape solver.js returns so the hint and the
     dead-end warning can read either without caring which mode is running. */
  function moves(pos, main, jars) {
    var out = [];
    for (var i = 0; i < jars.length; i++) {
      var from = jars[i];
      if (!from.cells.length) continue;
      var colour = top(from.cells);
      var run = topRun(from.cells);

      /* Pouring the target into the big jar is never a wrong move, so when one
         is available nothing else is worth considering. The big jar takes
         nothing else, always has room until it is finished, and emptying that
         run frees space; gathering target elsewhere first costs a move and
         saves at most one. The ordinary game leans on the same rule, and the
         reasoning carries over because the target here is a secondary colour
         and so is never an ingredient — nothing can consume it, and no merge
         ever needs it. */
      if (colour === pos.target && main.cells.length < main.capacity) {
        return [{ from: i, to: -1, amount: Math.min(run, main.capacity - main.cells.length) }];
      }

      for (var j = 0; j < jars.length; j++) {
        if (i === j) continue;
        var to = jars[j];

        if (!to.cells.length) {
          /* Tipping a jar that is all one colour into an empty one only
             mirrors the position. */
          if (run === from.cells.length) continue;
          if (to.capacity > 0) out.push({ from: i, to: j, amount: Math.min(run, to.capacity) });
          continue;
        }

        var landing = top(to.cells);
        if (landing === colour) {
          var space = to.capacity - to.cells.length;
          if (space > 0) out.push({ from: i, to: j, amount: Math.min(run, space) });
          continue;
        }

        var made = mix(colour, landing);
        if (made) out.push({ from: i, to: j, amount: mergeAmount(from.cells, to.cells), makes: made });
      }
    }
    return out;
  }

  function apply(main, jars, mv) {
    var from = jars[mv.from];
    var to = mv.to === -1 ? main : jars[mv.to];
    if (mv.makes) {
      for (var i = 0; i < mv.amount; i++) {
        from.cells.pop();
        to.cells[to.cells.length - 1 - i] = mv.makes;
      }
      return;
    }
    for (var k = 0; k < mv.amount; k++) to.cells.push(from.cells.pop());
  }

  /* Fewest moves from here, or null if it cannot be finished.
     Breadth-first, so the first time the finished position is reached it is by
     a shortest route — no estimate to get wrong. */
  function solve(pos, budget, msBudget) {
    budget = budget || DEFAULT_BUDGET;
    var expiry = msBudget ? Date.now() + msBudget : 0;
    var nextTimeCheck = 512;

    var start = clone(pos.main, pos.jars);
    if (solved(pos, start.main)) return { par: 0, path: [], explored: 0 };

    var nodes = [{ state: start, prev: -1, move: null, cost: 0 }];
    var seen = Object.create(null);
    seen[key(start.main, start.jars)] = true;

    var head = 0, expanded = 0;
    while (head < nodes.length) {
      var index = head++;
      var node = nodes[index];

      if (++expanded > budget) return { budgetExceeded: true };
      if (expiry && expanded >= nextTimeCheck) {
        nextTimeCheck = expanded + 512;
        if (Date.now() > expiry) return { budgetExceeded: true };
      }

      var list = moves(pos, node.state.main, node.state.jars);
      for (var m = 0; m < list.length; m++) {
        var next = clone(node.state.main, node.state.jars);
        apply(next.main, next.jars, list[m]);
        var id = key(next.main, next.jars);
        if (seen[id]) continue;
        seen[id] = true;

        var at = nodes.length;
        nodes.push({ state: next, prev: index, move: list[m], cost: node.cost + 1 });
        if (solved(pos, next.main)) {
          var path = [];
          for (var back = at; back > 0; back = nodes[back].prev) path.unshift(nodes[back].move);
          return { par: node.cost + 1, path: path, explored: expanded };
        }
      }
    }
    return { par: null, path: null, explored: expanded };   /* no way through */
  }

  global.Merge = {
    RECIPES: RECIPES,
    mix: mix,
    mergeAmount: mergeAmount,
    solve: solve,
    DEFAULT_BUDGET: DEFAULT_BUDGET
  };
})(typeof window !== 'undefined' ? window : globalThis);
