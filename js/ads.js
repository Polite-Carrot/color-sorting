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
    personalized: false,
    adConsentResolved: false,
    adConsent: { canRequestAds: true, npa: false, canChange: false },
    attStatus: null,
    attPromise: null,
    umpPromise: null,
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
      /* SDK initialisation ONLY. Neither UMP nor ATT happens here, and that
       * separation is the point rather than tidiness: on a review device the
       * ad SDK often fails to start and the region may refuse ads, so
       * anything sharing a try block with initialize() is at risk of never
       * running. Apple's prompt must not be one of those things — a reviewer
       * who never sees it files "unable to locate the App Tracking
       * Transparency permission request" under Guideline 2.1.
       *
       * app.js drives the three steps in order — UMP, then ATT, then this —
       * each with its own error handler. See runConsentGates there. */
      try {
        await AdMob.initialize({
          initializeForTesting: isTestAdId(state.interstitialId),
        });
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
  async function runUmp(refresh) {
    var AdMob = getPlugin();
    if (!AdMob || !isNative() || !AdMob.requestConsentInfo) return state.adConsent;
    if (refresh) state.umpPromise = null;
    if (state.umpPromise) return state.umpPromise;
    state.umpPromise = (async function () {
      try {
        var opts = {};
        if (DEBUG_GEOGRAPHY) opts.debugGeography = DEBUG_GEOGRAPHY;
        var info = await AdMob.requestConsentInfo(opts);
        if (info && info.status === "REQUIRED" && info.isConsentFormAvailable) {
          try { info = (await AdMob.showConsentForm()) || info; } catch (e) {}
        }
        state.adConsent = {
          canRequestAds: !info || info.canRequestAds !== false,
          npa: !(info && (info.status === "OBTAINED" || info.status === "NOT_REQUIRED")),
          canChange: !!(info && info.privacyOptionsRequirementStatus === "REQUIRED"),
        };
        state.adConsentResolved = true;
      } catch (e) {
        state.adConsent = { canRequestAds: true, npa: true, canChange: false };
        state.adConsentResolved = true;
      }
      return state.adConsent;
    })();
    return state.umpPromise;
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
    var AdMob = getPlugin();
    if (!AdMob || !isNative()) return null;
    if (getPlatform() === "android") return null;
    if (state.attPromise) return state.attPromise;
    state.attPromise = (async function () {
      try {
        var tt = await AdMob.trackingAuthorizationStatus();
        state.attStatus = (tt && tt.status) || "notDetermined";
        if (state.attStatus === "notDetermined" && mayPrompt) {
          await AdMob.requestTrackingAuthorization();
          tt = await AdMob.trackingAuthorizationStatus();
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

  /* What is ACTUALLY happening, as opposed to what was stored. The Settings
   * toggle shows this: if iOS or the UMP form has denied tracking, a switch
   * reading "On" would be a lie. Resolves to one of:
   *   'off'        the player has not turned it on
   *   'on'         stored on and nothing is blocking it
   *   'att-denied' stored on, but the player refused Apple's prompt
   *   'att-unasked' stored on, but the prompt has not been answered yet
   *   'web'        not a native build, so there are no ads at all */
  /* state.platform is only set by init(), which may not have run — or may
     have failed. Read it live instead. */
  function getPlatform() {
    try { return window.Capacitor.getPlatform(); } catch (e) { return null; }
  }

  function adsPersonalisedGranted() {
    if (!state.adConsentResolved || !state.personalized) return false;
    if (getPlatform() === "ios" && state.attStatus !== "authorized") return false;
    return !state.adConsent.npa;
  }

  function adNpa() {
    return !state.adConsentResolved || !state.personalized || state.adConsent.npa ||
      (getPlatform() === "ios" && state.attStatus !== "authorized");
  }

  /* Called once per prepared ad.  On success `freq.prepared` flips true;
   * after each show it flips false and prepare has to be called again. */
  async function prepareInterstitial() {
    if (!(await init())) return false;
    if (state.adConsentResolved && !state.adConsent.canRequestAds) {
      /* Google's UMP says we may not request ads. This is almost always one
       * thing: consent is REQUIRED for this player's region and has not been
       * obtained, because no consent message is published in the AdMob console
       * under Privacy & messaging — so requestConsentInfo reports
       * isConsentFormAvailable false, runUmp has no form to show, and consent
       * can never be given.
       *
       * It used to return here silently, which made a completely dead
       * integration look like a healthy one: the SDK initialises, the log says
       * so, and then nothing is ever requested. Say it out loud instead. */
      console.warn(
        "Ads: UMP says ads cannot be requested (canRequestAds false). " +
        "Publish a consent message in AdMob > Privacy & messaging, or set " +
        "DEBUG_GEOGRAPHY = 'NOT_EEA' in js/ads.js to confirm that is the cause.",
      );
      return false;
    }
    if (freq.prepared) return true;
    if (freq.preparing) return freq.preparing;

    freq.preparing = (async function () {
      try {
        var opts = {
          adId: state.interstitialId,
          isTesting: isTestAdId(state.interstitialId),
        };
        opts.npa = adNpa();
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
    runUmp: runUmp,
    requestTracking: requestTracking,
    ensureAtt: ensureAtt,
    getPlatform: getPlatform,
    showPrivacyOptionsForm: async function () {
      var AdMob = getPlugin();
      if (!AdMob || !AdMob.showPrivacyOptionsForm) return false;
      await AdMob.showPrivacyOptionsForm();
      await runUmp(true);
      return true;
    },
    adsPersonalisedGranted: adsPersonalisedGranted,
    adNpa: adNpa,
    /* Readable from Safari Web Inspector while the app runs, which is the
       quickest way to find out whether UMP is blocking requests:
         window.Ads.consentState()   ->  { canRequestAds: false, ... } */
    consentState: function () {
      return { resolved: state.adConsentResolved, adConsent: state.adConsent,
               ready: state.ready, platform: getPlatform(),
               interstitialId: state.interstitialId, prepared: freq.prepared };
    },
    /* init + a real ad request, on demand. Defined all along but never
       exported, so there was no way to fire a request without playing. */
    warm: warm,
  };

  window.__consentDebug = function () {
    return {
      adConsentResolved: state.adConsentResolved,
      adConsent: state.adConsent,
      attStatus: state.attStatus,
      personalizedAds: state.personalized,
      granted: adsPersonalisedGranted(),
    };
  };

  /* Warming up the first interstitial is worth doing early, but NOT at boot.
   * init() runs Google's UMP consent form, and at boot that form would land
   * on top of — or just before — this game's own privacy dialog, which is
   * both a confusing thing to hand a player and a bad thing to show a
   * reviewer. The player answers ours first; app.js then calls Ads.warm(),
   * and UMP follows.
   *
   * Nothing is lost by waiting: the first interstitial cannot show until two
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
