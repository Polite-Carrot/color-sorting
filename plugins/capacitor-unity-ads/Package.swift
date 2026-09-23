// swift-tools-version: 5.9
//
// Unity Ads for Color Match & Merge — iOS only.
//
// Why this is a local plugin rather than an npm package: the one Unity Ads
// Capacitor plugin on npm (capacitor-unity-ads 1.0.0) cannot build in this
// project. Its Package.swift caps Capacitor at 7.x while the app pins 8.5.0,
// and it depends on github.com/Unity-Technologies/unity-ads-ios as a Swift
// package — a repository that has never shipped a Package.swift (checked at
// 4.9.2, 4.12.0, 4.16.0 and 4.20.1). It also has no consent API.
//
// Unity distributes the SDK as a prebuilt UnityAds.xcframework inside a zip on
// each GitHub release, which Swift Package Manager consumes directly as a
// binary target. The checksum is the SHA-256 of that zip; SwiftPM refuses the
// download if it does not match, so the version is pinned exactly.
//
// To upgrade: change the version in the URL, download the new zip, and replace
// the checksum with the output of `swift package compute-checksum UnityAds.zip`
// (or `shasum -a 256 UnityAds.zip`).
//
// The package and product name must stay PolitecarrotCapacitorUnityAds: the
// Capacitor CLI derives it from the npm name "@politecarrot/capacitor-unity-ads"
// when it writes ios/App/CapApp-SPM/Package.swift, and SwiftPM matches on it.

import PackageDescription

let package = Package(
    name: "PolitecarrotCapacitorUnityAds",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "PolitecarrotCapacitorUnityAds",
            targets: ["UnityAdsPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .binaryTarget(
            name: "UnityAds",
            url: "https://github.com/Unity-Technologies/unity-ads-ios/releases/download/4.20.1/UnityAds.zip",
            checksum: "c7fba62bec9fe1f703caf83931cce65452bbfca4a3e742c338d57d845c4ad840"),
        .target(
            name: "UnityAdsPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                "UnityAds"
            ],
            path: "ios/Sources/UnityAdsPlugin")
    ]
)
