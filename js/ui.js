/* ui.js — jar rendering and the little blips. */
(function (global) {
  'use strict';

  var C = global.Colour;

  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }

  function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* Consecutive units of one colour, bottom first. Drawn as a single band so
     a jar reads as its colours rather than as a tally of units — the unit
     lines etched on the glass still show the amounts. */
  function runs(cells) {
    var out = [];
    for (var i = 0; i < cells.length; i++) {
      var last = out[out.length - 1];
      if (last && last.colour === cells[i]) last.size++;
      else out.push({ colour: cells[i], size: 1 });
    }
    return out;
  }

  function JarView(opts) {
    opts = opts || {};
    this.isMain = !!opts.main;
    this.keyLabel = opts.keyLabel || '';

    var root = el('button', 'jar' + (this.isMain ? ' jar--main' : ''));
    root.type = 'button';
    var glass = el('div', 'jar__glass', root);
    this.stack = el('div', 'jar__stack', glass);
    this.tag = el('span', 'jar__tag', root);

    this.root = root;
    this.glass = glass;
    if (opts.onClick) root.addEventListener('click', opts.onClick);
  }

  JarView.prototype.update = function (jar, state) {
    state = state || {};
    var list = runs(jar.cells);
    var unit = 100 / jar.capacity;

    this.glass.style.setProperty('--unit', unit + '%');

    this.stack.innerHTML = '';
    for (var i = 0; i < list.length; i++) {
      var run = list[i];
      var band = el('div', 'band' + (i === list.length - 1 ? ' band--top' : ''), this.stack);
      band.style.height = (unit * run.size) + '%';
      band.style.backgroundColor = C.hex(run.colour);
      band.style.color = C.ink(run.colour);
      var glyph = el('span', null, band);
      glyph.textContent = C.mark(run.colour);
    }

    var topColour = jar.cells.length ? jar.cells[jar.cells.length - 1] : null;
    this.tag.innerHTML = '';
    if (this.keyLabel) el('span', 'jar__key', this.tag).textContent = this.keyLabel;
    this.tag.appendChild(document.createTextNode(titleCase(topColour ? C.name(topColour) : 'empty')));

    this.root.classList.toggle('is-selected', !!state.selected);
    this.root.classList.toggle('is-target', !!state.targetable);
    this.root.classList.toggle('is-won', !!state.won);
    this.root.disabled = !!state.disabled;

    /* Read out top-down, which is the order that matters when pouring. */
    var spoken = jar.cells.length
      ? list.slice().reverse().map(function (r) {
          return r.size + ' ' + C.name(r.colour);
        }).join(', then ')
      : 'empty';
    this.root.setAttribute('aria-label',
      (this.isMain ? 'Big jar' : 'Jar ' + this.keyLabel) + ', ' +
      jar.cells.length + ' of ' + jar.capacity + ' full, from the top: ' + spoken +
      (state.selected ? ', picked up' : ''));
    this.root.setAttribute('aria-pressed', state.selected ? 'true' : 'false');
  };

  JarView.prototype.flash = function (cls) {
    var node = this.root;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
    setTimeout(function () { node.classList.remove(cls); }, 420);
  };

  var Sound = {
    on: true,
    ctx: null,
    broken: false,
    ensure: function () {
      if (this.broken) return null;
      try {
        if (!this.ctx && global.AudioContext) this.ctx = new global.AudioContext();
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) {
        this.broken = true;
        this.ctx = null;
      }
      return this.ctx;
    },
    blip: function (freq, dur, type, gain) {
      if (!this.on) return;
      var ctx = this.ensure();
      if (!ctx) return;
      try { this._blip(ctx, freq, dur, type, gain); } catch (e) { this.broken = true; }
    },
    _blip: function (ctx, freq, dur, type, gain) {
      var osc = ctx.createOscillator();
      var amp = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      amp.gain.setValueAtTime(0.0001, ctx.currentTime);
      amp.gain.exponentialRampToValueAtTime(gain || 0.09, ctx.currentTime + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(amp).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    },
    pour:  function (fullness) { this.blip(320 + fullness * 260, 0.11, 'sine'); },
    pick:  function () { this.blip(540, 0.06, 'triangle', 0.05); },
    nope:  function () { this.blip(150, 0.13, 'sawtooth', 0.05); },
    win:   function () {
      var self = this;
      [523, 659, 784, 1047].forEach(function (f, i) {
        setTimeout(function () { self.blip(f, 0.22, 'triangle', 0.08); }, i * 95);
      });
    }
  };

  global.UI = { JarView: JarView, Sound: Sound, el: el, titleCase: titleCase, runs: runs };
})(window);
