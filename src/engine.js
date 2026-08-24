/* SOCIOKAIROS — motor heurístico v2: fusión del wrapper SCORM original con el
   motor más avanzado de SOCIOKAIROS EDU V32 (geolocalización mundial,
   validación pedagógica, alertas/tradiciones/mapa/diseños, visualización SVG),
   más las mejoras metodológicas propias (nivel de medición, aviso causal,
   muestreo, ética reforzada, direccionalidad VI/VD). Puerto 1:1 a JS puro. */

/* ================= utilidades ================= */

function skJoin(items, fallback) {
  fallback = fallback || "el fenómeno estudiado";
  items = (items || []).filter(Boolean);
  if (items.length === 0) return fallback;
  if (items.length === 1) return items[0];
  if (items.length === 2) return items[0] + " y " + items[1];
  return items.slice(0, -1).join(", ") + " y " + items[items.length - 1];
}

function skHas(texto, palabras) {
  return skContieneAlguno(texto, palabras);
}

function uniq(xs) {
  const out = [];
  for (const x of xs) if (!out.includes(x)) out.push(x);
  return out;
}

/* ================= coincidencia tolerante a erratas ================= */
/* Los estudiantes escriben rápido y con erratas ("instrucion" por
   "instrucción", "hombrs" por "hombres"). En vez de exigir coincidencia
   exacta en cada diccionario de palabras clave, se admite una pequeña
   distancia de edición por palabra — sigue siendo determinista (mismo
   texto, mismo resultado siempre), solo más tolerante a errores tipográficos. */

