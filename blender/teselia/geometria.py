"""
Geometría y matemáticas puras (sin Blender): se pueden probar con `python blender/pruebas_sin_blender.py`.
Convención: ejes de Blender (X derecha, Y profundidad, Z arriba), metros.
Las mallas son (vertices, caras) con caras en sentido antihorario visto desde fuera (normales hacia fuera).
"""
import math


# ------------------------------------------------------------------ color
def srgb_a_lineal(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_a_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


# ------------------------------------------------------------------ polígonos y mallas
def rect_redondeado(ancho, alto, radio, seg=6, cx=0.0, cy=0.0):
    """Polígono antihorario de un rectángulo con esquinas redondeadas."""
    radio = min(radio, ancho / 2, alto / 2)
    hw, hh = ancho / 2 - radio, alto / 2 - radio
    centros = [(hw, hh, 0), (-hw, hh, 90), (-hw, -hh, 180), (hw, -hh, 270)]
    pts = []
    for ox, oy, a0 in centros:
        for i in range(seg + 1):
            a = math.radians(a0 + 90.0 * i / seg)
            pts.append((cx + ox + radio * math.cos(a), cy + oy + radio * math.sin(a)))
    return pts


# ------------------------------------------------------------------ disposición del archivador


# ------------------------------------------------------------------ cámara (modelo pinhole = Blender con sensor horizontal)


# ------------------------------------------------------------------ cartas de prueba (diseños ORIGINALES, sin imágenes de terceros)
PALETAS = [
    ("#E8B04A", "#F4D98B", "#C0392B"), ("#4A90C2", "#A9D3EE", "#1F4E79"), ("#5FAE6A", "#B9E3B3", "#2D6A3A"),
    ("#9B6BB5", "#D9BEE8", "#5B3A75"), ("#D9663B", "#F2B28F", "#8E3217"), ("#6FB7B0", "#BDE6E1", "#2F6F6A"),
    ("#C9A24D", "#EBDDA9", "#7A5A1E"), ("#B85C7A", "#EBB5C7", "#7A2B47"), ("#7C8CA8", "#C5CEE0", "#3F4D6B"),
    ("#8AA64A", "#D3E3A3", "#4D6620"), ("#D98C3A", "#F3C98F", "#8A4E12"), ("#5C8FD6", "#B7D1F2", "#27497E"),
    ("#B7554F", "#E9AEA9", "#6E2420"), ("#6A9E7A", "#B5D9C0", "#2C5A3A"),
]


# ------------------------------------------------------------------ v2: bordes biselados SIN modificadores y láminas planas


def plano(poligono, z):
    """Una sola cara plana (sin grosor) con la normal hacia +Z."""
    return [(x, y, z) for x, y in poligono], [list(range(len(poligono)))]


# ------------------------------------------------------------------ v3: páginas curvas unidas al lomo


