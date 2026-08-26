/* ================= Tema claro/oscuro y pantalla completa ================= */

function toggleSKTheme() {
  document.body.classList.toggle("sk-dark");
  try { localStorage.setItem("sk_theme", document.body.classList.contains("sk-dark") ? "dark" : "light"); } catch (e) { /* localStorage no disponible */ }
}

function salirPantallaCompleta() {
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* no disponible */ }
}

/* ================= registro inicial (estadísticas de uso) =================
 * Único punto de conexión a internet de toda la línea Profesional: el resto
 * de la herramienta funciona sin red. Se pide una vez por dispositivo
 * (marca sk_registro_enviado en localStorage) y se envía a Formspree, que
 * reenvía el formulario a contacto@sociokairos.com sin necesidad de
 * servidor propio. Si el envío falla (sin conexión, Formspree caído...) no
 * se bloquea el uso de la aplicación: se avisa y se deja continuar, sin
 * reintento automático — es una estadística de mejor esfuerzo, no una
 * puerta de acceso real. */
// TODO: sustituir por el endpoint real de Formspree (https://formspree.io/f/XXXXXXXX)
const SK_REGISTRO_ENDPOINT = "https://formspree.io/f/PLACEHOLDER";

function skMostrarRegistroSiHaceFalta() {
  let yaRegistrado = false;
  try { yaRegistrado = localStorage.getItem("sk_registro_enviado") === "1"; } catch (e) { /* localStorage no disponible */ }
  if (yaRegistrado) return;
  const modal = document.getElementById("skRegistroModal");
  if (modal) modal.style.display = "flex";
}

