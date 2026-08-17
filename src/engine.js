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

function skDistanciaEdicion(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
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

  const addVi = (x) => {
    x = (x || "").trim();
    if (x && !vi.includes(x) && !vd.includes(x)) vi.push(x);
  };
  const addVd = (x) => {
    x = (x || "").trim();
    if (x && !vd.includes(x)) vd.push(x);
    const idx = vi.indexOf(x);
    if (idx !== -1) vi.splice(idx, 1);
  };
  const hasAny = (words) => skContieneAlguno(l, words);

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
  } else if (skContienePatron(l, "violencia")) {
    addVd("la violencia");
  }
  if (hasAny(["salud mental", "problemas de salud mental", "malestar emocional", "bienestar psicológico", "bienestar psicologico"])) {
    addVd("el malestar emocional y la salud mental");
  } else if (hasAny(["morbilidad", "mortalidad", "enfermedad"])) {
    addVd("los problemas de salud");
  }
  if (hasAny(["abandono escolar", "deserción escolar", "desercion escolar", "fracaso escolar"])) {
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
  let viEsCandidato = false;
  if (vi.length === 0) {
    for (const c of candidatosViPorDominio(vd.length ? vd[0] : "")) addVi(c);
    viEsCandidato = true;
  }

  // Limpieza final: eliminar comodines heredados si hay variables reales.
  vi = vi.filter(x => !["las desigualdades estructurales", "las condiciones sociales explicativas"].includes(x));
  vd = vd.filter(x => x !== "el problema social formulado");
  if (vi.length === 0) { for (const c of candidatosViPorDominio(vd.length ? vd[0] : "")) addVi(c); viEsCandidato = true; }
  if (vd.length === 0) addVd("el fenómeno social estudiado");

  return { vi, vd, viEsCandidato };
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
  return ["variables sociodemográficas básicas (edad, sexo, nivel educativo, situación laboral)", "el contexto territorial e institucional del problema"];
}

/* ================= área sociológica y subdominios ================= */