function skNormalizar(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Distancia de Damerau-Levenshtein (variante "optimal string alignment"):
// igual que Levenshtein normal (inserción/omisión/sustitución), pero además
// cuenta el intercambio de dos letras adyacentes como un solo cambio, no
// dos. Es exactamente la errata más común al escribir rápido en un móvil o
// teclado ("delicnuencia" por "delincuencia": una transposición, no dos
// sustituciones) — con Levenshtein normal costaba 2 y quedaba fuera de
// tolerancia; con esto cuesta 1, sin tocar el tope de tolerancia ni el
// resto de comparaciones.
function skDistanciaEdicion(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = [];
  for (let i = 0; i <= m; i++) dp.push(new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let valor = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + costo
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        valor = Math.min(valor, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = valor;
    }
  }
  return dp[m][n];
}

function skToleranciaPara(len) {
  // Máximo 1 carácter de diferencia (inserción/omisión/sustitución), sin
  // importar lo larga que sea la palabra: suficiente para una errata típica
  // ("instrucion" por "instrucción"), pero no tanto como para confundir dos
  // palabras españolas distintas que comparten raíz (p. ej. "instrucción"
  // con "institución", a distancia 2).
  return len <= 4 ? 0 : 1;
}

// ¿Aparece "patron" (una o varias palabras) dentro de "texto", tolerando
// pequeñas erratas en cada palabra del patrón? Coincidencia exacta primero
// (rápida); si falla, se buscan las palabras del patrón en orden dentro de
// las palabras del texto, permitiendo una distancia de edición pequeña.
function skContienePatron(texto, patron) {
  const t = skNormalizar(texto);
  const p = skNormalizar(patron);
  if (!p) return false;
  if (t.includes(p)) return true;

  const palabrasPatron = p.split(/\s+/).filter(Boolean);
  const palabrasTexto = t.split(/[^a-z0-9]+/).filter(Boolean);
  let idx = 0;
  for (const pw of palabrasPatron) {
    const tol = skToleranciaPara(pw.length);
    let encontrada = -1;
    for (let k = idx; k < palabrasTexto.length; k++) {
      const tw = palabrasTexto[k];
      if (Math.abs(tw.length - pw.length) > tol) continue;
      if (skDistanciaEdicion(pw, tw) <= tol) { encontrada = k; break; }
    }
    if (encontrada === -1) return false;
    idx = encontrada + 1;
  }
  return true;
}

function skContieneAlguno(texto, patrones) {
  return (patrones || []).some(p => skContienePatron(texto, p));
}

// Igual que skContieneAlguno, pero además devuelve CUÁL de los patrones fue
// el que hizo coincidir (o null si ninguno). Se usa exclusivamente para la
// función de transparencia ("por qué SOCIOKAIROS sugirió esto"): permite
// mostrarle al estudiante la palabra o frase concreta de su problema que
// activó cada VI/VD/área/marco teórico, sin cambiar en nada la lógica de
// detección en sí (mismo criterio, mismo resultado booleano).
function skContieneAlgunoTrack(texto, patrones) {
  for (const p of (patrones || [])) {
    if (skContienePatron(texto, p)) return p;
  }
  return null;
}

/* ================= detección de erratas sospechosas (sugerencias) ================= */
/**
 * Vocabulario de dominio de SOCIOKAIROS: extraído de las palabras clave que
 * el propio motor usa en toda la detección de variables, áreas y marcos.
 * Se usa solo para SUGERIR una corrección al estudiante (nunca para
 * corregir nada en silencio) cuando escribe una palabra parecida pero no
 * idéntica a un término de dominio importante.
 */
const VOCABULARIO_DOMINIO = [
  "abandona", "abandonan", "abandonaron", "abandono", "abandonó", "absentismo", "accesibilidad", "actualidad",
  "administracion", "administración", "adolescente", "adolescentes", "afrodescendiente", "agredida", "agredido", "agresora",
  "algoritmo", "algoritmos", "alicante", "alquiler", "alumnado", "ancianos", "andalucia", "andalucía",
  "ansiedad", "antecedentes", "aparentar", "asociacion", "asociación", "asturias", "aumentan", "ausentismo",
  "ayuntamiento", "baleares", "barcelona", "bisexual", "bourdieu", "bruselas", "burocracia", "burocratizacion",
  "burocratización", "calefaccion", "calefacción", "camarero", "canarias", "cantabria", "carstensen", "cataluna",
  "cataluña", "categórica", "ciudades", "cognitivo", "colectivos", "comarcas", "comunidad", "comunidades",
  "condiciona", "condicionan", "conectada", "conectadas", "conectado", "conectados", "conectividad", "conocimiento",
  "consiente", "consienten", "consumismo", "contaminacion", "contaminación", "contrato", "contratos", "contribuye",
  "contribuyen", "correlacion", "correlación", "criminalidad", "cualitativo", "cuantitativo", "cuidados", "delincuencia",
  "dependencia", "depresion", "depresión", "desempleo", "desercion", "deserción", "desigualdad", "desinformacion",
  "desinformación", "despoblacion", "despoblación", "determina", "determinan", "discapacidad", "discriminacion", "discriminación",
  "discurso", "disminuye", "disminuyen", "distribucion", "distribución", "distrito", "docentes", "dominacion",
  "dominación", "edadismo", "educacion", "educación", "educativo", "emociones", "energetica", "energeticas",
  "energética", "energéticas", "enfermedad", "envejecimiento", "escolarizacion", "escolarización", "esperanza", "estudiantes",
  "estudios", "etnografia", "etnografía", "evolucion", "evolución", "exclusion", "exclusión", "experiencia",
  "experimental", "experimento", "explican", "extremadura", "familiar", "familiares", "familias", "favorece",
  "favorecen", "feminicidio", "feminidad", "feminidades", "festinger", "formación", "gentrificacion", "gentrificación",
  "gerontologia", "gerontología", "habitacional", "hegemonia", "hegemonía", "homofobia", "homologacion", "homologación",
  "homosexual", "identidad", "incentivos", "incidencia", "incrementa", "incrementan", "indigena", "indígena",
  "infancia", "influencers", "influyen", "ingresos", "inmigracion", "inmigración", "inseguridad", "institucion",
  "institución", "instituto", "instruccion", "instrucción", "instrucion", "integracion", "integración", "internet",
  "jubilacion", "jubilación", "justifica", "justifican", "juventud", "lgbtfobia", "lgtbifobia", "limitacion",
  "limitaciones", "limitación", "longitudinal", "machismo", "malestar", "maltratada", "maltratado", "maltratador",
  "maltrato", "marketing", "masculinidad", "masculinidades", "migracion", "migración", "migrante", "migrantes",
  "monegros", "morbilidad", "mortalidad", "municipio", "municipios", "narrativa", "normalidad", "normaliza",
  "normalizan", "organizacion", "organizaciones", "organización", "pamplona", "paradojicamente", "paradójicamente", "participacion",
  "participación", "participativo", "patriarcado", "patriarcal", "pensiones", "percepcion", "percepción", "perdonan",
  "periferia", "periferico", "perifericos", "periférico", "periféricos", "permanece", "permanecen", "plataforma",
  "plataformas", "pluralismo", "poblacion", "población", "politica", "política", "porcentaje", "pospandemia",
  "practica", "practican", "precariedad", "precarizacion", "precarización", "predicen", "prevalencia", "probabilidad",
  "producen", "profesorado", "profesores", "provincia", "provincias", "provocan", "publicidad", "racializad",
  "radicalizacion", "radicalización", "refugiadas", "refugiados", "regularizacion", "regularización", "reincidencia", "relacion",
  "relación", "relaciona", "relacionada", "relacionadas", "relacionado", "relacionados", "relacionan", "religion",
  "religiosidad", "religión", "representaciones", "resentimiento", "residencial", "residenciales",
  "resignacion", "resignación", "ruralidad", "salarios", "santander", "secularizacion", "secularización", "sedgwick",
  "segregacion", "segregación", "seguimiento", "significado", "sobreendeudamiento", "sostenibilidad", "sunstein", "temperatura",
  "temporalidad", "territorial", "territorio", "territorios", "trabajadoras", "trabajadores", "transfobia", "transgenero",
  "transgénero", "triangulacion", "triangulación", "universidad", "universidades", "usuarias", "usuarios", "valencia",
  "valladolid", "vecindario", "verguenza", "vergüenza", "violencia", "violentada", "violentadas", "violentado",
  "violentados", "visibilidad", "vivencia", "vivienda", "voluntariamente", "xenofobia", "zaragoza",
];

const VOCABULARIO_DOMINIO_NORM = new Set(VOCABULARIO_DOMINIO.map(skNormalizar));

// Índice del vocabulario agrupado por longitud normalizada: detectarErratasSospechosas
// necesita comparar cada palabra sospechosa solo contra los términos de
// longitud ±1 (la tolerancia de edición que usa), no contra las ~370
// palabras del vocabulario entero — y sin volver a normalizar cada término
// en cada comparación, ya que skNormalizar() se ejecuta aquí una sola vez
// por palabra al cargar el motor, no una vez por cada token del texto.
const VOCABULARIO_DOMINIO_POR_LONGITUD = (() => {
  const mapa = new Map();
  for (const palabra of VOCABULARIO_DOMINIO) {
    const norm = skNormalizar(palabra);
    if (!mapa.has(norm.length)) mapa.set(norm.length, []);
    mapa.get(norm.length).push({ palabra, norm });
  }
  return mapa;
})();

/**
 * Formas singulares candidatas de una palabra normalizada, quitando una
 * "s" o "es" final regular. Se usa solo para reconocer que el PLURAL de un
 * término del vocabulario también es válido (p. ej. "practicas" es el
 * plural de "practica", ya en VOCABULARIO_DOMINIO) sin tener que listar a
 * mano cada plural — evita una clase entera de falsos positivos: un
 * término de dominio en singular está cubierto, pero cualquier estudiante
 * que lo use en plural (muy común: "las viviendas", "las experiencias",
 * "los discursos"...) disparaba antes el pop-up de errata por error.
 */
function skFormasSingularesCandidatas(norm) {
  const candidatas = [norm];
  if (norm.length > 6 && /es$/.test(norm)) candidatas.push(norm.slice(0, -2));
  if (norm.length > 5 && /s$/.test(norm)) candidatas.push(norm.slice(0, -1));
  return candidatas;
}

/**
 * Recorre el texto en busca de palabras "sospechosas": no coinciden
 * exactamente con ningún término del vocabulario de dominio (ni en plural
 * regular, ver skFormasSingularesCandidatas), pero están a una distancia
 * de edición muy pequeña de alguno (p. ej. "delicnuencia" de
 * "delincuencia"). Nunca corrige nada por sí sola — solo devuelve
 * candidatas para que la interfaz se lo pregunte al estudiante. Como el
 * vocabulario contiene solo términos de dominio (no palabras comunes del
 * español), una palabra corriente sin relación con ningún término de
 * dominio simplemente no genera ninguna sugerencia.
 */
function detectarErratasSospechosas(texto) {
  const raw = texto || "";
  const tokenRe = /[A-Za-zÁÉÍÓÚÑÜáéíóúñü]{4,}/g;
  const vistos = new Set();
  const erratas = [];
  let m;
  while ((m = tokenRe.exec(raw))) {
    const original = m[0];
    const norm = skNormalizar(original);
    if (norm.length < 8) continue;
    if (vistos.has(norm)) continue;
    if (skFormasSingularesCandidatas(norm).some(c => VOCABULARIO_DOMINIO_NORM.has(c))) continue;
    // Tope de 1 SIEMPRE, sin importar lo larga que sea la palabra: a
    // distancia 2 aparecen demasiados pares de palabras españolas
    // distintas y perfectamente correctas ("diversidad"/"universidad",
    // "condiciones"/"condiciona", "organizacional"/"organización") que no
    // son la misma errata — solo generan avisos molestos y falsos. A
    // distancia 1 el caso real que motivó esto ("delicnuencia" →
    // "delincuencia", una transposición) se sigue detectando.
    const tol = 1;
    const candidatas = [];
    for (let len = norm.length - tol; len <= norm.length + tol; len++) {
      const bucket = VOCABULARIO_DOMINIO_POR_LONGITUD.get(len);
      if (!bucket) continue;
      for (const { palabra: palabraVocab, norm: vn } of bucket) {
        if (vn === norm) continue;
        const d = skDistanciaEdicion(norm, vn);
        if (d >= 1 && d <= tol) candidatas.push({ palabra: palabraVocab, dist: d });
      }
    }
    if (candidatas.length) {
      candidatas.sort((a, b) => a.dist - b.dist || a.palabra.localeCompare(b.palabra));
      const unicas = [];
      for (const c of candidatas) {
        if (!unicas.includes(c.palabra)) unicas.push(c.palabra);
        if (unicas.length >= 2) break;
      }
      erratas.push({ original, sugerencias: unicas });
      vistos.add(norm);
    }
  }
  return erratas;
}

/* ================= motor geoheurístico (mundial) ================= */
/* GEO_ALIASES / COUNTRY_ALIASES / COUNTRY_SOURCES / CITY_SOURCES / SK_DOMINIOS
   se cargan desde geo_and_dominios.js, concatenado antes de este archivo. */

function geoDetectar(texto) {
  const l = (texto || "").toLowerCase();
  const regiones = ["aragón", "aragon", "cataluña", "cataluna", "andalucía", "andalucia", "galicia", "navarra", "asturias", "murcia", "extremadura", "valencia", "comunidad valenciana", "castilla la mancha", "castilla y leon", "castilla y león", "país vasco", "pais vasco", "canarias", "baleares", "la rioja", "cantabria"];
  for (const r of regiones) {
    if (new RegExp(`\\b${escapeRegExp(r)}\\b`).test(l)) {
      return { ciudad: null, pais: "España", contexto: toTitleCase(r) };
    }
  }
  const aliasesByLenDesc = Object.keys(GEO_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of aliasesByLenDesc) {
    if (new RegExp(`\\b${escapeRegExp(alias)}\\b`).test(l)) {
      const [ciudad, pais] = GEO_ALIASES[alias];
      return { ciudad, pais, contexto: ciudad };
    }
  }
  const countryAliasesByLenDesc = Object.keys(COUNTRY_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of countryAliasesByLenDesc) {
    if (new RegExp(`\\b${escapeRegExp(alias)}\\b`).test(l)) {
      const pais = COUNTRY_ALIASES[alias];
      return { ciudad: null, pais, contexto: pais };
    }
  }
  return { ciudad: null, pais: null, contexto: "territorio no detectado" };
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toTitleCase(s) {
  return s.split(" ").map(w => w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(" ");
}

function geoFuentes(ciudad, pais, area, lower) {
  const fuentes = [];
  const add = (nombre, url) => {
    const item = `${nombre} — ${url}`;
    if (!fuentes.includes(item)) fuentes.push(item);
  };
  if (ciudad && Object.prototype.hasOwnProperty.call(CITY_SOURCES, ciudad)) {
    for (const [n, u] of CITY_SOURCES[ciudad]) add(n, u);
  }
  if (pais && Object.prototype.hasOwnProperty.call(COUNTRY_SOURCES, pais)) {
    for (const [n, u] of COUNTRY_SOURCES[pais]) add(n, u);
  }

  const topic = (lower || "") + " " + (area || "").toLowerCase();
  if (skContieneAlguno(topic, ["salud mental", "salud", "enfermedad", "ansiedad", "depresión", "depresion"])) {
    if (pais === "Francia") add("Santé publique France – Santé mentale", "https://www.santepubliquefrance.fr/maladies-et-traumatismes/sante-mentale");
    else if (pais === "España") add("Ministerio de Sanidad – Estadísticas sanitarias", "https://www.sanidad.gob.es/estadEstudios/estadisticas/");
    else if (pais === "Estados Unidos") add("CDC – Mental Health Data", "https://www.cdc.gov/mentalhealth/data_stats/");
    else if (pais === "Cuba") add("MINSAP Cuba", "https://salud.msp.gob.cu/");
  }
  if (skContieneAlguno(topic, ["trabajo", "empleo", "paro", "laboral"])) {
    if (pais === "Francia") add("DARES – Statistiques du travail", "https://dares.travail-emploi.gouv.fr/");
    else if (pais === "España") add("SEPE – Estadísticas", "https://www.sepe.es/HomeSepe/que-es-el-sepe/estadisticas.html");
    else if (pais === "Estados Unidos") add("Bureau of Labor Statistics", "https://www.bls.gov");
  }
  if (skContieneAlguno(topic, ["educación", "educacion", "abandono escolar", "deserción", "desercion"])) {
    if (pais === "Francia") add("Ministère de l'Éducation nationale – statistiques", "https://www.education.gouv.fr/etudes-et-statistiques");
    else if (pais === "España") add("Ministerio de Educación – Estadísticas", "https://www.educacionfpydeportes.gob.es/servicios-al-ciudadano/estadisticas.html");
  }
  if (skContieneAlguno(topic, ["violencia de género", "violencia de genero", "maltrato"])) {
    if (pais === "España") add("Delegación del Gobierno contra la Violencia de Género", "https://violenciagenero.igualdad.gob.es/violenciaEnCifras/");
    else if (pais === "Francia") add("Ministère de l'Intérieur – statistiques sécurité", "https://www.interieur.gouv.fr/Interstats");
  }
  if (skContieneAlguno(topic, ["migración", "migracion", "inmigración", "inmigracion", "migrante", "refugiados", "asilo"])) {
    add("ACNUR (UNHCR) – Refugee Data Finder", "https://www.unhcr.org/refugee-statistics/");
    add("OIM (IOM) – Migration Data Portal", "https://www.migrationdataportal.org/");
    if (pais === "España") add("INE – Estadística de Migraciones", "https://www.ine.es/dyngs/INEbase/es/operacion.htm?c=Estadistica_C&cid=1254736177000&menu=ultiDatos&idp=1254735572981");
  }
  if (skContieneAlguno(topic, ["discapacidad", "diversidad funcional", "accesibilidad"])) {
    add("OMS – Disability Data", "https://www.who.int/data/gho/data/themes/topic-details/GHO/disability");
    if (pais === "España") add("INE – Encuesta de Discapacidad, Autonomía Personal y Dependencia (EDAD)", "https://www.ine.es/dyngs/INEbase/es/operacion.htm?c=Estadistica_C&cid=1254736176782");
  }
  if (skContieneAlguno(topic, ["cambio climático", "cambio climatico", "medio ambiente", "sostenibilidad", "crisis climática", "crisis climatica"])) {
    add("Copernicus Climate Data Store", "https://cds.climate.copernicus.eu/");
    if (pais === "España") add("Ministerio para la Transición Ecológica – Estadísticas ambientales", "https://www.miteco.gob.es/es/calidad-y-evaluacion-ambiental/temas/informacion-ambiental-indicadores-ambientales/");
    else add("Eurostat – Environment", "https://ec.europa.eu/eurostat/web/environment");
  }
  if (skContieneAlguno(topic, ["rural", "ruralidad", "despoblación", "despoblacion", "éxodo rural", "exodo rural"])) {
    if (pais === "España") add("Ministerio para el Reto Demográfico", "https://www.mites.gob.es/retodemografico/");
    add("INE – Padrón continuo (cifras de población por municipio)", "https://www.ine.es/dyngs/INEbase/es/operacion.htm?c=Estadistica_C&cid=1254736177011");
  }
  if (skContieneAlguno(topic, ["religión", "religion", "religiosidad", "secularización", "secularizacion"])) {
    if (pais === "España") add("CIS – Barómetros de religiosidad", "https://www.cis.es/");
    add("Pew Research Center – Religion Data", "https://www.pewresearch.org/religion/");
    add("ISSP – International Social Survey Programme", "https://issp.org/");
  }
  add("World Bank Data", "https://data.worldbank.org/");
  add("UNData – Naciones Unidas", "https://data.un.org/");
  add("OECD Data", "https://data.oecd.org/");
  add("World Values Survey (WVS)", "https://www.worldvaluessurvey.org");
  if (!ciudad && !pais) {
    add("Nota SOCIOKAIROS: no se localizaron bases oficiales específicas para el territorio indicado; se sugieren fuentes comparativas internacionales y estadísticas generales.", "https://data.un.org/");
  }
  return fuentes;
}

function detectarContextoYPoblacion(lower, textoOriginal) {
  const g = geoDetectar(textoOriginal || lower);
  const contexto = g.contexto;
  let poblacion = "la población de estudio";
  const l = lower || "";

  if (skContieneAlguno(l, ["personas mayores", "adultos mayores", "ancianos"])) poblacion = "las personas mayores";
  else if (skContieneAlguno(l, ["jóvenes", "jovenes", "juventud", "adolescentes", "juvenil"])) poblacion = "la población joven";
  else if (skContieneAlguno(l, ["hombres", "varones", "masculinidades"])) poblacion = "los hombres";
  else if (skContieneAlguno(l, ["mujeres", "mujer"])) poblacion = "las mujeres";
  else if (skContieneAlguno(l, ["profesores universitarios", "docentes universitarios", "profesorado universitario"])) poblacion = "el profesorado universitario";
  else if (skContieneAlguno(l, ["profesores", "docentes", "profesorado"])) poblacion = "el profesorado";
  else if (skContieneAlguno(l, ["estudiantes", "alumnos", "alumnas"])) poblacion = "el estudiantado";
  else if (skContieneAlguno(l, ["familias", "hogares"])) poblacion = "las familias";

  return { contexto, poblacion };
}

/* ================= detección de variables (VI/VD) ================= */

function detectarVariables(lower) {
  const l = lower || "";
  let vi = [];
  let vd = [];

  // Transparencia: por cada VI/VD guardamos qué palabra o frase del propio
  // problema activó su detección (o, si es una candidata sugerida por el
  // dominio y no aparece literalmente en el texto, un aviso honesto de eso).
  const motivosVi = {};
  const motivosVd = {};
  let ultimoMotivo = null;

  const addVi = (x, motivoExplicito) => {
    x = (x || "").trim();
    if (x && !vi.includes(x) && !vd.includes(x)) vi.push(x);
    if (x && !motivosVi[x]) {
      const m = motivoExplicito || ultimoMotivo;
      if (m) motivosVi[x] = m;
    }
  };
  const addVd = (x, motivoExplicito) => {
    x = (x || "").trim();
    if (x && !vd.includes(x)) vd.push(x);
    const idx = vi.indexOf(x);
    if (idx !== -1) vi.splice(idx, 1);
    if (x && !motivosVd[x]) {
      const m = motivoExplicito || ultimoMotivo || "ningún término de dominio reconocible en el texto; variable genérica por defecto";
      motivosVd[x] = m;
    }
  };
  const hasAny = (words) => {
    const m = skContieneAlgunoTrack(l, words);
    ultimoMotivo = m;
    return !!m;
  };

  // 1) Objeto sociológico central / VD explícitas
  if (hasAny(["pobreza energética", "pobreza energetica", "vulnerabilidad energética", "vulnerabilidad energetica"])) {
    addVd("la pobreza energética");
  } else if (hasAny(["pobreza infantil", "pobreza juvenil", "pobreza severa", "situación de pobreza", "situacion de pobreza"])) {
    addVd("la pobreza");
  }

  if (hasAny(["trabajos precarios", "empleos precarios", "empleo precario", "precariedad laboral", "precarización laboral", "precarizacion laboral"])) {
    addVd("la precariedad laboral");
  }
  if (hasAny(["violencia de género", "violencia de genero", "violencia machista"])) {
    addVd("la violencia de género");
  } else if (hasAny(["violencia", "violentada", "violentado", "violentadas", "violentados", "maltrato", "maltratada", "maltratado", "maltratador", "agresor", "agresora", "agredida", "agredido"])) {
    addVd("la violencia");
  }
  if (hasAny(["salud mental", "problemas de salud mental", "malestar emocional", "bienestar psicológico", "bienestar psicologico"])) {
    addVd("el malestar emocional y la salud mental");
  } else if (hasAny(["morbilidad", "mortalidad", "enfermedad"])) {
    addVd("los problemas de salud");
  }
  if (hasAny(["abandono escolar", "deserción escolar", "desercion escolar", "fracaso escolar"]) ||
      (hasAny(["abandona", "abandonan", "abandonó", "abandono", "abandonaron", "deja", "dejan", "dejó", "dejo"]) && hasAny(["escuela", "instituto", "colegio", "estudios", "clases"]))) {
    addVd("el abandono escolar");
  }
  if (hasAny(["absentismo", "ausentismo"])) {
    addVd("el absentismo escolar");
  }
  if (hasAny(["rendimiento académico", "rendimiento academico", "bajo rendimiento"])) {
    addVd("el rendimiento académico");
  }
  if (hasAny(["desempleo", "paro"])) {
    addVd("el desempleo");
  }
  if (hasAny(["exclusión digital", "exclusion digital", "brecha digital"])) {
    addVd("la exclusión digital");
  }
  if (skContienePatron(l, "soledad no deseada")) {
    addVd("la soledad no deseada");
  } else if (skContienePatron(l, "soledad")) {
    addVd("la soledad social");
  }
  if (hasAny(["percepción de inseguridad", "percepcion de inseguridad"])) {
    addVd("la percepción de inseguridad");
  }
  if (hasAny(["participación social", "participacion social"])) {
    addVd("la participación social");
  }
  if (hasAny(["radicalización política juvenil", "radicalizacion politica juvenil"])) {
    addVd("la radicalización política juvenil");
  } else if (hasAny(["radicalización política", "radicalizacion politica"])) {
    addVd("la radicalización política");
  } else if (hasAny(["radicalización", "radicalizacion"])) {
    addVd("la radicalización");
  }
  if (hasAny(["apoyo juvenil a partidos", "apoyo a partidos de extrema derecha", "voto a", "intención de voto", "intencion de voto"])) {
    addVd("el apoyo político juvenil");
  }
  if (hasAny(["integración", "integracion", "percepción de integración", "percepcion de integracion"])) {
    addVd("la integración social percibida");
  }
  if (hasAny(["migración", "migracion", "inmigración", "inmigracion", "personas migrantes", "población migrante", "poblacion migrante", "refugiados", "refugiadas", "solicitantes de asilo"])) {
    if (hasAny(["discriminación", "discriminacion", "xenofobia", "racismo"])) addVd("la discriminación hacia la población migrante");
    else if (hasAny(["integración", "integracion"])) addVd("la integración social de la población migrante");
    else addVd("las condiciones de vida de la población migrante");
  }
  if (hasAny(["discapacidad", "diversidad funcional", "personas con discapacidad"])) {
    if (hasAny(["exclusión", "exclusion", "discriminación", "discriminacion"])) addVd("la exclusión social de las personas con discapacidad");
    else addVd("la participación social de las personas con discapacidad");
  }
  if (hasAny(["cambio climático", "cambio climatico", "crisis climática", "crisis climatica", "calentamiento global", "emergencia climática", "emergencia climatica"])) {
    addVd("la vulnerabilidad social frente al cambio climático");
  } else if (hasAny(["medio ambiente", "sostenibilidad", "contaminación", "contaminacion", "huella ecológica", "huella ecologica"])) {
    addVd("la vulnerabilidad ambiental");
  }
  if (hasAny(["despoblación", "despoblacion", "éxodo rural", "exodo rural", "españa vaciada", "espana vaciada", "reto demográfico", "reto demografico"])) {
    addVd("la despoblación rural");
  } else if (hasAny(["ruralidad", "mundo rural", "zonas rurales"])) {
    addVd("las condiciones de vida en el mundo rural");
  }
  if (hasAny(["secularización", "secularizacion"])) {
    addVd("la secularización");
  } else if (hasAny(["religión", "religion", "religiosidad", "creencias religiosas", "prácticas religiosas", "practicas religiosas"])) {
    addVd("la religiosidad");
  }
  if (hasAny(["homofobia", "transfobia", "lgtbifobia", "lgbtfobia"])) {
    addVd("la discriminación hacia personas LGTBIQ+");
  } else if (hasAny(["lgtbi", "lgtbiq", "lgbt", "diversidad sexual", "orientación sexual", "orientacion sexual", "identidad de género", "identidad de genero", "personas trans", "transgénero", "transgenero", "bisexual", "homosexual", "no binarie", "no binario"])) {
    addVd("la aceptación social de la diversidad sexual y de género");
  }
  if (hasAny(["edadismo", "discriminación por edad", "discriminacion por edad", "ageism"])) {
    addVd("el edadismo");
  } else if (hasAny(["envejecimiento", "vejez", "personas mayores", "tercera edad", "adultos mayores", "gerontología", "gerontologia"])) {
    addVd("las condiciones de vida en la vejez");
  }
  if (hasAny(["delincuencia", "criminalidad", "conducta desviada", "conductas desviadas", "desviación social", "desviacion social", "reincidencia"])) {
    addVd("la delincuencia");
  }
  if (hasAny(["desinformación", "desinformacion", "fake news", "bulos", "noticias falsas"])) {
    addVd("la desinformación");
  } else if (hasAny(["medios de comunicación", "medios de comunicacion", "opinión pública", "opinion publica", "agenda mediática", "agenda mediatica"])) {
    addVd("la influencia de los medios de comunicación");
  }
  if (hasAny(["consumo ostentoso", "consumo conspicuo", "sobreendeudamiento", "endeudamiento por consumo"])) {
    addVd("el consumo ostentoso");
  } else if (hasAny(["consumismo", "pautas de consumo", "hábitos de consumo", "habitos de consumo"])) {
    addVd("las pautas de consumo social");
  }
  if (hasAny(["burocratización", "burocratizacion", "clima organizacional", "cultura organizacional"])) {
    addVd("el clima organizacional");
  } else if (hasAny(["organización laboral", "organizacion laboral", "funcionamiento organizacional", "gestión empresarial", "gestion empresarial"])) {
    addVd("el funcionamiento organizacional");
  }

  // 2) VI concretas asociadas al dominio del problema
  if (hasAny(["estatus administrativo", "situación administrativa", "situacion administrativa", "regularización", "regularizacion", "permiso de residencia"])) {
    addVi("el estatus administrativo y el acceso a la regularización");
  }
  if (hasAny(["barreras lingüísticas", "barreras linguisticas", "idioma", "reconocimiento de titulaciones", "homologación", "homologacion"])) {
    addVi("las barreras lingüísticas y de reconocimiento de titulaciones");
  }
  if (hasAny(["accesibilidad", "barreras arquitectónicas", "barreras arquitectonicas", "entorno accesible"])) {
    addVi("las barreras de accesibilidad del entorno");
  }
  if (hasAny(["dependencia funcional", "grado de discapacidad", "autonomía personal", "autonomia personal"])) {
    addVi("el nivel de dependencia funcional");
  }
  if (hasAny(["riesgo climático", "riesgo climatico", "exposición ambiental", "exposicion ambiental", "vulnerabilidad territorial"])) {
    addVi("la exposición territorial a riesgos ambientales");
  }
  if (hasAny(["educación ambiental", "educacion ambiental", "conciencia ambiental", "cultura ambiental"])) {
    addVi("el acceso a la información y la educación ambiental");
  }
  if (hasAny(["envejecimiento poblacional", "envejecimiento de la población", "relevo generacional", "reemplazo generacional"])) {
    addVi("el envejecimiento poblacional y el reemplazo generacional");
  }
  if (hasAny(["conectividad", "banda ancha", "transporte público", "transporte publico", "servicios básicos", "servicios basicos"])) {
    addVi("la conectividad digital y de transporte");
  }
  if (hasAny(["socialización religiosa", "socializacion religiosa", "educación religiosa", "educacion religiosa", "tradición familiar", "tradicion familiar"])) {
    addVi("la socialización familiar y comunitaria en la fe");
  }
  if (hasAny(["pluralismo", "diversidad cultural", "minoría religiosa", "minoria religiosa", "minorías religiosas", "minorias religiosas"])) {
    addVi("el contexto migratorio y la pertenencia a minorías religiosas");
  }
  // Grupo étnico o cultural nombrado explícitamente (gitano/a, romaní, indígena,
  // afrodescendiente, o "etnia"/"tribu étnica"/"grupo cultural" en general): se
  // trata como un factor explicativo real, no una candidata genérica, porque el
  // problema lo nombra directamente. Toca sociología de la cultura de forma
  // transversal (ver detectarAreaSociologica) y, si además hay indicios de
  // migración, también sociología de las migraciones (bloque ya existente).
  if (hasAny(["etnia", "étnica", "etnica", "gitano", "gitana", "gitanos", "gitanas", "romaní", "romani", "pueblo gitano", "minoría étnica", "minoria etnica", "grupo étnico", "grupo etnico", "tribu étnica", "tribu etnica", "indígena", "indigena", "afrodescendiente", "racializad", "grupo cultural particular", "minoría cultural", "minoria cultural"])) {
    addVi("la discriminación étnica o cultural percibida");
  }
  if (hasAny(["rechazo familiar", "rechazo social", "aceptación familiar", "aceptacion familiar"])) {
    addVi("el rechazo familiar y social percibido");
  }
  if (hasAny(["visibilidad", "reconocimiento legal", "matrimonio igualitario", "ley trans"])) {
    addVi("la visibilidad y el reconocimiento legal");
  }
  if (hasAny(["dependencia", "salud funcional", "movilidad reducida", "cuidados de larga duración"])) {
    addVi("el estado de salud funcional y la dependencia");
  }
  if (hasAny(["pensión", "pension", "pensiones", "jubilación", "jubilacion"])) {
    addVi("los recursos económicos y la pensión");
  }
  if (hasAny(["asociación diferencial", "asociacion diferencial", "malas compañías", "malas companias", "pares desviados"])) {
    addVi("la asociación diferencial con pares desviados");
  }
  if (hasAny(["control social informal", "vigilancia vecinal", "cohesión vecinal", "cohesion vecinal"])) {
    addVi("el control social informal del entorno");
  }
  if (hasAny(["etiqueta social", "estigmatización institucional", "estigmatizacion institucional", "antecedentes penales"])) {
    addVi("la etiqueta social y la estigmatización institucional");
  }
  if (hasAny(["credibilidad de los medios", "confianza en los medios", "exposición mediática", "exposicion mediatica"])) {
    addVi("la exposición a medios y su credibilidad percibida");
  }
  if (hasAny(["cámara de eco", "camara de eco", "burbuja informativa", "consumo selectivo de noticias"])) {
    addVi("el consumo selectivo de fuentes afines (cámara de eco)");
  }
  if (hasAny(["alfabetización mediática", "alfabetizacion mediatica", "pensamiento crítico ante medios"])) {
    addVi("la alfabetización mediática");
  }
  if (hasAny(["capital económico", "capital economico", "poder adquisitivo", "nivel adquisitivo"])) {
    addVi("la posición de clase y el capital económico");
  }
  if (hasAny(["distinción social", "distincion social", "estatus social", "aparentar"])) {
    addVi("la búsqueda de distinción social");
  }
  if (hasAny(["publicidad", "influencers", "marketing"])) {
    addVi("la exposición a la publicidad y las redes sociales");
  }
  if (hasAny(["jerarquía organizacional", "jerarquia organizacional", "diseño organizacional", "diseno organizacional", "estructura jerárquica", "estructura jerarquica"])) {
    addVi("el diseño formal y la jerarquía organizacional");
  }
  if (hasAny(["incentivos", "sistemas de control", "evaluación del desempeño", "evaluacion del desempeno"])) {
    addVi("los incentivos y sistemas de control");
  }
  if (hasAny(["bajo nivel de instrucción", "bajo nivel de instruccion"])) {
    addVi("el bajo nivel de instrucción");
  } else if (hasAny(["nivel de instrucción", "nivel de instruccion"])) {
    addVi("el nivel de instrucción");
  }
  if (hasAny(["bajo nivel educativo"])) {
    addVi("el bajo nivel educativo");
  } else if (hasAny(["nivel educativo"])) {
    addVi("el nivel educativo");
  }
  if (skContienePatron(l, "capital cultural")) addVi("el capital cultural");
  if (hasAny(["expectativas educativas", "escolarización", "escolarizacion"])) addVi("las condiciones educativas");

  if (hasAny(["condiciones económicas", "condiciones economicas", "ingresos", "renta", "bajos ingresos", "precariedad económica", "precariedad economica"])) {
    addVi("las condiciones económicas del hogar");
  }
  if (hasAny(["vivienda", "residencial", "habitacional", "alquiler", "calefacción", "calefaccion", "temperatura", "factura eléctrica", "factura electrica", "suministro energético", "suministro energetico"])) {
    addVi("las condiciones residenciales y energéticas del hogar");
  }
  if (hasAny(["barrios periféricos", "barrios perifericos", "periferia", "periféricos", "perifericos", "segregación territorial", "segregacion territorial", "segregación urbana", "segregacion urbana", "desigualdad urbana"])) {
    addVi("la localización periférica y la segregación territorial");
  } else if (hasAny(["barrio", "barrios", "vecindario"])) {
    addVi("el contexto barrial");
  }

  if (skContienePatron(l, "aislamiento social")) addVi("el aislamiento social");
  if (hasAny(["escasas oportunidades de trabajo"])) {
    addVi("las escasas oportunidades de trabajo");
  } else if (hasAny(["oportunidades laborales", "oportunidades de trabajo"])) {
    addVi("las oportunidades laborales");
  }
  if (hasAny(["condiciones laborales", "salario", "salarios", "jornada", "temporalidad", "contrato", "contratos"])) {
    addVi("las condiciones laborales");
  }
  if (hasAny(["familia", "familiares", "hogar", "padres", "madres", "dinámicas familiares", "dinamicas familiares", "causas familiares", "apoyo familiar"])) {
    addVi("las dinámicas familiares y redes de apoyo");
  }
  if (hasAny(["masculinidad", "masculinidades", "machismo", "patriarcado", "patriarcal"])) {
    addVi("los modelos de masculinidad");
  }
  if (hasAny(["poder de género", "poder de genero", "dominación de género", "dominacion de genero", "control patriarcal"])) {
    addVi("las relaciones de poder de género");
  }
  if (hasAny(["clase social", "exclusión social", "exclusion social", "desigualdad social", "desigualdades sociales"])) {
    addVi("la posición de clase y la exclusión social");
  }
  if (skContienePatron(l, "tiktok")) addVi("TikTok como plataforma de socialización política");
  if (hasAny(["algoritmos de recomendación", "algoritmos de recomendacion"])) {
    addVi("los algoritmos de recomendación");
  } else if (hasAny(["algoritmo", "algoritmos"])) {
    addVi("las mediaciones algorítmicas");
  }
  if (hasAny(["redes sociales", "internet", "digital", "plataformas"])) addVi("las plataformas digitales");
  if (hasAny(["miedo", "ansiedad", "ira", "emociones", "afectos", "vergüenza", "verguenza"])) addVi("las disposiciones emocionales");
  if (hasAny(["ayuntamiento", "institución", "institucion", "administración", "administracion", "servicios sociales"])) addVi("las mediaciones institucionales");

  // 3) Patrones relacionales y causales, normalizados
  const mRel = l.match(/relaci[oó]n\s+(?:que\s+existe\s+)?entre\s+(.+?)\s+y\s+(.+?)(?:\s+de\s+los|\s+de\s+las|\s+entre\s+|\s+en\s+|[?.!,]|$)/);
  if (mRel) {
    const a = mRel[1].trim().replace(/^[¿?\s]+|[¿?\s]+$/g, "");
    const b = mRel[2].trim().replace(/^[¿?\s]+|[¿?\s]+$/g, "");
    const normFrag = (x) => {
      if (["pobreza energética", "pobreza energetica"].some(t => x.includes(t))) return "la pobreza energética";
      if (["trabajos precarios", "empleos precarios", "empleo precario", "precariedad laboral"].some(t => x.includes(t))) return "la precariedad laboral";
      if (x.includes("bajo nivel de instrucción") || x.includes("bajo nivel de instruccion")) return "el bajo nivel de instrucción";
      if (x.includes("nivel de instrucción") || x.includes("nivel de instruccion")) return "el nivel de instrucción";
      if (x.includes("nivel educativo")) return "el nivel educativo";
      return x;
    };
    const A = normFrag(a);
    const B = normFrag(b);
    const esProblema = (x) => ["pobreza energética", "precariedad", "violencia", "abandono", "desempleo", "exclusión", "exclusion", "soledad", "radicalización", "radicalizacion", "salud mental", "malestar"].some(t => x.includes(t));
    if (esProblema(A) && !esProblema(B)) { addVd(A); addVi(B); }
    else if (esProblema(B) && !esProblema(A)) { addVd(B); addVi(A); }
    else { addVi(A); addVd(B); }
  }

  const m = l.match(/c[oó]mo\s+(?:influyen|afectan|inciden)\s+(.+?)\s+(?:en|sobre|a)\s+(?:la|el|los|las)?\s*(.+?)(?:\s+en\s+|[?.!,]|$)/);
  if (m) {
    const causas = m[1].trim().replace(/^[¿?\s]+|[¿?\s]+$/g, "");
    const efecto = m[2].trim().replace(/^[¿?\s]+|[¿?\s]+$/g, "");
    for (let c of causas.split(/\s+y\s+|,/)) {
      c = c.trim();
      if (c) addVi(c);
    }
    if (efecto) {
      if (efecto.includes("radicalización") || efecto.includes("radicalizacion")) {
        addVd(efecto.includes("juvenil") ? "la radicalización política juvenil" : "la radicalización política");
      } else if (efecto.includes("pobreza energética") || efecto.includes("pobreza energetica")) {
        addVd("la pobreza energética");
      } else if (vd.length === 0) {
        addVd(efecto);
      }
    }
  }

  // 4) Inferencias para preguntas descriptivas tipo "cómo se distribuyen..."
  if (hasAny(["cómo se distribuyen", "como se distribuyen", "distribución", "distribucion"])) {
    if (hasAny(["pobreza energética", "pobreza energetica"])) {
      addVd("la pobreza energética");
      if (hasAny(["barrio", "barrios", "perifer"])) addVi("la localización periférica y la segregación territorial");
      addVi("las condiciones económicas del hogar");
      addVi("las condiciones residenciales y energéticas del hogar");
    }
  }

  // 5) Fallbacks nunca genéricos: inferir por dominio sustantivo.
  if (vd.length === 0) {
    if (hasAny(["pobreza"])) addVd("la pobreza");
    else if (hasAny(["trabajo", "empleo", "laboral"])) addVd("la situación laboral");
    else if (hasAny(["educación", "educacion"])) addVd("la trayectoria educativa");
    else if (hasAny(["política", "politica", "voto", "partido"])) addVd("la orientación política");
    else if (hasAny(["cultura", "identidad"])) addVd("la construcción identitaria");
    else addVd("el fenómeno social estudiado");
  }
  const MOTIVO_CANDIDATA = "candidata sugerida por la literatura sobre este dominio — no aparece literalmente en tu texto; revísala y adáptala";
  let viEsCandidato = false;
  if (vi.length === 0) {
    for (const c of candidatosViPorDominio(vd.length ? vd[0] : "")) addVi(c, MOTIVO_CANDIDATA);
    viEsCandidato = true;
  }

  // Limpieza final: eliminar comodines heredados si hay variables reales.
  vi = vi.filter(x => !["las desigualdades estructurales", "las condiciones sociales explicativas"].includes(x));
  vd = vd.filter(x => x !== "el problema social formulado");
  if (vi.length === 0) { for (const c of candidatosViPorDominio(vd.length ? vd[0] : "")) addVi(c, MOTIVO_CANDIDATA); viEsCandidato = true; }
  if (vd.length === 0) addVd("el fenómeno social estudiado");

  return { vi, vd, viEsCandidato, motivosVi, motivosVd };
}

/**
 * Cuando el problema no nombra explícitamente ningún factor explicativo,
 * en vez de un comodín vacío se sugieren VI concretas, informadas por la
 * literatura sociológica sobre ese fenómeno. Son candidatas a revisar y
 * adaptar, no variables extraídas literalmente del texto del usuario.
 */
function candidatosViPorDominio(vd0) {
  const v = (vd0 || "").toLowerCase();

  if (v.includes("violencia de género") || v.includes("violencia de genero") || v === "la violencia") {
    return ["las actitudes hacia los roles de género y el control en la pareja", "la exposición a modelos de masculinidad hegemónica", "el historial de violencia en la familia de origen"];
  }
  if (v.includes("precariedad laboral")) {
    return ["el nivel de instrucción o cualificación profesional", "la segmentación del mercado laboral local", "las cargas familiares y de cuidado"];
  }
  if (v.includes("pobreza energética")) {
    return ["los ingresos disponibles del hogar", "la eficiencia energética de la vivienda", "la localización territorial y el acceso a ayudas"];
  }
  if (v.includes("pobreza")) {
    return ["el nivel de ingresos y la situación laboral del hogar", "el nivel educativo alcanzado", "la composición y el tamaño del hogar"];
  }
  if (v.includes("abandono escolar") || v.includes("absentismo") || v.includes("rendimiento académico") || v.includes("fracaso escolar")) {
    return ["el nivel socioeconómico y cultural de la familia", "el clima de aula y la relación con el profesorado", "las expectativas educativas familiares"];
  }
  if (v.includes("desempleo") || v === "la situación laboral") {
    return ["el nivel de cualificación", "la edad y la experiencia laboral previa", "el sector de actividad y su ciclo económico"];
  }
  if (v.includes("soledad")) {
    return ["el tamaño y la densidad de la red de apoyo social", "la frecuencia de contacto con familiares y amigos", "la participación en actividades comunitarias"];
  }
  if (v.includes("percepción de inseguridad") || v.includes("percepcion de inseguridad")) {
    return ["la exposición directa o mediática a hechos delictivos", "el deterioro percibido del entorno físico del barrio", "la cohesión social del vecindario"];
  }
  if (v.includes("radicalización") || v.includes("radicalizacion")) {
    return ["la exposición a contenidos polarizados en redes sociales", "el sentimiento de agravio o exclusión social", "la pertenencia a grupos o comunidades identitarias"];
  }
  if (v.includes("malestar") || v.includes("salud mental") || v === "los problemas de salud") {
    return ["el nivel de apoyo social percibido", "la exposición a situaciones de estrés crónico", "las condiciones económicas del hogar"];
  }
  if (v.includes("exclusión digital") || v.includes("exclusion digital")) {
    return ["la edad", "el nivel de renta del hogar", "el nivel educativo"];
  }
  if (v.includes("participación social") || v.includes("participacion social") || v.includes("integración social") || v.includes("integracion social")) {
    return ["el nivel de arraigo territorial", "la pertenencia a asociaciones o redes comunitarias", "el dominio del idioma o el tiempo de residencia"];
  }
  if (v.includes("delincuencia") || v.includes("criminalidad")) {
    return ["las oportunidades económicas y educativas disponibles", "el control social informal en el barrio", "la exposición a pares con conductas desviadas"];
  }
  if (v.includes("orientación política") || v.includes("orientacion politica")) {
    return ["el nivel educativo", "la posición socioeconómica", "la exposición a medios de comunicación e información política"];
  }
  if (v.includes("construcción identitaria") || v.includes("construccion identitaria")) {
    return ["el contexto familiar y comunitario de socialización", "la exposición a referentes culturales y mediáticos", "la pertenencia a grupos de pares"];
  }
  if (v.includes("discriminación hacia la población migrante") || v.includes("discriminacion hacia la poblacion migrante")) {
    return ["el estatus administrativo y el acceso a la regularización", "el país o región de origen y su carga simbólica en el contexto receptor", "el tiempo de residencia y el dominio del idioma"];
  }
  if (v.includes("población migrante") || v.includes("poblacion migrante")) {
    return ["el estatus administrativo y el acceso a la regularización", "las redes sociales de apoyo en el país de destino", "las barreras lingüísticas y de reconocimiento de titulaciones"];
  }
  if (v.includes("personas con discapacidad")) {
    return ["las barreras de accesibilidad del entorno", "el acceso a recursos de apoyo y adaptación", "las actitudes sociales e institucionales hacia la discapacidad"];
  }
  if (v.includes("vulnerabilidad social frente al cambio climático") || v.includes("vulnerabilidad social frente al cambio climatico") || v.includes("vulnerabilidad ambiental")) {
    return ["el nivel socioeconómico y el acceso a recursos de adaptación", "la exposición territorial a riesgos ambientales", "el acceso a la información y la educación ambiental"];
  }
  if (v.includes("despoblación rural") || v.includes("despoblacion rural") || v.includes("mundo rural")) {
    return ["la falta de oportunidades laborales y servicios básicos", "el envejecimiento poblacional y el reemplazo generacional", "la conectividad digital y de transporte"];
  }
  if (v.includes("secularización") || v.includes("secularizacion") || v.includes("religiosidad")) {
    return ["la socialización familiar y comunitaria en la fe", "el nivel educativo y la exposición a pluralismo cultural", "la pertenencia generacional"];
  }
  if (v.includes("discriminación hacia personas lgtbiq") || v.includes("discriminacion hacia personas lgtbiq") || v.includes("aceptación social de la diversidad sexual") || v.includes("aceptacion social de la diversidad sexual")) {
    return ["el rechazo familiar y social percibido", "la visibilidad y el reconocimiento legal", "el acceso a espacios seguros y redes de apoyo"];
  }
  if (v.includes("edadismo") || v.includes("condiciones de vida en la vejez")) {
    return ["el estado de salud funcional y la dependencia", "las redes familiares y de cuidado", "los recursos económicos y la pensión"];
  }
  if (v.includes("delincuencia")) {
    return ["la asociación diferencial con pares desviados", "el control social informal del entorno", "la etiqueta social y la estigmatización institucional"];
  }
  if (v.includes("desinformación") || v.includes("desinformacion") || v.includes("influencia de los medios de comunicación") || v.includes("influencia de los medios de comunicacion")) {
    return ["la exposición a medios y su credibilidad percibida", "el consumo selectivo de fuentes afines (cámara de eco)", "la alfabetización mediática"];
  }
  if (v.includes("consumo ostentoso") || v.includes("pautas de consumo social")) {
    return ["la posición de clase y el capital económico", "la búsqueda de distinción social", "la exposición a la publicidad y las redes sociales"];
  }
  if (v.includes("clima organizacional") || v.includes("funcionamiento organizacional")) {
    return ["el diseño formal y la jerarquía organizacional", "la cultura y el clima organizacional", "los incentivos y sistemas de control"];
  }
  return ["variables sociodemográficas básicas (edad, sexo, nivel educativo, situación laboral)", "el contexto territorial e institucional del problema"];
}

/* ================= área sociológica y subdominios ================= */

function detectarAreaSociologica(lower, vi, vd, motivosOut) {
  const l0 = lower || "";
  const l = l0 + " " + vi.concat(vd).join(" ").toLowerCase();
  const areas = [];
  const motivos = motivosOut || {};
  const add = (a) => {
    if (!areas.includes(a)) areas.push(a);
    if (!motivos[a] && ultimoMotivo) motivos[a] = ultimoMotivo;
  };
  let ultimoMotivo = null;
  const hasAny = (words) => {
    const m = skContieneAlgunoTrack(l, words);
    ultimoMotivo = m;
    return !!m;
  };

  if (hasAny(["pobreza energética", "pobreza energetica", "pobreza", "exclusión social", "exclusion social", "condiciones económicas", "condiciones economicas"])) add("Sociología de la pobreza y la desigualdad");
  if (hasAny(["energética", "energetica", "vivienda", "residencial", "habitacional", "suministro energético", "suministro energetico"])) add("Sociología de la vivienda y la energía");
  if (hasAny(["jóvenes", "jovenes", "juventud", "juvenil", "adolescentes", "18 a 25"])) add("Sociología de la juventud");
  if (hasAny(["violencia de género", "violencia de genero", "género", "genero", "mujer", "mujeres", "hombres", "varones", "masculinidad", "masculinidades", "machismo", "patriarcado"])) add("Sociología de género");
  if (hasAny(["familia", "familiares", "hogar", "dinámicas familiares", "dinamicas familiares", "padres", "madres"])) add("Sociología de la familia");
  if (hasAny(["educación", "educacion", "escuela", "abandono escolar", "deserción", "desercion", "fracaso escolar", "nivel de instrucción", "nivel de instruccion", "nivel educativo", "capital cultural"])) add("Sociología de la educación");
  if (hasAny(["trabajo", "empleo", "laboral", "paro", "desempleo", "salario", "oportunidades laborales", "precariedad laboral"])) add("Sociología del trabajo");
  if (hasAny(["salud", "enfermedad", "ansiedad", "depresión", "depresion", "malestar emocional"])) add("Sociología de la salud");
  if (hasAny(["emociones", "afectos", "miedo", "ira", "soledad"])) add("Sociología de las emociones");
  if (hasAny(["cultura", "identidad", "representaciones", "valores", "etnia", "étnica", "etnica", "gitano", "gitana", "gitanos", "gitanas", "romaní", "romani", "minoría étnica", "minoria etnica", "grupo étnico", "grupo etnico", "tribu étnica", "tribu etnica", "indígena", "indigena", "afrodescendiente", "racializad", "grupo cultural"])) add("Sociología de la cultura");
  if (hasAny(["política", "politica", "voto", "partido", "hegemonía", "hegemonia", "radicalización", "radicalizacion"])) add("Sociología política");
  if (hasAny(["conocimiento", "normalidad", "sentido común", "sentido comun", "cognitivo"])) add("Sociología del conocimiento");
  {
    const palabrasBarrio = ["barrio", "barrios", "vecindario", "segregación territorial", "segregacion territorial", "segregación urbana", "segregacion urbana", "gentrificación", "gentrificacion", "desigualdad urbana", "estigma territorial", "periferia", "periférico", "periferico", "periféricos", "perifericos"];
    const encontrada = palabrasBarrio.find(x => l0.includes(x));
    if (encontrada) { ultimoMotivo = encontrada; add("Sociología urbana"); }
  }
  if (hasAny(["digital", "internet", "algoritmo", "redes sociales", "brecha digital", "tiktok"])) add("Sociología digital y algorítmica");
  if (hasAny(["migración", "migracion", "inmigración", "inmigracion", "migrante", "migrantes", "refugiados", "refugiadas", "asilo"])) add("Sociología de las migraciones");
  if (hasAny(["discapacidad", "diversidad funcional", "accesibilidad", "dependencia funcional"])) add("Sociología de la discapacidad");
  if (hasAny(["cambio climático", "cambio climatico", "medio ambiente", "sostenibilidad", "contaminación", "contaminacion", "crisis climática", "crisis climatica"])) add("Sociología ambiental");
  if (hasAny(["rural", "ruralidad", "despoblación", "despoblacion", "éxodo rural", "exodo rural"])) add("Sociología rural");
  if (hasAny(["religión", "religion", "religiosidad", "secularización", "secularizacion", "creencias religiosas"])) add("Sociología de la religión");
  if (hasAny(["lgtbi", "lgtbiq", "lgbt", "diversidad sexual", "orientación sexual", "orientacion sexual", "identidad de género", "identidad de genero", "homofobia", "transfobia", "personas trans", "bisexual", "homosexual", "queer"])) add("Sociología de la sexualidad y la diversidad sexual");
  if (hasAny(["envejecimiento", "vejez", "personas mayores", "tercera edad", "adultos mayores", "edadismo", "gerontología", "gerontologia"])) add("Sociología del envejecimiento");
  if (hasAny(["delincuencia", "criminalidad", "conducta desviada", "desviación social", "desviacion social", "reincidencia"])) add("Criminología y sociología de la desviación");
  if (hasAny(["medios de comunicación", "medios de comunicacion", "desinformación", "desinformacion", "fake news", "bulos", "opinión pública", "opinion publica", "framing", "agenda mediática", "agenda mediatica"])) add("Sociología de la comunicación y los medios");
  if (hasAny(["consumo", "consumismo", "estilo de vida", "estilos de vida", "publicidad", "marca", "marcas"])) add("Sociología del consumo");
  if (hasAny(["organización", "organizacion", "organizaciones", "burocracia", "cultura organizacional", "clima organizacional", "gestión empresarial", "gestion empresarial"])) add("Sociología de las organizaciones");

  if (areas.length === 0) {
    ultimoMotivo = "ningún término de dominio reconocible en el texto; área general por defecto";
    add("Sociología general / del cambio social");
  }
  return areas.slice(0, 5);
}

function detectarSubdominios(areas, vi, vd, lower) {
  let subs = [];
  if (areas.some(a => a.toLowerCase().includes("educación"))) {
    subs = subs.concat(["trayectorias escolares", "clima de aula", "capital cultural familiar", "currículum oculto y expectativas institucionales"]);
  }
  if (areas.some(a => a.toLowerCase().includes("familia"))) {
    subs = subs.concat(["microinteracciones del hogar", "soporte parental", "tensiones afectivas", "roles de género en la crianza"]);
  }
  if (areas.some(a => a.toLowerCase().includes("urbana")) || skContieneAlguno(lower, ["barrio", "vecindario", "segregación", "gentrificación"])) {
    subs = subs.concat(["estigma territorial", "gentrificación", "segregación espacial y escolar"]);
  }
  if (areas.some(a => a.toLowerCase().includes("género")) || skContieneAlguno(lower, ["masculinidad", "masculinidades", "feminidad", "feminidades"])) {
    subs = subs.concat(["habitus viril", "performatividad de género", "socialización emocional"]);
  }
  return uniq(subs);
}

/* ================= preguntas, correlaciones, hipótesis ================= */

function construirPreguntas(vi, vd, contexto, poblacion, areas) {
  const viReales = vi.filter(x => !["las desigualdades estructurales", "las condiciones sociales explicativas"].includes(x));
  const viStr = viReales.length ? viReales.join(", ") : "las condiciones sociales del contexto";
  const vdStr = vd.length ? vd[0] : "el fenómeno social estudiado";
  const sujeto = poblacion || "la población de estudio";
  const ctx = contexto || "el contexto de estudio";
  const areaTxt = areas.join(" ").toLowerCase();
  const vdLower = vdStr.toLowerCase();

  if (vdLower.includes("pobreza energética")) {
    return [
      `¿Cómo se distribuye ${vdStr} entre ${sujeto} en ${ctx} durante 2025?`,
      `¿Qué relación existe entre condiciones económicas del hogar, condiciones residenciales y localización territorial con ${vdStr} entre ${sujeto} en ${ctx} durante 2025?`,
      `¿Cómo interactúan desigualdad territorial, recursos económicos del hogar y condiciones de vivienda en la reproducción de ${vdStr} entre ${sujeto} en ${ctx}?`
    ];
  }
  if (vdLower.includes("precariedad laboral") && viReales.some(x => x.includes("instrucción") || x.includes("educativo") || x.includes("educación"))) {
    const viEdu = viReales.find(x => x.includes("instrucción") || x.includes("educativo") || x.includes("educación")) || viReales[0];
    return [
      `¿Qué relación existe entre ${viEdu} y ${vdStr} entre ${sujeto} en ${ctx} en 2025?`,
      `¿En qué medida ${viEdu} influye en la probabilidad de inserción en empleos precarios entre ${sujeto} en ${ctx} en 2025?`,
      `¿Cómo se articulan desigualdad educativa, género y segmentación del mercado laboral en la reproducción de ${vdStr} entre ${sujeto} en ${ctx} en 2025?`
    ];
  }
  if (vdLower.includes("radicalización") || vdLower.includes("radicalizacion")) {
    return [
      `¿Qué patrones de exposición digital y social se asocian con ${vdStr} entre ${sujeto} en ${ctx} en 2025?`,
      `¿Cómo influyen ${viStr} en la configuración de ${vdStr} entre ${sujeto} en ${ctx} en 2025?`,
      `¿Cómo se articulan plataformas digitales, mediaciones algorítmicas, identidad juvenil y polarización política en la producción de ${vdStr}?`
    ];
  }
  if (vdLower.includes("salud mental") || vdLower.includes("malestar")) {
    return [
      `¿Qué distribución social presenta ${vdStr} entre ${sujeto} en ${ctx} en 2025?`,
      `¿Cómo influyen ${viStr} en la aparición o agravamiento de ${vdStr} entre ${sujeto} en ${ctx} en 2025?`,
      `¿Cómo se articulan ${viStr}, redes de apoyo y acceso a recursos sociosanitarios en la producción desigual de ${vdStr} en ${ctx} en 2025?`
    ];
  }
  if (vdLower.includes("violencia de género")) {
    return [
      `¿Qué distribución social y relacional presenta ${vdStr} entre ${sujeto} en ${ctx} en 2025?`,
      `¿Cómo influyen ${viStr} en la reproducción de ${vdStr} en ${ctx} en 2025?`,
      `¿Cómo se articulan normas patriarcales, relaciones de poder y respuesta institucional en la reproducción de ${vdStr} en ${ctx} en 2025?`
    ];
  }
  if (areaTxt.includes("educación") || areaTxt.includes("educacion")) {
    return [
      `¿Qué relación observable existe entre ${viStr} y ${vdStr} entre ${sujeto} en ${ctx} en 2025?`,
      `¿Cómo influyen ${viStr} en la configuración de ${vdStr} entre ${sujeto} en ${ctx} en 2025?`,
      `¿Cómo se articulan ${viStr}, desigualdades educativas y recursos institucionales en la producción de ${vdStr} en ${ctx} en 2025?`
    ];
  }
  return [
    `¿Cómo se manifiesta ${vdStr} entre ${sujeto} en ${ctx} en 2025?`,
    `¿Cómo influyen ${viStr} en la configuración de ${vdStr} entre ${sujeto} en ${ctx} en 2025?`,
    `¿Cómo se articulan ${viStr} y ${vdStr} con desigualdades sociales, territoriales o institucionales en ${ctx} en 2025?`
  ];
}

function construirCorrelaciones(vi, vd, contexto) {
  const vd0 = vd.length ? vd[0] : "el fenómeno social estudiado";
  const ctx = contexto || "el contexto de estudio";
  const out = [];
  const add = (x) => { if (!out.includes(x)) out.push(x); };

  if (vd0.toLowerCase().includes("pobreza energética")) {
    add(`- Estimar la asociación entre ingresos del hogar y ${vd0} en ${ctx}.`);
    add(`- Analizar si las condiciones residenciales y energéticas del hogar incrementan la intensidad de ${vd0} en ${ctx}.`);
    add(`- Comparar la distribución de ${vd0} entre barrios periféricos y otras zonas urbanas de ${ctx}.`);
    add(`- Explorar si edad, dependencia familiar y posición socioeconómica modulan la exposición a ${vd0}.`);
    return out;
  }
  for (const x of vi) {
    const xl = x.toLowerCase();
    if (xl.includes("instrucción") || xl.includes("educativo") || xl.includes("educación")) {
      if (vd0.toLowerCase().includes("precariedad laboral")) {
        add(`- Analizar si menores niveles educativos se asocian con una mayor probabilidad de empleo precario en ${ctx}.`);
      } else {
        add(`- Analizar la asociación entre ${x} y ${vd0} en ${ctx}.`);
      }
    } else if (xl.includes("plataformas") || xl.includes("algor") || xl.includes("tiktok")) {
      add(`- Explorar si ${x} incrementa la exposición, frecuencia o intensidad de ${vd0} en ${ctx}.`);
    } else {
      add(`- Estimar la relación entre ${x} y ${vd0} en ${ctx}.`);
    }
  }
  if (vi.length >= 2) {
    add(`- Contrastar si la combinación entre ${vi[0]} y ${vi[1]} intensifica o reduce ${vd0} en ${ctx}.`);
  }
  return out.slice(0, 5);
}

function construirHipotesis(vi, vd, contexto, poblacion) {
  const sujeto = poblacion || "la población de estudio";
  const vd0 = vd.length ? vd[0] : "el fenómeno social estudiado";
  const ctx = contexto || "el contexto de estudio";

  if (vd0.toLowerCase().includes("pobreza energética")) {
    return [
      `H1. En ${ctx}, entre ${sujeto}, menores recursos económicos del hogar se asociarán con mayor probabilidad de ${vd0}.`,
      `H2. Las condiciones residenciales deficientes y la localización periférica intensificarán la exposición a ${vd0}.`,
      `H3. La combinación de bajos ingresos, vivienda ineficiente y menor acceso a ayudas institucionales producirá una acumulación de vulnerabilidad energética.`
    ];
  }
  if (vd0.toLowerCase().includes("precariedad laboral") && vi.some(x => x.toLowerCase().includes("instrucción") || x.toLowerCase().includes("educativo"))) {
    const edu = vi.find(x => x.toLowerCase().includes("instrucción") || x.toLowerCase().includes("educativo")) || vi[0];
    return [
      `H1. En ${ctx}, entre ${sujeto}, ${edu} se asociará con una mayor probabilidad de inserción en empleos precarios.`,
      `H2. La relación entre educación y precariedad laboral será más intensa cuando coincidan segmentación del mercado de trabajo, baja cualificación reconocida y menor capacidad de negociación laboral.`,
      `H3. La condición de género modulará la relación entre trayectoria educativa y empleo precario, al producir expectativas laborales diferenciadas y formas específicas de vulnerabilidad sociolaboral.`
    ];
  }
  // Caso general: una hipótesis específica por cada variable independiente
  // detectada (hasta 4), en vez de un texto genérico — así el problema
  // formulado por el estudiante (sean 1, 2, 3 o más VI) queda reflejado
  // hipótesis por hipótesis, no fundido en una frase única.
  const viParaHipotesis = vi.length ? vi : ["las condiciones sociales del contexto"];
  const hips = viParaHipotesis.slice(0, 4).map((v, i) =>
    `H${i + 1}. En ${ctx}, entre ${sujeto}, ${v} se asociará con cambios significativos en ${vd0}.`
  );
  if (viParaHipotesis.length >= 2) {
    const combinadas = viParaHipotesis.slice(0, 3);
    hips.push(`H${hips.length + 1}. La combinación de ${skJoin(combinadas)} intensificará conjuntamente la presencia de ${vd0} en ${ctx}, más allá del efecto de cada factor por separado.`);
  } else {
    hips.push(`H${hips.length + 1}. La combinación de factores sociales, institucionales y territoriales intensificará la presencia de ${vd0} en ${ctx}.`);
  }
  return hips;
}

/* ================= versión cualitativa de preguntas/relaciones/proposiciones =================
 * VI/VD, "correlaciones" e "hipótesis" (H1, "se asociará con cambios
 * significativos") son vocabulario del paradigma cuantitativo — ligado a
 * medir asociaciones entre variables operacionalizadas. La tradición
 * cualitativa (teoría fundamentada, fenomenología, etnografía interpretativa)
 * no habla de variables en ese sentido, sino de un fenómeno central,
 * condiciones (causales, contextuales), procesos y significados — el
 * "modelo de paradigma" de Strauss & Corbin. Estas tres funciones son el
 * equivalente cualitativo de construirPreguntas/construirCorrelaciones/
 * construirHipotesis: mismo vi/vd de entrada (siguen siendo lo que el motor
 * detectó), pero sin lenguaje relacional-causal ni de hipótesis estadística.
 * analizarProblema() elige unas u otras según resultado.enfoque; cuantitativo
 * y mixto no cambian. */

function construirPreguntasCualitativas(vi, vd, contexto, poblacion, areas) {
  const viReales = vi.filter(x => !["las desigualdades estructurales", "las condiciones sociales explicativas"].includes(x));
  const condStr = viReales.length ? viReales.join(", ") : "las condiciones del contexto";
  const fenomenoStr = vd.length ? vd[0] : "el fenómeno social estudiado";
  const sujeto = poblacion || "las personas participantes";
  const ctx = contexto || "el contexto de estudio";

  return [
    `¿Cómo experimentan y dan sentido ${sujeto} a ${fenomenoStr} en ${ctx}?`,
    `¿Qué significados atribuyen ${sujeto} a la relación entre ${condStr} y ${fenomenoStr} en ${ctx}?`,
    `¿Qué procesos o mecanismos vinculan ${condStr} con ${fenomenoStr}, desde la perspectiva de ${sujeto} en ${ctx}?`
  ];
}

function construirRelacionesCualitativas(vi, vd, contexto) {
  const vd0 = vd.length ? vd[0] : "el fenómeno social estudiado";
  const ctx = contexto || "el contexto de estudio";
  const out = [];
  const add = (x) => { if (!out.includes(x)) out.push(x); };

  for (const x of vi) {
    add(`- Explorar la relación entre ${x} y ${vd0}, desde la experiencia de las personas participantes, en ${ctx}.`);
  }
  if (vi.length >= 2) {
    add(`- Indagar cómo interactúan ${vi[0]} y ${vi[1]} en la configuración de ${vd0} para las personas participantes.`);
  }
  if (out.length === 0) add(`- Explorar los significados y procesos sociales asociados a ${vd0} en ${ctx}.`);
  return out.slice(0, 5);
}

function construirProposicionesCualitativas(vi, vd, contexto, poblacion) {
  const sujeto = poblacion || "las personas participantes";
  const vd0 = vd.length ? vd[0] : "el fenómeno social estudiado";
  const ctx = contexto || "el contexto de estudio";
  const props = [];

  if (vi.length) {
    props.push(`P1. Es previsible que ${sujeto} en ${ctx} construyan el sentido de ${vd0} en relación con ${vi[0]}, aunque el análisis debe permanecer abierto a categorías emergentes no anticipadas por esta proposición.`);
  } else {
    props.push(`P1. Es previsible que ${sujeto} en ${ctx} atribuyan a ${vd0} significados diversos, vinculados a su propia trayectoria y posición social.`);
  }
  props.push(`P2. Los procesos que vinculan las condiciones identificadas con ${vd0} probablemente varíen según la trayectoria biográfica, la posición social o el contexto institucional de ${sujeto}.`);
  if (vi.length >= 2) {
    props.push(`P3. La combinación de ${vi[0]} y ${vi[1]} podría configurar experiencias de ${vd0} que un análisis centrado en un solo factor no captaría.`);
  }
  return props;
}

/**
 * Vocabulario y títulos de sección que cambian según el enfoque
 * metodológico detectado — sobre todo para no forzar lenguaje de VI/VD y
 * asociación estadística sobre un diseño cualitativo (ver las tres
 * funciones de arriba). Cuantitativo y mixto usan el vocabulario de
 * siempre; solo cualitativo diverge.
 */
function etiquetasEnfoque(enfoque) {
  if (enfoque === "cualitativo") {
    return {
      esCualitativo: true,
      vi: "condición explicativa", vd: "fenómeno central",
      viTitulo: "Condiciones explicativas", vdTitulo: "Fenómeno central",
      viListaTitulo: "Condiciones explicativas sugeridas:", vdListaTitulo: "Fenómeno central sugerido:",
      seccionVariables: "Fenómeno central y condiciones explicativas",
      correlacionesTitulo: "Relaciones a explorar",
      hipotesisTitulo: "Proposiciones orientadoras",
      p2Etiqueta: "Comprensiva / interpretativa",
      notaVariables: "En un diseño cualitativo no se habla de variable independiente/dependiente en sentido estadístico: SOCIOKAIROS distingue igualmente un fenómeno central (lo que se busca comprender) de las condiciones que lo explican, pero ambos se entienden como categorías a explorar en profundidad, no como magnitudes a medir.",
    };
  }
  return {
    esCualitativo: false,
    vi: "variable independiente (VI)", vd: "variable dependiente (VD)",
    viTitulo: "Variables independientes (VI)", vdTitulo: "Variables dependientes (VD)",
    viListaTitulo: "VI sugeridas (factores explicativos):", vdListaTitulo: "VD sugeridas (fenómenos a explicar):",
    seccionVariables: "Variables (VI / VD)",
    correlacionesTitulo: "Correlaciones a explorar",
    hipotesisTitulo: "Hipótesis de trabajo",
    p2Etiqueta: "Relacional / explicativa",
    notaVariables: "",
  };
}

/* ================= operacionalización (con nivel de medición) ================= */

function indicadoresParaVariable(nombre, tipo) {
  const lower = nombre.toLowerCase();

  if (lower.includes("pobreza energética") || lower.includes("pobreza energetica")) {
    return { variable: nombre, tipo, indicador: "Tasa / escala de pobreza energética: incapacidad para mantener temperatura adecuada, retrasos en pago de suministros o gasto energético desproporcionado", unidad: "Porcentaje / escala compuesta", nivel: "De razón (proporción) u ordinal (escala compuesta)", fuente: "Encuesta a hogares, registros municipales, INE/EAPN/indicadores de vulnerabilidad energética" };
  }
  if (lower.includes("condiciones económicas") || lower.includes("condiciones economicas") || lower.includes("ingresos")) {
    return { variable: nombre, tipo, indicador: "Renta disponible, ingresos del hogar, dificultad para afrontar gastos básicos", unidad: "Euros / tramo de renta / escala de dificultad económica", nivel: "De razón (euros) u ordinal (tramos/escala)", fuente: "Encuesta a hogares, INE, servicios sociales municipales" };
  }
  if (lower.includes("residenciales") || lower.includes("energéticas") || lower.includes("energeticas") || lower.includes("vivienda")) {
    return { variable: nombre, tipo, indicador: "Calidad de vivienda, eficiencia térmica, gasto energético, cortes o retrasos en suministros", unidad: "Índice / porcentaje / escala", nivel: "Ordinal (índice) o de razón (porcentaje)", fuente: "Encuesta a hogares, registros de vivienda, indicadores municipales" };
  }
  if (lower.includes("localización periférica") || lower.includes("localizacion periferica") || lower.includes("segregación territorial") || lower.includes("segregacion territorial")) {
    return { variable: nombre, tipo, indicador: "Residencia en barrio periférico, distancia a recursos y concentración territorial de vulnerabilidad", unidad: "Barrio / sección censal / índice territorial", nivel: "Nominal (barrio) u ordinal (índice territorial)", fuente: "Padrón, atlas urbano, observatorios municipales" };
  }

  if (lower.includes("violencia de género") || lower.includes("violencia de genero")) {
    return { variable: nombre, tipo, indicador: "Índice de violencia de género (frecuencia y gravedad de episodios en los últimos 12 meses)", unidad: "Puntuación compuesta / número de episodios", nivel: "De razón si se cuentan episodios; ordinal si se usa el índice compuesto", fuente: "Registros especializados, cuestionarios validados o macroencuestas de violencia de género" };
  }
  if (lower.includes("género") && !lower.includes("violencia")) {
    return { variable: nombre, tipo, indicador: "Índice de desigualdad de género en la relación (toma de decisiones, control económico, reparto de cuidados)", unidad: "Puntuación en escala (1–5 / 1–10)", nivel: "Ordinal (escala tipo Likert)", fuente: "Cuestionario a población objetivo / escalas de roles de género" };
  }
  if (lower.includes("dinámicas familiares") || lower.includes("dinamicas familiares") || lower.includes("condiciones y dinámicas")) {
    return { variable: nombre, tipo, indicador: "Escala de conflictividad y control familiar (frecuencia de conflictos, control coercitivo, apoyo percibido)", unidad: "Puntuación en escala (1–5 / 1–10)", nivel: "Ordinal (escala tipo Likert)", fuente: "Cuestionario a miembros del hogar / entrevistas estructuradas" };
  }

  if (lower.includes("pobreza") || lower.includes("exclusión") || lower.includes("exclusion")) {
    return { variable: nombre, tipo, indicador: "Índice de privación material (ingresos, gastos fijos, retrasos de pago, capacidad para imprevistos)", unidad: "Puntuación en índice / umbral de pobreza", nivel: "De intervalo/razón (índice compuesto)", fuente: "Encuestas de condiciones de vida, registros administrativos" };
  }
  if (lower.includes("precariedad") || lower.includes("precarización") || lower.includes("precarizacion")) {
    return { variable: nombre, tipo, indicador: "Indicador de precariedad laboral (temporalidad, parcialidad involuntaria, salario bajo, rotación)", unidad: "Índice / % de trabajadores en situación precaria", nivel: "De razón (proporción)", fuente: "Encuestas de empleo, registros laborales, EPA" };
  }

  if (lower.includes("fracaso escolar") || lower.includes("abandono escolar")) {
    return { variable: nombre, tipo, indicador: "Tasa de abandono / repetición de curso en la población estudiada", unidad: "% de alumnado que abandona o repite", nivel: "De razón (proporción)", fuente: "Registros académicos, estadísticas educativas" };
  }

  if (lower.includes("salud mental") || lower.includes("ansiedad") || lower.includes("depresión") || lower.includes("depresion")) {
    return { variable: nombre, tipo, indicador: "Puntuación en escalas estandarizadas de salud mental (ansiedad, depresión, estrés percibido)", unidad: "Puntuación en escala validada", nivel: "Ordinal (tratada habitualmente como cuasi-intervalo)", fuente: "Cuestionarios clínicos / encuestas de salud" };
  }

  if (lower.includes("delincuencia") || lower.includes("criminalidad")) {
    return { variable: nombre, tipo, indicador: "Tasa de delitos registrados por 10.000 habitantes", unidad: "Número de delitos / 10.000 hab.", nivel: "De razón", fuente: "Estadísticas policiales / registros administrativos" };
  }

  if (lower.includes("población migrante") || lower.includes("poblacion migrante") || lower.includes("discriminación hacia la población migrante") || lower.includes("discriminacion hacia la poblacion migrante")) {
    return { variable: nombre, tipo, indicador: "Situación administrativa, tiempo de residencia y experiencias de discriminación percibida", unidad: "Categórica (situación administrativa) / puntuación en escala (discriminación percibida)", nivel: "Nominal u ordinal según el indicador concreto", fuente: "Encuesta a población migrante, registros de extranjería, ACNUR/OIM" };
  }
  if (lower.includes("estatus administrativo") || lower.includes("regularización") || lower.includes("regularizacion")) {
    return { variable: nombre, tipo, indicador: "Situación administrativa (regular/irregular, tipo de permiso, tiempo hasta la regularización)", unidad: "Categórica", nivel: "Nominal", fuente: "Registros de extranjería, encuesta a población migrante" };
  }
  if (lower.includes("personas con discapacidad") || lower.includes("dependencia funcional")) {
    return { variable: nombre, tipo, indicador: "Grado de discapacidad reconocido y nivel de dependencia funcional", unidad: "Porcentaje de discapacidad reconocida / grado de dependencia", nivel: "Ordinal (grados) o de razón (porcentaje)", fuente: "Encuesta de Discapacidad (EDAD-INE), certificados de discapacidad, servicios sociales" };
  }
  if (lower.includes("barreras de accesibilidad")) {
    return { variable: nombre, tipo, indicador: "Índice de accesibilidad del entorno físico y digital (vivienda, transporte, espacios públicos)", unidad: "Índice / escala compuesta", nivel: "Ordinal", fuente: "Auditorías de accesibilidad, observación estructurada, encuesta a personas usuarias" };
  }
  if (lower.includes("vulnerabilidad social frente al cambio climático") || lower.includes("vulnerabilidad social frente al cambio climatico") || lower.includes("vulnerabilidad ambiental")) {
    return { variable: nombre, tipo, indicador: "Índice de vulnerabilidad climática (exposición, sensibilidad y capacidad de adaptación del hogar/territorio)", unidad: "Índice compuesto / escala", nivel: "Ordinal (índice) o de razón según componente", fuente: "Indicadores ambientales oficiales (Copernicus, IPCC), encuesta a hogares, atlas de vulnerabilidad" };
  }
  if (lower.includes("exposición territorial a riesgos ambientales") || lower.includes("exposicion territorial a riesgos ambientales")) {
    return { variable: nombre, tipo, indicador: "Nivel de exposición territorial a riesgos ambientales (inundación, ola de calor, sequía)", unidad: "Índice de exposición / categoría de riesgo", nivel: "Ordinal", fuente: "Cartografía de riesgos, Copernicus Climate Data Store, protección civil" };
  }
  if (lower.includes("despoblación rural") || lower.includes("despoblacion rural") || lower.includes("mundo rural")) {
    return { variable: nombre, tipo, indicador: "Tasa de variación poblacional y densidad de población del municipio/comarca", unidad: "% de variación anual / habitantes por km²", nivel: "De razón", fuente: "Padrón continuo (INE), Ministerio para el Reto Demográfico" };
  }
  if (lower.includes("envejecimiento poblacional") || lower.includes("reemplazo generacional")) {
    return { variable: nombre, tipo, indicador: "Índice de envejecimiento y tasa de reemplazo generacional del municipio", unidad: "Personas de 65+ por cada 100 menores de 15 / tasa de reemplazo", nivel: "De razón", fuente: "Padrón continuo (INE), estadísticas municipales" };
  }
  if (lower.includes("religiosidad") || lower.includes("secularización") || lower.includes("secularizacion")) {
    return { variable: nombre, tipo, indicador: "Frecuencia de práctica religiosa y autoidentificación como creyente/practicante", unidad: "Escala de frecuencia (nunca–diariamente) / categoría de autoidentificación", nivel: "Ordinal", fuente: "Barómetro CIS, ISSP (International Social Survey Programme), Pew Research" };
  }
  if (lower.includes("discriminación étnica") || lower.includes("discriminacion etnica")) {
    return { variable: nombre, tipo, indicador: "Experiencias percibidas de discriminación por origen étnico o cultural (en la escuela, el empleo, la vivienda)", unidad: "Escala de frecuencia / índice de discriminación percibida", nivel: "Ordinal", fuente: "Encuesta a la población afectada, informes de discriminación (OBERAXE, Fundación Secretariado Gitano)" };
  }
  if (lower.includes("discriminación hacia personas lgtbiq") || lower.includes("discriminacion hacia personas lgtbiq") || lower.includes("aceptación social de la diversidad sexual") || lower.includes("aceptacion social de la diversidad sexual")) {
    return { variable: nombre, tipo, indicador: "Experiencias percibidas de discriminación por orientación sexual o identidad de género; escala de actitudes sociales hacia la diversidad", unidad: "Escala de frecuencia / índice de aceptación social", nivel: "Ordinal", fuente: "Encuesta a población LGTBIQ+, FRA (Agencia de Derechos Fundamentales UE), FELGTBI+" };
  }
  if (lower.includes("rechazo familiar")) {
    return { variable: nombre, tipo, indicador: "Grado de aceptación o rechazo familiar percibido tras la revelación de la orientación/identidad", unidad: "Escala de aceptación (rechazo total–aceptación plena)", nivel: "Ordinal", fuente: "Encuesta a población LGTBIQ+, entrevistas" };
  }
  if (lower.includes("edadismo")) {
    return { variable: nombre, tipo, indicador: "Escala de actitudes edadistas y experiencias de discriminación por edad (empleo, salud, trato social)", unidad: "Escala de frecuencia / índice de edadismo percibido", nivel: "Ordinal", fuente: "Encuesta a personas mayores, informes OMS sobre edadismo" };
  }
  if (lower.includes("condiciones de vida en la vejez") || lower.includes("estado de salud funcional y la dependencia")) {
    return { variable: nombre, tipo, indicador: "Grado de dependencia funcional (actividades básicas/instrumentales de la vida diaria) y estado de salud autopercibido", unidad: "Escala de dependencia (Barthel/Katz) / autopercepción de salud", nivel: "Ordinal", fuente: "IMSERSO, Encuesta de Discapacidad y Dependencia (INE), servicios sociales" };
  }
  if (lower.includes("la delincuencia") || lower === "delincuencia") {
    return { variable: nombre, tipo, indicador: "Tasa de delitos registrados y de reincidencia en la población estudiada", unidad: "Número de delitos / 10.000 hab. · % de reincidencia", nivel: "De razón", fuente: "Estadísticas del Ministerio del Interior, Instituciones Penitenciarias" };
  }
  if (lower.includes("asociación diferencial") || lower.includes("asociacion diferencial") || lower.includes("etiqueta social")) {
    return { variable: nombre, tipo, indicador: "Frecuencia de contacto con pares con conductas desviadas y experiencias de etiquetado institucional", unidad: "Escala de frecuencia / índice de estigmatización percibida", nivel: "Ordinal", fuente: "Encuesta a la población objetivo, entrevistas, registros escolares/judiciales" };
  }
  if (lower.includes("desinformación") || lower.includes("desinformacion") || lower.includes("influencia de los medios")) {
    return { variable: nombre, tipo, indicador: "Exposición a noticias falsas y capacidad de identificarlas correctamente; confianza en distintas fuentes mediáticas", unidad: "Puntuación en test de verificación / escala de confianza", nivel: "Ordinal (escala) o de razón (% de aciertos)", fuente: "Eurobarómetro, Reuters Institute Digital News Report, encuesta propia" };
  }
  if (lower.includes("exposición a medios") || lower.includes("exposicion a medios") || lower.includes("cámara de eco") || lower.includes("camara de eco") || lower.includes("alfabetización mediática") || lower.includes("alfabetizacion mediatica")) {
    return { variable: nombre, tipo, indicador: "Horas de consumo mediático, diversidad de fuentes consultadas y nivel de alfabetización mediática autoevaluado", unidad: "Horas/semana · índice de diversidad de fuentes · escala de competencia mediática", nivel: "De razón (horas) u ordinal (escalas)", fuente: "Encuesta de hábitos mediáticos, Reuters Institute Digital News Report" };
  }
  if (lower.includes("consumo ostentoso") || lower.includes("pautas de consumo")) {
    return { variable: nombre, tipo, indicador: "Gasto en bienes de estatus en relación con la renta disponible; frecuencia de compra de bienes de marca/lujo", unidad: "% del gasto total en bienes de estatus", nivel: "De razón", fuente: "Encuesta de Presupuestos Familiares (INE), encuesta propia de hábitos de consumo" };
  }
  if (lower.includes("capital económico") || lower.includes("capital economico") || lower.includes("distinción social") || lower.includes("distincion social") || lower.includes("publicidad y las redes")) {
    return { variable: nombre, tipo, indicador: "Nivel de renta y patrimonio; escala de motivaciones de estatus en el consumo; exposición a publicidad en redes", unidad: "Euros / tramo de renta · escala de motivación · horas de exposición", nivel: "De razón u ordinal según el indicador", fuente: "Encuesta de Condiciones de Vida (INE), encuesta propia" };
  }
  if (lower.includes("clima organizacional") || lower.includes("funcionamiento organizacional")) {
    return { variable: nombre, tipo, indicador: "Escala validada de clima organizacional (comunicación, liderazgo, reconocimiento, condiciones de trabajo)", unidad: "Puntuación en escala de clima organizacional (1–5)", nivel: "Ordinal (tratada habitualmente como cuasi-intervalo)", fuente: "Encuesta interna a la plantilla, escalas estandarizadas (p. ej. FOCUS-93)" };
  }
  if (lower.includes("jerarquía organizacional") || lower.includes("jerarquia organizacional") || lower.includes("incentivos y sistemas de control")) {
    return { variable: nombre, tipo, indicador: "Número de niveles jerárquicos, tramo de control y tipo de sistema de incentivos vigente", unidad: "Categórica / número de niveles", nivel: "Nominal u ordinal", fuente: "Organigramas y documentación interna, entrevistas a RRHH" };
  }

  if (tipo === "VI") {
    return { variable: nombre, tipo, indicador: `Escala / índice que mida «${nombre}» en la población de estudio`, unidad: "Puntuación en escala (1–5 / 1–10)", nivel: "Ordinal (escala tipo Likert)", fuente: "Cuestionario a población objetivo u observaciones estructuradas" };
  }
  return { variable: nombre, tipo, indicador: `Indicador observable de «${nombre}» definido para el contexto del estudio`, unidad: "Índice / escala / proporción", nivel: "Ordinal o de razón, según el indicador concreto elegido", fuente: "Encuestas, registros administrativos o datos secundarios" };
}

function construirOperacionalizacion(vi, vd, esCualitativo) {
  // El contenido de cada fila (indicador/unidad/nivel de medición) no
  // cambia según el enfoque — sigue siendo información orientativa útil
  // incluso en un diseño cualitativo — pero la etiqueta de tipo sí, para no
  // llamar "VI"/"VD" a algo que en un diseño cualitativo es una condición o
  // un fenómeno, no una variable a medir.
  const tipoVi = esCualitativo ? "Condición" : "VI";
  const tipoVd = esCualitativo ? "Fenómeno" : "VD";
  const filas = [];
  for (const v of vi) filas.push(indicadoresParaVariable(v, tipoVi));
  for (const v of vd) filas.push(indicadoresParaVariable(v, tipoVd));
  if (filas.length === 0) {
    filas.push({ variable: "Variable a definir", tipo: "N/D", indicador: "Indicador observable asociado", unidad: "Unidad de medida", nivel: "Por determinar", fuente: "Fuente de datos" });
  }
  return filas;
}

function operacionalizacionTexto(filas) {
  return filas.map(fila =>
    `- ${fila.variable} (${fila.tipo}): indicador = ${fila.indicador}; unidad = ${fila.unidad}; nivel de medición = ${fila.nivel}; fuente = ${fila.fuente}`
  ).join("\n");
}

/* ================= diseño de estudio (con mis avisos metodológicos) ================= */

/**
 * Clasifica si el problema, tal como está formulado, pide un abordaje
 * cualitativo, cuantitativo o mixto — a partir del vocabulario del propio
 * texto (no de una elección arbitraria). Es una heurística determinista:
 * mismo texto, misma clasificación siempre.
 */
function clasificarEnfoqueMetodologico(lower) {
  const marcadoresCuali = [
    "sentido", "significado", "experiencia", "percepción", "percepcion", "vivencia",
    "subjetiv", "narrativa", "discurso", "interpretaci", "comprensi", "relatos", "voces",
    "representaciones sociales", "cómo viven", "como viven", "qué significa", "que significa",
    "cómo se vive", "como se vive", "sentido que", "significado que"
  ];
  const marcadoresCuanti = [
    "prevalencia", "tasa de", "correlación", "correlacion", "asociación estadística",
    "asociacion estadistica", "cuánto", "cuanto", "medir", "comparar grupos", "porcentaje",
    "nivel de", "frecuencia de", "incidencia", "cuántos", "cuantos", "en qué medida", "en que medida"
  ];
  const marcadoresMixtoExplicito = [
    "cuali", "cuanti", "mixto", "triangulación", "triangulacion",
    "secuencial explicativo", "secuencial exploratorio", "métodos mixtos", "metodos mixtos"
  ];

  const scoreCuali = marcadoresCuali.filter(w => skContienePatron(lower, w)).length;
  const scoreCuanti = marcadoresCuanti.filter(w => skContienePatron(lower, w)).length;
  const esMixtoExplicito = marcadoresMixtoExplicito.some(w => lower.includes(w));
  const esEtnografico = skContieneAlguno(lower, ["etnografía", "etnografia", "observación participante", "observacion participante"]);
  const esExperimental = skContieneAlguno(lower, ["experimento", "experimental", "ensayo controlado"]);

  if (esMixtoExplicito || (scoreCuali > 0 && scoreCuanti > 0)) {
    return { enfoque: "mixto", motivo: "el problema combina vocabulario propio de ambas tradiciones (o pide explícitamente un diseño mixto)." };
  }
  if (esExperimental) {
    return { enfoque: "cuantitativo", motivo: "un diseño experimental/cuasi-experimental requiere medición numérica de efectos." };
  }
  if (esEtnografico || (scoreCuali > 0 && scoreCuanti === 0)) {
    return { enfoque: "cualitativo", motivo: "el problema pide explorar sentido, experiencia o significado, propio de la tradición cualitativa." };
  }
  if (scoreCuanti > 0 && scoreCuali === 0) {
    return { enfoque: "cuantitativo", motivo: "el problema pide medir magnitud, frecuencia o asociación estadística entre variables." };
  }
  return { enfoque: "mixto", motivo: "el problema no marca explícitamente una tradición: se sugiere un diseño mixto para medir la asociación y explicar sus mecanismos." };
}

function sugerirDisenoEstudio(lower) {
  let tipo = "un estudio descriptivo-correlacional de corte transversal";
  let tecnicas = ["Encuesta estructurada", "Entrevistas semiestructuradas a informantes clave"];
  let unidad = "individuos pertenecientes a la población definida";
  let esTransversalPorDefecto = true;

  const { enfoque, motivo } = clasificarEnfoqueMetodologico(lower);

  if (skContieneAlguno(lower, ["longitudinal", "seguimiento", "evolución", "evolucion"])) {
    tipo = "un estudio longitudinal (panel o cohorte)";
    esTransversalPorDefecto = false;
  }
  if (skContieneAlguno(lower, ["etnografía", "etnografia", "observación participante", "observacion participante"])) {
    tipo = "un estudio cualitativo de inspiración etnográfica";
    tecnicas = ["Observación participante", "Entrevistas en profundidad", "Sociogramas / mapas de actores"];
    esTransversalPorDefecto = false;
  }
  if (skContieneAlguno(lower, ["experimento", "experimental", "ensayo controlado"])) {
    tipo = "un diseño cuasi-experimental o experimental (según viabilidad ética)";
    tecnicas = ["Diseño de intervención", "Grupo control / grupo experimental", "Mediciones pre y post"];
    esTransversalPorDefecto = false;
  }
  if (skContieneAlguno(lower, ["barrios", "barrio", "territorio", "comunidad", "participativo"])) {
    unidad = "unidades territoriales (barrios / comunidades) y actores comunitarios relevantes";
  }

  // El enfoque cuali/cuanti/mixto condiciona las técnicas cuando el tipo de
  // diseño no lo ha fijado ya (etnográfico/experimental son casos ya resueltos arriba).
  let software = [];
  if (esTransversalPorDefecto) {
    if (enfoque === "cualitativo") {
      tecnicas = ["Entrevistas en profundidad", "Grupos focales / grupos de discusión", "Observación (si es viable) y notas de campo"];
      software = ["Atlas.ti", "MAXQDA", "NVivo"];
    } else if (enfoque === "cuantitativo") {
      tecnicas = ["Encuesta estructurada con cuestionario validado", "Análisis estadístico de datos secundarios (si están disponibles)"];
      software = ["SPSS", "R", "Stata", "Jamovi"];
    } else {
      tecnicas = ["Encuesta estructurada (fase cuantitativa)", "Entrevistas semiestructuradas a informantes clave (fase cualitativa)"];
      software = ["SPSS / R / Stata para la fase cuantitativa", "Atlas.ti / MAXQDA / NVivo para la fase cualitativa"];
    }
  }

  const resumen = [];
  resumen.push(`Tipo de diseño sugerido: ${tipo}.`);
  resumen.push(`Enfoque metodológico sugerido: ${enfoque} — ${motivo}`);
  resumen.push("Técnicas principales recomendadas:");
  for (const t of tecnicas) resumen.push(`- ${t}`);
  if (software.length) {
    resumen.push(`Software de apoyo al análisis, una vez recogidos los datos: ${software.join("; ")}.`);
  }

  resumen.push("");
  resumen.push("Estrategia de muestreo (a decidir por el investigador):");
  if (enfoque === "cualitativo") {
    resumen.push("- Muestreo no probabilístico (intencional, por conveniencia o bola de nieve), justificando el criterio de selección de casos y el punto de saturación teórica.");
  } else if (enfoque === "cuantitativo") {
    resumen.push("- Muestreo probabilístico (aleatorio simple, estratificado o por conglomerados), calculando el tamaño muestral según margen de error y nivel de confianza deseados.");
  } else {
    resumen.push("- Fase cuantitativa: muestreo probabilístico y cálculo de tamaño muestral según margen de error y nivel de confianza deseados.");
    resumen.push("- Fase cualitativa: muestreo no probabilístico (intencional o bola de nieve) sobre un subconjunto de la muestra o casos adicionales, justificando el criterio de selección y el punto de saturación.");
  }

  if (esTransversalPorDefecto && enfoque !== "cualitativo") {
    resumen.push("");
    resumen.push("Advertencia metodológica: este es un diseño transversal (una sola medición en el tiempo). Permite describir asociaciones entre variables, pero NO establecer causalidad ni orden temporal. Las preguntas e hipótesis de este informe usan a veces lenguaje explicativo (\"explican\", \"efecto de\"); interpreta esas relaciones como asociativas, no causales, salvo que adoptes un diseño longitudinal o (cuasi)experimental.");
  }

  resumen.push("");
  resumen.push("Notas: Ajustar el diseño al acceso real al campo, recursos disponibles y criterios éticos; combinar, cuando sea posible, al menos una técnica cuantitativa y una cualitativa.");

  if (skContieneAlguno(lower, ["violencia", "maltrato", "feminicidio", "salud mental", "ansiedad", "depresión", "depresion", "menor", "menores", "niño", "niños", "niña", "niñas", "infancia", "adolescente"])) {
    resumen.push("Este problema toca un tema sensible (violencia, salud mental y/o menores de edad): prevé consentimiento informado explícito, protocolos de derivación ante revelación de riesgo, anonimización estricta de los datos y aprobación de un comité de ética antes de recoger cualquier dato.");
  }

  return { texto: resumen.join("\n"), unidad, enfoque };
}

/* ================= marcos teóricos ================= */

function sugerirMarcosTeoricos(lower, vi, vd, motivosOut) {
  const marcos = [];
  const total = (lower || "") + " " + vi.concat(vd).join(" ").toLowerCase();
  const motivos = motivosOut || {};
  let ultimoMotivo = null;
  const add = (x) => {
    if (!marcos.includes(x)) marcos.push(x);
    if (!motivos[x] && ultimoMotivo) motivos[x] = ultimoMotivo;
  };
  const hasAny = (words) => {
    const m = skContieneAlgunoTrack(total, words);
    ultimoMotivo = m;
    return !!m;
  };

  if (hasAny(["violencia de género", "violencia de genero", "género", "genero", "masculinidad", "masculinidades", "hombres", "machismo"])) {
    add("Connell: masculinidades, masculinidad hegemónica y relaciones de género");
    add("Butler: performatividad de género y normas corporales/sociales");
    add("Bourdieu: dominación masculina y violencia simbólica");
  }
  if (hasAny(["familia", "familiares", "hogar"])) {
    add("Berger y Luckmann: socialización primaria, construcción social de la realidad");
    add("Bourdieu: habitus familiar, capital cultural y reproducción");
  }
  if (hasAny(["educación", "educacion", "abandono escolar", "deserción", "desercion", "fracaso escolar"])) {
    add("Bourdieu y Passeron: reproducción educativa, capital cultural y desigualdad escolar");
    add("Bernstein: códigos lingüísticos y desigualdad educativa");
  }
  if (hasAny(["trabajo", "empleo", "laboral", "precariedad"])) {
    add("Marx: trabajo, explotación y relaciones de clase");
    add("Standing: precariado y nuevas formas de inseguridad laboral");
  }
  if (hasAny(["salud", "enfermedad", "salud mental", "ansiedad", "depresión", "depresion"])) {
    add("Marmot: determinantes sociales de la salud");
    add("Foucault: biopolítica, cuerpos e instituciones");
  }
  if (hasAny(["digital", "algoritmo", "internet", "redes sociales"])) {
    add("Zuboff: capitalismo de la vigilancia");
    add("Couldry y Mejias: colonialismo de datos y mediaciones digitales");
  }
  if (hasAny(["barrio", "territorio", "urbano", "zaragoza"])) {
    add("Lefebvre: producción social del espacio");
    add("Wacquant: marginalidad urbana y estigma territorial");
  }
  if (hasAny(["migración", "migracion", "inmigración", "inmigracion", "migrante", "refugiados", "asilo"])) {
    add("Portes: capital social y asimilación segmentada");
    add("Sayad: la doble ausencia del inmigrante");
  }
  if (hasAny(["etnia", "étnica", "etnica", "gitano", "gitana", "gitanos", "gitanas", "romaní", "romani", "minoría étnica", "minoria etnica", "grupo étnico", "grupo etnico", "tribu étnica", "tribu etnica", "indígena", "indigena", "afrodescendiente", "racializad"])) {
    add("San Román: antropología y sociología del pueblo gitano en España");
    add("Wieviorka: racismo, diferencialismo cultural y minorías étnicas");
  }
  if (hasAny(["lgtbi", "lgtbiq", "lgbt", "diversidad sexual", "orientación sexual", "orientacion sexual", "identidad de género", "identidad de genero", "homofobia", "transfobia", "personas trans", "bisexual", "homosexual", "queer"])) {
    add("Foucault: historia de la sexualidad, biopoder, dispositivo de sexualidad");
    add("Rubin: sistema sexo/género, jerarquías sexuales");
    add("Rich: heterosexualidad obligatoria");
    add("Butler: performatividad de género, heteronormatividad");
    add("Sedgwick: epistemología del armario");
    add("Puar: homonacionalismo, ensamblajes de sexualidad y raza");
  }
  if (hasAny(["envejecimiento", "vejez", "personas mayores", "tercera edad", "adultos mayores", "edadismo", "gerontología", "gerontologia"])) {
    add("Cumming y Henry: teoría de la desvinculación");
    add("Erikson: integridad del yo frente a la desesperación");
    add("Beauvoir: construcción social de la vejez");
    add("Butler R.: edadismo (ageism) y discriminación por edad");
    add("Phillipson: economía política del envejecimiento");
    add("Carstensen: teoría de la selectividad socioemocional");
  }
  if (hasAny(["delincuencia", "criminalidad", "conducta desviada", "desviación social", "desviacion social", "reincidencia"])) {
    add("Merton: anomia y tensión estructural");
    add("Sutherland: asociación diferencial");
    add("Becker: etiquetado social (labeling theory)");
    add("Sampson: eficacia colectiva y control social informal");
    add("Wacquant: penalidad neoliberal, gueto y prisión");
    add("Garland: cultura del control penal");
    add("Clarke: prevención situacional del delito (reducir oportunidades, no solo sancionar)");
  }
  if (hasAny(["medios de comunicación", "medios de comunicacion", "desinformación", "desinformacion", "fake news", "bulos", "opinión pública", "opinion publica", "framing", "agenda mediática", "agenda mediatica"])) {
    add("Lippmann: opinión pública y estereotipos");
    add("Lazarsfeld: flujo de dos pasos, líderes de opinión");
    add("McLuhan: el medio es el mensaje");
    add("McCombs: teoría de la agenda-setting");
    add("Castells: sociedad red, autocomunicación de masas");
    add("Sunstein: cámaras de eco y polarización de grupo");
  }
  if (hasAny(["consumo", "consumismo", "estilo de vida", "estilos de vida", "publicidad", "marca", "marcas"])) {
    add("Veblen: consumo conspicuo (ostentoso)");
    add("Simmel: moda y diferenciación social");
    add("Bourdieu: distinción y gustos de clase");
    add("Baudrillard: sociedad de consumo, valor signo");
    add("Bauman: consumismo líquido");
    add("Featherstone: cultura de consumo posmoderna");
  }
  if (hasAny(["organización", "organizacion", "organizaciones", "burocracia", "cultura organizacional", "clima organizacional", "gestión empresarial", "gestion empresarial"])) {
    add("Weber: burocracia y dominación racional-legal");
    add("Taylor: organización científica del trabajo");
    add("Mayo: relaciones humanas, efecto Hawthorne");
    add("Crozier: poder y zonas de incertidumbre");
    add("Kanter: estructura de oportunidad y tokenismo");
    add("Alvesson: cultura organizacional desde la teoría crítica");
  }
  if (hasAny(["discapacidad", "diversidad funcional", "accesibilidad", "dependencia funcional"])) {
    add("Oliver: modelo social de la discapacidad");
    add("Goffman: estigma e identidad deteriorada");
  }
  if (hasAny(["cambio climático", "cambio climatico", "medio ambiente", "sostenibilidad", "crisis climática", "crisis climatica"])) {
    add("Beck: sociedad del riesgo");
    add("Norgaard: negación social del cambio climático");
  }
  if (hasAny(["rural", "ruralidad", "despoblación", "despoblacion", "éxodo rural", "exodo rural"])) {
    add("Tönnies: comunidad y sociedad");
    add("Camarero: ruralidad, género y despoblación en España");
  }
  if (hasAny(["religión", "religion", "religiosidad", "secularización", "secularizacion"])) {
    add("Durkheim: formas elementales de la vida religiosa");
    add("Berger: el dosel sagrado y la secularización");
  }
  if (hasAny(["pobreza energética", "pobreza energetica", "pobreza", "exclusión social", "exclusion social", "condiciones económicas", "condiciones economicas"])) {
    add("Simmel: el pobre como posición relacional dentro de la estructura social");
    add("Townsend: pobreza relativa y privación como incapacidad de participar en la vida social");
    add("Sen: enfoque de capacidades, pobreza multidimensional más allá del ingreso");
  }
  if (hasAny(["energética", "energetica", "vivienda", "residencial", "habitacional", "suministro energético", "suministro energetico"])) {
    add("Harvey: derecho a la ciudad y valor de cambio de la vivienda");
    add("Bouzarovski: pobreza energética y vulnerabilidad energética del hogar");
  }
  if (hasAny(["jóvenes", "jovenes", "juventud", "juvenil", "adolescentes", "18 a 25"])) {
    add("Mannheim: generaciones como unidad de experiencia histórica y social");
    add("Furlong y Cartmel: individualización y riesgo en las trayectorias juveniles");
  }
  if (hasAny(["emociones", "afectos", "miedo", "ira", "soledad"])) {
    add("Hochschild: trabajo emocional y reglas de sentimiento");
    add("Illouz: capitalismo emocional, emociones y racionalidad económica");
  }
  if (hasAny(["cultura", "identidad", "representaciones", "valores"])) {
    add("Geertz: descripción densa y cultura como sistema de significados compartidos");
    add("Swidler: cultura como \"caja de herramientas\" de estrategias de acción");
  }
  if (hasAny(["política", "politica", "voto", "partido", "hegemonía", "hegemonia", "radicalización", "radicalizacion"])) {
    add("Weber: tipos de dominación y fuentes de legitimidad política");
    add("Gramsci: hegemonía, sociedad civil y dirección cultural");
    add("Putnam: capital social y declive de la participación cívica");
  }
  if (hasAny(["conocimiento", "normalidad", "sentido común", "sentido comun", "cognitivo"])) {
    add("Berger y Luckmann: construcción social del conocimiento y la realidad cotidiana");
    add("Mannheim: sociología del conocimiento, perspectiva social e ideología");
  }

  if (marcos.length === 0) {
    ultimoMotivo = "ningún término de dominio reconocible en el texto; marcos generales por defecto";
    add("Durkheim: hechos sociales y explicación sociológica");
    add("Weber: acción social, sentido y comprensión");
    add("Bourdieu: campo, habitus y capital");
  }

  return marcos;
}

/* ================= categorías explicativas aplicadas al problema concreto ================= */
/**
 * A diferencia de sugerirMarcosTeoricos (que da una lista de autores/temas
 * por afinidad léxica), esto responde a una pregunta más difícil: "¿qué
 * concepto teórico concreto explica ESTA dinámica en particular?" — el tipo
 * de razonamiento de un tutor cuando dice "¿cómo se entiende que la mujer
 * violentada esté de acuerdo con su agresor? Una respuesta posible es la
 * violencia simbólica de Bourdieu". Cada entrada exige, además del tema
 * (VD/VI/texto), una marca textual de la dinámica que se quiere explicar
 * (aceptación, silencio, permanencia, autoexclusión...); sin esa marca no
 * se sugiere, para no convertirse en una lista genérica de teóricos.
 */
function skTiene(total, palabras) { return skContieneAlguno(total, palabras); }

const MARCADORES_ACEPTACION = ["de acuerdo", "acepta", "aceptan", "no denuncia", "no denuncian", "permanece", "permanecen", "normaliza", "normalizan", "justifica", "justifican", "consiente", "consienten", "perdona", "perdonan", "se resigna", "se resignan", "no se queja", "no se quejan", "vuelve con", "vuelven con", "sigue con", "siguen con"];
const MARCADORES_AUTOEXCLUSION = ["por decisión propia", "por decision propia", "voluntariamente", "no le interesa", "no les interesa", "se autoexcluye", "se autoexcluyen", "no quiere", "no quieren", "prefiere no", "prefieren no", "se retira", "se retiran", "abandona por", "abandonan por"];
const MARCADORES_SILENCIO = ["no busca ayuda", "no buscan ayuda", "en silencio", "no lo cuenta", "no lo cuentan", "oculta", "ocultan", "nadie denuncia", "todos lo saben", "no se dice", "no se habla de"];
const MARCADORES_PERSISTENCIA_CREENCIA = ["sigue creyendo", "siguen creyendo", "no cambia de opinión", "no cambia de opinion", "no cambian de opinión", "no cambian de opinion", "pese a la evidencia", "a pesar de la evidencia", "aunque se lo demuestren"];
const MARCADORES_SOBREGASTO = ["se endeuda", "se endeudan", "gasta más de lo que tiene", "gastan más de lo que tienen", "por encima de sus posibilidades", "para aparentar"];
const MARCADORES_ETIQUETA = ["está marcado", "esta marcado", "ya no puede", "no le dan otra oportunidad", "no le dan otra opotunidad", "antecedentes", "una vez que"];

function construirCategoriasExplicativas(lower, resultado) {
  const total = (lower || "") + " " + (resultado.vi || []).join(" ").toLowerCase() + " " + (resultado.vd || []).join(" ").toLowerCase();
  const out = [];
  const add = (concepto, autor, texto) => {
    if (out.length >= 4) return;
    const linea = `«${concepto}» (${autor}): ${texto}`;
    if (!out.includes(linea)) out.push(linea);
  };

  if (skTiene(total, ["violencia"]) && skTiene(lower, MARCADORES_ACEPTACION)) {
    add("Violencia simbólica", "Bourdieu", "explica por qué la persona violentada puede estar de acuerdo con quien ejerce la violencia — el dominado interioriza los esquemas de percepción del dominante como si fueran naturales, así que la dominación no se vive solo como algo impuesto desde fuera, sino como parte del propio sentido común.");
    add("Ciclo de la violencia", "Walker", "ayuda a entender por qué la relación no se rompe tras un episodio violento: la fase de reconciliación ('luna de miel') que suele seguir a la agresión refuerza el vínculo y dificulta la salida.");
  } else if (skTiene(total, ["violencia"])) {
    add("Continuum de la violencia", "Kelly", "propone no tratar la violencia como episodios aislados, sino como un continuo de conductas de control (desde la coerción sutil hasta la agresión física) que se refuerzan entre sí.");
  }

  if (skTiene(total, ["pobreza"]) && skTiene(lower, ["se culpa", "se culpan", "se avergüenza", "se avergüenzan", "cree que es su culpa", "creen que es su culpa", "por falta de esfuerzo", "por no esforzarse"])) {
    add("Culpar a la víctima", "Ryan", "explica por qué las personas en situación de pobreza a menudo interiorizan la causa como un fallo personal (falta de esfuerzo) y no como el resultado de una estructura de oportunidades desigual — la ideología meritocrática legitima la desigualdad como si fuera justa.");
  }

  if (skTiene(total, ["precariedad laboral"]) && (skTiene(lower, MARCADORES_ACEPTACION) || skTiene(lower, ["no se organiza", "no se organizan", "resignación", "resignacion"]))) {
    add("Individualización del riesgo", "Beck", "explica por qué quien vive la precariedad tiende a vivirla como un problema personal a resolver en solitario, en vez de como una condición estructural compartida que podría organizarse colectivamente.");
  }

  if (skTiene(total, ["abandono escolar", "fracaso escolar"]) && skTiene(lower, MARCADORES_AUTOEXCLUSION)) {
    add("Habitus y autoexclusión", "Bourdieu", "explica por qué el abandono puede parecer una 'elección' del alumnado de origen popular, cuando en realidad refleja expectativas ajustadas de antemano a lo que consideran realista para alguien en su posición social — no es falta de interés, es autoexclusión anticipada y aprendida.");
  }

  if (skTiene(total, ["etnia", "étnica", "etnica", "gitano", "gitana", "racializad", "indígena", "indigena", "afrodescendiente"]) && (skTiene(lower, MARCADORES_AUTOEXCLUSION) || skTiene(lower, MARCADORES_SILENCIO))) {
    add("Estigma", "Goffman", "explica por qué una persona puede anticipar el rechazo y retirarse de ciertos espacios (la escuela, el empleo) antes incluso de vivir la discriminación directamente: gestiona una identidad social ya marcada como 'deteriorada' a ojos de los demás.");
  }

  if (skTiene(total, ["migración", "migracion", "migrante", "inmigración", "inmigracion"]) && (skTiene(lower, MARCADORES_ACEPTACION) || skTiene(lower, MARCADORES_SILENCIO))) {
    add("Doble ausencia", "Sayad", "explica la posición suspendida de quien migra — ni plenamente perteneciente al lugar de origen ni al de destino — lo que puede llevar a tolerar condiciones que de otro modo se rechazarían, por miedo a perder el frágil lugar conseguido.");
  }

  if (skTiene(total, ["salud mental", "malestar emocional", "ansiedad", "depresión", "depresion"]) && skTiene(lower, MARCADORES_SILENCIO)) {
    add("Determinantes sociales de la salud", "Marmot", "recuerda que el malestar psicológico no es solo un fallo individual: el gradiente social de salud muestra que la posición socioeconómica predice sistemáticamente el malestar, lo que reformula la pregunta de 'qué le pasa a esta persona' a 'qué le está pasando a las personas en esta posición social'.");
  }

  if (skTiene(total, ["soledad"]) && skTiene(lower, ["conectado", "conectados", "conectada", "conectadas", "redes sociales", "muchos contactos", "muchos amigos en redes"])) {
    add("Individualismo en red", "Wellman", "explica la aparente paradoja de estar hiperconectado y sentirse solo: las relaciones se han vuelto más numerosas pero también más flexibles y centradas en el individuo, no en una comunidad estable que sostenga.");
  }

  if (skTiene(total, ["discapacidad", "diversidad funcional"]) && skTiene(lower, ["no puede", "no pueden", "limitación", "limitacion", "limitaciones"])) {
    add("Modelo social de la discapacidad", "Oliver", "invierte la pregunta: no es que la persona 'no pueda', es que el entorno no está diseñado para incluirla — la discapacidad no está en el cuerpo, está en la falta de accesibilidad y de ajustes razonables.");
  }

  if (skTiene(total, ["delincuencia", "criminalidad", "conducta desviada"]) && skTiene(lower, MARCADORES_ETIQUETA)) {
    add("Etiquetado social", "Becker", "explica por qué, una vez calificada como 'delincuente', a una persona le resulta más difícil abandonar esa trayectoria: la etiqueta modifica cómo la tratan los demás y cómo se percibe a sí misma, reforzando justo la conducta que se pretendía corregir.");
  }

  if (skTiene(total, ["lgtbi", "lgtbiq", "lgbt", "diversidad sexual", "orientación sexual", "orientacion sexual", "identidad de género", "identidad de genero"]) && skTiene(lower, MARCADORES_SILENCIO)) {
    add("Epistemología del armario", "Sedgwick", "explica por qué una persona puede revelar su identidad en unos contextos y ocultarla en otros: no es una decisión única sino una gestión continua y contextual de la visibilidad, con costes reales en cada espacio.");
  }

  if (skTiene(total, ["consumo ostentoso", "consumismo", "consumo"]) && skTiene(lower, MARCADORES_SOBREGASTO)) {
    add("Consumo conspicuo", "Veblen", "explica por qué alguien puede gastar por encima de sus posibilidades en bienes visibles: el consumo no solo satisface necesidades, también comunica y compite por estatus ante los demás.");
  }

  if (skTiene(total, ["organización", "organizacion", "organizaciones", "clima organizacional"]) && skTiene(lower, MARCADORES_SILENCIO)) {
    add("Zonas de incertidumbre", "Crozier", "explica por qué el silencio persiste dentro de una organización: quienes controlan la información o los recursos críticos —aunque no tengan autoridad formal— acumulan poder informal, y señalar el problema puede amenazar ese equilibrio.");
  }

  if (skTiene(total, ["envejecimiento", "vejez", "personas mayores", "tercera edad"]) && skTiene(lower, MARCADORES_AUTOEXCLUSION)) {
    add("Selectividad socioemocional", "Carstensen", "ofrece una lectura alternativa al simple 'declive': la persona mayor no se retira por decadencia, sino que reduce selectivamente sus vínculos para priorizar las relaciones emocionalmente más significativas, al percibir el tiempo como limitado.");
  }

  if (skTiene(total, ["desinformación", "desinformacion", "fake news", "bulos", "medios de comunicación", "medios de comunicacion"]) && skTiene(lower, MARCADORES_PERSISTENCIA_CREENCIA)) {
    add("Cámaras de eco", "Sunstein", "explica por qué la evidencia contraria no basta para cambiar de opinión: el entorno informativo selecciona y refuerza lo que ya se cree, y salir de ese circuito tiene un coste social — perder la validación del propio grupo.");
  }

  if (skTiene(total, ["religiosidad", "secularización", "secularizacion", "religión", "religion"]) && skTiene(lower, ["ya no cree", "ya no creen", "por tradición", "por tradicion", "por costumbre", "sin creer"])) {
    add("Pertenecer sin creer", "Davie", "explica por qué alguien puede seguir participando en prácticas religiosas por lazo comunitario o familiar aunque ya no comparta plenamente las creencias: la pertenencia social pesa independientemente de la convicción.");
  }

  if (skTiene(total, ["despoblación", "despoblacion", "rural", "éxodo rural", "exodo rural"]) && skTiene(lower, ["quieren quedarse", "quiere quedarse", "no quiere irse", "no quieren irse", "a pesar de querer quedarse"])) {
    add("Arraigo territorial", "Camarero", "explica la tensión entre el deseo de quedarse y la salida efectiva: la decisión de emigrar no depende solo de la falta de oportunidades, sino de un cálculo entre el arraigo afectivo al lugar y la falta de futuro material percibido.");
  }

  if (out.length === 0 && skTiene(lower, ["a pesar de", "pese a", "aunque", "paradójicamente", "paradojicamente"])) {
    add("Disonancia cognitiva", "Festinger", "es un mecanismo general que puede servir de punto de partida aquí: cuando una persona actúa de forma que contradice sus creencias o intereses, tiende a ajustar sus creencias —no su conducta— para reducir el malestar de esa contradicción.");
  }

  return out;
}

const NOTA_CATEGORIAS_EXPLICATIVAS = "Estas categorías no son solo nombres de autores: son conceptos concretos que pueden explicar la dinámica específica que describe tu problema (por ejemplo, por qué alguien permanece, calla, se resigna o no cambia de opinión pese a la evidencia). Son candidatas de partida — evalúa si de verdad encajan con tu caso y con la literatura que revises, y busca la fuente primaria antes de citarlas.";

/* ================= mecanismos micro/meso/macro (idéntico al original) ================= */

function generarMecanismos(areas, subdoms, vi, vd, contexto) {
  const mec = [];
  const lowerAreas = areas && areas.length ? areas.join(" ").toLowerCase() : "";
  const vdTxt = vd && vd.length ? vd.join(" ").toLowerCase() : "";
  const viTxt = vi && vi.length ? vi.join(" ").toLowerCase() : "";

  const esGenero = lowerAreas.includes("género") || lowerAreas.includes("genero") || lowerAreas.includes("masculinidad");
  const esFamilia = lowerAreas.includes("familia");
  const esEducacion = lowerAreas.includes("educación") || lowerAreas.includes("educacion");
  const esUrbano = lowerAreas.includes("urbana") || lowerAreas.includes("urbano") || vdTxt.includes("barrio") || viTxt.includes("barrio");
  const esTrabajo = lowerAreas.includes("trabajo") || lowerAreas.includes("laboral");

  if (esGenero && vdTxt.includes("violencia")) mec.push("Micro (interacciones): circuitos de control coercitivo, escaladas situacionales de conflicto, gestión asimétrica de emociones y autoridad en la pareja.");
  if (esFamilia) mec.push("Micro (hogar): microinteracciones cotidianas, tensiones afectivas, estilos de crianza, soportes o silencios familiares que facilitan/contienen el fenómeno.");
  if (esEducacion) mec.push("Micro (escuela): climas de aula, etiquetas docentes, diferentes trayectorias subjetivas del alumnado ante el rendimiento y la pertenencia escolar.");
  if (esUrbano) mec.push("Micro (barrio): redes de apoyo/estigma territorial, densidad relacional y circulación local de normas prácticas.");
  if (esTrabajo) mec.push("Micro (trabajo/hogar): estrés laboral, desajustes de tiempo doméstico y precariedad vivida que deterioran la regulación cotidiana.");

  if (esGenero) mec.push("Meso (instituciones): respuestas de servicios sociales, salud, justicia y educación que pueden reforzar o reducir la tolerancia al dominio masculino.");
  if (esFamilia) mec.push("Meso (familia ampliada): normas de parentesco, expectativas intergeneracionales y redes de cuidado que estructuran posiciones de poder doméstico.");
  if (esEducacion) mec.push("Meso (centros y políticas): coordinación familia–escuela, protocolos de absentismo/abandono y recursos de intervención comunitaria.");
  if (esUrbano) mec.push("Meso (territorio): desigual distribución de equipamientos, mediación comunitaria y calidad de servicios por distritos/barrios.");
  if (esTrabajo) mec.push("Meso (mercado laboral local): segmentación del empleo, temporalidad y trayectorias de inserción/exclusión.");

  if (esGenero) mec.push("Macro (estructura patriarcal): reproducción de desigualdades de género, habitus viril y legitimación cultural de jerarquías.");
  if (esFamilia) mec.push("Macro (reproducción social): transmisión intergeneracional de habitus, capital cultural/afectivo y desigualdades normalizadas.");
  if (esEducacion) mec.push("Macro (reproducción educativa): currículum oculto, capital cultural y desigualdades estructurales en el sistema.");
  if (esUrbano) mec.push("Macro (segregación urbana): estigmatización territorial, gentrificación y desigualdad espacial persistente.");
  if (esTrabajo) mec.push("Macro (precarización): cambios estructurales del trabajo, desprotección y desigualdad socioeconómica.");

  if (mec.length === 0) {
    return [
      "Micro: prácticas e interacciones cotidianas vinculadas al fenómeno.",
      "Meso: papel de instituciones y redes intermedias en su reproducción/contención.",
      "Macro: estructuras sociales amplias que lo condicionan."
    ];
  }
  return mec;
}

/* ================= fuentes de datos (vía motor geo) ================= */

function sugerirFuentesDatos(lower, area, contexto) {
  const g = geoDetectar((lower || "") + " " + (contexto || ""));
  return geoFuentes(g.ciudad, g.pais, area, lower);
}

/* ================= notas metodológicas transversales ================= */

const NOTA_DIRECCIONALIDAD_VIVD = "Nota metodológica: SOCIOKAIROS asume por defecto que las VI son factores explicativos (causas) y las VD el fenómeno a explicar (efectos). Es una simplificación heurística: revísala contra tu propio marco teórico, porque en otros planteamientos estas mismas variables podrían intercambiar su rol (p. ej., el «clima familiar» puede ser VD si tu pregunta es qué lo determina). Si decides que la dirección real es la contraria, usa el botón «Intercambiar VI ↔ VD»: no solo cambia la etiqueta, recalcula preguntas, correlaciones, hipótesis y operacionalización con la nueva dirección.";

const NOTA_JUSTIFICAR_MARCOS = "Nota: estos marcos se sugieren por coincidencia léxica con tu problema. Justifica en tu trabajo por qué cada uno es realmente pertinente para tu caso concreto, no solo que haya aparecido aquí.";

// Guía breve, en el tono de un profesor senior de metodología de la
// investigación: no se limita a nombrar marcos teóricos (eso ya lo hace
// sugerirMarcosTeoricos), sino que da pautas concretas de CÓMO desarrollar
// el apartado de marco teórico a partir de lo sugerido — la parte que un
// estudiante suele hacer peor: describir el marco en vez de USARLO para
// explicar su problema concreto.
const PAUTAS_MARCO_TEORICO =
  "Pautas para redactar tu marco teórico (a partir de los marcos sugeridos arriba):\n" +
  "1. Define los conceptos clave con el vocabulario propio del marco elegido, no con lenguaje coloquial — si el marco habla de «capital social», no lo sustituyas por «apoyo».\n" +
  "2. Explica el mecanismo, no solo el nombre: ¿qué relación concreta predice el marco entre tus factores explicativos y el fenómeno que estudias? No basta con citar al autor.\n" +
  "3. Combina al menos una fuente clásica (el autor que formuló el marco) con una fuente reciente (una revisión o aplicación empírica de los últimos 10 años).\n" +
  "4. Señala al menos una crítica o límite conocido del marco aplicado a tu caso — un marco teórico maduro reconoce también dónde no explica bien el fenómeno.\n" +
  "5. Cierra conectando el marco con tus hipótesis: ¿qué predicción concreta se deriva de él para tu problema, y qué esperarías observar si el marco es correcto?";

const NOTA_VI_CANDIDATA = "Nota metodológica: tu problema no nombra explícitamente ningún factor explicativo, así que las de abajo son candidatas típicas en la literatura sobre este fenómeno — no están extraídas de tu texto. Sustitúyelas por las que realmente vayas a estudiar, o añade el factor explicativo directamente en el problema inicial para que SOCIOKAIROS lo detecte.";

/* ================= análisis principal ================= */

/**
 * Transparencia del análisis: SOCIOKAIROS es determinista (sin caja negra),
 * así que en vez de solo entregar VD/VI/área/marcos como un resultado dado,
 * se explica CADA UNO con la palabra o frase concreta del problema que lo
 * activó (o, si es una candidata sugerida por el dominio, se dice
 * explícitamente que no viene del texto). Ayuda al estudiante a entender el
 * razonamiento y a detectar falsos positivos léxicos por sí mismo.
 */
function construirExplicacionDeteccion(vi, vd, areas, marcos, motivosVi, motivosVd, motivosArea, motivosMarcos, etiquetas) {
  const esGenerico = (m) => /^(candidata sugerida|ningún término)/.test(m || "");
  const linea = (item, motivo) => {
    if (!motivo) return `• "${item}"`;
    if (esGenerico(motivo)) return `• "${item}" — ${motivo}.`;
    return `• "${item}" ← detectado a partir de "${motivo}" en tu texto.`;
  };
  const et = etiquetas || etiquetasEnfoque("");
  const tituloVd = et.esCualitativo ? "FENÓMENO CENTRAL:" : "VARIABLE DEPENDIENTE (VD):";
  const tituloVi = et.esCualitativo ? "CONDICIONES EXPLICATIVAS:" : "VARIABLES INDEPENDIENTES (VI):";

  const bloques = [];
  if (vd.length) {
    bloques.push(tituloVd);
    bloques.push(...vd.map(x => linea(x, (motivosVd || {})[x])));
  }
  if (vi.length) {
    bloques.push("");
    bloques.push(tituloVi);
    bloques.push(...vi.map(x => linea(x, (motivosVi || {})[x])));
  }
  if (areas.length) {
    bloques.push("");
    bloques.push("ÁREA SOCIOLÓGICA:");
    bloques.push(...areas.map(x => linea(x, (motivosArea || {})[x])));
  }
  if (marcos.length) {
    bloques.push("");
    bloques.push("MARCOS TEÓRICOS SUGERIDOS:");
    bloques.push(...marcos.map(x => linea(x, (motivosMarcos || {})[x])));
  }
  bloques.push("");
  bloques.push("SOCIOKAIROS es determinista: cada sugerencia nace de una coincidencia textual con tu problema (o, cuando se indica así, de una candidata propuesta por el dominio, no de tu texto). Si algo no encaja, revisa la palabra que lo activó — puede ser una coincidencia léxica que no refleja lo que quisiste decir.");
  return bloques.join("\n");
}

function analizarProblema(texto, opts) {
  opts = opts || {};
  texto = (texto || "").trim();
  if (!texto) {
    return {
      p1: "Escribe un problema científico en forma de frase o pregunta para comenzar.",
      p2: "", p3: "", vi: [], vd: [],
      correlaciones: [],
      hipotesis: ["La herramienta necesita al menos una frase con actores, contexto y algún efecto."],
      marcos: ["Durkheim (hechos sociales)", "Weber (acción social)"],
      area: "Sociología general / del cambio social",
      areas: ["Sociología general / del cambio social"],
      subdominios: [], mecanismos: [],
      diseno: "Propón un diseño inicial (descriptivo, correlacional, cualitativo, etc.) para comenzar.",
      unidad: "Unidad de análisis pendiente de definir.",
      enfoque: "mixto",
      operacionalizacion: [], fuentes: [], viEsCandidato: false,
      guiaCualitativa: { codigos: [], preguntas: [] },
      categoriasExplicativas: [],
      explicacionDeteccion: "",
      intercambiado: false,
      etiquetas: etiquetasEnfoque("mixto")
    };
  }

  const lower = texto.toLowerCase();
  const { contexto, poblacion } = detectarContextoYPoblacion(lower, texto);
  // eslint-disable-next-line prefer-const
  let { vi, vd, viEsCandidato, motivosVi, motivosVd } = detectarVariables(lower);
  // Selector manual de dirección VI/VD: la asignación léxica del motor es
  // una convención, no una verdad teórica (ver NOTA_DIRECCIONALIDAD_VIVD) —
  // si el estudiante decide que la dirección real es la contraria, se
  // intercambian AQUÍ, antes de calcular nada que dependa de vi/vd, para que
  // preguntas, correlaciones, hipótesis y operacionalización sean coherentes
  // con la nueva dirección elegida (área y marcos no cambian: se construyen
  // sobre el texto combinado de ambas listas, sin importar el orden).
  if (opts.intercambiarViVd) {
    [vi, vd] = [vd, vi];
    [motivosVi, motivosVd] = [motivosVd, motivosVi];
    viEsCandidato = false;
  }
  const motivosArea = {};
  const areas = detectarAreaSociologica(lower, vi, vd, motivosArea);
  const area = areas.join(" · ");
  const subdoms = detectarSubdominios(areas, vi, vd, lower);

  // El enfoque (sugerido por SOCIOKAIROS a partir del propio vocabulario del
  // texto, nunca elegido de antemano por el estudiante) se calcula ANTES de
  // construir preguntas/correlaciones/hipótesis porque, si es cualitativo,
  // esas tres cosas usan un vocabulario distinto (sin VI/VD ni lenguaje de
  // asociación estadística) — ver construirPreguntasCualitativas y compañía.
  const disenoInfo = sugerirDisenoEstudio(lower);
  const esCualitativo = disenoInfo.enfoque === "cualitativo";
  const etiquetas = etiquetasEnfoque(disenoInfo.enfoque);

  const [p1, p2, p3] = esCualitativo
    ? construirPreguntasCualitativas(vi, vd, contexto, poblacion, areas)
    : construirPreguntas(vi, vd, contexto, poblacion, areas);
  const correlaciones = esCualitativo
    ? construirRelacionesCualitativas(vi, vd, contexto)
    : construirCorrelaciones(vi, vd, contexto);
  const hipotesis = esCualitativo
    ? construirProposicionesCualitativas(vi, vd, contexto, poblacion)
    : construirHipotesis(vi, vd, contexto, poblacion);
  const motivosMarcos = {};
  const marcos = sugerirMarcosTeoricos(lower, vi, vd, motivosMarcos);
  const operacionalizacion = construirOperacionalizacion(vi, vd, esCualitativo);
  const fuentes = sugerirFuentesDatos(lower, area, contexto);

  const resultadoParcial = {
    p1, p2, p3, vi, vd, correlaciones, hipotesis, marcos, area, areas,
    subdominios: subdoms,
    mecanismos: generarMecanismos(areas, subdoms, vi, vd, contexto),
    diseno: disenoInfo.texto, unidad: disenoInfo.unidad, enfoque: disenoInfo.enfoque,
    operacionalizacion, fuentes, viEsCandidato, intercambiado: !!opts.intercambiarViVd,
    etiquetas
  };
  resultadoParcial.guiaCualitativa = construirGuiaCualitativa(resultadoParcial);
  resultadoParcial.categoriasExplicativas = construirCategoriasExplicativas(lower, resultadoParcial);
  resultadoParcial.explicacionDeteccion = construirExplicacionDeteccion(vi, vd, areas, marcos, motivosVi, motivosVd, motivosArea, motivosMarcos, etiquetas);
  return resultadoParcial;
}

/* ================= guía cualitativa pre-CAQDAS (Atlas.ti / MAXQDA / NVivo) ================= */

/**
 * Libro de códigos preliminar + guía de entrevista/observación, pensados para
 * importarse como punto de partida en Atlas.ti, MAXQDA o NVivo antes de
 * codificar el material real. No sustituye la codificación inductiva del
 * propio material: son categorías de partida (deductivas y sensibilizadoras).
 */
function construirGuiaCualitativa(resultado) {
  const vi = resultado.vi || [];
  const vd = resultado.vd || [];
  const mecanismos = resultado.mecanismos || [];

  const codigos = [];
  const addCodigo = (categoria, tipo, definicion) => {
    if (!codigos.some(c => c.categoria === categoria)) codigos.push({ categoria, tipo, definicion });
  };

  vd.forEach(v => addCodigo(
    toTitleCase(v), "Código descriptivo (fenómeno central)",
    `Fragmentos donde la persona entrevistada describe, relata, ejemplifica o evalúa ${v}.`
  ));
  vi.forEach(v => addCodigo(
    toTitleCase(v), "Código explicativo (factor asociado)",
    `Fragmentos que vinculan ${v} con el fenómeno central, ya sea como causa, condición habilitante o justificación percibida por la persona entrevistada.`
  ));
  mecanismos.forEach(m => {
    const match = m.match(/^(Micro|Meso|Macro)\s*\(([^)]+)\):\s*(.+)$/);
    if (match) addCodigo(`${match[1]} · ${toTitleCase(match[2])}`, "Concepto sensibilizador", match[3]);
  });

  const preguntas = [];
  const vd0 = vd.length ? vd[0] : "el fenómeno estudiado";
  preguntas.push(`Cuéntame, con tus propias palabras, cómo describirías tu experiencia con ${vd0}.`);
  preguntas.push("¿Cuándo empezaste a notar o vivir esta situación? ¿Qué recuerdas de ese momento?");
  for (const v of vi.slice(0, 3)) {
    preguntas.push(`¿Qué papel crees que ha tenido ${v} en esta situación?`);
  }
  preguntas.push("¿Cómo ha respondido tu entorno (familia, institución, comunidad) ante esto?");
  preguntas.push("¿Qué cambiarías si pudieras, y por qué?");

  return { codigos, preguntas };
}

const NOTA_GUIA_CUALITATIVA = "Esta guía es un punto de partida para trabajo cualitativo: un libro de códigos preliminar (categorías deductivas y conceptos sensibilizadores) y una guía de entrevista/observación semiestructurada, pensados para importarse en Atlas.ti, MAXQDA o NVivo antes de codificar el material real. No sustituye la codificación inductiva que surja de los propios datos — ajusta, fusiona o descarta categorías según lo que encuentres en el campo.";

/* ================= síntesis del problema científico definitivo ================= */

/**
 * Funde la versión elegida del problema (P1/P2/P3) con el resto del análisis
 * en un párrafo de apertura ya redactado, del tipo que abriría un capítulo 1
 * de tesis o un apartado de planteamiento del problema.
 */
function construirProblemaPerfecto(resultado, versionLabel, preguntaElegida) {
  const vdTxt = skJoin(resultado.vd, "el fenómeno estudiado");
  const viTxt = skJoin(resultado.vi, "los factores explicativos identificados");
  const areaTxt = (resultado.area || "la sociología").toLowerCase();
  const unidad = resultado.unidad || "la población de estudio";
  const enfoque = resultado.enfoque || "mixto";

  const enfoqueTxt = enfoque === "cualitativo"
    ? "un abordaje cualitativo que permita comprender los sentidos y mecanismos implicados"
    : enfoque === "cuantitativo"
      ? "un abordaje cuantitativo que permita medir la magnitud y la asociación entre las variables"
      : "un abordaje mixto que combine la medición de la asociación con la comprensión de sus mecanismos";

  const p1 = `En el ámbito de ${areaTxt}, ${vdTxt} constituye un fenómeno social relevante cuyo estudio contribuye a comprender las dinámicas que lo producen y lo reproducen.`;
  const p2 = `Este trabajo se propone examinar la relación entre ${viTxt} y ${vdTxt}, centrando el análisis en ${unidad}, mediante ${enfoqueTxt}.`;
  const p3 = `Formulado como problema de investigación (${versionLabel}): ${preguntaElegida}`;

  return [p1, p2, p3].join("\n\n");
}

/* ================= exportador CSV (con nivel de medición) ================= */

function exportarCSV(resultado) {
  const filas = resultado.operacionalizacion;
  const limpiar = (s) => String(s).replace(/,/g, ";");
  const lineas = ["Variable,Tipo,Indicador,Unidad,Nivel de medición,Fuente"];
  for (const fila of filas) {
    lineas.push([fila.variable, fila.tipo, fila.indicador, fila.unidad, fila.nivel, fila.fuente].map(limpiar).join(","));
  }
  return lineas.join("\n");
}

/* ================= validación pedagógica SOCIOKAIROS EDU ================= */

let INTENTOS_FALLIDOS_EDU = 0;
let ULTIMO_PROBLEMA_EDU = "";

function contieneAlguno(texto, patrones) {
  return skContieneAlguno(texto, patrones);
}

function validarProblemaEdu(texto) {
  const original = (texto || "").trim();
  const t = original.toLowerCase();
  const fallos = [];

  const varsDetectadas = original ? detectarVariables(t) : { vi: [], vd: [] };

  const marcadoresRelacion = [
    "se relaciona", "se relacionan", "relación", "relacion", "correlación", "correlacion",
    "se correlaciona", "se correlacionan", "asociación", "asociacion", "se asocia", "se asocian",
    "influye", "influyen", "impacto", "efecto", "afecta", "afectan", "incide", "inciden",
    "explica", "explican", "determina", "determinan", "condiciona", "condicionan",
    "qué factores", "que factores", "cuáles son las causas", "cuales son las causas",
    "por qué", "por que", "porque", "cómo", "como", "de qué manera", "de que manera",
    "ejerce", "ejercen", "ejercer", "practica", "practican", "genera", "generan",
    "produce", "producen", "provoca", "provocan", "causa", "causan", "contribuye", "contribuyen",
    "aumenta", "aumentan", "reduce", "reducen", "incrementa", "incrementan", "disminuye", "disminuyen",
    "favorece", "favorecen", "predice", "predicen", "por qué razón", "que factor"
  ];
  // Coincidencia EXACTA aquí a propósito (no skContieneAlguno/tolerante):
  // son palabras cortas y muy frecuentes ("genera", "como", "causa"...), y
  // con tolerancia a erratas alguna de ellas coincide por accidente con
  // vocabulario de dominio no relacionado a distancia de edición 1 (p. ej.
  // "genera" con "género" — se detectó exactamente ese falso positivo al
  // escribir los tests). El coste de una errata real en un marcador de
  // relación es bajo (hay muchos marcadores, casi siempre alguno se escribe
  // bien); el coste de una falsa coincidencia aquí es alto porque este es
  // el primer requisito que decide si el problema pasa la validación.
  const tieneRelacion = marcadoresRelacion.some(p => t.includes(p));

  let tieneFecha = /\b(19|20)\d{2}\b/.test(t) || /\b\d{4}[-/]\d{4}\b/.test(t);
  const periodos = ["últimos años", "ultimos años", "últimos 5 años", "ultimos 5 años", "curso académico", "curso academico", "actualidad", "pospandemia", "durante"];
  tieneFecha = tieneFecha || contieneAlguno(t, periodos);

  const contextos = [
    "barrio", "barrios", "ciudad", "ciudades", "municipio", "municipios", "comarca", "comarcas",
    "provincia", "provincias", "comunidad autónoma", "comunidad autonoma", "país", "pais",
    "universidad", "instituto", "centro educativo", "escuela", "moodle", "campus", "distrito",
    "zaragoza", "aragón", "aragon", "españa", "espana", "cuba", "unizar", "torrero", "monegros",
    "daroca", "holguín", "holguin", "barcelona", "madrid", "valencia", "sevilla", "bilbao",
    "málaga", "malaga", "murcia", "palma", "alicante", "córdoba", "cordoba", "valladolid",
    "vigo", "gijón", "gijon", "oviedo", "granada", "vitoria", "santander", "pamplona",
    "logroño", "logrono", "toledo", "huesca", "teruel", "parís", "paris", "londres", "roma",
    "berlín", "berlin", "lisboa", "bruselas", "la habana", "habana", "buenos aires", "lima",
    "quito", "bogotá", "bogota", "caracas", "méxico", "mexico", "ciudad de méxico", "ciudad de mexico"
  ];
  let tieneContexto = contieneAlguno(t, contextos);
  if (!tieneContexto) {
    const patronToponimo = /\b(en|de|del|desde|para|sobre)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúüñ-]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúüñ-]+){0,3})/;
    tieneContexto = patronToponimo.test(original);
  }

  const unidades = [
    "estudiantes", "alumnado", "jóvenes", "jovenes", "familias", "mujeres", "hombres",
    "barrios", "barrio", "vecindario", "hogares", "profesorado", "trabajadores", "trabajadoras",
    "migrantes", "adolescentes", "población", "poblacion", "usuarios", "usuarias",
    "personas mayores", "colectivos", "comunidad", "comunidades", "clase trabajadora",
    "territorios", "territorio", "centros educativos", "universidades", "municipios", "ciudades"
  ];
  const tieneUnidad = contieneAlguno(t, unidades);

  const totalVarsDiccionario = varsDetectadas.vi.length + varsDetectadas.vd.length;
  const tieneDosVariablesDiccionario = totalVarsDiccionario >= 2 || (varsDetectadas.vi.length > 0 && varsDetectadas.vd.length > 0);

  const conectoresVariable = [" y ", " con ", " entre ", " frente a ", " sobre ", " respecto a "];
  const tieneDosVariablesPorTexto = tieneRelacion && conectoresVariable.some(c => t.includes(c));

  const tieneDosVariables = tieneDosVariablesDiccionario || tieneDosVariablesPorTexto;

  if (tieneRelacion && tieneDosVariables && tieneContexto && tieneFecha) {
    ULTIMO_PROBLEMA_EDU = original;
    return { valido: true, fallos: [], intentos: INTENTOS_FALLIDOS_EDU, variables_detectadas: varsDetectadas };
  }

  if (original.length < 45 || original.split(/\s+/).filter(Boolean).length < 8) {
    fallos.push("La formulación es demasiado breve: un problema científico necesita expresar una relación sociológica, no solo una pregunta cotidiana.");
  }

  const nombresComunes = ["paco", "juan", "pedro", "maría", "maria", "luis", "ana", "carlos", "pepe", "manolo"];
  const marcadoresIndividuales = ["mi amigo", "mi vecina", "mi vecino", "una persona", "un alumno", "una alumna"].concat(nombresComunes);
  const preguntaCotidiana = skContieneAlguno(t, ["cuánto dinero", "cuanto dinero", "qué dinero", "que dinero", "tiene dinero", "gana dinero"]);

  if (preguntaCotidiana || contieneAlguno(t, marcadoresIndividuales)) {
    fallos.push("La pregunta está formulada en clave individual o cotidiana. SOCIOKAIROS EDU requiere un fenómeno social y una unidad de análisis colectiva, no el caso aislado de una persona.");
  }

  if (!tieneRelacion || !tieneDosVariables) {
    fallos.push("Faltan al menos dos variables o dimensiones relacionadas: formula una relación entre un factor explicativo y un fenómeno a explicar.");
  }
  if (!tieneUnidad) {
    fallos.push("Falta la unidad social: indica a quién o qué estudiarás, por ejemplo estudiantes, jóvenes, familias, mujeres, barrios, profesorado o población.");
  }
  if (!tieneContexto) {
    fallos.push("Falta el contexto territorial o institucional: especifica dónde se realizará el estudio, por ejemplo Zaragoza, Sevilla, Madrid, una universidad, un barrio, una ciudad o un centro educativo.");
  }
  if (!tieneFecha) {
    fallos.push("Falta la fecha o periodo: añade un año, curso académico o marco temporal, por ejemplo 2024-2025, 2026 o últimos 5 años.");
  }

  const conceptosSociales = [
    "desigualdad", "pobreza", "género", "genero", "educación", "educacion", "salud", "empleo",
    "trabajo", "familia", "violencia", "participación", "participacion", "redes", "clase",
    "cultura", "exclusión", "exclusion", "precariedad", "migración", "migracion", "segregación",
    "segregacion", "inseguridad", "territorial", "urbana", "urbano"
  ];
  if (!contieneAlguno(t, conceptosSociales) && preguntaCotidiana) {
    fallos.push("No aparece un objeto sociológico reconocible. Reformula el caso como fenómeno social: desigualdad económica, renta, precariedad, clase social, hogares, juventud, territorio, etc.");
  }

  const esValido = fallos.length === 0;
  if (!esValido) {
    if (original !== ULTIMO_PROBLEMA_EDU) {
      INTENTOS_FALLIDOS_EDU += 1;
      ULTIMO_PROBLEMA_EDU = original;
    }
  } else {
    ULTIMO_PROBLEMA_EDU = original;
  }

  return { valido: esValido, fallos, intentos: INTENTOS_FALLIDOS_EDU, variables_detectadas: varsDetectadas };
}

