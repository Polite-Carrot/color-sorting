/* app.js — screens, progress and input wiring. */
(function () {
  'use strict';

  var C = window.Colour;
  var UI = window.UI;
  var Sound = UI.Sound;
  var MAIN = window.Engine.MAIN;
  var DRAIN = window.Engine.DRAIN;
  var STORE_KEY = 'colourjars.progress.v1';

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    game: null,
    mode: 'guide',
    difficulty: 'easy',
    pourAll: false,
    selected: null,
    mainView: null,
    jarViews: []
  };

  /* ───────── progress ───────── */

  var progress = load();

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        p.guide = p.guide || {};
        p.random = p.random || {};
        return p;
      }
    } catch (e) { /* private mode, or corrupt — start fresh */ }
    return { guide: {}, random: {} };
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) { /* ignore */ }
  }

  function starString(n) {
    var s = '';
    for (var i = 0; i < 3; i++) s += i < n ? '★' : '<span class="off">★</span>';
    return s;
  }

  /* ───────── screens ───────── */

  function showScreen(which) {
    $('screen-menu').classList.toggle('is-active', which === 'menu');
    $('screen-game').classList.toggle('is-active', which === 'game');
    window.scrollTo(0, 0);
  }

  function renderMenu() {
    var list = $('guide-list');
    list.innerHTML = '';

    window.Levels.list.forEach(function (lvl, i) {
      var prev = i === 0 ? null : window.Levels.list[i - 1];
      var unlocked = i === 0 || !!progress.guide[prev.id];
      var done = progress.guide[lvl.id];

      var li = UI.el('li', null, list);
      var btn = UI.el('button', 'level-btn', li);
      btn.type = 'button';
      btn.disabled = !unlocked;

      var no = UI.el('span', 'level-btn__no', btn);
      no.textContent = unlocked ? String(i + 1) : '🔒';

      var main = UI.el('div', 'level-btn__main', btn);
      UI.el('span', 'level-btn__name', main).textContent = lvl.name;
      UI.el('span', 'level-btn__sub', main).textContent =
        unlocked ? lvl.teaches : 'Finish “' + prev.name + '” first';

      var stars = UI.el('span', 'level-btn__stars', btn);
      stars.innerHTML = starString(done ? done.stars : 0);
      stars.setAttribute('role', 'img');
      stars.setAttribute('aria-label',
        done ? done.stars + ' of 3 stars, best ' + done.moves + ' moves' : 'not completed');

      btn.addEventListener('click', function () { startLevel(lvl, 'guide'); });
    });

    var diffs = $('difficulty');
    if (!diffs.childNodes.length) {
      ['easy', 'normal', 'hard'].forEach(function (key) {
        var b = UI.el('button', 'diff', diffs);
        b.type = 'button';
        b.textContent = window.Generator.DIFFICULTY[key].label;
        b.setAttribute('role', 'radio');
        b.addEventListener('click', function () { setDifficulty(key); });
        b.dataset.key = key;
      });
    }
    setDifficulty(state.difficulty);
  }

  function setDifficulty(key) {
    state.difficulty = key;
    Array.prototype.forEach.call($('difficulty').children, function (b) {
      var on = b.dataset.key === key;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    $('difficulty-blurb').textContent = window.Generator.DIFFICULTY[key].blurb;

    var rec = progress.random[key];
    $('random-record').textContent = rec
      ? rec.won + (rec.won === 1 ? ' puzzle solved' : ' puzzles solved') +
        (rec.best ? ' · best ' + rec.best + ' moves' : '')
      : 'No puzzles solved yet.';
  }

  /* ───────── starting a level ───────── */

  function startLevel(level, mode) {
    state.game = new window.Engine.Game(level);
    state.mode = mode;
    state.selected = null;
    buildBoard();
    showScreen('game');
    setStatus(level.brief ? '' : 'Pick a jar to begin.', '');
  }

  function startRandom() {
    var raw = $('seed-input').value.trim();
    var seed = raw === '' ? null : (parseInt(raw, 10) >>> 0);
    if (raw !== '' && isNaN(parseInt(raw, 10))) seed = null;
    startLevel(window.Generator.generate(state.difficulty, seed), 'random');
  }

  function buildBoard() {
    var g = state.game;
    var lvl = g.level;

    $('level-name').textContent = lvl.name;
    $('level-sub').textContent = lvl.subtitle || '';
    $('brief').textContent = lvl.brief || '';
    $('stat-par').textContent = g.par;
    $('target-swatch').style.background = C.toCss(g.target);
    $('target-name').textContent = UI.titleCase(C.name(g.target));

    var mainSlot = $('main-slot');
    mainSlot.innerHTML = '';
    state.mainView = new UI.JarView({
      main: true,
      keyLabel: '0',
      onClick: function () { onJarClick(MAIN); }
    });
    mainSlot.appendChild(state.mainView.root);

    var shelf = $('shelf');
    shelf.innerHTML = '';
    state.jarViews = g.jars.map(function (jar, i) {
      var view = new UI.JarView({
        keyLabel: String(i + 1),
        onClick: function () { onJarClick(jar.id); }
      });
      shelf.appendChild(view.root);
      return view;
    });

    var drainSlot = $('drain-slot');
    drainSlot.innerHTML = '';
    if (lvl.drain) {
      var d = UI.el('button', 'drain');
      d.type = 'button';
      d.innerHTML = '<b>🚱</b><small>Sink</small>';
      d.setAttribute('aria-label', 'Sink — pour liquid away');
      d.addEventListener('click', function () { onJarClick(DRAIN); });
      drainSlot.appendChild(d);
      state.drainBtn = d;
    } else {
      state.drainBtn = null;
    }

    $('hint').disabled = !lvl.solution || !lvl.solution.length;
    refresh();
  }

  /* ───────── interaction ───────── */

  function onJarClick(id) {
    var g = state.game;
    if (!g || g.won) return;
    Sound.ensure();

    if (id === DRAIN) {
      if (!state.selected) { setStatus('Pick a jar first, then tap the sink.', 'warn'); return; }
      doPour(state.selected, DRAIN);
      return;
    }

    if (state.selected === id) {          /* put it back down */
      state.selected = null;
      refresh();
      return;
    }

    if (!state.selected) {                /* pick up */
      var jar = g.get(id);
      if (!jar || jar.volume <= 0) {
        setStatus('That jar is empty.', 'warn');
        viewFor(id).flash('is-blocked');
        Sound.nope();
        return;
      }
      state.selected = id;
      Sound.pick();
      setStatus('Now tap where it should go.', '');
      refresh();
      return;
    }

    /* The held jar cannot pour here — read the tap as picking that jar up
       instead of complaining. Otherwise you would have to deselect first
       just to empty the full main jar into the sink. */
    if (g.pourable(state.selected, id, state.pourAll) <= 0) {
      var candidate = g.get(id);
      if (candidate && candidate.volume > 0) {
        state.selected = id;
        Sound.pick();
        setStatus('Now tap where it should go.', '');
        refresh();
        return;
      }
    }

    doPour(state.selected, id);           /* pour */
  }

  function doPour(fromId, toId) {
    var g = state.game;
    var result = g.pour(fromId, toId, state.pourAll);

    if (!result.ok) {
      Sound.nope();
      var view = toId === DRAIN ? null : viewFor(toId);
      if (view) view.flash('is-blocked');
      setStatus(
        result.reason === 'full' ? 'That jar is already full.' :
        result.reason === 'empty' ? 'Nothing left to pour.' :
        'You cannot pour that way.', 'warn');
      return;
    }

    if (toId === DRAIN) {
      Sound.drain();
      setStatus('Poured ' + result.amount + ' away.', '');
    } else {
      var dest = g.get(toId);
      Sound.pour(dest.volume / dest.capacity);
      viewFor(toId).flash('just-poured');
      setStatus('', '');
    }

    /* Keep hold of the jar while it still has something in it — pouring
       several units in a row is the common case. */
    if (g.get(fromId).volume <= 0) state.selected = null;

    refresh();

    if (g.won) {
      state.selected = null;
      refresh();
      Sound.win();
      setTimeout(onWin, 420);
    } else if (g.isFullButWrong()) {
      setStatus('Full, but that is not the shade. Tip some into the sink and adjust.', 'warn');
    }
  }

  function viewFor(id) {
    if (id === MAIN) return state.mainView;
    var i = state.game.jars.findIndex(function (j) { return j.id === id; });
    return state.jarViews[i];
  }

  function refresh() {
    var g = state.game;
    if (!g) return;
    var sel = state.selected;

    state.mainView.update(g.main, {
      selected: sel === MAIN,
      targetable: !!sel && sel !== MAIN && g.pourable(sel, MAIN, state.pourAll) > 0,
      won: g.won
    });

    g.jars.forEach(function (jar, i) {
      state.jarViews[i].update(jar, {
        selected: sel === jar.id,
        targetable: !!sel && sel !== jar.id && g.pourable(sel, jar.id, state.pourAll) > 0
      });
    });

    if (state.drainBtn) {
      state.drainBtn.classList.toggle('is-target', !!sel);
      state.drainBtn.disabled = false;
    }

    $('stat-moves').textContent = g.moves;

    var pct = g.matchPercent();
    $('meter-fill').style.width = pct + '%';
    $('meter-value').textContent = pct + '%';
    $('current-swatch').style.background = g.main.volume > 0 ? C.toCss(g.main.colour) : '#0d1018';
    $('current-name').textContent = UI.titleCase(g.main.volume > 0 ? C.name(g.main.colour) : 'empty');

    $('undo').disabled = !g.canUndo() || g.won;
  }

  function setStatus(text, kind) {
    var node = $('status');
    node.textContent = text || ' ';
    node.classList.toggle('is-good', kind === 'good');
    node.classList.toggle('is-warn', kind === 'warn');
  }

  /* ───────── winning ───────── */

  function onWin() {
    var g = state.game;
    var stars = g.stars();
    var lvl = g.level;

    if (state.mode === 'guide') {
      var old = progress.guide[lvl.id];
      if (!old || stars > old.stars || (stars === old.stars && g.moves < old.moves)) {
        progress.guide[lvl.id] = { stars: stars, moves: g.moves };
      }
    } else {
      var rec = progress.random[state.difficulty] || { won: 0, best: null };
      rec.won++;
      if (rec.best === null || g.moves < rec.best) rec.best = g.moves;
      progress.random[state.difficulty] = rec;
    }
    save();
    renderMenu();

    $('win-swatch').style.background = C.toCss(g.target);
    $('win-stars').innerHTML = starString(stars);
    $('win-stars').setAttribute('aria-label', stars + ' of 3 stars');
    $('win-title').textContent = g.moves <= g.par ? 'Perfect match' : 'Matched!';
    $('win-line').textContent =
      g.moves + ' moves, par ' + g.par + '.' +
      (g.moves > g.par ? ' ' + (g.moves - g.par) + ' over — the sink is not free.' : '') +
      (g.hintsUsed ? ' Hint used.' : '');

    var next = $('win-next');
    if (state.mode === 'guide') {
      var i = window.Levels.indexOf(lvl.id);
      var hasNext = i >= 0 && i + 1 < window.Levels.list.length;
      next.textContent = hasNext ? 'Next level' : 'Try a random puzzle';
      next.onclick = function () {
        closeOverlay();
        if (hasNext) startLevel(window.Levels.list[i + 1], 'guide');
        else { showScreen('menu'); $('play-random').focus(); }
      };
    } else {
      next.textContent = 'Another one';
      next.onclick = function () {
        closeOverlay();
        $('seed-input').value = '';
        startRandom();
      };
    }

    $('overlay').hidden = false;
    next.focus();
  }

  function closeOverlay() { $('overlay').hidden = true; }

  /* ───────── toolbar ───────── */

  function doHint() {
    var g = state.game;
    if (!g || g.won) return;
    var h = g.useHint();
    if (!h) { setStatus('Everything you need is already poured — check the amounts.', 'warn'); return; }
    var view = state.jarViews[h.jarIndex];
    if (view) view.flash('just-poured');
    setStatus('Jar ' + (h.jarIndex + 1) + ' (' + C.name(g.jars[h.jarIndex].colour) + '): ' +
              h.units + ' more unit' + (h.units === 1 ? '' : 's') + ' into the big jar.', 'good');
    refresh();
  }

  function setPourMode(all) {
    state.pourAll = all;
    var b = $('pour-mode');
    b.textContent = all ? 'Pour: fill up' : 'Pour: 1 unit';
    b.setAttribute('aria-pressed', all ? 'true' : 'false');
    refresh();
  }

  /* ───────── wiring ───────── */

  function init() {
    renderMenu();

    $('play-random').addEventListener('click', startRandom);
    $('seed-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') startRandom();
    });

    $('back').addEventListener('click', function () {
      state.selected = null;
      showScreen('menu');
    });

    $('undo').addEventListener('click', function () {
      if (state.game && state.game.undo()) {
        state.selected = null;
        Sound.pick();
        setStatus('Undone.', '');
        refresh();
      }
    });

    $('restart').addEventListener('click', function () {
      if (!state.game) return;
      state.game.restart();
      state.selected = null;
      setStatus('Back to the start.', '');
      refresh();
    });

    $('hint').addEventListener('click', doHint);
    $('pour-mode').addEventListener('click', function () { setPourMode(!state.pourAll); });

    $('sound').addEventListener('click', function () {
      Sound.on = !Sound.on;
      this.textContent = Sound.on ? 'Sound on' : 'Sound off';
      this.setAttribute('aria-pressed', Sound.on ? 'true' : 'false');
      if (Sound.on) { Sound.ensure(); Sound.pick(); }
    });

    $('win-retry').addEventListener('click', function () {
      closeOverlay();
      state.game.restart();
      state.selected = null;
      refresh();
      setStatus('', '');
    });
    $('win-menu').addEventListener('click', function () { closeOverlay(); showScreen('menu'); });

    $('how-to').addEventListener('click', function () { $('howto').hidden = false; $('howto-close').focus(); });
    $('howto-close').addEventListener('click', function () { $('howto').hidden = true; $('how-to').focus(); });

    $('reset-progress').addEventListener('click', function () {
      if (!window.confirm('Clear all stars and records?')) return;
      progress = { guide: {}, random: {} };
      save();
      renderMenu();
    });

    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.target.tagName === 'INPUT') return;

    if (!$('howto').hidden) {
      if (e.key === 'Escape') { $('howto').hidden = true; $('how-to').focus(); }
      return;
    }
    if (!$('overlay').hidden) {
      if (e.key === 'Escape') { closeOverlay(); showScreen('menu'); }
      return;
    }
    if (!$('screen-game').classList.contains('is-active') || !state.game) return;

    var k = e.key.toLowerCase();

    if (k === 'escape')      { state.selected = null; refresh(); return; }
    if (k === 'u')           { e.preventDefault(); $('undo').click(); return; }
    if (k === 'h')           { e.preventDefault(); doHint(); return; }
    if (k === 'r')           { e.preventDefault(); $('restart').click(); return; }
    if (k === 'd')           { e.preventDefault(); if (state.game.level.drain) onJarClick(DRAIN); return; }
    if (k === '0')           { e.preventDefault(); onJarClick(MAIN); return; }

    if (k >= '1' && k <= '9') {
      var i = parseInt(k, 10) - 1;
      if (i < state.game.jars.length) { e.preventDefault(); onJarClick(state.game.jars[i].id); }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
