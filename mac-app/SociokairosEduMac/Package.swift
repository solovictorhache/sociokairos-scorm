// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "SociokairosEduMac",
    platforms: [
        .macOS(.v12)
    ],
    targets: [
        .executableTarget(
            name: "SociokairosEduMac",
            resources: [
                .copy("Resources/scorm_plugin")
            ]
        )
    ]
)
