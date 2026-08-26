/* app.js — screens, progress and input wiring. */
(function () {
  'use strict';

  var C = window.Colour;
  var UI = window.UI;
  var Sound = UI.Sound;
  var MAIN = window.Engine.MAIN;
  var STORE_KEY = 'colourjars.progress.v3';
  /* Kept apart from progress on purpose. It is a preference, not something
     earned, and writing it must never put anything near the record of stars. */
  var PREF_KEY = 'colourjars.difficulty';

  /* Limits for the two searches that run while someone is playing. Proving a
     position CANNOT be won is the slow case — there is no goal to home in on,
     so the search has to exhaust the space — and on the biggest boards that
     runs into seconds. Both are capped in milliseconds so the game never
     stalls between taps; a position too tangled to settle in time simply gets
     no warning rather than a freeze. */
  var WATCH_BUDGET = 40000, WATCH_MS = 150;
  var HINT_MS = 1200;

  var $ = function (id) { return document.getElementById(id); };

  /* Jar height, in pixels, that fitBoard() searches between. The floor keeps
     each band tall enough to hold a readable letter, so it has to follow how
     many bands a jar can hold — a deeper jar needs to be taller to stay
     legible. Rather than go under it, the shelf scrolls inside itself. */
  var BAND_MIN = 13, JAR_FLOOR = 78, JAR_MAX = 122;

  function smallestReadableJar() {
    if (!state.game) return JAR_FLOOR;
    var deepest = state.game.jars.reduce(function (n, j) { return Math.max(n, j.capacity); }, 0);
    return Math.max(JAR_FLOOR, deepest * BAND_MIN);
  }

  var state = {
    game: null,
    mode: 'campaign',
    difficulty: 'easy',
    selected: null,
    mainView: null,
    jarViews: [],
    hintTimer: null,
    hintsLeft: 0,
    from: 'levels',
    /* Which list the levels screen is showing. The screen itself is shared,
       because the two modes want exactly the same grid of tiles. */
    listMode: 'campaign'
  };

  /* Both modes are played on the same board and answered by the same code;
     only the rules differ, so the level says which search understands it. */
  /* Hints are rationed: one for every ten moves of par, rounded up, so a
     two-move level gets one and the hundred-and-fourteen-move one gets twelve.
     Rounding up rather than down matters — a floor would leave every level
     under par ten with no hint at all, including the ones that teach. */
  function hintAllowance(par) { return Math.max(1, Math.ceil((par || 0) / 10)); }

  function listFor(mode) { return mode === 'merge' ? window.MergeLevels : window.Levels; }
  function solverFor(game) { return game && game.merging ? window.Merge : window.Solver; }
  function recordFor(mode) { return mode === 'merge' ? progress.merge : progress.levels; }

  /* ───────── progress ───────── */

  var progress = load();

  function load() {
    try {
      var raw = window.Store.read(STORE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        p.levels = p.levels || {};
        p.random = p.random || {};
        p.merge = p.merge || {};
        return p;
      }
    } catch (e) { /* corrupt — start fresh rather than refuse to run */ }
    return { levels: {}, random: {}, merge: {} };
  }

  function loadDifficulty() {
    var saved = window.Store.read(PREF_KEY);
    if (saved && window.Generator.DIFFICULTY[saved]) state.difficulty = saved;
  }

  /* Progress is written the moment something is earned, and at no other time.
     There is deliberately no write when the page closes: that would put
     whatever is in memory over the stored copy, so a page that had failed to
     read the store would wipe real progress with nothing. A guard that checks
     the store first cannot help either — the case it exists for is the one
     where reading is what has failed. Not writing is the only thing that
     actually holds. */
  function save() {
    return window.Store.write(STORE_KEY, JSON.stringify(progress));
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

  var SCREENS = ['home', 'levels', 'random', 'game'];

  function showScreen(which) {
    SCREENS.forEach(function (name) {
      $('screen-' + name).classList.toggle('is-active', name === which);
    });
    document.body.classList.toggle('playing', which === 'game');
    window.scrollTo(0, 0);
    if (which === 'home') renderHome();
    if (which === 'levels') renderLevels();
    if (which === 'random') renderRandom();
    if (which === 'game') fitBoard();
  }

  function renderHome() {
    var list = window.Levels.list;
    var done = 0, stars = 0, nextUp = -1;
    list.forEach(function (lvl, i) {
      var record = progress.levels[lvl.id];
      if (record) { done++; stars += record.stars; }
      var unlocked = i === 0 || !!progress.levels[list[i - 1].id];
      if (unlocked && !record && nextUp < 0) nextUp = i;
    });

    $('home-fill').style.height = (100 * done / list.length) + '%';
    $('home-campaign-sub').textContent = done === 0
      ? list.length + ' levels · start with the basics'
      : done === list.length
        ? 'All ' + list.length + ' done · ' + stars + ' of ' + (list.length * 3) + ' stars'
        : 'Next up: level ' + (nextUp + 1) + ' · ' + done + ' of ' + list.length + ' done';

    var merge = window.MergeLevels.list;
    var mergeDone = merge.filter(function (l) { return progress.merge[l.id]; }).length;
    $('home-merge-sub').textContent = mergeDone === 0
      ? merge.length + ' levels · mix to make the colour'
      : mergeDone === merge.length
        ? 'All ' + merge.length + ' done'
        : 'Next up: level ' + (mergeDone + 1) + ' · ' + mergeDone + ' of ' + merge.length + ' done';

    var cfg = window.Generator.DIFFICULTY[state.difficulty];
    var rec = progress.random[state.difficulty];
    $('home-random-sub').textContent = cfg.label +
      (rec ? ' · ' + rec.won + ' solved' : ' · none solved yet');

    var warn = $('save-warning');
    if (window.Store.survivesClosing) {
      warn.hidden = true;
    } else {
      warn.hidden = false;
      warn.textContent = window.Store.kind === 'this-visit'
        ? 'This browser will not keep your progress after you close the game — stars will last until you close this tab.'
        : 'This browser is not letting the game store anything, so progress will be lost when you close it. Allowing site data for this page will fix it.';
    }
  }

  function renderLevels() {
    var grid = $('level-grid');
    grid.innerHTML = '';

    var mode = state.listMode;
    var list = listFor(mode).list;
    var record = recordFor(mode);
    $('levels-heading').textContent = mode === 'merge' ? 'Merge Colours' : 'Campaign';
    var nextUp = -1, done = 0, stars = 0;

    list.forEach(function (lvl, i) {
      var got = record[lvl.id];
      var unlocked = i === 0 || !!record[list[i - 1].id];
      if (got) { done++; stars += got.stars; }
      if (unlocked && !got && nextUp < 0) nextUp = i;

      var li = UI.el('li', null, grid);
      var btn = UI.el('button', 'tile', li);
      btn.type = 'button';
      btn.disabled = !unlocked;

      UI.el('span', 'tile__no', btn).textContent = unlocked ? String(i + 1) : '🔒';
      UI.el('span', 'tile__stars', btn).innerHTML = starString(got ? got.stars : 0);

      btn.setAttribute('aria-label', unlocked
        ? 'Level ' + (i + 1) + ', ' + lvl.name + ', ' +
          (got ? got.stars + ' of 3 stars, best ' + got.moves + ' moves' : 'not played yet')
        : 'Level ' + (i + 1) + ', locked — finish level ' + i + ' first');
      btn.title = unlocked ? lvl.name + ' — ' + lvl.teaches : 'Locked';

      btn.addEventListener('click', function () { startLevel(lvl, mode); });
    });

    if (nextUp >= 0) {
      var tile = grid.children[nextUp].firstChild;
      tile.classList.add('is-next');
      /* The grid is taller than the window once there are fifty of them, so
         bring the next one to play into view instead of opening at level 1
         every time. Only when it would otherwise be off screen — scrolling a
         tile that is already visible just shoves the heading away. */
      requestAnimationFrame(function () {
        if (tile.getBoundingClientRect().bottom > window.innerHeight) {
          tile.scrollIntoView({ block: 'center', behavior: UI.calm() ? 'auto' : 'smooth' });
        }
      });
    }

    $('campaign-note').textContent = done + ' of ' + list.length + ' done · ' +
      stars + ' of ' + (list.length * 3) + ' stars';
  }

  function renderRandom() {
    var diffs = $('difficulty');
    if (!diffs.childNodes.length) {
      ['easy', 'normal', 'hard', 'extraHard'].forEach(function (key) {
        var b = UI.el('button', 'diff', diffs);
        b.type = 'button';
        b.textContent = window.Generator.DIFFICULTY[key].label;
        b.setAttribute('role', 'radio');
        b.dataset.key = key;
        b.addEventListener('click', function () {
          setDifficulty(key);
          window.Store.write(PREF_KEY, key);
        });
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
    state.hintsLeft = hintAllowance(state.game.par);
    state.mode = mode;
    state.from = mode === 'random' ? 'random' : 'levels';
    if (mode !== 'random') state.listMode = mode;
    renderRecipes(state.game.merging);
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
    var book = listFor(state.mode);
    var at = state.mode === 'random' ? -1 : book.indexOf(lvl.id);
    $('level-sub').textContent = lvl.subtitle ||
      (at >= 0 ? 'Level ' + (at + 1) + ' of ' + book.list.length : '');
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
    mainSlot.appendChild(state.mainView.mount);

    var shelf = $('shelf');
    shelf.innerHTML = '';
    state.jarViews = g.jars.map(function (jar, i) {
      var view = new UI.JarView({
        keyLabel: String(i + 1),
        onClick: function () { onJarClick(jar.id); }
      });
      shelf.appendChild(view.mount);
      return view;
    });

    refresh();
    fitBoard();
  }

  /* ───────── fitting the board to the window ───────── */

  /* Shrink the jars until the whole play screen fits, so nothing has to be
     scrolled to reach the shelf, the buttons or the hint line.
     
     The jar size is searched against real layout rather than calculated,
     because how many jars land on a row — and therefore how tall the shelf
     is — depends on the very size being chosen. Measuring sidesteps that
     circularity. Eight steps of bisection settle it to within a pixel.
     
     If even the smallest jars overflow, the optional lines go: first the
     keyboard legend, then the level briefing. */
  /* What mixes with what, drawn rather than written — three recipes is the
     whole rule, and a player should never have to guess at it or remember it
     between levels. */
  function renderRecipes(show) {
    var list = $('recipes');
    list.hidden = !show;
    if (!show) return;
    if (list.childNodes.length) return;
    window.Merge.RECIPES.forEach(function (r) {
      var li = UI.el('li', 'recipe', list);
      [r.a, r.b, r.makes].forEach(function (colour, i) {
        if (i) UI.el('span', 'recipe__op', li).textContent = i === 1 ? '+' : '=';
        var dot = UI.el('span', 'recipe__dot', li);
        dot.style.background = C.hex(colour);
        dot.title = C.name(colour);
      });
      li.setAttribute('aria-label', C.name(r.a) + ' plus ' + C.name(r.b) + ' makes ' + C.name(r.makes));
    });
  }

  function fitBoard() {
    var screen = $('screen-game');
    if (!screen.classList.contains('is-active')) return;

    var optional = [$('keys'), $('brief'), $('recipes')];
    optional.forEach(function (el) {
      /* The recipe legend only belongs to merge levels; never un-hide it
         anywhere else. */
      if (el && !(el.id === 'recipes' && !state.game.merging)) el.hidden = false;
    });

    var floor = smallestReadableJar();
    var ceiling = Math.max(floor, JAR_MAX);

    /* First choice: everything on screen AND the whole shelf in view at once,
       dropping the optional lines only if that is what it takes. */
    for (var drop = 0; drop <= optional.length; drop++) {
      var best = largestThatFits(floor, ceiling, true);
      if (best > 0) { setJarHeight(best); return; }
      if (drop < optional.length && optional[drop]) optional[drop].hidden = true;
    }

    /* Last resort: let the shelf scroll inside itself. Seeing every jar at
       once is worth more than big jars, so this is only reached when no
       readable size shows them all. */
    var loose = largestThatFits(floor, ceiling, false);
    setJarHeight(loose > 0 ? loose : floor);
  }

  function largestThatFits(lo, hi, wholeShelfVisible) {
    var best = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      setJarHeight(mid);
      if (layoutSettles(wholeShelfVisible)) { best = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return best;
  }

  function layoutSettles(wholeShelfVisible) {
    var screen = $('screen-game');
    if (screen.scrollHeight > screen.clientHeight) return false;
    if (!wholeShelfVisible) return true;
    var wrap = document.querySelector('.shelf-wrap');
    /* The shelf can shrink and scroll, so the page fitting is not enough on
       its own — check the shelf is not hiding jars inside itself. */
    return !wrap || wrap.scrollHeight <= wrap.clientHeight + 1;
  }

  function setJarHeight(px) {
    document.documentElement.style.setProperty('--jar-h', px + 'px');
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
      clearHintMarks();
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
        result.reason === 'no-mix' ? 'Those two do not mix. Try a pair from the list above the shelf.' :
        'You cannot pour that way.', 'warn');
      return;
    }

    var dest = g.get(toId);
    Sound.pour(dest.cells.length / dest.capacity);

    var fromView = viewFor(fromId), toView = viewFor(toId);
    var dir = toView.centreX() >= fromView.centreX() ? 1 : -1;
    fromView.tilt(dir);
    clearTimeout(state.hintTimer);
    clearHintMarks();

    state.selected = null;
    setStatus('', '');
    refresh();
    toView.settle();

    if (g.won) {
      /* Written now rather than with the celebration. The card is on a timer
         for the animation, and anyone who closes the game in that moment —
         or whose phone puts it to sleep — would otherwise lose the level they
         just finished. */
      recordResult();
      Sound.win();
      setTimeout(showWinCard, 420);
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
    var check = solverFor(g).solve(g.position(), WATCH_BUDGET, WATCH_MS);
    if (!check.budgetExceeded && check.par == null) {
      setStatus('This position cannot be finished any more — undo a move.', 'warn');
    }
  }

  /* The hint marks its pair of jars. Cleared as soon as play resumes, so a
     stale ring never points at a move that has already been made. */
  function clearHintMarks() {
    var all = state.jarViews.concat(state.mainView ? [state.mainView] : []);
    all.forEach(function (v) {
      v.root.classList.remove('is-hint-from', 'is-hint-to');
    });
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

    var hint = $('hint');
    hint.textContent = 'Hint (' + state.hintsLeft + ')';
    hint.disabled = state.hintsLeft <= 0 || g.won;
    hint.setAttribute('aria-label', state.hintsLeft
      ? state.hintsLeft + ' hint' + (state.hintsLeft === 1 ? '' : 's') + ' left'
      : 'No hints left');
  }

  function setStatus(text, kind) {
    var node = $('status');
    node.textContent = text || ' ';
    node.classList.toggle('is-good', kind === 'good');
    node.classList.toggle('is-warn', kind === 'warn');
  }

  /* ───────── winning ───────── */

  function recordResult() {
    var g = state.game;
    var stars = g.stars();
    var lvl = g.level;

    if (state.mode !== 'random') {
      var book = recordFor(state.mode);
      var old = book[lvl.id];
      if (!old || stars > old.stars || (stars === old.stars && g.moves < old.moves)) {
        book[lvl.id] = { stars: stars, moves: g.moves };
      }
    } else {
      var rec = progress.random[state.difficulty] || { won: 0, par3: 0 };
      rec.won++;
      if (g.moves <= g.par) rec.par3++;
      rec.bestPar = rec.par3 > 0;
      progress.random[state.difficulty] = rec;
    }
    save();
    renderHome();
  }

  function showWinCard() {
    var g = state.game;
    var stars = g.stars();
    var lvl = g.level;

    $('win-swatch').style.background = C.hex(g.target);
    $('win-stars').innerHTML = starString(stars, true);
    $('win-stars').setAttribute('aria-label', stars + ' of 3 stars');
    $('win-title').textContent = g.moves <= g.par ? 'Perfect — par' : 'Jar filled';
    $('win-line').textContent =
      g.moves + ' moves, par ' + g.par + '.' +
      (g.moves > g.par ? ' ' + (g.moves - g.par) + ' over the best possible.' : '') +
      (g.hintsUsed ? ' Hint used.' : '');

    var next = $('win-next');
    if (state.mode !== 'random') {
      var book = listFor(state.mode);
      var i = book.indexOf(lvl.id);
      var hasNext = i >= 0 && i + 1 < book.list.length;
      next.textContent = hasNext ? 'Next level' : 'Try a random puzzle';
      next.onclick = function () {
        closeOverlay();
        if (hasNext) startLevel(book.list[i + 1], state.mode);
        else { showScreen('random'); $('play-random').focus(); }
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

    if (state.hintsLeft <= 0) {
      setStatus('That is the last of your hints for this level. Undo, or restart to get them back.', 'warn');
      return;
    }

    var result = solverFor(g).solve(g.position(), null, HINT_MS);
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
    state.hintsLeft--;
    var mv = result.path[0];
    var fromView = state.jarViews[mv.from];
    var toView = mv.to === -1 ? state.mainView : state.jarViews[mv.to];

    clearHintMarks();
    if (fromView) fromView.root.classList.add('is-hint-from');
    if (toView) toView.root.classList.add('is-hint-to');

    /* Two beats, so the hint reads as a sentence: shake the jar to pick up,
       then shake where it goes. Overlapping them would just look like noise. */
    clearTimeout(state.hintTimer);
    if (fromView) fromView.shake();
    state.hintTimer = setTimeout(function () {
      if (toView) toView.shake();
    }, UI.SHAKE_MS + 90);

    var moving = C.name(g.jars[mv.from].cells[g.jars[mv.from].cells.length - 1]);
    var landing;
    if (mv.to === -1) landing = 'into the big jar';
    else if (!g.jars[mv.to].cells.length) landing = 'into the empty jar';
    else landing = 'onto the ' + C.name(g.jars[mv.to].cells[g.jars[mv.to].cells.length - 1]) + ' jar';
    /* Say what it will turn into. Without that, a merge hint reads like an
       illegal move to anyone still learning the recipes. */
    if (mv.makes) landing += ' to make ' + C.name(mv.makes);

    setStatus('Pour ' + mv.amount + ' ' + moving + ' ' + landing + '. ' +
              result.par + ' move' + (result.par === 1 ? '' : 's') + ' left from here.', 'good');
    refresh();
  }

  /* ───────── wiring ───────── */

  function init() {
    loadDifficulty();
    renderHome();

    $('play-random').addEventListener('click', startRandom);
    $('seed-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') startRandom();
    });

    $('go-campaign').addEventListener('click', function () {
      state.listMode = 'campaign';
      showScreen('levels');
    });
    $('go-merge').addEventListener('click', function () {
      state.listMode = 'merge';
      showScreen('levels');
    });
    $('go-random').addEventListener('click', function () { showScreen('random'); });
    $('levels-back').addEventListener('click', function () { showScreen('home'); });
    $('random-back').addEventListener('click', function () { showScreen('home'); });

    $('back').addEventListener('click', function () {
      state.selected = null;
      showScreen(state.from);
    });

    $('undo').addEventListener('click', function () {
      if (state.game && state.game.undo()) {
        state.selected = null;
        clearHintMarks();
        Sound.pick();
        setStatus('Undone.', '');
        refresh();
      }
    });

    $('restart').addEventListener('click', function () {
      if (!state.game) return;
      state.game.restart();
      /* A restart is a fresh attempt, so the hints come back with it. Undo is
         deliberately not the same thing — that would make the ration free. */
      state.hintsLeft = hintAllowance(state.game.par);
      state.selected = null;
      clearTimeout(state.hintTimer);
      clearHintMarks();
      setStatus('Back to the start.', '');
      refresh();
    });

    $('hint').addEventListener('click', doHint);

    $('sound').addEventListener('click', function () {
      Sound.on = !Sound.on;
      this.textContent = Sound.on ? 'Sound on' : 'Sound off';
      this.setAttribute('aria-pressed', Sound.on ? 'true' : 'false');
      if (Sound.on) { Sound.ensure(); Sound.pick(); }
      else Sound.hush();          /* off means the device goes quiet too */
    });

    $('win-retry').addEventListener('click', function () {
      closeOverlay();
      state.game.restart();
      state.hintsLeft = hintAllowance(state.game.par);
      state.selected = null;
      refresh();
      setStatus('', '');
    });
    $('win-menu').addEventListener('click', function () { closeOverlay(); showScreen(state.from); });

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
      progress = { levels: {}, random: {}, merge: {} };
      save();
      renderHome();
    });

    document.addEventListener('keydown', onKey);


    /* Rotating a phone or resizing a window changes the room available. */
    var refit = null;
    window.addEventListener('resize', function () {
      clearTimeout(refit);
      refit = setTimeout(fitBoard, 120);
    });
  }

  function onKey(e) {
    if (e.target.tagName === 'INPUT') return;

    if (!$('howto').hidden) {
      if (e.key === 'Escape') { $('howto').hidden = true; $('how-to').focus(); }
      return;
    }
    if (!$('overlay').hidden) {
      if (e.key === 'Escape') { closeOverlay(); showScreen(state.from); }
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
