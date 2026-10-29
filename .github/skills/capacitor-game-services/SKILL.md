---
name: capacitor-game-services
description: 'Unity Ads interstitials with iOS ATT, a first-run analytics consent pop-up plus Privacy & Data settings (Firebase Analytics, GA4 Consent Mode v2), local daily-reminder notifications, and a Remove Ads in-app purchase with Restore, for Capacitor 8 plain-script games, exactly as shipped in Polite Carrot''s Color Match & Merge. Use when adding, porting, auditing or debugging ads, Unity Ads, AdMob-to-Unity migration, analytics or tracking consent, privacy modal, ATT prompt, local or push notifications, daily reminders, remove ads, IAP, restore purchases, or preparing an App Store / Google Play release of these features in Tide Runner or a new Polite Carrot game.'
argument-hint: 'Features (ads, consent, notifications, remove-ads, or all) and the target project'
---

# Capacitor game services

This skill packages four features as they shipped together in Color Match & Merge (`com.politecarrot.colorjars`, Capacitor 8.5, iOS and Android). Another plain-script Capacitor game can use it to get the same behaviour, wording and store setup.

| Feature | Module (global) | Plugin | Details |
|---|---|---|---|
| Unity Ads interstitials and iOS ATT | `js/ads.js` (`window.Ads`) | `@politecarrot/capacitor-unity-ads` | [unity-ads.md](./references/unity-ads.md) |
| First-run consent pop-up, Privacy & Data, analytics | `js/track.js` (`window.Track`) and app wiring | `@capacitor-firebase/analytics` | [consent-analytics.md](./references/consent-analytics.md) |
| Daily reminder notifications | `js/reminders.js` (`window.Reminders`) and the Android `NotificationSettings` plugin | `@capacitor/local-notifications` | [notifications.md](./references/notifications.md) |
| Remove Ads one-off purchase and Restore | `js/purchases.js` (`window.Purchases`) | `@capgo/native-purchases` | [remove-ads.md](./references/remove-ads.md) |

- **Native setup** (iOS Info.plist, the Firebase config files, Android manifest, Gradle, the Java classes): [native-config.md](./references/native-config.md).
- **Store and dashboard setup, the device test matrix and troubleshooting:** [release-checklist.md](./references/release-checklist.md).

## When to use

- Adding any of the four features to a Capacitor game, such as Tide Runner or a new Polite Carrot game.
- Moving a game from AdMob/UMP to Unity Ads.
- Auditing or debugging, for example:
  - No ads appear.
  - Analytics stays "disabled".
  - Reminders don't arrive.
  - A purchase doesn't remove ads.
  - A permission prompt never appears.
- Preparing an App Store or Play release that includes these features.

Assumptions:

- Capacitor 8.
- Plain `<script>` tags in `index.html`, with each module an IIFE that exports on `window.*`. No bundler.
- With a bundler, import the modules and `require('@politecarrot/capacitor-unity-ads')` instead of using the vendor copy.

## How the pieces fit

**Script order:** `store.js` → `daily.js` → (game modules) → `track.js` → `vendor/unity-ads.js` → `purchases.js` → `reminders.js` → `ads.js` → `app.js`.

**Who owns what:**

- `Store` wraps localStorage after a write-and-read-back check. Reminders and Purchases read it as soon as they load.
- `Ads` checks `Purchases.adsRemoved()` on every call. A player who owns Remove Ads never has Unity started.
- `app.js` owns the prefs, every modal and every call into the four modules. The modules never touch the DOM.
- Consent flows one way: prefs → `applyConsent()` → `window.__consentState` → `Track.sync()` and `Ads.setPersonalized()`.

**Fresh install:**

1. After the boot splash clears, the "Before you start" modal opens, because `prefs.analytics === null`. It has one toggle, "Send usage data", which defaults to Off.
2. Continue saves the choice, then `primeConsent()` runs:
   - On iOS, the ATT prompt appears first, then the notification prompt. iOS queues system prompts, so the second waits for the first.
   - On Android 13 and later, the notification prompt appears.
   - `Ads.init()` runs. If ATT was authorized, `personalizedAds` becomes true. On Android it stays false until the player turns it on.
3. On every win, `Ads.noteLevelComplete()` is called.
4. The win-card button then runs `await Ads.maybeShowInterstitial()`. This shows an ad only if at least 2 minutes **and** 3 wins have passed and an ad is already preloaded. Otherwise it returns immediately. The button then navigates and calls `maybeOfferReminder()`.

**Returning player:** `maybeAskConsent()` re-applies the saved consent. `Ads.ensureAtt(false)` reads the ATT status without prompting.

## Procedure

### 1. Survey the target project

Find:

- The Capacitor version and how scripts load.
- Any existing ad or analytics code (AdMob, UMP, gtag).
- A storage wrapper. If there isn't one, copy [store.js](./assets/js/store.js).
- A modal helper and a prefs object.
- Where a level win is recorded and where the win card's buttons are.
- Whether the game has a daily mode. `Reminders.plan()` needs `window.Daily`; see [notifications.md](./references/notifications.md).

