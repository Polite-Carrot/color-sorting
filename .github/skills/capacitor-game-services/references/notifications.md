# Daily reminder notifications (local)

Sources:

- [assets/js/reminders.js](../assets/js/reminders.js)
- [assets/android/NotificationSettingsPlugin.java](../assets/android/NotificationSettingsPlugin.java)
- [assets/android/ic_stat_daily.xml](../assets/android/ic_stat_daily.xml)
- the reminder sections of [app-wiring.excerpt.js](../assets/js/app-wiring.excerpt.js)

## Design

- **Local notifications only**, through `@capacitor/local-notifications`. There's no push server, FCM or APNs key, and nothing leaves the device.
- **No repeating alarm**, because a repeating alarm can't skip a day. Instead the next **7 days** (`DAYS_AHEAD`) are scheduled individually, with IDs `FIRST_ID` to `FIRST_ID + 6` (7100–7106).
- **`sync(done)`** cancels all of them and schedules them again from scratch. It runs:
  - at boot (`bindStoreAndReminders`),
  - whenever the app becomes visible (`visibilitychange`),
  - whenever a daily puzzle is solved (`recordResult`).

  Calls queue rather than overlap. Results of this design:
  - Today's reminder disappears as soon as today's puzzle is solved.
  - The streak wording ("Keep your N-day streak alive! 🔥", when the streak is 2 or more) appears **only on the next notification to fire**, so it's always true when it arrives. The others say "A new daily puzzle is ready."
  - A lapsed player gets a week of reminders, then none.
- **Each notification:**

```js
{ id, title: "Daily puzzle", body, schedule: { at, allowWhileIdle: true },
  isExactNotification: false, channelId: "daily", smallIcon: "ic_stat_daily",
  iconColor: "#FF5D8F", extra: { kind: "daily", day: "YYYY-MM-DD" } }
```

- **Android channel:** created once, before the first schedule:

```js
createChannel({id:'daily', name:'Daily puzzle', description:'A reminder when the daily puzzle is ready', importance:3})
```

- **Prefs** (`colourjars.reminders.v1`): `{on, asked, hour}`, with `hour` defaulting to 18. The time picker was removed from the UI, but `setHour()` and the `hour` pref still exist.

## Required: `window.Daily`

`plan()` calls `Daily.key(date)` (local `YYYY-MM-DD`), `Daily.shift(date, days)` and `Daily.streak(done, fromDate)`. `done` is the solved-days record (`progress.daily`, keyed by `Daily.key`).

For a game without Color Match & Merge's `daily.js`, add this minimal version before `reminders.js`:

```js
(function (g) {
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function shift(d, days) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + days); return x; }
  function streak(done, from) { var d = from, n = 0; if (!done[key(d)]) d = shift(d, -1); while (done[key(d)]) { n++; d = shift(d, -1); } return n; }
  g.Daily = { key: key, shift: shift, streak: streak };
})(window);
```

If the game has no daily mode:

- Decide what "done today" means, for example "played today", and record it under `Daily.key(today)`.
- Rewrite the title and body in `plan()`.

## Permission flow

| Situation | What happens |
|---|---|
| Fresh install, first-run Continue | `askForNotifications()` is chained **after** the ATT promise. It runs only if `!Reminders.state().asked`, and calls `enable()`. If the result is `'on'`, it tracks `from: 'first_run'`. |
| Upgraders, who answered consent in an older version and never see first run | The `#reminder-offer` card, shown **once**, at the first of: first daily solved, or 10 puzzles finished in any mode. Never at launch. It doesn't appear over Settings or the win card, and only appears if `shouldOffer()`. |
| `shouldOffer()` | All of: native, not asked, not on, and permission is `prompt` or `granted`. Android 12 and older report `granted` with no prompt, so the card is the only question there. |
| Settings switch, turning on | `enable()` returns one of the results below. |
| Settings switch, turning off | `disable()` cancels everything and sets `asked = true`. |
| Settings opened | `checkReminderPermission()` shows the quiet note row if the OS permission is `denied`: "Notifications are turned off for this game. Allow them in your phone's Settings app, then switch this on." |

`enable()` results:

- `'on'`
- `'denied'`: the player refused the prompt just shown.
- `'blocked'`: refused earlier, so no prompt can appear. The app sets `reminderFromSettings = true` and calls `openSettings()`. When the app becomes visible again, `finishReminderFromSettings()` switches reminders on if permission is now granted.
- `'unavailable'`: web.

- **iOS** shows the notification prompt **once per install**. **Android 13+** stops showing it after two refusals. After that the phone's settings are the only route.
- **`openSettings()`:**
  - iOS: `window.location.href = "app-settings:"`. Capacitor hands non-app navigations to `UIApplication.open`. `window.open` fails here because it's blocked after an `await`, since `javaScriptCanOpenWindowsAutomatically` isn't set.
  - Android: `registerPlugin("NotificationSettings").open()`, which opens `ACTION_APP_NOTIFICATION_SETTINGS` (API 26+) or the app details page.

## Tapping a notification

`Reminders.onOpen(fn)` listens for `localNotificationActionPerformed` with `extra.kind === 'daily'`. The plugin holds taps that cold-start the app until the listener is attached.

The app ignores the tap if a game screen is active, rather than abandoning a puzzle in progress. Otherwise it closes the offer card and calls `showScreen('daily')`.

## Android native pieces

1. **`NotificationSettingsPlugin.java`** in the app's Java package. Its `package` line must equal the app's `namespace`; the folder name doesn't matter.
2. **`MainActivity.onCreate`:** `registerPlugin(NotificationSettingsPlugin.class);` **before** `super.onCreate(...)`. App plugins must be registered before the bridge starts.
3. **`res/drawable/ic_stat_daily.xml`:** a white silhouette vector. Android draws small icons as single-colour masks, so a full-colour icon shows as a grey square.
4. **Manifest:**

```xml
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" tools:node="remove" />
```

Add `xmlns:tools` on `<manifest>`. The plugin adds `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` and `WAKE_LOCK` itself.

iOS needs no entitlement or capability for local notifications.

## UI copy

- **Settings row:** `<span>Notifications</span>` with an On/Off button (`aria-pressed`).
- **Note row:** a `<p class="settings-row__note">` inside `.settings-row.settings-row--quiet`. Use a `<p>`, not a `<span>`, because `.settings-row > span` gets the large title style.
- **Offer card:**
  - Title: "Daily reminder?"
  - Optional lead: "N puzzles solved, nice work! There is also a new Daily Puzzle every day."
  - Body: "One notification a day when the new Daily Puzzle is ready, at 6pm. None on days you have already solved it. Turn it off any time in Settings."
  - Buttons: "Remind me" and "Not now".

## Testing

- **Fresh install on Android:** `adb shell pm clear <package>`. Reinstalling alone isn't enough, because Auto Backup (`allowBackup="true"`) restores localStorage, including `asked`.
- **Fresh install on iOS:** delete the app. The prompt answer survives until then.
- **For quick checks,** temporarily schedule a reminder a minute ahead. Then grep for every leftover (test hours, test helper functions) before shipping. A leftover helper once threw inside `plan()`, `sync()` swallowed the error, and every reminder silently stopped.
- **Unit tests:** [reminders.test.js](../assets/test/reminders.test.js) covers:
  - Nothing is scheduled before the player says yes.
  - Today is skipped once solved.
  - The streak appears only on the next reminder.
  - Declining at the prompt.
  - The offer appears only once.
  - Turning off cancels everything.
  - Changing the hour.
  - The Android channel is created first.
  - Taps are routed.
  - Web does nothing.
