/* ================= Integración SCORM (1.2 / 2004) ================= */

let scormAPI = null;
let scormVersion = null;
let scormCompletedYaMarcado = false;

function scormFindAPI(win) {
  let attempts = 0;
  while (win.API == null && win.API_1484_11 == null && win.parent != null && win.parent !== win && attempts < 500) {
    attempts++;
    win = win.parent;
  }
  if (win.API_1484_11) { scormVersion = "2004"; return win.API_1484_11; }
  if (win.API) { scormVersion = "1.2"; return win.API; }
  return null;
}

function scormGetAPI() {
  let api = scormFindAPI(window);
  if (!api && window.opener) api = scormFindAPI(window.opener);
  return api;
}

function scormInit() {
  const statusEl = document.getElementById("scorm_status");
  try {
    scormAPI = scormGetAPI();
    if (!scormAPI) {
      if (statusEl) statusEl.textContent = "Modo independiente: no se detectó ningún LMS (sin seguimiento SCORM).";
      return false;
    }
    const result = scormVersion === "2004" ? scormAPI.Initialize("") : scormAPI.LMSInitialize("");
    if (result === "true" || result === true) {
      const already = scormVersion === "2004"
        ? scormAPI.GetValue("cmi.completion_status")
        : scormAPI.LMSGetValue("cmi.core.lesson_status");
      if (!already || already === "not attempted" || already === "unknown") {
        scormSetStatus("incomplete");
      }
      if (statusEl) statusEl.textContent = `Conectado al LMS (SCORM ${scormVersion}). El progreso se registrará en Moodle.`;
      return true;
    }
    scormAPI = null;
    if (statusEl) statusEl.textContent = "No se pudo inicializar la conexión SCORM con el LMS.";
    return false;
  } catch (e) {
    scormAPI = null;
    if (statusEl) statusEl.textContent = "Modo independiente: no se detectó ningún LMS (sin seguimiento SCORM).";
    return false;
  }
}

function scormSetStatus(status) {
  if (!scormAPI) return;
  try {
    if (scormVersion === "2004") {
      scormAPI.SetValue("cmi.completion_status", status);
      scormAPI.SetValue("cmi.success_status", status === "completed" ? "passed" : "unknown");
    } else {
      scormAPI.LMSSetValue("cmi.core.lesson_status", status);
    }
    scormCommit();
  } catch (e) { /* LMS no disponible o rechazó el valor: continuar sin bloquear la interfaz */ }
}

function scormCommit() {
  if (!scormAPI) return;
  try {
    if (scormVersion === "2004") scormAPI.Commit("");
    else scormAPI.LMSCommit("");
  } catch (e) { /* ignorar fallos de commit */ }
}

function scormMarkCompleted() {
  if (scormCompletedYaMarcado) { scormCommit(); return; }
  scormCompletedYaMarcado = true;
  scormSetStatus("completed");
}

function scormFinish() {
  if (!scormAPI) return;
  try {
    if (scormVersion === "2004") scormAPI.Terminate("");
    else scormAPI.LMSFinish("");
  } catch (e) { /* ignorar */ }
  scormAPI = null;
}

/* ================= Tema claro/oscuro y pantalla completa ================= */

function toggleSKTheme() {
  document.body.classList.toggle("sk-dark");
  try { localStorage.setItem("sk_theme", document.body.classList.contains("sk-dark") ? "dark" : "light"); } catch (e) { /* localStorage no disponible */ }
}

function salirPantallaCompleta() {
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* no disponible */ }
}

function startSociokairosFullscreen() {
  const overlay = document.getElementById("sociokairosStartOverlay");
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  if (overlay) overlay.style.display = "none";
}

/* ================= Wiring de la interfaz ================= */

let ultimoResultado = null;

