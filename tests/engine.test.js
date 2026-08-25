"use strict";
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { cargarMotor } = require("./helpers/load-engine.js");

const eng = cargarMotor();

describe("coincidencia tolerante a erratas", () => {
  test("una errata típica de una letra sigue coincidiendo", () => {
    assert.equal(eng.skDistanciaEdicion("hombres", "hombrs"), 1);
    assert.equal(eng.skContienePatron("los hombrs con bajo nivel", "hombres"), true);
    assert.equal(eng.skContienePatron("bajo nivel de instrucion", "bajo nivel de instrucción"), true);
  });

  test("no confunde palabras españolas distintas que comparten raíz", () => {
    // "instrucción" e "institución" están a distancia de edición 2: deben
    // seguir siendo palabras distintas para el motor, no la misma errata.
    assert.equal(eng.skDistanciaEdicion("institucion", "instrucion"), 2);
    assert.equal(eng.skContienePatron("hay una institucion cerca", "instrucción"), false);
  });

  test("los marcadores de relación del validador usan coincidencia exacta, no tolerante", () => {
    // Regresión: "genera" (marcador de relación) está a distancia de
    // edición 1 de "género", así que con coincidencia tolerante cualquier
    // problema sobre género quedaba validado aunque no hubiera ningún
    // marcador de relación real. Los marcadores de relación deben seguir
    // exigiendo coincidencia exacta precisamente por esto.
    const v = eng.validarProblemaEdu("La violencia de género entre hombres en Zaragoza en 2025");
    assert.equal(v.valido, false);
    assert.ok(v.fallos.some((f) => f.includes("Faltan al menos dos variables")));
  });

  test("respeta coincidencia exacta cuando no hay errata", () => {
    assert.equal(eng.skContienePatron("violencia de género", "violencia de género"), true);
    assert.equal(eng.skContienePatron("no aparece aquí", "inexistente"), false);
  });
});

describe("validarProblemaEdu", () => {
  test("acepta un problema bien formado", () => {
    const v = eng.validarProblemaEdu(
      "¿Cómo influye la precariedad laboral en la salud mental de los jóvenes en Zaragoza en 2024?"
    );
    assert.equal(v.valido, true);
    assert.deepEqual(v.fallos, []);
  });

  test("acepta 'porque' y una errata en la unidad social (caso reportado)", () => {
    const v = eng.validarProblemaEdu(
      "¿Porque los hombrs con bajo nivel de instrucion ejercen mas violencia de genero en zaragoza en el 2025??"
    );
    assert.equal(v.valido, true, "debería validar pese a 'porque' y la errata en 'hombrs'");
  });

  test("rechaza una frase sin relación entre variables ni unidad social", () => {
    const v = eng.validarProblemaEdu("La pobreza energética en Zaragoza en 2025");
    assert.equal(v.valido, false);
    assert.ok(v.fallos.length > 0);
  });

  test("acumula intentos fallidos y los resetea al validar", () => {
    const antes = eng.validarProblemaEdu("texto claramente insuficiente").intentos;
    const otraVezMalo = eng.validarProblemaEdu("otro texto también insuficiente y distinto");
    assert.ok(otraVezMalo.intentos >= antes);
  });
});

describe("detectarVariables / analizarProblema", () => {
  test("detecta VI y VD reales cuando el texto nombra ambas explícitamente", () => {
    const r = eng.analizarProblema(
      "¿Cómo influye el bajo nivel de instrucción en la precariedad laboral de los jóvenes en Zaragoza en 2024?"
    );
    assert.ok(r.vi.some((v) => v.includes("instrucción")));
    assert.ok(r.vd.some((v) => v.includes("precariedad laboral")));
    assert.equal(r.viEsCandidato, false);
  });

  test("propone VI candidatas informadas por dominio cuando el texto no nombra ninguna", () => {
    const r = eng.analizarProblema(
      "¿Por qué se produce la violencia de género entre hombres en Zaragoza en 2025?"
    );
    assert.equal(r.viEsCandidato, true);
    assert.ok(r.vi.length > 0);
  });

  test("reconoce una VI con errata en vez de caer en candidatas genéricas (caso reportado)", () => {
    const r = eng.analizarProblema(
      "¿Porque los hombrs con bajo nivel de instrucion ejercen mas violencia de genero en zaragoza en el 2025??"
    );
    assert.equal(r.viEsCandidato, false);
    assert.ok(r.vi.some((v) => v.includes("instrucción")));
    assert.ok(r.vd.some((v) => v.includes("violencia de género")));
  });
});