function detectarAreaSociologica(lower, vi, vd) {
  const l0 = lower || "";
  const l = l0 + " " + vi.concat(vd).join(" ").toLowerCase();
  const areas = [];
  const add = (a) => { if (!areas.includes(a)) areas.push(a); };

  if (skContieneAlguno(l, ["pobreza energética", "pobreza energetica", "pobreza", "exclusión social", "exclusion social", "condiciones económicas", "condiciones economicas"])) add("Sociología de la pobreza y la desigualdad");
  if (skContieneAlguno(l, ["energética", "energetica", "vivienda", "residencial", "habitacional", "suministro energético", "suministro energetico"])) add("Sociología de la vivienda y la energía");
  if (skContieneAlguno(l, ["jóvenes", "jovenes", "juventud", "juvenil", "adolescentes", "18 a 25"])) add("Sociología de la juventud");
  if (skContieneAlguno(l, ["violencia de género", "violencia de genero", "género", "genero", "mujer", "mujeres", "hombres", "varones", "masculinidad", "masculinidades", "machismo", "patriarcado"])) add("Sociología de género");
  if (skContieneAlguno(l, ["familia", "familiares", "hogar", "dinámicas familiares", "dinamicas familiares", "padres", "madres"])) add("Sociología de la familia");
  if (skContieneAlguno(l, ["educación", "educacion", "escuela", "abandono escolar", "deserción", "desercion", "fracaso escolar", "nivel de instrucción", "nivel de instruccion", "nivel educativo", "capital cultural"])) add("Sociología de la educación");
  if (skContieneAlguno(l, ["trabajo", "empleo", "laboral", "paro", "desempleo", "salario", "oportunidades laborales", "precariedad laboral"])) add("Sociología del trabajo");
  if (skContieneAlguno(l, ["salud", "enfermedad", "ansiedad", "depresión", "depresion", "malestar emocional"])) add("Sociología de la salud");
  if (skContieneAlguno(l, ["emociones", "afectos", "miedo", "ira", "soledad"])) add("Sociología de las emociones");
  if (skContieneAlguno(l, ["cultura", "identidad", "representaciones", "valores"])) add("Sociología de la cultura");
  if (skContieneAlguno(l, ["política", "politica", "voto", "partido", "hegemonía", "hegemonia", "radicalización", "radicalizacion"])) add("Sociología política");
  if (skContieneAlguno(l, ["conocimiento", "normalidad", "sentido común", "sentido comun", "cognitivo"])) add("Sociología del conocimiento");
  if (["barrio", "barrios", "vecindario", "segregación territorial", "segregacion territorial", "segregación urbana", "segregacion urbana", "gentrificación", "gentrificacion", "desigualdad urbana", "estigma territorial", "periferia", "periférico", "periferico", "periféricos", "perifericos"].some(x => l0.includes(x))) add("Sociología urbana");
  if (skContieneAlguno(l, ["digital", "internet", "algoritmo", "redes sociales", "brecha digital", "tiktok"])) add("Sociología digital y algorítmica");
  if (skContieneAlguno(l, ["migración", "migracion", "inmigración", "inmigracion", "migrante", "migrantes", "refugiados", "refugiadas", "asilo"])) add("Sociología de las migraciones");
  if (skContieneAlguno(l, ["discapacidad", "diversidad funcional", "accesibilidad", "dependencia funcional"])) add("Sociología de la discapacidad");
  if (skContieneAlguno(l, ["cambio climático", "cambio climatico", "medio ambiente", "sostenibilidad", "contaminación", "contaminacion", "crisis climática", "crisis climatica"])) add("Sociología ambiental");
  if (skContieneAlguno(l, ["rural", "ruralidad", "despoblación", "despoblacion", "éxodo rural", "exodo rural"])) add("Sociología rural");
  if (skContieneAlguno(l, ["religión", "religion", "religiosidad", "secularización", "secularizacion", "creencias religiosas"])) add("Sociología de la religión");

  if (areas.length === 0) add("Sociología general / del cambio social");
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

  if (tipo === "VI") {
    return { variable: nombre, tipo, indicador: `Escala / índice que mida «${nombre}» en la población de estudio`, unidad: "Puntuación en escala (1–5 / 1–10)", nivel: "Ordinal (escala tipo Likert)", fuente: "Cuestionario a población objetivo u observaciones estructuradas" };
  }
  return { variable: nombre, tipo, indicador: `Indicador observable de «${nombre}» definido para el contexto del estudio`, unidad: "Índice / escala / proporción", nivel: "Ordinal o de razón, según el indicador concreto elegido", fuente: "Encuestas, registros administrativos o datos secundarios" };
}

