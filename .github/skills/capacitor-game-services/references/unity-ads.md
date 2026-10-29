# Unity Ads (interstitials and iOS ATT)

Source: [assets/js/ads.js](../assets/js/ads.js), which uses the shared package `@politecarrot/capacitor-unity-ads`.

## The shared package

| | |
|---|---|
| Install | `"@politecarrot/capacitor-unity-ads": "github:Polite-Carrot/polite-carrot-unity-ads#96f31aa21ee8cd5e966797b37c438540c092f444"`. The repo is private, so pin a tested commit or tag and commit the lockfile. |
| SDK | Unity Ads 4.20.1 on both platforms. The iOS binary checksum is pinned in the package's `Package.swift`. |
| iOS | iOS 15+, Swift Package Manager. Capacitor derives the SPM product `PolitecarrotCapacitorUnityAds` from the npm name, so don't rename the package. |
| Android | Java 21, min SDK 24, compile/target SDK 36. Unity's AAR adds its own permissions. |
| JS | `js/index.js` exposes `window.PoliteCarrotAds.createUnityAds` (also CommonJS). |
| Native bridge name | `UnityAds`. Never install it alongside an older local Unity plugin: both register `UnityAds`. |
| Scope | No app IDs, no frequency policy, no consent dialog, no UMP, no analytics. The app owns all of that. |

**Plain-script apps:** `npm install` and `cap sync` do **not** put the JS into the web assets. `sync-dependencies.js` (called by `sync-web.js`) copies `require.resolve('@politecarrot/capacitor-unity-ads')` to `vendor/unity-ads.js` on every sync. `index.html` loads it before `ads.js`. Git ignores the copy, so a dependency upgrade can't leave stale JS behind.

### Client API

Create **one client per app**, because the native SDK is process-wide.

| Method | Result |
|---|---|
| `init()` | `Promise<boolean>`. False on web or when initialization fails. |
| `setPersonalized(bool)` | Applies the app's preference. Rejects on a bridge or consent error. |
| `requestTracking()` | The ATT status string. Android and web return `"notApplicable"`. |
| `prepareInterstitial()` / `prepareRewarded()` | `{loaded, reason?, code?}`. Native loads have a 10 s deadline; the JS bridge deadline is 12 s (`timeoutMs`). |
| `showInterstitial()` / `showRewarded()` | `{shown, rewarded, finishState?, reason?, code?}`. Never loads implicitly: if nothing is prepared it returns `{shown:false, reason:'not prepared'}`. |
| `state()` | `{platform, ready, showing, personalized, attStatus, effectivePersonalized, prepared:{interstitial, rewarded}}` |

On iOS, ads are effectively personalized only when **both** the app preference is on and ATT is authorized. The package re-checks ATT before loading and showing. It discards prepared ads when the effective consent changes, and it retries failed consent writes.

There is no JS playback timeout. A stuck native ad view can't be dismissed from JS, so test on real devices.

**Rewarded ads**, which Tide Runner needs:

```js
const loaded = await ads.prepareRewarded(); if (!loaded.loaded) return;
const r = await ads.showRewarded(); if (r.rewarded) grantOnce();
```

- `rewarded` turns true only after Unity's reward callback.
- A skipped ad earns nothing.
- Disable the reward button while the call is pending.
- On web it always returns unavailable.

## The app adapter: `js/ads.js`

```js
var client = window.PoliteCarrotAds.createUnityAds({
  ios: { gameId: "800379629", interstitial: "BP_Interstitial_iOS" },
  android: { gameId: "800384183", interstitial: "BP_Interstitial_Android" },
  testMode: false,
});
var MIN_MILLIS = 2 * 60 * 1000;   // AND
var MIN_LEVELS = 3;
var lastShownAt = Date.now();     // so no ad in the first 2 minutes after launch
```

How it behaves:

- **`removed()`** reads `window.Purchases.adsRemoved()` on every call, so a purchase or refund mid-session applies at the next level. When removed:
  - `init()` resolves `false` without starting Unity.
  - `warm`, `noteLevelComplete` and `maybeShowInterstitial` do nothing.
