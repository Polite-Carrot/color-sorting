"use strict";
/* Asking for a store rating, at a moment the player is pleased with the game.
 *
 * The system rating sheet (StoreKit on iOS, Play In-App Review on Android,
 * both through @capacitor-community/in-app-review) is the only way to ask
 * that Apple allows, and both stores ration it: iOS shows it at most three
 * times a year however often it is requested, and neither platform says
 * whether it actually appeared. So the request has to be spent well.
 *
 * It is only made when ALL of these hold:
 *   - the puzzle just finished earned three stars (a good moment, not a
 *     frustrating one);
 *   - at least MIN_SOLVED puzzles are behind them (they know the game);
 *   - they first opened the game at least MIN_DAYS days ago (they came back);
 *   - it has not been requested in the last GAP_DAYS days, nor MAX_ASKS times.
 * Never at launch, never after a loss or a hint, never on the web.
 *
 * The caller (app.js, when the win card appears) just reports the win; all
 * of the judgement is here so it can be tested without a phone. */

(function () {
  var KEY = "colourjars.rate.v1";
  var MIN_SOLVED = 12;
  var MIN_DAYS = 2;
  var GAP_DAYS = 90;
  var MAX_ASKS = 3;
  var DAY = 24 * 60 * 60 * 1000;

  var plugin = null;
  var mem = read();
  if (!mem.firstSeen) { mem.firstSeen = Date.now(); write(); }

  function read() {
    var m = { firstSeen: 0, asks: 0, lastAt: 0 };
    try {
      var raw = window.Store && window.Store.read(KEY);
      if (raw) {
        var v = JSON.parse(raw);
        if (typeof v.firstSeen === "number") m.firstSeen = v.firstSeen;
        if (typeof v.asks === "number") m.asks = v.asks;
        if (typeof v.lastAt === "number") m.lastAt = v.lastAt;
      }
    } catch (e) {}
    return m;
  }

  function write() {
    try { window.Store.write(KEY, JSON.stringify(mem)); } catch (e) {}
  }

  function available() {
    try {
      var C = window.Capacitor;
      if (!C || !C.isNativePlatform || !C.isNativePlatform()) return false;
      var p = C.getPlatform();
      return p === "ios" || p === "android";
    } catch (e) { return false; }
  }

  function get() {
    if (plugin || !available()) return plugin;
    var C = window.Capacitor;
    if (C.registerPlugin) plugin = C.registerPlugin("InAppReview");
    else if (C.Plugins) plugin = C.Plugins.InAppReview;
    return plugin;
  }

  /* win: { stars, solved } where solved is the lifetime total including this one. */
  function due(win, now) {
    if (!available() || !win) return false;
    if (win.stars !== 3 || (win.solved || 0) < MIN_SOLVED) return false;
    if (now - mem.firstSeen < MIN_DAYS * DAY) return false;
    if (mem.asks >= MAX_ASKS) return false;
    if (mem.lastAt && now - mem.lastAt < GAP_DAYS * DAY) return false;
    return true;
  }

  /* Reports a win; requests the rating sheet if this is the moment. Resolves
   * to true when the request was made. */
  async function noteWin(win) {
    var now = Date.now();
    if (!due(win, now)) return false;
    var R = get();
    if (!R || !R.requestReview) return false;
    /* Recorded before the call: if the plugin throws, asking again on the
       very next win would be worse than having asked one time fewer. */
    mem.asks += 1;
    mem.lastAt = now;
    write();
    try { await R.requestReview(); } catch (e) { return false; }
    return true;
  }

  window.Rate = { noteWin: noteWin, due: function (win) { return due(win, Date.now()); } };
})();
