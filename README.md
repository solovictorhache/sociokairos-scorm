# SOCIOKAIROS – Research Suite

Un motor heurístico determinista (sin IA/caja negra) que ayuda a reformular problemas de investigación sociológica: valida la calidad estructural del problema inicial, sugiere variables independientes/dependientes (con candidatas informadas por la literatura cuando el texto no nombra ningún factor explicativo), hipótesis, área sociológica, tradiciones compatibles, unidad de análisis, diseño de estudio, operacionalización con nivel de medición, fuentes de datos geolocalizadas y una visualización SVG del problema — y exporta el resultado a Word y CSV.

Autor: Dr. Víctor Hugo Pérez Gallo.

## Dos líneas de producto, un solo motor

El proyecto se divide en dos líneas independientes que **comparten el mismo motor heurístico** (`src/engine.js`, `src/geo-data.js`) y la misma exportación Word/CSV (`src/docxwriter.js`, `src/informe-word.js`) — una sola fuente de verdad, sin duplicar lógica:

- **Línea 1 — SCORM / educativa** (`scorm_plugin/`): "SOCIOKAIROS EDU", pensada para Moodle — integración SCORM 1.2/2004, identidad de la Universidad de Zaragoza.
- **Línea 2 — Profesional** (`native-app/`): "SOCIOKAIROS" a secas, app de escritorio instalable en Mac/Windows/Linux (Tauri) — sin SCORM, tema verde con estética de app nativa de macOS, contacto propio (`contacto@sociokairos.com`).

Cada línea tiene su propia interfaz (`src/head.html`+`src/body.html`+`src/wiring.js` para la 1; `native-app/pro-src/` para la 2) y su propio script de ensamblado (`src/build.py` / `native-app/pro-src/build_pro.py`), pero ambas leen el motor de `src/engine.js` sin copiarlo.

## Estructura del repositorio

```
scorm_plugin/          Línea 1 (SCORM/EDU): paquete SCORM 1.2 listo para importar en Moodle
                          (index.html, imsmanifest.xml, logo.png, licencia)
native-app/             Línea 2 (Profesional): app de escritorio multiplataforma (Tauri, Mac/Windows/Linux,
                          con instalador .dmg/.msi/.AppImage) — interfaz propia en pro-src/, motor
                          compartido con la línea 1. Ver native-app/README.md
mac-app/                 Variante solo-Mac de la línea 2: abrir directo en Xcode y pulsar ▶ Run, sin
                          terminal ni Rust (SwiftUI + WKWebView). Ver mac-app/README.md
src/                    Fuentes del motor y la interfaz de la línea 1 (SCORM/EDU), en módulos separados
  engine.js             Motor heurístico puro (sin dependencias de DOM): detección de variables,
                          validación pedagógica SOCIOKAIROS EDU, alertas metodológicas, tradiciones
                          sociológicas, mapa lógico, diseños sugeridos, visualización SVG
  geo-data.js            Tablas de geolocalización (ciudades/países/fuentes oficiales) y dominios del modo "capas" del SVG
  docxwriter.js           Generador de ZIP + OOXML mínimo, sin librerías externas
  informe-word.js          Ensamblado del informe .docx a partir del resultado del motor
  wiring.js                 Integración con la API SCORM (1.2/2004), validación EDU y wiring de la interfaz
  head.html / body.html       Plantilla HTML/CSS de la página, con un marcador donde se inserta el script
  build.py                     Ensambla scorm_plugin/index.html a partir de las piezas anteriores
tests/                  Pruebas automatizadas
  engine.test.js          Tests del motor (node:test, sin dependencias): variables, validación EDU,
                            enfoque cuali/cuanti/mixto, hipótesis, operacionalización, dominios sociológicos
  helpers/load-engine.js    Concatena geo-data.js + engine.js igual que build.py, para poder probarlos con require()
  e2e/scorm.e2e.js          Prueba end-to-end con Playwright sobre scorm_plugin/index.html ya construido (línea 1)
  e2e/mejoras.e2e.js         Prueba end-to-end de transparencia, selector VI/VD, historial y justificación (línea 1)
  e2e/pro.e2e.js              Prueba end-to-end de native-app/dist_pro/index.html: confirma que no hay SCORM
                                ni identidad EDU/UNIZAR, y que el motor funciona igual que en la línea 1
  e2e/validate_docx.py       Valida con python-docx los informes Word generados por las pruebas end-to-end
.github/workflows/test.yml  CI: corre los tests del motor y la prueba end-to-end en cada push/PR
CITATION.cff             Metadatos de citación (Citation File Format)
metadata.json             Metadatos de depósito para Zenodo
CHANGELOG.md               Historial de cambios técnicos y metodológicos
ROADMAP.md                   Estrategia de app nativa (Mac/Windows) y backlog de mejoras futuras
```

## Cómo correr los tests

```bash
npm test                                    # motor: variables, validación EDU, dominios, etc. (node:test, sin dependencias)

python3 src/build.py                        # reconstruye scorm_plugin/index.html primero
npm install --no-save playwright && npx playwright install --with-deps chromium
node tests/e2e/scorm.e2e.js                 # end-to-end: reformular, SCORM, exportar Word/CSV
pip install python-docx
python3 tests/e2e/validate_docx.py .e2e-output/informe.docx
```

Ambos se ejecutan automáticamente en cada push y pull request (ver `.github/workflows/test.yml`).

## Cómo reconstruir `scorm_plugin/index.html`

Todo el HTML final es autocontenido (sin dependencias de red ni de runtime externo). Si editas cualquier archivo en `src/`, reconstruye con:

```bash
python3 src/build.py
```

## Cómo probarlo

No requiere servidor: `scorm_plugin/index.html` puede abrirse directamente en el navegador. Fuera de un LMS mostrará "Modo independiente" en vez de conectar con la API SCORM — eso es el comportamiento esperado.

Para probar dentro de Moodle: comprimir el contenido de `scorm_plugin/` (no la carpeta en sí) en un `.zip` y subirlo como actividad SCORM.

## Empaquetar para Zenodo

```bash
cd scorm_plugin && zip -r -X ../SOCIOKAIROS_EDU_SCORM.zip . -x '.*' && cd ..
zip -X SOCIOKAIROS_EDU_FUSIONADO_ZENODO_PACK.zip SOCIOKAIROS_EDU_SCORM.zip CITATION.cff README_Zenodo.md metadata.json CHANGELOG.md ROADMAP.md
```

Sube el resultado a zenodo.org → "New upload", copiando los campos de `metadata.json` al formulario (ver detalles en `README_Zenodo.md`).

## Licencia

Todos los derechos reservados — ver `scorm_plugin/LICENCIA.txt`. Cualquier uso más allá de la investigación o la docencia personal requiere autorización expresa del autor.
