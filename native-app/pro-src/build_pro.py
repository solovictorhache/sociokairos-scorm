#!/usr/bin/env python3
"""Ensambla native-app/dist_pro/index.html (la línea "Profesional", track 2)
a partir de las piezas propias de pro-src/ (head.html, body.html, wiring.js
— sin SCORM, tema verde estilo Mac) más el motor COMPARTIDO con el SCORM
(track 1) en ../../src/: geo-data.js, engine.js, docxwriter.js,
informe-word.js. El motor heurístico y la exportación Word/CSV son una
única fuente de verdad para las dos líneas; solo diverge el empaquetado
(SCORM vs. escritorio) y la interfaz (EDU/Moodle vs. profesional).

Uso: python3 native-app/pro-src/build_pro.py
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
SRC = ROOT / "src"
PRO_SRC = ROOT / "native-app" / "pro-src"
OUT_DIR = ROOT / "native-app" / "dist_pro"

sys.path.insert(0, str(SRC))
from build_common import minify_js  # noqa: E402


def strip_module_exports(js: str) -> str:
    return re.sub(r"\nif \(typeof module.*?\n\}\n", "\n", js, flags=re.S)


def main() -> None:
    head = (PRO_SRC / "head.html").read_text(encoding="utf-8")
    body = (PRO_SRC / "body.html").read_text(encoding="utf-8")
    # Logo propio de la línea Profesional (monograma azul institucional),
    # distinto del logo de scorm_plugin/ (línea EDU) — cada línea tiene su
    # propia identidad visual, igual que ya divergen el correo de contacto
    # y el pie del informe Word.
    logo_b64 = base64.b64encode((PRO_SRC / "logo.png").read_bytes()).decode("ascii")

    geo_data = (SRC / "geo-data.js").read_text(encoding="utf-8")
    engine = strip_module_exports((SRC / "engine.js").read_text(encoding="utf-8"))
    docxwriter = strip_module_exports((SRC / "docxwriter.js").read_text(encoding="utf-8"))
    informe_word = (SRC / "informe-word.js").read_text(encoding="utf-8")
    wiring = (PRO_SRC / "wiring.js").read_text(encoding="utf-8")

    # El LOGO_BASE64 no pasa por terser: es un blob de datos, no código —
    # minificarlo no ahorra nada y solo alarga el tiempo de build.
    codigo = geo_data + "\n" + engine + "\n" + docxwriter + "\n" + informe_word + "\n" + wiring
    script = f'const LOGO_BASE64 = "{logo_b64}";\n\n' + minify_js(ROOT, codigo)

    if "/*__SCRIPT__*/" not in body:
        raise SystemExit("pro-src/body.html no contiene el marcador /*__SCRIPT__*/")
    body_final = body.replace("/*__SCRIPT__*/", script)

    full = "<!DOCTYPE html>\n<html lang=\"es\">\n" + head + "\n" + body_final

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "logo.png").write_bytes((PRO_SRC / "logo.png").read_bytes())
    out_path = OUT_DIR / "index.html"
    out_path.write_text(full, encoding="utf-8")
    print(f"Escrito {out_path} ({len(full)} bytes)")


if __name__ == "__main__":
    main()
