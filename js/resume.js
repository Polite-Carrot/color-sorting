"use strict";
/* The puzzle in progress, kept so it survives the app being closed.
 *
 * Phones close apps that sit in the background, and a web page can be
 * reloaded by a stray swipe. Either used to throw away however many moves
 * the player had made. The board is now written here after every move and
 * put back on the next launch, exactly as it stood: same puzzle, same moves,
 * same hints left, and undo still walks back through all of it.
 *
 * What is stored is the level itself plus the list of pours, not the jars as
 * they stand. Replaying the pours through the engine rebuilds the position
 * AND the undo history, and proves the save still fits the level: if a pour
 * is refused (the level changed in an update, the save is damaged) the whole
 * thing is dropped rather than half-applied.
 *
 * It is one puzzle, not a list. Leaving a puzzle through the menu, finishing
 * it, or starting another replaces or clears it; app.js decides when. A save
 * older than MAX_AGE is ignored: opening the game after a week and landing
 * mid-way through something long forgotten is a surprise, not a kindness.
 *
 * Separate from progress and prefs, like every other key: nothing here is
 * earned, and losing it costs one unfinished attempt. */

(function () {
  var KEY = "colourjars.resume.v1";
  var MAX_AGE = 48 * 60 * 60 * 1000;
  var MAX_MOVES = 2000;   /* far beyond any real attempt; a damaged save is not replayed forever */

  var lastWritten = null;

  function valid(s, now) {
    if (!s || typeof s !== "object") return false;
    if (!s.level || typeof s.level !== "object") return false;
    if (!s.level.jars || !s.level.jars.length || !s.level.main) return false;
    if (typeof s.mode !== "string") return false;
    if (!Array.isArray(s.log) || s.log.length > MAX_MOVES) return false;
    for (var i = 0; i < s.log.length; i++) {
      var m = s.log[i];
      if (!Array.isArray(m) || typeof m[0] !== "string" || typeof m[1] !== "string") return false;
    }
    if (typeof s.at !== "number" || now - s.at > MAX_AGE || s.at - now > 60 * 1000) return false;
    return true;
  }

  window.Resume = {
    MAX_AGE: MAX_AGE,

    /* snapshot: { level, mode, dailyKey, log: [[fromId, toId]...], hintsUsed,
     * hintsLeft }. Stamped with the time here. Skips the write when nothing
     * changed, because refreshes far outnumber moves. */
    save: function (snapshot) {
      try {
        var body = JSON.stringify(snapshot);
        if (body === lastWritten) return;
        var out = JSON.parse(body);
        out.at = Date.now();
        window.Store.write(KEY, JSON.stringify(out));
        lastWritten = body;
      } catch (e) { /* a puzzle that cannot be saved is still playable */ }
    },

    /* The saved puzzle, or null when there is none worth restoring. */
    load: function () {
      try {
        var raw = window.Store.read(KEY);
        if (!raw) return null;
        var s = JSON.parse(raw);
        return valid(s, Date.now()) ? s : null;
      } catch (e) { return null; }
    },

    clear: function () {
      lastWritten = null;
      try { window.Store.write(KEY, ""); } catch (e) {}
    },
  };
})();
