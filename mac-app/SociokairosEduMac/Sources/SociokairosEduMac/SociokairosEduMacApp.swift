import SwiftUI
import AppKit

// Al ser un ejecutable de Swift Package Manager puro (sin .xcodeproj, sin
// Info.plist propio), macOS a veces no reconoce el proceso como una app de
// verdad al arrancarlo desde Xcode: la ventana aparece, pero la app nunca
// pasa a primer plano ni se activa como app "regular" — y sin eso, ninguna
// ventana suya llega a ser la ventana clave (key window), así que ningún
// makeFirstResponder interno (ver FocusableWKWebView) sirve de nada porque
// el teclado del sistema sigue entregándose a otra aplicación (p.ej. Xcode
// o Finder). Se fuerza aquí explícitamente lo que un .app bundle normal
// obtiene gratis del sistema.
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
}

@main
struct SociokairosEduMacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup("SOCIOKAIROS EDU — Research Suite") {
            SociokairosWebView()
                .frame(minWidth: 960, minHeight: 640)
        }
    }
}
