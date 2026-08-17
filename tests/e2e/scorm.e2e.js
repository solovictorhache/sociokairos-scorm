"use strict";
// Prueba end-to-end del paquete SCORM ya construido (scorm_plugin/index.html):
// simula un LMS SCORM 1.2, rellena un problema, reformula, comprueba que la
// interfaz y el seguimiento SCORM responden, y exporta a Word y CSV. Pensado
// para CI: requiere que ya se haya hecho `npx playwright install chromium`.
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const PROBLEMA = "¿Cómo influye la precariedad laboral en la salud mental de los jóvenes en Zaragoza en 2024?";
const OUT_DIR = path.join(__dirname, "..", "..", ".e2e-output");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
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

  await page.fill("#txt_problema", PROBLEMA);
  await page.click("#btn_reformular");
  await page.waitForTimeout(500);

  const status = await page.textContent("#status");
  assert(status.includes("Análisis completado"), `estado inesperado tras reformular: "${status}"`);

  const variables = await page.textContent("#out_variables");
  assert(variables.includes("VD sugeridas"), "no se renderizaron las variables detectadas");

  const problemaPerfecto = await page.textContent("#out_problema_perfecto");
  assert(problemaPerfecto.trim().length > 0, "no se generó la síntesis del problema definitivo");

  const guiaCodigos = await page.textContent("#out_guia_codigos");
  assert(guiaCodigos.includes("Libro de códigos"), "no se generó la guía cualitativa");

  const lessonStatus = await page.evaluate(() => window.__scormData["cmi.core.lesson_status"]);
  assert(lessonStatus === "completed", `SCORM no marcó completed: "${lessonStatus}"`);

  const [downloadWord] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#btn_export_word"),
  ]);
  const docxPath = path.join(OUT_DIR, "informe.docx");
  await downloadWord.saveAs(docxPath);

  const [downloadCsv] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#btn_export_csv"),
  ]);
  const csvPath = path.join(OUT_DIR, "operacionalizacion.csv");
  await downloadCsv.saveAs(csvPath);

  await browser.close();

  if (errors.length) {
    throw new Error("Errores de página durante la prueba:\n" + errors.join("\n"));
  }

  console.log("OK: informe Word en", docxPath);
  console.log("OK: CSV en", csvPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
