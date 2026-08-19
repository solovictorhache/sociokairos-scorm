function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Azul institucional de la línea Profesional (mismo hex que el monograma).
const SK_AZUL_MARCA = "102D59";
// Acento rojo, usado con moderación (solo el correo de contacto del pie),
// como en el patrón de cabecera/pie que pidió el usuario.
const SK_ROJO_ACENTO = "A6392E";

function construirInformeWord(resultado, problema, versionLabel, textoOriginal, justificacionMarcos, opciones) {
  opciones = opciones || {};
  const piePagina = opciones.piePagina || "© Víctor Hugo Pérez Gallo – Universidad de Zaragoza – victorhugo.perez@unizar.es";
  const tituloInforme = opciones.tituloInforme || "Informe SOCIOKAIROS EDU – Research Suite";
  const incluirNotaUnizar = opciones.incluirNotaUnizar !== false;
  // Cabecera/pie con logo + título + subtítulo arriba (separados por una
  // línea discontinua) y el crédito + correo de contacto abajo, en vez del
  // bloque plano de siempre — opt-in explícito para no tocar en nada el
  // informe de la línea SCORM/EDU, que sigue usando el diseño anterior.
  const disenoCabeceraPie = !!opciones.disenoCabeceraPie;
  const subtituloInforme = opciones.subtituloInforme || "";
  const et = resultado.etiquetas || {};

  const now = new Date();
  const fechaStr = now.toLocaleDateString("es-ES");
  const horaStr = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  const parts = [];

  if (disenoCabeceraPie) {
    parts.push(dashedRuleXml());
    const runsCabecera = [];
    try {
      if (LOGO_BASE64) runsCabecera.push(imageRunXml(280035, 280035));
    } catch (e) { /* logo opcional */ }
    runsCabecera.push(runXml((runsCabecera.length ? "   " : "") + tituloInforme, { bold: true, sz: 32, color: SK_AZUL_MARCA }));
    parts.push(multiRunParagraphXml(runsCabecera, { spacingAfter: subtituloInforme ? 20 : 160 }));
    if (subtituloInforme) {
      parts.push(paragraphXml(subtituloInforme, { sz: 18, color: "6B7280", sinSangria: true }));
    }
    parts.push(dashedRuleXml());
  } else {
    piePagina.split("\n").forEach(linea => parts.push(paragraphXml(linea, { italic: true, sz: 16, sinSangria: true })));
    parts.push(paragraphXml(`Informe generado el ${fechaStr} a las ${horaStr}`, { italic: true, sz: 16, sinSangria: true }));
    try {
      if (LOGO_BASE64) parts.push(imageParagraphXml(502920, 502920));
    } catch (e) { /* logo opcional */ }
    parts.push(headingXml(tituloInforme, 1));
  }

  if (problema.trim()) {
    parts.push(headingXml("1. Problema científico inicial", 2));
    parts.push(paragraphXml(problema));
  }

  parts.push(headingXml("2. Problema científico definitivo (síntesis del tutor)", 2));
  parts.push(paragraphXml("SOCIOKAIROS funde el problema inicial con el resto del análisis en un párrafo ya redactado, del tipo que abriría un capítulo de planteamiento del problema en una tesis. Revísalo y ajústalo con tu propio criterio: es un punto de partida, no un texto definitivo.", { italic: true }));
  construirProblemaPerfecto(resultado, versionLabel, problema).split("\n\n").forEach(p => parts.push(paragraphXml(p)));

  parts.push(headingXml("3. Área sociológica principal", 2));
  parts.push(paragraphXml(resultado.area));
  parts.push(paragraphXml(`Versión del problema utilizada como base: ${versionLabel}.`, { italic: true }));

  parts.push(headingXml("4. Reformulación del problema en forma de preguntas", 2));
  parts.push(paragraphXml("Pregunta 1 – Descriptiva:"));
  parts.push(paragraphXml(resultado.p1));
  parts.push(paragraphXml(`Pregunta 2 – ${et.p2Etiqueta || "Relacional / explicativa"}:`));
  parts.push(paragraphXml(resultado.p2));
  parts.push(paragraphXml("Pregunta 3 – Crítica / estratégica:"));
  parts.push(paragraphXml(resultado.p3));

  parts.push(headingXml(`5. ${et.seccionVariables || "Variables (VI / VD)"}`, 2));
  parts.push(paragraphXml(et.viListaTitulo || "VI sugeridas:"));
  if (resultado.vi.length) resultado.vi.forEach(v => parts.push(paragraphXml(v, { bullet: true })));
  else parts.push(paragraphXml("Pendiente de especificar.", { bullet: true }));
  if (resultado.viEsCandidato) parts.push(paragraphXml(NOTA_VI_CANDIDATA, { italic: true }));

  parts.push(paragraphXml(et.vdListaTitulo || "VD sugeridas:"));
  if (resultado.vd.length) resultado.vd.forEach(v => parts.push(paragraphXml(v, { bullet: true })));
  else parts.push(paragraphXml("Pendiente de especificar.", { bullet: true }));

  if (et.esCualitativo) {
    if (et.notaVariables) parts.push(paragraphXml(et.notaVariables, { italic: true }));
  } else {
    parts.push(paragraphXml(NOTA_DIRECCIONALIDAD_VIVD, { italic: true }));
  }

  parts.push(headingXml(`6. ${et.correlacionesTitulo || "Correlaciones"}, ${(et.hipotesisTitulo || "hipótesis").toLowerCase()} y marcos teóricos`, 2));
  parts.push(paragraphXml((et.correlacionesTitulo || "Correlaciones a explorar") + ":"));
  parts.push(paragraphXml(`Nota: ${(et.hipotesisTitulo || "las hipótesis").toLowerCase()} y los marcos que se detallan a continuación toman como referencia la ${versionLabel} del problema.`, { italic: true }));
  if (resultado.correlaciones.length) resultado.correlaciones.forEach(c => parts.push(paragraphXml(c, { bullet: true })));
  else parts.push(paragraphXml(`Formula al menos una relación entre ${et.vi || "VI"} y ${et.vd || "VD"}.`, { bullet: true }));

  parts.push(paragraphXml((et.hipotesisTitulo || "Hipótesis de trabajo") + ":"));
  resultado.hipotesis.forEach(h => parts.push(paragraphXml(h, { bullet: true })));

  parts.push(paragraphXml("Marcos teóricos sugeridos:"));
  resultado.marcos.forEach(m => parts.push(paragraphXml(m, { bullet: true })));
  parts.push(paragraphXml(NOTA_JUSTIFICAR_MARCOS, { italic: true }));

  parts.push(paragraphXml("Pautas para redactar tu marco teórico:", { bold: true }));
  PAUTAS_MARCO_TEORICO.split("\n").slice(1).forEach(linea => parts.push(paragraphXml(linea, { bullet: true })));

  parts.push(paragraphXml("Justificación teórica propia del estudiante:", { bold: true }));
  const justificacion = (justificacionMarcos || "").trim();
  if (justificacion) {
    justificacion.split("\n").forEach(linea => { if (linea.trim()) parts.push(paragraphXml(linea)); });
  } else {
    parts.push(paragraphXml("(Sin completar. Escribe en la interfaz por qué el marco elegido es pertinente para tu problema concreto — no basta con que el motor lo haya sugerido por afinidad léxica: la elección teórica es tuya.)", { italic: true }));
  }

  parts.push(headingXml("7. Categorías explicativas para tu problema concreto", 2));
  const categorias = resultado.categoriasExplicativas || [];
  if (categorias.length) {
    parts.push(paragraphXml("Más allá de los marcos teóricos generales de la sección anterior, estas categorías responden a una dinámica concreta identificada en tu problema (por ejemplo, por qué alguien permanece, calla o justifica una situación):", { italic: true }));
    categorias.forEach(c => parts.push(paragraphXml(c, { bullet: true })));
    parts.push(paragraphXml(NOTA_CATEGORIAS_EXPLICATIVAS, { italic: true }));
  } else {
    parts.push(paragraphXml("SOCIOKAIROS no ha detectado en el texto una dinámica concreta (por ejemplo, alguien que permanece, calla o justifica una situación) que active una categoría explicativa específica. Usa los marcos teóricos generales de la sección anterior, o describe con más detalle qué hace o cómo reacciona la persona o el grupo afectado."));
  }

  parts.push(headingXml("8. Unidad de análisis, diseño de estudio y enfoque metodológico", 2));
  parts.push(paragraphXml("Unidad de análisis sugerida:"));
  parts.push(paragraphXml(resultado.unidad));
  parts.push(paragraphXml("Diseño de estudio sugerido:"));
  resultado.diseno.split("\n").forEach(linea => parts.push(paragraphXml(linea)));

  parts.push(headingXml("9. Operacionalización sugerida", 2));
  parts.push(paragraphXml(`Observación metodológica: la operacionalización propuesta se ha construido a partir de la ${versionLabel} del problema seleccionada en SOCIOKAIROS.`, { italic: true }));
  const filas = resultado.operacionalizacion;
  if (filas.length) {
    parts.push(tableXml(["Variable", "Tipo", "Indicador", "Unidad", "Nivel de medición", "Fuente"], filas.map(f => [f.variable, f.tipo, f.indicador, f.unidad, f.nivel, f.fuente])));
  } else {
    parts.push(paragraphXml("Pendiente de definir variables, indicadores y fuentes de datos."));
  }

  parts.push(headingXml("10. Fuentes de datos / bases recomendadas", 2));
  if (resultado.fuentes.length) resultado.fuentes.forEach(f => parts.push(paragraphXml(f, { bullet: true })));
  else parts.push(paragraphXml("Pendiente de identificar bases de datos y fuentes administrativas específicas."));

  parts.push(headingXml("11. Guía cualitativa pre-CAQDAS (libro de códigos y guía de entrevista)", 2));
  parts.push(paragraphXml(NOTA_GUIA_CUALITATIVA, { italic: true }));
  const guia = resultado.guiaCualitativa || { codigos: [], preguntas: [] };
  parts.push(paragraphXml("Libro de códigos preliminar:"));
  if (guia.codigos.length) {
    parts.push(tableXml(["Categoría", "Tipo", "Definición operativa"], guia.codigos.map(c => [c.categoria, c.tipo, c.definicion])));
  } else {
    parts.push(paragraphXml("Pendiente: no hay variables ni mecanismos suficientes para proponer códigos."));
  }
  parts.push(paragraphXml("Guía de entrevista / observación semiestructurada:"));
  if (guia.preguntas.length) guia.preguntas.forEach(p => parts.push(paragraphXml(p, { bullet: true })));
  else parts.push(paragraphXml("Pendiente de construir.", { bullet: true }));

  const txtBase = textoOriginal || problema;
  parts.push(headingXml("12. Alertas metodológicas", 2));
  generarAlertasMetodologicas(txtBase, resultado).split("\n").forEach(l => parts.push(paragraphXml(l, { bullet: true })));

  parts.push(headingXml("13. Tradiciones sociológicas compatibles", 2));
  generarTradiciones(resultado, txtBase).split("\n").forEach(l => parts.push(paragraphXml(l, { bullet: true })));

  parts.push(headingXml("14. Mapa lógico del problema", 2));
  parts.push(paragraphXml(generarMapaLogico(resultado)));

  parts.push(headingXml("15. Diseños metodológicos sugeridos", 2));
  generarDisenos(txtBase, resultado).split("\n").forEach(l => parts.push(paragraphXml(l, { bullet: true })));

  if (incluirNotaUnizar) {
    parts.push(headingXml("16. Nota para estudiantes de la Universidad de Zaragoza", 2));
    parts.push(paragraphXml("Universidad de Zaragoza: consulta también los recursos de la Biblioteca de Ciencias Sociales y los convenios de acceso a bases de datos restringidas (estadísticas, encuestas, registros administrativos, etc.)."));
  } else {
    parts.push(headingXml("16. Nota adicional", 2));
    parts.push(paragraphXml("Puedes complementar este informe con la revisión bibliográfica y el acceso a las bases de datos institucionales o de suscripción disponibles en tu contexto de investigación."));
  }

  parts.push(headingXml("17. Nota APA para citar SOCIOKAIROS", 2));
  parts.push(paragraphXml("Pérez Gallo, V. H. (2025). SOCIOKAIROS: A Heuristic Computational Assistant for the Reformulation of Scientific Problems in Sociology (Versión 15) [Software]. Zenodo. https://doi.org/10.5281/zenodo.17462816"));
  parts.push(paragraphXml("Pérez Gallo, V. H. (2025). SOCIOKAIROS Companion Paper: Computational Heuristics for Reflexive Sociology [Documento técnico]. Zenodo. https://doi.org/10.5281/zenodo.17541706"));
  parts.push(paragraphXml("Nota importante: SOCIOKAIROS puede emplearse como herramienta heurística para mejorar claridad conceptual, operacionalización y diseño metodológico. Las decisiones finales (variables, indicadores, hipótesis y métodos) deben justificarse en el marco teórico y la literatura científica del trabajo."));

  parts.push(headingXml("18. Advertencia académica", 2));
  parts.push(paragraphXml("SOCIOKAIROS es una herramienta heurística de apoyo a la formulación de problemas científicos. No sustituye la revisión bibliográfica sistemática, el trabajo teórico propio del investigador ni la discusión metodológica detallada. El uso responsable de sus sugerencias exige contrastarlas con la literatura, los datos disponibles y las condiciones concretas del campo de estudio."));

  parts.push(headingXml("19. Consejos de tu director de tesis", 2));
  parts.push(paragraphXml("Un profesor senior de metodología no se limita a decir qué está bien: anticipa lo que preguntaría un director de tesis o un tribunal. Lo que sigue se construye a partir de tu problema concreto, no es un texto genérico.", { italic: true }));
  parts.push(paragraphXml("Preguntas que te haría tu director/a:", { bold: true }));
  generarPreguntasSocraticas(txtBase, resultado).split("\n").forEach(l => parts.push(paragraphXml(l, { bullet: true })));
  parts.push(paragraphXml("Puntos débiles a defender:", { bold: true }));
  generarPuntosDebilesADefender(txtBase, resultado).split("\n").forEach(l => parts.push(paragraphXml(l, { bullet: true })));
  parts.push(paragraphXml("Guía de búsqueda bibliográfica:", { bold: true }));
  generarGuiaBusquedaBibliografica(resultado).split("\n").forEach(l => parts.push(paragraphXml(l, { bullet: true })));

  if (disenoCabeceraPie) {
    parts.push(dashedRuleXml());
    const lineasPie = piePagina.split("\n");
    lineasPie.forEach((linea, i) => {
      const esUltima = i === lineasPie.length - 1;
      parts.push(paragraphXml(linea, esUltima
        ? { bold: true, sz: 18, color: SK_ROJO_ACENTO, sinSangria: true }
        : { sz: 18, sinSangria: true }));
    });
    parts.push(paragraphXml(`Informe generado el ${fechaStr} a las ${horaStr}`, { italic: true, sz: 15, color: "9AA0A6", sinSangria: true }));
  }

  let logoBytes = null;
  try { if (LOGO_BASE64) logoBytes = base64ToBytes(LOGO_BASE64); } catch (e) { logoBytes = null; }

  return buildDocx(parts, logoBytes);
}
