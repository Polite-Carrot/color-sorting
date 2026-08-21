/* colour.js — palette, mixing and matching maths.
 * Liquids mix by volume-weighted average of their RGB channels, which keeps
 * the result predictable: pouring 2 red + 2 yellow always lands on the same
 * orange, whichever order you do it in. */
(function (global) {
  'use strict';

  var PALETTE = {
    red:    '#e2453f',
    blue:   '#2f6fe0',
    yellow: '#f2c230',
    green:  '#35a85b',
    purple: '#8a4bd1',
    orange: '#f0862e',
    teal:   '#21b6c4',
    pink:   '#ec6ba8',
    white:  '#eef2f7',
    ink:    '#3a4260'
  };

  /* Names shown next to swatches so the game is playable without relying on
   * colour perception alone. */
  var NAMED = [
    ['crimson',   [226, 69,  63]],
    ['blue',      [47,  111, 224]],
    ['yellow',    [242, 194, 48]],
    ['green',     [53,  168, 91]],
    ['purple',    [138, 75,  209]],
    ['orange',    [240, 134, 46]],
    ['teal',      [33,  182, 196]],
    ['pink',      [236, 107, 168]],
    ['white',     [238, 242, 247]],
    ['charcoal',  [58,  66,  96]],
    ['plum',      [137, 90,  142]],
    ['olive',     [148, 181, 70]],
    ['slate',     [136, 158, 194]],
    ['rose',      [231, 88,  116]],
    ['mint',      [146, 205, 169]],
    ['sand',      [216, 184, 138]],
    ['sky',       [143, 177, 236]],
    ['moss',      [104, 137, 91]],
    ['lilac',     [180, 158, 228]],
    ['rust',      [181, 100, 60]]
  ];

  function clamp255(n) { return n < 0 ? 0 : n > 255 ? 255 : n; }

  function parse(input) {
    if (input == null) return null;
    if (typeof input === 'object') return { r: input.r, g: input.g, b: input.b };
    var hex = PALETTE[input] || input;
    hex = String(hex).replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }

  function toCss(c) {
    if (!c) return 'transparent';
    return 'rgb(' + Math.round(clamp255(c.r)) + ',' + Math.round(clamp255(c.g)) + ',' + Math.round(clamp255(c.b)) + ')';
  }

  /* Volume-weighted blend of two liquids. */
  function mix(a, va, b, vb) {
    if (va <= 0) return { r: b.r, g: b.g, b: b.b };
    if (vb <= 0) return { r: a.r, g: a.g, b: a.b };
    var t = va + vb;
    return {
      r: (a.r * va + b.r * vb) / t,
      g: (a.g * va + b.g * vb) / t,
      b: (a.b * va + b.b * vb) / t
    };
  }

  /* Blend a whole recipe at once: [[colour, units], ...] */
  function mixAll(parts) {
    var total = 0, r = 0, g = 0, b = 0;
    for (var i = 0; i < parts.length; i++) {
      var c = parse(parts[i][0]), v = parts[i][1];
      r += c.r * v; g += c.g * v; b += c.b * v; total += v;
    }
    if (total === 0) return null;
    return { r: r / total, g: g / total, b: b / total };
  }

  function distance(a, b) {
    if (!a || !b) return Infinity;
    var dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  /* 0-100 feedback score. Anything more than FADE away reads as 0% so the
   * meter stays informative instead of hovering near 90% for every colour. */
  var FADE = 110;
  function matchPercent(a, b) {
    var d = distance(a, b);
    if (!isFinite(d)) return 0;
    return Math.max(0, Math.round(100 * (1 - d / FADE)));
  }

  function name(c) {
    if (!c) return 'empty';
    var best = NAMED[0][0], bestD = Infinity;
    for (var i = 0; i < NAMED.length; i++) {
      var n = NAMED[i];
      var d = distance(c, { r: n[1][0], g: n[1][1], b: n[1][2] });
      if (d < bestD) { bestD = d; best = n[0]; }
    }
    return best;
  }

  /* Readable text colour for a label sitting on top of the liquid. */
  function ink(c) {
    if (!c) return '#e8ecf5';
    var lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    return lum > 0.6 ? '#20263a' : '#f2f5fb';
  }

  global.Colour = {
    PALETTE: PALETTE,
    parse: parse,
    toCss: toCss,
    mix: mix,
    mixAll: mixAll,
    distance: distance,
    matchPercent: matchPercent,
    name: name,
    ink: ink,
    TOLERANCE: 6
  };
})(typeof window !== 'undefined' ? window : globalThis);
