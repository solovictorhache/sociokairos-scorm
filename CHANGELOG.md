# CHANGELOG — SOCIOKAIROS SCORM Plugin

## Revisión técnica 2026-08-16

Revisión de corrección técnica sobre el paquete original del 2025-11-27. No cambia el contenido pedagógico ni la lógica heurística (misma detección de VI/VD, áreas sociológicas, preguntas, hipótesis, operacionalización y fuentes), solo la implementación:

- **Seguimiento SCORM real**: el paquete ahora llama a la API SCORM 1.2/2004 del LMS (`LMSInitialize`/`LMSSetValue`/`LMSCommit`/`LMSFinish`, con equivalentes 2004) para registrar el estado de la actividad en Moodle. Antes el paquete no llamaba a la API en absoluto, por lo que Moodle nunca registraba finalización ni actividad.
- **Sin dependencias externas**: se eliminó la dependencia de PyScript/Pyodide (CDN) y python-docx (PyPI). El motor heurístico y el generador de informes Word están reescritos en JavaScript nativo; el paquete funciona sin conexión a Internet una vez cargado en el LMS.
- **Tamaño del paquete**: `index.html` pasó de 2.9 MB a ~90 KB. El logotipo se redimensionó de 1024×1024 (1.1 MB) a 240×240 optimizado (~17 KB) y se eliminó su duplicación interna y el archivo huérfano `img/logo_sociokairos_60px.png`.
- **Exportación a Word**: se sustituyó por un generador `.docx` (OOXML) propio, sin librerías externas, validado con `python-docx`.
- **Correcciones de interfaz**: se añadió `<meta name="viewport">` (el diseño responsive no se activaba en móvil), se retiró la mención a exportación PDF (nunca existió esa función) y se eliminó código muerto que referenciaba elementos inexistentes de una versión anterior de la interfaz.
- **Metadatos**: se añadió el bloque `<metadata>` al manifiesto SCORM 1.2; se corrigió `CITATION.cff` (el campo `license` con texto libre no es válido en el formato CFF, que exige identificadores SPDX); se añadió el campo `license` a `metadata.json` para Zenodo, coherente con los términos de todos los derechos reservados de `LICENCIA.txt`.

Los archivos de motor heurístico, generador de Word y wrapper SCORM se probaron end-to-end con un navegador headless (incluyendo una API SCORM 1.2 simulada) y los documentos `.docx`/`.csv` generados se validaron con `python-docx`.

## Revisión metodológica 2026-08-17

Auditoría de la lógica heurística en tanto que diseño de investigación (no solo código). Cambia el contenido del informe generado, no la estructura del paquete:

- **Variables no detectadas por desincronización interna.** `indicadoresParaVariable` ya tenía ramas específicas para "violencia de género", "pobreza/exclusión" y "precariedad", pero `detectarVariables` — la función que puebla las listas VI/VD — nunca añadía esos términos, así que esas ramas (y las preguntas/hipótesis especiales para violencia de género) eran código muerto: un problema sobre violencia de género caía siempre en la plantilla genérica. Corregido: los tres dominios ya alimentan VI/VD y activan sus preguntas, hipótesis e indicadores específicos.
- **Aviso de causalidad vs. diseño transversal.** El diseño por defecto (transversal descriptivo-correlacional) no permite sostener las afirmaciones de tipo explicativo que usan las preguntas/hipótesis ("explican", "efecto de"). Ahora, cuando se sugiere ese diseño por defecto, el informe incluye una advertencia explícita de que esas relaciones deben leerse como asociativas, no causales.
- **Nivel de medición en la operacionalización.** Cada fila de variable/indicador ahora incluye su nivel de medición (nominal/ordinal/intervalo/razón), visible en la tabla del Word, el CSV y el panel de la interfaz — antes faltaba, y es lo que determina qué pruebas estadísticas son aplicables después.
- **Estrategia de muestreo.** El diseño sugerido ahora incluye una sección de muestreo (probabilístico vs. no probabilístico, con cuándo usar cada uno), que antes no existía.
- **Ética reforzada en temas sensibles.** Cuando el problema toca violencia, salud mental o menores de edad, se añade una nota específica sobre consentimiento informado, protocolos de derivación, anonimización y comité de ética.
- **Aviso de direccionalidad VI/VD.** El motor asigna VI="factores explicativos" / VD="fenómeno a explicar" por convención léxica fija; ahora el informe deja explícito que es una simplificación heurística que el estudiante debe contrastar con su propio marco teórico, ya que las mismas variables podrían intercambiar su rol según el planteamiento.
- **Aviso de justificación de marcos teóricos.** Los marcos sugeridos se eligen por coincidencia léxica; el informe ahora pide explícitamente justificar su pertinencia real, no darlos por buenos porque aparecieron.

