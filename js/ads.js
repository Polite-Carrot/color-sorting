"use strict";
/* Unity Ads wrapper for the game — one backend on both platforms.
 *
 * Only interstitial ads: the banner and rewarded formats Unity also
 * supports are not called from anywhere.
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
 * Consent is this game's own personalised-ads toggle, combined on iOS with
 * Apple's tracking answer. There is no Google UMP: Unity takes a single
 * boolean through setConsent, re-sent before every load so it can never lag
 * behind a late ATT answer.
 *
 * Testing on a device that is running the production build: register the
 * device under Unity dashboard > Testing > Test devices, which serves test
 * creatives without touching the IDs below.
 *
 * The module is a no-op on the web build (no window.Capacitor), so
 * index.html still opens cleanly in a browser during development. */

(function () {
  /* Game IDs and placements come from the Unity dashboard (Monetization >
   * Ad Units). Unity issues a SEPARATE game ID per platform — using the wrong
   * one initialises fine and then serves nothing, or pays another app.
   *
   * testMode false enables production ad requests. */
  var UNITY = {
    ios: { gameId: "800379629", placementId: "BP_Interstitial_iOS" },
    android: { gameId: "800384183", placementId: "BP_Interstitial_Android" },
    testMode: false,
  };

  /* Both thresholds must be met before showing the next interstitial. */
  var MIN_MILLIS = 2 * 60 * 1000;
  var MIN_LEVELS = 3;

  /* A blocked or intercepted network leaves Unity's initialize and load
   * callbacks pending indefinitely rather than failing. The win card awaits
   * this module before moving to the next level, so every native call gets a
   * deadline: an ad that cannot load must cost a pause, never the level. */
  var NATIVE_TIMEOUT_MS = 10000;
  var TIMED_OUT = {};

  function withTimeout(promise, fallback) {
    var timer;
    return Promise.race([
      promise,
      new Promise(function (resolve) {
        timer = setTimeout(function () { resolve(fallback); }, NATIVE_TIMEOUT_MS);
      }),
    ]).then(
      function (v) { clearTimeout(timer); return v; },
      function (e) { clearTimeout(timer); throw e; }
    );
  }

  var state = {
    plugin: null,
    ready: false /* Unity SDK initialised */,
    initializing: null /* Promise while init is in flight */,
    platform: null,
    placementId: null,
    personalized: false,
    attStatus: null,
    attPromise: null,
    unityConsent: null /* last value sent to Unity's setConsent */,
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

  function unityConfig() {
    return UNITY[getPlatform()] || null;
  }

  function getPlugin() {
    if (state.plugin) return state.plugin;
    if (!window.Capacitor) return null;
    if (window.Capacitor.registerPlugin) {
      state.plugin = window.Capacitor.registerPlugin("UnityAds");
    } else if (window.Capacitor.Plugins && window.Capacitor.Plugins.UnityAds) {
      state.plugin = window.Capacitor.Plugins.UnityAds;
    }
    return state.plugin;
  }

  /* The consent Unity gets is this game's own choice (the personalised-ads
   * toggle) combined with Apple's tracking answer — exactly what
   * adsPersonalisedGranted() computes.  Sent before every ad load, so it can
   * never lag behind a late ATT answer.  Returns true when the value changed,
   * meaning any ad already loaded was requested under the old answer. */
  async function syncUnityConsent() {
    if (!state.plugin) return false;
    var granted = adsPersonalisedGranted();
    if (state.unityConsent === granted) return false;
    try {
      await state.plugin.setConsent({ granted: granted });
      state.unityConsent = granted;
      return true;
    } catch (e) {
      console.warn("Ads: Unity setConsent failed:", e && e.message);
      return false;
    }
  }

  async function init() {
    if (!isNative()) return false;
    if (state.ready) return true;
    if (state.initializing) return state.initializing;

    var Unity = getPlugin();
    if (!Unity) {
      console.warn("Ads: Unity plugin proxy unavailable");
      return false;
    }
    var cfg = unityConfig();
    if (!cfg) {
      console.warn("Ads: no Unity game ID for platform", getPlatform());
      return false;
    }
    state.platform = getPlatform();
    state.placementId = cfg.placementId;

    state.initializing = (async function () {
      /* SDK initialisation ONLY. ATT does not happen here, and that
       * separation is the point rather than tidiness: on a review device the
       * ad SDK often fails to start, so
       * anything sharing a try block with initialize() is at risk of never
       * running. Apple's prompt must not be one of those things — a reviewer
       * who never sees it files "unable to locate the App Tracking
       * Transparency permission request" under Guideline 2.1.
       *
       * app.js drives the steps in order, each with its own error handler.
       * See primeConsent there. */
      try {
        /* Consent goes in before the SDK starts, so not even Unity's own
         * start-up traffic runs under a default "consented" state. */
        await syncUnityConsent();
        var started = await withTimeout(
          Unity.initialize({ gameId: cfg.gameId, testMode: UNITY.testMode }),
          TIMED_OUT
        );
        if (started === TIMED_OUT) throw new Error("initialize timed out");
      } catch (e) {
        /* Resolve false rather than reject. A rejection here used to escape as
         * an unhandled promise rejection — caught by the test that fails the
         * SDK on purpose — because warm() does not return this promise to
         * anyone. An ad SDK that will not start is an ordinary condition on a
         * review device, not an exception for the game to raise. */
        console.warn("Ads: initialize failed:", e && e.message);
        state.ready = false;
        state.initializing = null;   /* let a later attempt try again */
        return false;
      }
      state.ready = true;
      console.info(
        "Ads: initialised on",
        state.platform,
        "via Unity Ads",
        UNITY.testMode ? "(test mode)" : "(production)",
      );
      return true;
    })();
    return state.initializing;
  }

  /* Apple's App Tracking Transparency prompt.
   *
   * Raised for EVERY iOS player, from Continue, whatever the toggles say.
   * The logically clean design is to ask only when personalized ads are
   * turned on — there is nothing to track for otherwise — and that design was
   * rejected under Guideline 2.1: the reviewer left the toggles at their
   * defaults, never saw the prompt, and reported being unable to locate it.
   * The prompt has to be reachable without opting into anything.
   *
   * Fired from a tap, never at cold launch: the prompt cannot display until
   * the app is active and the window is key, and an early call silently
   * no-ops, leaving the status at notDetermined with no prompt ever shown and
   * no second chance — it appears once per install, ever.
   *
   * Android returns before touching the plugin. There is no ATT there, and
   * "never asked on Android" should be true by construction rather than by
   * hoping the plugin no-ops. */
  async function ensureAtt(mayPrompt) {
    var Unity = getPlugin();
    if (!Unity || !isNative()) return null;
    if (getPlatform() === "android") return null;
    if (state.attPromise) return state.attPromise;
    state.attPromise = (async function () {
      try {
        var tt = await Unity.trackingAuthorizationStatus();
        state.attStatus = (tt && tt.status) || "notDetermined";
        if (state.attStatus === "notDetermined" && mayPrompt) {
          await Unity.requestTrackingAuthorization();
          tt = await Unity.trackingAuthorizationStatus();
          state.attStatus = (tt && tt.status) || state.attStatus;
        }
      } catch (e) {
        state.attStatus = "denied";
      }
      return state.attStatus;
    })();
    return state.attPromise;
  }

  function requestTracking() { return ensureAtt(true); }

  /* state.platform is only set by init(), which may not have run — or may
     have failed. Read it live instead. */
  function getPlatform() {
    try { return window.Capacitor.getPlatform(); } catch (e) { return null; }
  }

  /* What is ACTUALLY happening, as opposed to what was stored: on iOS anything
   * short of an explicit yes from Apple's prompt counts as a no, however the
   * in-game toggle is set. */
  function adsPersonalisedGranted() {
    if (!state.personalized) return false;
    if (getPlatform() === "ios" && state.attStatus !== "authorized") return false;
    return true;
  }

  /* Called once per prepared ad.  On success `freq.prepared` flips true;
   * after each show it flips false and prepare has to be called again.
   *
   * Unity resolves {loaded:false} for no-fill rather than rejecting, so the
   * result is read instead of relying on a throw. */
  async function prepareInterstitial() {
    if (!(await init())) return false;
    if (freq.preparing) return freq.preparing;

    freq.preparing = (async function () {
      try {
        var changed = await syncUnityConsent();
        if (freq.prepared && !changed) return true;
        var res = await withTimeout(
          state.plugin.prepareInterstitial({
            placementId: state.placementId,
            force: changed,
          }),
          { loaded: false, reason: "load timed out" }
        );
        freq.prepared = !!(res && res.loaded);
        if (!freq.prepared) {
          console.warn("Ads: Unity load returned no ad:", res && res.reason);
        }
        return freq.prepared;
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

    /* Nothing warmed yet, so skip this slot rather than hold the player on a
       network round trip. noteLevelComplete starts the next one. */
    if (!freq.prepared) { prepareInterstitial(); return false; }

    try {
      var res = await state.plugin.showInterstitial();
      if (!(res && res.shown)) {
        /* Not shown (expired, or failed to present).  Counters stay as they
         * are so the next screen change tries again with a fresh ad. */
        console.warn("Ads: Unity show did not play:", res && res.reason);
        freq.prepared = false;
        prepareInterstitial();
        return false;
      }
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
    if (state.personalized === next) {
      /* The toggle did not move, but Apple's answer may have: re-send the
       * combined value to Unity (a no-op when nothing changed). */
      if (isNative() && state.ready) prepareInterstitial();
      return;
    }
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
    requestTracking: requestTracking,
    ensureAtt: ensureAtt,
    getPlatform: getPlatform,
    adsPersonalisedGranted: adsPersonalisedGranted,
    /* Readable from Safari Web Inspector or chrome://inspect while the app
       runs, which is the quickest way to see why no ad appeared:
         window.Ads.consentState()   ->  { ready: false, ... } */
    consentState: function () {
      return { ready: state.ready, platform: getPlatform(),
               provider: "unity", unityConsent: state.unityConsent,
               placementId: state.placementId, prepared: freq.prepared };
    },
    /* init + a real ad request, on demand. Defined all along but never
       exported, so there was no way to fire a request without playing. */
    warm: warm,
  };

  window.__consentDebug = function () {
    return {
      attStatus: state.attStatus,
      personalizedAds: state.personalized,
      unityConsent: state.unityConsent,
      granted: adsPersonalisedGranted(),
    };
  };

  /* Warming up the first interstitial is worth doing early, but NOT at boot:
   * the player answers this game's own privacy dialog first, and app.js then
   * calls Ads.warm().
   *
   * Nothing is lost by waiting: the first interstitial cannot show until three
   * levels are done and two minutes have passed, which is a long time next to
   * the moment it takes to prepare one. */
  function warm() {
    if (!isNative()) return Promise.resolve(false);
    return init().then(function (ok) {
      return ok ? prepareInterstitial() : false;
    }, function () { return false; });
  }
  window.Ads.warm = warm;
})();
