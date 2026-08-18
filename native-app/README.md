# SOCIOKAIROS EDU — app de escritorio (Mac/Windows)

Empaquetado nativo con [Tauri](https://tauri.app/) del mismo `scorm_plugin/index.html`
que ya usas en Moodle: el motor heurístico, la interfaz y la exportación
Word/CSV son literalmente los mismos archivos (`src/engine.js`, `src/wiring.js`,
etc.), sin duplicar nada. Lo único que cambia es el guardado de archivos:
dentro de esta app, exportar a Word o CSV abre el diálogo nativo
**"Guardar como…"** del sistema operativo en vez de descargar al navegador.

No hace falta tocar nada de Moodle/SCORM para usar esto: son dos empaquetados
distintos del mismo motor, y siguen viviendo en el mismo repo.

## Por qué Tauri y no Electron

Instalador de pocos MB (usa el WebView nativo del sistema — WKWebView en
macOS — en vez de empaquetar todo Chromium), arranque más rápido y menos
RAM. El razonamiento completo está en `../ROADMAP.md`, sección 1.

## Requisitos previos (una vez, en tu Mac)

1. **Rust** (el CLI de Tauri lo necesita para compilar el binario nativo):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
   Sigue las instrucciones en pantalla y reinicia la terminal cuando termine.

2. **Xcode Command Line Tools** (herramientas de compilación de Apple):
   ```bash
   xcode-select --install
   ```

3. **Node.js** (18 o superior). Si ya usas SOCIOKAIROS para los tests del
   repo principal, ya lo tienes.

## Poner en marcha el modo desarrollo

```bash
cd native-app
npm install
npm run dev
```

La primera vez, `cargo` descargará y compilará las dependencias nativas de
Tauri — tarda unos minutos. Después se abre una ventana con SOCIOKAIROS EDU
funcionando tal cual, con recarga en caliente si editas `src/*.js` o
`src/*.html` en la carpeta del repo principal (el script `build:engine` se
ejecuta automáticamente antes de cada arranque, así que siempre ves el motor
más reciente).

Prueba el flujo completo: escribe un problema, reformula, usa el selector
VI/VD, exporta a Word — debería aparecerte el diálogo nativo de macOS para
elegir dónde guardar el `.docx`, en vez de ir a Descargas automáticamente.

## Generar el icono real de la app

El repo trae un icono provisional (el logo tal cual, sin los tamaños que
macOS necesita para el `.icns`). Antes de tu primer build de distribución,
genera el set completo una vez:

```bash
cd native-app
npm run icon
```

Esto sobrescribe `src-tauri/icons/` con todos los tamaños/formatos que
Windows y macOS necesitan (incluido el `.icns`).

## Compilar la app instalable (.app / .dmg)

```bash
cd native-app
npm run build
```

El resultado queda en:
- `src-tauri/target/release/bundle/macos/SOCIOKAIROS EDU.app`
- `src-tauri/target/release/bundle/dmg/SOCIOKAIROS EDU_1.0.0_aarch64.dmg` (o `x64` según tu Mac)

La primera vez que abras el `.app` sin firmar, macOS (Gatekeeper) puede
avisar de "desarrollador no identificado" — clic derecho → Abrir la primera
vez es suficiente en local. Para distribuirla fuera de tu propio Mac sin ese
aviso hace falta firmarla y notarizarla con una cuenta de Apple Developer
(ver `../ROADMAP.md`, apartado "Distribución" — no es necesario para probarla
tú mismo).

## Qué NO cambia respecto al SCORM/web

- El motor (`engine.js`), la interfaz (`body.html`/`head.html`) y la
  exportación Word/CSV (`informe-word.js`, `docxwriter.js`) son exactamente
  los mismos archivos que usa `scorm_plugin/index.html`. `native-app/`
  no tiene una copia propia: `tauri.conf.json` apunta su `frontendDist`
  directamente a `../../scorm_plugin`, y ejecuta `python3 ../src/build.py`
  antes de cada arranque/build para que siempre esté actualizado.
- Fuera de Moodle, el aviso de "Modo independiente: no se detectó ningún
  LMS" sigue apareciendo igual que en el navegador — es esperable, esta app
  no habla con ningún SCORM.
- Solo `descargarBlob()` en `src/wiring.js` cambia de comportamiento: detecta
  `window.__TAURI__` y usa el diálogo nativo si existe; si no (navegador,
  SCORM en Moodle, Artifact de Claude), sigue exactamente igual que antes.

## Estructura de esta carpeta

```
native-app/
├── package.json          # scripts npm (dev/build/icon) + @tauri-apps/cli
├── src-tauri/
│   ├── Cargo.toml        # dependencias Rust (tauri + plugins de diálogo/fs)
│   ├── tauri.conf.json   # ventana, frontendDist → ../../scorm_plugin, bundle
│   ├── build.rs
│   ├── src/main.rs       # registra los plugins de diálogo nativo y fs
│   ├── capabilities/     # permisos: solo diálogo "Guardar como" + escritura
│   │                       del archivo elegido — nada más
│   └── icons/            # icono de la app (provisional, ver «Generar…» arriba)
└── README.md              # este archivo
```