function actualizarInterfazConResultado(resultado) {
  ultimoResultado = resultado;

  const badge = document.getElementById("badge_area");
  if (badge) {
    const areasTxt = (resultado.areas && resultado.areas.length) ? resultado.areas.join(" · ") : resultado.area;
    badge.textContent = "Áreas sociológicas sugeridas: " + areasTxt;
  }

  const outRef = document.getElementById("out_reformulacion");
  if (outRef) {
    outRef.textContent =
      "Pregunta 1 – Descriptiva:\n" + resultado.p1 +
      "\n\nPregunta 2 – Relacional / explicativa:\n" + resultado.p2 +
      "\n\nPregunta 3 – Crítica / estratégica:\n" + resultado.p3;
  }

  const outVars = document.getElementById("out_variables");
  if (outVars) {
    const viTxt = resultado.vi.length ? "- " + resultado.vi.join("\n- ") : "Pendiente de especificar.";
    const vdTxt = resultado.vd.length ? "- " + resultado.vd.join("\n- ") : "Pendiente de especificar.";
    const notaCandidata = resultado.viEsCandidato ? "\n\n" + NOTA_VI_CANDIDATA : "";
    outVars.textContent = "VI sugeridas (factores explicativos):\n" + viTxt + notaCandidata + "\n\nVD sugeridas (fenómenos a explicar):\n" + vdTxt + "\n\n" + NOTA_DIRECCIONALIDAD_VIVD;
  }

  const outNotas = document.getElementById("out_notas");
  if (outNotas) {
    const corrTxt = resultado.correlaciones.length ? resultado.correlaciones.join("\n") : "Formula al menos una relación hipotética entre VI y VD.";
    const hipTxt = resultado.hipotesis.length ? "- " + resultado.hipotesis.join("\n- ") : "Pendiente de formular.";
    const marTxt = resultado.marcos.length ? "- " + resultado.marcos.join("\n- ") : "Pendiente de sugerir marcos.";
    outNotas.textContent = "Correlaciones a explorar:\n" + corrTxt + "\n\nHipótesis de trabajo:\n" + hipTxt + "\n\nMarcos teóricos sugeridos:\n" + marTxt + "\n" + NOTA_JUSTIFICAR_MARCOS;
  }

  const outDiseno = document.getElementById("out_diseno");
  if (outDiseno) {
    const opTxt = operacionalizacionTexto(resultado.operacionalizacion);
    outDiseno.textContent = "Unidad de análisis sugerida:\n" + resultado.unidad + "\n\n" + resultado.diseno + "\n\nOperacionalización sugerida:\n" + opTxt;
  }

  const outFuentes = document.getElementById("out_fuentes");
  if (outFuentes) {
    outFuentes.textContent = resultado.fuentes.length ? "- " + resultado.fuentes.join("\n- ") : "Pendiente de identificar bases de datos y fuentes administrativas específicas.";
  }

  const outAlertas = document.getElementById("out_alertas");
  if (outAlertas) outAlertas.textContent = generarAlertasMetodologicas(document.getElementById("txt_problema").value, resultado);

  const outTrad = document.getElementById("out_tradiciones");
  if (outTrad) outTrad.textContent = generarTradiciones(resultado, document.getElementById("txt_problema").value);

  const outMapa = document.getElementById("out_mapa");
  if (outMapa) outMapa.textContent = generarMapaLogico(resultado);

  const outDisPlus = document.getElementById("out_disenos_plus");
  if (outDisPlus) outDisPlus.textContent = generarDisenos(document.getElementById("txt_problema").value, resultado);

  const outVisual = document.getElementById("out_visual_svg");
  if (outVisual) outVisual.innerHTML = generarSvgVisual(resultado, "causal");
}

function limpiarSalidasPorErrorEdu() {
  const ids = ["out_variables", "out_notas", "out_diseno", "out_fuentes", "out_alertas", "out_tradiciones", "out_mapa", "out_disenos_plus"];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) el.textContent = "—";
  }
  const outVisual = document.getElementById("out_visual_svg");
  if (outVisual) outVisual.innerHTML = "";
  const badge = document.getElementById("badge_area");
  if (badge) badge.textContent = "Validación pendiente: reformula el problema inicial.";
  const selector = document.getElementById("selector_version");
  if (selector) selector.style.display = "none";
  ultimoResultado = null;
}

