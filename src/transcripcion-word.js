/* Exportación .docx de una transcripción (entrevista o grupo focal) ya
 * dividida en turnos y anotada con el libro de códigos — ver
 * detectarTurnosHabla()/anotarTurnosConCodigos() en engine.js. Documento
 * separado del informe principal (construirInformeWord en
 * informe-word.js): son dos productos distintos (el planteamiento del
 * problema vs. material de campo ya recogido), aunque comparten el mismo
 * escritor de .docx (docxwriter.js) y el mismo logo.
 *
 * Exclusivo de la línea Profesional (ver wiring.js de cada línea): la
 * línea SCORM/EDU no expone la interfaz para pegar transcripciones, pero
 * este archivo se concatena igual en ambos builds — el motor es una única
 * fuente de verdad, solo diverge qué interfaz lo usa.
 */

function construirTranscripcionWord(turnosAnotados, opciones) {
  opciones = opciones || {};
  const parts = [];
  const comentarios = [];
  let nextId = 0;

  if (opciones.disenoCabeceraPie) {
    parts.push(dashedRuleXml());
    const runsCabecera = [];
    try {
      if (LOGO_BASE64) runsCabecera.push(imageRunXml(280035, 280035));
    } catch (e) { /* logo opcional */ }
    runsCabecera.push(runXml((runsCabecera.length ? "   " : "") + (opciones.tituloInforme || "Transcripción anotada"), { bold: true, sz: 32, color: opciones.colorTitulo || "133A5C" }));
    parts.push(multiRunParagraphXml(runsCabecera, { spacingAfter: 20 }));
    parts.push(paragraphXml(opciones.subtituloInforme || "PRE-CAQDAS · DOCUMENTO FUENTE", { sz: 18, color: "6B7280", sinSangria: true }));
    parts.push(dashedRuleXml());
  } else {
    parts.push(headingXml(opciones.tituloInforme || "Transcripción anotada — SOCIOKAIROS (pre-CAQDAS)", 1));
  }

  parts.push(paragraphXml(NOTA_TRANSCRIPCION_CAQDAS, { italic: true, sinSangria: true }));
  if (opciones.problemaAsociado) {
    parts.push(paragraphXml(`Libro de códigos aplicado: el generado para el problema "${opciones.problemaAsociado}".`, { italic: true, sinSangria: true }));
  }
  parts.push(dashedRuleXml());

  (turnosAnotados || []).forEach(turno => {
    const runs = [];
    if (turno.interlocutor) runs.push(runXml(turno.interlocutor + ": ", { bold: true }));
    const spans = (turno.anotaciones || []).map(a => {
      const id = nextId++;
      comentarios.push({ id, texto: `CÓDIGO SUGERIDO — ${a.categoria}: ${a.definicion}` });
      return { inicio: a.inicio, fin: a.fin, id };
    });
    runs.push(...comentarioRunsXml(turno.texto || "", spans, {}));
    parts.push(multiRunParagraphXml(runs, { spacingAfter: 160 }));
  });

  if (opciones.disenoCabeceraPie && opciones.piePagina) {
    parts.push(dashedRuleXml());
    const lineasPie = opciones.piePagina.split("\n");
    lineasPie.forEach((linea, i) => {
      const esUltima = i === lineasPie.length - 1;
      parts.push(paragraphXml(linea, esUltima
        ? { bold: true, sz: 18, color: "A6392E", sinSangria: true }
        : { sz: 18, sinSangria: true }));
    });
  }

  let logoBytes = null;
  try { if (LOGO_BASE64) logoBytes = base64ToBytes(LOGO_BASE64); } catch (e) { logoBytes = null; }

  return buildDocx(parts, logoBytes, comentarios);
}
