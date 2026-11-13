"""
Fase 3.5 — Modelo del álbum para la web como ÁRBOL DE NODOS PURO (sin Blender, sin Three.js).

Una única fuente de verdad para dos caminos:
  (a) glb.py            -> escribe album.glb en Python puro (se puede ejecutar y comprobar sin Blender)
  (b) exportar_glb_blender.py -> reconstruye ESTE mismo árbol en Blender y usa su exportador glTF.

Convención de coordenadas: las de glTF/Three.js (Y arriba, +Z hacia quien mira, metros).
  - El álbum está tumbado sobre la mesa (plano XZ); el eje del lomo corre a lo largo de Z, en x = 0.
  - Cada hoja es un nodo PIVOTE situado sobre el eje del lomo; su geometría se extiende hacia +x.
    Girar la hoja = rotation.z de 0 a π (+x pasa por +y hasta -x): de la pila derecha a la izquierda.
  - Cada hoja tiene dos caras con 9 bolsillos: la frontal (+y) y la dorsal (-y).
    Tras girar, la dorsal queda arriba, con las UV espejadas en u para que la imagen se lea bien.

Jerarquía (nombres estables que usa el JS):
  Album
   ├ Contratapa, Lomo                         (mallas estáticas)
   ├ Tapa                                     (pivote que gira, como una hoja gruesa)
   └ Hoja_i  (pivote, extras {tipo:'hoja'})
       ├ Hoja_i_Losa
       ├ Hoja_i_F  /  Hoja_i_D                (grupos de cara)
       │   ├ ..._Soldaduras, ..._Funda        (una malla cada uno, no una por bolsillo)
       │   └ ..._Bolsillo_k  (nodo SIEMPRE presente, extras {tipo:'bolsillo'})
       │       └ ..._Carta_k (malla compartida; SOLO si el bolsillo está ocupado)
Los bolsillos vacíos son nodos sin hijo: rellenar/vaciar no reconstruye el modelo.
"""
import math
import random

from . import geometria as G

# ------------------------------------------------------------------ parámetros (metros), tomados de configuracion.json
N_HOJAS_DEFECTO = 9      # 9 hojas físicas × 2 caras × 9 bolsillos = 18 páginas (catálogo de 158 cartas)
PASO = 0.0035            # separación vertical entre hojas apiladas (mayor que en el render para que se lean en 3D)
GROSOR_TAPA = 0.006
SEP_FUNDA = 0.0012       # altura de la funda sobre la hoja
ALTO_CARTA = 0.0006      # altura de la carta sobre la hoja
ALTO_SOLD = 0.0004
Y_BASE = 0.0


def _tri_orientado(verts, tri, n_deseada):
    """Devuelve el triángulo con el devanado que haga que su normal mire hacia n_deseada."""
    a, b, c = (verts[i] for i in tri)
    u = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    v = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
    n = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
    if n[0] * n_deseada[0] + n[1] * n_deseada[1] + n[2] * n_deseada[2] < 0:
        return (tri[0], tri[2], tri[1])
    return tuple(tri)


class Malla:
    """Malla con normales y UV por vértice (listas planas de tuplas)."""

    def __init__(self, material):
        self.material = material
        self.verts, self.normales, self.uvs, self.tris = [], [], [], []

    def vertice(self, p, n, uv=(0.0, 0.0)):
        self.verts.append(tuple(p))
        self.normales.append(tuple(n))
        self.uvs.append(tuple(uv))
        return len(self.verts) - 1

    def triangulo(self, a, b, c, n):
        self.tris.append(_tri_orientado(self.verts, (a, b, c), n))

    def fusionar(self, otra):
        off = len(self.verts)
        self.verts += otra.verts
        self.normales += otra.normales
        self.uvs += otra.uvs
        self.tris += [(a + off, b + off, c + off) for a, b, c in otra.tris]


def _centro(poli):
    return (sum(p[0] for p in poli) / len(poli), sum(p[1] for p in poli) / len(poli))