describe("dominios sociológicos ampliados", () => {
  const casos = [
    {
      texto: "¿Cómo influye el estatus administrativo en la discriminación hacia la población migrante en Madrid en 2025?",
      area: "migraciones",
      vd: "migrante",
    },
    {
      texto: "¿De qué manera afectan las barreras de accesibilidad a la exclusión social de las personas con discapacidad en Barcelona en 2024?",
      area: "discapacidad",
      vd: "discapacidad",
    },
    {
      texto: "¿Cómo influye el nivel socioeconómico en la vulnerabilidad social frente al cambio climático de las familias en Valencia en 2025?",
      area: "ambiental",
      vd: "cambio climático",
    },
    {
      texto: "¿Por qué se produce la despoblación rural entre los jóvenes en Teruel en 2025?",
      area: "rural",
      vd: "despoblación",
    },
    {
      texto: "¿Cómo influye la socialización familiar en la religiosidad de los jóvenes en Zaragoza en 2025?",
      area: "religión",
      vd: "religiosidad",
    },
  ];

  for (const caso of casos) {
    test(`valida y clasifica correctamente: ${caso.area}`, () => {
      const v = eng.validarProblemaEdu(caso.texto);
      assert.equal(v.valido, true, `no validó: ${JSON.stringify(v.fallos)}`);
      const r = eng.analizarProblema(caso.texto);
      assert.ok(r.area.toLowerCase().includes(caso.area), `área inesperada: ${r.area}`);
      assert.ok(r.vd.some((x) => x.toLowerCase().includes(caso.vd)), `VD inesperada: ${JSON.stringify(r.vd)}`);
      assert.ok(r.marcos.length > 0);
      for (const fila of r.operacionalizacion) {
        assert.ok(fila.variable && fila.tipo && fila.nivel);
      }
    });
  }
});

describe("etnicidad y grupos culturales (transversal)", () => {
  test("nombrar un grupo étnico activa sociología de la cultura junto a las áreas propias del problema", () => {
    const r = eng.analizarProblema(
      "¿Cuáles son las causas familiares del alto índice de deserción escolar de los niños de la etnia gitana en Zaragoza en el 2025?"
    );
    assert.ok(r.area.includes("Sociología de la educación"));
    assert.ok(r.area.includes("Sociología de la cultura"));
    assert.ok(r.vi.some((v) => v.includes("discriminación étnica")));
    assert.ok(r.marcos.some((m) => m.includes("San Román") || m.includes("Wieviorka")));
  });

  test("etnicidad + migración activan ambas áreas a la vez", () => {
    const r = eng.analizarProblema(
      "¿Cómo influye la discriminación étnica en la integración social de la población gitana inmigrante en Zaragoza en 2025?"
    );
    assert.ok(r.area.includes("Sociología de la cultura"));
    assert.ok(r.area.includes("Sociología de las migraciones"));
  });
});

describe("seis dominios nuevos (sexualidad, envejecimiento, criminología, medios, consumo, organizaciones)", () => {
  const casos = [
    { texto: "¿Cómo influye el rechazo familiar en la aceptación social de la diversidad sexual de los jóvenes LGTBI en Zaragoza en 2025?", marco: "Butler" },
    { texto: "¿Cómo influye el estado de salud funcional en las condiciones de vida en la vejez de las personas mayores en Zaragoza en 2025?", marco: "Carstensen" },
    { texto: "¿Cómo influye la asociación diferencial con pares desviados en la delincuencia juvenil en Zaragoza en 2025?", marco: "Becker" },
    { texto: "¿Cómo influye la cámara de eco en la desinformación entre los jóvenes en Zaragoza en 2025?", marco: "Sunstein" },
    { texto: "¿Cómo influye la búsqueda de distinción social en el consumo ostentoso de las familias en Zaragoza en 2025?", marco: "Veblen" },
    { texto: "¿Cómo influye la jerarquía organizacional en el clima organizacional de las empresas en Zaragoza en 2025?", marco: "Crozier" },
  ];
  for (const caso of casos) {
    test(`detecta marco teórico esperado: ${caso.marco}`, () => {
      const v = eng.validarProblemaEdu(caso.texto);
      assert.equal(v.valido, true, `no validó: ${JSON.stringify(v.fallos)}`);
      const r = eng.analizarProblema(caso.texto);
      assert.ok(r.marcos.some((m) => m.includes(caso.marco)), `marcos: ${JSON.stringify(r.marcos)}`);
      assert.ok(r.marcos.length >= 6, `se esperaban al menos 6 marcos del dominio nuevo: ${r.marcos.length}`);
    });
  }
});

