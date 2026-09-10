/* track.js — optional, consented analytics.
 *
 * Two backends, one call surface. On the web build events go to a GA4 Web
 * stream via gtag.js. On the iOS and Android builds they go through the
 * Capacitor Firebase Analytics plugin to the same GA4 property's app streams
 * (configured by GoogleService-Info.plist / google-services.json). configured()
 * hides that split from every caller — Track.event(), Track.load(),
 * Track.unload() do the right thing on either platform.
 *
 * Nothing runs until somebody has said yes. GA4 sets cookies and Firebase
 * writes an install id, both of which UK PECR and GDPR require consent for
 * BEFORE anything is stored — which is why native SDK collection defaults to
 * OFF (see AndroidManifest.xml and Info.plist flags) and gtag.js is injected
 * on acceptance rather than at page load.
 *
 * Every call is safe to make at any time. Before consent, or with no
 * measurement id set / no Firebase plugin registered, or if the script is
 * blocked, event() does nothing and throws nothing: a tracking failure must
 * never cost somebody their game.
 */
(function (global) {
  'use strict';

  /* The GA4 measurement id — the "G-" one from Admin → Data Streams, and the
     WEB stream's, since that is the only kind gtag.js can talk to. Set this
     back to '' and the web branch goes inert: no script is fetched and every
     web event() is a no-op. Native events still flow through Firebase.

     Not a secret. A measurement id is readable in the source of every page
     that uses it; what protects the property is the domain filter in GA4, not
     the id being hidden. */
  var MEASUREMENT_ID = 'G-M7W3D4267P';

  /* Two flags, not one, and the difference is the whole reason turning the
     setting off and on again works. injected says the script tag has been
     added, which can only happen once per page; enabled says events should be
     sent, which flips as often as somebody likes. Collapsing them into one
     flag meant a re-enable re-injected gtag.js. */
  var injected = false, enabled = false;

  /* Checked as a function rather than once at parse time, so it reads
     window.Capacitor when init() runs — by which point the native bridge has
     long been injected. */
  function isNative() { return !!global.Capacitor; }

  /* Configured means "there is a route for analytics on this platform".
     On the web build we need a measurement id; on the native builds the
     Capacitor Firebase Analytics plugin (bridged into JS via registerPlugin)
     is what carries events to the app's Firebase project. */
  function configured() {
    if (isNative()) return !!firebasePlugin();
    return !!MEASUREMENT_ID;
  }

  /* Cached proxy to @capacitor-firebase/analytics's native plugin.  In a
     non-bundled project this is how you get at any Capacitor plugin. */
  var _fb = null;
  function firebasePlugin() {
    if (_fb) return _fb;
    if (!global.Capacitor) return null;
    if (global.Capacitor.registerPlugin) {
      _fb = global.Capacitor.registerPlugin('FirebaseAnalytics');
    } else if (global.Capacitor.Plugins && global.Capacitor.Plugins.FirebaseAnalytics) {
      _fb = global.Capacitor.Plugins.FirebaseAnalytics;
    }
    return _fb;
  }

  /* Turn collection on: after consent, or after somebody switches the setting
     back on. Safe to call repeatedly.

     adsAllowed: pass false when the user has said no to personalized ads, so
     ad-related Consent Mode v2 grants are DENIED even while ANALYTICS_STORAGE
     is GRANTED. Defaults to true when omitted, which keeps every existing
     caller working. */
  async function load(adsAllowed) {
    if (!configured()) return;
    enabled = true;

    if (isNative()) {
      /* Two flips: the SDK-wide switch, plus the Consent Mode v2 grants that
         Google Analytics reads on every event. Both matter — the deactivation
         flag stops the process from starting at boot, and the consent grants
         tell Google Analytics the event is allowed once it does. */
      var fb = firebasePlugin();
      if (!fb) return;
      var adStatus = adsAllowed === false ? 'DENIED' : 'GRANTED';
      try {
        await fb.setEnabled({ enabled: true });
        if (fb.setConsent) {
          /* @capacitor-firebase/analytics 8.x takes { type, status } per call,
             not an array — four separate awaits to grant/deny each type. */
          await fb.setConsent({ type: 'ANALYTICS_STORAGE',  status: 'GRANTED' });
          await fb.setConsent({ type: 'AD_STORAGE',         status: adStatus });
          await fb.setConsent({ type: 'AD_USER_DATA',       status: adStatus });
          await fb.setConsent({ type: 'AD_PERSONALIZATION', status: adStatus });
        }
      } catch (e) { console.warn('Track: Firebase enable failed', e && e.message); }
      return;
    }

    /* GA reads this flag on every hit, so an opt-out has to be lifted
       explicitly. Leaving it set was why re-enabling used to look like it had
       worked while sending nothing. */
    global['ga-disable-' + MEASUREMENT_ID] = false;
    if (injected) return;
    injected = true;

    global.dataLayer = global.dataLayer || [];
    function gtag() { global.dataLayer.push(arguments); }
    global.gtag = gtag;

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
    /* If it fails — offline, or blocked, which an ad blocker will do as a
       matter of course — stop queueing into an array that will never drain.
       injected goes back to false so a later toggle may try again. */
    s.onerror = function () { enabled = false; injected = false; };
    document.head.appendChild(s);

    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID, {
      /* The game is one page; screens are not URLs, so let the events say
         where somebody is rather than inventing paths for them. */
      send_page_view: true
    });
  }

  /* Turned off after having been on: stop sending, and ask GA to drop what it
     holds. The script cannot be un-injected without a reload, so the flag is
     what actually stops the events. */
  async function unload() {
    if (isNative()) {
      var fb = firebasePlugin();
      if (fb) {
        try {
          await fb.setEnabled({ enabled: false });
          if (fb.setConsent) {
            await fb.setConsent({ type: 'ANALYTICS_STORAGE',  status: 'DENIED' });
            await fb.setConsent({ type: 'AD_STORAGE',         status: 'DENIED' });
            await fb.setConsent({ type: 'AD_USER_DATA',       status: 'DENIED' });
            await fb.setConsent({ type: 'AD_PERSONALIZATION', status: 'DENIED' });
          }
        } catch (e) { /* nothing to do */ }
      }
      enabled = false;
      return;
    }
    if (configured()) global['ga-disable-' + MEASUREMENT_ID] = true;
    enabled = false;
  }

  function event(name, params) {
    if (!enabled) return;
    if (isNative()) {
      var fb = firebasePlugin();
      if (fb) {
        /* Firebase Analytics parameter names are limited to 40 chars and
           values to 100.  Trim quietly rather than reject. */
        var safe = {};
        if (params) for (var k in params) {
          if (Object.prototype.hasOwnProperty.call(params, k)) {
            safe[String(k).slice(0, 40)] = typeof params[k] === 'string'
              ? params[k].slice(0, 100) : params[k];
          }
        }
        fb.logEvent({ name: name, params: safe }).catch(function () {});
      }
      return;
    }
    if (!global.gtag) return;
    try { global.gtag('event', name, params || {}); }
    catch (e) { /* analytics must never break play */ }
  }

  global.Track = {
    configured: configured,
    load: load,
    unload: unload,
    event: event,
    get id() { return isNative() ? 'firebase' : MEASUREMENT_ID; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
