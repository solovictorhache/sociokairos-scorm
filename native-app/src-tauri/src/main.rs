// SOCIOKAIROS EDU — envoltorio de escritorio (Tauri).
//
// No hay lógica propia aquí: el motor heurístico, la interfaz y la
// exportación Word/CSV viven íntegros en scorm_plugin/index.html (ver
// frontendDist en tauri.conf.json) y se cargan tal cual dentro del WebView
// nativo del sistema operativo. Este binario solo abre la ventana y
// registra los plugins de diálogo nativo ("Guardar como…") y escritura en
// disco que wiring.js usa para sustituir el hack de descarga del navegador
// cuando detecta que se está ejecutando dentro de Tauri (window.__TAURI__).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación SOCIOKAIROS EDU");
}
