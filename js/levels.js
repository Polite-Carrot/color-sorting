/* levels.js — the hand-built "Beginner's Guide".
 *
 * Level spec:
 *   target   colour key the big jar has to be filled with
 *   main     { cap }              the big jar; starts empty
 *   jars     [{ cap, fills }]     fills are listed BOTTOM first
 *   par      fewest possible moves (checked against the solver by the tests)
 */
(function (global) {
  'use strict';

  var LEVELS = [
    {
      id: 'guide-1',
      name: 'Top Pour',
      subtitle: 'Guide 1 of 3',
      teaches: 'Picking up and pouring',
      brief: 'Tap a jar to pick it up, then tap the big jar to pour. The big jar ' +
             'only ever accepts red, so you cannot spoil it — try the blue and see.',
      hint: 'Both red jars go straight in.',
      target: 'red',
      main: { cap: 4 },
      par: 2,
      jars: [
        { cap: 4, fills: ['red', 'red'] },
        { cap: 4, fills: ['blue', 'blue', 'blue'] },
        { cap: 4, fills: ['red', 'red'] }
      ]
    },
    {
      id: 'guide-2',
      name: 'Dig It Out',
      subtitle: 'Guide 2 of 3',
      teaches: 'Uncovering a buried colour',
      brief: 'This time the yellow is trapped under blue. You can pour a colour ' +
             'onto the same colour, so move the blue out of the way first.',
      hint: 'Tip the two blues onto the lone blue, and the yellow underneath is free.',
      target: 'yellow',
      main: { cap: 4 },
      par: 3,
      jars: [
        { cap: 4, fills: ['yellow', 'yellow', 'blue', 'blue'] },
        { cap: 4, fills: ['blue'] },
        { cap: 4, fills: ['yellow', 'yellow'] }
      ]
    },
    {
      id: 'guide-3',
      name: 'Make Room',
      subtitle: 'Guide 3 of 3',
      teaches: 'Working through an empty jar',
      brief: 'Nothing matches at first. An empty jar takes any colour, so it is ' +
             'the way in — but there is only one, so think before you fill it.',
      hint: 'Empty a jar completely and you have somewhere to put the next colour.',
      target: 'green',
      main: { cap: 6 },
      par: 7,
      jars: [
        { cap: 4, fills: ['green', 'green', 'red', 'red'] },
        { cap: 4, fills: ['green', 'green', 'blue', 'blue'] },
        { cap: 4, fills: ['green', 'green', 'red', 'blue'] },
        { cap: 4, fills: [] }
      ]
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