function skInicializarFormularioRegistro() {
  const form = document.getElementById("skRegistroForm");
  if (!form) return;
  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    const estadoEl = document.getElementById("skRegistroEstado");
    const btn = document.getElementById("skRegistroBtnEnviar");
    const modal = document.getElementById("skRegistroModal");
    if (btn) btn.disabled = true;
    if (estadoEl) { estadoEl.textContent = "Enviando..."; estadoEl.style.color = "var(--sk-muted)"; }
    try {
      const resp = await fetch(SK_REGISTRO_ENDPOINT, {
        method: "POST",
        body: new FormData(form),
        headers: { "Accept": "application/json" },
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      try { localStorage.setItem("sk_registro_enviado", "1"); } catch (e) { /* localStorage no disponible */ }
      if (modal) modal.style.display = "none";
    } catch (e) {
      if (estadoEl) {
        estadoEl.textContent = "No se pudo enviar (¿sin conexión?). Puedes continuar igualmente; no volveremos a pedírtelo en este dispositivo.";
        estadoEl.style.color = "#c9762b";
      }
      try { localStorage.setItem("sk_registro_enviado", "1"); } catch (e2) { /* localStorage no disponible */ }
      setTimeout(() => { if (modal) modal.style.display = "none"; }, 2600);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
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
    return new Date(ts).toLocaleString(skLocale(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return "";
  }
}

function renderizarHistorial(filtro) {
  const cont = document.getElementById("sk_historial_lista");
  const btnBorrar = document.getElementById("btn_historial_borrar");
  if (!cont) return;
  const listaCompleta = cargarHistorial();
  const q = (filtro || "").trim().toLowerCase();
  const lista = q ? listaCompleta.filter(item => (item.texto || "").toLowerCase().includes(q)) : listaCompleta;

  if (btnBorrar) btnBorrar.style.display = listaCompleta.length ? "" : "none";

  if (!lista.length) {
    cont.innerHTML = "";
    const vacio = document.createElement("p");
    vacio.className = "sk-historial-vacio";
    vacio.textContent = q
      ? skT("pro.historial.sinCoincidencias").replace("{q}", filtro.trim())
      : skT("common.historial.vacio");
    cont.appendChild(vacio);
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
  const etGlobal = resultado.etiquetas || {};

  const btnSwap = document.getElementById("btn_swap_vivd");
  if (btnSwap) {
    btnSwap.disabled = false;
    const textoIntercambio = etGlobal.esCualitativo ? "⇄ Intercambiar condición ↔ fenómeno" : "⇄ Intercambiar VI ↔ VD";
    btnSwap.textContent = resultado.intercambiado
      ? "⇄ Deshacer intercambio (volver a la dirección original)"
      : textoIntercambio;
  }

  const lblP2 = document.getElementById("lbl_p2_etiqueta");
  if (lblP2) lblP2.textContent = etGlobal.p2Etiqueta || "relacional / explicativa";
  const lblP2Hint = document.getElementById("lbl_p2_etiqueta_hint");
  if (lblP2Hint) lblP2Hint.textContent = etGlobal.esCualitativo ? "comprensiva" : "relacional";

  const hVariables = document.getElementById("h_seccion_variables");
  if (hVariables) hVariables.textContent = "2.3 " + (etGlobal.seccionVariables || "Variables (VI / VD)");
  const txtIntroVariables = document.getElementById("txt_intro_variables");
  if (txtIntroVariables) {
    txtIntroVariables.textContent = etGlobal.esCualitativo
      ? "SOCIOKAIROS distingue el fenómeno central de las condiciones explicativas por convención léxica (ver la nota al final de este bloque); esa distinción es una decisión teórica tuya, no un hecho del texto. Si crees que la dirección real es la contraria, intercámbiala aquí."
      : "SOCIOKAIROS asigna VI/VD por convención léxica (ver la nota al final de este bloque); esa dirección causal es una decisión teórica tuya, no un hecho del texto. Si crees que la dirección real es la contraria, intercámbiala aquí.";
  }

  const hCorrelaciones = document.getElementById("h_seccion_correlaciones");
  if (hCorrelaciones) {
    hCorrelaciones.textContent = "2.4 " + (etGlobal.correlacionesTitulo || "Correlaciones") + ", " + (etGlobal.hipotesisTitulo || "hipótesis").toLowerCase() + " y marcos teóricos";
  }

  const badge = document.getElementById("badge_area");
  if (badge) {
    const areasTxt = (resultado.areas && resultado.areas.length) ? resultado.areas.join(" · ") : resultado.area;
    badge.textContent = "Áreas sociológicas sugeridas: " + areasTxt;
  }

  const outPerfecto = document.getElementById("out_problema_perfecto");
  if (outPerfecto) {
    const etPerfecto = resultado.etiquetas || {};
    outPerfecto.textContent = construirProblemaPerfecto(resultado, "P2 – " + (etPerfecto.p2Etiqueta || "Relacional / explicativa") + " (por defecto)", resultado.p2);
  }

  const outRef = document.getElementById("out_reformulacion");
  if (outRef) {
    const et0 = resultado.etiquetas || {};
    outRef.textContent =
      "Pregunta 1 – Descriptiva:\n" + resultado.p1 +
      "\n\nPregunta 2 – " + (et0.p2Etiqueta || "Relacional / explicativa") + ":\n" + resultado.p2 +
      "\n\nPregunta 3 – Crítica / estratégica:\n" + resultado.p3;
  }

  const outVars = document.getElementById("out_variables");
  if (outVars) {
    const et = resultado.etiquetas || {};
    const viTxt = resultado.vi.length ? "- " + resultado.vi.join("\n- ") : "Pendiente de especificar.";
    const vdTxt = resultado.vd.length ? "- " + resultado.vd.join("\n- ") : "Pendiente de especificar.";
    const notaCandidata = resultado.viEsCandidato ? "\n\n" + NOTA_VI_CANDIDATA : "";
    const notaIntercambio = resultado.intercambiado
      ? (et.esCualitativo
        ? "⇄ Distinción condición/fenómeno intercambiada manualmente respecto a la convención léxica del motor.\n\n"
        : "⇄ Dirección VI/VD intercambiada manualmente respecto a la convención léxica del motor.\n\n")
      : "";
    const notaEnfoque = et.notaVariables ? "\n\n" + et.notaVariables : "";
    outVars.textContent = notaIntercambio + (et.viListaTitulo || "VI sugeridas:") + "\n" + viTxt + notaCandidata + "\n\n" + (et.vdListaTitulo || "VD sugeridas:") + "\n" + vdTxt + notaEnfoque + (et.esCualitativo ? "" : "\n\n" + NOTA_DIRECCIONALIDAD_VIVD);
  }

  const outNotas = document.getElementById("out_notas");
  if (outNotas) {
    const et = resultado.etiquetas || {};
    const corrTxt = resultado.correlaciones.length ? resultado.correlaciones.join("\n") : "Formula al menos una relación entre " + (et.vi || "VI") + " y " + (et.vd || "VD") + ".";
    const hipTxt = resultado.hipotesis.length ? "- " + resultado.hipotesis.join("\n- ") : "Pendiente de formular.";
    const marTxt = resultado.marcos.length ? "- " + resultado.marcos.join("\n- ") : "Pendiente de sugerir marcos.";
    outNotas.textContent = (et.correlacionesTitulo || "Correlaciones a explorar") + ":\n" + corrTxt + "\n\n" + (et.hipotesisTitulo || "Hipótesis de trabajo") + ":\n" + hipTxt + "\n\nMarcos teóricos sugeridos:\n" + marTxt + "\n" + NOTA_JUSTIFICAR_MARCOS + "\n\n" + PAUTAS_MARCO_TEORICO;
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
  if (outVisual) outVisual.innerHTML = generarSvgVisual(resultado, "red");

  const outPreguntasSocraticas = document.getElementById("out_preguntas_socraticas");
  if (outPreguntasSocraticas) outPreguntasSocraticas.textContent = generarPreguntasSocraticas(document.getElementById("txt_problema").value, resultado);

  const outPuntosDebiles = document.getElementById("out_puntos_debiles");
  if (outPuntosDebiles) outPuntosDebiles.textContent = generarPuntosDebilesADefender(document.getElementById("txt_problema").value, resultado);

  const outGuiaBiblio = document.getElementById("out_guia_bibliografica");
  if (outGuiaBiblio) outGuiaBiblio.textContent = generarGuiaBusquedaBibliografica(resultado);

  const outValidez = document.getElementById("out_validez_confiabilidad");
  if (outValidez) outValidez.textContent = generarValidezConfiabilidad(resultado);

  const outSesgos = document.getElementById("out_sesgos_metodologicos");
  if (outSesgos) outSesgos.textContent = generarSesgosMetodologicos(resultado, document.getElementById("txt_problema").value);

  const outMediacion = document.getElementById("out_mediacion_moderacion");
  if (outMediacion) outMediacion.textContent = generarMediacionModeracion(resultado);

  const outUnidadObs = document.getElementById("out_unidad_analisis_observacion");
  if (outUnidadObs) outUnidadObs.textContent = generarUnidadAnalisisObservacion(resultado);

  const outMuestral = document.getElementById("out_tamano_muestral");
  if (outMuestral) outMuestral.textContent = generarTamanoMuestralPotencia(resultado);

  const outConsentimiento = document.getElementById("out_consentimiento_informado");
  if (outConsentimiento) outConsentimiento.textContent = generarConsentimientoInformado(resultado, document.getElementById("txt_problema").value);

  const outCronograma = document.getElementById("out_cronograma_factibilidad");
  if (outCronograma) outCronograma.textContent = generarCronogramaFactibilidad(resultado);

  const outPreregistro = document.getElementById("out_preregistro_ciencia_abierta");
  if (outPreregistro) outPreregistro.textContent = generarPreregistroCienciaAbierta(resultado);

  actualizarResumenReal(resultado);
  actualizarRevisionCoherencia();
}

function actualizarRevisionCoherencia() {
  const outCoherencia = document.getElementById("out_revision_coherencia");
  if (!outCoherencia) return;
  const txtJustificacion = document.getElementById("txt_justificacion_marco");
  outCoherencia.textContent = ultimoResultado
    ? generarRevisionCoherencia(ultimoResultado, txtJustificacion ? txtJustificacion.value : "")
    : "—";
}

/**
 * Panel derecho "Resumen del análisis": solo conteos reales calculados a
 * partir del propio resultado del motor (número de variables, áreas,
 * marcos, categorías, fuentes y alertas detectadas) — nunca una puntuación
 * de "confianza" inventada ni citas de ejemplo. También alimenta el
 * contador de la campana de alertas en la barra superior.
 */
function actualizarResumenReal(resultado) {
  const alertasTexto = generarAlertasMetodologicas(document.getElementById("txt_problema").value, resultado);
  const numAlertas = (alertasTexto.match(/^•/gm) || []).length;

  const stats = {
    sk_stat_variables: (resultado.vi.length + resultado.vd.length),
    sk_stat_areas: (resultado.areas || []).length,
    sk_stat_marcos: (resultado.marcos || []).length,
    sk_stat_categorias: (resultado.categoriasExplicativas || []).length,
    sk_stat_fuentes: (resultado.fuentes || []).length,
    sk_stat_alertas: numAlertas
  };
  for (const id in stats) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = String(stats[id]);
      el.classList.remove("sk-stat-pulse");
      void el.offsetWidth;
      el.classList.add("sk-stat-pulse");
    }
  }

  const badgeAlertas = document.getElementById("sk_alertas_badge");
  if (badgeAlertas) {
    if (numAlertas > 0) { badgeAlertas.textContent = String(numAlertas); badgeAlertas.style.display = ""; }
    else badgeAlertas.style.display = "none";
  }

  const fuentesPreview = document.getElementById("sk_fuentes_preview");
  if (fuentesPreview) {
    const fuentes = resultado.fuentes || [];
    if (!fuentes.length) {
      fuentesPreview.innerHTML = '<p class="sk-historial-vacio">' + skT("pro.fuentesPreview.ninguna") + '</p>';
    } else {
      fuentesPreview.innerHTML = "";
      fuentes.slice(0, 5).forEach(f => {
        const div = document.createElement("div");
        div.className = "sk-fuente-item";
        const m = f.match(/^(.*?)\s+—\s+(https?:\/\/\S+)$/);
        if (m) {
          const nombre = document.createTextNode(m[1] + " — ");
          div.appendChild(nombre);
          const a = document.createElement("a");
          a.href = m[2];
          a.textContent = m[2];
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          div.appendChild(a);
        } else {
          div.textContent = f;
        }
        fuentesPreview.appendChild(div);
      });
    }
  }
}

/* ================= Navegación: stepper + sidebar (todas las secciones son reales, no un wizard con pasos falsos) ================= */

function activarEtapa(stage) {
  document.querySelectorAll(".sk-stage").forEach(sec => {
    sec.style.display = (sec.getAttribute("data-stage") === stage) ? "" : "none";
  });
  document.querySelectorAll("#sk_stepper .sk-step").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-stage") === stage);
  });
  document.querySelectorAll(".sk-sidebar-item[data-stage]").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-stage") === stage);
  });
}

