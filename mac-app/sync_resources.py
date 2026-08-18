#!/usr/bin/env python3
"""Copia scorm_plugin/index.html y logo.png a los recursos del paquete Swift
(mac-app/SociokairosEduMac/Sources/SociokairosEduMac/Resources/scorm_plugin/),
para que la app de Xcode cargue siempre el motor/interfaz más reciente.

A diferencia de native-app/ (Tauri), que apunta directamente a scorm_plugin/
sin copiar nada, Xcode/SPM sí necesita los recursos dentro del propio paquete
para poder empaquetarlos — de ahí este script. Ejecútalo:
  - una vez, antes de abrir el proyecto en Xcode por primera vez (ya viene
    hecho en el repo, así que el primer "Run" funciona sin pasos previos), y
  - cada vez que cambies engine.js/wiring.js/body.html/head.html y quieras
    ver los cambios reflejados en la app de Xcode (además de reconstruir
    scorm_plugin/index.html con `python3 ../src/build.py`).
"""
import shutil
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_HTML = ROOT / "scorm_plugin" / "index.html"
SRC_LOGO = ROOT / "scorm_plugin" / "logo.png"
DEST_DIR = pathlib.Path(__file__).resolve().parent / "SociokairosEduMac" / "Sources" / "SociokairosEduMac" / "Resources" / "scorm_plugin"

DEST_DIR.mkdir(parents=True, exist_ok=True)
shutil.copy2(SRC_HTML, DEST_DIR / "index.html")
shutil.copy2(SRC_LOGO, DEST_DIR / "logo.png")
print(f"Copiado {SRC_HTML} -> {DEST_DIR / 'index.html'}")
print(f"Copiado {SRC_LOGO} -> {DEST_DIR / 'logo.png'}")
print("Listo. Si Xcode ya tenía el proyecto abierto, Product > Clean Build Folder antes de Run para asegurar que recoge los recursos nuevos.")
