"""Ilustraciones de prueba ORIGINALES (sin imágenes de terceros) para las cartas. Usa numpy (incluido en Blender).
Proporción 63:88 (512x714). Devuelve RGBA float32 con origen ABAJO-izquierda (convención de Blender).
En las holográficas el canal alfa es la MÁSCARA de la zona de ilustración (el shader la usa para localizar el brillo)."""
import numpy as np
from . import geometria as G

W, H = 512, 714
PALETAS = [
    dict(borde="#E3B341", cielo=("#6EC1E4", "#FFE2B0"), sol="#FFD25A", monte=("#2F6B5A", "#1E4A45"), bicho="#F0A04B", vientre="#FFE7B8"),
    dict(borde="#5C8FD6", cielo=("#9AD0F5", "#F4F1E4"), sol="#FFF2A8", monte=("#3A6EA5", "#274B78"), bicho="#7BC96F", vientre="#E9F7C9"),
    dict(borde="#B7554F", cielo=("#F29F7E", "#FFD9A8"), sol="#FFF0B8", monte=("#7A3B4A", "#4B2236"), bicho="#8EC7E8", vientre="#E7F4FB"),
    dict(borde="#6A9E7A", cielo=("#8FD3B6", "#F6F0C8"), sol="#FFEFA0", monte=("#2C6B58", "#1B4639"), bicho="#E8798E", vientre="#FFE3E8"),
]
PALETA_HOLO = dict(borde="#C9CED8", cielo=("#23286A", "#9A66D8"), sol="#FFF1C9", monte=("#1B2756", "#121838"), bicho="#6FD3C3", vientre="#D8FFF6")


def _c(h):
    return np.array(G.hex_a_rgb(h), np.float32)


def carta(semilla=0, holo=False):
    pal = PALETA_HOLO if holo else PALETAS[semilla % len(PALETAS)]
    rnd = np.random.RandomState(semilla + 11)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    img = np.ones((H, W, 4), np.float32)
    img[..., :3] = _c(pal["borde"])

    def rr(x0, y0, x1, y1, r):
        cx, cy, hw, hh = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
        dx = np.maximum(np.abs(xx - cx) - (hw - r), 0)
        dy = np.maximum(np.abs(yy - cy) - (hh - r), 0)
        return dx * dx + dy * dy <= r * r

    def pinta(m, col):
        img[..., :3][m] = col

    pinta(rr(20, 20, W - 20, H - 20, 22), _c("#F3EBD6"))                       # cara
    pinta(rr(36, 34, W - 36, 84, 12), _c(pal["borde"]) * 0.35 + 0.65 * _c("#F3EBD6"))   # barra de nombre
    pinta(rr(52, 46, 52 + 150, 72, 8), _c("#3A3230"))                            # nombre (barra de prueba)
    pinta(rr(W - 150, 44, W - 56, 74, 10), _c("#B93A2E"))                         # PS
    # --- ilustración
    ax0, ay0, ax1, ay1 = 40, 98, W - 40, 410
    ventana = rr(ax0, ay0, ax1, ay1, 10)
    t = np.clip((yy - ay0) / (ay1 - ay0), 0, 1)[..., None]
    pinta(ventana, (_c(pal["cielo"][0]) * (1 - t) + _c(pal["cielo"][1]) * t)[ventana])
    sol = (xx - 380) ** 2 + (yy - 190) ** 2 <= 46 ** 2
    pinta(sol & ventana, _c(pal["sol"]))
    for k, base in enumerate((300, 340)):
        y_m = base + 24 * np.sin(xx / (70 + 30 * k) + semilla + k * 2) + 12 * np.sin(xx / 23 + k)
        pinta(ventana & (yy > y_m), _c(pal["monte"][k]))
    cx = 256
    pinta(ventana & (((xx - cx) / 112) ** 2 + ((yy - 332) / 78) ** 2 <= 1), _c(pal["bicho"]))          # cuerpo
    pinta(ventana & (((xx - cx) / 66) ** 2 + ((yy - 340) / 50) ** 2 <= 1), _c(pal["vientre"]))         # vientre
    pinta(ventana & ((xx - cx) ** 2 + (yy - 250) ** 2 <= 64 ** 2), _c(pal["bicho"]))                    # cabeza
    for s in (-1, 1):
        pinta(ventana & (((xx - (cx + s * 52)) / 20) ** 2 + ((yy - 196) / 46) ** 2 <= 1), _c(pal["bicho"]))   # orejas
        pinta(ventana & ((xx - (cx + s * 26)) ** 2 + (yy - 250) ** 2 <= 11 ** 2), _c("#2A2422"))          # ojos
        pinta(ventana & ((xx - (cx + s * 22)) ** 2 + (yy - 246) ** 2 <= 4 ** 2), _c("#FFFFFF"))
        pinta(ventana & ((xx - (cx + s * 44)) ** 2 + (yy - 272) ** 2 <= 10 ** 2), _c("#F08A8A"))          # mejillas
    pinta(rr(ax0, ay0, ax1, ay0 + 5, 2) | rr(ax0, ay1 - 5, ax1, ay1, 2), _c(pal["borde"]) * 0.5)   # marco fino de la ilustración
    # --- texto de prueba: barras
    pinta(rr(40, 424, 300, 446, 8), _c(pal["borde"]) * 0.55 + 0.45 * _c("#F3EBD6"))
    for fila, y in enumerate((470, 560)):
        pinta((xx - 70) ** 2 + (yy - (y + 18)) ** 2 <= 18 ** 2, _c(pal["borde"]) * 0.8)
        pinta(rr(108, y + 4, 108 + rnd.randint(130, 200), y + 30, 8), _c("#3A3230"))
        pinta(rr(W - 150, y + 4, W - 60, y + 30, 8), _c("#3A3230"))
        for k in range(2):
            pinta(rr(108, y + 40 + k * 18, 108 + rnd.randint(250, 330), y + 50 + k * 18, 4), _c("#7A726A"))
    pinta(rr(40, 646, W - 40, 652, 2), _c(pal["borde"]) * 0.6)
    for k in range(3):
        pinta((xx - (62 + k * 44)) ** 2 + (yy - 678) ** 2 <= 11 ** 2, _c(pal["borde"]) * 0.7)
    pinta(rr(W - 150, 668, W - 50, 686, 6), _c("#7A726A"))
    if holo:
        img[..., 3] = ventana.astype(np.float32)        # máscara de la lámina holográfica = ventana de ilustración
    return img[::-1].copy()