def losa_xz(poligono, y0, y1, material):
    """Prisma de base convexa (x,z) entre y0 e y1: tapas planas (±y) y pared lateral con normales suaves."""
    m = Malla(material)
    cx, cz = _centro(poligono)
    for y, n in ((y1, (0, 1, 0)), (y0, (0, -1, 0))):
        c = m.vertice((cx, y, cz), n)
        ids = [m.vertice((x, y, z), n) for x, z in poligono]
        for i in range(len(ids)):
            m.triangulo(c, ids[i], ids[(i + 1) % len(ids)], n)
    # pared: normal de vértice = media de las normales de sus dos aristas (hacia fuera)
    k = len(poligono)
    nv = []
    for i in range(k):
        px, pz = poligono[i - 1]
        qx, qz = poligono[(i + 1) % k]
        tx, tz = qx - px, qz - pz
        nx, nz = tz, -tx
        d = math.hypot(nx, nz) or 1.0
        nx, nz = nx / d, nz / d
        if nx * (poligono[i][0] - cx) + nz * (poligono[i][1] - cz) < 0:
            nx, nz = -nx, -nz
        nv.append((nx, 0.0, nz))
    arriba = [m.vertice((x, y1, z), nv[i]) for i, (x, z) in enumerate(poligono)]
    abajo = [m.vertice((x, y0, z), nv[i]) for i, (x, z) in enumerate(poligono)]
    for i in range(k):
        j = (i + 1) % k
        nn = (nv[i][0] + nv[j][0], 0.0, nv[i][2] + nv[j][2])
        m.triangulo(arriba[i], abajo[i], arriba[j], nn)
        m.triangulo(arriba[j], abajo[i], abajo[j], nn)
    return m


def lamina_xz(poligono, y, hacia_arriba, material, uv=None):
    """Polígono convexo plano (una sola cara visible). uv(x,z) -> (u,v) si se necesita."""
    m = Malla(material)
    n = (0, 1, 0) if hacia_arriba else (0, -1, 0)
    cx, cz = _centro(poligono)
    f = uv or (lambda x, z: (0.0, 0.0))
    c = m.vertice((cx, y, cz), n, f(cx, cz))
    ids = [m.vertice((x, y, z), n, f(x, z)) for x, z in poligono]
    for i in range(len(ids)):
        m.triangulo(c, ids[i], ids[(i + 1) % len(ids)], n)
    return m


def tiras_u(cx, cz, ancho, alto, grosor, y, hacia_arriba, material):
    """Soldadura en U abierta por arriba (borde z-): dos laterales y la base, como tiras planas."""
    m = Malla(material)
    n = (0, 1, 0) if hacia_arriba else (0, -1, 0)
    x0, x1, z0, z1 = cx - ancho / 2, cx + ancho / 2, cz - alto / 2, cz + alto / 2
    rects = [(x0 - grosor, z0, x0, z1 + grosor), (x1, z0, x1 + grosor, z1 + grosor), (x0 - grosor, z1, x1 + grosor, z1 + grosor)]
    for a, b, c, d in rects:
        ids = [m.vertice((px, y, pz), n) for px, pz in ((a, b), (c, b), (c, d), (a, d))]
        m.triangulo(ids[0], ids[1], ids[2], n)
        m.triangulo(ids[0], ids[2], ids[3], n)
    return m


def _normales_poligono(poligono):
    """Normal exterior (x, z) de cada vértice de un polígono convexo: media de las normales de sus dos aristas."""
    k = len(poligono)
    cx, cz = _centro(poligono)
    out = []
    for i in range(k):
        px, pz = poligono[i - 1]
        qx, qz = poligono[(i + 1) % k]
        nx, nz = qz - pz, -(qx - px)
        d = math.hypot(nx, nz) or 1.0
        nx, nz = nx / d, nz / d
        if nx * (poligono[i][0] - cx) + nz * (poligono[i][1] - cz) < 0:
            nx, nz = -nx, -nz
        out.append((nx, nz))
    return out


