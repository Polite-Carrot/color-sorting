/* solver.js — breadth-first search over pour states.
 *
 * Used three ways: to prove a generated puzzle can be finished, to set par to
 * the genuine fewest moves rather than a guess, and to answer the hint button
 * from wherever the player currently is.
 *
 * Two things keep the search small enough to run in a keypress:
 *
 *  - Jars holding the same thing are interchangeable, so states are compared
 *    by a canonical key with the side jars sorted.
 *  - Pouring the target colour into the big jar is never a wrong move: the
 *    big jar takes nothing else, always has room until it is finished, and
 *    emptying that run frees space. Merging target runs elsewhere first costs
 *    a move and saves at most one, so it can never come out ahead. When such
 *    a move exists the search takes it and ignores the alternatives. */
(function (global) {
  'use strict';

  var Engine = global.Engine;
  var topRun = Engine.topRun, top = Engine.top;

  var DEFAULT_BUDGET = 250000;

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

  function cloneAll(main, jars) {
    return {
      main: { capacity: main.capacity, cells: main.cells.slice() },
      jars: jars.map(function (j) { return { id: j.id, capacity: j.capacity, cells: j.cells.slice() }; })
    };
  }

  /* Every legal pour out of the side jars. -1 means the big jar. */
  function moves(pos, main, jars) {
    var out = [];
    for (var i = 0; i < jars.length; i++) {
      var from = jars[i];
      if (!from.cells.length) continue;
      var colour = top(from.cells);
      var run = topRun(from.cells);

      /* Into the big jar — and if that is possible, nothing else matters. */
      if (colour === pos.target && main.cells.length < main.capacity) {
        return [{ from: i, to: -1, amount: Math.min(run, main.capacity - main.cells.length) }];
      }

      for (var j = 0; j < jars.length; j++) {
        if (i === j) continue;
        var to = jars[j];
        var space = to.capacity - to.cells.length;
        if (space <= 0) continue;
        if (to.cells.length && top(to.cells) !== colour) continue;
        /* Tipping a jar that is all one colour into an empty one achieves
           nothing but a mirror image of the same position. */
        if (!to.cells.length && run === from.cells.length) continue;
        out.push({ from: i, to: j, amount: Math.min(run, space) });
      }
    }
    return out;
  }

  function apply(main, jars, mv) {
    var from = jars[mv.from];
    var to = mv.to === -1 ? main : jars[mv.to];
    for (var i = 0; i < mv.amount; i++) to.cells.push(from.cells.pop());
  }

  /* Fewest moves from this position, or null if it cannot be finished.
     Returns { par, path } where path entries are { from, to } jar indices,
     to === -1 meaning the big jar. */
  function solve(pos, budget) {
    budget = budget || DEFAULT_BUDGET;

    var start = cloneAll(pos.main, pos.jars);
    if (solved(pos, start.main)) return { par: 0, path: [], explored: 0 };

    var nodes = [{ state: start, prev: -1, move: null }];
    var seen = Object.create(null);
    seen[key(start.main, start.jars)] = true;

    for (var head = 0; head < nodes.length; head++) {
      if (nodes.length > budget) return { budgetExceeded: true };

      var node = nodes[head];
      var list = moves(pos, node.state.main, node.state.jars);

      for (var m = 0; m < list.length; m++) {
        var next = cloneAll(node.state.main, node.state.jars);
        apply(next.main, next.jars, list[m]);

        var k = key(next.main, next.jars);
        if (seen[k]) continue;
        seen[k] = true;

        nodes.push({ state: next, prev: head, move: list[m] });

        if (solved(pos, next.main)) {
          var path = [];
          for (var at = nodes.length - 1; at > 0; at = nodes[at].prev) path.unshift(nodes[at].move);
          return { par: path.length, path: path, explored: nodes.length };
        }
      }
    }
    return { par: null, path: null, explored: nodes.length };   /* no way through */
  }

  global.Solver = { solve: solve, DEFAULT_BUDGET: DEFAULT_BUDGET };
})(typeof window !== 'undefined' ? window : globalThis);
