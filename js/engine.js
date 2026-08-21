/* engine.js — puzzle state: jars, pouring, undo and the win check.
 * Pure logic, no DOM. */
(function (global) {
  'use strict';

  var C = global.Colour;
  var MAIN = 'main';
  var DRAIN = 'drain';

  function buildJar(spec, id) {
    var volume = 0, colour = null;
    var fills = spec.fills || [];
    for (var i = 0; i < fills.length; i++) {
      var c = C.parse(fills[i][0]), v = fills[i][1];
      colour = colour === null ? c : C.mix(colour, volume, c, v);
      volume += v;
    }
    return { id: id, capacity: spec.cap, volume: volume, colour: volume > 0 ? colour : null };
  }

  function cloneJars(jars) {
    return jars.map(function (j) {
      return {
        id: j.id,
        capacity: j.capacity,
        volume: j.volume,
        colour: j.colour ? { r: j.colour.r, g: j.colour.g, b: j.colour.b } : null
      };
    });
  }

  function Game(level) {
    this.level = level;
    this.target = C.mixAll(level.target);
    this.par = level.main.cap;
    this.restart();
  }

  Game.prototype.restart = function () {
    var lvl = this.level;
    this.main = buildJar({ cap: lvl.main.cap, fills: lvl.main.fills || [] }, MAIN);
    this.jars = lvl.jars.map(function (spec, i) { return buildJar(spec, 'jar' + i); });
    this.drained = 0;
    this.moves = 0;
    this.hintsUsed = 0;
    this.selected = null;
    this.won = false;
    this.history = [];
  };

  Game.prototype.get = function (id) {
    if (id === MAIN) return this.main;
    for (var i = 0; i < this.jars.length; i++) if (this.jars[i].id === id) return this.jars[i];
    return null;
  };

  Game.prototype.snapshot = function () {
    return {
      main: cloneJars([this.main])[0],
      jars: cloneJars(this.jars),
      drained: this.drained,
      moves: this.moves,
      won: this.won
    };
  };

  Game.prototype.applySnapshot = function (s) {
    this.main = s.main;
    this.jars = s.jars;
    this.drained = s.drained;
    this.moves = s.moves;
    this.won = s.won;
  };

  /* How much can actually move from -> to right now. */
  Game.prototype.pourable = function (fromId, toId, all) {
    if (fromId === toId) return 0;
    var from = this.get(fromId);
    if (!from || from.volume <= 0) return 0;
    if (toId === DRAIN) {
      if (!this.level.drain) return 0;
      return all ? from.volume : 1;
    }
    var to = this.get(toId);
    if (!to) return 0;
    var free = to.capacity - to.volume;
    if (free <= 0) return 0;
    return Math.min(all ? from.volume : 1, free);
  };

  /* Move liquid. Every unit poured costs one move. */
  Game.prototype.pour = function (fromId, toId, all) {
    var amount = this.pourable(fromId, toId, all);
    if (amount <= 0) {
      var from = this.get(fromId);
      var reason = 'blocked';
      if (from && from.volume <= 0) reason = 'empty';
      else if (toId !== DRAIN) {
        var to = this.get(toId);
        if (to && to.volume >= to.capacity) reason = 'full';
      }
      return { ok: false, reason: reason };
    }

    this.history.push(this.snapshot());
    if (this.history.length > 200) this.history.shift();

    var src = this.get(fromId);
    var poured = { r: src.colour.r, g: src.colour.g, b: src.colour.b };
    src.volume -= amount;
    if (src.volume <= 0) { src.volume = 0; src.colour = null; }

    if (toId === DRAIN) {
      this.drained += amount;
    } else {
      var dst = this.get(toId);
      dst.colour = dst.volume > 0 ? C.mix(dst.colour, dst.volume, poured, amount) : poured;
      dst.volume += amount;
    }

    this.moves += amount;
    this.won = this.isSolved();
    return { ok: true, amount: amount, from: fromId, to: toId, won: this.won };
  };

  Game.prototype.isSolved = function () {
    return this.main.volume === this.main.capacity &&
           C.distance(this.main.colour, this.target) <= C.TOLERANCE;
  };

  /* Full but the wrong shade — worth calling out, it is the near-miss case. */
  Game.prototype.isFullButWrong = function () {
    return this.main.volume === this.main.capacity && !this.isSolved();
  };

  Game.prototype.matchPercent = function () {
    if (this.main.volume === 0) return 0;
    return C.matchPercent(this.main.colour, this.target);
  };

  Game.prototype.canUndo = function () { return this.history.length > 0; };

  Game.prototype.undo = function () {
    if (!this.history.length) return false;
    this.applySnapshot(this.history.pop());
    return true;
  };

  /* Next step of the stored solution that has not been done yet, compared
   * against what is actually left in each jar. */
  Game.prototype.hint = function () {
    var sol = this.level.solution || [];
    for (var i = 0; i < sol.length; i++) {
      var step = sol[i];
      var jar = this.jars[step.jar];
      if (!jar) continue;
      var startVolume = this.level.jars[step.jar].fills.reduce(function (n, f) { return n + f[1]; }, 0);
      var alreadyPoured = startVolume - jar.volume;
      if (alreadyPoured < step.units) {
        return { jarIndex: step.jar, jarId: jar.id, units: step.units - alreadyPoured, total: step.units };
      }
    }
    return null;
  };

  Game.prototype.useHint = function () {
    var h = this.hint();
    if (h) this.hintsUsed++;
    return h;
  };

  Game.prototype.stars = function () {
    if (!this.won) return 0;
    if (this.hintsUsed > 0) return this.moves <= this.par ? 2 : 1;
    if (this.moves <= this.par) return 3;
    if (this.moves <= this.par + Math.ceil(this.par / 2)) return 2;
    return 1;
  };

  global.Engine = { Game: Game, MAIN: MAIN, DRAIN: DRAIN };
})(typeof window !== 'undefined' ? window : globalThis);
