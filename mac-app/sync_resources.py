#!/usr/bin/env python3
"""Copia native-app/dist_pro/index.html y logo.png a los recursos del
paquete Swift (mac-app/SociokairosEduMac/Sources/SociokairosEduMac/Resources/scorm_plugin/),
para que la app de Xcode cargue siempre la interfaz más reciente de la
línea Profesional (track 2: sin SCORM, tema verde, contacto@sociokairos.com)
— la misma que usa native-app/ (Tauri). La carpeta de destino sigue
llamándose "scorm_plugin" solo porque así la referencia Bundle.module en
SociokairosWebView.swift/Package.swift; no tiene nada que ver con SCORM.

Requiere haber generado antes native-app/dist_pro/ (build_pro.py):
    python3 native-app/pro-src/build_pro.py

A diferencia de native-app/ (Tauri), que apunta a dist_pro/ directamente sin
copiar nada, Xcode/SPM sí necesita los recursos dentro del propio paquete
para poder empaquetarlos — de ahí este script. Ejecútalo:
  - una vez, antes de abrir el proyecto en Xcode por primera vez (ya viene
    hecho en el repo, así que el primer "Run" funciona sin pasos previos), y
  - cada vez que cambies engine.js o algo en native-app/pro-src/ y quieras
    ver los cambios reflejados en la app de Xcode (después de reconstruir
    dist_pro/ con build_pro.py, como se indica arriba).
"""
import shutil
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST_PRO = ROOT / "native-app" / "dist_pro"
SRC_HTML = DIST_PRO / "index.html"
SRC_LOGO = DIST_PRO / "logo.png"
DEST_DIR = pathlib.Path(__file__).resolve().parent / "SociokairosEduMac" / "Sources" / "SociokairosEduMac" / "Resources" / "scorm_plugin"

if not SRC_HTML.exists():
    print(f"No existe {SRC_HTML}. Generándolo con native-app/pro-src/build_pro.py...")
    subprocess.run([sys.executable, str(ROOT / "native-app" / "pro-src" / "build_pro.py")], check=True)

DEST_DIR.mkdir(parents=True, exist_ok=True)
shutil.copy2(SRC_HTML, DEST_DIR / "index.html")
shutil.copy2(SRC_LOGO, DEST_DIR / "logo.png")
print(f"Copiado {SRC_HTML} -> {DEST_DIR / 'index.html'}")
print(f"Copiado {SRC_LOGO} -> {DEST_DIR / 'logo.png'}")
print("Listo. Si Xcode ya tenía el proyecto abierto, Product > Clean Build Folder antes de Run para asegurar que recoge los recursos nuevos.")
