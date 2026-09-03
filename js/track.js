/* track.js — optional, consented analytics. WEB ONLY.
 *
 * This is the GA4 *Web* data stream and nothing else. A GA4 property's iOS and
 * Android streams cannot be fed from here at all — they are Firebase streams,
 * configured by GoogleService-Info.plist and google-services.json in ios/ and
 * android/, and they need the Firebase SDK rather than gtag.js.
 *
 * That distinction has to be enforced, not just described. sync-web.js copies
 * every script the page names into www/, and Capacitor copies www/ into both
 * native shells, so this file physically ships inside the apps. Without the
 * Capacitor check in configured() below, setting a measurement id would tag
 * app sessions into the web stream and count them twice.
 *
 * Nothing here runs until somebody has said yes. GA4 sets cookies, which are
 * not strictly necessary to play a puzzle, so under UK PECR they need consent
 * BEFORE anything is stored — which is why the tag is injected on acceptance
 * rather than loaded on page load and told to stay quiet.
 *
 * Every call is safe to make at any time. Before consent, or with no
 * measurement id set, or if the script is blocked, event() does nothing and
 * throws nothing: a tracking failure must never cost somebody their game.
 */
(function (global) {
  'use strict';

  /* The GA4 measurement id — the "G-" one from Admin → Data Streams, and the
     WEB stream's, since that is the only kind gtag.js can talk to. Set this
     back to '' and the whole file goes inert again: the banner never appears,
     no script is fetched, and every event() is a no-op.

     Not a secret. A measurement id is readable in the source of every page
     that uses it; what protects the property is the domain filter in GA4, not
     the id being hidden. */
  var MEASUREMENT_ID = 'G-M7W3D4267P';

  var loaded = false;

  /* The one gate everything else passes through: the consent banner is only
     offered when this is true (app.js maybeAskConsent), load() refuses when it
     is false, and event() cannot fire because nothing ever set loaded. So the
     native build asks nothing, fetches nothing and stores nothing.

     Checked here as a function rather than once at parse time, so it reads
     window.Capacitor when init() runs — by which point the native bridge has
     long been injected. */
  function configured() { return !!MEASUREMENT_ID && !global.Capacitor; }

  /* Inject gtag.js. Called once, only after consent. */
  function load() {
    if (loaded || !configured()) return;
    loaded = true;

    global.dataLayer = global.dataLayer || [];
    function gtag() { global.dataLayer.push(arguments); }
    global.gtag = gtag;

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
    /* If it fails — offline, blocked, a native shell with no network — the
       queue simply never drains. Nothing else notices. */
    s.onerror = function () { loaded = false; };
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
  function unload() {
    if (configured() && global.gtag) {
      global['ga-disable-' + MEASUREMENT_ID] = true;
    }
    loaded = false;
  }

  function event(name, params) {
    if (!loaded || !global.gtag) return;
    try { global.gtag('event', name, params || {}); }
    catch (e) { /* analytics must never break play */ }
  }

  global.Track = {
    configured: configured,
    load: load,
    unload: unload,
    event: event,
    get id() { return MEASUREMENT_ID; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
