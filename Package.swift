// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "reed",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "reed", targets: ["reed"])
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
        .testTarget(
            name: "reedTests",
            dependencies: ["reed"]
        ),
    ]
)
