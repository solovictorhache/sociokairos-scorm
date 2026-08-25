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

  // --- La campana de alertas es funcional ---
  await page.click("#sk_btn_alertas");
  await page.waitForTimeout(200);
  assert(await page.isVisible('.sk-step[data-stage="ejecutar"].active'), "clic en la campana de alertas cambia a la etapa 'Ejecutar'");

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
  assert(!xml.includes("Universidad de Zaragoza: consulta"), "docx sin la nota específica de la Universidad de Zaragoza");

  console.log("OK: informe profesional en", docxPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
