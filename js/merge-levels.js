/* merge-levels.js — the Merge Colours levels.
 *
 * Written by hand rather than generated. Each one exists to teach a single
 * thing about mixing, in order, and that is not something a generator can be
 * asked for. par is checked against the merge solver by tools/check-merge.js,
 * so the numbers below are the true fewest moves, not estimates.
 *
 * Jar fills are listed BOTTOM first. */
(function (global) {
  'use strict';

  var LEVELS = [
    {
      id: 'merge-01',
      mode: 'merge',
      name: 'Red and Blue',
      teaches: 'Mixing two colours',
      brief: 'There is no purple on the shelf — you have to make it. Pour the ' +
             'red onto the blue and watch what happens, then fill the big jar.',
      target: 'purple',
      main: { cap: 2 },
      par: 2,
      jars: [
        { cap: 4, fills: ['red', 'red'] },
        { cap: 4, fills: ['blue', 'blue'] }
      ]
    },
    {
      id: 'merge-02',
      mode: 'merge',
      name: 'Only What Pairs',
      teaches: 'Mixing takes one for one',
      brief: 'Three reds, two blues. Colours mix one for one, so only two of ' +
             'the reds have anything to pair with — the rest stays put.',
      target: 'purple',
      main: { cap: 2 },
      par: 2,
      jars: [
        { cap: 4, fills: ['red', 'red', 'red'] },
        { cap: 4, fills: ['blue', 'blue'] }
      ]
    },
    {
      id: 'merge-03',
      mode: 'merge',
      name: 'Out of the Way',
      teaches: 'Clearing a colour that will not mix',
      brief: 'Blue and yellow make green, but the slate on top mixes with ' +
             'nothing at all. Park it in the empty jar first.',
      target: 'green',
      main: { cap: 3 },
      par: 3,
      jars: [
        { cap: 4, fills: ['blue', 'blue', 'blue'] },
        { cap: 4, fills: ['yellow', 'yellow', 'yellow', 'slate'] },
        { cap: 4, fills: [] }
      ]
    },
    {
      id: 'merge-04',
      mode: 'merge',
      name: 'Gather First',
      teaches: 'Gathering a colour before mixing it',
      brief: 'Mixing pairs one for one, so a bigger pile of yellow makes a ' +
             'bigger pour of orange. Put the two yellows together before you ' +
             'reach for the red — and mind that blue, which would take the ' +
             'red for itself.',
      target: 'orange',
      main: { cap: 4 },
      par: 3,
      jars: [
        { cap: 6, fills: ['red', 'red', 'red', 'red', 'red', 'red'] },
        { cap: 4, fills: ['yellow', 'yellow'] },
        { cap: 4, fills: ['yellow', 'yellow'] },
        { cap: 4, fills: ['blue', 'blue'] }
      ]
    },
    {
      id: 'merge-05',
      mode: 'merge',
      name: 'Every Last Drop',
      teaches: 'All three together, with nothing to spare',
      brief: 'Four purple needed and exactly four reds to make it, two of them ' +
             'under the yellow. Clear it, gather the red, and mix it into the ' +
             'blue where it stands — and do not let the yellow have any.',
      target: 'purple',
      main: { cap: 4 },
      par: 4,
      jars: [
        { cap: 6, fills: ['blue', 'blue', 'blue', 'blue', 'blue', 'blue'] },
        { cap: 4, fills: ['red', 'red', 'yellow', 'yellow'] },
        { cap: 4, fills: ['red', 'red'] },
        { cap: 4, fills: ['yellow', 'yellow'] },
        { cap: 4, fills: [] }
      ]
    }
  ];

  global.MergeLevels = {
    list: LEVELS,
    byId: function (id) {
      for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i];
      return null;
    },
    indexOf: function (id) {
      for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return i;
      return -1;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
