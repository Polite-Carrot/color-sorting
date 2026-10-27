"use strict";
/* Daily puzzle reminders, as LOCAL notifications (@capacitor/local-notifications).
 *
 * The daily puzzle is built on the phone from the date, so the phone can also
 * schedule its own reminder: no push server, no Firebase Cloud Messaging, no
 * APNs keys, and nothing leaves the device.
 *
 * How it schedules: not one repeating alarm, because a repeating alarm cannot
 * skip a day. Instead the next DAYS_AHEAD days are scheduled one by one, and
 * every time the game opens, comes back to the foreground or a daily is
 * solved, all of them are cancelled and rescheduled from scratch. So:
 *   - today's reminder is dropped as soon as today's puzzle is solved;
 *   - the wording can mention the streak, and is always true when it fires;
 *   - someone who stops playing hears from us for a week and then not again.
 *
 * The player is asked for notification permission only after tapping
 * "Remind me" (offered after their first solved daily, or from Settings),
 * never at launch: iOS lets an app show that system prompt once, ever. */

(function () {
  var PREF_KEY = "colourjars.reminders.v1";
  var CHANNEL = "daily";
  var FIRST_ID = 7100;     /* ids 7100..7100+DAYS_AHEAD-1 belong to this module */
  var DAYS_AHEAD = 7;
  var DEFAULT_HOUR = 18;

  var plugin = null;
  var openHandler = null;
  var channelMade = false;
  var lastDone = {};

  /* on:    true once the player has said yes; false if they turned it off
   * asked: the after-first-daily offer has been shown (shown once only)
   * hour:  0-23, local time */
  var prefs = load();

  function load() {
    var p = { on: false, asked: false, hour: DEFAULT_HOUR };
    try {
      var raw = window.Store && window.Store.read(PREF_KEY);
      if (raw) {
        var v = JSON.parse(raw);
        p.on = v.on === true;
        p.asked = v.asked === true;
        if (typeof v.hour === "number" && v.hour >= 0 && v.hour <= 23) p.hour = v.hour;
      }
    } catch (e) {}
    return p;
  }

  function save() {
    try { window.Store.write(PREF_KEY, JSON.stringify(prefs)); } catch (e) {}
  }

  function platform() {
    try {
      var C = window.Capacitor;
      return C && C.isNativePlatform && C.isNativePlatform() ? C.getPlatform() : "web";
    } catch (e) { return "web"; }
  }

  function available() {
    var p = platform();
    return p === "ios" || p === "android";
  }

  function getPlugin() {
    if (plugin || !available()) return plugin;
    var C = window.Capacitor;
    if (C.registerPlugin) plugin = C.registerPlugin("LocalNotifications");
    else if (C.Plugins) plugin = C.Plugins.LocalNotifications;
    return plugin;
  }

  /* 'granted' | 'denied' | 'prompt' | 'unavailable' */
  async function permission() {
    var LN = getPlugin();
    if (!LN) return "unavailable";
    try {
      var r = await LN.checkPermissions();
      if (r.display === "granted") return "granted";
      if (r.display === "denied") return "denied";
      return "prompt";
    } catch (e) { return "unavailable"; }
  }

  async function ensureChannel() {
    if (channelMade || platform() !== "android") return;
    try {
      await getPlugin().createChannel({
        id: CHANNEL,
        name: "Daily puzzle",
        description: "A reminder when the daily puzzle is ready",
        importance: 3,
      });
      channelMade = true;
    } catch (e) { console.warn("Reminders: channel failed:", e && e.message); }
  }

  /* The notifications to schedule, given the solved-days record. Pure, so it
   * can be tested without a phone. */
  function plan(done, now) {
    var D = window.Daily;
    now = now || new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var todayDone = !!done[D.key(today)];
    /* Streak still alive at the moment today's reminder fires. */
    var streakNow = D.streak(done, today);
    var out = [];
    for (var i = 0; i < DAYS_AHEAD; i++) {
      var day = D.shift(today, i);
      if (i === 0 && todayDone) continue;
      var at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), prefs.hour, 0, 0);
      if (at <= now) continue;
      /* The streak can only be quoted for the next reminder to fire: by the
         one after, the player may have missed a day in between. Today (if
         unsolved) or tomorrow (if today is solved). */
      var next = todayDone ? i === 1 : i === 0;
      var body = next && streakNow >= 2
        ? "Keep your " + streakNow + "-day streak going: today's puzzle is ready."
        : "A new daily puzzle is ready.";
      out.push({
        id: FIRST_ID + i,
        title: "Daily puzzle",
        body: body,
        schedule: { at: at, allowWhileIdle: true },
        /* Inexact: a reminder a few minutes late is fine, and asking for
           exact alarms sends Android 12+ players to a system settings page. */
        isExactNotification: false,
        channelId: CHANNEL,
        smallIcon: "ic_stat_daily",
        iconColor: "#FF5D8F",
        extra: { kind: "daily", day: D.key(day) },
      });
    }
    return out;
  }

  async function cancelAll() {
    var LN = getPlugin();
    if (!LN) return;
    var ids = [];
    for (var i = 0; i < DAYS_AHEAD; i++) ids.push({ id: FIRST_ID + i });
    try { await LN.cancel({ notifications: ids }); } catch (e) {}
  }

  var syncing = Promise.resolve();
  /* Cancel and reschedule from the current progress. Safe to call often;
   * calls queue rather than overlap. */
  function sync(done) {
    if (done) lastDone = done;
    syncing = syncing.then(async function () {
      var LN = getPlugin();
      if (!LN) return;
      await cancelAll();
      if (!prefs.on || (await permission()) !== "granted") return;
      await ensureChannel();
      var list = plan(lastDone);
      if (!list.length) return;
      try {
        await LN.schedule({ notifications: list });
      } catch (e) {
        console.warn("Reminders: schedule failed:", e && e.message);
      }
    }).catch(function () {});
    return syncing;
  }

  /* Turn reminders on, asking for permission if it has not been asked yet.
   * Resolves to 'on', 'denied' (blocked in system settings: the caller should
   * say where to change it) or 'unavailable' (web). */
  async function enable(done) {
    var LN = getPlugin();
    if (!LN) return "unavailable";
    prefs.asked = true;
    var p = await permission();
    if (p === "prompt") {
      try {
        var r = await LN.requestPermissions();
        p = r.display === "granted" ? "granted" : "denied";
      } catch (e) { p = "denied"; }
    }
    prefs.on = p === "granted";
    save();
    await sync(done);
    return prefs.on ? "on" : "denied";
  }

  async function disable() {
    prefs.on = false;
    prefs.asked = true;
    save();
    await sync();
  }

  function setHour(h, done) {
    h = Number(h);
    if (!(h >= 0 && h <= 23)) return Promise.resolve();
    prefs.hour = h;
    save();
    return sync(done);
  }

  /* The offer after the first solved daily: shown once per install, only
   * where notifications exist, and only if the system has not already said
   * no (a prompt that cannot appear is a broken button). */
  async function shouldOffer() {
    if (!available() || prefs.asked || prefs.on) return false;
    /* 'granted' too: Android 12 and older have no runtime prompt, so they
       report granted from the start and the offer is the only question. */
    var p = await permission();
    return p === "prompt" || p === "granted";
  }

  function markOffered() { prefs.asked = true; save(); }

  /* fn(dayKey) runs when the player taps a reminder. Taps that cold-start the
   * app are held by the plugin until this listener is attached. */
  function onOpen(fn) {
    openHandler = fn;
    var LN = getPlugin();
    if (!LN || !LN.addListener) return;
    try {
      LN.addListener("localNotificationActionPerformed", function (e) {
        var extra = e && e.notification && e.notification.extra;
        if (extra && extra.kind === "daily" && openHandler) openHandler(extra.day);
      });
    } catch (e) {}
  }

  window.Reminders = {
    available: available,
    state: function () { return { on: prefs.on, asked: prefs.asked, hour: prefs.hour }; },
    permission: permission,
    enable: enable,
    disable: disable,
    setHour: setHour,
    sync: sync,
    shouldOffer: shouldOffer,
    markOffered: markOffered,
    onOpen: onOpen,
    plan: plan,
  };
})();
