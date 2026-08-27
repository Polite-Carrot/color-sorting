/* daily.js — one puzzle a day, the same for everybody.
 *
 * Nothing is stored for a daily puzzle beyond whether it was solved: the board
 * is worked out from the date itself, so any two people on the same day get
 * the same puzzle, and a day from months ago deals exactly what it dealt then.
 *
 * Which game you get depends on the day of the week, so the week has a shape
 * to it — a gentle start, and the two hardest settings at the weekend.
 *
 * Pure logic, no DOM. */
(function (global) {
  'use strict';

  /* The first daily. Nothing before this is playable, so the calendar has a
     beginning rather than running back for ever. */
  var FIRST = { year: 2026, month: 5, day: 1 };

  /* Sunday first, to match Date#getDay. */
  var WEEK = [
    { game: 'merge',   difficulty: 'extraHard', label: 'Merge Colors' },   /* Sun */
    { game: 'classic', difficulty: 'normal',    label: 'Sort Colors' },    /* Mon */
    { game: 'merge',   difficulty: 'easy',      label: 'Merge Colors' },   /* Tue */
    { game: 'classic', difficulty: 'hard',      label: 'Sort Colors' },    /* Wed */
    { game: 'merge',   difficulty: 'normal',    label: 'Merge Colors' },   /* Thu */
    { game: 'classic', difficulty: 'extraHard', label: 'Sort Colors' },    /* Fri */
    { game: 'merge',   difficulty: 'hard',      label: 'Merge Colors' }    /* Sat */
  ];

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* Dates are handled as local calendar days, never as instants. A daily
     puzzle belongs to the date on the player's own wall, so the hour and the
     time zone must not come into it. */
  function key(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function fromKey(k) {
    var p = k.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function today() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function first() { return new Date(FIRST.year, FIRST.month - 1, FIRST.day); }

  function shift(date, days) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + days);
    return d;
  }

  /* Playable means: it has happened, and the game had started. */
  function playable(date) {
    return date >= first() && date <= today();
  }

  function planFor(date) { return WEEK[date.getDay()]; }

  /* The seed is the date read as a number — 2026-05-01 becomes 20260501. The
     generators hash whatever they are given, so consecutive days come out as
     completely different boards rather than near neighbours. */
  function seedFor(date) {
    return Number('' + date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()));
  }

  function title(date) {
    return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
  }

  function monthTitle(date) { return MONTHS[date.getMonth()] + ' ' + date.getFullYear(); }

  /* Days of the month laid out in rows of seven, Monday first, with the blanks
     before the first of the month so the columns line up. */
  function monthGrid(date) {
    var y = date.getFullYear(), m = date.getMonth();
    var start = new Date(y, m, 1);
    /* getDay is Sunday-first; the calendar reads Monday-first. */
    var lead = (start.getDay() + 6) % 7;
    var days = new Date(y, m + 1, 0).getDate();
    var cells = [];
    for (var i = 0; i < lead; i++) cells.push(null);
    for (var d = 1; d <= days; d++) cells.push(new Date(y, m, d));
    return cells;
  }

  /* How many days in a row have been solved, counting back from today.
     A day that has not been played yet does not break it — the streak is only
     lost once a whole day has gone by unsolved. */
  function streak(done, from) {
    var d = from || today();
    if (!done[key(d)]) d = shift(d, -1);
    var start = first(), n = 0;
    while (d >= start && done[key(d)]) { n++; d = shift(d, -1); }
    return n;
  }

  function best(done) {
    var keys = Object.keys(done).sort();
    var top = 0, run = 0, prev = null;
    for (var i = 0; i < keys.length; i++) {
      var d = fromKey(keys[i]);
      run = (prev && key(shift(prev, 1)) === keys[i]) ? run + 1 : 1;
      if (run > top) top = run;
      prev = d;
    }
    return top;
  }

  global.Daily = {
    FIRST: FIRST, WEEK: WEEK, MONTHS: MONTHS,
    key: key, fromKey: fromKey, today: today, first: first, shift: shift,
    playable: playable, planFor: planFor, seedFor: seedFor,
    title: title, monthTitle: monthTitle, monthGrid: monthGrid,
    streak: streak, best: best
  };
})(typeof window !== 'undefined' ? window : globalThis);
