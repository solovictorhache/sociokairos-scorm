"use strict";
// Prueba end-to-end del build "Profesional" (native-app/pro-src, track 2):
// confirma que no queda SCORM ni identidad EDU/UNIZAR (estado SCORM, correo
// de contacto, pie e informe Word), que la estructura nueva (topbar +
// stepper + sidebar + panel de stats real) funciona de verdad — no solo
// visualmente — y que el motor funciona exactamente igual que en el SCORM
// (mismo engine.js compartido).
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const PROBLEMA = "cuales son las causas familiares del alto indice de delincuencia en zaragoza en el 2025?";
const OUT_DIR = path.join(__dirname, "..", "..", ".e2e-output");
const DIST_PRO = path.join(__dirname, "..", "..", "native-app", "dist_pro", "index.html");

function assert(cond, msg) {
  if (!cond) throw new Error("FALLO: " + msg);
  console.log("OK: " + msg);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // El resto de este archivo prueba el flujo normal de la app, que el modal
  // de registro obligatorio (primer arranque) bloquearía por completo; se
  // simula un dispositivo que ya lo completó. El modal en sí se cubre en su
  // propia sección más abajo, con un navegador aparte y sin este flag.
  await page.addInitScript(() => localStorage.setItem("sk_registro_enviado", "1"));

  await page.goto("file://" + DIST_PRO);

  assert((await page.$("#sociokairosStartOverlay")) === null, "no existe el overlay de arranque (quitado en pro)");
  assert((await page.$("#scorm_status")) === null, "no existe el div scorm_status (quitado en pro)");

  const headerText = await page.textContent(".sk-topbar-title");
  assert(headerText.replace(/\s+/g, " ").trim().startsWith("SOCIOKAIROS"), "título de la topbar: " + headerText);
  assert(!headerText.includes("EDU") && !headerText.includes("UNIZAR"), "título sin EDU/UNIZAR: " + headerText);

  const authorHtml = await page.innerHTML(".sk-author-top");
  assert(authorHtml.includes("contacto@sociokairos.com"), "correo de contacto presente (en el pie del sidebar)");
  assert(!authorHtml.includes("unizar.es"), "sin correo unizar.es");

  // --- Estructura nueva: topbar con stepper de 5 etapas, sidebar, panel derecho ---
  const stepCount = await page.$$eval("#sk_stepper .sk-step", els => els.length);
  assert(stepCount === 5, "el stepper tiene 5 etapas (Definir/Analizar/Diseñar/Ejecutar/Comunicar): " + stepCount);
  assert(await page.isVisible('.sk-step[data-stage="definir"].active'), "la etapa activa al arrancar es 'Definir'");
  assert(await page.isVisible(".sk-sidebar"), "sidebar visible");
  assert(await page.isVisible(".sk-rightpanel"), "panel derecho de estadísticas visible");

  // Antes de reformular, los stats están vacíos (no hay números inventados)
  const statVariablesAntes = await page.textContent("#sk_stat_variables");
  assert(statVariablesAntes.trim() === "–", "stats vacíos antes de analizar (sin datos fabricados): " + statVariablesAntes);

  await page.fill("#txt_problema", PROBLEMA);
  await page.click("#btn_reformular");
  await page.waitForTimeout(500);

  const status = await page.textContent("#status");
  assert(status.includes("Análisis completado"), "análisis completado con el mismo motor que el SCORM");

  // Tras reformular, el stepper debe pasar solo a la etapa "Analizar"
  assert(await page.isVisible('.sk-step[data-stage="analizar"].active'), "el stepper avanza automáticamente a 'Analizar' tras reformular");
  assert(await page.isVisible("#out_variables"), "la sección de variables es visible en la etapa activa");

  const transparencia = await page.textContent("#out_transparencia");
  assert(transparencia.includes("VARIABLE DEPENDIENTE"), "transparencia del análisis funciona igual que en SCORM");

  // --- Revisión de coherencia (enfoque detectado vs. justificación libre), en
  // vivo — la justificación se escribe en la etapa "Analizar" (visible aquí),
  // el panel se lee en la etapa "Ejecutar" (aún no visible, pero el DOM ya
  // tiene el texto actualizado por el listener de "input") ---
  await page.fill("#txt_justificacion_marco", "El fenómeno central se explica por las condiciones explicativas del contexto familiar.");
  await page.waitForTimeout(150);
  const coherenciaAviso = await page.textContent("#out_revision_coherencia");
  assert(coherenciaAviso.includes("Revisión de coherencia"), "revisión de coherencia avisa en vivo al escribir lenguaje incoherente");
  await page.fill("#txt_justificacion_marco", "Elijo Merton porque la asociación diferencial de Sutherland explica esta dinámica.");
  await page.waitForTimeout(150);
  const coherenciaOk = await page.textContent("#out_revision_coherencia");
  assert(coherenciaOk.includes("no ha detectado incoherencias"), "revisión de coherencia no avisa con justificación coherente");

  // --- Panel de estadísticas: números REALES, no inventados ---
  const statVariables = await page.textContent("#sk_stat_variables");
  const statAreas = await page.textContent("#sk_stat_areas");
  const statMarcos = await page.textContent("#sk_stat_marcos");
  const statFuentes = await page.textContent("#sk_stat_fuentes");
  assert(Number(statVariables) >= 1, "estadística de variables es un número real > 0: " + statVariables);
  assert(Number(statAreas) >= 1, "estadística de áreas es un número real > 0: " + statAreas);
  assert(Number(statMarcos) >= 1, "estadística de marcos teóricos es un número real > 0: " + statMarcos);
  assert(Number(statFuentes) >= 1, "estadística de fuentes es un número real > 0: " + statFuentes);

  const fuentesPreviewHtml = await page.innerHTML("#sk_fuentes_preview");
  assert(fuentesPreviewHtml.includes("sk-fuente-item"), "el panel de fuentes recomendadas muestra fuentes reales del motor");
  assert(!fuentesPreviewHtml.includes("García, M."), "no hay citas académicas de ejemplo fabricadas");

  // --- Navegación de la sidebar es funcional (cambia de etapa) ---
  await page.click('.sk-sidebar-item[data-scrollto="out_fuentes"]');
  await page.waitForTimeout(200);
  assert(await page.isVisible('.sk-step[data-stage="disenar"].active'), "clic en 'Fuentes' del sidebar cambia a la etapa 'Diseñar'");
  assert(await page.isVisible("#out_fuentes"), "la sección de fuentes es visible tras la navegación");

  // --- Funciones Premium en "Diseñar" (exclusivas de la línea Profesional,
  // gratuitas por ahora): banco de escalas, borrador de cuestionario,
  // calculadora de tamaño muestral y matriz de triangulación ---
  assert(await page.isVisible(".sk-premium-banner"), "el aviso de que las funciones Premium son gratuitas por ahora es visible");
  assert((await page.$$(".sk-premium-badge")).length >= 5, "hay al menos 5 insignias 'Premium' (una por función nueva)");

  const outBancoEscalas = await page.textContent("#out_banco_escalas");
  assert(outBancoEscalas.trim().length > 0 && outBancoEscalas.trim() !== "—", "el banco de escalas validadas produce contenido");

  const outBorrador = await page.textContent("#out_borrador_cuestionario");
  assert(outBorrador.includes("1. ["), "el borrador de cuestionario numera al menos un ítem por indicador");

  const outMatriz = await page.textContent("#out_matriz_triangulacion");
  assert(outMatriz.includes("Convergencia"), "la matriz de triangulación genera la plantilla real para un problema clasificado como mixto: " + outMatriz.slice(0, 80));

  await page.selectOption("#sk_calc_tipo", "correlacion");
  await page.waitForTimeout(100);
  assert(!(await page.isVisible("#sk_calc_field_d")), "al elegir 'correlación' se oculta el campo de la d de Cohen");
  assert(await page.isVisible("#sk_calc_field_r"), "al elegir 'correlación' aparece el campo de r esperado");
  await page.fill("#sk_calc_r", "0.3");
  await page.click("#btn_calc_muestra");
  await page.waitForTimeout(100);
  const outCalc = await page.textContent("#out_calc_muestra");
  assert(/^n = 85\b/.test(outCalc.trim()), `la calculadora de tamaño muestral da n=85 para r=0.3, α=.05, potencia=.80: "${outCalc.slice(0, 40)}"`);

  // --- La campana de alertas es funcional ---
  await page.click("#sk_btn_alertas");
  await page.waitForTimeout(200);
  assert(await page.isVisible('.sk-step[data-stage="ejecutar"].active'), "clic en la campana de alertas cambia a la etapa 'Ejecutar'");

  const outAlertaInterseccional = await page.textContent("#out_alerta_interseccionalidad");
  assert(outAlertaInterseccional.trim().length > 0 && outAlertaInterseccional.trim() !== "—", "la alerta de interseccionalidad (Premium) produce contenido en la etapa Ejecutar");

  // --- Consejos de tu director de tesis (preguntas socráticas, puntos
  // débiles a defender, guía bibliográfica) ---
  const preguntasSocraticas = await page.textContent("#out_preguntas_socraticas");
  assert(preguntasSocraticas.includes("¿"), "preguntas socráticas presentes en la etapa Ejecutar");
  const guiaBiblio = await page.textContent("#out_guia_bibliografica");
  assert(guiaBiblio.includes("Google Scholar"), "guía de búsqueda bibliográfica presente en la etapa Ejecutar");

  // --- Validez, confiabilidad y sesgos metodológicos (exclusivo de la línea Profesional) ---
  const validezConfiabilidad = await page.textContent("#out_validez_confiabilidad");
  assert(validezConfiabilidad.trim().length > 0, "validez y confiabilidad presentes en la etapa Ejecutar (exclusivo Pro)");
  const sesgosMetodologicos = await page.textContent("#out_sesgos_metodologicos");
  assert(sesgosMetodologicos.includes("Sesgo de selección"), "sesgos metodológicos presentes en la etapa Ejecutar (exclusivo Pro)");

  // --- Rigor metodológico avanzado: mediación/moderación, unidad de
  // análisis/observación, tamaño muestral, consentimiento informado,
  // cronograma/factibilidad, preregistro/ciencia abierta (exclusivo Pro) ---
  const mediacionModeracion = await page.textContent("#out_mediacion_moderacion");
  assert(mediacionModeracion.includes("MEDIADORAS") && mediacionModeracion.includes("MODERADORAS"), "mediación/moderación presente en la etapa Ejecutar (exclusivo Pro)");
  const unidadAnalisisObservacion = await page.textContent("#out_unidad_analisis_observacion");
  assert(unidadAnalisisObservacion.includes("UNIDAD DE OBSERVACIÓN") && unidadAnalisisObservacion.includes("UNIDAD DE ANÁLISIS"), "unidad de análisis vs. observación presente en la etapa Ejecutar (exclusivo Pro)");
  const tamanoMuestral = await page.textContent("#out_tamano_muestral");
  assert(tamanoMuestral.length > 0, "tamaño muestral/potencia estadística presente en la etapa Ejecutar (exclusivo Pro)");
  const consentimientoInformado = await page.textContent("#out_consentimiento_informado");
  assert(consentimientoInformado.includes("consentimiento informado"), "plantilla de consentimiento informado presente en la etapa Ejecutar (exclusivo Pro)");
  const cronogramaFactibilidad = await page.textContent("#out_cronograma_factibilidad");
  assert(cronogramaFactibilidad.includes("Cronograma orientativo"), "cronograma y factibilidad presente en la etapa Ejecutar (exclusivo Pro)");
  const preregistroCienciaAbierta = await page.textContent("#out_preregistro_ciencia_abierta");
  assert(preregistroCienciaAbierta.length > 0, "preregistro y ciencia abierta presente en la etapa Ejecutar (exclusivo Pro)");

  // --- Historial: buscador filtra de verdad ---
  await page.click('.sk-sidebar-item[data-scrollto="sk_historial_panel"]');
  await page.waitForTimeout(150);
  const historialAntes = await page.$$eval("#sk_historial_lista .sk-historial-item", els => els.length);
  assert(historialAntes === 1, "historial tiene 1 entrada tras el análisis");
  await page.fill("#sk_historial_buscar", "xyznoexiste");
  await page.waitForTimeout(150);
  const historialFiltrado = await page.$$eval("#sk_historial_lista .sk-historial-item", els => els.length);
  assert(historialFiltrado === 0, "el buscador del historial filtra de verdad (sin resultados para un texto que no coincide)");
  await page.fill("#sk_historial_buscar", "");
  await page.waitForTimeout(150);

  // --- Exportar Word: navegar a la etapa "Comunicar" primero (el botón está ahí) ---
  await page.click('.sk-step[data-stage="comunicar"]');
  await page.waitForTimeout(150);
  const [downloadWord] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#btn_export_word"),
  ]);
  const docxPath = path.join(OUT_DIR, "informe_pro.docx");
  await downloadWord.saveAs(docxPath);

  // --- Exportar / importar proyecto (.json): guarda el estado del análisis
  // actual y lo recupera en la propia página, comprobando que el motor se
  // vuelve a ejecutar con el mismo texto (exclusivo Pro) ---
  const [downloadProyecto] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#btn_export_proyecto"),
  ]);
  const proyectoPath = path.join(OUT_DIR, "proyecto_pro.json");
  await downloadProyecto.saveAs(proyectoPath);
  const proyectoJson = JSON.parse(fs.readFileSync(proyectoPath, "utf-8"));
  assert(proyectoJson.formato === "sociokairos-proyecto", "el .json exportado declara el formato de proyecto SOCIOKAIROS");
  assert(proyectoJson.problema === PROBLEMA, "el .json exportado conserva el texto exacto del problema");

  await page.click('.sk-step[data-stage="definir"]');
  await page.click("#btn_clear");
  await page.waitForTimeout(150);
  const outVariablesTrasLimpiar = await page.textContent("#out_variables");
  assert(outVariablesTrasLimpiar.trim() === "—", "borrar problema deja las variables en blanco antes de importar");

  await page.click('.sk-step[data-stage="comunicar"]');
  await page.waitForTimeout(150);
  const inputImportProyecto = await page.$("#input_import_proyecto");
  await inputImportProyecto.setInputFiles(proyectoPath);
  await page.waitForTimeout(500);
  assert((await page.textContent("#status")).includes("Proyecto importado"), "importar proyecto confirma el estado en la barra de estado");
  assert((await page.inputValue("#txt_problema")) === PROBLEMA, "importar proyecto restaura el texto del problema");
  assert(await page.isVisible('.sk-step[data-stage="analizar"].active'), "importar proyecto vuelve a analizar y activa la etapa 'Analizar'");
  const outVariablesTrasImportar = await page.textContent("#out_variables");
  assert(outVariablesTrasImportar.trim() !== "—" && outVariablesTrasImportar.trim().length > 0, "importar proyecto reconstruye las variables con el mismo motor");

  await page.click('.sk-step[data-stage="comunicar"]');
  await page.waitForTimeout(150);

  // --- Transcripción cualitativa (pre-CAQDAS): formatea una transcripción
  // pegada por el usuario en un .docx con comentarios nativos de Word,
  // anclados a las categorías del libro de códigos del análisis actual
  // (exclusivo Pro) ---
  const TRANSCRIPCION = "María: Pues yo creo que las dinámicas familiares afectan mucho a la delincuencia.\nEntrevistador: ¿Por qué lo dices?\nMaría: Porque en mi barrio hay poco control social informal.";
  await page.fill("#txt_transcripcion", TRANSCRIPCION);
  const [downloadTranscripcion] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#btn_formatear_transcripcion"),
  ]);
  const transcripcionDocxPath = path.join(OUT_DIR, "transcripcion_pro.docx");
  await downloadTranscripcion.saveAs(transcripcionDocxPath);
  const previewTranscripcion = await page.textContent("#out_transcripcion_preview");
  assert(previewTranscripcion.includes("3 turno(s) de habla detectado(s)"), `la vista previa detecta los 3 turnos de la transcripción: "${previewTranscripcion}"`);
  assert(/\d+ fragmento\(s\) anotado/.test(previewTranscripcion), `la vista previa informa de las anotaciones encontradas: "${previewTranscripcion}"`);

  await browser.close();
  if (errors.length) throw new Error("Errores de página durante la prueba:\n" + errors.join("\n"));

  const unzipDir = path.join(OUT_DIR, "unzipped-pro");
  fs.rmSync(unzipDir, { recursive: true, force: true });
  fs.mkdirSync(unzipDir, { recursive: true });
  execSync(`unzip -o "${docxPath}" word/document.xml -d "${unzipDir}"`);
  const xml = fs.readFileSync(path.join(unzipDir, "word", "document.xml"), "utf-8");
  assert(xml.includes("contacto@sociokairos.com"), "docx contiene el nuevo correo de contacto en el pie");
  assert(!xml.includes("unizar.es"), "docx sin el correo antiguo de unizar.es");
  assert(xml.includes("SOCIOKAIROS Research") && !xml.includes("SOCIOKAIROS EDU"), "título de la nueva cabecera, sin 'EDU'");
  assert(xml.includes("INFORME") && xml.includes("RESEARCH SUITE"), "subtítulo de la cabecera presente");
  assert(xml.includes('w:val="dashed"'), "la cabecera y el pie usan la línea discontinua del nuevo patrón visual");
  assert(xml.includes("Heuristic software developed by Victor Hugo Pérez Gallo"), "crédito del pie en inglés presente");
  assert(xml.includes("19. Consejos de tu director de tesis"), "docx contiene la nueva sección de consejos de director de tesis");
  assert(xml.includes("Google Scholar"), "docx contiene la guía de búsqueda bibliográfica");
  assert(xml.includes("Revisión de coherencia"), "docx contiene la sección de revisión de coherencia");
  assert(xml.includes("20. Validez, confiabilidad y sesgos metodológicos"), "docx contiene la sección de validez/confiabilidad/sesgos (exclusivo Pro)");
  assert(xml.includes("21. Mediación y moderación"), "docx contiene la sección de mediación y moderación (exclusivo Pro)");
  assert(xml.includes("22. Unidad de análisis vs. unidad de observación"), "docx contiene la sección de unidad de análisis vs. observación (exclusivo Pro)");
  assert(xml.includes("23. Tamaño muestral y potencia estadística"), "docx contiene la sección de tamaño muestral (exclusivo Pro)");
  assert(xml.includes("24. Consentimiento informado"), "docx contiene la sección de consentimiento informado (exclusivo Pro)");
  assert(xml.includes("25. Cronograma y factibilidad"), "docx contiene la sección de cronograma y factibilidad (exclusivo Pro)");
  assert(xml.includes("26. Preregistro y ciencia abierta"), "docx contiene la sección de preregistro y ciencia abierta (exclusivo Pro)");
  assert(!xml.includes("Universidad de Zaragoza: consulta"), "docx sin la nota específica de la Universidad de Zaragoza");

  const unzipDirTranscripcion = path.join(OUT_DIR, "unzipped-transcripcion");
  fs.rmSync(unzipDirTranscripcion, { recursive: true, force: true });
  fs.mkdirSync(unzipDirTranscripcion, { recursive: true });
  execSync(`unzip -o "${transcripcionDocxPath}" -d "${unzipDirTranscripcion}"`);
  const xmlTranscripcion = fs.readFileSync(path.join(unzipDirTranscripcion, "word", "document.xml"), "utf-8");
  assert(xmlTranscripcion.includes("María: "), "docx de la transcripción conserva el nombre del interlocutor al inicio del turno");
  assert(xmlTranscripcion.includes("Entrevistador: "), "docx de la transcripción distingue los dos interlocutores");
  assert(xmlTranscripcion.includes("commentRangeStart") && xmlTranscripcion.includes("commentReference"), "docx de la transcripción ancla comentarios nativos de Word en el texto");
  const commentsXml = fs.readFileSync(path.join(unzipDirTranscripcion, "word", "comments.xml"), "utf-8");
  assert(commentsXml.includes("CÓDIGO SUGERIDO"), "comments.xml contiene el texto del código sugerido");
  const contentTypesTranscripcion = fs.readFileSync(path.join(unzipDirTranscripcion, "[Content_Types].xml"), "utf-8");
  assert(contentTypesTranscripcion.includes("wordprocessingml.comments+xml"), "el .docx registra el content-type de comments.xml");
  const relsTranscripcion = fs.readFileSync(path.join(unzipDirTranscripcion, "word", "_rels", "document.xml.rels"), "utf-8");
  assert(relsTranscripcion.includes("relationships/comments"), "el .docx registra la relación hacia comments.xml");

  console.log("OK: informe profesional en", docxPath);

  // --- Selector de idioma (es/en/pt): traduce la interfaz, pero el
  // contenido generado por el motor (los stats/variables/marcos ya
  // renderizados arriba, en español) debe permanecer intacto — solo la
  // interfaz es bilingüe, no el motor (ver src/i18n.js). ---
  const browser2 = await chromium.launch();
  const page2 = await browser2.newPage();
  const errors2 = [];
  page2.on("pageerror", (e) => errors2.push(String(e)));
  await page2.addInitScript(() => localStorage.setItem("sk_registro_enviado", "1"));
  await page2.goto("file://" + DIST_PRO);

  const langButtons = await page2.$$(".sk-lang-btn");
  assert(langButtons.length === 3, `debe haber 3 botones de idioma (es/en/pt): ${langButtons.length}`);

  const statusEsVacio = await page2.textContent("#status");
  await page2.click('.sk-lang-btn[data-lang="pt"]');
  await page2.waitForTimeout(150);
  assert((await page2.getAttribute("html", "lang")) === "pt", "html[lang] pasa a 'pt'");
  const btnReformularPt = await page2.textContent("#btn_reformular");
  assert(btnReformularPt.includes("Reformular problema e sugerir vari"), `botón reformular traducido al portugués: "${btnReformularPt}"`);

  await page2.click("#btn_reformular");
  await page2.waitForTimeout(100);
  const statusPtSinTexto = await page2.textContent("#status");
  assert(statusPtSinTexto.includes("Escreva primeiro um problema"), `mensaje de estado dinámico se traduce con el idioma activo: "${statusPtSinTexto}"`);
  assert(statusPtSinTexto !== statusEsVacio, "el mensaje de estado cambió respecto al español");

  await page2.fill("#txt_problema", PROBLEMA);
  await page2.click("#btn_reformular");
  await page2.waitForTimeout(500);
  const transparenciaPt = await page2.textContent("#out_transparencia");
  assert(transparenciaPt.includes("VARIABLE DEPENDIENTE"), "el contenido generado por el motor sigue en español con la interfaz en portugués (no se retraduce el resultado)");

  await page2.reload();
  await page2.waitForSelector('.sk-lang-btn.active[data-lang="pt"]', { timeout: 5000 }).catch(() => {});
  const activeLangTrasReload = await page2.getAttribute(".sk-lang-btn.active", "data-lang");
  assert(activeLangTrasReload === "pt", `el idioma persiste en localStorage tras recargar: "${activeLangTrasReload}"`);

  await browser2.close();
  if (errors2.length) throw new Error("Errores de página durante la prueba de idioma:\n" + errors2.join("\n"));

  // --- Registro obligatorio de primer uso (estadísticas), exclusivo Pro:
  // sin el flag de localStorage sembrado arriba, así que aquí se prueba el
  // arranque real de un dispositivo nuevo. ---
  const browser3 = await chromium.launch();
  const page3 = await browser3.newPage();
  const errors3 = [];
  page3.on("pageerror", (e) => errors3.push(String(e)));
  await page3.goto("file://" + DIST_PRO);
  await page3.waitForTimeout(200);

  assert(await page3.isVisible("#skRegistroModal"), "el modal de registro se muestra en el primer arranque");

  await page3.click("#skRegistroBtnEnviar");
  await page3.waitForTimeout(200);
  assert(await page3.isVisible("#skRegistroModal"), "el envío vacío no cierra el modal (campos requeridos por HTML5)");

  await page3.fill('#skRegistroModal input[name="nombre"]', "Nombre de prueba");
  await page3.fill('#skRegistroModal input[name="titulo"]', "Estudiante de Grado");
  await page3.fill('#skRegistroModal input[name="especialidad"]', "Sociología");
  await page3.fill('#skRegistroModal input[name="institucion"]', "Universidad de Prueba");
  await page3.fill('#skRegistroModal input[name="email"]', "prueba@example.com");
  await page3.click("#skRegistroBtnEnviar");
  await page3.waitForSelector("#skRegistroModal", { state: "hidden", timeout: 10000 });

  assert(!(await page3.isVisible("#skRegistroModal")), "el modal se cierra tras enviar, incluso si el envío de red falla (best-effort, no bloquea la app)");
  const flagRegistro = await page3.evaluate(() => localStorage.getItem("sk_registro_enviado"));
  assert(flagRegistro === "1", "se marca localStorage tras el intento de envío, para no volver a pedirlo en este dispositivo");

  await page3.reload();
  await page3.waitForTimeout(300);
  assert(!(await page3.isVisible("#skRegistroModal")), "tras recargar, no se vuelve a mostrar el modal en el mismo dispositivo");

  await page3.fill("#txt_problema", PROBLEMA);
  await page3.click("#btn_reformular");
  await page3.waitForTimeout(500);
  assert((await page3.textContent("#status")).includes("Análisis completado"), "el resto de la app funciona con normalidad tras completar el registro");

  await browser3.close();
  if (errors3.length) throw new Error("Errores de página durante la prueba de registro:\n" + errors3.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