function construirFeedbackValidacionEdu(validacion) {
  const fallos = validacion.fallos || [];
  const intentos = validacion.intentos || 0;
  const lineas = [];
  lineas.push(`SOCIOKAIROS EDU ha detectado ${fallos.length} fallo(s) epistemológico-estructural(es). Intentos fallidos acumulados: ${intentos}.`);
  lineas.push("");
  lineas.push("Antes de reformular, el problema inicial debe contener:");
  lineas.push("1. Variable(s) o dimensiones sociales relacionadas.");
  lineas.push("2. Unidad social de análisis.");
  lineas.push("3. Contexto territorial o institucional.");
  lineas.push("4. Fecha, curso o periodo temporal.");
  lineas.push("");
  lineas.push("Fallos detectados:");
  for (const f of fallos) lineas.push("- " + f);
  lineas.push("");
  lineas.push("Forma correcta orientativa:");
  lineas.push("¿Cómo influye [VI: precariedad laboral familiar / uso intensivo de redes / capital cultural] en [VD: rendimiento académico / salud mental / participación política] de [unidad social: estudiantes / jóvenes / familias] en [contexto: Zaragoza, Cuba, universidad, barrio] durante [periodo: 2024-2026 / curso 2025-2026 / últimos 5 años]?");
  lineas.push("");
  lineas.push("Ejemplo sociológico válido:");
  lineas.push("¿Cómo influye la precariedad laboral familiar en el rendimiento académico de estudiantes universitarios de Zaragoza durante el curso 2025-2026?");
  lineas.push("");
  lineas.push("Reformula el problema inicial y vuelve a pulsar el botón.");
  return lineas.join("\n");
}