describe("categorías explicativas aplicadas al problema concreto", () => {
  test("violencia + marcador de aceptación sugiere violencia simbólica (Bourdieu)", () => {
    const r = eng.analizarProblema("¿Por qué la mujer violentada está de acuerdo con su agresor en Zaragoza en 2025?");
    assert.ok(r.categoriasExplicativas.some((c) => c.includes("Violencia simbólica") && c.includes("Bourdieu")));
  });

  test("abandono escolar + autoexclusión sugiere habitus (Bourdieu)", () => {
    const r = eng.analizarProblema("¿Por qué los alumnos de origen popular abandonan la escuela voluntariamente en Zaragoza en 2025?");
    assert.ok(r.categoriasExplicativas.some((c) => c.includes("Habitus")));
  });

  test("sin marcador de dinámica específica, no sugiere nada (evita ser una lista genérica)", () => {
    const r = eng.analizarProblema("¿Cómo influye la precariedad laboral en la salud mental de los jóvenes en Zaragoza en 2024?");
    assert.equal(r.categoriasExplicativas.length, 0);
  });
});

describe("clasificarEnfoqueMetodologico", () => {
  test("clasifica cualitativo por vocabulario de sentido/experiencia", () => {
    const c = eng.clasificarEnfoqueMetodologico("quiero entender los significados y vivencias subjetivas");
    assert.equal(c.enfoque, "cualitativo");
  });

  test("clasifica cuantitativo por vocabulario de medición/asociación", () => {
    const c = eng.clasificarEnfoqueMetodologico("medir la correlacion estadistica entre variables con una encuesta");
    assert.equal(c.enfoque, "cuantitativo");
  });

  test("clasifica mixto cuando no hay marcadores claros de una sola tradición", () => {
    const c = eng.clasificarEnfoqueMetodologico("como influye x en y");
    assert.equal(c.enfoque, "mixto");
  });
});

describe("construirHipotesis escala con el número de variables", () => {
  test("una VI produce una hipótesis específica más una de cierre", () => {
    const h = eng.construirHipotesis(["el bajo nivel de instrucción"], ["la violencia de género"], "Zaragoza", "los hombres");
    assert.equal(h.length, 2);
    assert.match(h[0], /el bajo nivel de instrucción/);
  });

  test("cinco VI producen hasta 4 hipótesis específicas más una de combinación", () => {
    const vi = ["factor A", "factor B", "factor C", "factor D", "factor E"];
    const h = eng.construirHipotesis(vi, ["el fenómeno estudiado"], "Zaragoza", "la población de estudio");
    assert.equal(h.length, 5);
    assert.match(h[4], /combinación/);
  });
});

describe("guía cualitativa y síntesis del problema", () => {
  test("construirGuiaCualitativa devuelve códigos y preguntas no vacíos con VI/VD reales", () => {
    const r = eng.analizarProblema(
      "¿Cómo influye la precariedad laboral en la salud mental de los jóvenes en Zaragoza en 2024?"
    );
    assert.ok(r.guiaCualitativa.codigos.length > 0);
    assert.ok(r.guiaCualitativa.preguntas.length > 0);
  });

  test("construirProblemaPerfecto produce un texto con tres párrafos", () => {
    const r = eng.analizarProblema(
      "¿Cómo influye la precariedad laboral en la salud mental de los jóvenes en Zaragoza en 2024?"
    );
    const texto = eng.construirProblemaPerfecto(r, "P2", r.p2);
    assert.equal(texto.split("\n\n").length, 3);
  });
});

describe("operacionalización y CSV", () => {
  test("construirOperacionalizacion nunca deja una fila sin variable/tipo (regresión del bug de pobreza energética)", () => {
    const r = eng.analizarProblema(
      "¿Cómo se distribuye la pobreza energética entre los hogares monoparentales de Madrid en 2025?"
    );
    for (const fila of r.operacionalizacion) {
      assert.ok(fila.variable, "fila sin 'variable'");
      assert.ok(fila.tipo, "fila sin 'tipo'");
      assert.ok(fila.nivel, "fila sin nivel de medición");
    }
  });

  test("exportarCSV no lanza y produce cabecera esperada", () => {
    const r = eng.analizarProblema(
      "¿Cómo influye la precariedad laboral en la salud mental de los jóvenes en Zaragoza en 2024?"
    );
    const csv = eng.exportarCSV(r);
    assert.match(csv.split("\n")[0], /Variable,Tipo,Indicador,Unidad,Nivel de medición,Fuente/);
  });
});

