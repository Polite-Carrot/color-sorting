package com.politecarrot.capacitor.unityads;

import android.app.Activity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.unity3d.ads.InitializationConfiguration;
import com.unity3d.ads.InterstitialAd;
import com.unity3d.ads.InterstitialShowListener;
import com.unity3d.ads.LoadConfiguration;
import com.unity3d.ads.ShowConfiguration;
import com.unity3d.ads.ShowFinishState;
import com.unity3d.ads.UnityAds;
import com.unity3d.ads.UnityAdsError;

/**
 * Unity Ads interstitials and ad consent for Android.
 *
 * Deliberately mirrors ios/Sources/UnityAdsPlugin/UnityAdsPlugin.swift method
 * for method and result shape for result shape, so js/ads.js drives both
 * platforms through one code path. Expected failures (no fill, nothing loaded)
 * resolve with a flag rather than rejecting, so the game never sees an
 * unhandled promise; only programming errors reject.
 *
 * The name below must stay "UnityAds" — js/ads.js looks the plugin up by it.
 */
@CapacitorPlugin(name = "UnityAds")
public class UnityAdsPlugin extends Plugin {

    private InterstitialAd interstitial = null;
    private String loadedPlacement = null;
    private boolean loading = false;
    private PluginCall showCall = null;

    // MARK: - Initialisation and consent

    @PluginMethod
    public void initialize(PluginCall call) {
        String gameId = call.getString("gameId");
        if (gameId == null || gameId.isEmpty()) {
            call.reject("gameId is required");
            return;
        }
        if (UnityAds.isInitialized()) {
            JSObject result = new JSObject();
            result.put("initialized", true);
            call.resolve(result);
            return;
        }
        boolean testMode = Boolean.TRUE.equals(call.getBoolean("testMode", false));
        // Context comes from Unity's androidx.startup AdsSdkInitializer, which is
        // why this builder takes none.
        InitializationConfiguration config = new InitializationConfiguration.Builder(gameId)
            .withTestMode(testMode)
            .build();
        UnityAds.initialize(config, error -> {
            if (error != null) {
                call.reject(error.getMessage(), String.valueOf(error.getCode()));
            } else {
                JSObject result = new JSObject();
                result.put("initialized", true);
                call.resolve(result);
            }
        });
    }

    /**
     * granted = the player turned personalised ads on. Android has no ATT, so
     * unlike iOS there is no second gate. Unity reads these flags on every ad
     * request, so they can be set before or after initialize().
     */
    @PluginMethod
    public void setConsent(PluginCall call) {
        boolean granted = Boolean.TRUE.equals(call.getBoolean("granted", false));
        UnityAds.setUserConsent(granted);
        UnityAds.setUserOptOut(!granted);
        call.resolve();
    }

    // MARK: - Interstitials

    @PluginMethod
    public void prepareInterstitial(PluginCall call) {
        final String placementId = call.getString("placementId");
        if (placementId == null || placementId.isEmpty()) {
            call.reject("placementId is required");
            return;
        }
        // force: the consent answer changed, so an ad loaded under the old
        // answer is thrown away and a new one requested.
        if (Boolean.TRUE.equals(call.getBoolean("force", false))) {
            interstitial = null;
            loadedPlacement = null;
        }
        if (interstitial != null && placementId.equals(loadedPlacement)) {
            resolveLoaded(call, true, null, null);
            return;
        }
        if (loading) {
            resolveLoaded(call, false, "already loading", null);
            return;
        }
        loading = true;
        LoadConfiguration config = new LoadConfiguration.Builder(placementId).build();
        InterstitialAd.load(config, (ad, error) -> {
            loading = false;
            if (ad != null) {
                ad.setOnAdExpired(expired -> {
                    interstitial = null;
                    loadedPlacement = null;
                });
                interstitial = ad;
                loadedPlacement = placementId;
                resolveLoaded(call, true, null, null);
            } else {
                interstitial = null;
                loadedPlacement = null;
                resolveLoaded(call, false,
                    error != null ? error.getMessage() : "no fill",
                    error != null ? String.valueOf(error.getCode()) : null);
            }
        });
    }

    @PluginMethod
    public void showInterstitial(PluginCall call) {
        final InterstitialAd ad = interstitial;
        if (ad == null) {
            resolveShown(call, false, null, "not loaded", null);
            return;
        }
        final Activity activity = getActivity();
        if (activity == null) {
            resolveShown(call, false, null, "no activity", null);
            return;
        }
        if (showCall != null) {
            resolveShown(call, false, null, "already showing", null);
            return;
        }
        // An interstitial can be shown once; drop it now so the next
        // prepareInterstitial loads a fresh one.
        interstitial = null;
        loadedPlacement = null;
        showCall = call;
        activity.runOnUiThread(() ->
            ad.show(activity, new ShowConfiguration.Builder().build(), new InterstitialShowListener() {
                @Override
                public void onStarted(InterstitialAd shown) {}

                @Override
                public void onClicked(InterstitialAd shown) {}

                @Override
                public void onCompleted(InterstitialAd shown, ShowFinishState finishState) {
                    finishShow(true,
                        finishState == ShowFinishState.COMPLETED ? "completed" : "skipped",
                        null, null);
                }

                @Override
                public void onFailed(InterstitialAd shown, UnityAdsError error) {
                    finishShow(false, null,
                        error != null ? error.getMessage() : "show failed",
                        error != null ? String.valueOf(error.getCode()) : null);
                }
            })
        );
    }

    // MARK: - App Tracking Transparency
    // iOS-only in substance. js/ads.js returns before calling these on Android,
    // but they exist so the two plugins present the same surface.

    @PluginMethod
    public void trackingAuthorizationStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("status", "notApplicable");
        call.resolve(result);
    }

    @PluginMethod
    public void requestTrackingAuthorization(PluginCall call) {
        JSObject result = new JSObject();
        result.put("status", "notApplicable");
        call.resolve(result);
    }

    // MARK: - Helpers

    private void resolveLoaded(PluginCall call, boolean loaded, String reason, String code) {
        JSObject result = new JSObject();
        result.put("loaded", loaded);
        if (reason != null) result.put("reason", reason);
        if (code != null) result.put("code", code);
        call.resolve(result);
    }

    private void resolveShown(PluginCall call, boolean shown, String finishState, String reason, String code) {
        JSObject result = new JSObject();
        result.put("shown", shown);
        if (finishState != null) result.put("finishState", finishState);
        if (reason != null) result.put("reason", reason);
        if (code != null) result.put("code", code);
        call.resolve(result);
    }

    private void finishShow(boolean shown, String finishState, String reason, String code) {
        PluginCall call = showCall;
        showCall = null;
        if (call != null) resolveShown(call, shown, finishState, reason, code);
    }
}