/* ================= análisis ampliado: alertas, tradiciones, mapa, diseños ================= */

function generarAlertasMetodologicas(txt, resultado) {
  const t = (txt || "").toLowerCase();
  const vi = resultado.vi || [];
  const vd = resultado.vd || [];
  const areas = (resultado.areas || [resultado.area || ""]).join(" ").toLowerCase();
  const et = resultado.etiquetas || etiquetasEnfoque(resultado.enfoque);
  const alertas = [];

  if (!/\b(19|20)\d{2}\b/.test(txt || "")) {
    alertas.push("• Delimitar el periodo temporal: el problema necesita año, curso académico o intervalo de observación.");
  }

  if (vd.length === 0) {
    alertas.push(et.esCualitativo
      ? "• Precisar el fenómeno central: indicar con claridad qué se quiere comprender o explorar en profundidad."
      : "• Precisar la VD: indicar con claridad qué fenómeno se quiere explicar o medir.");
  } else {
    const vdTxt = skJoin(vd);
    if (skHas(vdTxt, ["precar", "trabajo", "empleo", "laboral"])) alertas.push("• Operacionalizar la precariedad laboral: distinguir temporalidad, parcialidad involuntaria, salario bajo, informalidad e inestabilidad contractual.");
    if (skHas(vdTxt, ["violencia"])) alertas.push("• Definir el tipo de violencia: física, psicológica, económica, sexual, institucional o simbólica; no tratarlas como equivalentes.");
    if (skHas(vdTxt, ["abandono", "deserc", "absentismo", "fracaso escolar"])) alertas.push("• Separar absentismo, abandono, fracaso escolar y bajo rendimiento: son fenómenos relacionados, pero no idénticos.");
    if (skHas(vdTxt, ["salud mental", "ansiedad", "depres"])) alertas.push("• Evitar diagnosticar clínicamente desde datos sociales generales: usar indicadores validados de malestar, riesgo o autopercepción.");
  }

  if (vi.length === 0) {
    alertas.push(et.esCualitativo
      ? "• Precisar las condiciones explicativas: el problema aún no muestra condiciones o factores suficientemente observables."
      : "• Precisar las VI: el problema aún no muestra factores explicativos suficientemente observables.");
  } else {
    for (const v of vi.slice(0, 4)) {
      const vl = v.toLowerCase();
      if (skHas(vl, ["nivel de instrucción", "instrucción", "educ", "formación"])) alertas.push("• Definir el nivel educativo máximo alcanzado y diferenciarlo de competencias, rendimiento o capital cultural.");
      if (skHas(vl, ["ingreso", "renta", "pobreza", "precar"])) alertas.push("• Especificar si la posición económica se medirá por renta, empleo, privación material, deuda o dependencia familiar.");
      if (skHas(vl, ["redes sociales", "digital", "internet"])) alertas.push("• Diferenciar uso, exposición, intensidad, tipo de plataforma y contenido consumido; no reducir lo digital a una sola variable.");
      if (skHas(vl, ["familia", "familiar", "hogar"])) alertas.push("• Desagregar familia/hogar en composición, recursos, expectativas, cuidados, normas y conflicto doméstico.");
    }
  }

  if (skHas(t, ["madrid", "zaragoza", "barcelona", "valencia", "sevilla", "bilbao"])) {
    if (!skHas(t, ["barrio", "segregación territorial", "segregacion territorial", "espacio urbano", "movilidad urbana", "vivienda"])) {
      alertas.push("• Tratar la ciudad mencionada como unidad territorial de observación, no como variable explicativa automática.");
    }
  }

  if (areas.includes("sociología urbana") && !skHas(t, ["barrio", "territorio", "vivienda", "segregación", "segregacion", "espacio urbano"])) {
    alertas.push("• Revisar la activación de sociología urbana: solo debe entrar si el espacio urbano es variable analítica, no simple lugar del estudio.");
  }

  if (alertas.length === 0) {
    return et.esCualitativo
      ? "• El problema presenta una estructura heurística adecuada. Mantener la coherencia entre condiciones explicativas, fenómeno central, población, territorio e indicadores."
      : "• El problema presenta una estructura heurística adecuada. Mantener la coherencia entre VI, VD, población, territorio e indicadores.";
  }
  return uniq(alertas).join("\n");
}

