"use strict";
/* AdMob wrapper for the game.  Only interstitial ads: the banner and
 * rewarded formats the plugin also supports are not called from anywhere.
 *
 * The frequency cap is deliberately gentle for a puzzle game — one
 * interstitial fires when BOTH conditions have been met since the last
 * one shown:
 *   - at least two minutes of wall-clock time have elapsed, AND
 *   - at least three levels have been completed.
 *
 * "Whichever comes last" was the ask: three levels in ninety seconds does
 * not fire yet; two minutes on the level-select screen also does not fire.
 * Only both together do.
 *
 * INTERSTITIAL_IDS below are production ad unit IDs. Google's official test
 * IDs are kept commented-out immediately above so anyone bringing up a dev
 * build can flip to them without hunting for the values. isTestAdId() below
 * autodetects Google's test-publisher prefix and turns SDK-side test mode
 * on/off from that alone, so either set Just Works.
 *
 * Testing on a device that is running the production build: register the
 * device's AdMob test-device ID (printed to the native console the first
 * time an ad request goes out) in the AdMob console under Settings > Test
 * devices. That device then sees test creatives even with production IDs,
 * which is what Google's own policy requires so testers don't rack up
 * invalid clicks on the real account.
 *
 * The module is a no-op on the web build (no window.Capacitor), so
 * index.html still opens cleanly in a browser during development. */

