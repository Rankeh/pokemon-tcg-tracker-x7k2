"""Comprueba el encuadre SIN Blender (modelo pinhole idéntico al de la cámara de Blender)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from teselia import config as CFG, geometria as G


def informe(cfg, vista):
    v = cfg["vistas"][vista]
    pos, obj, d = G.ajustar_camara(cfg, vista)
    sh = (v["desplazamiento_x"], v["desplazamiento_y"])
    args = (pos, obj, v["lente_mm"], cfg["camara"]["sensor_mm"], v["resolucion"], sh)
    u0, v0, u1, v1 = G.caja_pantalla(G.esquinas_archivador(cfg, v["objetivo"]), *args)
    # Cuánta pared se ve: rayo del borde superior de la imagen contra el plano de la pared
    pared = cfg["entorno"]["pared_y"]
    f, r, up = G.base_camara(pos, obj)
    w, h = v["resolucion"]
    s = cfg["camara"]["sensor_mm"]
    # dirección del rayo en v=0 (arriba): componente vertical = (0.5 + shift_y*w/h) * sensor*h/w / lente
    vert = (0.5 + sh[1] * (w / h)) * s * (h / w) / v["lente_mm"]
    dirv = tuple(f[i] + up[i] * vert for i in range(3))
    t = (pared - pos[1]) / dirv[1] if dirv[1] > 1e-9 else None
    altura_pared = pos[2] + dirv[2] * t if t and t > 0 else None
    print("vista %-10s distancia %.3f m  cámara (%.3f, %.3f, %.3f)" % (vista, d, *pos))
    print("   archivador en pantalla: ancho %.0f%%  alto %.0f%%  x[%.2f..%.2f] y[%.2f..%.2f]" % (100 * (u1 - u0), 100 * (v1 - v0), u0, u1, v0, v1))
    if altura_pared is not None:
        print("   borde superior de la imagen toca la pared a %.2f m sobre el escritorio (>0 = se ve pared)" % altura_pared)
    return dict(ancho=u1 - u0, alto=v1 - v0, caja=(u0, v0, u1, v1), pared=altura_pared)


if __name__ == "__main__":
    cfg = CFG.cargar()
    for vista in cfg["vistas"]:
        informe(cfg, vista)
