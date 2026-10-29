# Release checklist, device tests and troubleshooting

## 1. Code checks before a release build

```sh
grep -nE "testMode|MIN_MILLIS =|MIN_LEVELS =|DEFAULT_HOUR =|testTime|TEST_" js/*.js   # production values only
node --check js/ads.js js/track.js js/reminders.js js/purchases.js js/app.js
npm test
npx cap sync && npx cap ls ios && npx cap ls android          # 4 plugins on each
grep -c GoogleService-Info.plist ios/App/App.xcodeproj/project.pbxproj   # 4
plutil -lint ios/App/App/Info.plist
```

- `testMode: false`, `MIN_MILLIS = 2 * 60 * 1000`, `MIN_LEVELS = 3`, `DEFAULT_HOUR = 18`.
- There are no temporary helpers, test times or `console.log` debugging left in reminders or ads code.
- Version bumps:
  - iOS: `CURRENT_PROJECT_VERSION` raised for every upload, and `MARKETING_VERSION` set in both configurations.
  - Android: `versionCode` higher than the last upload.
- Commit `Info.plist`, `project.pbxproj`, `build.gradle`, `AndroidManifest.xml` and `package-lock.json`.

## 2. Device test matrix

To start each run from a fresh install:

- **Android:** `adb shell pm clear <package>`. Auto Backup restores localStorage after a reinstall, so reinstalling isn't enough.
- **iOS:** delete the app. That also resets the ATT and notification prompts.

| Area | Check |
|---|---|
| Consent | The "Before you start" modal appears after the boot splash, not behind it. Escape doesn't close it. Continue is visible on a small phone. |
| | iOS: ATT appears, **then** the notification prompt. Android 13+: the notification prompt appears. |
| | iOS ATT allowed: Privacy & Data shows Personalised ads On. Denied: Off. Android: Off until the player switches it on. |
| | With usage data On, events appear in Firebase DebugView. With it Off, nothing is sent and the log says collection is disabled. |
| Ads | No interstitial in the first 2 minutes or the first 2 wins. After 3 wins and 2 minutes, an ad shows on the win-card button. The button never hangs when no ad is loaded. |
| | Early close, no fill and offline all leave the game playable. |
| | Remove Ads owned: no ad and no Unity initialization. Refund: ads return at the next foreground. |
| Notifications | Allowing schedules 7 pending notifications (IDs 7100–7106) at the reminder hour. Solving today's daily drops today's. The streak text appears only on the next one. |
| | Denying the prompt: the Settings switch shows the "turned off" note. Tapping the switch opens the phone's settings. Allowing there and returning switches it On automatically. |
| | Tapping a notification opens the daily screen, but not during a level in progress. The Android status-bar icon is the white silhouette, not a grey square. |
| | Upgrade path: the offer card appears once, after the first daily or after 10 puzzles. |
| Remove Ads | The store price shows in Settings and on the home button. A sandbox or license-tester purchase removes ads, the home button says "Thank you!" then hides, and Settings says "Removed". |
| | Cancel shows nothing. Restore on a second install or device finds the purchase. "Reset progress" keeps it. |

- **iOS Simulator:** Unity video ads play as a black screen, so test ads on a device or the Android emulator.
- **Purchases on iOS:** buy from a TestFlight build, which uses sandbox.
- **Purchases on Android:** buy from an internal testing build with your account added as a license tester.

## 3. Store and dashboard setup

These are done by the user. Hand them over as a list.

### Unity dashboard

- [ ] Each platform has its own game ID, and each has an interstitial Ad Unit. The IDs are copied exactly into `ads.js`.
- [ ] After launch, the App Store and Play store URLs are added to the Unity project. Until then, real ads may be scarce or absent.
- [ ] If the developer website hosts `app-ads.txt`, it includes the entries the Unity dashboard provides. Confirm this in the dashboard.

### App Store Connect

- [ ] The `remove_ads` Non-Consumable is "Ready to Submit", with a review screenshot, and attached to this version.
- [ ] The Paid Apps Agreement is active, with banking and tax filled in.
- [ ] App Privacy labels name Unity Ads (identifiers, usage and diagnostics for third-party advertising, and tracking when ATT is allowed), Firebase Analytics (product interaction, only with consent) and purchases.
- [ ] Export compliance is answered by `ITSAppUsesNonExemptEncryption = false`.

### Play Console

- [ ] A build with the billing permission is uploaded to a testing track, then `remove_ads` is created and set to **Active**, and a payments profile is set up.
- [ ] License testers are added.
- [ ] App content: Ads = **Yes**. The Advertising ID declaration says it's used for advertising, matching the `AD_ID` permission.
- [ ] Data safety names Unity Ads (device IDs, app interactions, diagnostics, shared for advertising) and Firebase Analytics (app interactions, optional).
- [ ] No exact-alarm declaration is needed, because the permission is removed.

### Privacy policy

- [ ] Names Unity Ads and Firebase Analytics.
- [ ] Says reminders are scheduled on the device.
- [ ] Says purchases are handled by Apple and Google.
- [ ] Is linked from the consent modal (`PRIVACY_POLICY_URL`) and the store listings.

## 4. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `"UNIMPLEMENTED"` error or an undefined plugin on the device | The plugin isn't in `node_modules`, so `cap sync` dropped it silently | `npm install && npx cap sync`. Check with `cap ls`. |
| `PoliteCarrotAds is undefined` | `vendor/unity-ads.js` wasn't copied, or it loads after `ads.js` | Run `npm run sync` and check the script order |
| Ads never show | One of: within 2 minutes of launch, fewer than 3 wins, nothing prepared, Remove Ads owned, or `testMode` | In Web Inspector: `Ads.consentState()` and `Purchases.status()` |
| Test ads work but real ads don't | The store listing isn't linked in Unity yet, or the app is new | Link the store URLs after launch |
| Black ad on the iOS Simulator | Simulator media restriction | Test on a device |
| Every ad request fails on the office network | TLS interception by a corporate CA | Test on another network |
| Native log keeps saying "Analytics is disabled" after consent | A `_DEACTIVATED` flag is used | Use `_ENABLED = false` |
| `setConsent` has no effect | It was passed an array | Make one `{type, status}` call per type |
| Crash at launch after adding Firebase on iOS | `GoogleService-Info.plist` isn't in `project.pbxproj`, or `FirebaseApp.configure()` is called twice | Register the file and remove the explicit configure |
| Reminders silently stopped | An exception inside `plan()` or `sync()`, which `sync()` swallows (for example leftover test code) | Grep for leftovers and run `reminders.test.js` |
| The notification switch does nothing on iOS | `window.open` called after an `await` | Use `window.location.href = 'app-settings:'` |
| No prompt after reinstalling on Android | Auto Backup restored `asked = true` | `adb shell pm clear <package>` |
| Price never appears and products are empty | Paid Apps Agreement not active, the IAP isn't "Ready to Submit", the Play product isn't Active or no billing build was uploaded, or the ID doesn't match | Fix the store setup |
| Play refunds purchases after 3 days | Purchases weren't acknowledged | Keep the plugin defaults; `refresh()` also calls `restorePurchases()` on Android |
| No level starts after an analytics refactor | `track()` was deleted but its callers remain | Restore the wrapper |
| The consent modal never appears on first run | It opened behind the boot splash | Keep the `waitForBoot` poll in `maybeAskConsent()` |
| The export-compliance question appears on every upload | `ITSAppUsesNonExemptEncryption` is missing | Add it and commit `Info.plist` |
| A strange `app.js` error after an edit | Overlapping patches duplicated or cut off a function | `node --check` and grep for duplicate `function` names |
