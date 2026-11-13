"""
Fase 3.5 — Genera web/prueba-3d/modelo/album.glb SIN Blender (Python puro) y las cartas de prueba 256x358.
Uso (desde la raíz del repositorio):  python blender/exportar_glb.py [--hojas 6]
"""
import argparse
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, AQUI)

from teselia import glb, modelo_web  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hojas", type=int, default=modelo_web.N_HOJAS_DEFECTO)
    ap.add_argument("--salida", default=os.path.join(RAIZ, "web", "prueba-3d"))
    ap.add_argument("--sin-cartas", action="store_true")
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(AQUI, "configuracion.json"), encoding="utf-8"))
    modelo = modelo_web.construir(cfg, a.hojas)
    os.makedirs(os.path.join(a.salida, "modelo"), exist_ok=True)
    datos = glb.a_bytes(modelo)
    ruta = os.path.join(a.salida, "modelo", "album.glb")
    open(ruta, "wb").write(datos)
    est = modelo_web.contar(modelo)
    print("GLB:", ruta, "%.1f KB" % (len(datos) / 1024))
    print("Estadísticas estáticas:", json.dumps(est, ensure_ascii=False))
    print("Parámetros:", json.dumps(modelo["parametros"], ensure_ascii=False))
    json.dump({"modelo": est, "parametros": modelo["parametros"], "bytes_glb": len(datos)},
              open(os.path.join(a.salida, "modelo", "album.estadisticas.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    if not a.sin_cartas:
        import numpy as np
        from PIL import Image
        from teselia import arte
        os.makedirs(os.path.join(a.salida, "cartas"), exist_ok=True)
        for i in range(12):
            img = arte.carta(i, holo=(i % 5 == 4))[::-1]          # arte.carta devuelve de abajo arriba
            rgb = (np.clip(img[..., :3], 0, 1) * 255 + 0.5).astype(np.uint8)
            Image.fromarray(rgb).resize((256, 358), Image.LANCZOS).save(os.path.join(a.salida, "cartas", "c%02d.png" % i), optimize=True)
        print("Cartas de prueba: 12 PNG 256x358 en", os.path.join(a.salida, "cartas"))


if __name__ == "__main__":
    main()
