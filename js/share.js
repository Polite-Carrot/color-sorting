"use strict";
/* Sharing a result, and opening a puzzle somebody shared.
 *
 * Out: the win card's Share button hands a few lines of text to the phone's
 * share sheet (@capacitor/share in the app, the Web Share API in a browser,
 * the clipboard where neither exists). The text is the whole message,
 * link included, rather than a separate url field: share targets disagree
 * about what to do with a url next to text (some drop the text, some repeat
 * the link), and one string behaves the same everywhere.
 *
 * In: the link points at the web game with the puzzle in the query string,
 * so whoever taps it is playing the same board in a few seconds, no install.
 *   ?daily=2026-11-10                    that day's Daily Puzzle
 *   ?random=hard&seed=12345              a random Sort Colors board
 *   ?random=hard&seed=12345&merge=1      a random Merge Colors board
 * Both random forms deal the identical puzzle, because dealing is seeded.
 * parseLink() only reads and validates; app.js starts the puzzle.
 *
 * Nothing is uploaded and there is no account: the result is in the text,
 * and the puzzle is in the link. */

(function (global) {
  var SITE = "https://colormatch.politecarrot.com/";
  var NAME = "Color Match & Merge";

  function stars(n) {
    var out = "";
    for (var i = 0; i < 3; i++) out += i < n ? "⭐" : "☆";
    return out;
  }

  function movesLine(r) {
    var line = stars(r.stars) + " " + r.moves + (r.moves === 1 ? " move" : " moves");
    line += " (par " + r.par + ")";
    return r.moves <= r.par ? line + " — perfect!" : line;
  }

  /* r: { mode, stars, moves, par, and per mode:
   *      daily:    dailyKey, dateTitle, streak
   *      random:   label (e.g. "Hard"), difficulty, seed, merge, linkable
   *      campaign / merge: levelNumber, total } */
  function text(r) {
    var lines = [];
    var url = SITE;
    if (r.mode === "daily") {
      lines.push(NAME + " — Daily Puzzle, " + r.dateTitle);
      lines.push(movesLine(r));
      if (r.streak >= 2) lines.push("🔥 " + r.streak + "-day streak");
      lines.push("Same puzzle, your turn:");
      url = SITE + "?daily=" + encodeURIComponent(r.dailyKey);
    } else if (r.mode === "random") {
      lines.push(NAME + " — " + (r.merge ? "Merge Colors, " : "") + r.label + " puzzle");
      lines.push(movesLine(r));
      if (r.linkable) {
        lines.push("Same puzzle. Can you beat me?");
        url = SITE + "?random=" + encodeURIComponent(r.difficulty) + "&seed=" + r.seed + (r.merge ? "&merge=1" : "");
      } else {
        lines.push("Play it here:");
      }
    } else {
      lines.push(NAME + " — " + (r.mode === "merge" ? "Merge Colors" : "Sort Colors") +
        ", level " + r.levelNumber + " of " + r.total);
      lines.push(movesLine(r));
      lines.push("Play it here:");
    }
    lines.push(url);
    return lines.join("\n");
  }

  function native() {
    try {
      var C = global.Capacitor;
      return !!(C && C.isNativePlatform && C.isNativePlatform());
    } catch (e) { return false; }
  }

  var plugin = null;
  function getPlugin() {
    if (plugin || !native()) return plugin;
    var C = global.Capacitor;
    if (C.registerPlugin) plugin = C.registerPlugin("Share");
    else if (C.Plugins) plugin = C.Plugins.Share;
    return plugin;
  }

  function cancelled(e) {
    var m = ((e && e.name) || "") + " " + ((e && e.message) || "");
    return /abort|cancel/i.test(m);
  }

  async function copy(message) {
    try {
      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        await global.navigator.clipboard.writeText(message);
        return "copied";
      }
    } catch (e) { /* fall through to the old way */ }
    try {
      var doc = global.document;
      var ta = doc.createElement("textarea");
      ta.value = message;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      doc.body.appendChild(ta);
      ta.select();
      var ok = doc.execCommand("copy");
      doc.body.removeChild(ta);
      return ok ? "copied" : "failed";
    } catch (e) { return "failed"; }
  }

  /* Resolves to 'shared', 'copied' (no share sheet here, so the text is on
   * the clipboard), 'cancelled' (the player closed the sheet) or 'failed'. */
  async function send(message) {
    var S = getPlugin();
    if (S && S.share) {
      try {
        await S.share({ text: message, dialogTitle: "Share your result" });
        return "shared";
      } catch (e) {
        if (cancelled(e)) return "cancelled";
        return copy(message);
      }
    }
    if (!native() && global.navigator && global.navigator.share) {
      try {
        await global.navigator.share({ text: message });
        return "shared";
      } catch (e) {
        if (cancelled(e)) return "cancelled";
      }
    }
    return copy(message);
  }

  /* search: location.search. Returns null, or
   *   { kind: 'daily', key }  /  { kind: 'random', difficulty, seed, merge }.
   * Anything malformed is null: a mangled link opens the menu, never an error. */
  function parseLink(search) {
    var q = {};
    String(search || "").replace(/^\?/, "").split("&").forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf("=");
      var k = i < 0 ? pair : pair.slice(0, i);
      var v = i < 0 ? "" : pair.slice(i + 1);
      try { q[decodeURIComponent(k)] = decodeURIComponent(v); } catch (e) {}
    });
    if (q.daily && /^\d{4}-\d{2}-\d{2}$/.test(q.daily)) return { kind: "daily", key: q.daily };
    if (q.random && /^[A-Za-z]{1,20}$/.test(q.random) && /^\d{1,10}$/.test(q.seed || "")) {
      var seed = Number(q.seed);
      if (seed > 4294967295) return null;
      return { kind: "random", difficulty: q.random, seed: seed, merge: q.merge === "1" };
    }
    return null;
  }

  global.Share = { text: text, send: send, parseLink: parseLink, SITE: SITE };
})(typeof window !== "undefined" ? window : globalThis);