function activarSalidasValidasEdu() {
  const selector = document.getElementById("selector_version");
  if (selector) selector.style.display = "block";
}

function descargarBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function obtenerVersionSeleccionada(resultado, txtOriginal) {
  let problemaTrabajo = txtOriginal;
  let versionLabel = "P2 – relacional / explicativa (por defecto)";
  const sel = document.querySelector('input[name="vers_sel"]:checked');
  if (sel) {
    const val = sel.value;
    if (val === "1") { problemaTrabajo = resultado.p1 || txtOriginal; versionLabel = "P1 – descriptiva"; }
    else if (val === "2") { problemaTrabajo = resultado.p2 || txtOriginal; versionLabel = "P2 – relacional / explicativa"; }
    else if (val === "3") { problemaTrabajo = resultado.p3 || txtOriginal; versionLabel = "P3 – crítica / estratégica"; }
  } else if (resultado.p2) {
    problemaTrabajo = resultado.p2;
    versionLabel = "P2 – relacional / explicativa (por defecto)";
  }
  const hint = document.getElementById("version_elegida_hint");
  if (hint) {
    hint.textContent = (problemaTrabajo === txtOriginal)
      ? "No has seleccionado ninguna versión: se emplea el problema original tal como fue escrito."
      : `Exportando informe usando como base: ${versionLabel}.`;
  }
  return { problemaTrabajo, versionLabel };
}

