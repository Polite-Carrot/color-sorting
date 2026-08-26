/* engine.js — puzzle state: stacked jars, pouring, undo and the win check.
 * Pure logic, no DOM.
 *
 * Rules:
 *  - A jar is a stack of solid units, listed bottom to top.
 *  - Pouring moves the whole top run of one colour from one jar to another.
 *  - A pour is legal only onto an empty jar, or onto the same colour, and
 *    only as far as there is room.
 *  - In Merge Colours levels one more landing is legal: pouring onto a colour
 *    that mixes with it. See merge.js for the recipes.
 *  - The big jar accepts the target colour and nothing else, and never pours
 *    back out. It cannot be spoiled, so a wrong tap costs nothing. */
(function (global) {
  'use strict';

  var MAIN = 'main';

  function cloneJars(jars) {
    return jars.map(function (j) {
      return { id: j.id, capacity: j.capacity, cells: j.cells.slice() };
    });
  }

  /* Length of the run of identical colour at the top of a stack. */
  function topRun(cells) {
    if (!cells.length) return 0;
    var c = cells[cells.length - 1], n = 1;
    for (var i = cells.length - 2; i >= 0; i--) {
      if (cells[i] !== c) break;
      n++;
    }
    return n;
  }

  function top(cells) { return cells.length ? cells[cells.length - 1] : null; }

  function Game(level) {
    this.level = level;
    this.target = level.target;
    this.par = level.par;
    /* Merge Colours levels say so on the level itself, so a Game is enough to
       know which rules it is playing by and nothing else has to be told. */
    this.merging = level.mode === 'merge';
    this.restart();
  }

  Game.prototype.restart = function () {
    var lvl = this.level;
    this.main = { id: MAIN, capacity: lvl.main.cap, cells: (lvl.main.fills || []).slice() };
    this.jars = lvl.jars.map(function (spec, i) {
      return { id: 'jar' + i, capacity: spec.cap, cells: (spec.fills || []).slice() };
    });
    this.moves = 0;
    this.hintsUsed = 0;
    this.won = false;
    this.history = [];
  };

  Game.prototype.get = function (id) {
    if (id === MAIN) return this.main;
    for (var i = 0; i < this.jars.length; i++) if (this.jars[i].id === id) return this.jars[i];
    return null;
  };

  Game.prototype.all = function () { return [this.main].concat(this.jars); };

  /* How many units a pour would actually move, and why not if zero. */
  Game.prototype.check = function (fromId, toId) {
    if (fromId === toId) return { amount: 0, reason: 'same' };
    var from = this.get(fromId), to = this.get(toId);
    if (!from || !to) return { amount: 0, reason: 'missing' };
    if (fromId === MAIN) return { amount: 0, reason: 'locked' };
    if (!from.cells.length) return { amount: 0, reason: 'empty' };

    var colour = top(from.cells);
    var space = to.capacity - to.cells.length;

    /* The big jar collects and never mixes, so it can still never be spoiled
       by a wrong tap — the same promise the ordinary game makes. Outside merge
       levels this is always null, so everything below behaves exactly as it
       always did. */
    var mixed = this.merging && toId !== MAIN && to.cells.length &&
                top(to.cells) !== colour && global.Merge
      ? global.Merge.mix(colour, top(to.cells)) : null;

    /* A merge turns units already in the jar into the new colour rather than
       stacking on top of them, so it needs no room — which is why the room
       check has to come after it and not before. */
    if (space <= 0 && !mixed) return { amount: 0, reason: 'full' };

    if (toId === MAIN && colour !== this.target) return { amount: 0, reason: 'wrong-colour' };

    if (to.cells.length && top(to.cells) !== colour) {
      if (!mixed) return { amount: 0, reason: this.merging ? 'no-mix' : 'mismatch' };
      return {
        amount: global.Merge.mergeAmount(from.cells, to.cells),
        colour: colour,
        merge: mixed
      };
    }

    return { amount: Math.min(topRun(from.cells), space), colour: colour };
  };

  Game.prototype.pourable = function (fromId, toId) { return this.check(fromId, toId).amount; };

  Game.prototype.pour = function (fromId, toId) {
    var can = this.check(fromId, toId);
    if (!can.amount) return { ok: false, reason: can.reason };

    this.history.push({ main: cloneJars([this.main])[0], jars: cloneJars(this.jars), moves: this.moves });
    if (this.history.length > 300) this.history.shift();

    var from = this.get(fromId), to = this.get(toId);
    if (can.merge) {
      for (var m = 0; m < can.amount; m++) {
        from.cells.pop();
        to.cells[to.cells.length - 1 - m] = can.merge;
      }
    } else {
      for (var i = 0; i < can.amount; i++) to.cells.push(from.cells.pop());
    }

    this.moves++;
    this.won = this.isSolved();
    return {
      ok: true, amount: can.amount, colour: can.colour, merge: can.merge,
      from: fromId, to: toId, won: this.won
    };
  };

  Game.prototype.isSolved = function () {
    if (this.main.cells.length !== this.main.capacity) return false;
    for (var i = 0; i < this.main.cells.length; i++) if (this.main.cells[i] !== this.target) return false;
    return true;
  };

  Game.prototype.collected = function () { return this.main.cells.length; };

  /* Any legal move at all? Used to spot a dead end early. */
  Game.prototype.hasMoves = function () {
    var ids = this.all().map(function (j) { return j.id; });
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < ids.length; j++) {
        if (this.pourable(ids[i], ids[j])) return true;
      }
    }
    return false;
  };

  Game.prototype.canUndo = function () { return this.history.length > 0; };

  Game.prototype.undo = function () {
    if (!this.history.length) return false;
    var s = this.history.pop();
    this.main = s.main;
    this.jars = s.jars;
    this.moves = s.moves;
    this.won = false;
    return true;
  };

  Game.prototype.stars = function () {
    if (!this.won) return 0;
    if (this.hintsUsed > 0) return this.moves <= this.par ? 2 : 1;
    if (this.moves <= this.par) return 3;
    if (this.moves <= this.par + 2) return 2;
    return 1;
  };

  /* Plain snapshot for the solver. */
  Game.prototype.position = function () {
    return {
      target: this.target,
      main: { capacity: this.main.capacity, cells: this.main.cells.slice() },
      jars: cloneJars(this.jars)
    };
  };

  global.Engine = { Game: Game, MAIN: MAIN, topRun: topRun, top: top };
})(typeof window !== 'undefined' ? window : globalThis);
