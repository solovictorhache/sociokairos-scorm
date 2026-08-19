import SwiftUI
import WebKit
import AppKit

/// Envuelve un WKWebView que carga scorm_plugin/index.html tal cual (mismo
/// motor/interfaz que Moodle, sin ninguna copia ni modificación) y le
/// inyecta un puente JS que IMITA la forma de `window.__TAURI__` que ya
/// espera `descargarBlob()` en src/wiring.js — así no hace falta tocar ni
/// una línea del motor para que "Exportar Word/CSV" use el diálogo nativo
/// "Guardar como…" de macOS en vez del hack de descarga del navegador.
///
/// El puente usa el WKScriptMessageHandler clásico (sin "WithReply", más
/// sensible a la versión exacta del SDK) más un registro de promesas por
/// ID en JS que se resuelve llamando de vuelta con evaluateJavaScript —
/// el patrón estándar y estable para este tipo de puente nativo↔JS.
/// Subclase mínima de WKWebView que se pide a sí misma el foco del teclado
/// en cuanto AppKit la ancla de verdad a una ventana. `viewDidMoveToWindow()`
/// es el punto determinista del ciclo de vida de NSView para esto — a
/// diferencia de un `DispatchQueue.main.async` en `makeNSView`, que puede
/// ejecutarse ANTES de que la vista tenga ventana todavía (la ventana de
/// SwiftUI puede tardar más de un tick de runloop en aparecer al arrancar),
/// dejando el `makeFirstResponder` en un no-op silencioso y el textarea sin
/// poder recibir texto.
final class FocusableWKWebView: WKWebView {
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        window?.makeFirstResponder(self)
    }
}

struct SociokairosWebView: NSViewRepresentable {
    func makeNSView(context: Context) -> WKWebView {
        let contentController = WKUserContentController()

        let bridgeScript = WKUserScript(
            source: SociokairosBridge.tauriShimSource,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        contentController.addUserScript(bridgeScript)
        contentController.add(context.coordinator, name: "sociokairosSave")
        contentController.add(context.coordinator, name: "sociokairosWrite")

        let config = WKWebViewConfiguration()
        config.userContentController = contentController

        let webView = FocusableWKWebView(frame: .zero, configuration: config)
        context.coordinator.webView = webView

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

    func updateNSView(_ nsView: WKWebView, context: Context) {
        // Sin refuerzo aquí a propósito: reclamar el foco en cada paso de
        // SwiftUI competiría con el foco interno que WebKit gestiona para
        // el propio contenido editable (el textarea) mientras el usuario
        // escribe. El foco inicial ya queda garantizado por
        // FocusableWKWebView.viewDidMoveToWindow().
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    /// Atiende los dos mensajes del puente: "sociokairosSave" (abre
    /// NSSavePanel y devuelve la ruta elegida, o null si se cancela) y
    /// "sociokairosWrite" (escribe los bytes recibidos en esa ruta). Cada
    /// mensaje trae un `__callbackId` puesto por el lado JS; la respuesta
    /// se entrega llamando a `window.__sociokairosResolve/Reject(id, ...)`
    /// vía evaluateJavaScript, que a su vez resuelve/rechaza la Promise
    /// que `window.__TAURI__.dialog.save(...)` / `.fs.writeFile(...)`
    /// devolvió — encaja tal cual con los `await` que ya usa wiring.js.
    final class Coordinator: NSObject, WKScriptMessageHandler {
        weak var webView: WKWebView?

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard
                let body = message.body as? [String: Any],
                let callbackId = body["__callbackId"] as? Int
            else { return }

            switch message.name {
            case "sociokairosSave":
                let defaultPath = (body["defaultPath"] as? String) ?? "archivo"
                DispatchQueue.main.async { [weak self] in
                    let panel = NSSavePanel()
                    panel.nameFieldStringValue = defaultPath
                    panel.canCreateDirectories = true
                    let response = panel.runModal()
                    if response == .OK, let url = panel.url {
                        self?.resolve(callbackId, jsonEncodedValue: url.path)
                    } else {
                        self?.resolveNull(callbackId)
                    }
                }

            case "sociokairosWrite":
                guard
                    let path = body["path"] as? String,
                    let base64 = body["base64"] as? String,
                    let data = Data(base64Encoded: base64)
                else {
                    reject(callbackId, message: "Datos inválidos al escribir el archivo.")
                    return
                }
                DispatchQueue.main.async { [weak self] in
                    do {
                        try data.write(to: URL(fileURLWithPath: path))
                        self?.resolve(callbackId, jsonEncodedValue: true)
                    } catch {
                        self?.reject(callbackId, message: error.localizedDescription)
                    }
                }

            default:
                break
            }
        }

        private func resolve(_ callbackId: Int, jsonEncodedValue: Any) {
            guard let payload = try? JSONSerialization.data(withJSONObject: [jsonEncodedValue], options: []),
                  let arrayJson = String(data: payload, encoding: .utf8) else {
                resolveNull(callbackId)
                return
            }
            // arrayJson es algo como '["/ruta/al/archivo"]' o '[true]';
            // se extrae el único elemento con [1..<count-1] para pasarlo tal
            // cual como valor JS.
            let valueJson = String(arrayJson.dropFirst().dropLast())
            webView?.evaluateJavaScript("window.__sociokairosResolve(\(callbackId), \(valueJson));", completionHandler: nil)
        }

        private func resolveNull(_ callbackId: Int) {
            webView?.evaluateJavaScript("window.__sociokairosResolve(\(callbackId), null);", completionHandler: nil)
        }

        private func reject(_ callbackId: Int, message: String) {
            guard let payload = try? JSONSerialization.data(withJSONObject: [message], options: []),
                  let arrayJson = String(data: payload, encoding: .utf8) else {
                webView?.evaluateJavaScript("window.__sociokairosReject(\(callbackId), \"Error desconocido\");", completionHandler: nil)
                return
            }
            let valueJson = String(arrayJson.dropFirst().dropLast())
            webView?.evaluateJavaScript("window.__sociokairosReject(\(callbackId), \(valueJson));", completionHandler: nil)
        }
    }
}

enum SociokairosBridge {
    static let tauriShimSource = """
    (function () {
      let nextCallbackId = 1;
      const pending = {};

      window.__sociokairosResolve = function (id, value) {
        const p = pending[id];
        if (p) { delete pending[id]; p.resolve(value); }
      };
      window.__sociokairosReject = function (id, message) {
        const p = pending[id];
        if (p) { delete pending[id]; p.reject(new Error(message)); }
      };

      function callNative(handlerName, payload) {
        return new Promise(function (resolve, reject) {
          const id = nextCallbackId++;
          pending[id] = { resolve: resolve, reject: reject };
          payload.__callbackId = id;
          window.webkit.messageHandlers[handlerName].postMessage(payload);
        });
      }

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
            return callNative("sociokairosSave", { defaultPath: (opts && opts.defaultPath) || "" });
          }
        },
        fs: {
          writeFile: function (path, bytes) {
            var arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
            return callNative("sociokairosWrite", { path: path, base64: bytesToBase64(arr) });
          }
        }
      };
    })();
    """
}
