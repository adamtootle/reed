// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "reed",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "reed", targets: ["reed"]),
        .executable(name: "dev", targets: ["dev"]),
    ],
    dependencies: [
        .package(url: "https://github.com/hummingbird-project/hummingbird", from: "2.0.0"),
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.3.0"),
    ],
    targets: [
        .executableTarget(
            name: "reed",
            dependencies: [
                .product(name: "Hummingbird", package: "hummingbird"),
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
            ],
            resources: [
                .copy("Resources")
            ]
        ),
        // `swift run dev [path]` — orchestrates the Swift backend and Vite dev server
        // as one foregrounded command. Not packaged in release builds.
        .executableTarget(
            name: "dev"
        ),
        .testTarget(
            name: "reedTests",
            dependencies: ["reed"]
        ),
    ]
)
