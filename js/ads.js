"use strict";
/* App-specific Unity configuration and frequency policy. SDK lifecycle,
 * consent signals, ATT and playback live in the shared package. */
(function () {
  /* The shared package arrives as vendor/unity-ads.js, a file the build
   * scripts generate and git ignores. Anywhere the page is served without
   * that step (the repository root on a static host, a checkout opened before
   * `npm run web:sync`) the script is a 404 and PoliteCarrotAds is undefined.
   * This file then used to throw on its first line, window.Ads never existed,
   * and the first finished level threw before its stars were saved or its
   * win card shown. Ads are optional; the game is not. Without the package,
   * every call below quietly does nothing. */
  function noAds() {
    var state = { platform: 'web', ready: false, personalized: false, attStatus: null,
      effectivePersonalized: false, prepared: { interstitial: false } };
    return {
      state: function () { return state; },
      init: function () { return Promise.resolve(false); },
      prepareInterstitial: function () { return Promise.resolve({ loaded: false, reason: 'ads package missing' }); },
      showInterstitial: function () { return Promise.resolve({ shown: false, reason: 'ads package missing' }); },
      setPersonalized: function (on) { state.personalized = on === true; return Promise.resolve(); },
      requestTracking: function () { return Promise.resolve(null); }
    };
  }
  var factory = window.PoliteCarrotAds && window.PoliteCarrotAds.createUnityAds;
  if (!factory && window.Capacitor && window.Capacitor.isNativePlatform &&
      window.Capacitor.isNativePlatform()) {
    console.warn('Ads: vendor/unity-ads.js did not load, so this build shows no ads. Run `npm run sync`.');
  }
  var client = factory ? factory({
    ios: { gameId: "800379629", interstitial: "BP_Interstitial_iOS" },
    android: { gameId: "800384183", interstitial: "BP_Interstitial_Android" },
    testMode: false,
  }) : noAds();
  var MIN_MILLIS = 2 * 60 * 1000;
  var MIN_LEVELS = 3;
  var lastShownAt = Date.now();
  var levelsSinceLast = 0;
  var preparing = null;
  var showing = false;
  var attPromise = null;

  function getPlatform() { return client.state().platform; }
  function isNative() { return getPlatform() === 'ios' || getPlatform() === 'android'; }
  function warn(error) { console.warn('Ads:', error && error.message || error); }
  /* Bought "Remove Ads" (js/purchases.js): Unity is never started, nothing is
   * loaded or shown. Read live, so a purchase or a refund mid-session takes
   * effect on the next level without a restart. */
  function removed() {
    return !!(window.Purchases && window.Purchases.adsRemoved && window.Purchases.adsRemoved());
  }
  function init() {
    return removed() ? Promise.resolve(false) : client.init();
  }

  function warm() {
    if (!isNative() || showing || removed()) return Promise.resolve(false);
    if (preparing) return preparing;
    preparing = client.prepareInterstitial().then(function (result) {
      if (!result.loaded) warn(result.reason);
      return result.loaded === true;
    }).catch(function (error) {
      warn(error);
      return false;
    }).finally(function () { preparing = null; });
    return preparing;
  }

  function noteLevelComplete() {
    if (!isNative() || removed()) return;
    levelsSinceLast += 1;
    if (levelsSinceLast >= MIN_LEVELS - 1 && !client.state().prepared.interstitial) warm();
  }

  async function maybeShowInterstitial() {
    if (!isNative() || showing || removed() || levelsSinceLast < MIN_LEVELS ||
        Date.now() - lastShownAt < MIN_MILLIS) return false;
    // Never wait for an ad to load in the Next Level button handler.
    if (!client.state().prepared.interstitial) { warm(); return false; }
    showing = true;
    try {
      var result = await client.showInterstitial();
      if (!result.shown) { warn(result.reason); return false; }
      lastShownAt = Date.now();
      levelsSinceLast = 0;
      return true;
    } catch (error) {
      warn(error);
      return false;
    } finally {
      showing = false;
      warm();
    }
  }

  async function setPersonalized(on) {
    try {
      if (client.state().personalized !== (on === true)) {
        await client.setPersonalized(on === true);
      }
      if (isNative() && client.state().ready) warm();
    } catch (error) { warn(error); }
  }

  function ensureAtt(mayPrompt) {
    if (getPlatform() !== 'ios') return Promise.resolve(null);
    if (attPromise) return attPromise;
    // Prompt only from the app's existing onboarding/settings actions.
    attPromise = (mayPrompt ? client.requestTracking() : init().then(function () {
      return client.state().attStatus;
    })).catch(function (error) {
      warn(error);
      return null;
    }).finally(function () { attPromise = null; });
    return attPromise;
  }

  function adsPersonalisedGranted() { return client.state().effectivePersonalized; }
  window.Ads = {
    init: init,
    isNative: isNative,
    getPlatform: getPlatform,
    setPersonalized: setPersonalized,
    ensureAtt: ensureAtt,
    requestTracking: function () { return ensureAtt(true); },
    adsPersonalisedGranted: adsPersonalisedGranted,
    noteLevelComplete: noteLevelComplete,
    maybeShowInterstitial: maybeShowInterstitial,
    warm: warm,
    consentState: client.state,
  };
  window.__consentDebug = function () {
    var state = client.state();
    return { attStatus: state.attStatus, personalizedAds: state.personalized,
      unityConsent: state.effectivePersonalized, granted: state.effectivePersonalized };
  };
})();
