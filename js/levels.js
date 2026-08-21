/* levels.js — the hand-built "Beginner's Guide".
 *
 * Level spec:
 *   main     { cap }            the big jar you have to fill
 *   target   [[colour, units]]  recipe the big jar has to end up matching
 *   jars     [{ cap, fills }]   shelf jars; two or more fills start pre-mixed
 *   drain    bool               whether the sink is available
 *   solution [{ jar, units }]   one known-good answer, used for hints and par
 */
(function (global) {
  'use strict';

  var LEVELS = [
    {
      id: 'guide-1',
      name: 'Straight Pour',
      subtitle: 'Guide 1 of 3',
      brief: 'Tap a shelf jar to pick it up, then tap the big jar to pour one ' +
             'unit in. Fill the big jar to the brim with pure crimson.',
      hint: 'Both crimson jars have to go in — the blue one is a decoy.',
      teaches: 'Selecting and pouring',
      main: { cap: 4 },
      target: [['red', 4]],
      drain: false,
      jars: [
        { cap: 4, fills: [['red', 2]] },
        { cap: 4, fills: [['blue', 3]] },
        { cap: 4, fills: [['red', 2]] }
      ],
      solution: [{ jar: 0, units: 2 }, { jar: 2, units: 2 }]
    },
    {
      id: 'guide-2',
      name: 'Two Make One',
      subtitle: 'Guide 2 of 3',
      brief: 'No jar holds this colour, so you have to make it. Colours mix the ' +
             'way paint does, so equal parts of two colours land between them.',
      hint: 'Plum sits between crimson and blue: pour three of each.',
      teaches: 'Mixing, and the sink',
      main: { cap: 6 },
      target: [['red', 3], ['blue', 3]],
      drain: true,
      jars: [
        { cap: 6, fills: [['red', 4]] },
        { cap: 6, fills: [['yellow', 3]] },
        { cap: 6, fills: [['blue', 4]] }
      ],
      solution: [{ jar: 0, units: 3 }, { jar: 2, units: 3 }]
    },
    {
      id: 'guide-3',
      name: 'Already Stirred',
      subtitle: 'Guide 3 of 3',
      brief: 'Some jars arrive pre-mixed. A jar of orange counts as equal parts ' +
             'crimson and yellow — and pouring part of a jar is allowed.',
      hint: 'The orange jar is the only way to get enough yellow. All four ' +
            'units of it go in, then top up with white.',
      teaches: 'Pre-mixed jars and part pours',
      main: { cap: 8 },
      target: [['red', 2], ['yellow', 2], ['white', 4]],
      drain: true,
      jars: [
        { cap: 4, fills: [['red', 2], ['yellow', 2]] },
        { cap: 6, fills: [['white', 5]] },
        { cap: 4, fills: [['red', 2]] },
        { cap: 4, fills: [['yellow', 1]] }
      ],
      solution: [{ jar: 0, units: 4 }, { jar: 1, units: 4 }]
    }
  ];

  global.Levels = {
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
