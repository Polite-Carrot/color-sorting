/* app-wiring.excerpt.js — the parts of color-sorting js/app.js that connect
 * Ads, Track, Reminders and Purchases to the UI. Verbatim, in file order, each
 * section headed by its source line range. NOT runnable on its own: paste each
 * section into the game's main IIFE (the "inside init()" and "inside onKey()"
 * sections go inside those functions).
 *
 * Assumed to exist in the same closure (game-specific, not included):
 *   PREFS_KEY ('colourjars.prefs.v1'), applyPrefs(), save(), renderHome(),
 *   showScreen(name), startLevel(...), state (.mode, .game), and progress
 *   (.levels, .merge, .daily, .random) — levelsCompleted() counts these.
 *   UI.el(tag, className, parent) creates an element and appends it.
 *   window.Store (assets/js/store.js), window.Daily (references/notifications.md).
 *
 * ── Hook points inside the game's own code ─────────────────────────────────
 *
 *   init():            loadPrefs(); applyPrefs(); maybeAskConsent();
 *                      // before anything is tracked; then, after the privacy and
 *                      // settings buttons are bound: bindStoreAndReminders();
 *
 *   result recorded:   track('level_complete', {...});
 *   (on every win,     Ads.noteLevelComplete();   // counts real wins, even if the
 *    not on the card)                            // player quits during the win card
 *                      if (dailySolved && window.Reminders) window.Reminders.sync(progress.daily);
 *
 *   win card button:   next.onclick = async function () {
 *                        closeOverlay();
 *                        await Ads.maybeShowInterstitial(); // instant unless a preloaded ad shows
 *                        <navigate: next level / calendar / new random>;
 *                        maybeOfferReminder();
 *                      };
 */

/* ── js/app.js L39: DOM helper ── */
  var $ = function (id) { return document.getElementById(id); };

/* ── js/app.js L136: privacy policy link (per app) ── */
  var PRIVACY_POLICY_URL = 'https://politecarrot.com/privacy';

/* ── js/app.js L257-281: prefs: analytics is null until asked; personalised ads defaults off ── */
  /* Sound and colour-blind assist are preferences too, kept in a single blob
     rather than a key each so a future toggle does not have to touch storage.
     Colour blind assist prints the letter on every band — off by default so
     the game reads as its colours, on when someone asks for it. */
    /* Analytics is undecided only until the first-run question is answered.
      Personalised ads is always a local intent, defaulting to off. */
    var prefs = { sound: true, cbAssist: false, randomMerge: false, analytics: null, personalizedAds: false };

  function loadPrefs() {
    try {
      var raw = window.Store.read(PREFS_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (typeof p.sound === 'boolean') prefs.sound = p.sound;
        if (typeof p.cbAssist === 'boolean') prefs.cbAssist = p.cbAssist;
        if (typeof p.randomMerge === 'boolean') prefs.randomMerge = p.randomMerge;
        if (typeof p.analytics === 'boolean') prefs.analytics = p.analytics;
        if (typeof p.personalizedAds === 'boolean') prefs.personalizedAds = p.personalizedAds;
      }
    } catch (e) { /* corrupt — stick with defaults */ }
  }

  function savePrefs() {
    window.Store.write(PREFS_KEY, JSON.stringify(prefs));
  }