- **`warm()`** keeps at most one preload in flight (`preparing`). It does nothing on web, during a show, or when removed. It returns `true` if an ad is loaded.
- **`noteLevelComplete()`** increments `levelsSinceLast`. Once that reaches `MIN_LEVELS - 1`, it preloads, so an ad is ready by the time one is allowed.
- **`maybeShowInterstitial()`** returns `false` straight away if:
  - the platform isn't native,
  - an ad is already showing,
  - ads are removed,
  - fewer than 3 wins or 2 minutes have passed, or
  - no ad is prepared (it calls `warm()` first and doesn't wait).

  Otherwise it shows the ad, and on success resets both counters. A failed show keeps the player eligible for the next attempt. Every attempt ends with `warm()`. The `showing` flag stops two transitions from showing twice.
- **`setPersonalized(on)`** writes only when the value changed, then preloads again (consent changes discard prepared ads). Errors are logged and swallowed.
- **`ensureAtt(mayPrompt)`** returns `null` off iOS. `true` shows the system prompt and resolves with the status. `false` runs `init()`, then reads `state().attStatus` without prompting. Calls made while one is pending share the same promise.
- **Exports:** `window.Ads = {init, isNative, getPlatform, setPersonalized, ensureAtt, requestTracking, adsPersonalisedGranted, noteLevelComplete, maybeShowInterstitial, warm, consentState}`.
- **`window.__consentDebug()`** returns `{attStatus, personalizedAds, unityConsent, granted}`. Call it from Safari Web Inspector or Chrome `chrome://inspect`.

### Call sites in the app

All of these are in [app-wiring.excerpt.js](../assets/js/app-wiring.excerpt.js).

| When | Call |
|---|---|
| Boot, returning player | `Ads.init().then(() => Ads.ensureAtt(false)).then(applyConsent)` |
| First-run Continue (`primeConsent`) | `Ads.ensureAtt(true)` (iOS), then `Ads.init()`. If the status is `'authorized'`, set `prefs.personalizedAds = true`. |
| Privacy & Data "Personalised ads" turned on (`setAdsPersonalized`) | `Ads.ensureAtt(true)` on iOS. It prompts only if ATT is undetermined. |
| Every change to consent (`applyConsent`) | `Ads.setPersonalized(prefs.personalizedAds)`, then refresh analytics after it settles |
| Win recorded (`recordResult`) | `Ads.noteLevelComplete()` |
| Win card button | `closeOverlay(); await Ads.maybeShowInterstitial(); navigate; maybeOfferReminder();` |

## Unity dashboard

- **Two game IDs.** Unity gives each platform its own game ID. Find them under the project's Monetization settings.
- **Placements.** Under Monetization → Ad Units, each platform has its own interstitial placement ID, for example `BP_Interstitial_iOS` and `BP_Interstitial_Android`. Copy the IDs exactly; ask the user for them.
- **Before release.** Test mode serves test creatives before any store listing exists. Set `testMode: false` only in the release build.
- **After release.** Once the app is live, add the App Store and Play URLs to the Unity project. Unity may serve few or no real ads until it can verify the listing.
- **SKAdNetwork.** Info.plist needs Unity's own ID, `4dzt52r2t5.skadnetwork`. If mediation or more networks are enabled later, add the partner IDs Unity lists.

## Platform quirks

- **iOS Simulator:** Unity video ads play as a **black screen** because of a WebKit media restriction. Test on a real iPhone or the Android emulator; both play normally.
- **Corporate or office networks** that intercept TLS (for example the "Forward Trust" CA) make ad SDK requests fail. Test on another network before debugging code.
- **New apps:** before a store listing is linked, expect no fill from real ads.

## Migrating from AdMob

1. Remove the AdMob code:
   - npm packages: `@capacitor-community/admob`, the `patches/@capacitor-community+admob*.patch` file and the `postinstall: patch-package` script.
   - Config: the `ios.includePlugins` entry for AdMob in `capacitor.config`.
   - JS: UMP consent code, `isTestAdId()` and the AdMob branch in `ads.js`. Replace `ads.js` with the asset.
2. Remove the AdMob native config:
   - iOS: the `GADApplicationIdentifier` and `GADIsAdManagerApp` Info.plist keys, and Google's SKAdNetwork entry. Put Unity's in its place.
   - Android: the `com.google.android.gms.ads.APPLICATION_ID` meta-data.
3. Keep the `AD_ID` permission, `NSUserTrackingUsageDescription` and the app's own consent UI.
4. Firebase consent code that reads AdMob or UMP variables must read `window.__consentState` instead. In Tide Runner this is `setFbConsent()`.
5. Tide Runner keeps its own ad policy in its adapter: the first-three-races grace period, every-third-race eligibility, two-minute gaps, the saved last-attempt timestamp, the cooldown after a reward, and the extra-spin and double-coins rewards. Ad-removal behaviour stays app code too.
6. After `npm install && npx cap sync`, check that `cap ls` shows the Unity plugin and no AdMob on both platforms.
7. Update the privacy policy, the App Store privacy labels and Play Data safety to name Unity Ads instead of AdMob.
