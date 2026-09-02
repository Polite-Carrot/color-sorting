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
  /* What a band may be squeezed to when the roomy minimum cannot show the
     whole shelf. A deep jar is forced tall by BAND_MIN — nine deep needs 117px
     before the fitter may even try it — which on a wide shelf means no size
     shows every jar and the board falls to scrolling. Given the choice between
     bands a third thinner and a board the player has to scroll before their
     first move, the thinner bands win: the jar then comes out the same size as
     a shallower setting's, holding more lines rather than standing taller. */
  var BAND_MIN_TIGHT = 10;

  function jarCeiling() {
    var h = window.innerHeight || 800;
    /* Roughly a third of the window height, capped for phones and for the
       biggest screens — above a certain size the jars look silly, not grand. */
    return Math.max(JAR_MAX, Math.min(320, Math.floor(h * 0.34)));
  }

  function smallestReadableJar(band) {
    if (!state.game) return JAR_FLOOR;
    var deepest = state.game.jars.reduce(function (n, j) { return Math.max(n, j.capacity); }, 0);
    return Math.max(JAR_FLOOR, deepest * (band || BAND_MIN));
  }

  var state = {
    game: null,
    mode: 'campaign',
    difficulty: 'easy',
    randomMerge: false,
    /* How wide a random shelf to deal. Follows the chosen difficulty's own
       width until the stepper is used, and is re-clamped when the game
       changes, since merge cannot go as wide as Sort Colors. */
    jars: 3,
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
  var RANDOM_KEYS = ['easy', 'normal', 'hard', 'extraHard', 'expert'];

  /* How wide the shelf may be dealt, per game. Sort Colors stops at fourteen —
     its search would go wider happily enough (a sixteen-jar board deals in
     about 11ms) but fourteen is where the board still reads well on a phone.
     Merge reaches ten, but only because the generator stops insisting on a
     proven-minimum par past seven jars — see PUSH_WEIGHT in
     js/merge-generator.js. Below eight jars par is still the true shortest. */
  var JAR_RANGE = { classic: [3, 14], merge: [3, 10] };

  /* The jar stepper. Off, so a setting is one choice and not two: picking a
     difficulty on the Random screen now lands on a width chosen for it
     (defaultJars in the generator's DIFFICULTY table) and that is the board.
     The stepper itself is untouched behind this flag -- flip it to true and the
     control comes back, which is how new campaign levels get built at widths
     the settings do not offer on their own. */
  var SHOW_JAR_PICKER = false;

  /* Most jars on one shelf row. Wider than this and a row stops reading as a
     row; the shelf wraps on its own below it. */
  var JARS_PER_ROW = 8;

  /* Past this width the merge generator stops proving par is the minimum and
     dives for a good solution instead — so the shape has to stay inside what
     that can still deal quickly. See PROVABLE_JARS in js/merge-generator.js. */
  var MERGE_PROVABLE_JARS = 7;

  function jarRange() {
    return JAR_RANGE[state.randomMerge ? 'merge' : 'classic'];
  }

  /* A preset with the jar count moved off its default. Everything that has to
     scale with the shelf does: the big jar and the obstacles are taken as a
     share of the cells available, so three jars is not asked to hold a jarful
     of eighteen. The par band goes, because the preset's band described the
     preset's width and no longer applies — whatever par the board comes out at
     is the honest answer. */
  function shapeFor(key, jars) {
    var base = randomGen().DIFFICULTY[key];
    if (!base || jars === base.sideJars) return null;
    var cap = base.sideCap;
    /* A wide merge shelf has to keep its big jar small. Scaling the target up
       with the width the way Sort Colors does produced boards that took the
       best part of a minute to deal: at ten jars a big jar of ten measured 55s,
       where the same width with a jar of four or five is 6-97ms. Merge has no
       tight lower bound, so its cost follows the branching factor, and the
       target size is the lever that actually bites.

       The depth was capped here too, and it turns out it did not need to be.
       That cap never took effect: it was applied to the arithmetic below but
       never written into the shape, so every wide merge board ever dealt came
       out at the setting's own depth against a unit budget sized for five.
       Three hundred and sixty campaign levels shipped that way, all of them
       sound and none of them slow. Seven deep at ten jars demonstrably works,
       so the cap is gone rather than fixed, and the arithmetic now matches the
       board it describes. */
    var cells = jars * cap;
    var mainCap = Math.max(2, Math.round(cells * (base.mainCap / (base.sideJars * base.sideCap))));
    if (state.randomMerge && jars > MERGE_PROVABLE_JARS) mainCap = Math.min(mainCap, 5);
    var slack = Math.round(cells * 0.33);
    /* Obstacle colours grow with the shelf, and in merge that is not garnish:
       the bound counts every inert run sitting on a parent, so a wide shelf
       with few obstacles is one the search cannot see the bottom of. Easy
       stretched to seven jars while keeping its single obstacle took eleven
       seconds to deal; letting the count follow the width brings it back under
       a second. Five is the ceiling — the obstacle pool is the palette minus
       the primaries and the target, and the lookalike rule bars one of those. */
    var want = state.randomMerge
      ? Math.round(jars * 0.7)
      : Math.round(jars * (base.fillers / base.sideJars));
    var fillers = Math.max(base.fillers, want);
    fillers = Math.max(1, Math.min(fillers, jars - 1, state.randomMerge ? 5 : 7));
    var fillerUnits = cells - slack - mainCap;
    if (state.randomMerge) fillerUnits = cells - slack - mainCap * 2;
    /* An obstacle colour needs at least one unit to exist in, so the count the
       width asks for is only ever a wish. Merge reserves twice the big jar --
       a unit of the target costs one of each primary -- which at five jars
       leaves three units against the four colours the width rule wants, and
       the whole setting was thrown away rather than dealt one colour lighter.
       Take what the units can pay for; four jars already runs on three
       obstacles and six on four, so five landing on three sits between them. */
    if (fillerUnits < fillers) fillers = fillerUnits;
    if (fillers < 1) return null;
    var out = {};
    for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    out.sideJars = jars;
    /* Written back, which it was not — the omission is what let the cap above
       be computed and then quietly ignored. */
    out.sideCap = cap;
    out.mainCap = mainCap;
    out.fillers = fillers;
    out.fillerUnits = fillerUnits;
    out.par = [1, 999];
    return out;
  }

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
  /* analytics: null until the question has been put, then true or false.
     Three states matter — the banner shows only for null, so somebody who has
     said no is not asked again on every visit. */
  var prefs = { sound: true, cbAssist: false, randomMerge: false, analytics: null };

  function loadPrefs() {
    try {
      var raw = window.Store.read(PREFS_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (typeof p.sound === 'boolean') prefs.sound = p.sound;
        if (typeof p.cbAssist === 'boolean') prefs.cbAssist = p.cbAssist;
        if (typeof p.randomMerge === 'boolean') prefs.randomMerge = p.randomMerge;
        if (typeof p.analytics === 'boolean') prefs.analytics = p.analytics;
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
    var slider = $('difficulty');
    var keys = randomKeys();
    var table = randomGen().DIFFICULTY;

    /* The slider spans whatever settings the chosen game offers, so a game with
       a different number of them needs no other change here. */
    slider.max = String(keys.length - 1);
    var ticks = $('difficulty-ticks');
    ticks.innerHTML = '';
    keys.forEach(function (key) {
      var t = UI.el('span', null, ticks);
      /* The short word only: five full labels across a phone would collide, and
         the setting's real name is already spelled out above the track. */
      t.textContent = table[key].label.replace('Extra ', 'X-');
      t.dataset.key = key;
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

  function renderJars() {
    var span = jarRange();
    if (state.jars < span[0]) state.jars = span[0];
    if (state.jars > span[1]) state.jars = span[1];
    $('jars-count').textContent = state.jars;
    $('jars-down').disabled = state.jars <= span[0];
    $('jars-up').disabled = state.jars >= span[1];
  }

  function stepJars(by) {
    var span = jarRange();
    var want = state.jars + by;
    if (want < span[0] || want > span[1]) return;
    state.jars = want;
    renderJars();
  }

  function setRandomMode(merge) {
    state.randomMerge = !!merge;
    prefs.randomMerge = state.randomMerge;
    savePrefs();
    renderDifficulties();
  }

  function setDifficulty(key) {
    state.difficulty = key;
    var keys = randomKeys();
    var at = keys.indexOf(key);
    var slider = $('difficulty');
    if (at >= 0) slider.value = String(at);
    var label = randomGen().DIFFICULTY[key].label;
    $('difficulty-name').textContent = label;
    /* The thumb's position is the only thing a sighted player reads; a screen
       reader is told the name instead of the number, which on its own says
       nothing. */
    slider.setAttribute('aria-valuetext', label);
    Array.prototype.forEach.call($('difficulty-ticks').children, function (t) {
      t.classList.toggle('is-on', t.dataset.key === key);
    });
    $('difficulty-blurb').textContent = randomGen().DIFFICULTY[key].blurb;
    /* Picking a difficulty resets the width, so the presets stay meaningful and
       the stepper is an adjustment from one. Usually that is the preset's own
       shelf; a setting may name a different opening width, which is how Merge
       Extra Hard lands on ten jars while still dealing its deep seven-jar
       shape if the player steps down to seven. */
    var cfg = randomGen().DIFFICULTY[key];
    state.jars = cfg.defaultJars || cfg.sideJars;
    renderJars();

    var rec = progress.random[randomRecordKey(key)];
    $('random-record').textContent = rec
      ? rec.won + (rec.won === 1 ? ' puzzle solved' : ' puzzles solved') +
        (rec.bestPar ? ' · matched par ' + rec.par3 + '×' : '')
      : 'No puzzles solved yet.';
  }

  /* ───────── starting a level ───────── */

  function startLevel(level, mode) {
    closeStuck();
    track('level_start', {
      mode: mode,
      level: level.id,
      par: level.par,
      jars: level.jars.length
    });
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
        var gen = randomGen();
        var key = state.difficulty;
        var custom = shapeFor(key, state.jars);
        if (custom) {
          /* Registered under a name because generate() takes a difficulty key
             rather than a config — the same way make-levels.js hands the
             campaign its shapes. */
          gen.DIFFICULTY.__custom = custom;
          key = '__custom';
        }
        var lvl = gen.generate(key, seed);
        if (custom) {
          /* The level carries the preset's name, not the scratch key, so the
             board reads as "Hard · seed 1234" and a record still slots in. */
          lvl.difficulty = state.difficulty;
          /* The width is only worth naming when the player chose it. With the
             stepper off it comes with the setting, and printing it on three
             boards out of five and not the other two reads as an inconsistency
             rather than as information. */
          lvl.subtitle = randomGen().DIFFICULTY[state.difficulty].label +
                         (SHOW_JAR_PICKER ? ' · ' + state.jars + ' jars' : '') +
                         ' · seed ' + lvl.seed;
        }
        track('random_deal', {
          game: state.randomMerge ? 'merge' : 'classic',
          setting: state.difficulty,
          jars: state.jars,
          par: lvl.par
        });
        startLevel(lvl, 'random');
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
      /* A hard wrap every eighth jar. Sixteen jars across one landscape iPad
         row was cramped and left half the screen empty; two rows of eight
         read far better. See .shelf__break in styles.css for why this is a
         break element and not a width cap on the shelf. */
      if (i && i % JARS_PER_ROW === 0) UI.el('i', 'shelf__break', shelf).setAttribute('aria-hidden', 'true');
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

  /* How many jars the widest row is currently holding. */
  function widestRow() {
    var rows = {}, most = 0;
    var jars = document.querySelectorAll('#shelf .jar');
    for (var i = 0; i < jars.length; i++) {
      /* Jars differ in depth and the shelf aligns them flex-end, so it is the
         BOTTOM edge that a row shares. Grouping by the top split one visual
         row into several and made this read rows that were not there. */
      var t = Math.round(jars[i].getBoundingClientRect().bottom);
      rows[t] = (rows[t] || 0) + 1;
      if (rows[t] > most) most = rows[t];
    }
    return most;
  }

  /* Is every jar in view without the shelf having to scroll? */
  function shelfWhollyVisible() {
    var wrap = document.querySelector('.shelf-wrap');
    return !wrap || wrap.scrollHeight <= wrap.clientHeight + 1;
  }

  /* Sixteen jars in one line on a landscape iPad was cramped and left half the
     screen empty, so a row is capped at eight. But the cap is an improvement
     only when it is affordable, and on the campaign's widest levels it is not:
     twenty-two jars forced into rows of eight is three rows, which no readable
     jar size can show all of, so the fitter falls through to letting the shelf
     scroll and picks the largest jars it can — which was far worse than the
     uneven rows the cap set out to fix.

     So the cap is offered, not imposed. Settle uncapped; if no row is over
     eight there is nothing to do. Otherwise settle capped, and keep it only if
     the whole shelf is still in view. If capping costs that, it is not worth
     having and the uncapped layout stands. */
  function fitBoard() {
    var shelf = $('shelf');
    shelf.classList.remove('shelf--capped');
    settleBoard();
    if (widestRow() <= JARS_PER_ROW) return;

    var wasWhole = shelfWhollyVisible();
    shelf.classList.add('shelf--capped');
    settleBoard();
    if (wasWhole && !shelfWhollyVisible()) {
      shelf.classList.remove('shelf--capped');
      settleBoard();
    }
  }

  function settleBoard() {
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

    /* Still nothing. Before letting the shelf scroll, try squeezing the bands:
       on a deep board the roomy minimum is what puts the whole shelf out of
       reach, not the shelf itself. Fourteen jars nine deep needs 117px a jar at
       thirteen pixels a band and cannot be shown whole at 390px; at ten it
       needs 90px, which fits — the same jar a six-deep setting gets, with more
       lines in it rather than a taller jar. */
    var tight = smallestReadableJar(BAND_MIN_TIGHT);
    if (tight < floor) {
      var squeezed = largestThatFits(tight, ceiling, true);
      if (squeezed > 0) { setJarHeight(squeezed); tagShelfRows(); return; }
      floor = tight;
    }

    /* Next resort: let the shelf scroll inside itself. Seeing every jar at
       once is worth more than big jars — which is why, once the shelf HAS to
       scroll, this takes the smallest readable size rather than the largest
       that fits. Taking the largest was the same instinct applied backwards:
       on a fourteen-jar nine-deep board it chose 258px jars and a 423px big
       jar, and left a 28px strip of shelf with none of the fourteen in it. The
       floor is already the smallest size whose bands are still readable, so
       there is nothing to lose below it and a great deal of board to gain. */
    var loose = largestThatFits(floor, ceiling, false);
    if (loose > 0) { setJarHeight(floor); tagShelfRows(); return; }

    /* Only now give up the recipe list. In merge mode that list is the rules
       of the mode, so it goes last of everything — after the keyboard legend,
       after the briefing, and after letting the shelf scroll. */
    if (recipes && !recipes.hidden) {
      recipes.hidden = true;
      loose = largestThatFits(floor, ceiling, false);
    }
    /* Nothing settled even at the floor, so the floor is what it gets: the
       smallest size whose bands are still readable, and the most of the board
       that can be on screen at once. */
    setJarHeight(floor);
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
    var wrap = document.querySelector('.shelf-wrap');
    if (!wrap) return true;

    if (!wholeShelfVisible) {
      /* The shelf scrolls inside itself, which means page overflow says
         nothing here: at ANY jar size the page still fits, because the shelf
         quietly absorbs the excess. So this used to return true for every
         candidate and the search climbed to the ceiling — measured on a
         fourteen-jar nine-deep board at 390px, it settled on 258px jars, a
         423px big jar, and a shelf strip 28px tall holding 2070px of jars.
         None of the fourteen were on screen.

         A row of the shelf has to survive, then. That is the least that makes
         the mode playable without scrolling before the first move, and it
         bounds the search from above the way page overflow does elsewhere. */
      var row = document.querySelector('.shelf .slot') || document.querySelector('#shelf .jar');
      if (!row) return true;
      return wrap.clientHeight >= row.getBoundingClientRect().height - 1;
    }

    /* The shelf can shrink and scroll, so the page fitting is not enough on
       its own — check the shelf is not hiding jars inside itself. */
    return wrap.scrollHeight <= wrap.clientHeight + 1;
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
    /* Only the jar slots — the row-break elements are children too, and
       counting them as slots put a plank end-cap in the middle of a row. */
    var slots = shelf.querySelectorAll('.slot');
    for (var i = 0; i < slots.length; i++) {
      slots[i].classList.remove('slot--row-start', 'slot--row-end');
    }
    var lastTop = null, prev = null;
    for (var j = 0; j < slots.length; j++) {
      /* Jars vary in depth and the shelf aligns them flex-end, so the row is
         shared by the bottom edge, not the top. */
      var top = slots[j].offsetTop + slots[j].offsetHeight;
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

  function doUndo() {
    if (!state.game || !state.game.undo()) return false;
    /* Undo walks back along the stored solution as well: a position one move
       back from the path is on the path. Somebody who had strayed stays
       strayed, unless they have undone all the way to the start. */
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
    return true;
  }

  function doRestart() {
    if (!state.game) return;
    closeStuck();
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
  }

  /* Say so early when a position can no longer be finished, rather than
     leaving someone to discover it several moves later.

     This used to be a line of status text, which is easy to miss and leaves
     the player looking for the way out on their own. It now raises the same
     card the win uses, with the ways out on it. Two different endings share
     it: no legal move at all, and legal moves that lead nowhere. */
  function watchForDeadEnd() {
    var g = state.game;
    if (!g.hasMoves()) { showStuckCard('nomoves'); return; }
    var check = solverFor(g).solve(g.position(), WATCH_BUDGET, WATCH_MS);
    if (!check.budgetExceeded && check.par == null) showStuckCard('unwinnable');
  }

  function showStuckCard(why) {
    var g = state.game;
    if (!g || g.won) return;

    $('stuck-swatch').style.background = C.hex(g.target);
    $('stuck-title').textContent = why === 'nomoves' ? 'No moves left' : 'No way on from here';
    $('stuck-line').textContent = (why === 'nomoves'
      ? 'Nothing on the shelf will pour anywhere.'
      : 'There are moves left, but none of them finish the jar.') +
      ' ' + g.moves + (g.moves === 1 ? ' move' : ' moves') + ' in.';

    /* Undo is the gentlest way out, so it leads -- unless there is nothing to
       undo, which means the board arrived like this and only a restart or a
       different puzzle helps. */
    var undo = $('stuck-undo');
    undo.hidden = !g.canUndo();

    /* Offered only where there IS another one to try. A campaign level is a
       particular puzzle; being handed a different one instead is not a way
       through it. */
    var another = $('stuck-another');
    another.hidden = state.mode !== 'random';

    track('dead_end', {
      mode: state.mode,
      level: g.level.id,
      moves_in: g.moves,
      reason: why
    });

    $('stuck').hidden = false;
    (undo.hidden ? $('stuck-retry') : undo).focus();
  }

  function closeStuck() { $('stuck').hidden = true; }

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
    /* Here rather than with the win card: the card is on a timer and somebody
       who closes the game inside it would otherwise not be counted, which is
       the same reason the score is written here. */
    var g0 = state.game;
    if (g0) track('level_complete', {
      mode: state.mode,
      level: g0.level.id,
      par: g0.par,
      moves: g0.moves,
      over_par: g0.moves - g0.par,
      stars: g0.stars(),
      hints_used: g0.hintsUsed
    });
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
      /* The same ending the watcher raises, reached by asking instead of by
         playing on, so it gets the same card and the same ways out. The hint
         is not spent on it: there was no move to give. */
      showStuckCard('unwinnable');
      return;
    }
    if (!result.path.length) return;

    g.hintsUsed++;
    state.hintsLeft--;
    track('hint_used', {
      mode: state.mode,
      level: g.level.id,
      moves_in: g.moves,
      hint_number: g.hintsUsed
    });

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
    /* After prefs are read, so a returning player who already answered is not
       asked again — and before anything is tracked, so nothing is sent by
       somebody who has not said yes. */
    maybeAskConsent();
    /* Capacitor puts the game inside a native shell, where the keyboard
       shortcut hint at the bottom of the game screen is noise. */
    if (window.Capacitor) document.body.classList.add('is-native');
    renderHome();
    renderSettingsToggles();
    $('jarpick').hidden = !SHOW_JAR_PICKER;

    $('play-random').addEventListener('click', startRandom);
    $('consent-yes').addEventListener('click', function () { answerConsent(true); });
    $('consent-no').addEventListener('click', function () { answerConsent(false); });

    /* 'input' rather than 'change', so the name and the blurb follow the thumb
       as it is dragged rather than snapping over once it is let go. */
    $('difficulty').addEventListener('input', function () {
      var keys = randomKeys();
      var key = keys[Number($('difficulty').value)];
      if (!key || key === state.difficulty) return;
      setDifficulty(key);
      window.Store.write(PREF_KEY, key);
    });

    $('jars-down').addEventListener('click', function () { stepJars(-1); });
    $('jars-up').addEventListener('click', function () { stepJars(1); });
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

    $('undo').addEventListener('click', function () { doUndo(); });

    $('restart').addEventListener('click', function () {
      doRestart();
    });

    $('hint').addEventListener('click', doHint);

    /* In-game Settings — the same dialog as the home screen, so sound and
       colour-blind assist can be flipped without leaving the level. It used to
       be labelled "Menu", which collided with the two buttons that really do
       go back to the menu: "← Menu" in the toolbar above, and "Menu" on the
       win card. Those two are navigation and keep the name; this one opens a
       dialog and now says what it opens. */
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

    /* The stuck card's ways out. Undo and restart re-check the position rather
       than assuming they fixed it: undoing one move out of a dead end can land
       on another one, and saying nothing there would be worse than the status
       line this replaced. */
    $('stuck-undo').addEventListener('click', function () {
      closeStuck();
      if (doUndo()) watchForDeadEnd();
    });
    $('stuck-retry').addEventListener('click', function () {
      closeStuck();
      doRestart();
    });
    $('stuck-another').addEventListener('click', function () {
      closeStuck();
      $('seed-input').value = '';
      startRandom();
    });
    $('stuck-menu').addEventListener('click', function () { closeStuck(); showScreen(state.from); });

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
    function refitSoon() {
      clearTimeout(refit);
      refit = setTimeout(function () { fitBoard(); tagShelfRows(); }, 120);
    }
    window.addEventListener('resize', refitSoon);

    /* Safari on iOS shows and hides its toolbars over the page, and does not
       reliably fire `resize` when it does — so the board stayed sized for the
       taller window and the bottom of the shelf ended up underneath the
       toolbar, with the big jar filling the screen. The visual viewport is
       what is actually on show, so track that: publish its height for the
       layout to use, and refit whenever it changes.

       Height is also read from here rather than left to 100dvh, because dvh
       resolves to the LARGEST viewport — the one with the toolbars retracted
       — which is exactly the measurement that was too generous. */
    var vv = window.visualViewport;
    if (vv) {
      var applyViewport = function () {
        document.documentElement.style.setProperty('--vvh', vv.height + 'px');
        refitSoon();
      };
      vv.addEventListener('resize', applyViewport);
      applyViewport();
    }
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
    /* No analytics row: there is no measurement id set, so there is nothing to
       consent to and a switch that changed nothing would only raise the
       question. The answer is still kept in prefs and the consent banner is
       still the thing that asks it -- both stay dormant until an id is pasted
       into js/track.js, and a settings switch comes back with it. */
  }

  /* ───────── analytics, once asked for ───────── */

  function applyConsent() {
    if (!window.Track || !window.Track.configured()) return;
    if (prefs.analytics) window.Track.load();
    else window.Track.unload();
  }

  function answerConsent(yes) {
    prefs.analytics = !!yes;
    savePrefs();
    $('consent').hidden = true;
    applyConsent();
  }

  /* Asked once, on the first visit that has a measurement id to ask about. */
  function maybeAskConsent() {
    if (!window.Track || !window.Track.configured()) return;
    if (prefs.analytics === null) $('consent').hidden = false;
    else applyConsent();
  }

  /* Every call site is one line and none of them can fail: Track.event is a
     no-op without consent. */
  function track(name, params) {
    if (window.Track) window.Track.event(name, params);
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
    /* Escape leaves the stuck card on the board rather than on the menu: the
       player may want to look at the shelf before choosing. The card can be
       raised again by the next move, and undo and restart are still on the
       toolbar. */
    if (!$('stuck').hidden) {
      if (e.key === 'Escape') { closeStuck(); }
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
