"""
Fase 3.5 — Vista previa del GLB SIN navegador ni Three.js: lo lee con el lector propio, aplica la MISMA pose que logica.js
(copiada aquí) y lo dibuja con un z-buffer de numpy con las imágenes de las cartas. Sirve para comprobar la geometría, el sentido del giro,
el orden de las pilas y la orientación de las UV. No es Three.js ni mide rendimiento.
Uso:  python blender/previsualizar_glb.py [vueltas ...]     (0 = cerrado, 1 = abierto en la primera hoja, ... 7 = todo girado)
"""
import math
import os
import sys

import numpy as np
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from teselia import glb  # noqa: E402

RAIZ = os.path.dirname(AQUI)
WEB = os.path.join(RAIZ, "web", "prueba-3d")
PI = math.pi


def suave(t):
    return t * t * (3 - 2 * t)


def pose(p, i, prog):
    n, gt, paso, y0 = p["n_hojas"], p["grosor_tapa"], p["paso"], p["y_base"]
    yd = y0 + gt + n * paso + gt / 2 if i == 0 else y0 + gt + (n - i) * paso + paso / 2
    yi = y0 + gt / 2 if i == 0 else y0 + gt + (i - 1) * paso + paso / 2
    e = suave(min(1, max(0, prog)))
    return yd + (yi - yd) * e + 0.03 * math.sin(PI * prog), PI * e


def cargar(ruta_glb):
    js, bn = glb.leer(ruta_glb)
    def acc(i):
        a = js["accessors"][i]; v = js["bufferViews"][a["bufferView"]]
        dt = {5126: "<f4", 5123: "<u2", 5125: "<u4"}[a["componentType"]]
        nc = {"VEC3": 3, "VEC2": 2, "SCALAR": 1}[a["type"]]
        return np.frombuffer(bn, dtype=dt, count=a["count"] * nc, offset=v["byteOffset"]).reshape(-1, nc).astype(np.float64)
    mallas = []
    for m in js["meshes"]:
        pr = m["primitives"][0]
        mallas.append({"p": acc(pr["attributes"]["POSITION"]), "n": acc(pr["attributes"]["NORMAL"]), "uv": acc(pr["attributes"]["TEXCOORD_0"]),
                       "i": acc(pr["indices"]).astype(int).reshape(-1, 3), "mat": js["materials"][pr["material"]]})
    return js, mallas