describe("detectarErratasSospechosas (pop-up de corrección)", () => {
  test("detecta una transposición de letras en una palabra de dominio (caso reportado)", () => {
    const e = eng.detectarErratasSospechosas("cuales son las causas familiares del alto indice de delicnuencia en zaragoza en el 2025?");
    assert.equal(e.length, 1);
    assert.equal(e[0].original, "delicnuencia");
    assert.ok(e[0].sugerencias.includes("delincuencia"));
  });

  test("no dispara nada sobre texto sin ninguna palabra de dominio deformada", () => {
    const e = eng.detectarErratasSospechosas("¿Cómo influye la precariedad laboral en la salud mental de los jóvenes en Zaragoza en 2024?");
    assert.deepEqual(e, []);
  });

  test("no confunde dos palabras españolas distintas y bien escritas (barrido amplio sin falsos positivos)", () => {
    const textos = [
      "¿Cómo influye el estatus administrativo en la discriminación hacia la población migrante en Madrid en 2025?",
      "¿De qué manera afectan las barreras de accesibilidad a la exclusión social de las personas con discapacidad en Barcelona en 2024?",
      "¿Cómo influye el nivel socioeconómico en la vulnerabilidad social frente al cambio climático de las familias en Valencia en 2025?",
      "¿Cómo influye el rechazo familiar en la aceptación social de la diversidad sexual de los jóvenes LGTBI en Zaragoza en 2025?",
      "¿Cómo influye el estado de salud funcional en las condiciones de vida en la vejez de las personas mayores en Zaragoza en 2025?",
      "¿Cómo influye la jerarquía organizacional en el clima organizacional de las empresas en Zaragoza en 2025?",
      "¿Cuáles son las causas familiares del alto índice de deserción escolar de los niños de la etnia gitana en Zaragoza en el 2025?",
    ];
    for (const t of textos) {
      const e = eng.detectarErratasSospechosas(t);
      assert.deepEqual(e, [], `falso positivo en: "${t}" -> ${JSON.stringify(e)}`);
    }
  });

  test("una errata ya cubierta por la tolerancia silenciosa del motor no genera pop-up (no hace falta preguntar)", () => {
    const e = eng.detectarErratasSospechosas("¿Porque los hombrs con bajo nivel de instrucion ejercen mas violencia de genero en zaragoza en el 2025??");
    assert.deepEqual(e, []);
  });

  test("una forma verbal conjugada de un término de dominio no dispara pop-up (caso reportado: 'relaciona')", () => {
    const e = eng.detectarErratasSospechosas("¿Cómo se relaciona el nivel de instrucción con el nivel de empleo en Zaragoza en 2025?");
    assert.deepEqual(e, []);
  });

  test("el plural regular de un término de dominio no dispara pop-up (caso reportado: 'políticas')", () => {
    const e = eng.detectarErratasSospechosas("¿Cómo provocan las políticas de vivienda la gentrificación urbana en Madrid en 2025?");
    assert.deepEqual(e, []);
  });

  // Barrido sistemático: para CADA término del vocabulario de dominio, si
  // su plural regular (+s / +es) no está ya listado tal cual, comprueba
  // que ese plural tampoco dispare el pop-up de errata. Esto no prueba un
  // caso concreto, sino toda la CLASE de bug que motivó los dos tests de
  // arriba (un término en singular está cubierto, pero su plural no lo
  // estaba automáticamente) — para que no haga falta ir descubriendo cada
  // plural uno a uno según lo van escribiendo estudiantes reales.
  test("ningún plural regular de un término del vocabulario de dominio dispara falso positivo", () => {
    function normalizarSinAcentos(s) {
      return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    }
    function pluralesRegulares(palabra) {
      const formas = [];
      if (/[aeiou]$/i.test(palabra)) formas.push(palabra + "s");
      else if (/[^ns]$/i.test(palabra)) formas.push(palabra + "es");
      return formas;
    }
    const vocabNorm = new Set(eng.VOCABULARIO_DOMINIO.map(normalizarSinAcentos));
    const fallos = [];
    for (const palabra of eng.VOCABULARIO_DOMINIO) {
      for (const plural of pluralesRegulares(palabra)) {
        if (vocabNorm.has(normalizarSinAcentos(plural))) continue;
        const texto = `el problema habla de ${plural} en la ciudad en 2025`;
        const erratas = eng.detectarErratasSospechosas(texto);
        if (erratas.some(e => normalizarSinAcentos(e.original) === normalizarSinAcentos(plural))) {
          fallos.push(`${palabra} -> ${plural}`);
        }
      }
    }
    assert.deepEqual(fallos, [], `plurales que disparan falso positivo: ${fallos.join(", ")}`);
  });
});