function inicializarNavegacion() {
  document.querySelectorAll("#sk_stepper .sk-step").forEach(btn => {
    btn.addEventListener("click", () => activarEtapa(btn.getAttribute("data-stage")));
  });
  document.querySelectorAll(".sk-sidebar-item[data-scrollto]").forEach(btn => {
    btn.addEventListener("click", () => {
      const stage = btn.getAttribute("data-stage");
      if (stage) activarEtapa(stage);
      document.querySelectorAll(".sk-sidebar-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const target = document.getElementById(btn.getAttribute("data-scrollto"));
      if (target) setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), stage ? 60 : 0);
    });
  });
  const btnAlertas = document.getElementById("sk_btn_alertas");
  if (btnAlertas) {
    btnAlertas.addEventListener("click", () => {
      activarEtapa("ejecutar");
      const target = document.getElementById("out_alertas");
      if (target) setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    });
  }
}

function limpiarSalidasPorErrorEdu() {
  const ids = ["out_problema_perfecto", "out_variables", "out_notas", "out_transparencia", "out_diseno", "out_categorias_explicativas", "out_guia_codigos", "out_guia_preguntas", "out_fuentes", "out_alertas", "out_tradiciones", "out_mapa", "out_disenos_plus", "out_preguntas_socraticas", "out_puntos_debiles", "out_guia_bibliografica", "out_revision_coherencia", "out_validez_confiabilidad", "out_sesgos_metodologicos", "out_mediacion_moderacion", "out_unidad_analisis_observacion", "out_tamano_muestral", "out_consentimiento_informado", "out_cronograma_factibilidad", "out_preregistro_ciencia_abierta", "out_transcripcion_preview"];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) el.textContent = "—";
  }
  const outVisual = document.getElementById("out_visual_svg");
  if (outVisual) outVisual.innerHTML = "";
  const badge = document.getElementById("badge_area");
  if (badge) badge.textContent = skT("common.badge.validacionPendiente");
  const selector = document.getElementById("selector_version");
  if (selector) selector.style.display = "none";
  ultimoResultado = null;
  const btnSwap = document.getElementById("btn_swap_vivd");
  if (btnSwap) { btnSwap.disabled = true; btnSwap.textContent = skT("common.swap.btn"); }

  ["sk_stat_variables", "sk_stat_areas", "sk_stat_marcos", "sk_stat_categorias", "sk_stat_fuentes", "sk_stat_alertas"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = "–";
  });
  const badgeAlertas = document.getElementById("sk_alertas_badge");
  if (badgeAlertas) badgeAlertas.style.display = "none";
  const fuentesPreview = document.getElementById("sk_fuentes_preview");
  if (fuentesPreview) fuentesPreview.innerHTML = '<p class="sk-historial-vacio">' + skT("pro.fuentesPreview.vacio") + '</p>';
}

