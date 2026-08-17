# CHANGELOG — SOCIOKAIROS SCORM Plugin

## Sociología de la etnicidad y grupos culturales, transversal 2026-08-17

Cuando el problema nombra un grupo étnico o cultural particular (gitano/a, romaní, indígena, afrodescendiente, o "etnia"/"tribu étnica"/"grupo cultural" en general), el motor ahora lo trata como un factor explicativo real, no como texto ignorado:

- **VI detectada**: "la discriminación étnica o cultural percibida", con su propio indicador de operacionalización (experiencias percibidas de discriminación, con fuentes como OBERAXE y la Fundación Secretariado Gitano).
- **Sociología de la cultura, transversal**: se añade a las áreas ya detectadas (educación, familia, migraciones...) en vez de sustituirlas — igual que sociología de las migraciones ya se activaba de forma independiente, ambas pueden coexistir cuando el problema habla de un grupo étnico migrante.
- **Marcos teóricos**: San Román (antropología y sociología del pueblo gitano en España) y Wieviorka (racismo y diferencialismo cultural).

## Integración continua 2026-08-17

`.github/workflows/test.yml` corre en cada push y pull request: los tests del motor (`npm test`) y una prueba end-to-end con Playwright (`tests/e2e/scorm.e2e.js`) que construye el paquete, simula un LMS SCORM 1.2, reformula un problema, comprueba la interfaz y el seguimiento SCORM, exporta a Word y CSV, y valida con `python-docx` (`tests/e2e/validate_docx.py`) que el informe tiene al menos 15 secciones numeradas y 2 tablas. Los archivos generados quedan disponibles como artefacto del workflow.

## Robustez, cobertura de dominios y tests 2026-08-17