def losa_biselada_xz(poligono, y0, y1, bisel, seg, material):
    """3.7.6 · Prisma de base convexa con los DOS cantos redondeados (perfil de cuarto de círculo, `seg` pasos) y normales suaves.
    Mismas dimensiones exteriores que losa_xz (el bisel se talla hacia dentro): las cajas, el encuadre y las alturas no cambian.
    Los círculos de las esquinas del polígono deben tener radio ≥ bisel."""
    bisel = min(bisel, (y1 - y0) / 2 - 1e-6)
    m = Malla(material)
    cx, cz = _centro(poligono)
    nv = _normales_poligono(poligono)
    k = len(poligono)
    anillos = []                                             # (lista de índices, y) de arriba a abajo
    angulos = [90.0 * (seg - j) / seg for j in range(seg + 1)]
    for sup in (True, False):
        for a in (angulos if sup else angulos[::-1]):
            t = math.radians(a)
            d = bisel * (1.0 - math.cos(t))
            y = (y1 - bisel + bisel * math.sin(t)) if sup else (y0 + bisel - bisel * math.sin(t))
            sy = 1.0 if sup else -1.0
            ids = [m.vertice((x - nv[i][0] * d, y, z - nv[i][1] * d), (nv[i][0] * math.cos(t), sy * math.sin(t), nv[i][1] * math.cos(t)))
                   for i, (x, z) in enumerate(poligono)]
            anillos.append(ids)
    for y, n in ((y1, (0, 1, 0)), (y0, (0, -1, 0))):         # tapas planas: abanico desde el centro hasta el anillo de 90°
        c = m.vertice((cx, y, cz), n)
        ring = anillos[0] if y == y1 else anillos[-1]
        for i in range(k):
            m.triangulo(c, ring[i], ring[(i + 1) % k], n)
    for r in range(len(anillos) - 1):
        a, b = anillos[r], anillos[r + 1]
        for i in range(k):
            j = (i + 1) % k
            nn = (nv[i][0] + nv[j][0], 0.0, nv[i][1] + nv[j][1])
            if abs(nn[0]) + abs(nn[2]) < 1e-9:
                nn = (nv[i][0], 0.0, nv[i][1])
            nn = (nn[0], 0.35 if r < len(anillos) // 2 - 1 else (-0.35 if r >= len(anillos) // 2 else 0.0), nn[2])
            m.triangulo(a[i], b[i], a[j], nn)
            m.triangulo(a[j], b[i], b[j], nn)
    return m


def tiras_u_biseladas(cx, cz, ancho, alto, grosor, y, hacia_arriba, material, altura=0.0005):
    """Soldadura en U como TRES barras redondeadas (relieve de sellado térmico) en vez de tiras planas."""
    m = Malla(material)
    x0, x1, z0, z1 = cx - ancho / 2, cx + ancho / 2, cz - alto / 2, cz + alto / 2
    rects = [(x0 - grosor, z0, x0, z1 + grosor), (x1, z0, x1 + grosor, z1 + grosor), (x0 - grosor, z1, x1 + grosor, z1 + grosor)]
    for a, b, c, d in rects:
        poli = [(a, b), (c, b), (c, d), (a, d)]                      # 4 vértices + 1 paso de bisel: a 0,4 mm de alto no se distingue de un redondeo y cuesta 4× menos
        poli = [(x, z) for x, z in poli]
        y0, y1 = (y, y + altura) if hacia_arriba else (y - altura, y)
        m.fusionar(losa_biselada_xz(poli, y0, y1, altura * 0.45, 1, material))
    return m


def _puntadas(trazado, largo, hueco, cerrado):
    """Posiciones (x, z, ángulo) de las puntadas repartidas por un trazado (lista de puntos): cada `largo` de hilo, un `hueco` de tela.
    El reparto se ajusta para que la última puntada acabe justo donde empieza el recorrido (sin una puntada cortada)."""
    pts = list(trazado) + ([trazado[0]] if cerrado else [])
    seg = [(pts[i], pts[i + 1], math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])) for i in range(len(pts) - 1)]
    total = sum(s[2] for s in seg)
    n = max(1, round(total / (largo + hueco)))
    paso = total / n
    out, acum, k = [], 0.0, 0
    for i in range(n):
        centro = i * paso + paso / 2
        while k < len(seg) - 1 and acum + seg[k][2] < centro:
            acum += seg[k][2]; k += 1
        (ax, az), (bx, bz), L = seg[k]
        t = (centro - acum) / L if L else 0.0
        out.append((ax + (bx - ax) * t, az + (bz - az) * t, math.atan2(bz - az, bx - ax)))
    return out


