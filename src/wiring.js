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

/* ================= pop-up de corrección de erratas ================= */
/**
 * Muestra el pop-up para UNA errata sospechosa (ver detectarErratasSospechosas
 * en engine.js) y resuelve con la palabra elegida por el estudiante, o null
 * si decide continuar sin corregir. Nunca corrige nada por sí sola: solo
 * pregunta, y quien decide es el estudiante.
 */
function mostrarModalErrata(errata) {
  return new Promise((resolve) => {
    const modal = document.getElementById("skTypoModal");
    const palabraEl = document.getElementById("skTypoPalabra");
    const btnSug1 = document.getElementById("skTypoBtnSug1");
    const btnSug2 = document.getElementById("skTypoBtnSug2");
    const inputManual = document.getElementById("skTypoInputManual");
    const btnManual = document.getElementById("skTypoBtnManual");
    const btnContinuar = document.getElementById("skTypoBtnContinuar");
    if (!modal || !palabraEl || !btnSug1 || !btnSug2 || !inputManual || !btnManual || !btnContinuar) {
      resolve(null);
      return;
    }

    palabraEl.textContent = errata.original;
    inputManual.value = "";

    const sugerencias = errata.sugerencias || [];
    btnSug1.textContent = sugerencias[0] || "";
    btnSug1.style.display = sugerencias[0] ? "" : "none";
    btnSug2.textContent = sugerencias[1] || "";
    btnSug2.style.display = sugerencias[1] ? "" : "none";

    const limpiar = () => {
      modal.style.display = "none";
      btnSug1.removeEventListener("click", onSug1);
      btnSug2.removeEventListener("click", onSug2);
      btnManual.removeEventListener("click", onManual);
      btnContinuar.removeEventListener("click", onContinuar);
    };
    const onSug1 = () => { limpiar(); resolve(sugerencias[0] || null); };
    const onSug2 = () => { limpiar(); resolve(sugerencias[1] || null); };
    const onManual = () => {
      const valor = inputManual.value.trim();
      limpiar();
      resolve(valor || null);
    };
    const onContinuar = () => { limpiar(); resolve(null); };

    btnSug1.addEventListener("click", onSug1);
    btnSug2.addEventListener("click", onSug2);
    btnManual.addEventListener("click", onManual);
    btnContinuar.addEventListener("click", onContinuar);

    modal.style.display = "flex";
  });
}

/**
 * Revisa el texto en busca de erratas sospechosas y, si encuentra alguna,
 * pregunta al estudiante (una a la vez) y sustituye solo esa palabra en el
 * textarea si elige una corrección. Devuelve el texto final (corregido o
 * no) para que el flujo de reformular continúe con él.
 */
async function resolverErratasAntesDeReformular(txtEl) {
  let texto = txtEl.value;
  const erratas = detectarErratasSospechosas(texto);
  if (!erratas.length) return texto;

  const eleccion = await mostrarModalErrata(erratas[0]);
  if (eleccion) {
    texto = texto.replace(erratas[0].original, eleccion);
    txtEl.value = texto;
  }
  return texto;
}

/* ================= Historial local de problemas trabajados ================= */
/**
 * Guarda en localStorage (solo en este dispositivo, nunca se envía a
 * ningún servidor) los últimos problemas analizados con éxito, para que
 * el estudiante pueda retomarlos y comparar versiones sucesivas mientras
 * los va puliendo. Si localStorage no está disponible (p. ej. algunos
 * iframes de LMS con almacenamiento restringido), el historial
 * simplemente no persiste entre sesiones, sin romper el resto de la app.
 */
const SK_HISTORIAL_KEY = "sk_historial";
const SK_HISTORIAL_MAX = 8;

function cargarHistorial() {
  try {
    const raw = localStorage.getItem(SK_HISTORIAL_KEY);
    const lista = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? lista : [];
  } catch (e) {
    return [];
  }
}

function guardarEnHistorial(texto, resultado) {
  const t = (texto || "").trim();
  if (!t) return;
  try {
    let lista = cargarHistorial().filter(item => item.texto !== t);
    lista.unshift({
      texto: t,
      fecha: Date.now(),
      vd: (resultado.vd && resultado.vd[0]) || "",
      area: resultado.area || ""
    });
    lista = lista.slice(0, SK_HISTORIAL_MAX);
    localStorage.setItem(SK_HISTORIAL_KEY, JSON.stringify(lista));
  } catch (e) { /* localStorage no disponible: el historial no persiste */ }
}

