/* solver.js — breadth-first search over pour states.
 *
 * Used three ways: to prove a generated puzzle can be finished, to set par to
 * the genuine fewest moves rather than a guess, and to answer the hint button
 * from wherever the player currently is.
 *
 * Three things keep the search small enough to run in a keypress:
 *
 *  - Jars holding the same thing are interchangeable, so states are compared
 *    by a canonical key with the side jars sorted.
 *  - Pouring the target colour into the big jar is never a wrong move: the
 *    big jar takes nothing else, always has room until it is finished, and
 *    emptying that run frees space. Merging target runs elsewhere first costs
 *    a move and saves at most one, so it can never come out ahead. When such
 *    a move exists the search takes it and ignores the alternatives.
 *  - It is a best-first (A*) search rather than a plain breadth-first one,
 *    guided by the lower bound in estimate() below. Breadth-first was fine
 *    for small boards but grew impossible past about seven jars; the estimate
 *    is what makes the larger boards searchable at all. */
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

  /* A lower bound on the moves still needed — never an overestimate, which is
     what keeps the search's answer exactly optimal.
     
     Two counts, and no pour can serve both, so they add:
       - every run of the target colour still outside the big jar needs a pour
         to get there, and one pour shifts at most one run;
       - every run sitting on top of the target somewhere is in the way and
         has to move at least once. */
  function estimate(pos, jars) {
    var need = 0, buried = 0;
    for (var i = 0; i < jars.length; i++) {
      var cells = jars[i].cells;
      if (!cells.length) continue;

      var highest = -1;
      for (var k = cells.length - 1; k >= 0; k--) {
        if (cells[k] === pos.target) { highest = k; break; }
      }
      if (highest < 0) continue;

      for (var a = 0; a <= highest; a++) {
        if (cells[a] === pos.target && (a === 0 || cells[a - 1] !== pos.target)) need++;
      }
      for (var b = highest + 1; b < cells.length; b++) {
        if (b === highest + 1 || cells[b] !== cells[b - 1]) buried++;
      }
    }
    return need + buried;
  }

  function apply(main, jars, mv) {
    var from = jars[mv.from];
    var to = mv.to === -1 ? main : jars[mv.to];
    for (var i = 0; i < mv.amount; i++) to.cells.push(from.cells.pop());
  }

  /* Fewest moves from this position, or null if it cannot be finished.
     Returns { par, path } where path entries are { from, to } jar indices,
     to === -1 meaning the big jar.

     Best-first: states are taken in order of moves-so-far plus estimate().
     Because the estimate never overshoots, the first time the finished
     position comes off the queue it is by a shortest route — the answer is
     the true minimum, not merely a good one. */
  function solve(pos, budget, msBudget) {
    budget = budget || DEFAULT_BUDGET;

    /* A wall-clock limit as well as a state count. The two are not
       interchangeable: on a big shelf a few thousand states can take a
       second, and this search runs on the same thread that draws the page.
       Callers that run between taps pass a short one so the game never
       stalls, whatever size the board is. */
    var expiry = msBudget ? Date.now() + msBudget : 0;
    var nextTimeCheck = 512;

    var start = cloneAll(pos.main, pos.jars);
    if (solved(pos, start.main)) return { par: 0, path: [], explored: 0 };

    var nodes = [{ state: start, prev: -1, move: null, cost: 0 }];
    var cheapest = Object.create(null);
    cheapest[key(start.main, start.jars)] = 0;

    /* Costs are whole numbers and only ever grow by one, so a plain array of
       buckets serves as the queue — cheaper than a heap. */
    var queue = [];
    function enqueue(rank, index) {
      (queue[rank] || (queue[rank] = [])).push(index);
    }
    enqueue(estimate(pos, start.jars), 0);

    var rank = 0, expanded = 0;

    while (rank < queue.length) {
      var bucket = queue[rank];
      if (!bucket || !bucket.length) { rank++; continue; }

      var index = bucket.pop();
      var node = nodes[index];
      var here = key(node.state.main, node.state.jars);
      if (cheapest[here] < node.cost) continue;      /* a better route reached it first */

      if (solved(pos, node.state.main)) {
        var path = [];
        for (var at = index; at > 0; at = nodes[at].prev) path.unshift(nodes[at].move);
        return { par: node.cost, path: path, explored: expanded };
      }

      if (++expanded > budget) return { budgetExceeded: true };
      if (expiry && expanded >= nextTimeCheck) {
        nextTimeCheck = expanded + 512;
        if (Date.now() > expiry) return { budgetExceeded: true };
      }

      var list = moves(pos, node.state.main, node.state.jars);
      for (var m = 0; m < list.length; m++) {
        var next = cloneAll(node.state.main, node.state.jars);
        apply(next.main, next.jars, list[m]);

        var there = key(next.main, next.jars);
        var cost = node.cost + 1;
        if (cheapest[there] !== undefined && cheapest[there] <= cost) continue;
        cheapest[there] = cost;

        nodes.push({ state: next, prev: index, move: list[m], cost: cost });
        enqueue(cost + estimate(pos, next.jars), nodes.length - 1);
      }
    }
    return { par: null, path: null, explored: expanded };   /* no way through */
  }

  global.Solver = { solve: solve, DEFAULT_BUDGET: DEFAULT_BUDGET };
})(typeof window !== 'undefined' ? window : globalThis);
