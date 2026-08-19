"""Utilidad compartida entre src/build.py y native-app/pro-src/build_pro.py:
minifica el JS del bundle con terser (compress + mangle) si está disponible
en node_modules/.bin/, sin romper el build si no lo está (p. ej. antes de
correr "npm install") — solo emite un aviso por stderr y sigue sin minificar.
"""
import subprocess
import sys


def minify_js(root, code: str) -> str:
    terser_bin = root / "node_modules" / ".bin" / ("terser.cmd" if sys.platform == "win32" else "terser")
    if not terser_bin.exists():
        print("Aviso: terser no está instalado (ejecuta 'npm install'); se usa el script sin minificar.", file=sys.stderr)
        return code
    resultado = subprocess.run(
        [str(terser_bin), "--compress", "--mangle"],
        input=code, capture_output=True, text=True, encoding="utf-8",
    )
    if resultado.returncode != 0:
        print(f"Aviso: terser falló ({resultado.returncode}), se usa el script sin minificar:\n{resultado.stderr}", file=sys.stderr)
        return code
    return resultado.stdout