def costura(trazado, cerrado, y, material="Costura", largo=0.0026, ancho=0.0008, alto=0.0005, hueco=0.0016):
    """3.7.7 · Hilo de costura: puntadas (prismas pequeños) sobre una cara. y = altura de la superficie; sobresalen `alto`."""
    m = Malla(material)
    for x, z, ang in _puntadas(trazado, largo, hueco, cerrado):
        c, s_ = math.cos(ang), math.sin(ang)
        pts = [(-largo / 2, -ancho / 2), (largo / 2, -ancho / 2), (largo / 2, ancho / 2), (-largo / 2, ancho / 2)]
        m.fusionar(losa_xz([(x + px * c - pz * s_, z + px * s_ + pz * c) for px, pz in pts], y - 0.0001, y + alto, material))   # prisma simple: a 0,5 mm no se nota el bisel y cuesta la mitad
    return m


def piezas_cuero_tapa(cub, gt):
    """Decoración de la cara EXTERIOR de la tapa (como la carpeta de cuero de referencia): banda del lomo con borde cosido y panel
    acolchado cosido. Devuelve {nombre: Malla}; todo se apoya en y = gt/2 (cara exterior de la tapa)."""
    y0 = gt / 2
    alto = cub["alto"] - 0.04
    banda_x0, banda_x1 = 0.012, 0.046
    panel_x0, panel_x1 = 0.055, cub["ancho"] - 0.014
    out = {}
    banda = _poli(G.rect_redondeado(banda_x1 - banda_x0, alto, 0.005, 6, (banda_x0 + banda_x1) / 2, 0))
    panel = _poli(G.rect_redondeado(panel_x1 - panel_x0, alto, 0.014, 10, (panel_x0 + panel_x1) / 2, 0))
    out["Banda"] = losa_biselada_xz(banda, y0 - 0.0002, y0 + 0.0012, 0.0006, 3, "Cubierta")
    out["Panel"] = losa_biselada_xz(panel, y0 - 0.0002, y0 + 0.0008, 0.0004, 3, "Cubierta")
    h = alto / 2 - 0.006
    puntos = Malla("Costura")
    for x in (banda_x0 + 0.0035, banda_x1 - 0.0035):                   # dos hileras en los bordes de la banda
        puntos.fusionar(costura([(x, -h), (x, h)], False, y0 + 0.0012))
    ins = 0.0055
    trazo = G.rect_redondeado(panel_x1 - panel_x0 - 2 * ins, alto - 2 * ins, 0.0085, 8, (panel_x0 + panel_x1) / 2, 0)
    puntos.fusionar(costura(trazo, True, y0 + 0.0008))
    out["Costura"] = puntos
    return out


# ------------------------------------------------------------------ nodos
def nodo(nombre, malla=None, pos=(0.0, 0.0, 0.0), rotz=0.0, extras=None, hijos=None):
    return {"nombre": nombre, "malla": malla, "pos": tuple(pos), "rotz": rotz, "extras": extras or {}, "hijos": hijos or []}


MATERIALES = [
    # nombre, color RGBA (sRGB), rugosidad, metal, mezcla alfa
    {"nombre": "Cubierta", "color": "#1B2535", "rug": 0.72, "metal": 0.0, "alfa": 1.0},
    {"nombre": "Hoja", "color": "#26282C", "rug": 0.85, "metal": 0.0, "alfa": 1.0},
    {"nombre": "Soldadura", "color": "#0E0F11", "rug": 0.9, "metal": 0.0, "alfa": 1.0},
    {"nombre": "Funda", "color": "#FFFFFF", "rug": 0.10, "metal": 0.0, "alfa": 0.07},
    {"nombre": "Carta", "color": "#FFFFFF", "rug": 0.55, "metal": 0.0, "alfa": 1.0},
    {"nombre": "Costura", "color": "#C4C0B6", "rug": 0.7, "metal": 0.0, "alfa": 1.0},
]


