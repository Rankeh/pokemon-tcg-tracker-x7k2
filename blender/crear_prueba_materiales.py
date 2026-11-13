"""
Prueba de materiales (Fase 3.4.4): 3 bolsillos — vacío, carta normal, carta holográfica. Se ejecuta DENTRO de Blender 4.2:

    blender --background --python crear_prueba_materiales.py -- --modo previa

Opciones: --modo previa|final|alta · --exposicion X (EV fija; desactiva la autoexposición) · --guardar-blend · --sin-render
Salida en salida/: materiales_prueba_<modo>.png, materiales_prueba.blend, camara_prueba.json
"""
import argparse
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

import bpy  # noqa: E402
from teselia import config as CFG, geometria as G, materiales as M, prueba, modelos, luces_camara as LC, render, utilidades as U  # noqa: E402


def argumentos():
    resto = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--modo", choices=["previa", "final", "alta"], default="previa")
    p.add_argument("--exposicion", type=float, default=None)
    p.add_argument("--guardar-blend", action="store_true")
    p.add_argument("--sin-render", action="store_true")
    p.add_argument("--config", default=None)
    return p.parse_args(resto)


def main():
    a = argumentos()
    cfg = CFG.cargar(a.config)
    U.limpiar_escena()
    scn = bpy.context.scene
    col = bpy.data.collections.new("PruebaMateriales")
    scn.collection.children.link(col)
    C = cfg["colores"]
    mats = {
        "hoja": M.hoja_grafito(),
        "soldadura": M.soldadura_discreta(),
        "funda": M.funda_pelicula(),
        "suelo": M.liso("Suelo", C["suelo"], 0.8, 0.0, 0.2),
    }
    piezas, info = prueba.construir(cfg)
    modelos.instanciar(piezas, col, mats)
    cam, pos, obj, dist = LC.crear_camara(cfg, col, "prueba")
    LC.crear_luces(cfg, col, obj, a.exposicion or 0.0, escala=0.55)
    render.configurar(cfg, "prueba", a.modo)
    salida = os.path.join(AQUI, "salida")
    os.makedirs(salida, exist_ok=True)
    if a.exposicion is None:
        render.autoexposicion(cfg, "prueba", cfg["prueba"]["exposicion_objetivo"], os.path.join(salida, "_calibracion.png"))
    if a.guardar_blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(salida, "materiales_prueba.blend"))
        print("[teselia] guardado salida/materiales_prueba.blend")
    if not a.sin_render:
        ruta = os.path.join(salida, "materiales_prueba_%s.png" % a.modo)
        render.renderizar(ruta)
        print("[teselia] render guardado en", ruta)


main()