describe("transparencia de detección (por qué se sugirió cada VD/VI/área/marco)", () => {
  const texto = "cuales son las causas familiares del alto indice de delincuencia en zaragoza en el 2025?";

  test("detectarVariables devuelve motivosVi/motivosVd con la palabra que activó cada variable", () => {
    const { vd, vi, motivosVd, motivosVi } = eng.detectarVariables(texto.toLowerCase());
    assert.equal(vd[0], "la delincuencia");
    assert.equal(motivosVd[vd[0]], "delincuencia");
    assert.ok(motivosVi[vi[0]], "debe existir un motivo para la VI detectada");
  });

  test("una VI candidata (no textual) se marca explícitamente como tal, no como una coincidencia inventada", () => {
    const { vi, motivosVi, viEsCandidato } = eng.detectarVariables("¿por qué se produce la violencia de género entre hombres en zaragoza en 2025?");
    assert.ok(viEsCandidato);
    assert.match(motivosVi[vi[0]], /candidata sugerida/);
  });

  test("analizarProblema incluye explicacionDeteccion con bloques VD/VI/área/marcos y la nota de determinismo", () => {
    const r = eng.analizarProblema(texto);
    assert.match(r.explicacionDeteccion, /VARIABLE DEPENDIENTE \(VD\):/);
    assert.match(r.explicacionDeteccion, /"la delincuencia" ← detectado a partir de "delincuencia"/);
    assert.match(r.explicacionDeteccion, /ÁREA SOCIOLÓGICA:/);
    assert.match(r.explicacionDeteccion, /MARCOS TEÓRICOS SUGERIDOS:/);
    assert.match(r.explicacionDeteccion, /SOCIOKAIROS es determinista/);
  });

  test("texto vacío no rompe y devuelve explicacionDeteccion vacía", () => {
    const r = eng.analizarProblema("");
    assert.equal(r.explicacionDeteccion, "");
  });
});

describe("selector manual de dirección VI/VD (intercambiarViVd)", () => {
  const texto = "cuales son las causas familiares del alto indice de delincuencia en zaragoza en el 2025?";

  test("intercambia VD y VI sin alterar área ni marcos teóricos", () => {
    const normal = eng.analizarProblema(texto);
    const swap = eng.analizarProblema(texto, { intercambiarViVd: true });
    assert.deepEqual(swap.vd, normal.vi);
    assert.deepEqual(swap.vi, normal.vd);
    assert.equal(swap.area, normal.area);
    assert.deepEqual(swap.marcos, normal.marcos);
    assert.equal(normal.intercambiado, false);
    assert.equal(swap.intercambiado, true);
  });

  test("recalcula preguntas y correlaciones con la nueva dirección, no solo la etiqueta", () => {
    const normal = eng.analizarProblema(texto);
    const swap = eng.analizarProblema(texto, { intercambiarViVd: true });
    assert.notEqual(swap.p2, normal.p2);
    assert.ok(swap.p2.includes(normal.vd[0]), "la VD original debe aparecer como factor explicativo en la versión intercambiada");
  });
});

