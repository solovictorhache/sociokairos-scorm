import SwiftUI
import WebKit
import AppKit

/// Envuelve un WKWebView que carga scorm_plugin/index.html tal cual (mismo
/// motor/interfaz que Moodle, sin ninguna copia ni modificación) y le
/// inyecta un puente JS que IMITA la forma de `window.__TAURI__` que ya
/// espera `descargarBlob()` en src/wiring.js — así no hace falta tocar ni
/// una línea del motor para que "Exportar Word/CSV" use el diálogo nativo
/// "Guardar como…" de macOS en vez del hack de descarga del navegador.
struct SociokairosWebView: NSViewRepresentable {
    func makeNSView(context: Context) -> WKWebView {
        let contentController = WKUserContentController()

        let bridgeScript = WKUserScript(
            source: SociokairosBridge.tauriShimSource,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        contentController.addUserScript(bridgeScript)
        contentController.add(context.coordinator, contentWorld: .page, name: "sociokairosSave")
        contentController.add(context.coordinator, contentWorld: .page, name: "sociokairosWrite")

        let config = WKWebViewConfiguration()
        config.userContentController = contentController

        let webView = WKWebView(frame: .zero, configuration: config)

        if let htmlURL = Bundle.module.url(forResource: "index", withExtension: "html", subdirectory: "scorm_plugin") {
            let readAccessDir = htmlURL.deletingLastPathComponent()
            webView.loadFileURL(htmlURL, allowingReadAccessTo: readAccessDir)
        } else {
            webView.loadHTMLString(
                "<p style='font-family:-apple-system;padding:40px;'>No se encontró scorm_plugin/index.html en los recursos de la app. Ejecuta <code>python3 mac-app/sync_resources.py</code> y vuelve a compilar.</p>",
                baseURL: nil
            )
        }

        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    /// Atiende los dos mensajes del puente: "sociokairosSave" (abre
    /// NSSavePanel y devuelve la ruta elegida, o null si se cancela) y
    /// "sociokairosWrite" (escribe los bytes recibidos en esa ruta).
    /// Ambos usan WKScriptMessageHandlerWithReply, que hace que
    /// `postMessage(...)` en JS devuelva directamente una Promise resuelta
    /// con lo que aquí se pasa a replyHandler — encaja tal cual con el
    /// `await window.__TAURI__.dialog.save(...)` / `.fs.writeFile(...)`
    /// que ya usa wiring.js.
    final class Coordinator: NSObject, WKScriptMessageHandlerWithReply {
        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage,
            replyHandler: @escaping (Any?, String?) -> Void
        ) {
            switch message.name {
            case "sociokairosSave":
                let body = message.body as? [String: Any]
                let defaultPath = (body?["defaultPath"] as? String) ?? "archivo"
                DispatchQueue.main.async {
                    let panel = NSSavePanel()
                    panel.nameFieldStringValue = defaultPath
                    panel.canCreateDirectories = true
                    let response = panel.runModal()
                    if response == .OK, let url = panel.url {
                        replyHandler(url.path, nil)
                    } else {
                        replyHandler(NSNull(), nil)
                    }
                }

            case "sociokairosWrite":
                guard
                    let body = message.body as? [String: Any],
                    let path = body["path"] as? String,
                    let base64 = body["base64"] as? String,
                    let data = Data(base64Encoded: base64)
                else {
                    replyHandler(nil, "Datos inválidos al escribir el archivo.")
                    return
                }
                DispatchQueue.main.async {
                    do {
                        try data.write(to: URL(fileURLWithPath: path))
                        replyHandler(true, nil)
                    } catch {
                        replyHandler(nil, error.localizedDescription)
                    }
                }

            default:
                replyHandler(nil, nil)
            }
        }
    }
}

enum SociokairosBridge {
    static let tauriShimSource = """
    (function () {
      function bytesToBase64(bytes) {
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
      }
      window.__TAURI__ = {
        dialog: {
          save: function (opts) {
            return window.webkit.messageHandlers.sociokairosSave.postMessage({
              defaultPath: (opts && opts.defaultPath) || ""
            });
          }
        },
        fs: {
          writeFile: function (path, bytes) {
            var arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
            var base64 = bytesToBase64(arr);
            return window.webkit.messageHandlers.sociokairosWrite.postMessage({ path: path, base64: base64 });
          }
        }
      };
    })();
    """
}
