"""Lógica de verificación PURA (sin Blender), probada en pruebas_sin_blender.py. La parte que habla con bpy está en depuracion.py."""
import math
import numpy as np


def correlacion(a, b):
    """Coeficiente de Pearson entre dos secuencias (0 si alguna es constante)."""
    a, b = np.asarray(a, np.float64), np.asarray(b, np.float64)
    if a.size < 3 or a.std() < 1e-9 or b.std() < 1e-9:
        return 0.0
    return float(np.corrcoef(a, b)[0, 1])


def luminancia(rgb):
    rgb = np.asarray(rgb, np.float64)
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def area_poligono(pts):
    """Área con signo (positiva = antihorario)."""
    s = 0.0
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        s += x0 * y1 - x1 * y0
    return s / 2


def puntos_uv(nu=24, nv=34, margen=0.08):
    return [(margen + (1 - 2 * margen) * i / (nu - 1), margen + (1 - 2 * margen) * j / (nv - 1)) for j in range(nv) for i in range(nu)]


def muestrear_textura(tex, u, v):
    """tex: array (h, w, >=3) con fila 0 ABAJO (como los píxeles de Blender). Devuelve RGB en (u, v)."""
    h, w = tex.shape[:2]
    return tex[min(h - 1, max(0, int(v * h))), min(w - 1, max(0, int(u * w))), :3]


def traza_imagen(enlaces, nodo_destino, socket_destino):
    """¿Llega una Image Texture al socket indicado? enlaces = [{de, de_tipo, de_socket, a, a_socket}...].
    Devuelve la cadena de nodos desde la imagen hasta el destino, o None si no hay conexión."""
    pendientes = [(nodo_destino, socket_destino, [nodo_destino])]
    vistos = set()
    while pendientes:
        nodo, sock, camino = pendientes.pop()
        for e in enlaces:
            if e["a"] == nodo and (sock is None or e["a_socket"] == sock):
                if e["de_tipo"] == "TEX_IMAGE":
                    return [e["de"]] + camino
                if (e["de"], e["a_socket"]) not in vistos:
                    vistos.add((e["de"], e["a_socket"]))
                    pendientes.append((e["de"], None, [e["de"]] + camino))
    return None


UMBRALES = {"corr_sin_funda": 0.85, "corr_con_funda": 0.75, "corr_holo": 0.70, "contraste_min": 0.35, "saturados_max": 0.05}


def evaluar(corr, contraste, umbral):
    """Veredicto numérico de visibilidad de la ilustración."""
    return corr >= umbral and contraste >= UMBRALES["contraste_min"]
