/* merge.js — the rules and the search for Merge Colors.
 *
 * The ordinary game moves colours around; this mode makes them. Pouring one
 * colour onto a different one mixes the two, so the colour the big jar wants
 * usually is not on the shelf at the start — it has to be made.
 *
 * Kept apart from solver.js on purpose. That search is an A* whose lower bound
 * is proved against the ordinary rules, where every pour preserves the number
 * of units on the shelf. Merging destroys units, so that bound does not hold
 * here, and quietly reusing it would give a wrong par. This has a bound of its
 * own instead — see bound() below. */
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

  /* A lower bound on the moves still needed — never an overestimate, which is
     what keeps the answer exactly optimal. Three counts that no single move
     can serve two of, so they add:

       - every unit of target still owed to the big jar arrives by a pour, and
         one pour carries at most a jarful;
       - every unit of target that does not exist yet has to be made by a
         merge, and one merge makes at most a jarful;
       - every run of a colour that mixes with nothing, sitting on top of a
         target or one of its parents, is in the way and has to move at least
         once. A merge moves a parent, a delivery moves target, so neither can
         shift one of these on the way past.

     Each move also changes the total by at most one either way, which is what
     lets a position be closed off once it has been reached.

     Without this the search was breadth-first and had nothing to aim at, and
     that — not the shelf and not the palette — was what capped the mode's
     levels at par 21. */
  function bound(pos, main, jars) {
    var missing = main.capacity - main.cells.length;
    if (missing <= 0) return 0;

    var target = pos.target;
    var parents = null;
    for (var r = 0; r < RECIPES.length; r++) {
      if (RECIPES[r].makes === target) { parents = RECIPES[r]; break; }
    }
    var pa = parents ? parents.a : null, pb = parents ? parents.b : null;

    var onShelf = 0, blockers = 0, biggest = 1;
    for (var i = 0; i < jars.length; i++) {
      var cells = jars[i].cells;
      if (jars[i].capacity > biggest) biggest = jars[i].capacity;
      if (!cells.length) continue;

      /* The deepest cell that is either target or one of its parents: anything
         inert above that line has to be lifted out of the way. */
      var deepest = -1;
      for (var k = 0; k < cells.length; k++) {
        if (cells[k] === target) { onShelf++; if (deepest < 0) deepest = k; }
        else if ((cells[k] === pa || cells[k] === pb) && deepest < 0) deepest = k;
      }
      if (deepest < 0) continue;

      for (var a = deepest + 1; a < cells.length; a++) {
        if (a > deepest + 1 && cells[a] === cells[a - 1]) continue;     /* same run */
        if (cells[a] !== target && cells[a] !== pa && cells[a] !== pb) blockers++;
      }
    }

    var toMake = missing - onShelf;
    if (toMake < 0) toMake = 0;
    return Math.ceil(missing / biggest) + Math.ceil(toMake / biggest) + blockers;
  }

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
     dead-end warning can read either without caring which mode is running.

     Empty jars of the same size are interchangeable, so only the first is
     offered as a destination: pouring into the first of three empty jars or
     the third reaches the same position, and generating all three only to
     throw two away costs a clone and a key each time. Deduplicating the rest
     was tried and measured — building a signature for every jar cost as much
     as it saved, and left the states expanded exactly the same — so only the
     empty ones, which are the common case and cost nothing to spot, are
     collapsed here. */
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

      var emptyUsed = null;
      for (var j = 0; j < jars.length; j++) {
        if (i === j) continue;
        var to = jars[j];

        if (!to.cells.length) {
          if (emptyUsed === to.capacity) continue;
          emptyUsed = to.capacity;
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

     Best-first, taking positions in order of moves-so-far plus bound(). Since
     the bound never overshoots, the first time the finished position comes off
     the queue it is by a shortest route — the answer is the true minimum, not
     merely a good one. */
  /* A binary min-heap on f = cost + weight * bound.

     The queue used to be buckets indexed by f, which is cheaper than a heap
     and perfectly sound while f never decreases along a path — which holds for
     a bound that is admissible AND consistent, as this one is at weight 1.
     Weighting the bound breaks that guarantee: a child can rank below its
     parent, and a bucket scan that has already passed that rank loses the node
     silently. A heap makes no such assumption, which is the only reason a
     weight can exist here at all.

     Ties are broken towards the node inserted most recently, which is what
     `bucket.pop()` did before — a depth-first lean that reaches a goal sooner
     without changing which goal is optimal. */
  function Heap() { this.a = []; }
  Heap.prototype.before = function (x, y) {
    return x.f < y.f || (x.f === y.f && x.seq > y.seq);
  };
  Heap.prototype.push = function (f, seq, index) {
    var a = this.a, i = a.length;
    a.push({ f: f, seq: seq, i: index });
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (this.before(a[p], a[i])) break;
      var t = a[p]; a[p] = a[i]; a[i] = t;
      i = p;
    }
  };
  Heap.prototype.pop = function () {
    var a = this.a;
    if (!a.length) return -1;
    var top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      var i = 0, n = a.length;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, best = i;
        if (l < n && this.before(a[l], a[best])) best = l;
        if (r < n && this.before(a[r], a[best])) best = r;
        if (best === i) break;
        var t = a[best]; a[best] = a[i]; a[i] = t;
        i = best;
      }
    }
    return top.i;
  };

  /* `weight` inflates the bound. At 1 the search is ordinary A* and par is the
     proven minimum. Above 1 it dives for a goal instead of proving one: far
     fewer states, and a solution that may be longer than the shortest — no
     more than `weight` times longer, which is the standard guarantee. Callers
     that need a true par must leave it at 1. */
  function solve(pos, budget, msBudget, weight) {
    budget = budget || DEFAULT_BUDGET;
    weight = weight || 1;
    var expiry = msBudget ? Date.now() + msBudget : 0;
    var nextTimeCheck = 512;

    var start = clone(pos.main, pos.jars);
    if (solved(pos, start.main)) return { par: 0, path: [], explored: 0 };

    var nodes = [{ state: start, prev: -1, move: null, cost: 0 }];
    var cheapest = Object.create(null);
    cheapest[key(start.main, start.jars)] = 0;

    var queue = new Heap(), seq = 0;
    function enqueue(f, index) { queue.push(f, seq++, index); }
    enqueue(weight * bound(pos, start.main, start.jars), 0);

    var expanded = 0;
    while (queue.a.length) {
      var index = queue.pop();
      var node = nodes[index];
      var here = key(node.state.main, node.state.jars);
      if (cheapest[here] < node.cost) continue;       /* a better route got here first */

      if (solved(pos, node.state.main)) {
        var path = [];
        for (var back = index; back > 0; back = nodes[back].prev) path.unshift(nodes[back].move);
        return { par: node.cost, path: path, explored: expanded };
      }

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
        var cost = node.cost + 1;
        if (cheapest[id] !== undefined && cheapest[id] <= cost) continue;
        cheapest[id] = cost;

        nodes.push({ state: next, prev: index, move: list[m], cost: cost });
        enqueue(cost + weight * bound(pos, next.main, next.jars), nodes.length - 1);
      }
    }
    return { par: null, path: null, explored: expanded };   /* no way through */
  }

  global.Merge = {
    RECIPES: RECIPES,
    mix: mix,
    mergeAmount: mergeAmount,
    solve: solve,
    bound: bound,
    DEFAULT_BUDGET: DEFAULT_BUDGET
  };
})(typeof window !== 'undefined' ? window : globalThis);
