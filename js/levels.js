/* levels.js — the hand-built "Beginner's Guide".
 *
 * Each level adds one idea to the one before, on a shelf big enough to make
 * that idea matter — a rule you can see working on three jars is easy to miss
 * the point of, and the random puzzles the guide leads into are bigger still.
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
      brief: 'Six jars, but only the red matters. Tap a jar to pick it up, then ' +
             'tap the big jar to pour. The big jar accepts nothing but red, so ' +
             'you cannot spoil it — try the blue and see.',
      hint: 'Every red block is already on top. Ignore everything else.',
      target: 'red',
      main: { cap: 6 },
      par: 3,
      jars: [
        { cap: 4, fills: ['blue', 'blue', 'blue'] },
        { cap: 4, fills: ['green', 'red', 'red'] },
        { cap: 4, fills: ['teal', 'teal'] },
        { cap: 4, fills: ['green', 'green', 'red', 'red'] },
        { cap: 4, fills: ['blue', 'teal'] },
        { cap: 4, fills: ['green', 'red', 'red'] }
      ]
    },
    {
      id: 'guide-2',
      name: 'Dig It Out',
      subtitle: 'Guide 2 of 3',
      teaches: 'Uncovering a buried colour',
      brief: 'Now some of the yellow is trapped. A colour can be poured onto the ' +
             'same colour, so move what is on top out of the way first.',
      hint: 'Tip the blues onto the lone blue, and the greens onto the lone green. ' +
            'That frees everything underneath.',
      target: 'yellow',
      main: { cap: 6 },
      par: 6,
      jars: [
        { cap: 4, fills: ['yellow', 'yellow', 'blue', 'blue'] },
        { cap: 4, fills: ['blue'] },
        { cap: 4, fills: ['yellow', 'yellow'] },
        { cap: 4, fills: ['green', 'green', 'yellow'] },
        { cap: 4, fills: ['yellow', 'green'] },
        { cap: 4, fills: ['green'] }
      ]
    },
    {
      id: 'guide-3',
      name: 'Make Room',
      subtitle: 'Guide 3 of 3',
      teaches: 'Working through an empty jar',
      brief: 'Seven jars and nothing matches at first. An empty jar takes any ' +
             'colour, so it is the way in — but there is only one, so think ' +
             'before you fill it.',
      hint: 'Emptying a jar completely gives you a second place to put things. ' +
            'Work out which jar can be cleared soonest.',
      target: 'green',
      main: { cap: 8 },
      par: 8,
      jars: [
        { cap: 4, fills: ['green', 'green', 'red', 'red'] },
        { cap: 4, fills: ['green', 'green', 'blue', 'blue'] },
        { cap: 4, fills: ['green', 'green', 'red', 'blue'] },
        { cap: 4, fills: [] },
        { cap: 4, fills: ['blue', 'red'] },
        { cap: 4, fills: ['red', 'blue'] },
        { cap: 4, fills: ['green', 'green'] }
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