describe("terminología adaptada al enfoque metodológico (cualitativo vs cuantitativo/mixto)", () => {
  const textoCualitativo = "¿qué sentido y significado le dan las mujeres migrantes a su experiencia de precariedad laboral en zaragoza en 2025?";
  const textoMixto = "cuales son las causas familiares del alto indice de delincuencia en zaragoza en el 2025?";

  test("un problema cualitativo se clasifica como tal y usa etiquetas no estadísticas", () => {
    const r = eng.analizarProblema(textoCualitativo);
    assert.equal(r.enfoque, "cualitativo");
    assert.ok(r.etiquetas.esCualitativo);
    assert.equal(r.etiquetas.vi, "condición explicativa");
    assert.equal(r.etiquetas.vd, "fenómeno central");
    assert.equal(r.etiquetas.correlacionesTitulo, "Relaciones a explorar");
    assert.equal(r.etiquetas.hipotesisTitulo, "Proposiciones orientadoras");
  });

  test("un problema cualitativo no contiene lenguaje VI/VD ni hipótesis estadísticas en p1/p2/p3/correlaciones/hipótesis", () => {
    const r = eng.analizarProblema(textoCualitativo);
    const bloque = [r.p1, r.p2, r.p3, ...r.correlaciones, ...r.hipotesis].join("\n");
    assert.doesNotMatch(bloque, /\bVI\b/);
    assert.doesNotMatch(bloque, /\bVD\b/);
    assert.doesNotMatch(bloque, /variable independiente/i);
    assert.doesNotMatch(bloque, /variable dependiente/i);
    assert.doesNotMatch(bloque, /se asociará con cambios significativos/i);
    assert.doesNotMatch(bloque, /^H1\./m);
  });

  test("la operacionalización cualitativa usa 'Condición'/'Fenómeno', no 'VI'/'VD', como tipo", () => {
    const r = eng.analizarProblema(textoCualitativo);
    const tipos = new Set(r.operacionalizacion.map(f => f.tipo));
    for (const t of tipos) {
      assert.doesNotMatch(t, /^VI$|^VD$/);
    }
  });

  test("la explicación de detección usa 'FENÓMENO CENTRAL'/'CONDICIONES EXPLICATIVAS' en un problema cualitativo", () => {
    const r = eng.analizarProblema(textoCualitativo);
    assert.match(r.explicacionDeteccion, /FENÓMENO CENTRAL:/);
    assert.match(r.explicacionDeteccion, /CONDICIONES EXPLICATIVAS:/);
    assert.doesNotMatch(r.explicacionDeteccion, /VARIABLE DEPENDIENTE \(VD\):/);
    assert.doesNotMatch(r.explicacionDeteccion, /VARIABLES INDEPENDIENTES \(VI\):/);
  });

  test("un problema mixto/cuantitativo existente mantiene exactamente el comportamiento VI/VD previo", () => {
    const r = eng.analizarProblema(textoMixto);
    assert.notEqual(r.enfoque, "cualitativo");
    assert.equal(r.etiquetas.esCualitativo, false);
    assert.match(r.explicacionDeteccion, /VARIABLE DEPENDIENTE \(VD\):/);
    assert.match(r.explicacionDeteccion, /VARIABLES INDEPENDIENTES \(VI\):/);
    const tipos = new Set(r.operacionalizacion.map(f => f.tipo));
    assert.ok([...tipos].every(t => t === "VI" || t === "VD"));
  });
});

describe("marcos teóricos para las áreas que antes no tenían teóricos propios", () => {
  const casos = [
    { texto: "¿cómo afecta la pobreza y la exclusión social a las familias en zaragoza en 2025?", area: "Sociología de la pobreza y la desigualdad", autor: "Sen" },
    { texto: "¿cómo afecta la pobreza energética y la vivienda a las familias en zaragoza en 2025?", area: "Sociología de la vivienda y la energía", autor: "Bouzarovski" },
    { texto: "¿por qué influye la juventud y ser jóvenes en la participación social en zaragoza en 2025?", area: "Sociología de la juventud", autor: "Mannheim" },
    { texto: "¿cómo influyen las emociones y el miedo en la soledad de las personas en zaragoza en 2025?", area: "Sociología de las emociones", autor: "Hochschild" },
    { texto: "¿cómo influye la identidad cultural y los valores en la cohesión social en zaragoza en 2025?", area: "Sociología de la cultura", autor: "Geertz" },
    { texto: "¿por qué influye la radicalización política en la participación en zaragoza en 2025?", area: "Sociología política", autor: "Gramsci" },
    { texto: "¿cómo influye el sentido común y el conocimiento cotidiano en las decisiones en zaragoza en 2025?", area: "Sociología del conocimiento", autor: "Mannheim" },
  ];

  for (const { texto, area, autor } of casos) {
    test(`"${area}" activa marcos teóricos propios (incluye a ${autor})`, () => {
      const r = eng.analizarProblema(texto);
      assert.ok(r.areas.includes(area), `se esperaba el área "${area}" en ${JSON.stringify(r.areas)}`);
      assert.ok(r.marcos.some(m => m.includes(autor)), `se esperaba un marco de ${autor} en ${JSON.stringify(r.marcos)}`);
    });
  }
});