function activarSalidasValidasEdu() {
  const selector = document.getElementById("selector_version");
  if (selector) selector.style.display = "block";
}

/**
 * Guarda un blob en disco. Dentro de la app de escritorio (Tauri) usa el
 * diálogo nativo «Guardar como…» y escribe el archivo directamente — el
 * usuario elige carpeta y nombre como en cualquier app de escritorio.
 * Fuera de Tauri (navegador normal, para pruebas) se mantiene sin cambios
 * el mecanismo basado en `<a download>`. Devuelve `true` si el archivo se
 * guardó, `false` si el usuario canceló el diálogo nativo.
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
  const etVersion = resultado.etiquetas || {};
  const p2Label = "P2 – " + (etVersion.p2Etiqueta || "Relacional / explicativa");
  let problemaTrabajo = txtOriginal;
  let versionLabel = p2Label + " (por defecto)";
  const sel = document.querySelector('input[name="vers_sel"]:checked');
  if (sel) {
    const val = sel.value;
    if (val === "1") { problemaTrabajo = resultado.p1 || txtOriginal; versionLabel = "P1 – descriptiva"; }
    else if (val === "2") { problemaTrabajo = resultado.p2 || txtOriginal; versionLabel = p2Label; }
    else if (val === "3") { problemaTrabajo = resultado.p3 || txtOriginal; versionLabel = "P3 – crítica / estratégica"; }
  } else if (resultado.p2) {
    problemaTrabajo = resultado.p2;
    versionLabel = p2Label + " (por defecto)";
  }
  const hint = document.getElementById("version_elegida_hint");
  if (hint) {
    hint.textContent = (problemaTrabajo === txtOriginal)
      ? "No has seleccionado ninguna versión: se emplea el problema original tal como fue escrito."
      : `Exportando informe usando como base: ${versionLabel}.`;
  }
  return { problemaTrabajo, versionLabel };
}

/* ================= Exportar / importar proyecto (.json) ================= */
/**
 * Serializa lo mínimo necesario para retomar un análisis en otra máquina:
 * el motor es determinista a partir del texto del problema, así que en vez
 * de guardar el `resultado` completo (derivado), se re-ejecuta
 * analizarProblema() al importar con el mismo texto y la misma dirección
 * VI/VD manual, evitando desincronías si el motor cambia entre versiones.
 */
