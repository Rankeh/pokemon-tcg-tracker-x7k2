"""
Geometría y matemáticas puras (sin Blender): se pueden probar con `python blender/pruebas_sin_blender.py`.
Convención: ejes de Blender (X derecha, Y profundidad, Z arriba), metros.
Las mallas son (vertices, caras) con caras en sentido antihorario visto desde fuera (normales hacia fuera).
"""
import math
import random


# ------------------------------------------------------------------ color
def srgb_a_lineal(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_a_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def hex_a_lineal(h):
    """'#RRGGBB' (sRGB) -> (r, g, b) lineal, que es lo que espera Blender en los colores de nodos."""
    return tuple(srgb_a_lineal(c) for c in hex_a_rgb(h))


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


def volumen_con_signo(verts, caras):
    """Volumen con signo (positivo si las normales apuntan hacia fuera). Triangula cada cara en abanico."""
    v = 0.0
    for cara in caras:
        a = verts[cara[0]]
        for i in range(1, len(cara) - 1):
            b, c = verts[cara[i]], verts[cara[i + 1]]
            v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6.0
    return v


def orientar(verts, caras):
    """Garantiza normales hacia fuera (si el volumen sale negativo invierte todas las caras)."""
    if volumen_con_signo(verts, caras) < 0:
        caras = [list(reversed(c)) for c in caras]
    return verts, caras


def losa(poligono, z0, z1):
    """Prisma recto: polígono antihorario extruido de z0 a z1."""
    n = len(poligono)
    verts = [(x, y, z0) for x, y in poligono] + [(x, y, z1) for x, y in poligono]
    caras = [list(range(n, 2 * n)), list(range(n - 1, -1, -1))]
    for i in range(n):
        j = (i + 1) % n
        caras.append([i, j, n + j, n + i])
    return orientar(verts, caras)


def cuna(ancho, largo, alto):
    """Cuña (atril): triángulo (y,z) = (0,0),(largo,0),(largo,alto) extruido en X de -ancho/2 a ancho/2.
    La cara inclinada sube con +Y: el borde delantero toca la mesa y el trasero queda a 'alto'."""
    tri = [(0.0, 0.0), (largo, 0.0), (largo, alto)]
    v, c = losa(tri, -ancho / 2, ancho / 2)
    # (u, v, w) -> (x=w, y=u, z=v): permutación cíclica, conserva la orientación
    return orientar([(w, u, vv) for u, vv, w in v], c)


def toro(R, r, seg_mayor=40, seg_menor=10):
    """Toro en el plano XZ (eje del anillo = Y), centrado en el origen."""
    verts, caras = [], []
    for i in range(seg_mayor):
        t = 2 * math.pi * i / seg_mayor
        for j in range(seg_menor):
            f = 2 * math.pi * j / seg_menor
            d = R + r * math.cos(f)
            verts.append((d * math.cos(t), r * math.sin(f), d * math.sin(t)))
    for i in range(seg_mayor):
        for j in range(seg_menor):
            a = i * seg_menor + j
            b = ((i + 1) % seg_mayor) * seg_menor + j
            c = ((i + 1) % seg_mayor) * seg_menor + (j + 1) % seg_menor
            d = i * seg_menor + (j + 1) % seg_menor
            caras.append([a, b, c, d])
    return orientar(verts, caras)


def arco_anilla(R, r, abierto_grados=40, seg_mayor=36, seg_menor=10):
    """Anilla en 'D' abierta por abajo (como las de un archivador): toro parcial en el plano XZ.
    Devuelve (verts, caras) con tapas planas para que sea cerrada. Centro del círculo en el origen."""
    ini = math.radians(-90 + abierto_grados / 2)
    fin = math.radians(270 - abierto_grados / 2)
    verts, caras = [], []
    for i in range(seg_mayor + 1):
        t = ini + (fin - ini) * i / seg_mayor
        for j in range(seg_menor):
            f = 2 * math.pi * j / seg_menor
            d = R + r * math.cos(f)
            verts.append((d * math.cos(t), r * math.sin(f), d * math.sin(t)))
    for i in range(seg_mayor):
        for j in range(seg_menor):
            a = i * seg_menor + j
            b = (i + 1) * seg_menor + j
            c = (i + 1) * seg_menor + (j + 1) % seg_menor
            d = i * seg_menor + (j + 1) % seg_menor
            caras.append([a, b, c, d])
    caras.append(list(range(seg_menor - 1, -1, -1)))
    caras.append([seg_mayor * seg_menor + j for j in range(seg_menor)])
    return orientar(verts, caras)


def puntadas(poligono, largo, hueco, ancho):
    """Cuadriláteros (4 puntos 2D) a lo largo del perímetro: costura discontinua (trazos de 'largo' y huecos)."""
    quads = []
    n = len(poligono)
    ciclo = largo + hueco
    acum = 0.0   # longitud de perímetro recorrida al inicio del segmento
    for i in range(n):
        x0, y0 = poligono[i]
        x1, y1 = poligono[(i + 1) % n]
        seg = math.hypot(x1 - x0, y1 - y0)
        if seg < 1e-9:
            continue
        dx, dy = (x1 - x0) / seg, (y1 - y0) / seg
        nx, ny = -dy * ancho / 2, dx * ancho / 2
        k = int(acum // ciclo)
        while k * ciclo < acum + seg:
            a = max(k * ciclo, acum) - acum
            b = min(k * ciclo + largo, acum + seg) - acum
            if b - a > 1e-6:
                ax, ay = x0 + dx * a, y0 + dy * a
                bx, by = x0 + dx * b, y0 + dy * b
                quads.append([(ax - nx, ay - ny), (bx - nx, by - ny), (bx + nx, by + ny), (ax + nx, ay + ny)])
            k += 1
        acum += seg
    return quads


def inset(poligono, d):
    """Desplaza hacia dentro un polígono convexo-ish (hacia su centroide), válido para rectángulos redondeados."""
    cx = sum(p[0] for p in poligono) / len(poligono)
    cy = sum(p[1] for p in poligono) / len(poligono)
    out = []
    for x, y in poligono:
        vx, vy = x - cx, y - cy
        L = math.hypot(vx, vy) or 1.0
        out.append((x - vx / L * d, y - vy / L * d))
    return out


# ------------------------------------------------------------------ disposición del archivador
def posiciones_bolsillos(cfg, lado):
    """Centros (x, y) de los 9 bolsillos de la hoja. lado=+1 derecha, -1 izquierda (espejo respecto al lomo).
    Orden de lectura: fila superior de izquierda a derecha (según se ve la página), luego las siguientes."""
    a = cfg["archivador"]
    b, h = a["bolsillo"], a["hoja"]
    x0 = h["inicio_x"] + b["margen_interior"] + b["ancho"] / 2
    paso_x = b["ancho"] + b["separacion"]
    paso_y = b["alto"] + b["separacion"]
    centros = []
    for fila in range(3):
        for col in range(3):
            x = x0 + col * paso_x
            y = (1 - fila) * paso_y
            centros.append((lado * x, y))
    # visto desde el espectador, la lectura va de izquierda a derecha en ambas páginas
    if lado < 0:
        centros = [c for f in range(3) for c in sorted(centros[f * 3:f * 3 + 3])]
    return centros


def rot_x(p, ang):
    c, s = math.cos(ang), math.sin(ang)
    return (p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c)


def a_mundo(p, cfg, pivote_y=0.0):
    """Punto del álbum (locales: centro del lomo en el origen, plano XY, apoyo en z=0) -> mundo. Con inclinación 0 es la
    identidad; si no, gira alrededor del borde delantero (y = -alto/2)."""
    a = cfg["archivador"]
    t = math.radians(a["inclinacion_grados"])
    y_borde = -a["cubierta"]["alto"] / 2
    q = rot_x((p[0], p[1] - y_borde, p[2]), t)
    return (q[0], q[1] + y_borde + pivote_y, q[2])


# ------------------------------------------------------------------ cámara (modelo pinhole = Blender con sensor horizontal)
def _norm(v):
    L = math.sqrt(sum(c * c for c in v)) or 1.0
    return tuple(c / L for c in v)


def _cruz(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def base_camara(pos, objetivo):
    f = _norm(tuple(o - p for o, p in zip(objetivo, pos)))
    derecha = _norm(_cruz(f, (0.0, 0.0, 1.0)))
    arriba = _cruz(derecha, f)
    return f, derecha, arriba


def posicion_camara(objetivo, distancia, elevacion_deg, azimut_deg):
    e, az = math.radians(elevacion_deg), math.radians(azimut_deg)
    return (objetivo[0] + distancia * math.sin(az) * math.cos(e),
            objetivo[1] - distancia * math.cos(az) * math.cos(e),
            objetivo[2] + distancia * math.sin(e))


def euler_camara(pos, objetivo):
    """Euler XYZ (radianes) de una cámara de Blender (mira a -Z, arriba +Y) que mira de pos a objetivo."""
    f, r, u = base_camara(pos, objetivo)
    z = (-f[0], -f[1], -f[2])
    # Matriz con columnas (r, u, z); extracción XYZ
    m = [[r[0], u[0], z[0]], [r[1], u[1], z[1]], [r[2], u[2], z[2]]]
    sy = m[0][2]
    y = math.asin(max(-1.0, min(1.0, sy)))
    if abs(sy) < 0.999999:
        x = math.atan2(-m[1][2], m[2][2])
        zz = math.atan2(-m[0][1], m[0][0])
    else:
        x = math.atan2(m[2][1], m[1][1])
        zz = 0.0
    return (x, y, zz)


def proyectar(p, pos, objetivo, lente, sensor, res, shift=(0.0, 0.0)):
    """Punto 3D -> (u, v) en [0,1] (u izquierda->derecha, v ARRIBA->abajo como en una imagen) y profundidad."""
    f, r, u = base_camara(pos, objetivo)
    d = tuple(a - b for a, b in zip(p, pos))
    z = _dot(d, f)
    if z <= 1e-9:
        return None
    x, y = _dot(d, r), _dot(d, u)
    w, h = res
    px = 0.5 + lente * x / (z * sensor) - shift[0]
    py = 0.5 + (lente * y / (z * sensor)) * (w / h) - shift[1] * (w / h)
    return (px, 1.0 - py, z)


def _sw(cfg):
    l = cfg["archivador"]["lomo"]
    return l["ancho"] / 2 + l.get("hendidura", 0.0)


def esquinas_archivador(cfg, lado):
    """Puntos (mundo) que deben quedar dentro del encuadre. lado: 'doble' | 'derecha' | 'bolsillo'."""
    a = cfg["archivador"]
    cw, ch, gz = a["cubierta"]["ancho"], a["cubierta"]["alto"], a["cubierta"]["grosor"]
    sw = _sw(cfg)
    pts = []
    if lado == "prueba":
        from . import prueba as _pr
        return _pr.esquinas(cfg)
    if lado == "bolsillo":
        px, py = posiciones_bolsillos(cfg, 1)[4]
        b = a["bolsillo"]
        for dx in (-1, 1):
            for dy in (-1, 1):
                pts.append(a_mundo((px + dx * (b["ancho"] / 2 + 0.004), py + dy * (b["alto"] / 2 + 0.004), gz + 0.012), cfg))
        return pts
    xs = (-(sw + cw) if lado == "doble" else sw, sw + cw)
    for x in xs:
        for y in (-ch / 2, ch / 2):
            for z in (0.0, gz):
                pts.append(a_mundo((x, y, z), cfg))
    return pts


def objetivo_vista(cfg, lado):
    a = cfg["archivador"]
    sw, cw = _sw(cfg), a["cubierta"]["ancho"]
    if lado == "prueba":
        return (0.0, 0.0, 0.002)
    if lado == "bolsillo":
        px, py = posiciones_bolsillos(cfg, 1)[4]
        return a_mundo((px, py, a["cubierta"]["grosor"] + 0.012), cfg)
    x = 0.0 if lado == "doble" else sw + cw / 2
    return a_mundo((x, 0.0, a["cubierta"]["grosor"] + 0.01), cfg)


def caja_pantalla(puntos, pos, objetivo, lente, sensor, res, shift):
    uv = [proyectar(p, pos, objetivo, lente, sensor, res, shift) for p in puntos]
    uv = [q for q in uv if q]
    us, vs = [q[0] for q in uv], [q[1] for q in uv]
    return min(us), min(vs), max(us), max(vs)


def ajustar_camara(cfg, vista):
    """Calcula (pos, objetivo, distancia) para que el archivador ocupe 'ocupacion_ancho' del ancho de imagen.
    Bisección sobre la distancia con el mismo modelo que usa Blender."""
    v = cfg["vistas"][vista]
    sensor = cfg["camara"]["sensor_mm"]
    obj = objetivo_vista(cfg, v["objetivo"])
    pts = esquinas_archivador(cfg, v["objetivo"])
    lo, hi = 0.15, 5.0
    for _ in range(60):
        d = (lo + hi) / 2
        pos = posicion_camara(obj, d, v["elevacion_grados"], v["azimut_grados"])
        u0, v0, u1, v1 = caja_pantalla(pts, pos, obj, v["lente_mm"], sensor, v["resolucion"], (v["desplazamiento_x"], v["desplazamiento_y"]))
        ocupa = (v1 - v0) if v.get("eje") == "v" else (u1 - u0)
        if ocupa > v["ocupacion_ancho"]:
            lo = d
        else:
            hi = d
    d = (lo + hi) / 2
    return posicion_camara(obj, d, v["elevacion_grados"], v["azimut_grados"]), obj, d


# ------------------------------------------------------------------ cartas de prueba (diseños ORIGINALES, sin imágenes de terceros)
PALETAS = [
    ("#E8B04A", "#F4D98B", "#C0392B"), ("#4A90C2", "#A9D3EE", "#1F4E79"), ("#5FAE6A", "#B9E3B3", "#2D6A3A"),
    ("#9B6BB5", "#D9BEE8", "#5B3A75"), ("#D9663B", "#F2B28F", "#8E3217"), ("#6FB7B0", "#BDE6E1", "#2F6F6A"),
    ("#C9A24D", "#EBDDA9", "#7A5A1E"), ("#B85C7A", "#EBB5C7", "#7A2B47"), ("#7C8CA8", "#C5CEE0", "#3F4D6B"),
    ("#8AA64A", "#D3E3A3", "#4D6620"), ("#D98C3A", "#F3C98F", "#8A4E12"), ("#5C8FD6", "#B7D1F2", "#27497E"),
    ("#B7554F", "#E9AEA9", "#6E2420"), ("#6A9E7A", "#B5D9C0", "#2C5A3A"),
]


def carta_pixeles(ancho=252, alto=352, semilla=0):
    """Devuelve lista plana RGBA (valores sRGB 0..1) de una carta con borde, marco, ilustración geométrica,
    barra de nombre y líneas de texto. Origen abajo-izquierda (convención de Blender)."""
    rnd = random.Random(semilla)
    borde, claro, oscuro = PALETAS[semilla % len(PALETAS)]
    cb, cc, co = hex_a_rgb(borde), hex_a_rgb(claro), hex_a_rgb(oscuro)
    papel = (0.95, 0.92, 0.84)
    px = [[papel] * ancho for _ in range(alto)]   # fila 0 = arriba (se invierte al final)

    def rect(x0, y0, x1, y1, col):
        for y in range(max(0, y0), min(alto, y1)):
            fila = px[y]
            for x in range(max(0, x0), min(ancho, x1)):
                fila[x] = col

    rect(0, 0, ancho, alto, cb)                                  # borde
    rect(12, 12, ancho - 12, alto - 12, papel)                   # cara
    rect(20, 20, ancho - 20, 52, cc)                             # barra de nombre
    rect(28, 28, 28 + rnd.randint(70, 120), 44, co)
    ax0, ay0, ax1, ay1 = 24, 62, ancho - 24, 62 + 150            # ilustración
    for y in range(ay0, ay1):                                    # degradado vertical
        t = (y - ay0) / (ay1 - ay0)
        col = tuple(cc[i] * (1 - t) + cb[i] * t for i in range(3))
        for x in range(ax0, ax1):
            px[y][x] = col
    for _ in range(3):                                           # formas
        cx, cy, r = rnd.randint(ax0 + 20, ax1 - 20), rnd.randint(ay0 + 20, ay1 - 20), rnd.randint(18, 55)
        col = co if rnd.random() < 0.5 else papel
        for y in range(max(ay0, cy - r), min(ay1, cy + r)):
            dx = int((r * r - (y - cy) ** 2) ** 0.5)
            for x in range(max(ax0, cx - dx), min(ax1, cx + dx)):
                px[y][x] = tuple(px[y][x][i] * 0.45 + col[i] * 0.55 for i in range(3))
    rect(24, 222, ancho - 24, 228, co)                           # separador
    for k in range(5):                                           # líneas de texto
        rect(28, 238 + k * 16, 28 + rnd.randint(110, ancho - 70), 244 + k * 16, (0.35, 0.33, 0.3))
    rect(24, alto - 44, ancho - 24, alto - 30, cc)               # pie
    plano = []
    for y in range(alto - 1, -1, -1):
        for (r, g, b) in px[y]:
            plano.extend((r, g, b, 1.0))
    return plano


def uv_planas(verts, caras, ancho, alto):
    """UV por bucle (orden de las caras) proyectando x,y sobre el rectángulo ancho x alto centrado."""
    uv = []
    for cara in caras:
        for i in cara:
            x, y, _ = verts[i]
            uv.extend((x / ancho + 0.5, y / alto + 0.5))
    return uv


def esfera(r, seg=16, anillos=10):
    """Esfera UV (polos incluidos) con normales hacia fuera."""
    verts = [(0.0, 0.0, r)]
    for i in range(1, anillos):
        t = math.pi * i / anillos
        for j in range(seg):
            f = 2 * math.pi * j / seg
            verts.append((r * math.sin(t) * math.cos(f), r * math.sin(t) * math.sin(f), r * math.cos(t)))
    verts.append((0.0, 0.0, -r))
    caras = [[0, 1 + (j + 1) % seg, 1 + j] for j in range(seg)]
    for i in range(anillos - 2):
        for j in range(seg):
            a, b = 1 + i * seg + j, 1 + i * seg + (j + 1) % seg
            c, d = 1 + (i + 1) * seg + (j + 1) % seg, 1 + (i + 1) * seg + j
            caras.append([a, b, c, d])
    ult = len(verts) - 1
    base = 1 + (anillos - 2) * seg
    caras += [[ult, base + j, base + (j + 1) % seg] for j in range(seg)]
    return orientar(verts, caras)


# ------------------------------------------------------------------ v2: bordes biselados SIN modificadores y láminas planas
def losa_biselada(ancho, alto, radio, z0, z1, bisel, seg_bisel=5, seg_esq=6, cx=0.0, cy=0.0):
    """Losa de esquinas redondeadas con el canto redondeado (bisel) construido en la propia malla.
    Las caras superior e inferior tienen vértices PROPIOS (arista dura): con sombreado suave su normal es
    exactamente +Z/-Z y no se 'curva' el reflejo, que era la causa de los cristales deformados de la v1."""
    grosor = z1 - z0
    b = min(bisel, grosor / 2 * 0.98, min(ancho, alto) / 2 * 0.9)
    radio = max(radio, b + 0.0003)

    def anillo(d):
        return rect_redondeado(ancho - 2 * d, alto - 2 * d, radio - d, seg_esq, cx, cy)

    n = len(anillo(0))
    arriba = [(math.pi / 2 * k / seg_bisel) for k in range(seg_bisel + 1)]
    perfil = [(b * (1 - math.sin(t)), z1 - b * (1 - math.cos(t))) for t in arriba]
    perfil += [(b * (1 - math.sin(t)), z0 + b * (1 - math.cos(t))) for t in reversed(arriba)]
    verts, filas = [], []
    for d, z in perfil:
        filas.append(list(range(len(verts), len(verts) + n)))
        verts += [(x, y, z) for x, y in anillo(d)]
    tapa_sup = list(range(len(verts), len(verts) + n))
    verts += [(x, y, z1) for x, y in anillo(b)]
    tapa_inf = list(range(len(verts), len(verts) + n))
    verts += [(x, y, z0) for x, y in anillo(b)]
    caras = [tapa_sup, list(reversed(tapa_inf))]
    for a, c in zip(filas[:-1], filas[1:]):
        for i in range(n):
            j = (i + 1) % n
            caras.append([c[i], c[j], a[j], a[i]])
    return orientar(verts, caras)


def plano(poligono, z):
    """Una sola cara plana (sin grosor) con la normal hacia +Z."""
    return [(x, y, z) for x, y in poligono], [list(range(len(poligono)))]


def marco_plano(ancho, alto, radio, borde, z, seg=4, cx=0.0, cy=0.0):
    """Marco plano (corona) entre el rectángulo redondeado interior (ancho x alto) y el exterior (+borde por lado)."""
    ext = rect_redondeado(ancho + 2 * borde, alto + 2 * borde, radio + borde, seg, cx, cy)
    inte = rect_redondeado(ancho, alto, radio, seg, cx, cy)
    n = len(ext)
    verts = [(x, y, z) for x, y in ext] + [(x, y, z) for x, y in inte]
    caras = [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    return verts, caras


def rotar_z_alrededor(verts, ang, cx, cy):
    c, s = math.cos(ang), math.sin(ang)
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c, z) for x, y, z in verts]


def normal_cara(verts, cara):
    a, b, c = verts[cara[0]], verts[cara[1]], verts[cara[2]]
    u = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    v = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
    return _norm(_cruz(u, v))


# ------------------------------------------------------------------ v3: páginas curvas unidas al lomo
def suave_paso(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def lineas(a, b, n):
    return [a + (b - a) * i / n for i in range(n + 1)]


def espejo_x(verts, caras):
    return [(-x, y, z) for x, y, z in verts], [list(reversed(c)) for c in caras]


def hoja_curva(xa, xb, alto, radio, zfun, grosor, lc=0.014):
    """Hoja (lado derecho, x de xa a xb) como rejilla con grosor: cada vértice sube a z = zfun(x). El borde exterior
    tiene esquinas redondeadas (el cuadrado de la esquina se proyecta sobre un cuarto de círculo). Los lados llevan
    vértices propios, así la superficie es suave y los cantos son duros."""
    xs = sorted(set(round(x, 9) for x in lineas(xa, xa + lc, 7) + lineas(xa + lc, xb - radio, 2) + lineas(xb - radio, xb, 4)))
    ys = sorted(set(round(y, 9) for y in lineas(-alto / 2, -alto / 2 + radio, 4) + lineas(-alto / 2 + radio, alto / 2 - radio, 3) + lineas(alto / 2 - radio, alto / 2, 4)))
    nx, ny = len(xs), len(ys)
    cx = xb - radio

    def plano_xy(i, j):
        x, y = xs[i], ys[j]
        if x > cx + 1e-12 and (y < -alto / 2 + radio - 1e-12 or y > alto / 2 - radio + 1e-12):
            cy = (-alto / 2 + radio) if y < 0 else (alto / 2 - radio)
            vx, vy = x - cx, abs(y - cy)
            d = math.hypot(vx, vy)
            if d > 1e-12:
                s = max(vx, vy) / d
                x, y = cx + vx * s, cy + math.copysign(vy * s, y - cy)
        return x, y

    P = [[plano_xy(i, j) for j in range(ny)] for i in range(nx)]
    verts, T, B = [], {}, {}
    for i in range(nx):
        for j in range(ny):
            x, y = P[i][j]
            z = zfun(x)
            T[i, j] = len(verts); verts.append((x, y, z + grosor))
            B[i, j] = len(verts); verts.append((x, y, z))
    caras = []
    for i in range(nx - 1):
        for j in range(ny - 1):
            caras.append([T[i, j], T[i + 1, j], T[i + 1, j + 1], T[i, j + 1]])
            caras.append([B[i, j + 1], B[i + 1, j + 1], B[i + 1, j], B[i, j]])
    borde = [(i, 0) for i in range(nx)] + [(nx - 1, j) for j in range(1, ny)] + [(i, ny - 1) for i in range(nx - 2, -1, -1)] + [(0, j) for j in range(ny - 2, 0, -1)]
    pared = {}
    for (i, j) in borde:
        x, y = P[i][j]
        z = zfun(x)
        pared[i, j] = (len(verts), len(verts) + 1)
        verts.append((x, y, z)); verts.append((x, y, z + grosor))
    for k in range(len(borde)):
        a, b = pared[borde[k]], pared[borde[(k + 1) % len(borde)]]
        caras.append([a[0], b[0], b[1], a[1]])
    return orientar(verts, caras)
