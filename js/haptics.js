"use strict";
/* Touch feedback for the phone builds, through @capacitor/haptics.
 *
 * Four feels, named for what happened in the game rather than for the motor:
 *   pick()  a jar lifted or put back      light tap
 *   pour()  liquid landed                 medium tap
 *   nope()  that move is not allowed      warning buzz
 *   win()   the big jar is full           success pattern
 *
 * Every call is fire-and-forget and swallows its own errors: a phone with the
 * vibration motor off, a tablet without one, or the web build (where there is
 * no plugin at all) must cost the game nothing. Nothing here is awaited by a
 * caller, so a slow or failing motor can never hold up a pour.
 *
 * The switch lives in Settings as "Vibration" and is on by default, the same
 * way sound is. app.js owns the stored preference and calls setEnabled(). */

(function () {
  var plugin = null;
  var enabled = true;

  function available() {
    try {
      var C = window.Capacitor;
      if (!C || !C.isNativePlatform || !C.isNativePlatform()) return false;
      var p = C.getPlatform();
      return p === "ios" || p === "android";
    } catch (e) { return false; }
  }

  function get() {
    if (plugin || !available()) return plugin;
    var C = window.Capacitor;
    if (C.registerPlugin) plugin = C.registerPlugin("Haptics");
    else if (C.Plugins) plugin = C.Plugins.Haptics;
    return plugin;
  }

  function fire(method, options) {
    if (!enabled) return;
    var H = get();
    if (!H || !H[method]) return;
    try {
      var r = H[method](options);
      if (r && r.catch) r.catch(function () {});
    } catch (e) { /* feedback is never worth an error */ }
  }

  window.Haptics = {
    available: available,
    setEnabled: function (on) { enabled = on !== false; },
    isEnabled: function () { return enabled; },
    pick: function () { fire("impact", { style: "LIGHT" }); },
    pour: function () { fire("impact", { style: "MEDIUM" }); },
    nope: function () { fire("notification", { type: "WARNING" }); },
    win: function () { fire("notification", { type: "SUCCESS" }); },
  };
})();
