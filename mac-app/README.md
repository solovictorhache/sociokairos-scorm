# SOCIOKAIROS EDU — app de Mac en Xcode puro (sin terminal, sin Rust)

La forma más directa de probarlo: abrir un proyecto en Xcode y darle a ▶
Run. Sin `npm install`, sin Rust, sin Cargo — solo necesitas Xcode (que ya
incluye el compilador de Swift).

Si prefieres la vía multiplataforma (Mac + Windows más adelante, con
instalador `.dmg`/`.msi`), esa es `../native-app/` (Tauri). Esta carpeta es
la alternativa cuando lo que quieres es simplemente "abrir y que corra".

## Cómo probarlo

1. Necesitas **Xcode** instalado (gratis en la Mac App Store). Ábrelo al
   menos una vez para que acepte la licencia y termine de instalar sus
   componentes.

2. En Finder, o desde la terminal, abre el paquete:
   ```bash
   open mac-app/SociokairosEduMac/Package.swift
   ```
   Xcode lo abre como un proyecto normal (tarda un poco la primera vez,
   resolviendo el paquete).

3. Arriba a la izquierda, junto al botón ▶ Run, comprueba que el esquema
   seleccionado sea **SociokairosEduMac** y el destino **My Mac**.

4. Pulsa **▶ Run** (o `Cmd + R`). Se compila y se abre la ventana de
   SOCIOKAIROS EDU.

Prueba el flujo completo: escribe un problema, reformula, usa el selector
VI/VD, exporta a Word — te debería aparecer el panel nativo de macOS
"Guardar como…" para elegir dónde guardar el `.docx`.

## Qué hay dentro

- `SociokairosEduMac/Package.swift` — paquete Swift (SPM), sin necesidad de
  un `.xcodeproj` hecho a mano: Xcode abre `Package.swift` directamente como
  proyecto.
- `SociokairosEduMac/Sources/SociokairosEduMac/SociokairosEduMacApp.swift` —
  punto de entrada (`@main`), una ventana SwiftUI.
- `SociokairosEduMac/Sources/SociokairosEduMac/SociokairosWebView.swift` —
  el `WKWebView` que carga `index.html`, más el puente nativo: un script JS
  inyectado define `window.__TAURI__` con la misma forma que ya espera
  `descargarBlob()` en `src/wiring.js` (`dialog.save(...)` / `fs.writeFile(...)`),
  respaldado aquí por `NSSavePanel` y escritura de archivo real. **No se toca
  ni una línea del motor**: el mismo `wiring.js` que usan el SCORM y la app
  Tauri funciona sin cambios porque solo mira si `window.__TAURI__` existe,
  no cómo está implementado detrás.
- `SociokairosEduMac/Sources/SociokairosEduMac/Resources/scorm_plugin/` —
  copia de `scorm_plugin/index.html` y `logo.png`, sincronizada con
  `sync_resources.py` (Xcode/SPM necesita los recursos dentro del propio
  paquete para empaquetarlos; a diferencia de Tauri, no puede apuntar
  directamente a una carpeta fuera del paquete).

## Si cambias el motor o la interfaz

Después de editar `src/engine.js`, `src/wiring.js`, `src/body.html` o
`src/head.html`:

```bash
python3 src/build.py          # reconstruye scorm_plugin/index.html
python3 mac-app/sync_resources.py   # lo copia a los recursos de la app de Xcode
```

Y en Xcode: `Product` → `Clean Build Folder` (`Cmd+Shift+K`) antes de volver
a pulsar Run, para asegurarte de que recoge los recursos actualizados.

## Si algo no compila

No tengo forma de compilar ni abrir Xcode desde donde trabajo (esto se ha
escrito y revisado, pero nunca se ha ejecutado de verdad en una Mac). Si
`Cmd+R` da un error de compilación, copia el mensaje completo del panel de
errores de Xcode y lo resolvemos.

## Limitaciones de este scaffold mínimo

- Sin icono propio, sin firma de código, sin empaquetado `.app`/`.dmg`
  formal — eso sigue siendo terreno de `../native-app/` (Tauri) si más
  adelante quieres distribuirla fuera de tu propio Mac.
- Al ejecutarse como paquete SPM desde Xcode (no como una app "de verdad"
  instalada), puede que no aparezca con su propio icono en el Dock durante
  el desarrollo — es el comportamiento normal de este tipo de proyecto
  mientras estás probándolo, no un fallo.
