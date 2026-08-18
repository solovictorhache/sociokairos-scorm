"use strict";
// Prueba end-to-end de las 4 mejoras añadidas sobre el paquete SCORM base
// (transparencia de detección, selector manual VI/VD, historial local y
// justificación teórica en el Word exportado). Complementa scorm.e2e.js,
// que cubre el flujo básico de reformular/exportar.
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const PROBLEMA = "cuales son las causas familiares del alto indice de delincuencia en zaragoza en el 2025?";
const OUT_DIR = path.join(__dirname, "..", "..", ".e2e-output");
const JUSTIFICACION = "Elijo a Merton porque la anomia explica bien la tensión entre metas y medios legítimos en este barrio.";

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

  await page.addInitScript(() => {
    window.__scormData = {};
    window.API = {
      LMSInitialize: () => "true",
      LMSSetValue: (k, v) => { window.__scormData[k] = v; return "true"; },
      LMSGetValue: (k) => window.__scormData[k] || "",
      LMSCommit: () => "true",
      LMSFinish: () => "true",
    };
  });

  const filePath = "file://" + path.resolve(__dirname, "..", "..", "scorm_plugin", "index.html");
  await page.goto(filePath);
  await page.click("#sociokairosStartOverlay button");
  await page.waitForTimeout(200);

  // --- Reformular con el caso reportado (transposición "delicnuencia" ya corregida a "delincuencia") ---
  await page.fill("#txt_problema", PROBLEMA);
  await page.click("#btn_reformular");
  await page.waitForTimeout(500);

  const status = await page.textContent("#status");
  assert(status.includes("Análisis completado"), "análisis inicial completado: " + status);

  // --- Transparencia de detección ---
  const transparencia = await page.textContent("#out_transparencia");
  assert(transparencia.includes("VARIABLE DEPENDIENTE"), "transparencia muestra bloque VD");
  assert(transparencia.includes('detectado a partir de "delincuencia"'), "transparencia explica VD por 'delincuencia'");
  assert(transparencia.includes("MARCOS TEÓRICOS SUGERIDOS"), "transparencia muestra bloque de marcos");

  // --- Historial local ---
  const historialItems = await page.$$("#sk_historial_lista .sk-historial-item");
  assert(historialItems.length === 1, "historial tiene 1 entrada tras el primer análisis");
  assert(await page.isVisible("#btn_historial_borrar"), "botón «Borrar historial» visible tras guardar una entrada");

  // --- Selector manual VI/VD ---
  const varsAntes = await page.textContent("#out_variables");
  assert(varsAntes.includes("las dinámicas familiares"), "VI antes del swap contiene 'dinámicas familiares'");

  await page.click("#btn_swap_vivd");
  await page.waitForTimeout(200);
  const varsDespues = await page.textContent("#out_variables");
  assert(varsDespues.includes("intercambiada manualmente"), "nota de intercambio visible tras swap");
  const refDespues = await page.textContent("#out_reformulacion");
  assert(refDespues.includes("influyen la delincuencia en la configuración de las dinámicas familiares"), "P2 recalculada tras swap");

  await page.click("#btn_swap_vivd"); // deshacer, para dejar el estado limpio antes de exportar
  await page.waitForTimeout(200);
  const varsRestauradas = await page.textContent("#out_variables");
  assert(!varsRestauradas.includes("intercambiada manualmente"), "nota de intercambio desaparece tras deshacer swap");

  // --- Justificación teórica en el Word exportado ---
  await page.fill("#txt_justificacion_marco", JUSTIFICACION);

  const [downloadWord] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#btn_export_word"),
  ]);
  const docxPath = path.join(OUT_DIR, "informe_justificado.docx");
  await downloadWord.saveAs(docxPath);

  // --- Cargar desde el historial dispara un reanálisis completo ---
  await page.fill("#txt_problema", "");
  const historialBtn = await page.$("#sk_historial_lista .sk-historial-item");
  await historialBtn.click();
  await page.waitForTimeout(500);
  const txtCargado = await page.inputValue("#txt_problema");
  assert(txtCargado === PROBLEMA, "clic en historial recarga el texto original");
  const statusTrasHistorial = await page.textContent("#status");
  assert(statusTrasHistorial.includes("Análisis completado"), "clic en historial vuelve a analizar");

  await browser.close();
  if (errors.length) throw new Error("Errores de página durante la prueba:\n" + errors.join("\n"));

  const unzipDir = path.join(OUT_DIR, "unzipped-justificado");
  fs.rmSync(unzipDir, { recursive: true, force: true });
  fs.mkdirSync(unzipDir, { recursive: true });
  execSync(`unzip -o "${docxPath}" word/document.xml -d "${unzipDir}"`);
  const xml = fs.readFileSync(path.join(unzipDir, "word", "document.xml"), "utf-8");
  assert(xml.includes("Justificaci"), "el docx contiene el encabezado de justificación teórica");
  assert(xml.includes("anomia explica bien la tensi"), "el docx contiene literalmente el texto escrito por el estudiante");

  console.log("OK: informe con justificación en", docxPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