function construirProyectoJSON() {
  const txtEl = document.getElementById("txt_problema");
  const txtJustificacion = document.getElementById("txt_justificacion_marco");
  const txtTranscripcion = document.getElementById("txt_transcripcion");
  const selVersion = document.querySelector('input[name="vers_sel"]:checked');
  return {
    formato: "sociokairos-proyecto",
    version: 1,
    fecha: new Date().toISOString(),
    problema: txtEl ? txtEl.value : "",
    justificacionMarco: txtJustificacion ? txtJustificacion.value : "",
    transcripcion: txtTranscripcion ? txtTranscripcion.value : "",
    viVdIntercambiado: viVdIntercambiado,
    versionSeleccionada: selVersion ? selVersion.value : null
  };
}

async function aplicarProyectoImportado(datos, statusEl) {
  if (!datos || datos.formato !== "sociokairos-proyecto" || typeof datos.problema !== "string") {
    throw new Error("el archivo no tiene el formato de proyecto SOCIOKAIROS esperado.");
  }
  const txtEl = document.getElementById("txt_problema");
  const txtJustificacion = document.getElementById("txt_justificacion_marco");
  const txtTranscripcion = document.getElementById("txt_transcripcion");
  if (txtEl) txtEl.value = datos.problema || "";
  if (txtJustificacion) txtJustificacion.value = datos.justificacionMarco || "";
  if (txtTranscripcion) txtTranscripcion.value = datos.transcripcion || "";

  const txt = datos.problema || "";
  if (!txt.trim()) return;

  const validacion = validarProblemaEdu(txt);
  if (!validacion.valido) {
    limpiarSalidasPorErrorEdu();
    if (statusEl) statusEl.textContent = "El problema importado no pasa la validación de estructura.";
    return;
  }
  activarSalidasValidasEdu();
  ultimoTextoAnalizado = txt;
  viVdIntercambiado = !!datos.viVdIntercambiado;
  const resultado = analizarProblema(txt, { intercambiarViVd: viVdIntercambiado });
  actualizarInterfazConResultado(resultado);
  guardarEnHistorial(txt, resultado);
  const buscadorActivo = document.getElementById("sk_historial_buscar");
  renderizarHistorial(buscadorActivo ? buscadorActivo.value : "");

  if (datos.versionSeleccionada) {
    const radio = document.querySelector('input[name="vers_sel"][value="' + datos.versionSeleccionada + '"]');
    if (radio) radio.checked = true;
  }
  actualizarRevisionCoherencia();
  activarEtapa("analizar");
}