function generarTradiciones(resultado, txt) {
  const t = (txt || "").toLowerCase();
  const vi = resultado.vi || [];
  const vd = resultado.vd || [];
  const areas = resultado.areas || [resultado.area || ""];
  const total = areas.concat(vi, vd).join(" ").toLowerCase() + " " + t;
  const trad = [];
  const add = (x) => { if (!trad.includes(x)) trad.push(x); };

  if (skHas(total, ["trabajo", "empleo", "laboral", "precar"])) add("• Sociología del trabajo → segmentación laboral, precarización, trayectorias ocupacionales y vulnerabilidad contractual.");
  if (skHas(total, ["educación", "educacion", "instrucción", "instruccion", "escolar", "formación"])) add("• Sociología de la educación → reproducción de desigualdades educativas, capital cultural y credenciales escolares.");
  if (skHas(total, ["género", "genero", "hombres", "mujeres", "masculinidad", "masculinidades"])) add("• Sociología de género → masculinidades, división sexual del trabajo, mandatos de género y posiciones diferenciales de poder.");
  if (skHas(total, ["familia", "hogar", "cuidados"])) add("• Sociología de la familia → socialización, cuidados, normas domésticas, recursos familiares y reproducción intergeneracional.");
  if (skHas(total, ["pobreza", "renta", "desigualdad", "clase", "exclusión", "exclusion"])) add("• Sociología de la desigualdad → clase social, recursos, privación material y mecanismos de acumulación/desventaja.");
  if (skHas(total, ["violencia", "control", "dominación", "dominacion"])) add("• Sociología del poder y la dominación → asimetrías, control social, violencia simbólica e institucionalización de jerarquías.");
  if (skHas(total, ["salud", "salud mental", "ansiedad", "depres"])) add("• Sociología de la salud → determinantes sociales, desigualdades sanitarias y producción social del malestar.");
  if (skHas(total, ["barrio", "territorio", "vivienda", "segregación", "segregacion", "urbano"])) add("• Sociología urbana y territorial → segregación, estigma territorial, recursos de proximidad e infraestructuras relacionales.");
  if (skHas(total, ["redes sociales", "digital", "algorit", "internet", "plataforma"])) add("• Sociología digital → mediaciones algorítmicas, plataformas, circulación de discursos y desigualdades digitales.");
  if (skHas(total, ["emoc", "afect", "miedo", "ira", "esperanza", "resentimiento"])) add("• Sociología de las emociones → producción social de afectos, legitimidad emocional y climas afectivos colectivos.");

  if (trad.length === 0) {
    add("• Sociología comprensiva → sentido de la acción, posiciones sociales y relación entre experiencia y estructura.");
    add("• Teoría de la estructuración / sociología relacional → vínculos entre prácticas, instituciones y condiciones sociales.");
  }
  return trad.join("\n");
}

