"""
Escena de prueba del Álbum Teselia (Fase 3.4.2) — se ejecuta DENTRO de Blender 4.2:

    blender --background --python crear_escena.py -- --modo previa --vista escritorio

Opciones (después de '--'):
    --modo previa|final|alta      calidad de render (por defecto previa)
    --vista escritorio|movil      encuadre (por defecto escritorio)
    --guardar-blend               guarda salida/teselia_poc.blend para abrirlo y mirarlo en Blender
    --sin-render                  solo construye la escena (útil con --guardar-blend)
    --exposicion X                exposición en pasos (EV); sube/baja el brillo general (por defecto 0)
    --config RUTA                 otro JSON de configuración
"""
import argparse
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

import bpy  # noqa: E402
from teselia import config as CFG, geometria as G, materiales as M, escena, modelos, luces_camara as LC, render, utilidades as U  # noqa: E402


def argumentos():
    resto = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--modo", choices=["previa", "final", "alta"], default="previa")
    p.add_argument("--vista", choices=["escritorio", "movil", "detalle"], default="escritorio")
    p.add_argument("--guardar-blend", action="store_true")
    p.add_argument("--sin-render", action="store_true")
    p.add_argument("--exposicion", type=float, default=None)
    p.add_argument("--config", default=None)
    return p.parse_args(resto)


def construir(cfg, vista, exposicion):
    U.limpiar_escena()
    scn = bpy.context.scene
    col = bpy.data.collections.new("Teselia")
    scn.collection.children.link(col)
    C = cfg["colores"]
    mats = {
        "cubierta": M.cubierta(C["cubierta"], C["cubierta_b"]),
        "hilo": M.liso("Hilo", C["hilo"], 0.75, 0.0, 0.25),
        "hoja": M.liso("Hoja", C["hoja"], 0.48, 0.0, 0.30),
        "hoja_b": M.liso("HojaB", C["hoja_b"], 0.48, 0.0, 0.30),
        "funda": M.funda(),
        "soldadura": M.soldadura(),
        "suelo": M.liso("Suelo", C["suelo"], 0.62, 0.0, 0.25),
    }
    piezas, _info = escena.construir(cfg)
    modelos.instanciar(piezas, col, mats)
    cam, pos, obj, dist = LC.crear_camara(cfg, col, vista)
    LC.crear_luces(cfg, col, obj, cfg["luces"]["exposicion"] if exposicion is None else exposicion)
    return pos, obj, dist


def exportar_camara(cfg, vista, pos, obj, dist, ruta):
    """JSON con la cámara y la proyección (0..1) de las esquinas del archivador: sirve para alinear el HTML."""
    v = cfg["vistas"][vista]
    sh = (v["desplazamiento_x"], v["desplazamiento_y"])
    esq = {}
    for i, p in enumerate(G.esquinas_archivador(cfg, v["objetivo"])):
        q = G.proyectar(p, pos, obj, v["lente_mm"], cfg["camara"]["sensor_mm"], v["resolucion"], sh)
        esq["esquina%d" % i] = [round(q[0], 5), round(q[1], 5)]
    datos = {"vista": vista, "posicion": pos, "objetivo": obj, "distancia": dist, "lente_mm": v["lente_mm"],
             "resolucion": v["resolucion"], "desplazamiento": sh, "esquinas_uv": esq}
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, indent=2)


def main():
    a = argumentos()
    cfg = CFG.cargar(a.config)
    pos, obj, dist = construir(cfg, a.vista, a.exposicion)
    render.configurar(cfg, a.vista, a.modo)
    salida = os.path.join(AQUI, "salida")
    os.makedirs(salida, exist_ok=True)
    exportar_camara(cfg, a.vista, pos, obj, dist, os.path.join(salida, "camara_%s.json" % a.vista))
    if a.guardar_blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(salida, "teselia_poc.blend"))
        print("[teselia] guardado salida/teselia_poc.blend")
    if not a.sin_render:
        ruta = os.path.join(salida, "teselia_%s_%s.png" % (a.vista, a.modo))
        render.renderizar(ruta)
        print("[teselia] render guardado en", ruta)


main()
