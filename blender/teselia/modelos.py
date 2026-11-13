"""Modelado del archivador, las cartas, el escritorio y el entorno. Coordenadas locales del archivador:
centro del lomo en el origen, hojas en el plano XY, la mesa/atril en z=0. Todo cuelga de un Empty que lo inclina."""
import math
import random
import bpy
from . import geometria as G
from .utilidades import malla, poner_uv, bisel, asignar
from . import materiales as M


def _losa(nombre, poligono, z0, z1, mat, padre, col, bis=None, suave=True):
    v, c = G.losa(poligono, z0, z1)
    ob = malla(nombre, v, c, col, suave)
    asignar(ob, mat)
    if bis:
        bisel(ob, bis)
    ob.parent = padre
    return ob


def _combinar(nombre, listas, mat, padre, col, z0, z1):
    """Une muchas losas pequeñas (puntadas) en un solo objeto."""
    verts, caras = [], []
    for poli in listas:
        v, c = G.losa(poli, z0, z1)
        off = len(verts)
        verts += v
        caras += [[i + off for i in f] for f in c]
    ob = malla(nombre, verts, caras, col, True)
    asignar(ob, mat)
    ob.parent = padre
    return ob


def crear_archivador(cfg, col, mats):
    a = cfg["archivador"]
    cub, lomo, hoja, bol, car = a["cubierta"], a["lomo"], a["hoja"], a["bolsillo"], a["carta"]
    cw, ch, cg = cub["ancho"], cub["alto"], cub["grosor"]
    sw = lomo["ancho"] / 2

    raiz = bpy.data.objects.new("Archivador", None)
    col.objects.link(raiz)
    raiz.location = G.a_mundo((0, 0, 0), cfg)
    raiz.rotation_euler = (math.radians(a["inclinacion_grados"]), 0, 0)

    # --- cubiertas y lomo (grosor real + bisel)
    for lado, nombre in ((1, "CubiertaDer"), (-1, "CubiertaIzq")):
        poli = G.rect_redondeado(cw, ch, cub["radio_esquina"], 6, lado * (sw + cw / 2), 0)
        _losa(nombre, poli, 0, cg, mats["cubierta"], raiz, col, cub["bisel"])
        costura = G.inset(poli, 0.004)
        _combinar("Costura" + nombre[8:], G.puntadas(costura, 0.0045, 0.003, 0.0009), mats["hilo"], raiz, col, cg, cg + 0.0004)
    _losa("Lomo", G.rect_redondeado(lomo["ancho"], ch, 0.004, 4), 0, cg, mats["cubierta"], raiz, col, cub["bisel"])

    # --- anillas: placa base + arco metálico
    zc = cg + 0.0105
    for i, y in enumerate(a["anillas"]["posiciones_y"]):
        _losa("PlacaAnilla%d" % i, G.rect_redondeado(0.021, 0.015, 0.003, 4, 0, y), cg, cg + 0.0022, mats["metal"], raiz, col, 0.0004)
        v, c = G.arco_anilla(a["anillas"]["radio"], a["anillas"]["grosor_alambre"])
        ob = malla("Anilla%d" % i, v, c, col, True)
        ob.location = (0, y, zc)
        asignar(ob, mats["metal"])
        ob.parent = raiz

    # --- pilas de hojas + hoja visible con 9 bolsillos (derecha e izquierda)
    azar = random.Random(cfg["entorno"]["semilla"])
    n_cartas = {1: a["cartas_derecha"], -1: a["cartas_izquierda"]}
    indice = {1: 0, -1: a["cartas_derecha"]}
    for lado, tag, alto_pila in ((1, "Der", a["pila"]["derecha"]), (-1, "Izq", a["pila"]["izquierda"])):
        cx = lado * (hoja["inicio_x"] + hoja["ancho"] / 2)
        poli_hoja = G.rect_redondeado(hoja["ancho"], hoja["alto"], hoja["radio_esquina"], 5, cx, 0)
        z = cg
        _losa("Pila" + tag, poli_hoja, z, z + alto_pila, mats["hoja"], raiz, col, 0.0006)
        z += alto_pila
        _losa("Hoja" + tag, poli_hoja, z, z + hoja["grosor"], mats["hoja"], raiz, col, 0.0003)
        z += hoja["grosor"]
        s = bol["soldadura"]
        for k, (px, py) in enumerate(G.posiciones_bolsillos(cfg, lado)):
            marco = G.rect_redondeado(bol["ancho"] + 2 * s, bol["alto"] + 2 * s, bol["radio_esquina"] + s, 4, px, py)
            _losa("Soldadura%s%d" % (tag, k), marco, z, z + 0.0005, mats["soldadura"], raiz, col)
            if k < n_cartas[lado]:
                ancho, alto = car["ancho"], car["alto"]
                v, c = G.losa(G.rect_redondeado(ancho, alto, car["radio_esquina"], 3), 0, car["grosor"])
                ob = malla("Carta%s%d" % (tag, k), v, c, col, False)
                poner_uv(ob, G.uv_planas(v, c, ancho, alto))
                asignar(ob, M.carta("MatCarta%d" % (indice[lado] + k), M.imagen_carta(indice[lado] + k)))
                ob.location = (px + azar.uniform(-0.0007, 0.0007), py + azar.uniform(-0.0007, 0.0007), z + 0.0005 + 0.0002)
                ob.rotation_euler = (0, 0, math.radians(azar.uniform(-0.8, 0.8)))
                ob.parent = raiz
            funda = G.rect_redondeado(bol["ancho"], bol["alto"], bol["radio_esquina"], 4, px, py)
            _losa("Funda%s%d" % (tag, k), funda, z + 0.0005 + car["grosor"] + car["holgura"], z + 0.0005 + car["grosor"] + car["holgura"] + 0.0003, mats["funda"], raiz, col)
    return raiz