function generarMapaLogico(resultado) {
  const vi = resultado.vi || [];
  const vd = resultado.vd || [];
  const areas = (resultado.areas || [resultado.area || ""]).join(" ").toLowerCase();
  const viTxt = skJoin(vi, "factores explicativos");
  const vdTxt = skJoin(vd, "fenómeno a explicar");

  const mecanismos = [];
  const total = (viTxt + " " + vdTxt + " " + areas).toLowerCase();
  if (skHas(total, ["educ", "instrucción", "instruccion"])) mecanismos.push("capital educativo / credenciales disponibles");
  if (skHas(total, ["trabajo", "empleo", "laboral", "precar"])) mecanismos.push("segmentación del mercado laboral");
  if (skHas(total, ["género", "genero", "hombres", "masculinidad"])) mecanismos.push("mandatos de género y trayectorias masculinas");
  if (skHas(total, ["familia", "hogar"])) mecanismos.push("recursos y normas familiares");
  if (skHas(total, ["pobreza", "renta", "clase"])) mecanismos.push("posición de clase y disponibilidad de recursos");
  if (skHas(total, ["barrio", "territorio", "urbano", "segreg"])) mecanismos.push("oportunidades territoriales y estigma espacial");
  if (skHas(total, ["redes sociales", "digital", "algorit"])) mecanismos.push("exposición digital y mediación algorítmica");
  if (skHas(total, ["violencia", "dominación", "control"])) mecanismos.push("asimetrías de poder y control social");

  if (mecanismos.length) {
    return viTxt + "\n        ↓\n" + mecanismos.slice(0, 4).join(" + ") + "\n        ↓\n" + vdTxt;
  }
  if (vi.length && vd.length) return viTxt + "\n        ↓\n" + vdTxt;
  const et = resultado.etiquetas || etiquetasEnfoque(resultado.enfoque);
  return et.esCualitativo
    ? "Problema científico\n        ↓\nDefinición de condiciones explicativas / fenómeno central\n        ↓\nMecanismo sociológico\n        ↓\nFenómeno observable"
    : "Problema científico\n        ↓\nDefinición de VI/VD\n        ↓\nMecanismo sociológico\n        ↓\nFenómeno observable";
}