/* ── js/app.js L948-1028: consent flow: setAdsPersonalized, primeConsent, askForNotifications, setToggleBtn, openPrivacyModal, openPrivacyDataModal, maybeAskConsent ── */
  async function setAdsPersonalized(on) {
    prefs.personalizedAds = on === true;
    savePrefs();
    applyConsent();
    renderSettingsToggles();
    if (!on) return;
    var Ads = window.Ads;
    if (!Ads || !Ads.isNative || !Ads.isNative()) return;
    var attPromise = Ads.getPlatform() === 'ios' ? Ads.ensureAtt(true) : Promise.resolve();
    try { await Ads.init(); } catch (e) {}
    try { await attPromise; } catch (e) {}
    applyConsent();
    renderSettingsToggles();
  }

  async function primeConsent() {
    var Ads = window.Ads;
    var native = !!(Ads && Ads.isNative && Ads.isNative());
    var attPromise = native && Ads.getPlatform() === 'ios' ? Ads.ensureAtt(true) : Promise.resolve();
    /* iOS shows one system prompt at a time, so notifications wait for the tracking answer. */
    attPromise.catch(function () {}).then(askForNotifications).catch(function () {});
    if (!native) return;
    try { await Ads.init(); } catch (e) {}
    var attStatus = null;
    try { attStatus = await attPromise; } catch (e) {}
    if (attStatus === 'authorized') {
      prefs.personalizedAds = true;
      savePrefs();
    }
    applyConsent();
    renderSettingsToggles();
  }

  /* First run only: the OS remembers the answer, and the Settings switch handles a change of mind. */
  function askForNotifications() {
    var R = window.Reminders;
    if (!R || !R.available() || R.state().asked) return;
    return R.enable(progress.daily).then(function (result) {
      if (result === 'on') track('daily_reminder', { on: true, hour: R.state().hour, from: 'first_run' });
      renderReminderRows();
    });
  }

  function setToggleBtn(btn, on) {
    if (!btn) return;
    btn.textContent = on ? 'On' : 'Off';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function openPrivacyModal() {
    setToggleBtn($('privacy-analytics'), prefs.analytics === true);
    var link = $('privacy-policy');
    if (link) {
      link.hidden = !PRIVACY_POLICY_URL;
      if (PRIVACY_POLICY_URL) link.href = PRIVACY_POLICY_URL;
    }
    openModal('privacy', 'privacy-title');
  }

  function openPrivacyDataModal() {
    setToggleBtn($('privacy-data-analytics'), prefs.analytics === true);
    setToggleBtn($('privacy-data-ads'), prefs.personalizedAds === true);
    openModal('privacy-data', 'privacy-data-title');
  }

  function maybeAskConsent() {
    if (prefs.analytics !== null) {
      applyConsent();
      var Ads = window.Ads;
      if (Ads && Ads.isNative && Ads.isNative()) {
        Ads.init().then(function () { return Ads.ensureAtt(false); })
          .then(function () { applyConsent(); renderSettingsToggles(); })
          .catch(function () {});
      }
      return;
    }
    (function waitForBoot(tries) {
      if (!document.getElementById('boot') || tries > 40) { openPrivacyModal(); return; }
      setTimeout(function () { waitForBoot(tries + 1); }, 150);
    })(0);
    }

/* ── js/app.js L1402-1424: closeOverlay, openModal ── */
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


/* ── js/app.js L1577-1611: inside init(): first-run and Privacy & Data modal buttons ── */
    function bindToggle(id) {
      $(id).addEventListener('click', function () {
        var on = this.getAttribute('aria-pressed') !== 'true';
        setToggleBtn(this, on);
      });
    }
    bindToggle('privacy-analytics');
    $('privacy-continue').addEventListener('click', function () {
      prefs.analytics = $('privacy-analytics').getAttribute('aria-pressed') === 'true';
      savePrefs();
      applyConsent();
      $('privacy').hidden = true;
      primeConsent();
    });

    function bindPrivacyDataToggle(id) {
      $(id).addEventListener('click', function () {
        var on = this.getAttribute('aria-pressed') !== 'true';
        setToggleBtn(this, on);
        if (id === 'privacy-data-analytics') prefs.analytics = on;
        else setAdsPersonalized(on);
        savePrefs();
        applyConsent();
      });
    }
    bindPrivacyDataToggle('privacy-data-analytics');
    bindPrivacyDataToggle('privacy-data-ads');
    $('privacy-data-close').addEventListener('click', function () {
      $('privacy-data').hidden = true;
      $('settings').focus();
    });
    $('settings-privacy').addEventListener('click', function () {
      $('settings-modal').hidden = true;
      openPrivacyDataModal();
    });

/* ── js/app.js L1707-1712: inside init(): Settings button, then bindStoreAndReminders() ── */
    $('settings').addEventListener('click', function () {
      renderSettingsToggles();
      openModal('settings-modal', 'settings-close');
      checkReminderPermission();
    });
    bindStoreAndReminders();

/* ── js/app.js L1870-2184: renderSettingsToggles, reminder rows, reminder offer, Remove Ads UI, bindStoreAndReminders, applyConsent, track() ── */
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

    setToggleBtn(document.getElementById('privacy-data-analytics'), prefs.analytics === true);
    setToggleBtn(document.getElementById('privacy-data-ads'), prefs.personalizedAds === true);
    renderReminderRows();
    renderPurchaseRows();
  }

  /* ───────── daily reminders (js/reminders.js) ───────── */

  function hourLabel(h) {
    var suffix = h < 12 ? 'am' : 'pm';
    var n = h % 12 === 0 ? 12 : h % 12;
    return n + suffix;
  }

  function renderReminderRows() {
    var R = window.Reminders;
    var row = $('settings-reminder-row');
    if (!row) return;
    var show = !!(R && R.available());
    row.hidden = !show;
    if (show) setToggleBtn($('settings-reminder'), R.state().on);
  }

  var REMINDER_BLOCKED = 'Notifications are turned off for this game. Allow them in your phone\'s Settings app, then switch this on.';

  function showReminderBlocked(blocked) {
    $('settings-reminder-note').textContent = blocked ? REMINDER_BLOCKED : '';
    $('settings-reminder-note-row').hidden = !blocked;
  }

  /* The system setting can change while the game is closed. If it was turned
     off there, say so next to the switch instead of showing "On" for
     reminders that cannot arrive. */
  function checkReminderPermission() {
    var R = window.Reminders;
    if (!R || !R.available()) return;
    R.permission().then(function (p) {
      showReminderBlocked(p === 'denied');
    });
  }

  /* Set while the phone's Settings is open from the switch, so coming back
     with notifications allowed finishes switching it on. */
  var reminderFromSettings = false;

  async function finishReminderFromSettings() {
    reminderFromSettings = false;
    var R = window.Reminders;
    if ((await R.permission()) !== 'granted') return;
    var result = await R.enable(progress.daily);
    showReminderBlocked(result !== 'on');
    if (result === 'on') track('daily_reminder', { on: true, hour: R.state().hour, from: 'settings' });
    renderReminderRows();
  }

  async function toggleReminder() {
    var R = window.Reminders;
    if (!R) return;
    var btn = $('settings-reminder');
    btn.disabled = true;
    try {
      if (R.state().on) {
        await R.disable();
        track('daily_reminder', { on: false });
      } else {
        var result = await R.enable(progress.daily);
        if (result === 'blocked') {
          reminderFromSettings = true;
          R.openSettings();
        }
        showReminderBlocked(result === 'denied' || result === 'blocked');
        if (result === 'on') track('daily_reminder', { on: true, hour: R.state().hour });
      }
    } finally {
      btn.disabled = false;
      renderReminderRows();
    }
  }

  /* Every puzzle finished, in any mode: one per level or daily day with a
     record, plus every random win. */
  var REMINDER_AFTER_LEVELS = 10;
  function levelsCompleted() {
    var n = Object.keys(progress.levels).length +
            Object.keys(progress.merge).length +
            Object.keys(progress.daily).length;
    Object.keys(progress.random).forEach(function (k) {
      n += (progress.random[k] && progress.random[k].won) || 0;
    });
    return n;
  }

  /* Offered once per install, at whichever comes first: the first solved
     daily (the reminder is about the daily, so that is when it means most),
     or ten puzzles finished anywhere (a player who has stuck around but not
     found the daily yet). Never at launch: the system prompt appears once
     per install, and spending it before the player cares wastes it. */
  async function maybeOfferReminder() {
    var R = window.Reminders;
    var daily = state.mode === 'daily';
    if (!daily && levelsCompleted() < REMINDER_AFTER_LEVELS) return;
    if (!R || !(await R.shouldOffer())) return;
    if (!$('settings-modal').hidden || !$('overlay').hidden) return;
    R.markOffered();
    var lead = $('reminder-offer-lead');
    lead.hidden = daily;
    lead.textContent = daily ? '' : levelsCompleted() + ' puzzles solved, nice work! There is also a new Daily Puzzle every day.';
    $('reminder-offer-time').textContent = hourLabel(R.state().hour);
    openModal('reminder-offer', 'reminder-offer-yes');
    track('reminder_offer', { from: daily ? 'daily' : 'levels' });
  }

  function closeReminderOffer() {
    $('reminder-offer').hidden = true;
  }

  /* ───────── Remove Ads (js/purchases.js) ───────── */

  var REMOVE_ADS_NOTE = 'Pay once, no more ads. Stays removed if you reinstall or change phone.';

  function renderPurchaseRows(message) {
    var P = window.Purchases;
    var row = $('settings-remove-ads-row');
    if (!row) return;
    var show = !!(P && P.available());
    row.hidden = !show;
    $('settings-restore-row').hidden = !show;
    var adsNote = $('privacy-data-ads-note');
    var adsBtn = $('privacy-data-ads');
    var removed = !!(P && P.adsRemoved());
    if (adsNote) {
      adsNote.textContent = removed
        ? 'You removed ads, so there are none to personalise.'
        : 'Ads matched to your interests. Left off, ads still appear but are generic.';
    }
    if (adsBtn) adsBtn.disabled = removed;
    renderHomeRemoveAds();
    if (!show) return;
    var st = P.status();
    var btn = $('settings-remove-ads');
    var note = $('settings-remove-ads-note');
    if (st.owned) {
      btn.textContent = 'Removed';
      btn.disabled = true;
      note.textContent = message || 'Thank you! Ads are gone for good.';
    } else if (st.pending) {
      btn.textContent = 'Pending';
      btn.disabled = true;
      note.textContent = message || 'Waiting for the payment to be approved. Ads switch off by themselves when it goes through.';
    } else {
      btn.textContent = st.busy ? '\u2026' : (st.price || 'Remove');
      btn.disabled = st.busy;
      note.textContent = message || REMOVE_ADS_NOTE;
    }
    $('settings-restore').disabled = st.busy || st.owned;
  }

  /* The home-screen button: the same purchase as the Settings row, one tap
     from the menu. Hidden on the web and once bought; while a payment is
     pending it stays, disabled, so the player can see it is in hand. */
  var homeThanksUntil = 0;
  function renderHomeRemoveAds() {
    var P = window.Purchases;
    var btn = $('home-remove-ads');
    if (!btn) return;
    if (!P || !P.available()) { btn.hidden = true; return; }
    var st = P.status();
    if (st.owned) {
      /* Say thank you where they tapped, then get out of the way. */
      var left = homeThanksUntil - Date.now();
      btn.hidden = left <= 0;
      btn.textContent = 'Thank you!';
      btn.disabled = true;
      if (left > 0) setTimeout(renderHomeRemoveAds, left + 20);
      return;
    }
    btn.hidden = false;
    btn.disabled = st.busy || st.pending;
    btn.textContent = '';
    if (st.pending) { btn.textContent = 'Pending'; return; }
    /* Two labels; CSS shows the short one where the menu is tight. The price
       comes from the store, so it goes in as text, never as markup. */
    UI.el('span', 'ra-long', btn).textContent = 'Remove ads';
    UI.el('span', 'ra-short', btn).textContent = 'No ads';
    btn.appendChild(document.createTextNode(
      st.busy ? '\u2026' : st.price ? ' \u00b7 ' + st.price : ''));
  }

  async function buyFromHome() {
    var P = window.Purchases;
    if (!P) return;
    var result = await P.buy();
    track('remove_ads', { result: result, from: 'home' });
    if (result === 'owned') homeThanksUntil = Date.now() + 2500;
    renderPurchaseRows();
    /* There is no room on the menu for an explanation; Settings has one,
       and the Restore button next to it. */
    if (result === 'failed' || result === 'pending') {
      renderSettingsToggles();
      renderPurchaseRows(result === 'failed'
        ? 'The purchase did not go through. Check your connection and try again. Bought it before? Tap Restore.'
        : 'Waiting for the payment to be approved. Ads switch off by themselves when it goes through.');
      openModal('settings-modal', 'settings-close');
    }
  }

  async function buyRemoveAds() {
    var P = window.Purchases;
    if (!P) return;
    var result = await P.buy();
    track('remove_ads', { result: result, from: 'settings' });
    var msg = {
      owned: 'Thank you! Ads are gone for good.',
      pending: 'Waiting for the payment to be approved. Ads switch off by themselves when it goes through.',
      cancelled: null,
      failed: 'The purchase did not go through. Check your connection and try again.'
    }[result];
    renderPurchaseRows(msg || undefined);
  }

  async function restorePurchases() {
    var P = window.Purchases;
    if (!P) return;
    var owned = await P.restore();
    track('remove_ads_restore', { found: owned });
    renderPurchaseRows(owned
      ? 'Restored. Ads are gone for good.'
      : 'No Remove Ads purchase found for this ' +
        (window.Capacitor && window.Capacitor.getPlatform() === 'ios' ? 'Apple ID.' : 'Google account.'));
  }

  function bindStoreAndReminders() {
    $('settings-reminder').addEventListener('click', toggleReminder);
    $('reminder-offer-yes').addEventListener('click', async function () {
      closeReminderOffer();
      var result = await window.Reminders.enable(progress.daily);
      if (result === 'on') track('daily_reminder', { on: true, hour: window.Reminders.state().hour, from: 'offer' });
      renderReminderRows();
    });
    $('reminder-offer-no').addEventListener('click', closeReminderOffer);

    $('settings-remove-ads').addEventListener('click', buyRemoveAds);
    $('home-remove-ads').addEventListener('click', buyFromHome);
    $('settings-restore').addEventListener('click', restorePurchases);

    if (window.Purchases) {
      window.Purchases.onChange(function () { renderPurchaseRows(); });
    }
    if (window.Reminders) {
      /* A tapped reminder opens the daily calendar, unless a puzzle is in
         progress: that is left alone rather than thrown away. */
      window.Reminders.onOpen(function () {
        if ($('screen-game').classList.contains('is-active')) return;
        closeReminderOffer();
        showScreen('daily');
      });
      window.Reminders.sync(progress.daily);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') return;
        /* A new day may have started while the game sat in the background. */
        window.Reminders.sync(progress.daily);
        if (reminderFromSettings) finishReminderFromSettings();
      });
    }
    renderReminderRows();
    renderPurchaseRows();
  }

  /* ───────── analytics + ads consent, once asked for ───────── */

  function applyConsent() {
    function syncAnalytics() {
      window.__consentState = {
        analytics: prefs.analytics === true,
        ads: prefs.personalizedAds === true && !!(window.Ads && window.Ads.adsPersonalisedGranted && window.Ads.adsPersonalisedGranted())
      };
      if (window.Track && window.Track.sync) window.Track.sync();
    }
    syncAnalytics();
    if (window.Ads && window.Ads.setPersonalized) {
      // The shared plugin applies consent asynchronously; refresh Firebase
      // after it settles, reading the latest saved preferences again.
      Promise.resolve(window.Ads.setPersonalized(prefs.personalizedAds === true))
        .then(syncAnalytics).catch(syncAnalytics);
    }
  }

  /* Consent handlers live above with the other privacy helpers. */

  /* Every call site is one line and none of them can fail: Track.event is a
     no-op without consent, and this wrapper tolerates Track being absent
     entirely.

     It matters more than a convenience wrapper usually would. When this was
     deleted while its five callers were left in place, the first of them sits
     at the top of startLevel — so a ReferenceError fired before a single jar
     was drawn and NO level could be opened, in any mode, on any platform. An
     analytics helper took the whole game down with it. */
  function track(name, params) {
    try {
      if (window.Track && window.Track.event) window.Track.event(name, params);
    } catch (e) { /* analytics must never break play */ }
  }

/* ── js/app.js L2193-2196: inside onKey(): Escape on the reminder offer ── */
    if (!$('reminder-offer').hidden) {
      if (e.key === 'Escape') closeReminderOffer();
      return;
    }

/* ── js/app.js L2204-2217: inside onKey(): Escape on the privacy modals (first-run one only once answered) ── */
    if (!$('privacy').hidden) {
      if (e.key === 'Escape' && prefs.analytics !== null) {
        $('privacy').hidden = true;
        openModal('settings-modal', 'settings-close');
      }
      return;
    }
    if (!$('privacy-data').hidden) {
      if (e.key === 'Escape') {
        $('privacy-data').hidden = true;
        openModal('settings-modal', 'settings-close');
      }
      return;
    }
