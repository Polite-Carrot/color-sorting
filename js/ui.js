/* ui.js — jar rendering and the little blips. */
(function (global) {
  'use strict';

  var C = global.Colour;

  /* Chromium applies text-transform:capitalize inconsistently across the
     inline-block key badge, so do it here instead of in CSS. */
  function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }

  /* ── a single jar, built once and updated in place so the liquid can
     animate between heights instead of snapping ── */
  function JarView(opts) {
    opts = opts || {};
    this.isMain = !!opts.main;
    this.keyLabel = opts.keyLabel || '';

    var root = el('button', 'jar' + (this.isMain ? ' jar--main' : ''));
    root.type = 'button';
    var glass = el('div', 'jar__glass', root);
    this.liquid = el('div', 'jar__liquid', glass);
    this.cap = el('span', 'jar__cap', glass);
    this.capText = el('span', null, this.cap);
    this.tag = el('span', 'jar__tag', root);

    this.root = root;
    this.glass = glass;
    if (opts.onClick) root.addEventListener('click', opts.onClick);
  }

  JarView.prototype.update = function (jar, state) {
    state = state || {};
    var pct = jar.capacity > 0 ? (jar.volume / jar.capacity) * 100 : 0;
    var colour = jar.colour ? C.toCss(jar.colour) : 'transparent';

    this.glass.style.setProperty('--unit', (100 / jar.capacity) + '%');
    this.liquid.style.height = pct + '%';
    this.liquid.style.backgroundColor = colour;
    this.liquid.classList.toggle('is-empty', jar.volume <= 0);

    this.capText.textContent = jar.volume + '/' + jar.capacity;

    var label = titleCase(jar.volume > 0 ? C.name(jar.colour) : 'empty');
    this.tag.innerHTML = '';
    if (this.keyLabel) {
      var k = el('span', 'jar__key', this.tag);
      k.textContent = this.keyLabel;
    }
    this.tag.appendChild(document.createTextNode(label));

    this.root.classList.toggle('is-selected', !!state.selected);
    this.root.classList.toggle('is-target', !!state.targetable);
    this.root.classList.toggle('is-won', !!state.won);
    this.root.disabled = !!state.disabled;

    this.root.setAttribute('aria-label',
      (this.isMain ? 'Big jar' : 'Jar ' + this.keyLabel) + ', ' +
      jar.volume + ' of ' + jar.capacity + ' units, ' + label +
      (state.selected ? ', picked up' : ''));
    this.root.setAttribute('aria-pressed', state.selected ? 'true' : 'false');
  };

  JarView.prototype.flash = function (cls) {
    var node = this.root;
    node.classList.remove(cls);
    void node.offsetWidth; /* restart the animation */
    node.classList.add(cls);
    setTimeout(function () { node.classList.remove(cls); }, 420);
  };

  /* ── sound ── */
  var Sound = {
    on: true,
    ctx: null,
    broken: false,
    /* Audio can be unavailable outright — a sandboxed frame, a locked-down
       browser. Fail once, quietly, and let the game carry on silent. */
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
    drain: function () { this.blip(220, 0.16, 'sine', 0.06); },
    win:   function () {
      var self = this;
      [523, 659, 784, 1047].forEach(function (f, i) {
        setTimeout(function () { self.blip(f, 0.22, 'triangle', 0.08); }, i * 95);
      });
    }
  };

  global.UI = { JarView: JarView, Sound: Sound, el: el, titleCase: titleCase };
})(window);
