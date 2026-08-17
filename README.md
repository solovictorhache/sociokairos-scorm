# SOCIOKAIROS EDU – Research Suite para Moodle

Plugin SCORM del proyecto SOCIOKAIROS: un motor heurístico determinista (sin IA/caja negra) que ayuda a estudiantes y personal investigador a reformular problemas de investigación sociológica. Valida la calidad estructural del problema inicial, sugiere variables independientes/dependientes (con candidatas informadas por la literatura cuando el texto no nombra ningún factor explicativo), hipótesis, área sociológica, tradiciones compatibles, unidad de análisis, diseño de estudio, operacionalización con nivel de medición, fuentes de datos geolocalizadas y una visualización SVG del problema — y exporta el resultado a Word y CSV.

Autor: Dr. Víctor Hugo Pérez Gallo · Universidad de Zaragoza.

## Estructura del repositorio

```
scorm_plugin/          Paquete SCORM 1.2 listo para importar en Moodle (index.html, imsmanifest.xml, logo.png, licencia)
src/                    Fuentes del motor y la interfaz, en módulos separados
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
  e2e/scorm.e2e.js          Prueba end-to-end con Playwright sobre scorm_plugin/index.html ya construido
  e2e/validate_docx.py       Valida con python-docx el informe Word generado por la prueba end-to-end
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