function generarDisenos(txt, resultado) {
  resultado = resultado || {};
  const t = (txt || "").toLowerCase();
  const vi = resultado.vi || [];
  const vd = resultado.vd || [];
  const areas = (resultado.areas || [resultado.area || ""]).join(" ").toLowerCase();
  const et = resultado.etiquetas || etiquetasEnfoque(resultado.enfoque);
  const total = t + " " + vi.concat(vd).join(" ").toLowerCase() + " " + areas;
  const salidas = [];

  if (skHas(total, ["relación", "relacion", "influye", "asocia", "correl", "probabilidad"])) {
    salidas.push(et.esCualitativo
      ? "• Estudio de casos comparado → adecuado para explorar en profundidad cómo se relacionan las condiciones explicativas con el fenómeno central en la población definida."
      : "• Encuesta transversal analítica → adecuada para estimar asociaciones entre VI y VD en la población definida.");
  }
  if (skHas(total, ["trabajo", "empleo", "laboral", "precar"])) salidas.push("• Análisis secundario de datos laborales → EPA/INE, registros administrativos o fuentes municipales para contrastar empleo, temporalidad y ocupación.");
  if (skHas(total, ["educ", "instrucción", "instruccion", "formación"])) salidas.push("• Cruce educación–resultado social → matriz entre nivel formativo alcanzado y el fenómeno dependiente observado.");
  if (skHas(total, ["género", "genero", "hombres", "mujeres", "masculinidad"])) salidas.push("• Entrevistas semiestructuradas por perfiles → permiten reconstruir trayectorias, mandatos de género y significados atribuidos al fenómeno.");
  if (skHas(total, ["violencia", "miedo", "emoc", "sentido", "experiencia"])) salidas.push("• Diseño cualitativo interpretativo → entrevistas, relatos de experiencia o grupos focales para captar significados, silencios y justificaciones.");
  if (skHas(total, ["barrio", "territorio", "urbano", "segreg", "vivienda"])) salidas.push("• Estudio de caso territorial → útil cuando el espacio funciona como mecanismo explicativo y no solo como lugar de observación.");
  if (skHas(total, ["redes sociales", "digital", "internet", "plataforma", "algorit"])) salidas.push("• Etnografía digital / análisis de contenido → apropiado para discursos, interacciones y circulación algorítmica de significados.");
  if (skHas(total, ["familia", "hogar", "cuidados"])) salidas.push("• Entrevistas familiares o estudio de hogares → útil para analizar recursos, normas, cuidados y conflictos intradomésticos.");

  salidas.push("• Diseño mixto secuencial → recomendable si se quiere combinar medición de asociaciones con explicación cualitativa de mecanismos.");

  return uniq(salidas).slice(0, 6).join("\n");
}