function borrarHistorialGuardado() {
  try { localStorage.removeItem(SK_HISTORIAL_KEY); } catch (e) { /* no disponible */ }
}

function formatearFechaHistorial(ts) {
  try {
    return new Date(ts).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return "";
  }
}

function renderizarHistorial() {
  const cont = document.getElementById("sk_historial_lista");
  const btnBorrar = document.getElementById("btn_historial_borrar");
  if (!cont) return;
  const lista = cargarHistorial();

  if (!lista.length) {
    cont.innerHTML = "";
    const vacio = document.createElement("p");
    vacio.className = "sk-historial-vacio";
    vacio.textContent = "Todavía no has analizado ningún problema en este dispositivo.";
    cont.appendChild(vacio);
    if (btnBorrar) btnBorrar.style.display = "none";
    return;
  }

  cont.innerHTML = "";
  lista.forEach(item => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sk-historial-item";

    const txtSpan = document.createElement("span");
    txtSpan.className = "sk-historial-texto";
    txtSpan.textContent = item.texto;
    btn.appendChild(txtSpan);

    const fechaSpan = document.createElement("span");
    fechaSpan.className = "sk-historial-fecha";
    fechaSpan.textContent = formatearFechaHistorial(item.fecha);
    btn.appendChild(fechaSpan);

    btn.title = "VD: " + (item.vd || "—") + " · Área: " + (item.area || "—");
    btn.addEventListener("click", function () {
      const txtEl = document.getElementById("txt_problema");
      const btnReformular = document.getElementById("btn_reformular");
      if (!txtEl || !btnReformular) return;
      txtEl.value = item.texto;
      btnReformular.click();
      txtEl.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    cont.appendChild(btn);
  });

  if (btnBorrar) btnBorrar.style.display = "";
}

/* ================= Wiring de la interfaz ================= */

let ultimoResultado = null;
let ultimoTextoAnalizado = "";
let viVdIntercambiado = false;

function actualizarInterfazConResultado(resultado) {
  ultimoResultado = resultado;

  const btnSwap = document.getElementById("btn_swap_vivd");
  if (btnSwap) {
    btnSwap.disabled = false;
    btnSwap.textContent = resultado.intercambiado
      ? "⇄ Deshacer intercambio (volver a la dirección original)"
      : "⇄ Intercambiar VI ↔ VD";
  }

  const badge = document.getElementById("badge_area");
  if (badge) {
    const areasTxt = (resultado.areas && resultado.areas.length) ? resultado.areas.join(" · ") : resultado.area;
    badge.textContent = "Áreas sociológicas sugeridas: " + areasTxt;
  }

  const outPerfecto = document.getElementById("out_problema_perfecto");
  if (outPerfecto) {
    outPerfecto.textContent = construirProblemaPerfecto(resultado, "P2 – relacional / explicativa (por defecto)", resultado.p2);
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
    const notaIntercambio = resultado.intercambiado ? "⇄ Dirección VI/VD intercambiada manualmente respecto a la convención léxica del motor.\n\n" : "";
    outVars.textContent = notaIntercambio + "VI sugeridas (factores explicativos):\n" + viTxt + notaCandidata + "\n\nVD sugeridas (fenómenos a explicar):\n" + vdTxt + "\n\n" + NOTA_DIRECCIONALIDAD_VIVD;
  }

  const outNotas = document.getElementById("out_notas");
  if (outNotas) {
    const corrTxt = resultado.correlaciones.length ? resultado.correlaciones.join("\n") : "Formula al menos una relación hipotética entre VI y VD.";
    const hipTxt = resultado.hipotesis.length ? "- " + resultado.hipotesis.join("\n- ") : "Pendiente de formular.";
    const marTxt = resultado.marcos.length ? "- " + resultado.marcos.join("\n- ") : "Pendiente de sugerir marcos.";
    outNotas.textContent = "Correlaciones a explorar:\n" + corrTxt + "\n\nHipótesis de trabajo:\n" + hipTxt + "\n\nMarcos teóricos sugeridos:\n" + marTxt + "\n" + NOTA_JUSTIFICAR_MARCOS + "\n\n" + PAUTAS_MARCO_TEORICO;
  }

  const outTransparencia = document.getElementById("out_transparencia");
  if (outTransparencia) {
    outTransparencia.textContent = resultado.explicacionDeteccion || "—";
  }

  const outCategorias = document.getElementById("out_categorias_explicativas");
  if (outCategorias) {
    const cats = resultado.categoriasExplicativas || [];
    outCategorias.textContent = cats.length
      ? "- " + cats.join("\n\n- ") + "\n\n" + NOTA_CATEGORIAS_EXPLICATIVAS
      : "SOCIOKAIROS no ha detectado en tu texto una dinámica concreta (por ejemplo, alguien que permanece, calla o justifica una situación) que active una categoría explicativa específica. Puedes seguir usando los marcos teóricos generales de la sección anterior, o describir con más detalle qué hace o cómo reacciona la persona/grupo afectado.";
  }

  const outDiseno = document.getElementById("out_diseno");
  if (outDiseno) {
    const opTxt = operacionalizacionTexto(resultado.operacionalizacion);
    outDiseno.textContent = "Unidad de análisis sugerida:\n" + resultado.unidad + "\n\n" + resultado.diseno + "\n\nOperacionalización sugerida:\n" + opTxt;
  }

  const outGuiaCodigos = document.getElementById("out_guia_codigos");
  if (outGuiaCodigos) {
    const guia = resultado.guiaCualitativa || { codigos: [], preguntas: [] };
    const codTxt = guia.codigos.length
      ? guia.codigos.map(c => `- ${c.categoria} [${c.tipo}]\n  ${c.definicion}`).join("\n")
      : "Pendiente: no hay variables ni mecanismos suficientes para proponer códigos.";
    outGuiaCodigos.textContent = "Libro de códigos preliminar:\n" + codTxt + "\n\n" + NOTA_GUIA_CUALITATIVA;
  }

  const outGuiaPreguntas = document.getElementById("out_guia_preguntas");
  if (outGuiaPreguntas) {
    const guia = resultado.guiaCualitativa || { codigos: [], preguntas: [] };
    const pregTxt = guia.preguntas.length ? "- " + guia.preguntas.join("\n- ") : "Pendiente de construir.";
    outGuiaPreguntas.textContent = "Guía de entrevista / observación semiestructurada:\n" + pregTxt;
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
  const ids = ["out_problema_perfecto", "out_variables", "out_notas", "out_transparencia", "out_diseno", "out_categorias_explicativas", "out_guia_codigos", "out_guia_preguntas", "out_fuentes", "out_alertas", "out_tradiciones", "out_mapa", "out_disenos_plus"];
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
  const btnSwap = document.getElementById("btn_swap_vivd");
  if (btnSwap) { btnSwap.disabled = true; btnSwap.textContent = "⇄ Intercambiar VI ↔ VD"; }
}

function activarSalidasValidasEdu() {
  const selector = document.getElementById("selector_version");
  if (selector) selector.style.display = "block";
}

/**
 * Guarda un blob en disco. Dentro de la app de escritorio (Tauri, ver
 * native-app/) usa el diálogo nativo «Guardar como…» y escribe el archivo
 * directamente — el estudiante elige carpeta y nombre como en cualquier app
 * de escritorio, sin pasar por la carpeta de Descargas del navegador. Fuera
 * de Tauri (navegador normal, SCORM dentro de Moodle, o el Artifact de
 * Claude) se mantiene sin cambios el mecanismo existente basado en
 * `<a download>`. Devuelve `true` si el archivo se guardó, `false` si el
 * estudiante canceló el diálogo nativo.
 */
async function descargarBlob(blob, filename) {
  if (window.__TAURI__ && window.__TAURI__.dialog && window.__TAURI__.fs) {
    try {
      const destino = await window.__TAURI__.dialog.save({ defaultPath: filename });
      if (!destino) return false;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await window.__TAURI__.fs.writeFile(destino, bytes);
      return true;
    } catch (e) {
      console.error("Guardado nativo (Tauri) falló, se usa el método de navegador:", e);
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
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

  renderizarHistorial();
  const btnHistorialBorrar = document.getElementById("btn_historial_borrar");
  if (btnHistorialBorrar) {
    btnHistorialBorrar.addEventListener("click", function () {
      borrarHistorialGuardado();
      renderizarHistorial();
    });
  }

  const btnReformular = document.getElementById("btn_reformular");
  const btnClear = document.getElementById("btn_clear");
  const btnSwapViVd = document.getElementById("btn_swap_vivd");
  const btnExportWord = document.getElementById("btn_export_word");
  const btnExportCsv = document.getElementById("btn_export_csv");
  const btnVisualCausal = document.getElementById("btn_visual_causal");
  const btnVisualRed = document.getElementById("btn_visual_red");
  const btnVisualCapas = document.getElementById("btn_visual_capas");
  const statusEl = document.getElementById("status");
  const txtEl = document.getElementById("txt_problema");

  if (btnReformular) {
    btnReformular.addEventListener("click", async function () {
      const txtInicial = txtEl ? txtEl.value : "";
      if (!txtInicial.trim()) {
        if (statusEl) statusEl.textContent = "Escribe primero un problema para poder aplicar la heurística SOCIOKAIROS.";
        return;
      }
      btnReformular.disabled = true;
      if (statusEl) statusEl.textContent = "Revisando posibles erratas…";

      const txt = await resolverErratasAntesDeReformular(txtEl);

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
        ultimoTextoAnalizado = txt;
        viVdIntercambiado = false;
        const resultado = analizarProblema(txt, { intercambiarViVd: false });
        actualizarInterfazConResultado(resultado);
        guardarEnHistorial(txt, resultado);
        renderizarHistorial();
        if (statusEl) statusEl.textContent = "Análisis completado. Puedes exportar a Word o CSV.";
        scormMarkCompleted();
      } catch (e) {
        if (statusEl) statusEl.textContent = "Error interno del motor: " + e.message;
      } finally {
        btnReformular.disabled = false;
      }
    });
  }

  if (btnSwapViVd) {
    btnSwapViVd.addEventListener("click", function () {
      if (!ultimoTextoAnalizado) return;
      try {
        viVdIntercambiado = !viVdIntercambiado;
        const resultado = analizarProblema(ultimoTextoAnalizado, { intercambiarViVd: viVdIntercambiado });
        actualizarInterfazConResultado(resultado);
        if (statusEl) statusEl.textContent = viVdIntercambiado
          ? "Dirección VI/VD intercambiada: preguntas, correlaciones e hipótesis recalculadas."
          : "Dirección VI/VD restaurada a la sugerida por el motor.";
      } catch (e) {
        if (statusEl) statusEl.textContent = "Error interno del motor: " + e.message;
      }
    });
  }

  if (btnClear) {
    btnClear.addEventListener("click", function () {
      const ids = ["txt_problema", "txt_justificacion_marco", "badge_area", "out_problema_perfecto", "out_reformulacion", "out_variables", "out_notas", "out_transparencia", "out_diseno", "out_categorias_explicativas", "out_guia_codigos", "out_guia_preguntas", "out_fuentes", "out_alertas", "out_tradiciones", "out_mapa", "out_disenos_plus"];
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
      ultimoTextoAnalizado = "";
      viVdIntercambiado = false;
      const btnSwap = document.getElementById("btn_swap_vivd");
      if (btnSwap) { btnSwap.disabled = true; btnSwap.textContent = "⇄ Intercambiar VI ↔ VD"; }
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
    btnExportWord.addEventListener("click", async function () {
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
        const txtJustificacion = document.getElementById("txt_justificacion_marco");
        const justificacionMarcos = txtJustificacion ? txtJustificacion.value : "";
        const zipBytes = construirInformeWord(resultado, problemaTrabajo, versionLabel, txt, justificacionMarcos);
        const blob = new Blob([zipBytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
        const guardado = await descargarBlob(blob, `Informe_SOCIOKAIROS_${ts}.docx`);
        if (statusEl) statusEl.textContent = guardado ? "Informe Word generado." : "Guardado cancelado.";
        if (guardado) scormMarkCompleted();
      } catch (e) {
        if (statusEl) statusEl.textContent = "Error al generar el informe Word: " + e.message;
      }
    });
  }

  if (btnExportCsv) {
    btnExportCsv.addEventListener("click", async function () {
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
        const guardado = await descargarBlob(blob, "Operacionalizacion_SOCIOKAIROS.csv");
        if (statusEl) statusEl.textContent = guardado ? "CSV de operacionalización generado." : "Guardado cancelado.";
        if (guardado) scormMarkCompleted();
      } catch (e) {
        if (statusEl) statusEl.textContent = "Error al generar el CSV: " + e.message;
      }
    });
  }
});

window.addEventListener("beforeunload", scormFinish);
window.addEventListener("pagehide", scormFinish);
