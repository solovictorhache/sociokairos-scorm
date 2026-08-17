# SOCIOKAIROS — Estrategia de app nativa y roadmap de mejoras futuras

Fecha: 2026-08-17. Este documento recoge (1) la estrategia recomendada para llevar SOCIOKAIROS a una app nativa de escritorio (macOS + Windows) y (2) un backlog priorizado de mejoras futuras, técnicas y metodológicas.

## 1. App nativa para Mac y Windows

### Punto de partida favorable

Desde la revisión técnica de 2026-08-16/17, `index.html` es una página autocontenida: motor heurístico, generador `.docx` y exportador CSV en JavaScript puro, sin dependencias de red ni de runtime externo (ni PyScript/Pyodide, ni librerías de terceros). Eso significa que **ya es, funcionalmente, el 90% de una app de escritorio** — solo le falta el empaquetado nativo y sustituir el hack de descarga vía navegador por diálogos de guardado nativos.

### Recomendación: Tauri, no Electron

| | **Tauri** (recomendado) | Electron |
|---|---|---|
| Tamaño del instalador | ~3–10 MB | ~150–200 MB |
| Motor de renderizado | WebView nativo del SO (WKWebView en Mac, WebView2 en Windows) | Chromium empaquetado (consistente entre SO) |
| Uso de RAM | Bajo | Alto |
| Lenguaje del backend nativo | Rust (mínimo, solo para diálogos de archivo/menú/auto-update) | Node.js |
| Requiere Rust para compilar | Sí | No |
| Diálogos nativos "Guardar como", menú de app | Sí, de fábrica | Sí, de fábrica |
| Riesgo de inconsistencia visual entre Mac/Windows | Bajo-medio (WebViews distintos, pero la interfaz de SOCIOKAIROS es CSS simple, sin dependencias de motor) | Ninguno (mismo Chromium en ambos) |

Para una herramienta como esta —un formulario + salida de texto + tabla, sin animaciones complejas ni APIs de navegador exóticas— el riesgo de Tauri (pequeñas diferencias de renderizado entre WebViews) es bajo, y el ahorro de tamaño/RAM es grande. Si en algún momento se prioriza cero riesgo de inconsistencia visual sobre el tamaño del instalador, Electron es la alternativa segura y también aplicable directamente sobre el mismo `index.html`.

### Qué cambia respecto a la versión SCORM/web

1. **Guardado nativo real.** Sustituir el `<a download>` + blob URL (un hack que fuerza al navegador a "descargar") por `@tauri-apps/plugin-dialog` (diálogo "Guardar como…") + `@tauri-apps/plugin-fs` (escritura real en disco). Mejora directa de UX: el usuario elige carpeta y nombre, como en cualquier app de escritorio.
2. **Menú nativo de aplicación.** Un menú Archivo (Nuevo problema, Exportar Word, Exportar CSV, Salir), y en macOS el menú de aplicación estándar (Acerca de, Preferencias, Salir con ⌘Q).
3. **Historial local.** Como app nativa (a diferencia del wrapper SCORM, que vive dentro de un iframe de Moodle sin almacenamiento persistente propio garantizado) tiene sentido guardar un historial de problemas analizados en disco (JSON simple o SQLite vía `tauri-plugin-sql`), con una lista lateral para retomar un problema anterior. Esto no existe hoy en ninguna versión y es la funcionalidad más pedida en herramientas de este tipo.
4. **El motor heurístico se reutiliza sin cambios.** `engine.js` y `docxwriter.js` son JS puro sin referencias al DOM salvo en los puntos de integración — se cargan tal cual dentro del WebView de Tauri.
5. **SCORM se vuelve opcional/condicional.** La detección de API SCORM (`scormFindAPI`) ya falla de forma segura fuera de un LMS ("Modo independiente"); en la app nativa simplemente nunca se activa, así que no hace falta quitar código, aunque a medio plazo convendría separar en dos builds (web/SCORM vs. escritorio) para no cargar código muerto.