function construirOperacionalizacion(vi, vd) {
  const filas = [];
  for (const v of vi) filas.push(indicadoresParaVariable(v, "VI"));
  for (const v of vd) filas.push(indicadoresParaVariable(v, "VD"));
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

function sugerirMarcosTeoricos(lower, vi, vd) {
  const marcos = [];
  const total = (lower || "") + " " + vi.concat(vd).join(" ").toLowerCase();
  const add = (x) => { if (!marcos.includes(x)) marcos.push(x); };

  if (skContieneAlguno(total, ["violencia de género", "violencia de genero", "género", "genero", "masculinidad", "masculinidades", "hombres", "machismo"])) {
    add("Connell: masculinidades, masculinidad hegemónica y relaciones de género");
    add("Butler: performatividad de género y normas corporales/sociales");
    add("Bourdieu: dominación masculina y violencia simbólica");
  }
  if (skContieneAlguno(total, ["familia", "familiares", "hogar"])) {
    add("Berger y Luckmann: socialización primaria, construcción social de la realidad");
    add("Bourdieu: habitus familiar, capital cultural y reproducción");
  }
  if (skContieneAlguno(total, ["educación", "educacion", "abandono escolar", "deserción", "desercion", "fracaso escolar"])) {
    add("Bourdieu y Passeron: reproducción educativa, capital cultural y desigualdad escolar");
    add("Bernstein: códigos lingüísticos y desigualdad educativa");
  }
  if (skContieneAlguno(total, ["trabajo", "empleo", "laboral", "precariedad"])) {
    add("Marx: trabajo, explotación y relaciones de clase");
    add("Standing: precariado y nuevas formas de inseguridad laboral");
  }
  if (skContieneAlguno(total, ["salud", "enfermedad", "salud mental", "ansiedad", "depresión", "depresion"])) {
    add("Marmot: determinantes sociales de la salud");
    add("Foucault: biopolítica, cuerpos e instituciones");
  }
  if (skContieneAlguno(total, ["digital", "algoritmo", "internet", "redes sociales"])) {
    add("Zuboff: capitalismo de la vigilancia");
    add("Couldry y Mejias: colonialismo de datos y mediaciones digitales");
  }
  if (skContieneAlguno(total, ["barrio", "territorio", "urbano", "zaragoza"])) {
    add("Lefebvre: producción social del espacio");
    add("Wacquant: marginalidad urbana y estigma territorial");
  }
  if (skContieneAlguno(total, ["migración", "migracion", "inmigración", "inmigracion", "migrante", "refugiados", "asilo"])) {
    add("Portes: capital social y asimilación segmentada");
    add("Sayad: la doble ausencia del inmigrante");
  }
  if (skContieneAlguno(total, ["discapacidad", "diversidad funcional", "accesibilidad", "dependencia funcional"])) {
    add("Oliver: modelo social de la discapacidad");
    add("Goffman: estigma e identidad deteriorada");
  }
  if (skContieneAlguno(total, ["cambio climático", "cambio climatico", "medio ambiente", "sostenibilidad", "crisis climática", "crisis climatica"])) {
    add("Beck: sociedad del riesgo");
    add("Norgaard: negación social del cambio climático");
  }
  if (skContieneAlguno(total, ["rural", "ruralidad", "despoblación", "despoblacion", "éxodo rural", "exodo rural"])) {
    add("Tönnies: comunidad y sociedad");
    add("Camarero: ruralidad, género y despoblación en España");
  }
  if (skContieneAlguno(total, ["religión", "religion", "religiosidad", "secularización", "secularizacion"])) {
    add("Durkheim: formas elementales de la vida religiosa");
    add("Berger: el dosel sagrado y la secularización");
  }

  if (marcos.length === 0) {
    add("Durkheim: hechos sociales y explicación sociológica");
    add("Weber: acción social, sentido y comprensión");
    add("Bourdieu: campo, habitus y capital");
  }

  return marcos;
}

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

const NOTA_DIRECCIONALIDAD_VIVD = "Nota metodológica: SOCIOKAIROS asume por defecto que las VI son factores explicativos (causas) y las VD el fenómeno a explicar (efectos). Es una simplificación heurística: revísala contra tu propio marco teórico, porque en otros planteamientos estas mismas variables podrían intercambiar su rol (p. ej., el «clima familiar» puede ser VD si tu pregunta es qué lo determina).";

const NOTA_JUSTIFICAR_MARCOS = "Nota: estos marcos se sugieren por coincidencia léxica con tu problema. Justifica en tu trabajo por qué cada uno es realmente pertinente para tu caso concreto, no solo que haya aparecido aquí.";

const NOTA_VI_CANDIDATA = "Nota metodológica: tu problema no nombra explícitamente ningún factor explicativo (VI), así que las de abajo son candidatas típicas en la literatura sobre este fenómeno — no están extraídas de tu texto. Sustitúyelas por las que realmente vayas a estudiar, o añade el factor explicativo directamente en el problema inicial para que SOCIOKAIROS lo detecte.";

/* ================= análisis principal ================= */

function analizarProblema(texto) {
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
      guiaCualitativa: { codigos: [], preguntas: [] }
    };
  }

  const lower = texto.toLowerCase();
  const { contexto, poblacion } = detectarContextoYPoblacion(lower, texto);
  const { vi, vd, viEsCandidato } = detectarVariables(lower);
  const areas = detectarAreaSociologica(lower, vi, vd);
  const area = areas.join(" · ");
  const subdoms = detectarSubdominios(areas, vi, vd, lower);

  const [p1, p2, p3] = construirPreguntas(vi, vd, contexto, poblacion, areas);
  const correlaciones = construirCorrelaciones(vi, vd, contexto);
  const hipotesis = construirHipotesis(vi, vd, contexto, poblacion);
  const marcos = sugerirMarcosTeoricos(lower, vi, vd);
  const operacionalizacion = construirOperacionalizacion(vi, vd);
  const disenoInfo = sugerirDisenoEstudio(lower);
  const fuentes = sugerirFuentesDatos(lower, area, contexto);

  const resultadoParcial = {
    p1, p2, p3, vi, vd, correlaciones, hipotesis, marcos, area, areas,
    subdominios: subdoms,
    mecanismos: generarMecanismos(areas, subdoms, vi, vd, contexto),
    diseno: disenoInfo.texto, unidad: disenoInfo.unidad, enfoque: disenoInfo.enfoque,
    operacionalizacion, fuentes, viEsCandidato
  };
  resultadoParcial.guiaCualitativa = construirGuiaCualitativa(resultadoParcial);
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
  const alertas = [];

  if (!/\b(19|20)\d{2}\b/.test(txt || "")) {
    alertas.push("• Delimitar el periodo temporal: el problema necesita año, curso académico o intervalo de observación.");
  }

  if (vd.length === 0) {
    alertas.push("• Precisar la VD: indicar con claridad qué fenómeno se quiere explicar o medir.");
  } else {
    const vdTxt = skJoin(vd);
    if (skHas(vdTxt, ["precar", "trabajo", "empleo", "laboral"])) alertas.push("• Operacionalizar la precariedad laboral: distinguir temporalidad, parcialidad involuntaria, salario bajo, informalidad e inestabilidad contractual.");
    if (skHas(vdTxt, ["violencia"])) alertas.push("• Definir el tipo de violencia: física, psicológica, económica, sexual, institucional o simbólica; no tratarlas como equivalentes.");
    if (skHas(vdTxt, ["abandono", "deserc", "absentismo", "fracaso escolar"])) alertas.push("• Separar absentismo, abandono, fracaso escolar y bajo rendimiento: son fenómenos relacionados, pero no idénticos.");
    if (skHas(vdTxt, ["salud mental", "ansiedad", "depres"])) alertas.push("• Evitar diagnosticar clínicamente desde datos sociales generales: usar indicadores validados de malestar, riesgo o autopercepción.");
  }

  if (vi.length === 0) {
    alertas.push("• Precisar las VI: el problema aún no muestra factores explicativos suficientemente observables.");
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
    return "• El problema presenta una estructura heurística adecuada. Mantener la coherencia entre VI, VD, población, territorio e indicadores.";
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
  return "Problema científico\n        ↓\nDefinición de VI/VD\n        ↓\nMecanismo sociológico\n        ↓\nFenómeno observable";
}

