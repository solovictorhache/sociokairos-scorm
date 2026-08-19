# SOCIOKAIROS — línea Profesional (track 2), app de escritorio (Mac/Windows/Linux)

Empaquetado nativo con [Tauri](https://tauri.app/). Esta es la línea
**Profesional**, independiente de la línea SCORM/educativa (`scorm_plugin/`,
para Moodle): sin integración SCORM, sin la identidad "EDU"/UNIZAR, con tema
verde y estética más cercana a una app nativa de macOS, y contacto propio
(`contacto@sociokairos.com`).

Las dos líneas comparten el **motor heurístico** y la **exportación Word/CSV**
(`../src/engine.js`, `../src/geo-data.js`, `../src/docxwriter.js`,
`../src/informe-word.js`) — una sola fuente de verdad, cero duplicación de
lógica. Lo que diverge entre las dos es la interfaz y el empaquetado, que
viven aquí en `pro-src/`:

- `pro-src/head.html` / `pro-src/body.html` — interfaz propia (verde, sin
  overlay de arranque, sin el estado SCORM en pantalla): cabecera con
  stepper de 5 etapas (Definir · Analizar · Diseñar · Ejecutar ·
  Comunicar), sidebar de navegación e historial, y panel lateral de
  estadísticas con conteos reales del análisis (nunca inventados).
- `pro-src/wiring.js` — copia de `../src/wiring.js` sin la integración SCORM
  (nada de `scormInit`/`scormMarkCompleted`/etc.).
- `pro-src/build_pro.py` — ensambla `dist_pro/index.html` juntando lo de
  arriba con el motor compartido de `../src/`. Equivalente a `src/build.py`
  pero para esta línea.

## Por qué Tauri y no Electron

Instalador de pocos MB (usa el WebView nativo del sistema — WKWebView en
macOS, WebView2 en Windows, WebKitGTK en Linux — en vez de empaquetar todo
Chromium), arranque más rápido y menos RAM. El razonamiento completo está en
`../ROADMAP.md`, sección 1.

## Requisitos previos (una vez, en tu máquina)

1. **Rust** (el CLI de Tauri lo necesita para compilar el binario nativo):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
   Sigue las instrucciones en pantalla y reinicia la terminal cuando termine.

2. En Mac, **Xcode Command Line Tools**:
   ```bash
   xcode-select --install
   ```

3. **Node.js** (18 o superior).

## Poner en marcha el modo desarrollo

```bash
cd native-app
npm install
npm run dev
```

La primera vez, `cargo` descargará y compilará las dependencias nativas de
Tauri — tarda unos minutos. Después se abre una ventana con SOCIOKAIROS
funcionando, con recarga en caliente si editas `../src/engine.js` (el motor
compartido) o los archivos de `pro-src/` (el script `build:engine` —
`python3 pro-src/build_pro.py` — se ejecuta automáticamente antes de cada
arranque).

Prueba el flujo completo: escribe un problema, reformula, usa el selector
VI/VD, exporta a Word — debería aparecerte el diálogo nativo "Guardar
como…" del sistema, en vez de ir a Descargas automáticamente.

## Generar el icono real de la app

El repo trae un icono provisional (el logo tal cual, sin los tamaños que
macOS/Windows necesitan). Antes de tu primer build de distribución, genera
el set completo una vez:

```bash
cd native-app
npm run icon
```

## Compilar la app instalable (.app / .dmg / .msi / .AppImage)

```bash
cd native-app
npm run build
```

El resultado queda en `src-tauri/target/release/bundle/`, organizado por
plataforma (`macos/`, `dmg/`, `msi/`, `appimage/`, según en qué sistema
compiles — Tauri no hace cross-compilation entre SO, cada instalador se
genera compilando en ese mismo sistema operativo).

La primera vez que abras el `.app` sin firmar, macOS (Gatekeeper) puede
avisar de "desarrollador no identificado" — clic derecho → Abrir la primera
vez es suficiente en local. Para distribuirla sin ese aviso hace falta
firmarla y notarizarla con una cuenta de Apple Developer (ver
`../ROADMAP.md`, apartado "Distribución").

## Qué comparte y qué NO comparte con la línea SCORM

**Comparte** (una sola fuente, en `../src/`):
- El motor heurístico completo (`engine.js`, `geo-data.js`) — detección de
  VI/VD, área, marcos teóricos, transparencia del análisis, selector VI/VD,
  categorías explicativas, todo.
- La exportación Word/CSV (`docxwriter.js`, `informe-word.js`), con el pie
  de página y el título del informe parametrizados vía un argumento opcional
  de `construirInformeWord(...)` — la línea SCORM sigue mostrando el pie
  original (Universidad de Zaragoza) sin ningún cambio, la línea Profesional
  pasa su propio pie (`contacto@sociokairos.com`) y omite la nota específica
  de la Universidad de Zaragoza.

**No comparte** (propio de `pro-src/`):
- La interfaz (`head.html`/`body.html`): sin overlay de arranque en pantalla
  completa (no tiene sentido en una ventana de escritorio normal), sin el
  estado "Modo independiente: no se detectó ningún LMS", tema verde con
  estética de toolbar translúcida más cercana a una app nativa de macOS.
- `wiring.js`: sin ninguna de las funciones `scorm*` (`scormInit`,
  `scormMarkCompleted`, `scormFinish`...) ni sus llamadas.
- El pie de página, el título del informe Word, y la nota final (sin la
  mención a la Universidad de Zaragoza), vía el argumento de opciones que sí
  admite `construirInformeWord(...)` sin tocar el comportamiento por
  defecto que sigue usando la línea SCORM.

`descargarBlob()` en `wiring.js` (compartida en su forma general, pero
copiada sin SCORM aquí) detecta `window.__TAURI__` y usa el diálogo nativo
si existe; si no (para pruebas en un navegador normal), cae al mecanismo
`<a download>` de siempre.

## Estructura de esta carpeta

```
native-app/
├── package.json           # scripts npm (dev/build/icon) + @tauri-apps/cli
├── pro-src/                # interfaz y wiring propios de la línea Profesional
│   ├── head.html            # tema verde, estética de toolbar de macOS
│   ├── body.html             # sin overlay de arranque ni estado SCORM
│   ├── wiring.js               # copia de ../src/wiring.js sin integración SCORM
│   └── build_pro.py             # ensambla dist_pro/index.html (motor compartido + esto)
├── dist_pro/                # generado por build_pro.py (no se versiona)
├── src-tauri/
│   ├── Cargo.toml          # dependencias Rust (tauri + plugins de diálogo/fs)
│   ├── tauri.conf.json     # ventana, frontendDist → ../dist_pro, bundle
│   ├── build.rs
│   ├── src/main.rs         # registra los plugins de diálogo nativo y fs
│   ├── capabilities/       # permisos: solo diálogo "Guardar como" + escritura
│   │                         del archivo elegido — nada más
│   └── icons/              # icono de la app (provisional, ver «Generar…» arriba)
└── README.md                # este archivo
```
