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
    this.key = el('span', 'jar__key', root);
    this.key.textContent = this.keyLabel;
    var glass = el('div', 'jar__glass', root);
    this.stack = el('div', 'jar__stack', glass);

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

  var SHAKE_MS = 520;

  var still = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)');
  function calm() { return !!(still && still.matches); }

  /* Tip the jar towards wherever it is pouring. dir is -1 for left, 1 right. */
  JarView.prototype.tilt = function (dir) {
    if (calm() || !this.root.animate) return;
    this.root.animate([
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(' + (dir * 21) + 'deg) translateY(-7px)', offset: .4 },
      { transform: 'rotate(0deg)' }
    ], { duration: 420, easing: 'cubic-bezier(.35,.05,.3,1)' });
  };

  /* Grow the band that just landed, and let the jar wobble as it settles. */
  JarView.prototype.settle = function () {
    if (calm() || !this.root.animate) return;
    var band = this.stack.lastElementChild;
    if (band) {
      band.animate([{ height: '0%' }, { height: band.style.height }],
        { duration: 320, easing: 'cubic-bezier(.2,.9,.3,1.35)' });
    }
    this.glass.animate([
      { transform: 'scale(1, 1)' },
      { transform: 'scale(1.07, .93)', offset: .35 },
      { transform: 'scale(.985, 1.02)', offset: .68 },
      { transform: 'scale(1, 1)' }
    ], { duration: 380, easing: 'ease-out' });
  };

  /* A "look at me" wobble, used by the hint to point out a jar.
     Applied to the glass rather than the button, so a jar that is currently
     picked up keeps its raised, tilted pose instead of snapping flat first. */
  JarView.prototype.shake = function () {
    if (calm() || !this.glass.animate) return;
    this.glass.animate([
      { transform: 'translateX(0) rotate(0deg)' },
      { transform: 'translateX(-6px) rotate(-6deg)' },
      { transform: 'translateX(6px) rotate(6deg)' },
      { transform: 'translateX(-4px) rotate(-4deg)' },
      { transform: 'translateX(4px) rotate(4deg)' },
      { transform: 'translateX(0) rotate(0deg)' }
    ], { duration: SHAKE_MS, easing: 'ease-in-out' });
  };

  /* Where this jar sits, so a pour can lean the right way. */
  JarView.prototype.centreX = function () {
    var r = this.root.getBoundingClientRect();
    return r.left + r.width / 2;
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

  /* A burst in the puzzle's own colours. Canvas rather than a pile of DOM
     nodes, and skipped entirely when motion is turned down. */
  function confetti(colours) {
    var canvas = document.getElementById('confetti');
    if (!canvas || calm() || !canvas.getContext) return;

    var ctx = canvas.getContext('2d');
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = canvas.width = global.innerWidth * dpr;
    var h = canvas.height = global.innerHeight * dpr;
    canvas.style.width = global.innerWidth + 'px';
    canvas.style.height = global.innerHeight + 'px';

    var bits = [];
    for (var i = 0; i < 130; i++) {
      bits.push({
        x: (0.18 + 0.64 * Math.random()) * w,
        y: h * 0.42 + Math.random() * 50 * dpr,
        vx: (Math.random() - 0.5) * 11 * dpr,
        vy: (-9.5 - Math.random() * 9) * dpr,
        size: (5 + Math.random() * 7) * dpr,
        spin: Math.random() * Math.PI,
        dspin: (Math.random() - 0.5) * 0.32,
        colour: colours[Math.floor(Math.random() * colours.length)]
      });
    }

    var start = performance.now();
    var LIFE = 2500;
    (function frame(now) {
      var age = now - start;
      ctx.clearRect(0, 0, w, h);
      var onscreen = false;
      for (var i = 0; i < bits.length; i++) {
        var b = bits[i];
        b.vy += 0.4 * dpr;
        b.vx *= 0.994;
        b.x += b.vx;
        b.y += b.vy;
        b.spin += b.dspin;
        if (b.y < h + 40 * dpr) onscreen = true;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.spin);
        ctx.globalAlpha = Math.max(0, 1 - age / LIFE);
        ctx.fillStyle = b.colour;
        ctx.fillRect(-b.size / 2, -b.size / 2, b.size, b.size * 0.62);
        ctx.restore();
      }
      if (onscreen && age < LIFE) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    })(start);
  }

  global.UI = {
    JarView: JarView, Sound: Sound, el: el, titleCase: titleCase,
    runs: runs, confetti: confetti, calm: calm, SHAKE_MS: SHAKE_MS
  };
})(window);
