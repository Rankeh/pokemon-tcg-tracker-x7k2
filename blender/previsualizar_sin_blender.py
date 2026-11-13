"""
PREVISUALIZACIÓN GEOMÉTRICA (no es Cycles): rasteriza con z-buffer las mismas mallas y la misma cámara que usará Blender.
Sirve para comprobar encuadre, capas, bolsillos y legibilidad de las cartas. NO muestra materiales, reflejos ni luz reales.
Uso: python previsualizar_sin_blender.py [escritorio|movil]   ->  salida/previa_geometrica_<vista>.png
"""
import math, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from teselia import config as CFG, geometria as G, escena, prueba

COLOR = {"cubierta": "#2C3A55", "hilo": "#C8B08A", "hoja": "#2B2D30", "hoja_b": "#3A3D42", "soldadura": "#55595F",
         "suelo": "#3A3D42", "carta": "#FFFFFF", "carta_holo": "#FFFFFF"}


def renderizar(cfg, vista, ancho=1280):
    v = cfg["vistas"][vista]
    w0, h0 = v["resolucion"]
    W, H = ancho, int(ancho * h0 / w0)
    pos, obj, _ = G.ajustar_camara(cfg, vista)
    sh = (v["desplazamiento_x"], v["desplazamiento_y"])
    sensor = cfg["camara"]["sensor_mm"]
    piezas, _ = prueba.construir_depuracion(cfg, 2) if vista == "depuracion" else (prueba if vista == "prueba" else escena).construir(cfg)
    img = np.zeros((H, W, 3), np.float32)
    img[:] = np.array([0.10, 0.10, 0.11])
    zbuf = np.zeros((H, W), np.float32)   # guarda 1/z: mayor = más cerca
    luz = G._norm((-0.7, -0.55, 0.85))
    texturas = {}
    for p in piezas:
        if p["mat"] == "funda":
            continue   # láminas casi invisibles: no se dibujan en la vista geométrica
        base = np.array(G.hex_a_rgb(COLOR[p["mat"]]), np.float32)
        tex = None
        if p["mat"] in ("carta", "carta_holo"):
            n = p["carta"]
            if n not in texturas:
                from teselia import arte
                texturas[n] = arte.carta(n, p["mat"] == "carta_holo")[::-1, :, :3]      # fila 0 = arriba
            tex = texturas[n]
        bucle = 0
        for cara in p["caras"]:
            uvs = [(p["uv"][2 * (bucle + k)], p["uv"][2 * (bucle + k) + 1]) for k in range(len(cara))] if p["uv"] else None
            nrm = G.normal_cara(p["verts"], cara)
            bucle += len(cara)
            poli3 = _recortar([p["verts"][i] for i in cara], pos, G.base_camara(pos, obj)[0])
            if len(poli3) < 3:
                continue
            pts = [G.proyectar(q, pos, obj, v["lente_mm"], sensor, (w0, h0), sh) for q in poli3]
            if any(q is None for q in pts):
                continue
            if uvs and len(poli3) != len(cara):
                uvs = None
            lam = 0.38 + 0.62 * max(0.0, sum(a * b for a, b in zip(nrm, luz)))
            if p["suave"] is False and p["mat"] not in ("carta",):
                pass
            for k in range(1, len(pts) - 1):
                tri = [pts[0], pts[k], pts[k + 1]]
                uv3 = [uvs[0], uvs[k], uvs[k + 1]] if uvs else None
                _tri(img, zbuf, tri, uv3, base * lam, tex, W, H, lam)
    out = (np.clip(img, 0, 1) ** (1 / 1.0) * 255).astype(np.uint8)
    return Image.fromarray(out)


def _recortar(poli, pos, f, cerca=0.05):
    """Recorta un polígono 3D contra el plano cercano de la cámara (Sutherland-Hodgman)."""
    prof = lambda q: sum((q[i] - pos[i]) * f[i] for i in range(3)) - cerca
    out = []
    for a, b in zip(poli, poli[1:] + poli[:1]):
        da, db = prof(a), prof(b)
        if da >= 0:
            out.append(a)
        if (da >= 0) != (db >= 0):
            t = da / (da - db)
            out.append(tuple(a[i] + (b[i] - a[i]) * t for i in range(3)))
    return out


def _tri(img, zbuf, tri, uv, color, tex, W, H, lam):
    xs = np.array([t[0] * W for t in tri]); ys = np.array([t[1] * H for t in tri]); zs = 1.0 / np.array([t[2] for t in tri])   # 1/z: se interpola linealmente en pantalla (correcto en perspectiva)
    x0, x1 = max(int(xs.min()), 0), min(int(math.ceil(xs.max())), W - 1)
    y0, y1 = max(int(ys.min()), 0), min(int(math.ceil(ys.max())), H - 1)
    if x1 < x0 or y1 < y0:
        return
    den = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
    if abs(den) < 1e-12:
        return
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    l0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / den
    l1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / den
    l2 = 1 - l0 - l1
    m = (l0 >= -1e-6) & (l1 >= -1e-6) & (l2 >= -1e-6)
    if not m.any():
        return
    z = l0 * zs[0] + l1 * zs[1] + l2 * zs[2]   # = 1/z
    sub = zbuf[y0:y1 + 1, x0:x1 + 1]
    ok = m & (z > sub)
    if not ok.any():
        return
    sub[ok] = z[ok]
    if tex is None:
        img[y0:y1 + 1, x0:x1 + 1][ok] = color
    else:
        # coordenadas perspectiva-correctas: (Σ λi·uvi/zi) / (Σ λi/zi), con z = Σ λi/zi
        iz = zs
        u = (l0 * uv[0][0] * iz[0] + l1 * uv[1][0] * iz[1] + l2 * uv[2][0] * iz[2]) / z
        vv = (l0 * uv[0][1] * iz[0] + l1 * uv[1][1] * iz[1] + l2 * uv[2][1] * iz[2]) / z
        th, tw = tex.shape[:2]; tx = np.clip((u * tw).astype(int), 0, tw - 1); ty = np.clip(((1 - vv) * th).astype(int), 0, th - 1)
        img[y0:y1 + 1, x0:x1 + 1][ok] = tex[ty, tx][ok] * (0.55 + 0.45 * lam)


if __name__ == "__main__":
    cfg = CFG.cargar()
    vista = sys.argv[1] if len(sys.argv) > 1 else "escritorio"
    os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), "salida"), exist_ok=True)
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "salida", "previa_geometrica_%s.png" % vista)
    renderizar(cfg, vista).save(ruta)
    print("guardado", ruta)