/* ================= consejos de director de tesis ================= */
/* Tres bloques en el tono de un profesor senior de metodología de la
 * investigación: no listan fortalezas del problema (eso ya lo hacen otras
 * secciones), sino que anticipan lo que preguntaría/objetaría un director
 * de tesis o un tribunal — construidos a partir del resultado real
 * (VI/VD, diseño, fuentes, enfoque), no como texto genérico repetido para
 * cualquier problema. */

function generarPreguntasSocraticas(txt, resultado) {
  resultado = resultado || {};
  const t = (txt || "").toLowerCase();
  const vi = resultado.vi || [];
  const vd = resultado.vd || [];
  const et = resultado.etiquetas || etiquetasEnfoque(resultado.enfoque);
  const viTxt = skJoin(vi, et.esCualitativo ? "tu condición explicativa" : "tu variable independiente");
  const vdTxt = skJoin(vd, et.esCualitativo ? "tu fenómeno central" : "tu variable dependiente");
  const diseno = (resultado.diseno || "").toLowerCase();
  const preguntas = [];

  preguntas.push("• ¿Por qué esta población, este territorio y este periodo, y no otro comparable? ¿Qué cambiaría en tus conclusiones si compararas con otro grupo, ciudad o momento?");
  preguntas.push(et.esCualitativo
    ? `• Más allá de ${viTxt}, ¿qué otra condición o significado alternativo podría dar cuenta de ${vdTxt}? ¿Cómo lo vas a explorar en el análisis, y no solo mencionar?`
    : `• Más allá de ${viTxt}, ¿qué explicación rival podría producir el mismo efecto sobre ${vdTxt}? ¿Cómo la vas a descartar o controlar, y no solo mencionar?`);

  if (diseno.includes("transversal") || skHas(t, ["transversal"])) {
    preguntas.push(`• Tu diseño es transversal — una sola medición en el tiempo. Si el tribunal pregunta cómo sabes que ${viTxt} precede a ${vdTxt} y no al revés, ¿qué vas a responder?`);
  } else if (et.esCualitativo) {
    preguntas.push(`• Si observas una relación entre ${viTxt} y ${vdTxt}, ¿qué evidencia adicional (más casos, más voces, triangulación de fuentes) necesitarías para defender que es un patrón consistente y no una interpretación apresurada de unos pocos casos?`);
  } else {
    preguntas.push(`• Si encuentras una asociación entre ${viTxt} y ${vdTxt}, ¿qué evidencia adicional necesitarías para defender que es una relación causal y no una coincidencia estadística?`);
  }

  if ((resultado.enfoque || "") === "cuantitativo") {
    preguntas.push("• Tus datos podrán decirte SI hay asociación. Si alguien te pregunta POR QUÉ ocurre — el mecanismo, no solo el patrón — ¿qué le respondes con lo que has diseñado hasta ahora?");
  }

  return preguntas.slice(0, 4).join("\n");
}

function generarPuntosDebilesADefender(txt, resultado) {
  resultado = resultado || {};
  const vi = resultado.vi || [];
  const vd = resultado.vd || [];
  const et = resultado.etiquetas || etiquetasEnfoque(resultado.enfoque);
  const diseno = (resultado.diseno || "").toLowerCase();
  const debiles = [];

  if (diseno.includes("transversal")) {
    debiles.push("• Diseño transversal: una sola medición no permite establecer secuencia temporal ni descartar causalidad inversa. Defiéndelo explícitamente en el trabajo — no lo des por supuesto.");
  }

  if ((resultado.fuentes || []).length <= 1) {
    debiles.push("• Dependencia de una única fuente de datos: si esa fuente cambia de metodología, deja de publicarse o tiene sesgos de cobertura, todo el estudio queda expuesto. Busca al menos una fuente de contraste.");
  }

  if (vi.length > 1) {
    debiles.push(et.esCualitativo
      ? `• Con más de una condición explicativa (${skJoin(vi)}), hay riesgo de confundir su peso relativo: si no las distingues con cuidado en el análisis, no podrás precisar cómo se relaciona cada una con ${skJoin(vd, "el fenómeno central")}.`
      : `• Con más de una VI (${skJoin(vi)}), hay riesgo de confusión entre ellas: si no las mides ni controlas por separado, no podrás atribuir el efecto sobre ${skJoin(vd, "la VD")} a una en concreto.`);
  }

  if ((resultado.enfoque || "") === "cuantitativo") {
    debiles.push("• Enfoque solo cuantitativo: podrás afirmar SI existe asociación, pero difícilmente explicarás POR QUÉ ocurre sin datos cualitativos complementarios sobre significados y mecanismos.");
  }

  debiles.push("• Tamaño y representatividad de la muestra: sin especificar cuántos casos y cómo se seleccionaron, cualquier hallazgo es, en el mejor de los casos, provisional.");

  return uniq(debiles).slice(0, 5).join("\n");
}

function generarGuiaBusquedaBibliografica(resultado) {
  resultado = resultado || {};
  const vi = resultado.vi || [];
  const vd = resultado.vd || [];
  const areas = resultado.areas || [resultado.area || ""];
  const limpiar = (x) => String(x || "").replace(/^(el|la|los|las|un|una)\s+/i, "").trim();
  const terminos = uniq(vi.concat(vd).map(limpiar).filter(Boolean));
  const guia = [];

  guia.push("• Bases de datos: Google Scholar y Dialnet para literatura en español; Scopus y Web of Science para cobertura internacional; INE/IAEST/Eurostat (según el ámbito geográfico) para datos oficiales.");

  if (terminos.length >= 2) {
    guia.push(`• Combinaciones de búsqueda a probar: "${terminos[0]}" AND "${terminos[1]}"; repite la búsqueda con la traducción al inglés de ambos términos — muchas bases indexan mejor en inglés incluso para temas locales.`);
  } else if (terminos.length === 1) {
    guia.push(`• Combina "${terminos[0]}" con el nombre de tu área sociológica (${areas[0] || "tu área"}) para acotar los resultados.`);
  }

  guia.push("• Bola de nieve hacia atrás: revisa la bibliografía de los 2-3 artículos más relevantes que encuentres — te llevará a los autores fundacionales del marco teórico.");
  guia.push("• Bola de nieve hacia adelante: usa la opción «Citado por» de Google Scholar sobre esos mismos artículos para encontrar aplicaciones o críticas más recientes.");
  guia.push("• Criterio de corte: prioriza fuentes de los últimos 10 años, salvo que sean el texto fundacional del marco teórico que estés usando.");

  return guia.join("\n");
}

/* ================= revisión de coherencia final ================= */
/* Un director de tesis no solo revisa que el problema esté bien
 * formulado: revisa que lo que el estudiante ESCRIBE de su puño y letra
 * (la justificación teórica libre) no contradiga el enfoque metodológico
 * que el propio problema activó. Esta revisión es determinista: busca
 * marcadores léxicos concretos y, si encuentra alguno, dice exactamente
 * cuál — nunca "hay un problema" sin más (mismo principio de
 * transparencia que motivosVi/motivosVd). No evalúa el contenido teórico
 * en sí (eso sigue siendo criterio del estudiante), solo la coherencia
 * terminológica entre enfoque y justificación. */
const MARCADORES_CUANTI_EN_TEXTO_LIBRE = [
  { patron: /\bvi\b/i, etiqueta: "VI" },
  { patron: /\bvd\b/i, etiqueta: "VD" },
  { patron: /variable\s+independiente/i, etiqueta: "variable independiente" },
  { patron: /variable\s+dependiente/i, etiqueta: "variable dependiente" },
  { patron: /correlaci[oó]n/i, etiqueta: "correlación" },
  { patron: /hip[oó]tesis/i, etiqueta: "hipótesis" },
  { patron: /\bh1\.?\b/i, etiqueta: "H1" },
  { patron: /significativ(o|a|amente)/i, etiqueta: "significatividad estadística" },
  { patron: /regresi[oó]n/i, etiqueta: "regresión" },
  { patron: /coeficiente/i, etiqueta: "coeficiente" },
  { patron: /p-valor|valor\s+p\b/i, etiqueta: "p-valor" },
];
const MARCADORES_CUALI_EN_TEXTO_LIBRE = [
  { patron: /fen[oó]meno\s+central/i, etiqueta: "fenómeno central" },
  { patron: /condici[oó]n(es)?\s+explicativa/i, etiqueta: "condición explicativa" },
  { patron: /proposici[oó]n(es)?\s+orientadora/i, etiqueta: "proposición orientadora" },
];

function generarRevisionCoherencia(resultado, justificacionMarcos) {
  resultado = resultado || {};
  const et = resultado.etiquetas || etiquetasEnfoque(resultado.enfoque);
  const texto = justificacionMarcos || "";
  const avisos = [];

  if (texto.trim()) {
    const marcadores = et.esCualitativo ? MARCADORES_CUANTI_EN_TEXTO_LIBRE : MARCADORES_CUALI_EN_TEXTO_LIBRE;
    const encontrados = uniq(marcadores.filter(m => m.patron.test(texto)).map(m => m.etiqueta));
    if (encontrados.length) {
      const enfoqueTxt = et.esCualitativo ? "cualitativo" : (resultado.enfoque || "cuantitativo/mixto");
      avisos.push(`• SOCIOKAIROS detectó tu problema como de enfoque ${enfoqueTxt}, pero tu justificación teórica usa lenguaje de ${et.esCualitativo ? "la tradición cuantitativa" : "la tradición cualitativa"} (${encontrados.join(", ")}). Revisa si es un desliz de redacción o si el enfoque real de tu estudio es otro — en ese caso, reformula el problema con vocabulario acorde antes de entregarlo.`);
    }
  }

  if (resultado.intercambiado && !texto.trim()) {
    avisos.push(`• Has intercambiado la dirección ${et.esCualitativo ? "de condición explicativa / fenómeno central" : "VI ↔ VD"} respecto a la sugerida por el motor, pero tu justificación teórica está vacía: argumenta por escrito por qué esta dirección es la correcta para tu problema.`);
  }

  if (avisos.length === 0) {
    return "SOCIOKAIROS no ha detectado incoherencias terminológicas entre el enfoque metodológico detectado y tu justificación teórica.";
  }
  return "Revisión de coherencia:\n" + avisos.join("\n");
}

/* ================= visualización SVG heurística ================= */

function skSvgEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function skCompactLabel(value, limit) {
  limit = limit || 42;
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return text.slice(0, Math.max(8, limit - 1)).trimEnd() + "…";
}

function skFirst(items, fallback) {
  if (Array.isArray(items) && items.length) return String(items[0]);
  return fallback;
}

function skMecanismoPorArea(areaText, viLabel) {
  const area = (areaText || "").toLowerCase();
  const vi = (viLabel || "").toLowerCase();
  if (area.includes("educación") || area.includes("educacion") || vi.includes("instrucción") || vi.includes("instruccion") || vi.includes("educativo")) return "capital educativo / credenciales";
  if (area.includes("trabajo") || vi.includes("laboral") || vi.includes("empleo")) return "posición laboral / segmentación";
  if (area.includes("género") || area.includes("genero") || vi.includes("hombre") || vi.includes("mujer")) return "normas de género / trayectorias";
  if (area.includes("pobreza") || vi.includes("ingreso") || vi.includes("renta")) return "recursos materiales";
  if (area.includes("salud")) return "bienestar / vulnerabilidad";
  if (area.includes("política") || area.includes("politica")) return "orientaciones políticas / legitimidad";
  return "mecanismo social intermedio";
}

function skSvgTag(name, attrs, content, selfClose) {
  attrs = attrs || {};
  const attrTxt = Object.entries(attrs).filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => ` ${k}="${skSvgEscape(v)}"`).join("");
  if (selfClose) return `<${name}${attrTxt} />`;
  return `<${name}${attrTxt}>${content || ""}</${name}>`;
}

function skLayerDomains(resultado) {
  resultado = resultado || {};
  const terms = [
    (resultado.areas || []).join(" "),
    String(resultado.area || ""),
    (resultado.vi || []).join(" "),
    (resultado.vd || []).join(" "),
    (resultado.subdominios || []).join(" ")
  ].join(" ").toLowerCase();

  let activos = SK_DOMINIOS.filter(d => d.keys.some(k => terms.includes(k)));
  if (activos.length === 0) {
    activos = [{
      macro: "estructura social y distribución de oportunidades",
      meso: "instituciones, redes y mediaciones colectivas",
      micro: "experiencias situadas, decisiones y trayectorias"
    }];
  }
  activos = activos.slice(0, 3);

  const merge = (level) => {
    const piezas = [];
    for (const d of activos) {
      for (let frag of d[level].split(" y ")) {
        frag = frag.trim();
        if (frag && !piezas.includes(frag)) piezas.push(frag);
      }
    }
    return skCompactLabel(piezas.join(" / "), 76);
  };

  return [merge("macro"), merge("meso"), merge("micro")];
}

function generarSvgVisual(resultado, modo) {
  modo = modo || "causal";
  resultado = resultado || {};
  const viList = resultado.vi || [];
  const vdList = resultado.vd || [];
  const areas = resultado.areas || (resultado.area ? [resultado.area] : []);
  const vi1 = skCompactLabel(skFirst(viList, "Variable independiente"), 36);
  const vi2 = viList.length > 1 ? skCompactLabel(viList[1], 32) : "Condicionante social";
  const vd1 = skCompactLabel(skFirst(vdList, "Variable dependiente"), 36);
  const areaText = areas.filter(Boolean).join(" · ");
  const mecanismo1 = skCompactLabel(skMecanismoPorArea(areaText, vi1), 34);
  const mecanismo2 = skCompactLabel(skMecanismoPorArea(areaText, vi2), 34);

  const text = (x, y, value, size, weight, anchor) => skSvgTag("text", {
    x, y, "text-anchor": anchor || "middle", "font-size": size || 13, "font-weight": weight || "500",
    "font-family": "Arial, sans-serif", fill: "#111827"
  }, skSvgEscape(value));

  const box = (x, y, w, h, value, size) =>
    skSvgTag("rect", { x, y, width: w, height: h, rx: 14, fill: "#ffffff", stroke: "#111827", "stroke-width": "1.2" }, "", true) +
    text(x + w / 2, y + h / 2 + 5, value, size || 13);

  const arrow = (x1, y1, x2, y2) => skSvgTag("line", { x1, y1, x2, y2, stroke: "#111827", "stroke-width": "1.6", "marker-end": "url(#arrow)" }, "", true);

  const markerPath = skSvgTag("path", { d: "M0,0 L0,6 L9,3 z", fill: "#111827" }, "", true);
  const marker = skSvgTag("marker", { id: "arrow", markerWidth: 10, markerHeight: 10, refX: 8, refY: 3, orient: "auto", markerUnits: "strokeWidth" }, markerPath);
  const defs = skSvgTag("defs", {}, marker);
  // Fondo claro fijo dentro del propio SVG: el texto/los nodos usan colores
  // oscuros codificados y, si no hay un fondo propio, quedan ilegibles
  // cuando la página está en modo oscuro (el contenedor alrededor sí cambia
  // de color, pero el interior del SVG no debía depender de eso).
  const fondo = (w, h) => skSvgTag("rect", { x: 0, y: 0, width: w, height: h, fill: "#f7faf7", rx: 12 }, "", true);

  if (modo === "red") {
    const parts = [`<svg viewBox="0 0 760 310" width="100%" height="310" xmlns="http://www.w3.org/2000/svg">`, defs, fondo(760, 310)];
    parts.push(text(380, 28, "Red sociológica de variables", 16, "700"));
    const nodes = [[180, 120, vi1], [380, 90, vi2], [580, 120, vd1]];
    if (areas.length) nodes.push([380, 220, skCompactLabel(areas[0], 34)]);
    for (const [a, b] of [[0, 1], [1, 2], [0, 3], [2, 3]]) {
      if (a < nodes.length && b < nodes.length) {
        parts.push(skSvgTag("line", { x1: nodes[a][0], y1: nodes[a][1], x2: nodes[b][0], y2: nodes[b][1], stroke: "#6b7280", "stroke-width": "1.2" }, "", true));
      }
    }
    for (const [x, y, label] of nodes) {
      parts.push(skSvgTag("circle", { cx: x, cy: y, r: 58, fill: "#ffffff", stroke: "#111827", "stroke-width": "1.2" }, "", true));
      parts.push(text(x, y + 4, label, 12));
    }
    parts.push("</svg>");
    return parts.join("");
  }

  if (modo === "capas") {
    const [macro, meso, micro] = skLayerDomains(resultado);
    const parts = [`<svg viewBox="0 0 760 330" width="100%" height="330" xmlns="http://www.w3.org/2000/svg">`, defs, fondo(760, 330)];
    parts.push(text(380, 28, "Capas sociales del problema", 16, "700"));
    parts.push(box(80, 55, 600, 58, "MACRO · " + macro, 12));
    parts.push(arrow(380, 113, 380, 138));
    parts.push(box(80, 140, 600, 58, "MESO · " + meso, 12));
    parts.push(arrow(380, 198, 380, 223));
    parts.push(box(80, 225, 600, 58, "MICRO · " + micro, 12));
    parts.push(text(380, 310, `Objeto: ${vd1}`, 12, "600"));
    parts.push("</svg>");
    return parts.join("");
  }

  const parts = [`<svg viewBox="0 0 760 360" width="100%" height="360" xmlns="http://www.w3.org/2000/svg">`, defs, fondo(760, 360)];
  parts.push(text(380, 28, "Mapa causal del problema", 16, "700"));
  parts.push(box(60, 70, 220, 55, vi1, 13));
  parts.push(arrow(280, 98, 330, 98));
  parts.push(box(330, 70, 190, 55, mecanismo1, 12));
  parts.push(arrow(520, 98, 570, 98));
  parts.push(box(570, 70, 150, 55, vd1, 13));
  parts.push(box(155, 210, 220, 55, vi2, 12));
  parts.push(arrow(375, 238, 430, 238));
  parts.push(box(430, 210, 210, 55, mecanismo2, 12));
  parts.push(arrow(535, 210, 630, 126));
  if (areaText) parts.push(text(380, 320, "Áreas: " + skCompactLabel(areaText, 90), 12, "500"));
  parts.push("</svg>");
  return parts.join("");
}

if (typeof module !== "undefined") {
  module.exports = {
    analizarProblema, exportarCSV, detectarContextoYPoblacion, sugerirFuentesDatos,
    validarProblemaEdu, construirFeedbackValidacionEdu,
    generarAlertasMetodologicas, generarTradiciones, generarMapaLogico, generarDisenos,
    generarSvgVisual, operacionalizacionTexto,
    NOTA_DIRECCIONALIDAD_VIVD, NOTA_JUSTIFICAR_MARCOS, NOTA_VI_CANDIDATA, PAUTAS_MARCO_TEORICO,
    geoDetectar, geoFuentes, detectarVariables, detectarAreaSociologica, sugerirMarcosTeoricos,
    candidatosViPorDominio,
    clasificarEnfoqueMetodologico, sugerirDisenoEstudio,
    construirGuiaCualitativa, NOTA_GUIA_CUALITATIVA, construirProblemaPerfecto,
    skContienePatron, skContieneAlguno, skDistanciaEdicion, validarProblemaEdu,
    construirHipotesis, construirCorrelaciones,
    construirCategoriasExplicativas, NOTA_CATEGORIAS_EXPLICATIVAS,
    detectarErratasSospechosas, VOCABULARIO_DOMINIO,
    construirExplicacionDeteccion, skContieneAlgunoTrack,
    generarPreguntasSocraticas, generarPuntosDebilesADefender, generarGuiaBusquedaBibliografica,
    construirPreguntasCualitativas, construirRelacionesCualitativas, construirProposicionesCualitativas,
    etiquetasEnfoque, generarRevisionCoherencia,
  };
}
