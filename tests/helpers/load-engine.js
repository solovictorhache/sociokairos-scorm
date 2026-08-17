"use strict";
// src/geo-data.js y src/engine.js no son módulos Node independientes: en el
// paquete final se concatenan como <script> en el navegador y se apoyan en
// variables globales compartidas (GEO_ALIASES, SK_DOMINIOS...). Para poder
// probarlos con node:test sin duplicar ese código, se concatenan aquí igual
// que hace src/build.py y se evalúan en un módulo CommonJS aparte.
const fs = require("fs");
const path = require("path");
const Module = require("module");

const SRC = path.join(__dirname, "..", "..", "src");

function cargarMotor() {
  const geo = fs.readFileSync(path.join(SRC, "geo-data.js"), "utf-8");
  const engine = fs.readFileSync(path.join(SRC, "engine.js"), "utf-8");
  const codigo = geo + "\n" + engine;

  const m = new Module(path.join(SRC, "__engine_bajo_test__.js"), module);
  m.filename = path.join(SRC, "__engine_bajo_test__.js");
  m.paths = Module._nodeModulePaths(SRC);
  m._compile(codigo, m.filename);
  return m.exports;
}

module.exports = { cargarMotor };
