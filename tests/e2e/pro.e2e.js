"use strict";
// Prueba end-to-end del build "Profesional" (native-app/pro-src, track 2):
// confirma que no queda SCORM ni identidad EDU/UNIZAR (overlay de arranque,
// estado SCORM, correo de contacto, pie e informe Word), y que el motor
// funciona exactamente igual que en el SCORM (mismo engine.js compartido).
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

  const headerText = await page.textContent("header h1");
  assert(headerText.trim() === "SOCIOKAIROS", "título de cabecera sin EDU/UNIZAR: " + headerText);

  const authorHtml = await page.innerHTML(".sk-author-top");
  assert(authorHtml.includes("contacto@sociokairos.com"), "correo de contacto actualizado en la cabecera");
  assert(!authorHtml.includes("unizar.es"), "cabecera sin correo unizar.es");

  await page.fill("#txt_problema", PROBLEMA);
  await page.click("#btn_reformular");
  await page.waitForTimeout(500);

  const status = await page.textContent("#status");
  assert(status.includes("Análisis completado"), "análisis completado con el mismo motor que el SCORM");

  const transparencia = await page.textContent("#out_transparencia");
  assert(transparencia.includes("VARIABLE DEPENDIENTE"), "transparencia del análisis funciona igual que en SCORM");

  const [downloadWord] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#btn_export_word"),
  ]);
  const docxPath = path.join(OUT_DIR, "informe_pro.docx");
  await downloadWord.saveAs(docxPath);

  const unzipDir = path.join(OUT_DIR, "unzipped-pro");
  fs.rmSync(unzipDir, { recursive: true, force: true });
  fs.mkdirSync(unzipDir, { recursive: true });
  execSync(`unzip -o "${docxPath}" word/document.xml -d "${unzipDir}"`);
  const xml = fs.readFileSync(path.join(unzipDir, "word", "document.xml"), "utf-8");
  assert(xml.includes("contacto@sociokairos.com"), "docx contiene el nuevo correo de contacto en el pie");
  assert(!xml.includes("unizar.es"), "docx sin el correo antiguo de unizar.es");
  assert(xml.includes("Informe SOCIOKAIROS") && !xml.includes("Informe SOCIOKAIROS EDU"), "título del informe sin 'EDU'");
  assert(!xml.includes("Universidad de Zaragoza: consulta"), "docx sin la nota específica de la Universidad de Zaragoza");

  await browser.close();
  if (errors.length) throw new Error("Errores de página durante la prueba:\n" + errors.join("\n"));

  console.log("OK: informe profesional en", docxPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
