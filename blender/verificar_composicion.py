"""Comprueba el encuadre SIN Blender (modelo pinhole idéntico al de la cámara de Blender)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from teselia import config as CFG, geometria as G


def informe(cfg, vista):
    v = cfg["vistas"][vista]
    pos, obj, d = G.ajustar_camara(cfg, vista)
    sh = (v["desplazamiento_x"], v["desplazamiento_y"])
    u0, v0, u1, v1 = G.caja_pantalla(G.esquinas_archivador(cfg, v["objetivo"]), pos, obj, v["lente_mm"], cfg["camara"]["sensor_mm"], v["resolucion"], sh)
    print("vista %-10s distancia %.3f m  cámara (%.3f, %.3f, %.3f)" % (vista, d, *pos))
    print("   álbum en pantalla: ancho %.0f%%  alto %.0f%%  x[%.2f..%.2f] y[%.2f..%.2f]" % (100 * (u1 - u0), 100 * (v1 - v0), u0, u1, v0, v1))
    return dict(ancho=u1 - u0, alto=v1 - v0, caja=(u0, v0, u1, v1))


if __name__ == "__main__":
    cfg = CFG.cargar()
    for vista in cfg["vistas"]:
        informe(cfg, vista)