def crear_atril(cfg, col, mat):
    """Cuña de madera que sostiene el archivador inclinado."""
    a = cfg["archivador"]
    t = math.radians(a["inclinacion_grados"])
    ch = a["cubierta"]["alto"]
    ancho = 2 * (a["lomo"]["ancho"] / 2 + a["cubierta"]["ancho"]) + 0.04
    v, c = G.cuna(ancho, ch * math.cos(t), ch * math.sin(t) - 0.0003)
    ob = malla("Atril", v, c, col, False)
    asignar(ob, mat)
    bisel(ob, 0.0012)
    return ob


def crear_entorno(cfg, col, mats):
    e = cfg["entorno"]
    ancho, fondo, pared = e["escritorio_ancho"], e["escritorio_fondo"], e["pared_y"]
    v, c = G.losa(G.rect_redondeado(ancho, fondo, 0.0, 1, 0, pared - fondo / 2), -0.04, 0.0)
    mesa = malla("Escritorio", v, c, col, False)
    asignar(mesa, mats["madera"])
    bisel(mesa, 0.004)
    v, c = G.losa(G.rect_redondeado(8, 0.05, 0.0, 1, 0, pared + 0.025), -0.05, 3.0)
    muro = malla("Pared", v, c, col, False)
    asignar(muro, mats["pared"])

    # props mínimos (el interés está en el fondo desenfocado, no en los objetos)
    circulo = [(0.04 * math.cos(2 * math.pi * i / 36), 0.04 * math.sin(2 * math.pi * i / 36)) for i in range(36)]
    circ = [(x - 0.40, y + 0.30) for x, y in circulo]
    v, c = G.losa(circ, 0.0, 0.092)
    taza = malla("Taza", v, c, col, True)
    asignar(taza, mats["taza"])
    bisel(taza, 0.003)

    caja = G.rect_redondeado(0.070, 0.095, 0.006, 4, 0.47, 0.26)
    v, c = G.losa(caja, 0.0, 0.034)
    mazo = malla("CajaMazo", v, c, col, False)
    asignar(mazo, mats["caja"])
    bisel(mazo, 0.002)
    mazo.rotation_euler = (0, 0, math.radians(-14))

    # luces de fondo para el bokeh (esferas emisivas pequeñas sobre la pared, siempre desenfocadas)
    azar = random.Random(e["semilla"])
    for i in range(e["luces_bokeh"]):
        v, c = G.esfera(0.012, 10, 6)
        ob = malla("Bokeh%d" % i, v, c, col, True)
        ob.location = (azar.uniform(-1.0, 1.0), pared - 0.04, azar.uniform(0.08, 0.45))
        asignar(ob, mats["bokeh%d" % (i % 3)])