describe("revisión de coherencia entre enfoque detectado y justificación teórica libre", () => {
  const textoCualitativo = "¿Cómo viven y qué sentido dan las mujeres migrantes a su experiencia de precariedad laboral en Zaragoza en 2025?";
  const textoMixto = "cuales son las causas familiares del alto indice de delincuencia en zaragoza en el 2025?";

  test("avisa si un problema cualitativo tiene una justificación con lenguaje VI/VD/correlación/hipótesis", () => {
    const r = eng.analizarProblema(textoCualitativo);
    const rev = eng.generarRevisionCoherencia(r, "Elijo este marco porque predice una correlación significativa entre la VI y la VD.");
    assert.match(rev, /^Revisión de coherencia:/);
    assert.match(rev, /VI/);
    assert.match(rev, /correlación/);
  });

  test("no avisa si la justificación de un problema cualitativo usa lenguaje coherente", () => {
    const r = eng.analizarProblema(textoCualitativo);
    const rev = eng.generarRevisionCoherencia(r, "Elijo Bourdieu porque el habitus explica cómo estas mujeres dan sentido a su experiencia.");
    assert.match(rev, /no ha detectado incoherencias/);
  });

  test("no avisa si la justificación está vacía (nada que revisar todavía)", () => {
    const r = eng.analizarProblema(textoCualitativo);
    assert.match(eng.generarRevisionCoherencia(r, ""), /no ha detectado incoherencias/);
    assert.match(eng.generarRevisionCoherencia(r, undefined), /no ha detectado incoherencias/);
  });

  test("avisa si un problema no cualitativo tiene una justificación con lenguaje de fenómeno central/condición explicativa", () => {
    const r = eng.analizarProblema(textoMixto);
    const rev = eng.generarRevisionCoherencia(r, "El fenómeno central se explica por las condiciones explicativas del contexto familiar.");
    assert.match(rev, /^Revisión de coherencia:/);
    assert.match(rev, /fenómeno central/);
  });

  test("avisa si se intercambió VI/VD manualmente y la justificación quedó vacía", () => {
    const r = eng.analizarProblema(textoMixto, { intercambiarViVd: true });
    const rev = eng.generarRevisionCoherencia(r, "");
    assert.match(rev, /^Revisión de coherencia:/);
    assert.match(rev, /has intercambiado/i);
  });

  test("no avisa por el intercambio si ya se escribió una justificación (aunque no mencione el cambio)", () => {
    const r = eng.analizarProblema(textoMixto, { intercambiarViVd: true });
    const rev = eng.generarRevisionCoherencia(r, "Bourdieu explica bien esta dinámica social.");
    assert.match(rev, /no ha detectado incoherencias/);
  });
});

describe("validez, confiabilidad y sesgos metodológicos (solo motor; el wiring de UI/Word es exclusivo de la línea Profesional)", () => {
  const textoCualitativo = "¿Cómo viven y qué sentido dan las mujeres migrantes a su experiencia de precariedad laboral en Zaragoza en 2025?";
  const textoMixto = "cuales son las causas familiares del alto indice de delincuencia en zaragoza en el 2025?";

  test("un problema cualitativo recibe los 4 criterios de Lincoln y Guba, no validez/confiabilidad estadística", () => {
    const r = eng.analizarProblema(textoCualitativo);
    const v = eng.generarValidezConfiabilidad(r);
    assert.match(v, /Credibilidad/);
    assert.match(v, /Transferibilidad/);
    assert.match(v, /Dependencia/);
    assert.match(v, /Confirmabilidad/);
    assert.doesNotMatch(v, /Validez interna/);
    assert.doesNotMatch(v, /alfa de Cronbach/);
  });

  test("un problema mixto/cuantitativo recibe validez interna/externa y confiabilidad, no criterios cualitativos", () => {
    const r = eng.analizarProblema(textoMixto);
    const v = eng.generarValidezConfiabilidad(r);
    assert.match(v, /Validez interna/);
    assert.match(v, /Validez externa/);
    assert.match(v, /Confiabilidad/);
    assert.doesNotMatch(v, /^Credibilidad/m);
  });

  test("los sesgos metodológicos se adaptan al tema (deseabilidad social solo si el tema es sensible)", () => {
    const rSensible = eng.analizarProblema(textoMixto); // delincuencia: tema sensible
    assert.match(eng.generarSesgosMetodologicos(rSensible, textoMixto), /Deseabilidad social/);

    const rNoSensible = eng.analizarProblema("¿cómo influye el uso de redes sociales en el rendimiento académico de los estudiantes en zaragoza en 2025?");
    assert.doesNotMatch(eng.generarSesgosMetodologicos(rNoSensible, "¿cómo influye el uso de redes sociales en el rendimiento académico de los estudiantes en zaragoza en 2025?"), /Deseabilidad social/);
  });

  test("los sesgos metodológicos distinguen reflexividad (cualitativo) de sesgo de no respuesta (cuantitativo/mixto)", () => {
    const rCuali = eng.analizarProblema(textoCualitativo);
    assert.match(eng.generarSesgosMetodologicos(rCuali, textoCualitativo), /Reflexividad/);
    const rMixto = eng.analizarProblema(textoMixto);
    assert.match(eng.generarSesgosMetodologicos(rMixto, textoMixto), /Sesgo de no respuesta/);
  });
});

