/* app.js — screens, progress and input wiring. */
(function () {
  'use strict';

  var C = window.Colour;
  var UI = window.UI;
  var Sound = UI.Sound;
  var MAIN = window.Engine.MAIN;
  var STORE_KEY = 'colourjars.progress.v2';

  /* Budget for the after-every-move "is this still winnable" check. Small
     enough to never be felt; positions too tangled to settle inside it simply
     get no warning rather than a stutter. */
  var WATCH_BUDGET = 40000;

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    game: null,
    mode: 'guide',
    difficulty: 'easy',
    selected: null,
    mainView: null,
    jarViews: [],
    hintTimer: null
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

  function starString(n, lively) {
    var s = '';
    for (var i = 0; i < 3; i++) {
      s += i < n
        ? '<span class="' + (lively ? 'win' : '') + '">★</span>'
        : '<span class="off">★</span>';
    }
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

      UI.el('span', 'level-btn__no', btn).textContent = unlocked ? String(i + 1) : '🔒';

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
        b.dataset.key = key;
        b.addEventListener('click', function () { setDifficulty(key); });
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
        (rec.bestPar ? ' · matched par ' + rec.par3 + '×' : '')
      : 'No puzzles solved yet.';
  }

  /* ───────── starting a level ───────── */

  function startLevel(level, mode) {
    state.game = new window.Engine.Game(level);
    state.mode = mode;
    state.selected = null;
    buildBoard();
    showScreen('game');
    setStatus('', '');
  }

  function startRandom() {
    var raw = $('seed-input').value.trim();
    var parsed = parseInt(raw, 10);
    var seed = (raw === '' || isNaN(parsed)) ? null : (parsed >>> 0);
    var btn = $('play-random');
    btn.disabled = true;
    btn.textContent = 'Dealing…';
    /* Hard puzzles are solver-checked before they appear, which takes a beat.
       Yield first so the button state paints. */
    setTimeout(function () {
      try {
        startLevel(window.Generator.generate(state.difficulty, seed), 'random');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Deal me a puzzle';
      }
    }, 20);
  }

  function buildBoard() {
    var g = state.game;
    var lvl = g.level;

    clearTimeout(state.hintTimer);

    $('level-name').textContent = lvl.name;
    $('level-sub').textContent = lvl.subtitle || '';
    $('brief').textContent = lvl.brief || '';
    $('stat-par').textContent = g.par;
    $('target-swatch').style.background = C.hex(g.target);
    $('target-swatch').style.color = C.ink(g.target);
    $('target-mark').textContent = C.mark(g.target);
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

    refresh();
  }

  /* ───────── interaction ───────── */

  function onJarClick(id) {
    var g = state.game;
    if (!g || g.won) return;
    Sound.ensure();

    if (state.selected === id) {          /* put it back down */
      state.selected = null;
      refresh();
      return;
    }

    if (!state.selected) {
      if (id === MAIN) {
        setStatus('The big jar only collects — pick one of the jars below.', 'warn');
        return;
      }
      var jar = g.get(id);
      if (!jar || !jar.cells.length) {
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

    /* Cannot pour there — read the tap as picking that jar up instead, which
       is nearly always what was meant. */
    if (!g.pourable(state.selected, id)) {
      var candidate = g.get(id);
      if (id !== MAIN && candidate && candidate.cells.length) {
        state.selected = id;
        Sound.pick();
        setStatus('Now tap where it should go.', '');
        refresh();
        return;
      }
    }

    doPour(state.selected, id);
  }

  function doPour(fromId, toId) {
    var g = state.game;
    var result = g.pour(fromId, toId);

    if (!result.ok) {
      Sound.nope();
      viewFor(toId).flash('is-blocked');
      setStatus(
        result.reason === 'full' ? 'That jar is full.' :
        result.reason === 'empty' ? 'Nothing left to pour.' :
        result.reason === 'wrong-colour' ? 'The big jar only takes ' + C.name(g.target) + '.' :
        result.reason === 'mismatch' ? 'A colour can only go onto the same colour, or an empty jar.' :
        'You cannot pour that way.', 'warn');
      return;
    }

    var dest = g.get(toId);
    Sound.pour(dest.cells.length / dest.capacity);

    var fromView = viewFor(fromId), toView = viewFor(toId);
    var dir = toView.centreX() >= fromView.centreX() ? 1 : -1;
    fromView.tilt(dir);
    clearTimeout(state.hintTimer);

    state.selected = null;
    setStatus('', '');
    refresh();
    toView.settle();

    if (g.won) {
      Sound.win();
      setTimeout(onWin, 420);
    } else {
      watchForDeadEnd();
    }
  }

  /* Say so early when a position can no longer be finished, rather than
     leaving someone to discover it several moves later. */
  function watchForDeadEnd() {
    var g = state.game;
    if (!g.hasMoves()) {
      setStatus('No moves left. Undo, or restart.', 'warn');
      return;
    }
    var check = window.Solver.solve(g.position(), WATCH_BUDGET);
    if (!check.budgetExceeded && check.par == null) {
      setStatus('This position cannot be finished any more — undo a move.', 'warn');
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
      targetable: !!sel && g.pourable(sel, MAIN) > 0,
      won: g.won
    });

    g.jars.forEach(function (jar, i) {
      state.jarViews[i].update(jar, {
        selected: sel === jar.id,
        targetable: !!sel && sel !== jar.id && g.pourable(sel, jar.id) > 0
      });
    });

    $('stat-moves').textContent = g.moves;

    var got = g.collected(), need = g.main.capacity;
    $('meter-fill').style.width = (100 * got / need) + '%';
    $('meter-fill').style.background = C.hex(g.target);
    $('meter-value').textContent = got + '/' + need;

    $('undo').disabled = !g.canUndo() || g.won;
  }

  function setStatus(text, kind) {
    var node = $('status');
    node.textContent = text || ' ';
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
      var rec = progress.random[state.difficulty] || { won: 0, par3: 0 };
      rec.won++;
      if (g.moves <= g.par) rec.par3++;
      rec.bestPar = rec.par3 > 0;
      progress.random[state.difficulty] = rec;
    }
    save();
    renderMenu();

    $('win-swatch').style.background = C.hex(g.target);
    $('win-stars').innerHTML = starString(stars, true);
    $('win-stars').setAttribute('aria-label', stars + ' of 3 stars');
    $('win-title').textContent = g.moves <= g.par ? 'Perfect — par' : 'Jar filled';
    $('win-line').textContent =
      g.moves + ' moves, par ' + g.par + '.' +
      (g.moves > g.par ? ' ' + (g.moves - g.par) + ' over the best possible.' : '') +
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

    if (stars > 0) {
      var palette = [C.hex(g.target), '#ffc93c', '#ff5d8f'];
      lvl.jars.forEach(function (spec) {
        spec.fills.forEach(function (key) {
          var hex = C.hex(key);
          if (palette.indexOf(hex) === -1) palette.push(hex);
        });
      });
      UI.confetti(palette);
    }
  }

  function closeOverlay() { $('overlay').hidden = true; }

  /* ───────── toolbar ───────── */

  function doHint() {
    var g = state.game;
    if (!g || g.won) return;

    var result = window.Solver.solve(g.position());
    if (result.budgetExceeded) {
      setStatus('This one is too tangled for me to work out from here — try undoing a move.', 'warn');
      return;
    }
    if (result.par == null) {
      setStatus('There is no way to finish from this position. Undo, or restart.', 'warn');
      return;
    }
    if (!result.path.length) return;

    g.hintsUsed++;
    var mv = result.path[0];
    var fromView = state.jarViews[mv.from];
    var toView = mv.to === -1 ? state.mainView : state.jarViews[mv.to];

    /* Two beats, so the hint reads as a sentence: shake the jar to pick up,
       then shake where it goes. Overlapping them would just look like noise. */
    clearTimeout(state.hintTimer);
    if (fromView) fromView.shake();
    state.hintTimer = setTimeout(function () {
      if (toView) toView.shake();
    }, UI.SHAKE_MS + 90);

    setStatus('Pour jar ' + (mv.from + 1) + ' into ' +
              (mv.to === -1 ? 'the big jar' : 'jar ' + (mv.to + 1)) +
              '. ' + result.par + ' move' + (result.par === 1 ? '' : 's') + ' left from here.', 'good');
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
      clearTimeout(state.hintTimer);
      setStatus('Back to the start.', '');
      refresh();
    });

    $('hint').addEventListener('click', doHint);

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

    var resetArmed = false, resetTimer = null;
    $('reset-progress').addEventListener('click', function () {
      var btn = this;
      function disarm() {
        resetArmed = false;
        clearTimeout(resetTimer);
        btn.textContent = 'Reset progress';
        btn.classList.remove('is-armed');
      }
      if (!resetArmed) {
        resetArmed = true;
        btn.textContent = 'Tap again to erase';
        btn.classList.add('is-armed');
        clearTimeout(resetTimer);
        resetTimer = setTimeout(disarm, 4000);
        return;
      }
      disarm();
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
    if (k === 'escape') { state.selected = null; refresh(); return; }
    if (k === 'u')      { e.preventDefault(); $('undo').click(); return; }
    if (k === 'h')      { e.preventDefault(); doHint(); return; }
    if (k === 'r')      { e.preventDefault(); $('restart').click(); return; }
    if (k === '0')      { e.preventDefault(); onJarClick(MAIN); return; }

    if (k >= '1' && k <= '9') {
      var i = parseInt(k, 10) - 1;
      if (i < state.game.jars.length) { e.preventDefault(); onJarClick(state.game.jars[i].id); }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
