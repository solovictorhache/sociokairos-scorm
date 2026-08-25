"use strict";
// Igual que load-engine.js, pero añade también docxwriter.js y
// transcripcion-word.js (concatenados en el mismo orden que build.py),
// para poder probar construirTranscripcionWord() de extremo a extremo sin
// duplicar ese código. Ninguno de los dos trae module.exports propio (se
// ensamblan como <script> concatenado, no como módulos independientes),
// así que se añade uno al final del código concatenado con exactamente lo
// que necesitan los tests.
const fs = require("fs");
const path = require("path");
const Module = require("module");

const SRC = path.join(__dirname, "..", "..", "src");

function stripModuleExports(js) {
  return js.replace(/\nif \(typeof module.*?\n\}\n/s, "\n");
}

function cargarMotorConDocx() {
  const geo = fs.readFileSync(path.join(SRC, "geo-data.js"), "utf-8");
  const engine = stripModuleExports(fs.readFileSync(path.join(SRC, "engine.js"), "utf-8"));
  const docxwriter = stripModuleExports(fs.readFileSync(path.join(SRC, "docxwriter.js"), "utf-8"));
  const transcripcion = fs.readFileSync(path.join(SRC, "transcripcion-word.js"), "utf-8");
  const exportLine = "\nmodule.exports = { detectarTurnosHabla, anotarTurnosConCodigos, construirTranscripcionWord, NOTA_TRANSCRIPCION_CAQDAS };\n";
  const codigo = 'const LOGO_BASE64 = "";\n' + geo + "\n" + engine + "\n" + docxwriter + "\n" + transcripcion + exportLine;

  const m = new Module(path.join(SRC, "__motor_docx_bajo_test__.js"), module);
  m.filename = path.join(SRC, "__motor_docx_bajo_test__.js");
  m.paths = Module._nodeModulePaths(SRC);
  m._compile(codigo, m.filename);
  return m.exports;
}

module.exports = { cargarMotorConDocx };
