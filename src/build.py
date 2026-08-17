#!/usr/bin/env python3
"""Ensambla scorm_plugin/index.html a partir de las piezas fuente en src/.

Uso: python3 src/build.py

Junta head.html + body.html (con el logotipo embebido en base64 a partir de
scorm_plugin/logo.png) con un único <script> que concatena, en este orden:
  1. LOGO_BASE64
  2. src/geo-data.js     -- tablas geográficas (ciudades/países/fuentes) y dominios SVG
  3. src/engine.js       -- motor heurístico puro (sin dependencias de DOM)
  4. src/docxwriter.js   -- ZIP + OOXML mínimo, sin librerías
  5. src/informe-word.js -- ensamblado del informe .docx a partir del resultado
  6. src/wiring.js       -- SCORM + validación EDU + wiring de la interfaz

Resultado: HTML autocontenido, sin llamadas de red en tiempo de ejecución.
"""
import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
PLUGIN = ROOT / "scorm_plugin"


def strip_module_exports(js: str) -> str:
    return re.sub(r"\nif \(typeof module.*?\n\}\n", "\n", js, flags=re.S)


def main() -> None:
    head = (SRC / "head.html").read_text(encoding="utf-8")
    body = (SRC / "body.html").read_text(encoding="utf-8")
    logo_b64 = base64.b64encode((PLUGIN / "logo.png").read_bytes()).decode("ascii")

    geo_data = (SRC / "geo-data.js").read_text(encoding="utf-8")
    engine = strip_module_exports((SRC / "engine.js").read_text(encoding="utf-8"))
    docxwriter = strip_module_exports((SRC / "docxwriter.js").read_text(encoding="utf-8"))
    informe_word = (SRC / "informe-word.js").read_text(encoding="utf-8")
    wiring = (SRC / "wiring.js").read_text(encoding="utf-8")

    script = (
        f'const LOGO_BASE64 = "{logo_b64}";\n\n'
        + geo_data + "\n" + engine + "\n" + docxwriter + "\n" + informe_word + "\n" + wiring
    )

    if "/*__SCRIPT__*/" not in body:
        raise SystemExit("src/body.html no contiene el marcador /*__SCRIPT__*/")
    body_final = body.replace("/*__SCRIPT__*/", script)

    full = "<!DOCTYPE html>\n<html lang=\"es\">\n" + head + "\n" + body_final

    out_path = PLUGIN / "index.html"
    out_path.write_text(full, encoding="utf-8")
    print(f"Escrito {out_path} ({len(full)} bytes)")


if __name__ == "__main__":
    main()
