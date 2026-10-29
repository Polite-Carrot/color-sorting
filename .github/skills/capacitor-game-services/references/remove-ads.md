# Remove Ads (one non-consumable IAP, with Restore)

Sources:

- [assets/js/purchases.js](../assets/js/purchases.js)
- the Remove Ads section of [app-wiring.excerpt.js](../assets/js/app-wiring.excerpt.js)
- the Settings rows and `#home-remove-ads` in [privacy-settings.excerpt.html](../assets/html/privacy-settings.excerpt.html)

## Plugin

`@capgo/native-purchases` 8.9.6 uses StoreKit 2 on iOS and Google Play Billing on Android. It's registered as `NativePurchases` through `Capacitor.registerPlugin`.

`autoFinishTransactions` and `autoAcknowledgePurchases` both default to **true**, so leave them alone. Google refunds any purchase left unacknowledged for 3 days.

The plugin's manifest adds `com.android.vending.BILLING`.

## Product

- `PRODUCT_ID = "remove_ads"`. It must match the product ID in App Store Connect (Non-Consumable) **and** Play Console (in-app product) exactly.
- The code always uses `productType: "inapp"`, and `purchaseProduct` is called with `isConsumable: false`.
- **No price is stored in code.** `getProducts` returns `priceString` in the player's currency.

## Who decides ownership

The **store** decides. The app asks it:

- at launch (`start()`),
- whenever the app comes to the foreground (`visibilitychange`, skipped while a purchase sheet is up),
- and on iOS, on every `transactionUpdated` event: Ask to Buy approvals, purchases on another device, refunds.

`OWNED_KEY` (`colourjars.removeAds.v1`, `"1"`/`"0"`) is only a **cache**, so an offline launch doesn't show an ad to someone who paid.

- A query that **fails** leaves the cache alone.
- Only a query that **succeeds** without the product clears it, so a refund brings ads back.
- It's a separate key from progress and prefs, so **"Reset progress" can never remove a purchase.**

`refresh()` is a single queued query. A call that arrives while one is running runs again after it.

1. **Android:** `restorePurchases()` first. It finds purchases that finished while the app was closed (for example a pending payment that cleared), acknowledges them, and shows nothing.
2. `getPurchases(...)`:
   - iOS: `{onlyCurrentEntitlements: true}`, so refunds and revocations drop out.
   - Android: `{productType: "inapp"}`.
3. `findOwned(purchases)`:
   - Ignores other products and anything with `revocationDate`.
   - Android: `purchaseState "1"` means owned, `"2"` means pending.
   - iOS: being listed means owned.
4. **Stale-answer guard:** if the purchase isn't found but `buy()` succeeded after this query was sent (`boughtAt >= askedAt`), ignore the answer.

## API (`window.Purchases`)

| Member | Behaviour |
|---|---|
| `available()` | iOS/Android native only. On web the rows stay hidden. |
| `adsRemoved()` | The cached ownership; `ads.js` calls it on every ad call. |
| `status()` | `{available, owned, pending, busy, price}` |
| `buy()` | Returns one of the results below. Shows no sheet if already owned or busy. |
| `restore()` | Calls `restorePurchases()` then `refresh()`. Resolves to owned or not. May ask for the Apple ID password, so call it **only from a tap**. |
| `refresh()`, `loadProduct()` | Silent store queries. |
| `onChange(fn)` | Called on every status change. The app re-renders both purchase surfaces. |

`buy()` results:

- `'owned'`: bought now, or already owned.
- `'pending'`: waiting on a slow payment method or a parent's approval. Ads switch off by themselves when it completes.
- `'cancelled'`: the player closed the sheet. Show nothing.
- `'failed'`: anything else.

How errors are classified:

- `USER_CANCEL` or `cancel` → `'cancelled'`
- `pending` → `'pending'`
- `ITEM_ALREADY_OWNED` → refresh, then report the result
- anything else → `'failed'`

`start()` runs when the script loads, so `store.js` must load first.

## How it connects to ads

- `ads.js` `removed()` reads `Purchases.adsRemoved()` live:
  - `init()` resolves `false` and never starts Unity.
  - `warm`, `noteLevelComplete` and `maybeShowInterstitial` do nothing.
- A purchase takes effect at the next level and a refund brings ads back, with no restart either way.
- In Privacy & Data, the "Personalised ads" switch is disabled while ads are removed. Its note reads "You removed ads, so there are none to personalise."

## UI

### Settings rows (app only, hidden on web)

- **Remove ads:** a `.settings-row--stack` row whose button shows the store price, or "Remove" until the price arrives.
  - Note: "Pay once, no more ads. Stays removed if you reinstall or change phone."
  - Owned: the button says "Removed" and is disabled. Note: "Thank you! Ads are gone for good."
  - Pending: the button says "Pending" and is disabled. Note: "Waiting for the payment to be approved. Ads switch off by themselves when it goes through."
  - Busy: "…".
  - Failed: "The purchase did not go through. Check your connection and try again."
- **"Bought it already?" with a Restore button.** Apple requires it.
  - It's disabled while busy or once owned.
  - Results: "Restored. Ads are gone for good." or "No Remove Ads purchase found for this Apple ID." (iOS) / "…Google account." (Android).

### Home menu button `#home-remove-ads`

- **Labels:** "Remove ads · £1.99", with a short "No ads" label for short phones (CSS media query `max-height: 760px and max-width: 560px`). Both spans and the price are added as text nodes, **never `innerHTML`**, because the price string comes from the store.
- **Busy:** "…".
- **Pending:** "Pending", disabled.
- **After buying:** "Thank you!" for 2.5 s, then hidden. Once owned it stays hidden.
- **Failed or pending from the home button:** opens Settings with the explanation, next to Restore.

## Store setup

### App Store Connect

1. Create an In-App Purchase, type **Non-Consumable**, with product ID `remove_ads`, a price, a display name, a description and a **review screenshot**, so it reaches "Ready to Submit".
2. **Attach it to the app version** under "In-App Purchases and Subscriptions" and submit them together. Apple reviews a first IAP alongside an app version. If it's left off, the product won't load and the reviewer may reject the app because the purchase fails.
3. Sign the **Paid Apps Agreement** and fill in banking and tax. Without it the store returns no products in production.
4. **Test from TestFlight.** It uses sandbox accounts, and the product works once it's "Ready to Submit".

### Play Console

1. Upload a build that includes the billing permission to a testing track **first**. Play only allows in-app products after such a build exists.
2. Go to Monetize → Products → In-app products, create `remove_ads` and set it to **Active**.
3. Set up a payments profile (merchant account).
4. **Test** from an internal testing build with your account added as a **license tester**. Test purchases aren't charged.

**If the price appears on the button and a test purchase removes ads, the setup works.**

## Tests

[purchases.test.js](../assets/test/purchases.test.js) covers:

- A fresh install shows the price.
- Buying is remembered.
- iOS asks only for current entitlements.
- A failed query keeps the cache.
- Cancel changes nothing.
- A pending purchase unlocks later.
- An Android pending purchase found at launch shows as pending.
- Android acknowledges before reading.
- "Already owned" leads to a restore.
- Restore finds a purchase made on another device.
- A stale query can't undo a purchase.
- iOS listens for `transactionUpdated`.
- Web has no store.
