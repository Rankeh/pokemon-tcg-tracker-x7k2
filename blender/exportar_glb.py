"""Genera el modelo 3D del álbum (GLB) que usa el visor, en Python puro (sin Blender): tapas, lomo y N hojas con 18 bolsillos vacíos cada una
(las cartas las pone el visor según la colección). Uso (en la raíz del repo):
    python blender/exportar_glb.py              → web/prueba-3d/modelo/album.glb      (9 hojas: Teselia, 158 cartas)
    python blender/exportar_glb.py --hojas 3    → web/prueba-3d/modelo/album-3h.glb   (álbumes más pequeños)
"""
import argparse
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, AQUI)

from teselia import glb, modelo_web  # noqa: E402


def nombre_modelo(hojas):
    """El mismo nombre que busca el visor (web/prueba-3d/js/main.js)."""
    return "album.glb" if hojas == modelo_web.N_HOJAS_DEFECTO else "album-%dh.glb" % hojas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hojas", type=int, default=modelo_web.N_HOJAS_DEFECTO)
    ap.add_argument("--salida", default=os.path.join(RAIZ, "web", "prueba-3d", "modelo"))
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(AQUI, "configuracion.json"), encoding="utf-8"))
    modelo = modelo_web.construir(cfg, a.hojas)
    os.makedirs(a.salida, exist_ok=True)
    datos = glb.a_bytes(modelo)
    ruta = os.path.join(a.salida, nombre_modelo(a.hojas))
    with open(ruta, "wb") as f:
        f.write(datos)
    print("GLB:", ruta, "%.1f KB" % (len(datos) / 1024), json.dumps(modelo_web.contar(modelo), ensure_ascii=False))


if __name__ == "__main__":
    main()