**Ask the user** for every per-app value below that isn't already in the repo. Never guess Unity IDs: a wrong game ID initializes fine, then silently serves nothing or pays another app.

### 2. Dependencies and build pipeline

```sh
npm install @capacitor-firebase/analytics@^8.5.1 @capacitor/local-notifications@^8.3.1 \
  @capgo/native-purchases@^8.9.6 \
  "@politecarrot/capacitor-unity-ads@github:Polite-Carrot/polite-carrot-unity-ads#96f31aa21ee8cd5e966797b37c438540c092f444"
```

1. Copy [sync-dependencies.js](./assets/build/sync-dependencies.js). It copies the installed package's `js/index.js` to `vendor/unity-ads.js`. For Tide Runner, change the target to `docs/vendor/unity-ads.js`.
2. Copy [sync-web.js](./assets/build/sync-web.js). It reads the `<script src>` and stylesheet tags from `index.html` and mirrors them into `www/`. Edit its static asset list.
3. Copy [capacitor.config.js](./assets/build/capacitor.config.js). It runs `sync-web.js` before every `cap` command. Change `appId`, `appName` and `webDir`.
4. Add `www/` and `vendor/unity-ads.js` to `.gitignore`.
5. Add the scripts `"test": "node --test test/*.test.js"` and `"sync": "node sync-web.js && cap sync"`.
6. If migrating from AdMob, remove `@capacitor-community/admob`, its `patches/` file and `patch-package`. See [unity-ads.md](./references/unity-ads.md#migrating-from-admob).

### 3. JS modules

Copy [ads.js](./assets/js/ads.js), [track.js](./assets/js/track.js), [reminders.js](./assets/js/reminders.js) and [purchases.js](./assets/js/purchases.js). Change only the per-app values in the table below.

### 4. Markup and styles

Port the following from [privacy-settings.excerpt.html](./assets/html/privacy-settings.excerpt.html):

- `#privacy`
- `#privacy-data`
- The Settings rows:
  - Notifications, plus the quiet note row under it
  - Privacy & Data "Open…"
  - Remove ads
  - "Bought it already?" Restore
- `#reminder-offer`
- `#home-remove-ads`
- The script tags

Port the styles from [settings.excerpt.css](./assets/css/settings.excerpt.css) and map its CSS variables to the game's palette. Rows that only work in the app start `hidden`, and the wiring reveals them when the plugin is present.

### 5. App wiring

Port [app-wiring.excerpt.js](./assets/js/app-wiring.excerpt.js) into the game's main IIFE. Its header lists the three hook points (init, win recorded, win-card button) and the closure variables it expects. Keep the `track()` wrapper: every analytics call goes through it.

### 6. Native

Follow [native-config.md](./references/native-config.md):

- **iOS:**
  - Add the Info.plist keys.
  - Register `GoogleService-Info.plist` in `project.pbxproj`.
  - Add no Firebase code to `AppDelegate`.
- **Android:**
  - Add the manifest meta-data and permissions, and remove `SCHEDULE_EXACT_ALARM`.
  - Add the `google-services` plugin and the Firebase BOM.
  - Copy [NotificationSettingsPlugin.java](./assets/android/NotificationSettingsPlugin.java) and call `registerPlugin(...)` before `super.onCreate` in [MainActivity.java](./assets/android/MainActivity.java). The package name must equal the app's namespace.
  - Add [ic_stat_daily.xml](./assets/android/ic_stat_daily.xml) to `res/drawable/`.

### 7. Sync and verify

```sh
npm install && npx cap sync
npx cap ls ios && npx cap ls android     # all 4 plugins on BOTH platforms
node --check js/ads.js js/track.js js/reminders.js js/purchases.js js/app.js
npm test
```

- Copy [ads.test.js](./assets/test/ads.test.js), [purchases.test.js](./assets/test/purchases.test.js) and [reminders.test.js](./assets/test/reminders.test.js) into `test/`.
- Update the expected game ID, storage keys and product ID in them.
- The tests load `js/*.js` relative to the repo root. `reminders.test.js` also loads `js/daily.js`.
- If `node` isn't on PATH (fnm), prefix commands with `fnm exec --using v22.17.1`.
- Build both platforms: `xcodebuild` for a simulator, and `./gradlew assembleDebug` in `android/`.

### 8. Device tests, store setup, release

Work through [release-checklist.md](./references/release-checklist.md). It covers:

- Fresh-install flows on both platforms.
- The Unity dashboard.
- The App Store Connect IAP and the Paid Apps Agreement.
- The Play billing product and license testers.
- Privacy labels and Data safety.
- Version bumps.

## Per-app values

| Value | Where | Color Match & Merge |
|---|---|---|
| Unity game ID and interstitial placement, per platform | `ads.js` `createUnityAds({ios, android})` | iOS `800379629` / `BP_Interstitial_iOS`; Android `800384183` / `BP_Interstitial_Android` |
| `testMode` | `ads.js` | `false`. The package default is `true`. |
| Ad frequency | `ads.js` `MIN_MILLIS`, `MIN_LEVELS` | 2 min **and** 3 wins; the clock starts at launch |
| Storage keys | `PREFS_KEY` (app), `PREF_KEY` (reminders), `OWNED_KEY` (purchases), `PROBE` (store) | `colourjars.prefs.v1`, `colourjars.reminders.v1`, `colourjars.removeAds.v1`, `colourjars.probe` |
| IAP product ID | `purchases.js` `PRODUCT_ID`, App Store Connect and Play Console | `remove_ads` (non-consumable) |
| Reminder schedule | `reminders.js` `DEFAULT_HOUR`, `DAYS_AHEAD`, `FIRST_ID`, `CHANNEL` | 18, 7, 7100, `daily` |
| Reminder wording and icon | `plan()` title/body, channel name, `smallIcon`, `iconColor` | "Daily puzzle", `ic_stat_daily`, `#FF5D8F` |
| When the reminder offer appears | app wiring `REMINDER_AFTER_LEVELS` | first daily solved, or 10 puzzles |
| Privacy policy | app wiring `PRIVACY_POLICY_URL` | `https://politecarrot.com/privacy` |
| ATT prompt text | Info.plist `NSUserTrackingUsageDescription` | see [native-config.md](./references/native-config.md) |
| Firebase config files | `ios/App/App/GoogleService-Info.plist`, `android/app/google-services.json` | one per app, downloaded from the Firebase console |
| Android package | the `package` line in both Java files | `com.politecarrot.colorjars` (its folder is named `colourjars`; that doesn't matter) |

## Rules that each cost a broken build or release

1. **`testMode: false` must be set explicitly** for production. The package defaults to test ads, and debug/release builds don't change it.
2. **Never `await` an ad load in a button handler.** Show only an ad that is already preloaded. Otherwise call `warm()` and move on.
3. **Count wins where the result is recorded**, not on the win card. A player who closes the game during the card still counts.
4. **Firebase defaults:** use `*_COLLECTION_ENABLED = false`, never `*_COLLECTION_DEACTIVATED`. `_DEACTIVATED` is a permanent kill switch: every later `setEnabled` or `setConsent` call is silently ignored.
5. **`setConsent` takes one `{type, status}` object per call.** An array silently does nothing.
6. **Firebase on iOS:**
   - `GoogleService-Info.plist` must be registered in `project.pbxproj`; dropping it in the folder crashes at launch.
   - Never call `FirebaseApp.configure()` in AppDelegate; the plugin configures Firebase itself.
7. **iOS asks for ATT and notifications once per install.** Ask only from the first-run Continue, with ATT first. Android stops asking after two refusals. After that, `enable()` returns `'blocked'` and the switch opens the phone's settings:
   - On iOS this must be `window.location.href = 'app-settings:'`, because `window.open` is blocked after an `await`.
   - On Android it uses the `NotificationSettings` plugin.
8. **Use inexact alarms only, and remove `SCHEDULE_EXACT_ALARM`.** Play asks apps that keep it to justify it.
9. **The store decides whether Remove Ads is owned.**
   - A failed query keeps the cached value.
   - Only a successful query that doesn't list the product clears it.
   - The cache uses its own storage key, so "Reset progress" can never take away a purchase.
10. **Prices come only from the store**, inserted as text, never as markup. Apple requires a visible **Restore** button.
11. **Keep the `track()` wrapper.** When it was deleted, its first caller at the top of `startLevel` threw, and no level could start.
12. **Run `npm install` after every pull.** `cap sync` silently drops plugins listed in `package.json` that are missing from `node_modules`. Check with `cap ls`.
13. **After patching a large file, run `node --check`** and grep for duplicate function names. Overlapping edits have corrupted `app.js` before.
14. **Before a release build**, grep for leftover test settings: `testMode: true`, small `MIN_MILLIS`/`MIN_LEVELS`, test reminder times. One leftover call inside `Reminders.sync()` silently stopped every reminder.

## Done when

- [ ] `cap ls` lists all 4 plugins on iOS and Android, and both platforms build.
- [ ] `npm test` passes, and `node --check` is clean for every module.
- [ ] On a fresh install, these all work on a device:
  - The consent modal appears after the splash.
  - The ATT prompt, then the notification prompt, appear (iOS).
  - The notification prompt appears (Android).
  - Privacy & Data toggles apply immediately.
  - An interstitial appears after 3 wins and 2 minutes.
  - A reminder is scheduled, and tapping it opens the daily screen.
  - A test purchase removes ads, and Restore finds it on a second install.
- [ ] Store-side items in [release-checklist.md](./references/release-checklist.md) are done or handed to the user as a list.