- **Tolerancia a erratas extendida al resto del motor.** `skHas` (usado en `generarAlertasMetodologicas`, `generarTradiciones`, `generarMapaLogico`, `generarDisenos` y `generarMecanismos`) ahora delega en la comparación tolerante `skContieneAlguno`, igual que ya hacía la detección de variables. También se convirtieron `clasificarEnfoqueMetodologico`, `sugerirDisenoEstudio` y el diccionario de fuentes de `geoFuentes`. Deliberadamente **no** se tocó `geoDetectar` (alias geográficos) ni `indicadoresParaVariable` (opera sobre nombres de variable ya generados internamente, no sobre texto crudo): en ambos casos una errata de una letra puede confundir un nombre propio o una palabra con otra, y el riesgo de colisión pesa más que el beneficio.
- **Regresión real encontrada al escribir los tests, y corregida.** El marcador de relación "genera" (añadido para reconocer verbos causales) está a distancia de edición 1 de "género": con coincidencia tolerante, cualquier problema que mencionara género quedaba validado aunque no tuviera ningún marcador de relación real. Los marcadores de relación del validador EDU volvieron a exigir coincidencia exacta — son palabras cortas y frecuentes, con más riesgo de colisión que beneficio al tolerar erratas.
- **Suite de tests real.** `tests/engine.test.js` (Node's `node:test`, sin dependencias) sustituye a los scripts sueltos usados hasta ahora para verificar el motor: 25 casos en 8 grupos, incluida una regresión explícita para la colisión "genera"/"género". Se ejecuta con `npm test`.
- **Cinco dominios sociológicos nuevos**: migración, discapacidad, medio ambiente/cambio climático, ruralidad y religión. Cada uno con detección de VD/VI, candidatas de VI por dominio, área sociológica, marcos teóricos (Portes y Sayad; Oliver y Goffman; Beck y Norgaard; Tönnies y Camarero; Durkheim y Berger), indicadores de operacionalización con nivel de medición, y fuentes de datos específicas (ACNUR/OIM, INE-EDAD/OMS, Copernicus/MITECO, Reto Demográfico, CIS/Pew/ISSP).

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

## Revisión metodológica 2026-08-17 (continuación) — VI candidatas informadas por dominio

Cuando el problema inicial no nombra explícitamente ningún factor explicativo en el texto, `detectarVariables` ya no devuelve un marcador de posición vacío ("los factores explicativos relevantes del problema inicial"). En su lugar, `candidatosViPorDominio` propone VI candidatas informadas por la literatura sobre el fenómeno detectado (violencia de género, precariedad laboral, pobreza energética, fracaso escolar, salud mental, etc.), marcadas explícitamente como candidatas — no como extracciones del texto del estudiante — para que las correlaciones, hipótesis y operacionalización dejen de estar vacías de contenido en ese caso.

## SOCIOKAIROS EDU como tutor de metodología 2026-08-17

El motor pasa de devolver solo resultados a explicar también el razonamiento metodológico detrás de cada uno, y de aceptar únicamente un dato duro (cuantitativo) a poder guiar también un abordaje cualitativo o mixto:

- **Clasificación de enfoque cuali/cuanti/mixto.** `clasificarEnfoqueMetodologico` decide, a partir del vocabulario del propio problema (sentido/experiencia/vivencia → cualitativo; prevalencia/tasa/correlación → cuantitativo; ambos o ninguno → mixto), qué tradición metodológica encaja mejor. La decisión se propaga al diseño de estudio sugerido: condiciona las técnicas de recogida, el software de apoyo (Atlas.ti/MAXQDA/NVivo vs. SPSS/R/Stata/Jamovi vs. ambos) y el tipo de muestreo (no probabilístico vs. probabilístico vs. ambos por fases).
- **Guía cualitativa pre-CAQDAS.** `construirGuiaCualitativa` genera un libro de códigos preliminar (categorías deductivas a partir de las VI/VD detectadas, más conceptos sensibilizadores a partir de los mecanismos micro/meso/macro) y una guía de entrevista/observación semiestructurada — pensados como punto de partida para importar en Atlas.ti, MAXQDA o NVivo antes de codificar el material real, o para usarse directamente en análisis manual o en la redacción de una tesis.
- **Síntesis del "problema científico definitivo".** `construirProblemaPerfecto` funde la versión elegida del problema con el resto del análisis (área, variables, unidad, enfoque) en un párrafo ya redactado, del tipo que abriría un capítulo de planteamiento del problema.
- **Voz de tutor en la interfaz.** El panel de salida incluye ahora cápsulas de texto breves que explican qué hace SOCIOKAIROS y por qué en cada bloque, en vez de mostrar solo resultados en bruto.
- **Documento Word ampliado a 17 secciones**, incorporando la síntesis del problema definitivo (sección 2) y la guía cualitativa con su tabla de códigos y su guía de entrevista (sección 10).

Motor y exportación se re-probaron end-to-end con Playwright (incluida la ruta de descarga con y sin `window.claude.use("downloads")`) y el `.docx` resultante se validó con `python-docx` (dos tablas nuevas, 17 encabezados de sección).

## Tolerancia a erratas en la validación y detección de variables 2026-08-17

Un problema real («¿Porque los hombrs con bajo nivel de instrucion ejercen mas violencia de género en Zaragoza en el 2025?») era rechazado por la validación EDU pese a contener variable, unidad social, contexto y fecha, y —cuando se forzaba— el motor no reconocía «bajo nivel de instrucción» como VI y caía en candidatas genéricas. Causas y corrección:

- **Marcador de relación incompleto.** `marcadoresRelacion` solo reconocía "por qué"/"por que" (con espacio) y "cómo", no "porque" escrito junto ni verbos causales habituales ("ejerce", "genera", "provoca", "produce", "contribuye", "aumenta", "reduce", etc.). Se amplió la lista.
- **Cero tolerancia a erratas.** Toda la detección de variables, unidad social, contexto y marcadores de relación exigía coincidencia exacta de subcadena. Una sola letra de más o de menos ("instrucion" por "instrucción", "hombrs" por "hombres") bastaba para que el diccionario correspondiente no encontrara nada. Se añadió `skContienePatron`/`skContieneAlguno`: comparación exacta primero (rápido, sin cambios de comportamiento en el caso normal) y, si falla, comparación por palabra con distancia de edición ≤1 — suficiente para una errata típica de escritura rápida, pero no para confundir palabras españolas distintas que comparten raíz (se verificó explícitamente que "instrucción" y "institución", a distancia 2, no colisionan). Aplicado en `detectarVariables`, la detección de población, `detectarAreaSociologica`, `sugerirMarcosTeoricos` y todo `validarProblemaEdu`.
- **Hipótesis genéricas con 3 o más variables.** El caso general de `construirHipotesis` fundía todas las VI detectadas en una sola frase. Ahora genera una hipótesis específica por cada VI detectada (hasta 4), más una hipótesis de combinación cuando hay 2 o más — reflejando el problema realmente formulado en vez de una plantilla fija, sea cual sea el número de variables.

Verificado con el problema exacto que falló, con la batería de casos de prueba previa (sin regresiones) y con un caso sintético de 5 variables independientes para confirmar la escalada de hipótesis.