(function () {
  /* Interstitial AD UNIT IDs — NOT app IDs. App IDs live in the native
   * manifests (AndroidManifest.xml APPLICATION_ID, Info.plist
   * GADApplicationIdentifier) and are distinct values from the AdMob
   * console for each app; ad unit IDs are what you get when you create an
   * ad unit UNDER an app in the AdMob console. Google's official test IDs
   * are kept commented-out below — flip which pair is active for local dev. */
  var INTERSTITIAL_IDS = {
    // android: 'ca-app-pub-3940256099942544/1033173712',
    // ios:     'ca-app-pub-3940256099942544/4411468910',
    // RELEASE BUILD PROD INTERSTITIAL IDS - COMMENTED OUT FOR TESTING
    android: "ca-app-pub-2022992563510125/9178880771",
    ios: "ca-app-pub-2022992563510125/8139856189",
  };

  var MIN_MILLIS = 2 * 60 * 1000; /* two minutes between ads */
  var MIN_LEVELS = 3; /* three level completions between ads */

  /* Google's official test-ad publisher prefix. If the interstitial ID sits
   * under it, we send isTesting: true on every request so the AdMob SDK
   * routes to test creatives and can't accidentally count self-clicks
   * against the real account. Real ad unit IDs skip both test flags and
   * get real ad fills. */
  var TEST_PUBLISHER_PREFIX = "ca-app-pub-3940256099942544";
  function isTestAdId(id) {
    return typeof id === "string" && id.indexOf(TEST_PUBLISHER_PREFIX) === 0;
  }

  /* Google's UMP normally decides whether the GDPR consent form is required
   * from the device's real geolocation.  For QA on a device not physically
   * in the EEA/UK, flip this to 'EEA' to force the form to appear, or
   * 'NOT_EEA' to force it away.  Leave null in shipped builds. */
  var DEBUG_GEOGRAPHY = null;

  var state = {
    plugin: null,
    ready: false /* AdMob SDK initialised */,
    initializing: null /* Promise while init is in flight */,
    platform: null,
    interstitialId: null,
    /* Personalized ads by default; app.js flips this from the privacy modal.
     * When true, AdMob picks based on UMP/ATT; when false we set npa: 1 on
     * every ad request so Google is told to serve non‑personalized ads even
     * if UMP thinks consent was granted. */
    personalized: true,
  };

  var freq = {
    /* Count wall-clock time from module load so the first ad cannot fire
     * inside the opening two minutes of play.  This is what stops a fresh
     * install from being interrupted before the player has seen anything. */
    lastShownAt: Date.now(),
    levelsSinceLast: 0,
    prepared: false /* an interstitial has been loaded and is ready */,
    preparing: null /* Promise while a prepare call is in flight */,
  };

  function isNative() {
    return !!(
      window.Capacitor &&
      window.Capacitor.isNativePlatform &&
      window.Capacitor.isNativePlatform()
    );
  }

  function getPlugin() {
    if (state.plugin) return state.plugin;
    if (!window.Capacitor) return null;
    if (window.Capacitor.registerPlugin) {
      state.plugin = window.Capacitor.registerPlugin("AdMob");
    } else if (window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) {
      state.plugin = window.Capacitor.Plugins.AdMob;
    }
    return state.plugin;
  }

  async function init() {
    if (!isNative()) return false;
    if (state.ready) return true;
    if (state.initializing) return state.initializing;

    var AdMob = getPlugin();
    if (!AdMob) {
      console.warn("Ads: AdMob plugin proxy unavailable");
      return false;
    }
    state.platform = window.Capacitor.getPlatform();
    state.interstitialId =
      INTERSTITIAL_IDS[state.platform] || INTERSTITIAL_IDS.android;

    state.initializing = (async function () {
      /* Order matters here.  UMP first: it works out whether the user is in
       * a GDPR/CCPA jurisdiction and, if so, shows the consent form and
       * records the choice.  ATT after: iOS-only tracking prompt.  Then
       * initialize() so the SDK loads with whatever consent state is set —
       * personalised or non-personalised ads follow from that automatically. */
      await ensureConsent(AdMob);
      await ensureTrackingAuthorization(AdMob);
      await AdMob.initialize({
        initializeForTesting: isTestAdId(state.interstitialId),
      });
      state.ready = true;
      console.info(
        "Ads: initialised on",
        state.platform,
        isTestAdId(state.interstitialId) ? "(test mode)" : "(production)",
      );
      return true;
    })();
    return state.initializing;
  }

  /* Google's UMP consent flow.  Reads the geo-lookup and, when required by
   * GDPR (or the equivalent state laws — CCPA, etc), presents the message
   * you built in AdMob console > Privacy & messaging.  If no message is
   * published, requestConsentInfo returns NOT_REQUIRED and this becomes a
   * no-op.  Any error is swallowed so a broken consent flow can never keep
   * the game from booting. */
  async function ensureConsent(AdMob) {
    try {
      var opts = {};
      if (DEBUG_GEOGRAPHY) opts.debugGeography = DEBUG_GEOGRAPHY;
      var info = await AdMob.requestConsentInfo(opts);
      console.info("Ads: consent status", info && info.status);
      if (info && info.status === "REQUIRED" && info.isConsentFormAvailable) {
        await AdMob.showConsentForm();
        console.info("Ads: consent form dismissed");
      }
    } catch (e) {
      console.warn(
        "Ads: UMP failed, continuing without consent form:",
        e && e.message,
      );
    }
  }

  /* iOS 14.5+ needs an explicit ATT prompt before IDFA is available.
   * Android silently no-ops the tracking calls. */
  async function ensureTrackingAuthorization(AdMob) {
    try {
      var tt = await AdMob.trackingAuthorizationStatus();
      if (tt && tt.status === "notDetermined") {
        await AdMob.requestTrackingAuthorization();
      }
    } catch (e) {
      /* not iOS, or old SDK — ignore */
    }
  }

  /* Called once per prepared ad.  On success `freq.prepared` flips true;
   * after each show it flips false and prepare has to be called again. */
  async function prepareInterstitial() {
    if (!(await init())) return false;
    if (freq.prepared) return true;
    if (freq.preparing) return freq.preparing;

    freq.preparing = (async function () {
      try {
        var opts = {
          adId: state.interstitialId,
          isTesting: isTestAdId(state.interstitialId),
        };
        if (!state.personalized) opts.npa = true;
        await state.plugin.prepareInterstitial(opts);
        freq.prepared = true;
        return true;
      } catch (e) {
        console.warn("Ads: prepareInterstitial failed", e && e.message);
        freq.prepared = false;
        return false;
      } finally {
        freq.preparing = null;
      }
    })();
    return freq.preparing;
  }

  /* Called from the win-card handler once per level completed.  If the
   * player is one level short of the threshold, start preparing the next
   * ad in the background so `maybeShowInterstitial()` does not have to
   * wait for network when it fires. */
  function noteLevelComplete() {
    if (!isNative()) return;
    freq.levelsSinceLast += 1;
    if (
      freq.levelsSinceLast >= MIN_LEVELS - 1 &&
      !freq.prepared &&
      !freq.preparing
    ) {
      /* Fire-and-forget: preload the next ad. */
      prepareInterstitial();
    }
  }

  /* Called when the game is about to change screens.  If both conditions
   * are met, shows the interstitial and resets the counters.  Otherwise
   * returns immediately.  Always returns a Promise so the caller can
   * `await` it uniformly. */
  async function maybeShowInterstitial() {
    if (!isNative()) return false;
    var enoughTime = Date.now() - freq.lastShownAt >= MIN_MILLIS;
    var enoughLevels = freq.levelsSinceLast >= MIN_LEVELS;
    if (!enoughTime || !enoughLevels) return false;

    if (!freq.prepared && !(await prepareInterstitial())) return false;

    try {
      await state.plugin.showInterstitial();
      freq.lastShownAt = Date.now();
      freq.levelsSinceLast = 0;
      freq.prepared = false;
      /* Line up the next one immediately so the next threshold has an ad
       * ready without waiting for prepare. */
      prepareInterstitial();
      return true;
    } catch (e) {
      console.warn("Ads: showInterstitial failed", e && e.message);
      freq.prepared = false;
      return false;
    }
  }

  /* Called from the privacy modal Save button.  If the flag flips, any ad
   * currently warmed was requested under the old flag and is no longer
   * appropriate: drop it and prepare a fresh one so the next
   * maybeShowInterstitial reflects the choice. */
  function setPersonalized(on) {
    var next = !!on;
    if (state.personalized === next) return;
    state.personalized = next;
    if (!isNative()) return;
    freq.prepared = false;
    /* Fire‑and‑forget re-warm. */
    prepareInterstitial();
  }

  window.Ads = {
    init: init,
    isNative: isNative,
    noteLevelComplete: noteLevelComplete,
    maybeShowInterstitial: maybeShowInterstitial,
    setPersonalized: setPersonalized,
  };

  /* On native, initialise AdMob once at boot so the ATT prompt happens
   * upfront rather than mid-play, and start warming the first interstitial
   * so the third level completion has one ready to show. */
  if (isNative()) {
    var warm = function () {
      init().then(function (ok) {
        if (ok) prepareInterstitial();
      });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", warm, { once: true });
    } else {
      warm();
    }
  }
})();