def aplicar_estado(js, vueltas):
    """Devuelve la lista (malla, transformación 4x4, nodo) con el álbum en el estado 'vueltas'."""
    nodos = js["nodes"]
    p = nodos[0]["extras"]
    n = p["n_hojas"]
    prog = [1.0 if i < vueltas else 0.0 for i in range(n + 1)]
    cx = -p["ancho_tapa"] / 2 * (1 - prog[0]) + p["ancho_tapa"] / 2 * prog[n]
    nombre_a_el = {"Tapa": 0}
    for i in range(n):
        nombre_a_el["Hoja_%d" % i] = i + 1
    res = []

    def visita(i, M, vis):
        d = nodos[i]
        t = np.array(d.get("translation", [0, 0, 0]), float)
        Mi = np.eye(4); Mi[:3, 3] = t
        if d["name"] in nombre_a_el:
            el = nombre_a_el[d["name"]]
            y, rz = pose(p, el, prog[el])
            c, s = math.cos(rz), math.sin(rz)
            Mi = np.array([[c, -s, 0, 0], [s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], float); Mi[1, 3] = y
            vis = vis and (prog[el] > 0 and prog[el] < 1 or (vueltas - 2 <= el <= vueltas + 1))
        elif d["name"] == "Album":
            Mi[0, 3] = cx
        Mt = M @ Mi
        if "mesh" in d and vis:
            res.append((d["mesh"], Mt, d))
        for h in d.get("children", []):
            visita(h, Mt, vis)
    visita(0, np.eye(4), True)
    return res


def dibujar(js, mallas, vueltas, ruta_png, ancho=1400, alto=900, elev=60, az=0, radio=0.66, mirar=(0, 0.01, 0.0)):
    objetos = aplicar_estado(js, vueltas)
    cartas = [np.asarray(Image.open(os.path.join(WEB, "cartas", "c%02d.png" % i)).convert("RGB")) / 255.0 for i in range(12)]
    e, a = math.radians(elev), math.radians(az)
    tgt = np.array(mirar, float)
    pos = tgt + radio * np.array([math.cos(e) * math.sin(a), math.sin(e), math.cos(e) * math.cos(a)])
    f = tgt - pos; f /= np.linalg.norm(f)
    r = np.cross(f, [0, 1, 0]); r /= np.linalg.norm(r)
    u = np.cross(r, f)
    foco = 0.5 * alto / math.tan(math.radians(32) / 2)
    img = np.zeros((alto, ancho, 3)); img[:] = np.linspace(0.16, 0.08, alto)[:, None, None] * np.array([1, 1.05, 1.2])
    zb = np.full((alto, ancho), np.inf)
    luz = np.array([-0.5, 0.9, 0.5]); luz /= np.linalg.norm(luz)
    # mesa
    for (x, z) in ((-1, -0.7), (1, -0.7), (1, 0.7), (-1, 0.7)):
        pass
    def tri(P3, N3, UV, color, tex, alfa):
        rel = P3 - pos
        cam = np.stack([rel @ r, rel @ u, rel @ f], 1)
        if np.any(cam[:, 2] < 0.02):
            return
        sx = ancho / 2 + foco * cam[:, 0] / cam[:, 2]
        sy = alto / 2 - foco * cam[:, 1] / cam[:, 2]
        x0, x1 = int(max(0, math.floor(sx.min()))), int(min(ancho - 1, math.ceil(sx.max())))
        y0, y1 = int(max(0, math.floor(sy.min()))), int(min(alto - 1, math.ceil(sy.max())))
        if x0 > x1 or y0 > y1:
            return
        den = (sy[1] - sy[2]) * (sx[0] - sx[2]) + (sx[2] - sx[1]) * (sy[0] - sy[2])
        if abs(den) < 1e-9:
            return
        # cara frontal si la normal mira a la cámara (culling como Three.js, FrontSide)
        nf = np.cross(P3[1] - P3[0], P3[2] - P3[0])
        if np.dot(nf, pos - P3[0]) <= 0:
            return
        X, Y = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w0 = ((sy[1] - sy[2]) * (X - sx[2]) + (sx[2] - sx[1]) * (Y - sy[2])) / den
        w1 = ((sy[2] - sy[0]) * (X - sx[2]) + (sx[0] - sx[2]) * (Y - sy[2])) / den
        w2 = 1 - w0 - w1
        m = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not m.any():
            return
        iz = w0 / cam[0, 2] + w1 / cam[1, 2] + w2 / cam[2, 2]
        zz = 1 / iz
        sub = zb[y0:y1 + 1, x0:x1 + 1]
        m &= zz < sub - 1e-6
        if not m.any():
            return
        pw0, pw1, pw2 = (w0 / cam[0, 2]) / iz, (w1 / cam[1, 2]) / iz, (w2 / cam[2, 2]) / iz
        nrm = pw0[..., None] * N3[0] + pw1[..., None] * N3[1] + pw2[..., None] * N3[2]
        nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True) + 1e-12
        luz_d = np.clip(nrm @ luz, 0, 1) * 0.75 + 0.35
        if tex is not None:
            uv = pw0[..., None] * UV[0] + pw1[..., None] * UV[1] + pw2[..., None] * UV[2]
            h, wd = tex.shape[:2]
            tx = np.clip((uv[..., 0] * wd).astype(int), 0, wd - 1); ty = np.clip((uv[..., 1] * h).astype(int), 0, h - 1)
            col = tex[ty, tx]
        else:
            col = np.broadcast_to(color, luz_d.shape + (3,))
        out = col * luz_d[..., None]
        reg = img[y0:y1 + 1, x0:x1 + 1]
        reg[m] = out[m]
        sub[m] = zz[m]

    def lineal_a_srgb(c):
        return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)

    # mesa como dos triángulos
    mesa = np.array([[-1, -0.0005, -0.7], [1, -0.0005, -0.7], [1, -0.0005, 0.7], [-1, -0.0005, 0.7]])
    nm = np.tile([0, 1, 0], (3, 1)).astype(float)
    for t in ((0, 3, 2), (0, 2, 1)):
        tri(mesa[list(t)], nm, None, np.array([0.17, 0.18, 0.21]), None, 1.0)
    # objetos opacos primero; la funda (alfa 0,07) se omite: no cambia la lectura geométrica
    for im, M, d in objetos:
        m = mallas[im]
        if m["mat"]["name"] == "Funda":
            continue
        Pw = (np.c_[m["p"], np.ones(len(m["p"]))] @ M.T)[:, :3]
        Nw = m["n"] @ M[:3, :3].T
        base = np.array(m["mat"]["pbrMetallicRoughness"]["baseColorFactor"][:3])
        col = lineal_a_srgb(base)
        tex = cartas[d["extras"]["imagen"]] if d.get("extras", {}).get("tipo") == "carta" else None
        for t in m["i"]:
            tri(Pw[t], Nw[t], m["uv"][t], col, tex, 1.0)
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(ruta_png)
    return ruta_png


if __name__ == "__main__":
    js, mallas = cargar(os.path.join(WEB, "modelo", "album.glb"))
    salida = os.path.join(RAIZ, "blender", "salida")
    os.makedirs(salida, exist_ok=True)
    for v in [int(x) for x in sys.argv[1:]] or [0, 3]:
        print(dibujar(js, mallas, v, os.path.join(salida, "previa_glb_%d.png" % v)))