window.addEventListener("load", function () {
  scormInit();

  try {
    if (localStorage.getItem("sk_theme") === "dark") document.body.classList.add("sk-dark");
  } catch (e) { /* localStorage no disponible */ }

  const btnReformular = document.getElementById("btn_reformular");
  const btnClear = document.getElementById("btn_clear");
  const btnExportWord = document.getElementById("btn_export_word");
  const btnExportCsv = document.getElementById("btn_export_csv");
  const btnVisualCausal = document.getElementById("btn_visual_causal");
  const btnVisualRed = document.getElementById("btn_visual_red");
  const btnVisualCapas = document.getElementById("btn_visual_capas");
  const statusEl = document.getElementById("status");
  const txtEl = document.getElementById("txt_problema");

  if (btnReformular) {
    btnReformular.addEventListener("click", function () {
      const txt = txtEl ? txtEl.value : "";
      if (!txt.trim()) {
        if (statusEl) statusEl.textContent = "Escribe primero un problema para poder aplicar la heurística SOCIOKAIROS.";
        return;
      }
      btnReformular.disabled = true;
      if (statusEl) statusEl.textContent = "Procesando heurística SOCIOKAIROS en el navegador…";

      const validacion = validarProblemaEdu(txt);
      if (!validacion.valido) {
        const outRef = document.getElementById("out_reformulacion");
        if (outRef) outRef.textContent = construirFeedbackValidacionEdu(validacion);
        limpiarSalidasPorErrorEdu();
        if (statusEl) statusEl.textContent = "Reformula el problema inicial: aún no cumple la estructura mínima de SOCIOKAIROS EDU.";
        btnReformular.disabled = false;
        return;
      }
      activarSalidasValidasEdu();

      try {
        const resultado = analizarProblema(txt);
        actualizarInterfazConResultado(resultado);
        if (statusEl) statusEl.textContent = "Análisis completado. Puedes exportar a Word o CSV.";
        scormMarkCompleted();
      } catch (e) {
        if (statusEl) statusEl.textContent = "Error interno del motor: " + e.message;
      } finally {
        btnReformular.disabled = false;
      }
    });
  }

  if (btnClear) {
    btnClear.addEventListener("click", function () {
      const ids = ["txt_problema", "badge_area", "out_reformulacion", "out_variables", "out_notas", "out_diseno", "out_fuentes", "out_alertas", "out_tradiciones", "out_mapa", "out_disenos_plus"];
      ids.forEach(function (id) {
        const e = document.getElementById(id);
        if (!e) return;
        if (e.tagName === "TEXTAREA" || e.tagName === "INPUT") e.value = "";
        else e.textContent = "—";
      });
      const outVisual = document.getElementById("out_visual_svg");
      if (outVisual) outVisual.innerHTML = "";
      const selector = document.getElementById("selector_version");
      if (selector) selector.style.display = "none";
      ultimoResultado = null;
      if (statusEl) statusEl.textContent = "Problema borrado. Introduce un nuevo problema científico.";
    });
  }

  if (btnVisualCausal) btnVisualCausal.addEventListener("click", function () {
    if (!ultimoResultado) return;
    const outVisual = document.getElementById("out_visual_svg");
    if (outVisual) outVisual.innerHTML = generarSvgVisual(ultimoResultado, "causal");
  });
  if (btnVisualRed) btnVisualRed.addEventListener("click", function () {
    if (!ultimoResultado) return;
    const outVisual = document.getElementById("out_visual_svg");
    if (outVisual) outVisual.innerHTML = generarSvgVisual(ultimoResultado, "red");
  });
  if (btnVisualCapas) btnVisualCapas.addEventListener("click", function () {
    if (!ultimoResultado) return;
    const outVisual = document.getElementById("out_visual_svg");
    if (outVisual) outVisual.innerHTML = generarSvgVisual(ultimoResultado, "capas");
  });

  if (btnExportWord) {
    btnExportWord.addEventListener("click", function () {
      const txt = txtEl ? txtEl.value.trim() : "";
      if (!txt) {
        if (statusEl) statusEl.textContent = "Escribe primero un problema para poder exportar el informe.";
        return;
      }
      if (!ultimoResultado) {
        if (statusEl) statusEl.textContent = "Reformula el problema primero (debe pasar la validación SOCIOKAIROS EDU).";
        return;
      }
      if (statusEl) statusEl.textContent = "Generando informe Word…";
      try {
        const resultado = ultimoResultado;
        const { problemaTrabajo, versionLabel } = obtenerVersionSeleccionada(resultado, txt);
        const zipBytes = construirInformeWord(resultado, problemaTrabajo, versionLabel, txt);
        const blob = new Blob([zipBytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
        descargarBlob(blob, `Informe_SOCIOKAIROS_${ts}.docx`);
        if (statusEl) statusEl.textContent = "Informe Word generado.";
        scormMarkCompleted();
      } catch (e) {
        if (statusEl) statusEl.textContent = "Error al generar el informe Word: " + e.message;
      }
    });
  }

  if (btnExportCsv) {
    btnExportCsv.addEventListener("click", function () {
      const txt = txtEl ? txtEl.value.trim() : "";
      if (!txt) {
        if (statusEl) statusEl.textContent = "Escribe primero un problema para poder exportar la operacionalización.";
        return;
      }
      if (!ultimoResultado) {
        if (statusEl) statusEl.textContent = "Reformula el problema primero (debe pasar la validación SOCIOKAIROS EDU).";
        return;
      }
      if (statusEl) statusEl.textContent = "Generando CSV de operacionalización…";
      try {
        const csvText = exportarCSV(ultimoResultado);
        const blob = new Blob(["﻿" + csvText], { type: "text/csv;charset=utf-8" });
        descargarBlob(blob, "Operacionalizacion_SOCIOKAIROS.csv");
        if (statusEl) statusEl.textContent = "CSV de operacionalización generado.";
        scormMarkCompleted();
      } catch (e) {
        if (statusEl) statusEl.textContent = "Error al generar el CSV: " + e.message;
      }
    });
  }
});

window.addEventListener("beforeunload", scormFinish);
window.addEventListener("pagehide", scormFinish);