window.addEventListener("load", function () {
  skInitIdioma();
  skInicializarFormularioRegistro();
  skMostrarRegistroSiHaceFalta();

  try {
    if (localStorage.getItem("sk_theme") === "dark") document.body.classList.add("sk-dark");
  } catch (e) { /* localStorage no disponible */ }

  inicializarNavegacion();

  renderizarHistorial();
  const btnHistorialBuscar = document.getElementById("sk_historial_buscar");
  if (btnHistorialBuscar) {
    btnHistorialBuscar.addEventListener("input", function () {
      renderizarHistorial(btnHistorialBuscar.value);
    });
  }
  const btnHistorialBorrar = document.getElementById("btn_historial_borrar");
  if (btnHistorialBorrar) {
    btnHistorialBorrar.addEventListener("click", function () {
      borrarHistorialGuardado();
      const buscador = document.getElementById("sk_historial_buscar");
      renderizarHistorial(buscador ? buscador.value : "");
    });
  }

  const btnReformular = document.getElementById("btn_reformular");
  const btnClear = document.getElementById("btn_clear");
  const btnSwapViVd = document.getElementById("btn_swap_vivd");
  const btnExportWord = document.getElementById("btn_export_word");
  const btnExportCsv = document.getElementById("btn_export_csv");
  const btnFormatearTranscripcion = document.getElementById("btn_formatear_transcripcion");
  const btnVisualCausal = document.getElementById("btn_visual_causal");
  const btnVisualRed = document.getElementById("btn_visual_red");
  const btnVisualCapas = document.getElementById("btn_visual_capas");
  const statusEl = document.getElementById("status");
  const txtEl = document.getElementById("txt_problema");

  if (btnReformular) {
    btnReformular.addEventListener("click", async function () {
      const txtInicial = txtEl ? txtEl.value : "";
      if (!txtInicial.trim()) {
        if (statusEl) statusEl.textContent = skT("common.status.writeFirst");
        return;
      }
      btnReformular.disabled = true;
      if (statusEl) statusEl.textContent = skT("common.status.checkingTypos");

      const txt = await resolverErratasAntesDeReformular(txtEl);

      if (statusEl) statusEl.textContent = skT("common.status.processing");

      const validacion = validarProblemaEdu(txt);
      if (!validacion.valido) {
        const outRef = document.getElementById("out_reformulacion");
        if (outRef) outRef.textContent = construirFeedbackValidacionEdu(validacion);
        limpiarSalidasPorErrorEdu();
        if (statusEl) statusEl.textContent = skT("pro.status.invalidStructure");
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
        const buscadorActivo = document.getElementById("sk_historial_buscar");
        renderizarHistorial(buscadorActivo ? buscadorActivo.value : "");
        activarEtapa("analizar");
        if (statusEl) statusEl.textContent = skT("common.status.done");
      } catch (e) {
        if (statusEl) statusEl.textContent = skT("common.status.engineError") + e.message;
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
          ? skT("common.status.swapped")
          : skT("common.status.swapRestored");
      } catch (e) {
        if (statusEl) statusEl.textContent = skT("common.status.engineError") + e.message;
      }
    });
  }

  const txtJustificacionMarco = document.getElementById("txt_justificacion_marco");
  if (txtJustificacionMarco) {
    txtJustificacionMarco.addEventListener("input", actualizarRevisionCoherencia);
  }

  if (btnClear) {
    btnClear.addEventListener("click", function () {
      const ids = ["txt_problema", "txt_justificacion_marco", "txt_transcripcion", "badge_area", "out_problema_perfecto", "out_reformulacion", "out_variables", "out_notas", "out_transparencia", "out_diseno", "out_categorias_explicativas", "out_guia_codigos", "out_guia_preguntas", "out_fuentes", "out_alertas", "out_tradiciones", "out_mapa", "out_disenos_plus", "out_preguntas_socraticas", "out_puntos_debiles", "out_guia_bibliografica", "out_revision_coherencia", "out_validez_confiabilidad", "out_sesgos_metodologicos", "out_mediacion_moderacion", "out_unidad_analisis_observacion", "out_tamano_muestral", "out_consentimiento_informado", "out_cronograma_factibilidad", "out_preregistro_ciencia_abierta", "out_transcripcion_preview"];
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
      if (btnSwap) { btnSwap.disabled = true; btnSwap.textContent = skT("common.swap.btn"); }
      ["sk_stat_variables", "sk_stat_areas", "sk_stat_marcos", "sk_stat_categorias", "sk_stat_fuentes", "sk_stat_alertas"].forEach(id => {
        const e = document.getElementById(id);
        if (e) e.textContent = "–";
      });
      const badgeAlertas = document.getElementById("sk_alertas_badge");
      if (badgeAlertas) badgeAlertas.style.display = "none";
      const fuentesPreview = document.getElementById("sk_fuentes_preview");
      if (fuentesPreview) fuentesPreview.innerHTML = '<p class="sk-historial-vacio">' + skT("pro.fuentesPreview.vacio") + '</p>';
      activarEtapa("definir");
      if (statusEl) statusEl.textContent = skT("common.status.cleared");
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
        if (statusEl) statusEl.textContent = skT("common.status.writeFirstReport");
        return;
      }
      if (!ultimoResultado) {
        if (statusEl) statusEl.textContent = skT("pro.status.reformulateFirst");
        return;
      }
      if (statusEl) statusEl.textContent = skT("common.status.generatingWord");
      try {
        const resultado = ultimoResultado;
        const { problemaTrabajo, versionLabel } = obtenerVersionSeleccionada(resultado, txt);
        const txtJustificacion = document.getElementById("txt_justificacion_marco");
        const justificacionMarcos = txtJustificacion ? txtJustificacion.value : "";
        const zipBytes = construirInformeWord(resultado, problemaTrabajo, versionLabel, txt, justificacionMarcos, {
          piePagina: "Heuristic software developed by Victor Hugo Pérez Gallo, PhD\ncontacto@sociokairos.com",
          tituloInforme: "SOCIOKAIROS Research",
          subtituloInforme: "INFORME · RESEARCH SUITE",
          incluirNotaUnizar: false,
          disenoCabeceraPie: true,
          seccionesAmpliadas: true
        });
        const blob = new Blob([zipBytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
        const guardado = await descargarBlob(blob, `Informe_SOCIOKAIROS_${ts}.docx`);
        if (statusEl) statusEl.textContent = guardado ? skT("common.status.wordDone") : skT("common.status.saveCancelled");
      } catch (e) {
        if (statusEl) statusEl.textContent = skT("common.status.wordError") + e.message;
      }
    });
  }

  if (btnExportCsv) {
    btnExportCsv.addEventListener("click", async function () {
      const txt = txtEl ? txtEl.value.trim() : "";
      if (!txt) {
        if (statusEl) statusEl.textContent = skT("common.status.writeFirstCsv");
        return;
      }
      if (!ultimoResultado) {
        if (statusEl) statusEl.textContent = skT("pro.status.reformulateFirst");
        return;
      }
      if (statusEl) statusEl.textContent = skT("common.status.generatingCsv");
      try {
        const csvText = exportarCSV(ultimoResultado);
        const blob = new Blob(["﻿" + csvText], { type: "text/csv;charset=utf-8" });
        const guardado = await descargarBlob(blob, "Operacionalizacion_SOCIOKAIROS.csv");
        if (statusEl) statusEl.textContent = guardado ? skT("common.status.csvDone") : skT("common.status.saveCancelled");
      } catch (e) {
        if (statusEl) statusEl.textContent = skT("common.status.csvError") + e.message;
      }
    });
  }

  if (btnFormatearTranscripcion) {
    btnFormatearTranscripcion.addEventListener("click", async function () {
      const txtTranscripcionEl = document.getElementById("txt_transcripcion");
      const outPreview = document.getElementById("out_transcripcion_preview");
      const texto = txtTranscripcionEl ? txtTranscripcionEl.value.trim() : "";
      if (!texto) {
        if (statusEl) statusEl.textContent = skT("pro.status.writeTranscriptFirst");
        return;
      }
      if (!ultimoResultado) {
        if (statusEl) statusEl.textContent = skT("pro.status.reformulateFirst");
        return;
      }
      if (statusEl) statusEl.textContent = skT("pro.status.generatingTranscript");
      try {
        const { turnos, detectado } = detectarTurnosHabla(texto);
        const codigos = (ultimoResultado.guiaCualitativa || {}).codigos || [];
        const anotados = anotarTurnosConCodigos(turnos, codigos);
        const totalAnotaciones = anotados.reduce((acc, t) => acc + (t.anotaciones ? t.anotaciones.length : 0), 0);

        if (outPreview) {
          const lineas = [];
          lineas.push(detectado
            ? `${turnos.length} turno(s) de habla detectado(s).`
            : "No se reconoció ningún interlocutor con el formato «Nombre:» al inicio de línea — se ha tratado todo el texto como un único turno sin etiquetar. Revisa el formato si esperabas turnos separados.");
          lineas.push(`${totalAnotaciones} fragmento(s) anotado(s) con comentarios de Word, de ${codigos.length} categoría(s) disponibles en el libro de códigos actual.`);
          outPreview.textContent = lineas.join("\n");
        }

        const { problemaTrabajo } = obtenerVersionSeleccionada(ultimoResultado, txtEl ? txtEl.value.trim() : "");
        const zipBytes = construirTranscripcionWord(anotados, {
          piePagina: "Heuristic software developed by Victor Hugo Pérez Gallo, PhD\ncontacto@sociokairos.com",
          tituloInforme: "Transcripción anotada",
          subtituloInforme: "PRE-CAQDAS · DOCUMENTO FUENTE",
          disenoCabeceraPie: true,
          problemaAsociado: problemaTrabajo
        });
        const blob = new Blob([zipBytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
        const guardado = await descargarBlob(blob, `Transcripcion_SOCIOKAIROS_${ts}.docx`);
        if (statusEl) statusEl.textContent = guardado ? skT("pro.status.transcriptDone") : skT("common.status.saveCancelled");
      } catch (e) {
        if (statusEl) statusEl.textContent = skT("pro.status.transcriptError") + e.message;
      }
    });
  }

  const btnExportProyecto = document.getElementById("btn_export_proyecto");
  const btnImportProyecto = document.getElementById("btn_import_proyecto");
  const inputImportProyecto = document.getElementById("input_import_proyecto");

  if (btnExportProyecto) {
    btnExportProyecto.addEventListener("click", async function () {
      try {
        const datos = construirProyectoJSON();
        if (!datos.problema.trim()) {
          if (statusEl) statusEl.textContent = "Escribe o carga un problema antes de exportar el proyecto.";
          return;
        }
        const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" });
        const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
        const guardado = await descargarBlob(blob, `Proyecto_SOCIOKAIROS_${ts}.json`);
        if (statusEl) statusEl.textContent = guardado ? "Proyecto exportado." : "Guardado cancelado.";
      } catch (e) {
        if (statusEl) statusEl.textContent = "Error al exportar el proyecto: " + e.message;
      }
    });
  }

  if (btnImportProyecto && inputImportProyecto) {
    btnImportProyecto.addEventListener("click", function () { inputImportProyecto.click(); });
    inputImportProyecto.addEventListener("change", async function () {
      const file = inputImportProyecto.files && inputImportProyecto.files[0];
      inputImportProyecto.value = "";
      if (!file) return;
      if (statusEl) statusEl.textContent = "Importando proyecto...";
      try {
        const texto = await file.text();
        const datos = JSON.parse(texto);
        await aplicarProyectoImportado(datos, statusEl);
        if (statusEl) statusEl.textContent = "Proyecto importado.";
      } catch (e) {
        if (statusEl) statusEl.textContent = "Error al importar el proyecto: " + e.message;
      }
    });
  }
});
