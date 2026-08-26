/* colour.js — the palette.
 *
 * Colours never blend: a unit of liquid keeps the colour it started with, and
 * a jar is a stack of solid bands. So all this needs to do is name colours,
 * hand out CSS, and tell the generator how far apart two of them look. */
(function (global) {
  'use strict';

  /* Every colour carries a letter, shown on its band. Two colours that share
     an initial would defeat the point, so the palette is chosen so all ten
     differ. */
  var PALETTE = {
    red:     { hex: '#f5423c', mark: 'R', name: 'red' },
    orange:  { hex: '#ff8700', mark: 'O', name: 'orange' },
    yellow:  { hex: '#ffd028', mark: 'Y', name: 'yellow' },
    green:   { hex: '#2fc15e', mark: 'G', name: 'green' },
    teal:    { hex: '#0ec3c6', mark: 'T', name: 'teal' },
    blue:    { hex: '#3b7bf7', mark: 'B', name: 'blue' },
    purple:  { hex: '#9a53ef', mark: 'P', name: 'purple' },
    magenta: { hex: '#ff5aae', mark: 'M', name: 'magenta' },
    white:   { hex: '#fbfdff', mark: 'W', name: 'white' },
    slate:   { hex: '#22c8ff', mark: 'C', name: 'cyan' }
  };

  var KEYS = Object.keys(PALETTE);

  function get(key) { return PALETTE[key] || null; }
  function hex(key) { var c = PALETTE[key]; return c ? c.hex : 'transparent'; }
  function mark(key) { var c = PALETTE[key]; return c ? c.mark : ''; }
  function name(key) { var c = PALETTE[key]; return c ? c.name : 'empty'; }

  function rgb(key) {
    var h = hex(key).replace('#', '');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }

  /* Rough perceptual gap, used only so a puzzle never pairs two colours that
     are hard to tell apart. Weights approximate how much each channel
     contributes to perceived difference. */
  function distance(a, b) {
    var x = rgb(a), y = rgb(b);
    var dr = x.r - y.r, dg = x.g - y.g, db = x.b - y.b;
    return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
  }

  /* Dark or light text for a mark sitting on the band. */
  function ink(key) {
    var c = rgb(key);
    return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255 > 0.58
      ? 'rgba(28, 20, 48, .55)' : 'rgba(255, 255, 255, .72)';
  }

  global.Colour = {
    PALETTE: PALETTE,
    KEYS: KEYS,
    get: get, hex: hex, mark: mark, name: name,
    distance: distance, ink: ink
  };
})(typeof window !== 'undefined' ? window : globalThis);