function generarDisenos(txt, resultado) {
  resultado = resultado || {};
  const t = (txt || "").toLowerCase();
  const vi = resultado.vi || [];
  const vd = resultado.vd || [];
  const areas = (resultado.areas || [resultado.area || ""]).join(" ").toLowerCase();
  const total = t + " " + vi.concat(vd).join(" ").toLowerCase() + " " + areas;
  const salidas = [];

  if (skHas(total, ["relación", "relacion", "influye", "asocia", "correl", "probabilidad"])) salidas.push("• Encuesta transversal analítica → adecuada para estimar asociaciones entre VI y VD en la población definida.");
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

  if (modo === "red") {
    const parts = [`<svg viewBox="0 0 760 310" width="100%" height="310" xmlns="http://www.w3.org/2000/svg">`, defs];
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
    const parts = [`<svg viewBox="0 0 760 330" width="100%" height="330" xmlns="http://www.w3.org/2000/svg">`, defs];
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

  const parts = [`<svg viewBox="0 0 760 360" width="100%" height="360" xmlns="http://www.w3.org/2000/svg">`, defs];
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
    NOTA_DIRECCIONALIDAD_VIVD, NOTA_JUSTIFICAR_MARCOS, NOTA_VI_CANDIDATA,
    geoDetectar, geoFuentes, detectarVariables, detectarAreaSociologica, sugerirMarcosTeoricos,
    candidatosViPorDominio,
    clasificarEnfoqueMetodologico, sugerirDisenoEstudio,
    construirGuiaCualitativa, NOTA_GUIA_CUALITATIVA, construirProblemaPerfecto,
    skContienePatron, skContieneAlguno, skDistanciaEdicion, validarProblemaEdu,
    construirHipotesis, construirCorrelaciones,
  };
}
