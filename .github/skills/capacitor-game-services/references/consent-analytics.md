# Consent pop-up, Privacy & Data, and analytics

Sources:

- [assets/js/track.js](../assets/js/track.js)
- the consent sections of [app-wiring.excerpt.js](../assets/js/app-wiring.excerpt.js)
- the `#privacy` and `#privacy-data` markup in [privacy-settings.excerpt.html](../assets/html/privacy-settings.excerpt.html)

## Model

There are two independent choices, saved in the app's prefs (`colourjars.prefs.v1`) next to sound and other settings:

| Pref | Values | Meaning |
|---|---|---|
| `analytics` | `null` / `true` / `false` | `null` means the player hasn't been asked yet, so the first-run modal opens. Defaults to **Off** in the modal. |
| `personalizedAds` | `true` / `false` (default `false`) | The app's own record of whether the player wants personalized ads. On iOS ads are actually personalized only if ATT is authorized too. |

`applyConsent()` is the only place that pushes these choices to the SDKs:

```js
window.__consentState = {
  analytics: prefs.analytics === true,
  ads: prefs.personalizedAds === true && Ads.adsPersonalisedGranted()   // pref AND effective (ATT)
};
Track.sync();                                    // load(ads) or unload()
Ads.setPersonalized(prefs.personalizedAds)       // async in the package…
  .then(syncAnalytics).catch(syncAnalytics);     // …so re-read and re-sync Firebase after it settles
```

## Screens

### "Before you start" (`#privacy`, first run only)

- **Contents:**
  - Intro text: "One thing you can switch on if you want to. It stays off unless you turn it on, and can be changed at any time in Privacy & Data."
  - One row, **Send usage data**, Off by default: "Which levels people reach and where they get stuck, so we can fix the ones that are too hard."
  - Footer: a "Privacy policy" link (`PRIVACY_POLICY_URL`, hidden if empty) above a single **Continue** button. The footer is `position: sticky` so Continue stays visible on small screens.
- **No ads toggle here.** On iOS the ATT prompt asks that question. On Android personalized ads start Off and the player can turn them on in Privacy & Data.
- **Opening:** `maybeAskConsent()` polls every 150 ms, up to 40 times (6 s), for `#boot` to be removed before opening. The boot splash sits above modals, so a modal opened earlier would be hidden behind it.
- **Escape** can't dismiss it until it has been answered (`prefs.analytics !== null`).
- **Continue:**
  1. Save `prefs.analytics` and call `applyConsent()`.
  2. Hide the modal.
  3. Call `primeConsent()`:

```js
var attPromise = native && iOS ? Ads.ensureAtt(true) : Promise.resolve();
attPromise.catch(noop).then(askForNotifications);      // one system prompt at a time on iOS
await Ads.init();
if (await attPromise === 'authorized') { prefs.personalizedAds = true; savePrefs(); }
applyConsent(); renderSettingsToggles();
```

### Privacy & Data (`#privacy-data`)

- **Opened from:** the Settings row "Privacy & Data", button "Open…". Opening it hides Settings.
- **Send usage data:** sets `prefs.analytics`, saves, and calls `applyConsent()`.
- **Personalised ads** (British spelling in the UI):
  - Note: "Ads matched to your interests. Left off, ads still appear but are generic."
  - Toggling it calls `setAdsPersonalized(on)`, which saves and applies the choice. When turning it **on** in the iOS app, it also calls `Ads.ensureAtt(true)` (the prompt appears only if ATT is undetermined), then applies consent again.
- **When Remove Ads is owned,** the ads button is disabled and the note reads "You removed ads, so there are none to personalise." This is done in `renderPurchaseRows()`.
- **Toggles apply immediately.** "Done" and Escape just close the modal.

## `js/track.js`

- **Native only.**
  - `MEASUREMENT_ID = ''`, so on web `configured()` is false and every call does nothing.
  - Native gets the plugin with `Capacitor.registerPlugin('FirebaseAnalytics')`, falling back to `Capacitor.Plugins.FirebaseAnalytics`.
- **`sync()`** reads `window.__consentState`. If `analytics === true` it calls `load(ads === true)`; otherwise `unload()`.
- **`load(adsAllowed)`** calls `setEnabled({enabled:true})`, then makes **one `setConsent` call per type**:
  - `ANALYTICS_STORAGE: GRANTED`
  - `AD_STORAGE`, `AD_USER_DATA`, `AD_PERSONALIZATION`: `GRANTED` if ads are allowed, otherwise `DENIED`
- **`unload()`** calls `setEnabled({enabled:false})` and sets all four types to `DENIED`.
- **`event(name, params)`** sends nothing until enabled. It trims parameter names to 40 characters and string values to 100, and catches every rejection.
- **The `track()` wrapper in `app.js`** wraps `Track.event` in a try/catch and tolerates `Track` being absent. **Never delete it.** Its callers include the first line of `startLevel`.

### Events sent by Color Match & Merge

| Event | Params |
|---|---|
| `level_complete` | `mode, level, par, moves, over_par, stars, hints_used` |
| `daily_reminder` | `on`, `hour`, `from: first_run \| settings \| offer` (`from` is omitted for the plain toggle) |
| `reminder_offer` | `from: daily \| levels` |
| `remove_ads` | `result: owned \| pending \| cancelled \| failed`, `from: home \| settings` |
| `remove_ads_restore` | `found: bool` |

## Native defaults (collection off until consent)

These are required, or Firebase collects data before the player answers, which breaks GDPR/PECR.

- **iOS Info.plist:**
  - `FIREBASE_ANALYTICS_COLLECTION_ENABLED = false`
  - `GOOGLE_ANALYTICS_DEFAULT_ALLOW_ANALYTICS_STORAGE = false`
  - `GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_STORAGE = false`
  - `GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_USER_DATA = false`
  - `GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_PERSONALIZATION_SIGNALS = false`
- **Android manifest:** the same keys in lower case, as `<meta-data android:value="false"/>`.
- **Never use the `_DEACTIVATED` variants.** They are permanent kill switches. When this was wrong, the symptom was every `setEnabled`/`setConsent` call resolving without error while the native log kept printing "Analytics is disabled. Event not logged".

The exact XML and plist blocks are in [native-config.md](./native-config.md).

## Firebase project files

- **iOS:** download `GoogleService-Info.plist` to `ios/App/App/` **and register it in `project.pbxproj`**. That means a `PBXFileReference`, a `PBXBuildFile`, membership in the App group, and an entry in `PBXResourcesBuildPhase`; in total `grep -c GoogleService-Info.plist project.pbxproj` should print 4. Without the registration, the plugin crashes at launch.
- **iOS AppDelegate:** no `import FirebaseCore` and no `FirebaseApp.configure()`. The plugin configures Firebase as it loads.
- **Android:** put `google-services.json` in `android/app/`. Gradle setup is in [native-config.md](./native-config.md).

## Debugging

- **Safari Web Inspector** (Develop → device or simulator → app) or Chrome `chrome://inspect`:
  - `__consentState`
  - `__consentDebug()`
  - `Ads.consentState()`
  - Calling `Capacitor.Plugins.FirebaseAnalytics.setEnabled({enabled:true})` directly tests the plugin without any app code involved.
- **Firebase DebugView:**
  - iOS: add the launch argument `-FIRAnalyticsDebugEnabled` to the Xcode scheme.
  - Android: run `adb shell setprop debug.firebase.analytics.app <package>`.
  - Events appear only after usage data is switched on.