### Distribución

- **Firma y notarización.** macOS bloqueará la app por Gatekeeper si no está firmada y notarizada — requiere una cuenta de Apple Developer (99 USD/año). Windows mostrará aviso de "editor no reconocido" sin un certificado de firma de código (puede aceptarse en una primera fase, o comprarse un certificado más adelante).
- **Build multiplataforma.** Tauri se compila nativamente por SO (no hay cross-compilation sencilla Mac→Windows), así que conviene usar GitHub Actions con runners `macos-latest` y `windows-latest` para generar el `.dmg` y el `.msi`/`.exe` en cada release, automáticamente.
- **Actualizaciones.** `tauri-plugin-updater` permite que la app compruebe nuevas versiones y se actualice sola — relevante porque las mejoras metodológicas del motor (como las de este mismo documento) llegarán con más frecuencia que las de la interfaz.

### Estimación de esfuerzo (orientativa)

- Empaquetado inicial funcional (sin firma/notarización): 1–2 días.
- Guardado nativo + menú de aplicación: medio día.
- Historial local: 1–2 días.
- Firma/notarización + CI de releases: 1–2 días (más el trámite de la cuenta de Apple Developer, que tarda en aprobarse).

## 2. Backlog de mejoras futuras (priorizado)

### Ya resuelto (2026-08-16/17)
- Empaquetado técnico: seguimiento SCORM real, sin dependencias externas, tamaño del paquete, exportación Word propia. *(ver CHANGELOG.md)*
- Auditoría metodológica: huecos VI/VD, aviso causal-vs-diseño, nivel de medición, muestreo, ética reforzada, direccionalidad VI/VD. *(ver CHANGELOG.md)*

### Prioridad alta
1. **App nativa (Tauri)** — descrito arriba.
2. **Selector manual de dirección VI/VD.** Hoy el motor asigna VI/VD por convención léxica fija (ver nota metodológica ya añadida). El siguiente paso lógico es dejar que el estudiante intercambie manualmente qué lista es VI y cuál VD antes de generar el informe, en vez de solo advertir del supuesto.
3. **Transparencia de la detección ("por qué SOCIOKAIROS sugirió esto").** Como el motor es determinista y no una caja negra —algo que el propio proyecto reivindica—, tiene sentido explotarlo: mostrar qué palabras clave del problema activaron cada área/variable/marco sugerido. Refuerza la propuesta pedagógica (el estudiante entiende el razonamiento, no solo el resultado) y ayuda a detectar falsos positivos léxicos.

### Prioridad media
4. **Selección/justificación de marcos teóricos en el propio formulario.** Convertir la nota "justifica por qué este marco es pertinente" en un campo de texto real que se incluya en el Word exportado, en vez de solo un recordatorio.
5. **Ampliar cobertura geográfica de fuentes de datos.** Hoy cubre España, Cuba, Argentina, Brasil, México y Colombia con detalle; el resto cae en un fallback genérico. Ampliar según la demanda real de uso (Perú, Chile, Ecuador aparecen en la detección de contexto pero no tienen bloque de fuentes propio en `sugerirFuentesDatos`).
6. **Historial y comparación de versiones de un mismo problema** (aplica tanto a la app nativa como, con almacenamiento en `localStorage`, a la versión web/SCORM).

### Prioridad baja / exploratorio
7. **Versión en inglés** de la interfaz y de las plantillas de preguntas/hipótesis, para uso fuera de contextos hispanohablantes.
8. **Panel docente agregado** (ver actividad de varios estudiantes) — esto sí requeriría volver a hablar con un backend/LMS real (Moodle web services), a diferencia de todo lo anterior. Es un proyecto bastante más grande que el resto de este roadmap y solo tiene sentido si hay demanda real de seguimiento grupal más allá de lo que ya reporta SCORM por estudiante.

---

*Este documento se actualizará según evolucione el proyecto. Ver `CHANGELOG.md` para el historial de cambios ya aplicados.*