describe("mediación/moderación, consentimiento informado, cronograma, preregistro, unidad de análisis/observación y tamaño muestral (solo motor; exclusivo de la línea Profesional)", () => {
  const textoCualitativo = "¿Cómo viven y qué sentido dan las mujeres migrantes a su experiencia de precariedad laboral en Zaragoza en 2025?";
  const textoMixto = "cuales son las causas familiares del alto indice de delincuencia en zaragoza en el 2025?";
  const textoMenores = "¿cómo influye la violencia intrafamiliar en el rendimiento escolar de los niños en zaragoza en 2025?";

  test("mediación/moderación sugiere variables coherentes con el dominio detectado (trabajo/familia)", () => {
    const r = eng.analizarProblema(textoMixto);
    const m = eng.generarMediacionModeracion(r);
    assert.match(m, /MEDIADORAS/);
    assert.match(m, /MODERADORAS/);
    assert.match(m, /clima emocional|composición del hogar/);
  });

  test("mediación/moderación usa lenguaje de mecanismos y contexto (no variables estadísticas) en cualitativo", () => {
    const r = eng.analizarProblema(textoCualitativo);
    const m = eng.generarMediacionModeracion(r);
    assert.match(m, /MECANISMOS/);
  });

  test("el consentimiento informado añade cláusula de menores solo si el problema los involucra", () => {
    const rMenores = eng.analizarProblema(textoMenores);
    assert.match(eng.generarConsentimientoInformado(rMenores, textoMenores), /tutor legal/);

    const rSinMenores = eng.analizarProblema(textoMixto);
    assert.doesNotMatch(eng.generarConsentimientoInformado(rSinMenores, textoMixto), /tutor legal/);
  });

  test("el consentimiento informado añade protocolo de derivación en temas sensibles", () => {
    const r = eng.analizarProblema(textoMenores);
    assert.match(eng.generarConsentimientoInformado(r, textoMenores), /protocolo de derivación/);
  });

  test("el cronograma distingue fases cualitativas (saturación/codificación) de cuantitativas (análisis estadístico)", () => {
    const rCuali = eng.analizarProblema(textoCualitativo);
    const cCuali = eng.generarCronogramaFactibilidad(rCuali);
    assert.match(cCuali, /saturación/);
    assert.match(cCuali, /codificación/);

    const rMixto = eng.analizarProblema(textoMixto);
    const cMixto = eng.generarCronogramaFactibilidad(rMixto);
    assert.match(cMixto, /análisis estadístico/);
  });

  test("el cronograma añade una fase de seguimiento si el diseño es longitudinal", () => {
    const r = eng.analizarProblema("evolución de la precariedad laboral en jóvenes de zaragoza: seguimiento longitudinal 2020-2025");
    assert.match(eng.generarCronogramaFactibilidad(r), /Ola\(s\) de seguimiento/);
  });

  test("preregistro: cualitativo recibe protocolo de investigación, no hipótesis fijadas de antemano", () => {
    const r = eng.analizarProblema(textoCualitativo);
    const p = eng.generarPreregistroCienciaAbierta(r);
    assert.match(p, /protocolo de investigación/);
    assert.doesNotMatch(p, /OSF \(/);
  });

  test("preregistro: cuantitativo/mixto recibe recomendación de preregistrar hipótesis en OSF", () => {
    const r = eng.analizarProblema(textoMixto);
    assert.match(eng.generarPreregistroCienciaAbierta(r), /osf\.io/);
  });

  test("unidad de análisis vs. observación distingue el caso territorial del individual", () => {
    const rTerritorial = eng.analizarProblema("segregación residencial y calidad de vida en los barrios de zaragoza en 2025");
    assert.match(eng.generarUnidadAnalisisObservacion(rTerritorial), /territorial/);

    const rIndividual = eng.analizarProblema(textoMixto);
    assert.match(eng.generarUnidadAnalisisObservacion(rIndividual), /falacia ecológica/);
  });

  test("tamaño muestral: cualitativo recibe orientación de saturación, cuantitativo recibe la fórmula", () => {
    const rCuali = eng.analizarProblema(textoCualitativo);
    const sCuali = eng.generarTamanoMuestralPotencia(rCuali);
    assert.match(sCuali, /SATURACIÓN TEÓRICA/);
    assert.doesNotMatch(sCuali, /Z² ×/);

    const rMixto = eng.analizarProblema(textoMixto);
    const sMixto = eng.generarTamanoMuestralPotencia(rMixto);
    assert.match(sMixto, /Z² ×/);
    assert.match(sMixto, /n ≈ 384/);
  });
});