Todas las funciones del motor se re-verificaron con pruebas unitarias en Node y con el navegador headless (incluida la generación de Word/CSV con los nuevos campos).

## Fusión 2026-08-17 — SOCIOKAIROS EDU V32 + wrapper SCORM corregido

Se recibió una segunda versión del proyecto ("SOCIOKAIROS EDU II FIX NÚCLEO DINÁMICO REAL V4"), con un motor heurístico bastante más avanzado que el corregido hasta ahora, pero con los mismos problemas técnicos de fondo. Este paquete es la fusión de ambas líneas: el motor más rico de esa versión, más todas las correcciones técnicas y metodológicas ya aplicadas.

**Verificación antes de fusionar.** El archivo tenía varias funciones definidas dos veces (Python usa la última, así que el comportamiento real solo se podía confirmar ejecutando el código, no leyéndolo) — se depuró y se verificó por ejecución antes de portarlo.

**Del motor más avanzado, incorporado a esta versión:**
- Detección de VI/VD mucho más rica, con extracción de relaciones por patrones ("relación entre X y Y", "cómo influye X en Y") y cobertura de más fenómenos (pobreza energética, radicalización política, soledad no deseada, exclusión digital, etc.).
- **Validación pedagógica de entrada** (SOCIOKAIROS EDU): bloquea problemas mal formulados (sin relación entre variables, sin unidad social, sin contexto, sin fecha) con feedback estructurado y un ejemplo correcto, antes de generar cualquier salida.
- Motor geográfico mundial (Europa, América, África, Asia, Oceanía) con fuentes oficiales reales por ciudad y país, con URL — antes solo cubría España, Cuba, Argentina, Brasil, México y Colombia.
- Cuatro secciones de análisis nuevas: alertas metodológicas, tradiciones sociológicas compatibles, mapa lógico del problema y diseños metodológicos sugeridos.
- Visualización SVG del problema en 3 modos (mapa causal, red de variables, capas macro/meso/micro), con una taxonomía de 24 dominios sociológicos para el modo de capas.
- Interfaz visual más pulida (pantalla de bienvenida a pantalla completa, alternador de tema claro/oscuro, diseño con gradientes y cristal esmerilado).

**Bug corregido durante la fusión (no detectado por la fuente original):** cuatro variantes de "pobreza energética" en la tabla de operacionalización devolvían filas sin las claves `variable`/`tipo`, lo que rompía la exportación (`KeyError`/render vacío) en cualquier problema sobre pobreza energética. Se corrigió al portar.

**Se mantuvieron todas las correcciones ya aplicadas:** seguimiento SCORM real, cero dependencias externas (ese motor más avanzado seguía usando PyScript/Pyodide/python-docx por CDN y no llamaba a la API SCORM), logotipo único y comprimido (el nuevo pack traía el logo de 853 KB duplicado dos veces más un `logo.jpg` idéntico), `<meta viewport>`, sin promesa de exportar a PDF, metadatos corregidos, nivel de medición en la operacionalización, aviso de causalidad vs. diseño transversal, estrategia de muestreo, ética reforzada en temas sensibles, y los avisos de direccionalidad VI/VD y de justificar los marcos teóricos. Las cuatro secciones nuevas y la visualización también se añadieron a la exportación Word (el original solo las mostraba en pantalla).

Motor, generador Word/CSV, validación pedagógica y visualización se probaron end-to-end con Playwright (incluyendo el bloqueo/aceptación de la validación EDU, el cambio de los 3 modos de visualización, el tema claro/oscuro y el seguimiento SCORM simulado), y se verificaron por comparación exhaustiva contra el motor Python original en 14 casos de prueba distintos.
