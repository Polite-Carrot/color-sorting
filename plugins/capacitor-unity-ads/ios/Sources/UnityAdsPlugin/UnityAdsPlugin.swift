import Foundation
import UIKit
import Capacitor
import UnityAds
import AppTrackingTransparency

/// Unity Ads interstitials, ad consent and App Tracking Transparency for iOS.
///
/// JS name: "UnityAds" (see js/ads.js). Every method resolves rather than
/// rejects for "expected" failures (no fill, not ready) so the game never
/// sees an unhandled promise; real errors reject with Unity's code/message.
///
/// The class annotation below must stay the only objc-with-a-name annotation
/// in this file, comments included: `cap sync` registers the first one it
/// finds as the plugin class (writing the literal pattern in a comment once
/// made it register a class called "Name").
@objc(UnityAdsPlugin)
public class UnityAdsPlugin: CAPPlugin, CAPBridgedPlugin, UADSInterstitialShowDelegate {
    public let identifier = "UnityAdsPlugin"
    public let jsName = "UnityAds"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setConsent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareInterstitial", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showInterstitial", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "trackingAuthorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestTrackingAuthorization", returnType: CAPPluginReturnPromise)
    ]

    private var interstitial: UADSInterstitialAd?
    private var loadedPlacement: String?
    private var loading = false
    private var showCall: CAPPluginCall?

    // MARK: - Initialisation and consent

    @objc func initialize(_ call: CAPPluginCall) {
        guard let gameId = call.getString("gameId"), !gameId.isEmpty else {
            call.reject("gameId is required")
            return
        }
        if UnityAds.isInitialized() {
            call.resolve(["initialized": true])
            return
        }
        let testMode = call.getBool("testMode") ?? false
        let config = UADSInitializationConfigurationBuilder(gameId: gameId)
            .with(testMode: testMode)
            .build()
        UnityAds.initialize(config) { error in
            if let error = error {
                call.reject(error.message, String(error.code))
            } else {
                call.resolve(["initialized": true])
            }
        }
    }

    /// granted = the player turned personalised ads on AND iOS tracking is
    /// authorised. Unity reads these flags on every ad request, so they can be
    /// set before or after initialize().
    @objc func setConsent(_ call: CAPPluginCall) {
        let granted = call.getBool("granted") ?? false
        UnityAds.setUserConsent(granted)
        UnityAds.setUserOptOut(!granted)
        call.resolve()
    }

    // MARK: - Interstitials

    @objc func prepareInterstitial(_ call: CAPPluginCall) {
        guard let placementId = call.getString("placementId"), !placementId.isEmpty else {
            call.reject("placementId is required")
            return
        }
        // force: the consent answer changed, so an ad loaded under the old
        // answer is thrown away and a new one requested.
        let force = call.getBool("force") ?? false
        DispatchQueue.main.async {
            if force {
                self.interstitial = nil
                self.loadedPlacement = nil
            }
            if self.interstitial != nil && self.loadedPlacement == placementId {
                call.resolve(["loaded": true])
                return
            }
            if self.loading {
                call.resolve(["loaded": false, "reason": "already loading"])
                return
            }
            self.loading = true
            let config = UADSLoadConfigurationBuilder(placementId: placementId).build()
            UADSInterstitialAd.load(config) { ad, error in
                DispatchQueue.main.async {
                    self.loading = false
                    if let ad = ad {
                        ad.onAdExpired = { [weak self] _ in
                            DispatchQueue.main.async {
                                self?.interstitial = nil
                                self?.loadedPlacement = nil
                            }
                        }
                        self.interstitial = ad
                        self.loadedPlacement = placementId
                        call.resolve(["loaded": true])
                    } else {
                        self.interstitial = nil
                        self.loadedPlacement = nil
                        call.resolve([
                            "loaded": false,
                            "reason": error?.message ?? "no fill",
                            "code": error?.code ?? -1
                        ])
                    }
                }
            }
        }
    }

    @objc func showInterstitial(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let ad = self.interstitial else {
                call.resolve(["shown": false, "reason": "not loaded"])
                return
            }
            guard let vc = self.bridge?.viewController else {
                call.resolve(["shown": false, "reason": "no view controller"])
                return
            }
            if self.showCall != nil {
                call.resolve(["shown": false, "reason": "already showing"])
                return
            }
            // An interstitial can be shown once; drop it now so the next
            // prepareInterstitial loads a fresh one.
            self.interstitial = nil
            self.loadedPlacement = nil
            self.showCall = call
            let config = UADSShowConfigurationBuilder().with(viewController: vc).build()
            ad.show(config, delegate: self)
        }
    }

    public func showDidStart(_ unityAd: UADSInterstitialAd) {}

    public func showDidClick(_ unityAd: UADSInterstitialAd) {}

    public func showDidComplete(_ unityAd: UADSInterstitialAd, with finishState: UADSShowFinishState) {
        DispatchQueue.main.async {
            self.showCall?.resolve([
                "shown": true,
                "finishState": finishState == .completed ? "completed" : "skipped"
            ])
            self.showCall = nil
        }
    }

    public func showDidFail(_ unityAd: UADSInterstitialAd, error: UnityAdsError) {
        DispatchQueue.main.async {
            self.showCall?.resolve(["shown": false, "reason": error.message, "code": error.code])
            self.showCall = nil
        }
    }

    // MARK: - App Tracking Transparency
    // Same result shape as the AdMob plugin's methods, so js/ads.js treats
    // both platforms alike: { status: authorized | denied | notDetermined | restricted }.

    @objc func trackingAuthorizationStatus(_ call: CAPPluginCall) {
        call.resolve(["status": Self.statusString(ATTrackingManager.trackingAuthorizationStatus)])
    }

    @objc func requestTrackingAuthorization(_ call: CAPPluginCall) {
        // iOS only shows the prompt while the app is active; the request is
        // silently answered "notDetermined" otherwise, so wait for active.
        DispatchQueue.main.async {
            if UIApplication.shared.applicationState == .active {
                self.requestTracking(call)
            } else {
                var token: NSObjectProtocol?
                token = NotificationCenter.default.addObserver(
                    forName: UIApplication.didBecomeActiveNotification,
                    object: nil,
                    queue: .main
                ) { _ in
                    if let t = token { NotificationCenter.default.removeObserver(t) }
                    self.requestTracking(call)
                }
            }
        }
    }

    private func requestTracking(_ call: CAPPluginCall) {
        ATTrackingManager.requestTrackingAuthorization { status in
            call.resolve(["status": Self.statusString(status)])
        }
    }

    private static func statusString(_ status: ATTrackingManager.AuthorizationStatus) -> String {
        switch status {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "notDetermined"
        }
    }
}