def construir(cfg, n_hojas=N_HOJAS_DEFECTO, semilla=5, relleno=0.0):
    """Devuelve {'materiales', 'mallas' {clave: Malla}, 'raiz', 'parametros'}. Estado inicial: álbum cerrado.
    relleno = fracción de bolsillos que llevan una carta HORNEADA en el GLB (0 en la app real: las cartas las pone el JS según la colección;
    >0 solo para vistas previas). Siempre se añaden los nodos 'Plantilla_Carta_F/D' (geometría de carta que el JS reutiliza y retira de la escena)."""
    a = cfg["archivador"]
    cub, hoja, bol, car = a["cubierta"], a["hoja"], a["bolsillo"], a["carta"]
    W, H = hoja["ancho"], hoja["alto"]
    grosor_h = 0.0012
    paso_x, paso_z = bol["ancho"] + bol["separacion"], bol["alto"] + bol["separacion"]
    x_ini = bol["margen_interior"] + bol["ancho"] / 2
    z_ini = -paso_z
    azar = random.Random(semilla)

    mallas = {}
    # --- mallas compartidas
    mallas["losa_hoja"] = losa_biselada_xz(_poli(G.rect_redondeado(W, H, hoja["radio_esquina"], 10, W / 2, 0)), -grosor_h / 2, grosor_h / 2, 0.0004, 2, "Hoja")
    mallas["tapa"] = losa_biselada_xz(_poli(G.rect_redondeado(cub["ancho"], cub["alto"], cub["radio_esquina"], 14, cub["ancho"] / 2, 0)),
                                      -GROSOR_TAPA / 2, GROSOR_TAPA / 2, 0.0019, 6, "Cubierta")
    ancho_lomo = lomo_ancho = 0.020
    mallas["lomo"] = losa_biselada_xz(_poli(G.rect_redondeado(ancho_lomo, cub["alto"], 0.0095, 10)), 0.0, GROSOR_TAPA * 2 + n_hojas * PASO, 0.0085, 8, "Cubierta")
    poli_carta = _poli(G.rect_redondeado(car["ancho"], car["alto"], car["radio_esquina"], 7))
    cw, ch = car["ancho"], car["alto"]
    piezas = piezas_cuero_tapa(cub, GROSOR_TAPA)
    for nombre, m_ in piezas.items():
        mallas["tapa_" + nombre.lower()] = m_
    mallas["carta_f"] = lamina_xz(poli_carta, 0.0, True, "Carta", lambda x, z: (x / cw + 0.5, z / ch + 0.5))
    mallas["carta_d"] = lamina_xz(poli_carta, 0.0, False, "Carta", lambda x, z: (0.5 - x / cw, z / ch + 0.5))
    poli_funda = _poli(G.rect_redondeado(W - 0.004, H - 0.004, hoja["radio_esquina"] - 0.002, 10, W / 2, 0))
    mallas["funda_f"] = lamina_xz(poli_funda, 0.0, True, "Funda")
    mallas["funda_d"] = lamina_xz(poli_funda, 0.0, False, "Funda")
    sold = {True: Malla("Soldadura"), False: Malla("Soldadura")}
    for k in range(9):
        r, c = divmod(k, 3)
        for arriba in (True, False):
            sold[arriba].fusionar(tiras_u_biseladas(x_ini + c * paso_x, z_ini + r * paso_z, bol["ancho"], bol["alto"], bol["soldadura"], 0.0, arriba, "Soldadura"))
    mallas["sold_f"], mallas["sold_d"] = sold[True], sold[False]

    # --- alturas de pivote, álbum cerrado (todo en la pila derecha)
    def y_pila_derecha(i):
        return Y_BASE + GROSOR_TAPA + (n_hojas - 1 - i) * PASO + PASO / 2

    y_tapa_der = Y_BASE + GROSOR_TAPA + n_hojas * PASO + GROSOR_TAPA / 2

    hijos = [
        nodo("Contratapa", "tapa", (0.0, Y_BASE + GROSOR_TAPA / 2, 0.0), extras={"tipo": "estatico"}),
        nodo("Lomo", "lomo", (-0.0, Y_BASE, 0.0), extras={"tipo": "estatico"}),
        nodo("Tapa", None, (0.0, y_tapa_der, 0.0), extras={"tipo": "tapa", "indice": 0},
             hijos=[nodo("Tapa_Malla", "tapa")] + [nodo("Tapa_" + n, "tapa_" + n.lower(), (cub["x0"] if False else 0.0, 0.0, 0.0)) for n in piezas]),
    ]
    resumen = {"ocupados": 0, "bolsillos": 0}
    imagen = 0
    for i in range(n_hojas):
        h = nodo("Hoja_%d" % i, None, (0.0, y_pila_derecha(i), 0.0), extras={"tipo": "hoja", "indice": i + 1})
        h["hijos"].append(nodo("Hoja_%d_Losa" % i, "losa_hoja"))
        for cara, arriba in (("F", True), ("D", False)):
            sgn = 1 if arriba else -1
            g = nodo("Hoja_%d_%s" % (i, cara), None, (0.0, 0.0, 0.0), extras={"tipo": "cara", "cara": cara})
            g["hijos"].append(nodo("Hoja_%d_%s_Soldaduras" % (i, cara), "sold_f" if arriba else "sold_d",
                                   (0.0, sgn * (grosor_h / 2 + ALTO_SOLD), 0.0)))
            g["hijos"].append(nodo("Hoja_%d_%s_Funda" % (i, cara), "funda_f" if arriba else "funda_d",
                                   (0.0, sgn * (grosor_h / 2 + SEP_FUNDA), 0.0)))
            for k in range(9):
                r, c = divmod(k, 3)
                # La cara dorsal queda espejada al girar: la columna 'c' desde el lomo es la 2-c leyendo de izquierda a derecha
                k_lectura = k if arriba else r * 3 + (2 - c)
                p = nodo("Hoja_%d_%s_Bolsillo_%d" % (i, cara, k_lectura), None,
                         (x_ini + c * paso_x, sgn * (grosor_h / 2 + ALTO_CARTA), z_ini + r * paso_z),
                         extras={"tipo": "bolsillo", "hoja": i + 1, "cara": cara, "k": k_lectura})
                resumen["bolsillos"] += 1
                if azar.random() < relleno:
                    p["hijos"].append(nodo("Hoja_%d_%s_Carta_%d" % (i, cara, k_lectura), "carta_f" if arriba else "carta_d",
                                           extras={"tipo": "carta", "imagen": imagen % 12}))
                    imagen += 1
                    resumen["ocupados"] += 1
                g["hijos"].append(p)
            h["hijos"].append(g)
        hijos.append(h)

    hijos.append(nodo("Plantillas", None, extras={"tipo": "plantillas"}, hijos=[
        nodo("Plantilla_Carta_F", "carta_f", extras={"tipo": "plantilla", "cara": "F"}),
        nodo("Plantilla_Carta_D", "carta_d", extras={"tipo": "plantilla", "cara": "D"})]))
    raiz = nodo("Album", None, (0.0, 0.0, 0.0), extras={"tipo": "album", "n_hojas": n_hojas, "paso": PASO, "grosor_tapa": GROSOR_TAPA,
                                              "y_base": Y_BASE, "ancho_tapa": cub["ancho"], "ancho_hoja": W})
    raiz["hijos"] = hijos
    return {
        "materiales": MATERIALES,
        "mallas": mallas,
        "raiz": raiz,
        "parametros": {"n_hojas": n_hojas, "paso": PASO, "grosor_tapa": GROSOR_TAPA, "ancho_hoja": W, "alto_hoja": H,
                       "ancho_tapa": cub["ancho"], "alto_tapa": cub["alto"], "y_base": Y_BASE, "grosor_hoja": grosor_h,
                       "ancho_carta": cw, "alto_carta": ch, **resumen},
    }


def _poli(pts_xy):
    """Polígono (x, y) de geometria.py -> (x, z) en el plano del álbum; z crece hacia quien mira."""
    return [(p[0], p[1]) for p in pts_xy]


def recorrer(n):
    yield n
    for h in n["hijos"]:
        yield from recorrer(h)


def contar(modelo):
    """Estadísticas estáticas del modelo: nodos, mallas distintas, triángulos instanciados y llamadas de dibujo teóricas."""
    nodos = list(recorrer(modelo["raiz"]))
    con_malla = [n for n in nodos if n["malla"]]
    tris = sum(len(modelo["mallas"][n["malla"]].tris) for n in con_malla)
    return {"nodos": len(nodos), "mallas_distintas": len({n["malla"] for n in con_malla}), "nodos_con_malla": len(con_malla),
            "triangulos_instanciados": tris,
            "triangulos_unicos": sum(len(m.tris) for m in modelo["mallas"].values())}
