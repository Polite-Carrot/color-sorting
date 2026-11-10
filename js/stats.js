"use strict";
/* Totals and trophies, worked out from the progress record.
 *
 * Nothing new is stored. Every number here is counted from what the game
 * already keeps (stars per level, days solved, random wins), so the stats
 * can never disagree with the level grid, a trophy cannot be lost or
 * duplicated, and players who were here before this screen existed open it
 * to find everything they had already earned.
 *
 * Pure: compute(progress, counts) takes the record and the list sizes and
 * returns plain data. app.js draws it, and compares "before" with "after" a
 * win to announce a trophy on the win card. */

(function (global) {
  /* need: how many of `of` it takes. Ordered as they are shown. */
  var TROPHIES = [
    { id: "first-pour",   name: "First Pour",      of: "solved",     need: 1,   blurb: "Solve your first puzzle" },
    { id: "warming-up",   name: "Warming Up",      of: "solved",     need: 10,  blurb: "Solve 10 puzzles" },
    { id: "century",      name: "Century",         of: "solved",     need: 100, blurb: "Solve 100 puzzles" },
    { id: "master",       name: "Master Pourer",   of: "solved",     need: 500, blurb: "Solve 500 puzzles" },
    { id: "on-par",       name: "On Par",          of: "perfect",    need: 10,  blurb: "Finish 10 puzzles in par" },
    { id: "perfectionist", name: "Perfectionist",  of: "perfect",    need: 100, blurb: "Finish 100 puzzles in par" },
    { id: "star-collector", name: "Star Collector", of: "stars",     need: 150, blurb: "Earn 150 stars" },
    { id: "mixologist",   name: "Mixologist",      of: "mergeDone",  need: 25,  blurb: "Finish 25 Merge Colors levels" },
    { id: "lucky-dip",    name: "Lucky Dip",       of: "randomWon",  need: 10,  blurb: "Solve 10 random puzzles" },
    { id: "three-days",   name: "Three in a Row",  of: "bestStreak", need: 3,   blurb: "Solve the Daily Puzzle 3 days running" },
    { id: "full-week",    name: "Full Week",       of: "bestStreak", need: 7,   blurb: "Solve the Daily Puzzle 7 days running" },
    { id: "monthly",      name: "Monthly Regular", of: "bestStreak", need: 30,  blurb: "Solve the Daily Puzzle 30 days running" }
  ];

  function tally(book) {
    var out = { done: 0, stars: 0, perfect: 0 };
    Object.keys(book || {}).forEach(function (k) {
      var r = book[k];
      if (!r) return;
      out.done++;
      out.stars += r.stars || 0;
      if (r.stars === 3) out.perfect++;
    });
    return out;
  }

  /* counts: { sortTotal, mergeTotal } — the sizes of the two campaigns.
   * daily: the Daily module (for streaks); optional so tests can leave it out. */
  function compute(progress, counts, daily) {
    progress = progress || {};
    counts = counts || {};
    var sort = tally(progress.levels);
    var merge = tally(progress.merge);
    var days = tally(progress.daily);

    var randomWon = 0, randomPerfect = 0;
    Object.keys(progress.random || {}).forEach(function (k) {
      var r = progress.random[k];
      if (!r) return;
      randomWon += r.won || 0;
      randomPerfect += r.par3 || 0;
    });

    var s = {
      solved: sort.done + merge.done + days.done + randomWon,
      stars: sort.stars + merge.stars + days.stars,
      perfect: sort.perfect + merge.perfect + days.perfect + randomPerfect,
      sortDone: sort.done,
      sortTotal: counts.sortTotal || 0,
      mergeDone: merge.done,
      mergeTotal: counts.mergeTotal || 0,
      dailyDone: days.done,
      streak: daily ? daily.streak(progress.daily || {}) : 0,
      bestStreak: daily ? daily.best(progress.daily || {}) : 0,
      randomWon: randomWon
    };

    s.trophies = TROPHIES.map(function (t) {
      var have = Math.min(s[t.of] || 0, t.need);
      return { id: t.id, name: t.name, blurb: t.blurb, have: have, need: t.need, earned: have >= t.need };
    });
    s.trophiesEarned = s.trophies.filter(function (t) { return t.earned; }).length;
    return s;
  }

  /* Trophies earned in `after` that were not in `before`. */
  function newlyEarned(before, after) {
    var had = {};
    (before ? before.trophies : []).forEach(function (t) { if (t.earned) had[t.id] = true; });
    return after.trophies.filter(function (t) { return t.earned && !had[t.id]; });
  }

  global.Stats = { compute: compute, newlyEarned: newlyEarned, TROPHIES: TROPHIES };
})(typeof window !== "undefined" ? window : globalThis);
