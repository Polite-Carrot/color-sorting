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
  var PREFS_KEY = 'colourjars.prefs.v1';

  /* Limits for the two searches that run while someone is playing. Proving a
     position CANNOT be won is the slow case — there is no goal to home in on,
     so the search has to exhaust the space — and on the biggest boards that
     runs into seconds. Both are capped in milliseconds so the game never
     stalls between taps; a position too tangled to settle in time simply gets
     no warning rather than a freeze. */
  var WATCH_BUDGET = 40000, WATCH_MS = 150;
  var HINT_MS = 1200;
  /* Merge Colors gets far longer, because its search has no tight bound to
     guide it and a hard board genuinely takes seconds on a phone. Rather than
     claim the position is too tangled — which would be a lie, the search
     simply had not finished — it says what it is doing and yields first, so
     the message paints before the thread is taken. The same trick the random
     dealer uses.

     Eight seconds rather than four because measurement said so. On a
     six-times-throttled processor the dearest levels finish in three to four,
     and one came in at 3910ms — inside four by ninety milliseconds. At eight
     times throttled, four levels gave up entirely. The choice there is between
     waiting a moment longer and being told, wrongly, that a position cannot be
     worked out, and waiting is plainly better. Levels 22-25 already sit in that
     band and cannot be redealt, so the budget is where the fix has to go. */
  var MERGE_HINT_MS = 8000;

  var $ = function (id) { return document.getElementById(id); };

  /* Jar height, in pixels, that fitBoard() searches between. The floor keeps
     each band tall enough to hold a readable letter, so it has to follow how
     many bands a jar can hold — a deeper jar needs to be taller to stay
     legible. The ceiling grows with the viewport so a big screen — iPad
     landscape, a desktop — shows big jars rather than sitting them small in a
     sea of sky. */
  var BAND_MIN = 13, JAR_FLOOR = 78, JAR_MAX = 122;

  function jarCeiling() {
    var h = window.innerHeight || 800;
    /* Roughly a third of the window height, capped for phones and for the
       biggest screens — above a certain size the jars look silly, not grand. */
    return Math.max(JAR_MAX, Math.min(320, Math.floor(h * 0.34)));
  }

  function smallestReadableJar() {
    if (!state.game) return JAR_FLOOR;
    var deepest = state.game.jars.reduce(function (n, j) { return Math.max(n, j.capacity); }, 0);
    return Math.max(JAR_FLOOR, deepest * BAND_MIN);
  }

  var state = {
    game: null,
    mode: 'campaign',
    difficulty: 'easy',
    randomMerge: false,
    selected: null,
    mainView: null,
    jarViews: [],
    hintTimer: null,
    hintsLeft: 0,
    /* A shortest route from some earlier position, and how far along it the
       player still is — or -1 once they have left it. It starts as the level's
       own stored solution, and is replaced by whatever a hint works out after
       that. While the player is on it, a hint is read straight off it and
       costs no search at all.

       Merge levels carry their solution in the level file because the hint
       from the opening position is far and away the dearest to work out, and
       it is the same answer every time anybody starts the level. */
    followed: null,
    onPath: -1,
    from: 'levels',
    /* Which list the levels screen is showing. The screen itself is shared,
       because the two modes want exactly the same grid of tiles. */
    listMode: 'campaign',
    /* The month the calendar is looking at, and the day being played. */
    calMonth: null,
    dailyKey: null
  };

  /* Both modes are played on the same board and answered by the same code;
     only the rules differ, so the level says which search understands it. */
  /* Hints are rationed: one for every ten moves of par, rounded up, so a
     two-move level gets one and the hundred-and-fourteen-move one gets twelve.
     Rounding up rather than down matters — a floor would leave every level
     under par ten with no hint at all, including the ones that teach. */
  function hintAllowance(par) { return Math.max(1, Math.ceil((par || 0) / 10)); }

  /* Random puzzles come in both games. The setting names are shared, but each
     game has its own shapes behind them. */
  var RANDOM_KEYS = ['easy', 'normal', 'hard', 'extraHard'];

  function randomGen() {
    return state.randomMerge ? window.MergeGenerator : window.Generator;
  }
  function randomKeys() {
    var table = randomGen().DIFFICULTY;
    return RANDOM_KEYS.filter(function (k) { return !!table[k]; });
  }
  /* Records are kept per game as well as per setting. Sort Colors keeps its bare
     setting name so scores earned before this existed still count. */
  function randomRecordKey(key) {
    return state.randomMerge ? 'merge:' + key : key;
  }

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
        p.daily = p.daily || {};
        return p;
      }
    } catch (e) { /* corrupt — start fresh rather than refuse to run */ }
    return { levels: {}, random: {}, merge: {}, daily: {} };
  }

  function loadDifficulty() {
    var saved = window.Store.read(PREF_KEY);
    if (saved && window.Generator.DIFFICULTY[saved]) state.difficulty = saved;
  }

  /* Sound and colour-blind assist are preferences too, kept in a single blob
     rather than a key each so a future toggle does not have to touch storage.
     Colour blind assist prints the letter on every band — off by default so
     the game reads as its colours, on when someone asks for it. */
  var prefs = { sound: true, cbAssist: false, randomMerge: false };

  function loadPrefs() {
    try {
      var raw = window.Store.read(PREFS_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (typeof p.sound === 'boolean') prefs.sound = p.sound;
        if (typeof p.cbAssist === 'boolean') prefs.cbAssist = p.cbAssist;
        if (typeof p.randomMerge === 'boolean') prefs.randomMerge = p.randomMerge;
      }
    } catch (e) { /* corrupt — stick with defaults */ }
  }

  function savePrefs() {
    window.Store.write(PREFS_KEY, JSON.stringify(prefs));
  }

  function applyPrefs() {
    Sound.on = prefs.sound;
    if (!prefs.sound) Sound.hush();
    document.body.classList.toggle('cb-assist', prefs.cbAssist);
    state.randomMerge = prefs.randomMerge;
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

  var SCREENS = ['home', 'levels', 'daily', 'random', 'game'];

  function showScreen(which) {
    SCREENS.forEach(function (name) {
      $('screen-' + name).classList.toggle('is-active', name === which);
    });
    document.body.classList.toggle('playing', which === 'game');
    window.scrollTo(0, 0);
    if (which === 'home') renderHome();
    if (which === 'levels') renderLevels();
    if (which === 'daily') renderDaily();
    if (which === 'random') renderRandom();
    if (which === 'game') fitBoard();
  }

  function renderHome() {
    var list = window.Levels.list;
    var done = list.filter(function (lvl) { return progress.levels[lvl.id]; }).length;

    $('home-fill').style.height = (100 * done / list.length) + '%';
    $('home-campaign-sub').textContent = done === 0
      ? list.length + ' levels · sort colors into the jar'
      : done + ' out of ' + list.length + ' done';

    var merge = window.MergeLevels.list;
    var mergeDone = merge.filter(function (l) { return progress.merge[l.id]; }).length;
    $('home-merge-sub').textContent = mergeDone === 0
      ? merge.length + ' levels · mix to make the color'
      : mergeDone + ' out of ' + merge.length + ' done';

    var D = window.Daily;
    var streak = D.streak(progress.daily);
    var todayDone = !!progress.daily[D.key(D.today())];
    $('home-daily-sub').textContent = todayDone
      ? (streak > 1 ? 'Done today · ' + streak + ' day streak' : 'Done today')
      : streak
        ? streak + ' day streak · today is waiting'
        : 'How long can you keep a streak?';

    var table = randomGen().DIFFICULTY;
    var cfg = table[state.difficulty] || table.normal;
    var rec = progress.random[randomRecordKey(state.difficulty)];
    $('home-random-sub').textContent = rec
      ? (state.randomMerge ? 'Merge Colors · ' : '') + cfg.label + ' · ' + rec.won + ' solved'
      : 'Choose your difficulty and game mode and challenge your friends';

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
    $('levels-heading').textContent = mode === 'merge' ? 'Merge Colors' : 'Sort Colors';
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

  /* ───────── the daily calendar ───────── */

  function dailyDone(date) { return progress.daily[window.Daily.key(date)]; }

  function renderDaily() {
    var D = window.Daily;
    if (!state.calMonth) {
      var t = D.today();
      state.calMonth = new Date(t.getFullYear(), t.getMonth(), 1);
    }

    $('cal-month').textContent = D.monthTitle(state.calMonth);

    /* Months before the first daily, or after this one, are not worth
       offering — there is nothing in them either way. */
    var first = D.first(), now = D.today();
    $('cal-prev').disabled = state.calMonth <= new Date(first.getFullYear(), first.getMonth(), 1);
    $('cal-next').disabled = state.calMonth >= new Date(now.getFullYear(), now.getMonth(), 1);

    var grid = $('cal-grid');
    grid.innerHTML = '';
    D.monthGrid(state.calMonth).forEach(function (date) {
      var li = UI.el('li', null, grid);
      if (!date) { li.className = 'cal--blank'; return; }

      var plan = D.planFor(date);
      var done = dailyDone(date);
      var open = D.playable(date);

      var btn = UI.el('button', 'cal__day', li);
      btn.type = 'button';
      btn.disabled = !open;
      if (done) btn.classList.add('is-done');
      if (D.key(date) === D.key(now)) btn.classList.add('is-today');

      UI.el('span', 'cal__no', btn).textContent = date.getDate();
      UI.el('i', 'cal__dot cal__dot--' + (plan.game === 'merge' ? 'merge' : 'classic'), btn);

      btn.setAttribute('aria-label', D.title(date) + ', ' + plan.label + ', ' +
        (done ? done.stars + ' of 3 stars' : open ? 'not played yet' : 'not open yet'));
      var table = (plan.game === 'merge' ? window.MergeGenerator : window.Generator).DIFFICULTY;
      btn.title = D.title(date) + ' — ' + plan.label + ' · ' + table[plan.difficulty].label;
      if (open) btn.addEventListener('click', function () { startDaily(date); });
    });

    var streak = D.streak(progress.daily);
    var solved = Object.keys(progress.daily).length;
    $('daily-note').textContent = streak
      ? streak + ' day streak · ' + solved + ' solved'
      : solved ? solved + ' solved' : 'Play today to start a streak';
  }

  function startDaily(date) {
    var D = window.Daily;
    var plan = D.planFor(date);
    var gen = plan.game === 'merge' ? window.MergeGenerator : window.Generator;
    state.dailyKey = D.key(date);
    var level = gen.generate(plan.difficulty, D.seedFor(date));
    level.id = 'daily-' + state.dailyKey;
    level.name = D.title(date);
    level.subtitle = plan.label + ' · ' + gen.DIFFICULTY[plan.difficulty].label;
    startLevel(level, 'daily');
  }

  function stepMonth(by) {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + by, 1);
    renderDaily();
  }

  function renderRandom() {
    var modes = $('random-mode');
    if (!modes.childNodes.length) {
      [['classic', 'Sort Colors'], ['merge', 'Merge Colors']].forEach(function (pair) {
        var b = UI.el('button', 'diff', modes);
        b.type = 'button';
        b.textContent = pair[1];
        b.setAttribute('role', 'radio');
        b.dataset.mode = pair[0];
        b.addEventListener('click', function () { setRandomMode(pair[0] === 'merge'); });
      });
    }
    renderDifficulties();
  }

  /* Rebuilt whenever the game changes, because the two do not offer the same
     settings and the labels come from whichever generator is in play. */
  function renderDifficulties() {
    var diffs = $('difficulty');
    var keys = randomKeys();
    var table = randomGen().DIFFICULTY;
    diffs.innerHTML = '';
    keys.forEach(function (key) {
      var b = UI.el('button', 'diff', diffs);
      b.type = 'button';
      b.textContent = table[key].label;
      b.setAttribute('role', 'radio');
      b.dataset.key = key;
      b.addEventListener('click', function () {
        setDifficulty(key);
        window.Store.write(PREF_KEY, key);
      });
    });

    Array.prototype.forEach.call($('random-mode').children, function (b) {
      var on = (b.dataset.mode === 'merge') === state.randomMerge;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });

    /* A setting the other game does not offer falls back rather than leaving
       nothing selected. */
    if (keys.indexOf(state.difficulty) < 0) state.difficulty = keys[keys.length - 1];
    setDifficulty(state.difficulty);
  }

  function setRandomMode(merge) {
    state.randomMerge = !!merge;
    prefs.randomMerge = state.randomMerge;
    savePrefs();
    renderDifficulties();
  }

  function setDifficulty(key) {
    state.difficulty = key;
    Array.prototype.forEach.call($('difficulty').children, function (b) {
      var on = b.dataset.key === key;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    $('difficulty-blurb').textContent = randomGen().DIFFICULTY[key].blurb;

    var rec = progress.random[randomRecordKey(key)];
    $('random-record').textContent = rec
      ? rec.won + (rec.won === 1 ? ' puzzle solved' : ' puzzles solved') +
        (rec.bestPar ? ' · matched par ' + rec.par3 + '×' : '')
      : 'No puzzles solved yet.';
  }

  /* ───────── starting a level ───────── */

  function startLevel(level, mode) {
    state.game = new window.Engine.Game(level);
    state.hintsLeft = hintAllowance(state.game.par);
    state.followed = level.path && level.path.length ? level.path : null;
    state.onPath = state.followed ? 0 : -1;
    state.mode = mode;
    state.from = mode === 'random' ? 'random' : mode === 'daily' ? 'daily' : 'levels';
    if (mode === 'campaign' || mode === 'merge') state.listMode = mode;
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
        startLevel(randomGen().generate(state.difficulty, seed), 'random');
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

    var optional = [$('keys'), $('brief')];
    var recipes = $('recipes');
    optional.forEach(function (el) { if (el) el.hidden = false; });
    if (recipes) recipes.hidden = !state.game.merging;

    var floor = smallestReadableJar();
    var ceiling = Math.max(floor, jarCeiling());

    /* First choice: everything on screen AND the whole shelf in view at once,
       dropping the optional lines only if that is what it takes. */
    for (var drop = 0; drop <= optional.length; drop++) {
      var best = largestThatFits(floor, ceiling, true);
      if (best > 0) { setJarHeight(best); tagShelfRows(); return; }
      if (drop < optional.length && optional[drop]) optional[drop].hidden = true;
    }

    /* Next resort: let the shelf scroll inside itself. Seeing every jar at
       once is worth more than big jars, so this is only reached when no
       readable size shows them all. */
    var loose = largestThatFits(floor, ceiling, false);
    if (loose > 0) { setJarHeight(loose); tagShelfRows(); return; }

    /* Only now give up the recipe list. In merge mode that list is the rules
       of the mode, so it goes last of everything — after the keyboard legend,
       after the briefing, and after letting the shelf scroll. */
    if (recipes && !recipes.hidden) {
      recipes.hidden = true;
      loose = largestThatFits(floor, ceiling, false);
    }
    setJarHeight(loose > 0 ? loose : floor);
    tagShelfRows();
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

  /* The shelf wraps to a second row on the biggest levels, and each row's
     plank needs its own end caps. Without this the middle rows read as a
     single continuous plank that suddenly stops and starts again. */
  function tagShelfRows() {
    var shelf = document.getElementById('shelf');
    if (!shelf) return;
    var slots = shelf.children;
    for (var i = 0; i < slots.length; i++) {
      slots[i].classList.remove('slot--row-start', 'slot--row-end');
    }
    var lastTop = null, prev = null;
    for (var j = 0; j < slots.length; j++) {
      var top = slots[j].offsetTop;
      if (top !== lastTop) {
        slots[j].classList.add('slot--row-start');
        if (prev) prev.classList.add('slot--row-end');
        lastTop = top;
      }
      prev = slots[j];
    }
    if (prev) prev.classList.add('slot--row-end');
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
        result.reason === 'mismatch' ? 'A color can only go onto the same color, or an empty jar.' :
        result.reason === 'no-mix' ? 'Those two do not mix. Try a pair from the list above the shelf.' :
        'You cannot pour that way.', 'warn');
      return;
    }

    trackPath(g, fromId, toId);

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

  /* The next move read straight off the level's stored solution, or null if
     the player has left it. What is left of the path from here is itself a
     shortest route, so the count of moves remaining is exact. */
  function fromStoredPath(g) {
    var path = state.followed;
    if (state.onPath < 0 || !path || state.onPath >= path.length) return null;
    var step = path[state.onPath];
    var from = 'jar' + step[0], to = step[1] === -1 ? MAIN : 'jar' + step[1];
    var can = g.check(from, to);
    if (!can.amount) return null;               /* stale — fall back to the search */
    return {
      par: path.length - state.onPath,
      path: [{ from: step[0], to: step[1], amount: can.amount, makes: can.merge }]
    };
  }

  /* A move either follows the stored solution, which advances the marker, or
     leaves it, which ends it until the level is restarted. */
  function trackPath(g, fromId, toId) {
    if (state.onPath < 0) return;
    var path = state.followed;
    if (!path || state.onPath >= path.length) { state.onPath = -1; return; }
    var step = path[state.onPath];
    var from = 'jar' + step[0];
    var to = step[1] === -1 ? MAIN : 'jar' + step[1];
    state.onPath = (from === fromId && to === toId) ? state.onPath + 1 : -1;
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

    if (state.mode === 'daily') {
      var was = progress.daily[state.dailyKey];
      if (!was || stars > was.stars || (stars === was.stars && g.moves < was.moves)) {
        progress.daily[state.dailyKey] = { stars: stars, moves: g.moves };
      }
    } else if (state.mode !== 'random') {
      var book = recordFor(state.mode);
      var old = book[lvl.id];
      if (!old || stars > old.stars || (stars === old.stars && g.moves < old.moves)) {
        book[lvl.id] = { stars: stars, moves: g.moves };
      }
    } else {
      var slot = randomRecordKey(state.difficulty);
      var rec = progress.random[slot] || { won: 0, par3: 0 };
      rec.won++;
      if (g.moves <= g.par) rec.par3++;
      rec.bestPar = rec.par3 > 0;
      progress.random[slot] = rec;
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
    if (state.mode === 'daily') {
      next.textContent = 'Back to the calendar';
      next.onclick = function () { closeOverlay(); showScreen('daily'); };
    } else if (state.mode !== 'random') {
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

  /* Show a dialog and put the keyboard in it.

     Both halves matter, and the second is why this exists rather than the two
     lines it replaces. A panel taller than the window scrolls its own content,
     and focusing a control inside it makes the browser scroll that control
     into view — so focusing the close button, which sits at the bottom, opened
     every long dialog at its last line. How to play did exactly that: it came
     up scrolled past its own title, showing the end of the text. Focusing
     without scrolling, and starting the panel at the top, is the fix. */
  function openModal(id, focusId) {
    var box = $(id);
    box.hidden = false;
    var panel = box.querySelector('.modal');
    if (panel) panel.scrollTop = 0;
    var target = $(focusId);
    if (!target) return;
    try { target.focus({ preventScroll: true }); }
    catch (e) { target.focus(); }          /* older engines: no options object */
    if (panel) panel.scrollTop = 0;        /* belt, in case the option was ignored */
  }

  /* ───────── toolbar ───────── */

  function doHint() {
    var g = state.game;
    if (!g || g.won) return;

    if (state.hintsLeft <= 0) {
      setStatus('That is the last of your hints for this level. Undo, or restart to get them back.', 'warn');
      return;
    }

    var ready = fromStoredPath(g);
    if (ready) { showHint(g, ready); return; }

    if (g.merging) {
      setStatus('Working it out…', '');
      var pending = g.moves;
      setTimeout(function () {
        if (state.game !== g || g.moves !== pending || g.won) return;
        showHint(g, window.Merge.solve(g.position(), null, MERGE_HINT_MS));
      }, 30);
      return;
    }
    showHint(g, window.Solver.solve(g.position(), null, HINT_MS));
  }

  function showHint(g, result) {
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

    /* Whatever the search just worked out is itself a shortest route from
       here, so keep it: following it costs no more searching, and somebody who
       has strayed and is now taking hints pays for one search, not one per
       hint. */
    if (result.path.length > 1 || state.onPath < 0) {
      state.followed = result.path.map(function (m) { return [m.from, m.to]; });
      state.onPath = 0;
    }
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
    loadPrefs();
    loadDifficulty();
    applyPrefs();
    /* Capacitor puts the game inside a native shell, where the keyboard
       shortcut hint at the bottom of the game screen is noise. */
    if (window.Capacitor) document.body.classList.add('is-native');
    renderHome();
    renderSettingsToggles();

    $('play-random').addEventListener('click', startRandom);
    $('seed-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') startRandom();
    });

    $('go-campaign').addEventListener('click', function () {
      state.listMode = 'campaign';
      showScreen('levels');
    });
    $('go-daily').addEventListener('click', function () {
      state.calMonth = null;                 /* always open on this month */
      showScreen('daily');
    });
    $('daily-back').addEventListener('click', function () { showScreen('home'); });
    $('cal-prev').addEventListener('click', function () { stepMonth(-1); });
    $('cal-next').addEventListener('click', function () { stepMonth(1); });

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
        /* Undo walks back along the stored solution as well: a position one
           move back from the path is on the path. Somebody who had strayed
           stays strayed, unless they have undone all the way to the start. */
        if (state.onPath > 0) state.onPath--;
        else if (state.game.moves === 0 && state.game.level.path) {
          state.followed = state.game.level.path;
          state.onPath = 0;
        } else state.onPath = -1;
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
      state.followed = state.game.level.path || null;
      state.onPath = state.followed ? 0 : -1;
      state.selected = null;
      clearTimeout(state.hintTimer);
      clearHintMarks();
      setStatus('Back to the start.', '');
      refresh();
    });

    $('hint').addEventListener('click', doHint);

    /* In-game Menu — opens the same settings dialog as the home screen, so
       sound and colour-blind assist can be flipped without leaving the level. */
    $('game-menu').addEventListener('click', function () {
      renderSettingsToggles();
      openModal('settings-modal', 'settings-close');
    });

    $('win-retry').addEventListener('click', function () {
      closeOverlay();
      state.game.restart();
      state.hintsLeft = hintAllowance(state.game.par);
      state.followed = state.game.level.path || null;
      state.onPath = state.followed ? 0 : -1;
      state.selected = null;
      refresh();
      setStatus('', '');
    });
    $('win-menu').addEventListener('click', function () { closeOverlay(); showScreen(state.from); });

    $('how-to').addEventListener('click', function () { openModal('howto', 'howto-close'); });
    $('howto-close').addEventListener('click', function () { $('howto').hidden = true; $('how-to').focus(); });

    $('settings').addEventListener('click', function () {
      renderSettingsToggles();
      openModal('settings-modal', 'settings-close');
    });
    $('settings-close').addEventListener('click', function () {
      $('settings-modal').hidden = true;
      $('settings').focus();
    });
    $('settings-sound').addEventListener('click', function () {
      prefs.sound = !prefs.sound;
      Sound.on = prefs.sound;
      if (prefs.sound) { Sound.ensure(); Sound.pick(); }
      else Sound.hush();
      savePrefs();
      renderSettingsToggles();
    });
    $('settings-cb').addEventListener('click', function () {
      prefs.cbAssist = !prefs.cbAssist;
      document.body.classList.toggle('cb-assist', prefs.cbAssist);
      savePrefs();
      renderSettingsToggles();
    });

    /* Erasing progress asks twice and then asks for six seconds of intent.
       It used to be a button on the home screen that you tapped twice, which
       sat one slip away from wiping a hundred levels. */
    function openReset() {
      $('settings-modal').hidden = true;
      $('reset-ask').hidden = false;
      $('reset-hold-step').hidden = true;
      openModal('reset-modal', 'reset-cancel');
    }

    function closeReset(back) {
      releaseHold();
      $('reset-modal').hidden = true;
      if (back) openModal('settings-modal', 'settings-close');
    }

    $('settings-reset').addEventListener('click', openReset);
    $('reset-cancel').addEventListener('click', function () { closeReset(true); });
    $('reset-back').addEventListener('click', function () { closeReset(true); });

    $('reset-yes').addEventListener('click', function () {
      $('reset-ask').hidden = true;
      $('reset-hold-step').hidden = false;
      $('reset-hold').focus();
    });

    /* The hold. Driven frame by frame rather than by a CSS transition, so that
       letting go stops the bar exactly where it stood instead of animating on
       to somewhere it never reached. */
    var HOLD_MS = 6000;
    var holdFrom = 0, holdRaf = null;

    function paintHold(fraction, label) {
      $('reset-hold').style.setProperty('--held', fraction);
      $('reset-hold-label').textContent = label;
    }

    function releaseHold() {
      if (holdRaf) cancelAnimationFrame(holdRaf);
      holdRaf = null;
      holdFrom = 0;
      var btn = $('reset-hold');
      btn.classList.remove('is-done');
      paintHold(0, 'Press and hold');
    }

    function tickHold() {
      var held = Date.now() - holdFrom;
      if (held >= HOLD_MS) {
        holdRaf = null;
        $('reset-hold').classList.add('is-done');
        paintHold(1, 'Erased');
        eraseProgress();
        return;
      }
      var left = Math.ceil((HOLD_MS - held) / 1000);
      paintHold(held / HOLD_MS, 'Keep holding… ' + left);
      holdRaf = requestAnimationFrame(tickHold);
    }

    function startHold() {
      if (holdRaf) return;                    /* already going, or finished */
      holdFrom = Date.now();
      Sound.pick();
      holdRaf = requestAnimationFrame(tickHold);
    }

    function eraseProgress() {
      progress = { levels: {}, random: {}, merge: {}, daily: {} };
      save();
      Sound.nope();
      renderHome();
      setTimeout(function () {
        closeReset(false);
        $('settings-modal').hidden = true;
        showScreen('home');
      }, 700);
    }

    var hold = $('reset-hold');
    hold.addEventListener('pointerdown', function (e) {
      /* Capture, so a finger sliding off the button still counts as holding —
         and so the release is heard wherever it happens. */
      hold.setPointerCapture(e.pointerId);
      startHold();
    });
    ['pointerup', 'pointercancel'].forEach(function (type) {
      hold.addEventListener(type, function () {
        if (!hold.classList.contains('is-done')) releaseHold();
      });
    });
    hold.addEventListener('keydown', function (e) {
      if (e.repeat) return;                   /* auto-repeat is not holding */
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); startHold(); }
    });
    hold.addEventListener('keyup', function (e) {
      if (e.key === ' ' || e.key === 'Enter') {
        if (!hold.classList.contains('is-done')) releaseHold();
      }
    });
    hold.addEventListener('blur', function () {
      if (!hold.classList.contains('is-done')) releaseHold();
    });

    document.addEventListener('keydown', onKey);

    /* Rotating a phone or resizing a window changes the room available. */
    var refit = null;
    window.addEventListener('resize', function () {
      clearTimeout(refit);
      refit = setTimeout(function () { fitBoard(); tagShelfRows(); }, 120);
    });
  }

  function renderSettingsToggles() {
    var s = document.getElementById('settings-sound');
    var c = document.getElementById('settings-cb');
    if (s) {
      s.textContent = prefs.sound ? 'On' : 'Off';
      s.setAttribute('aria-pressed', prefs.sound ? 'true' : 'false');
    }
    if (c) {
      c.textContent = prefs.cbAssist ? 'On' : 'Off';
      c.setAttribute('aria-pressed', prefs.cbAssist ? 'true' : 'false');
    }
  }

  function onKey(e) {
    if (e.target.tagName === 'INPUT') return;

    if (!$('howto').hidden) {
      if (e.key === 'Escape') { $('howto').hidden = true; $('how-to').focus(); }
      return;
    }
    if (!$('reset-modal').hidden) {
      if (e.key === 'Escape') {
        $('reset-modal').hidden = true;
        openModal('settings-modal', 'settings-close');
      }
      return;
    }
    if (!$('settings-modal').hidden) {
      if (e.key === 'Escape') { $('settings-modal').hidden = true; $('settings').focus(); }
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
