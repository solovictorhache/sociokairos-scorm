import SwiftUI

// Punto de entrada de la app. Sin AppDelegate ni NSApplicationMain manual:
// el ciclo de vida de SwiftUI (App + WindowGroup) ya arranca NSApplication
// por sí solo en macOS.
@main
struct SociokairosEduMacApp: App {
    var body: some Scene {
        WindowGroup("SOCIOKAIROS EDU — Research Suite") {
            SociokairosWebView()
                .frame(minWidth: 960, minHeight: 640)
        }
    }
}
