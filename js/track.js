/* track.js — optional, consented analytics.
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

  /* Paste the GA4 measurement id here — the "G-" one from Admin → Data
     Streams. Left empty the whole file is inert: the banner never appears,
     no script is fetched, and every event() is a no-op. */
  var MEASUREMENT_ID = '';

  var loaded = false;

  function configured() { return !!MEASUREMENT_ID; }

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
