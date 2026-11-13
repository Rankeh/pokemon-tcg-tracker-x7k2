"""Escena de prueba de materiales (Fase 3.4.4), PURA: 3 bolsillos en fila — vacío, carta normal, carta holográfica.
Una sola lámina de funda cubre toda la página (como en un álbum real); la soldadura rodea cada bolsillo por tres lados."""
import math
import random
from . import geometria as G


def _p(nombre, mv, mat, suave=False, uv=None, carta=None, origen=(0.0, 0.0, 0.0), padre=None):
    verts, caras = mv
    return {"nombre": nombre, "verts": verts, "caras": caras, "mat": mat, "suave": suave, "uv": uv, "carta": carta, "origen": origen, "padre": padre}


def soldadura_u(ancho, alto, radio, borde, z, px, py, seg=4):
    """Marco plano de termosellado abierto por arriba (la boca del bolsillo)."""
    v, c = G.marco_plano(ancho, alto, radio, borde, z, seg, px, py)
    tope = py + alto / 2 - 0.0004
    caras = [f for f in c if sum(v[i][1] for i in f) / len(f) < tope]
    return v, caras


def construir(cfg):
    a, pr = cfg["archivador"], cfg["prueba"]
    bol, car = a["bolsillo"], a["carta"]
    paso = bol["ancho"] + bol["separacion"]
    centros = [(-paso, 0.0), (0.0, 0.0), (paso, 0.0)]
    ancho_p = 3 * paso - bol["separacion"] + 2 * pr["margen_x"]
    alto_p = bol["alto"] + 2 * pr["margen_y"]
    azar = random.Random(cfg["entorno"]["semilla"])
    gp = a["hoja"]["grosor"] + 0.0006                      # hoja algo gruesa para leerse bien
    piezas, info = [], []
    piezas.append(_p("Hoja", G.losa_biselada(ancho_p, alto_p, 0.010, 0, gp, 0.0005, 4, 6), "hoja", True))
    z_sold, z_carta = gp + 0.0002, gp + 0.0004
    tipos = ["vacio", "normal", "holo"]
    for k, ((px, py), tipo) in enumerate(zip(centros, tipos)):
        piezas.append(_p("Soldadura%d" % k, soldadura_u(bol["ancho"], bol["alto"], bol["radio_esquina"], bol["soldadura"], z_sold, px, py), "soldadura", padre="Hoja"))
        if tipo != "vacio":
            v, c = G.losa(G.rect_redondeado(car["ancho"], car["alto"], car["radio_esquina"], 5, px, py), z_carta, z_carta + pr["grosor_carta"])
            uv = G.uv_planas([(x - px, y - py, zz) for x, y, zz in v], c, car["ancho"], car["alto"])
            ang = math.radians(azar.uniform(-0.7, 0.7))
            v = G.rotar_z_alrededor([(x + azar.uniform(-0.0005, 0.0005), y + azar.uniform(-0.0006, 0.0006), zz) for x, y, zz in v], ang, px, py)
            piezas.append(_p("Carta%d" % k, (v, c), "carta_holo" if tipo == "holo" else "carta", uv=uv, carta=k, padre="Hoja"))
    z_funda = z_carta + pr["grosor_carta"] + car["holgura"]
    piezas.append(_p("Funda", G.plano(G.rect_redondeado(ancho_p - 2 * pr["margen_funda"], alto_p - 2 * pr["margen_funda"], 0.008, 5), z_funda), "funda", padre="Hoja"))
    s = cfg["entorno"]["suelo"]
    piezas.append(_p("Suelo", G.losa(G.rect_redondeado(s, s, 0.01, 1, 0, 0.0), -0.05, 0.0), "suelo"))
    info.append({"z_hoja": gp, "z_sold": z_sold, "z_carta0": z_carta, "z_carta1": z_carta + pr["grosor_carta"], "z_funda": z_funda,
                 "centros": centros, "ancho_pagina": ancho_p, "alto_pagina": alto_p})
    return piezas, info


def esquinas(cfg):
    a, pr = cfg["archivador"], cfg["prueba"]
    paso = a["bolsillo"]["ancho"] + a["bolsillo"]["separacion"]
    w = 3 * paso - a["bolsillo"]["separacion"] + 2 * pr["margen_x"]
    h = a["bolsillo"]["alto"] + 2 * pr["margen_y"]
    return [(sx * w / 2, sy * h / 2, z) for sx in (-1, 1) for sy in (-1, 1) for z in (0.0, 0.004)]


def construir_depuracion(cfg, paso):
    """Banco de depuración: UNA carta sobre una hoja pequeña. paso 1 = sin funda, 2 = con funda, 3 = carta holográfica con funda."""
    a, d = cfg["archivador"], cfg["depuracion"]
    car = a["carta"]
    pw, ph = d["pagina"]
    gp = 0.0015
    holo = paso == 3
    piezas = [_p("Hoja", G.losa_biselada(pw, ph, 0.008, 0, gp, 0.0005, 4, 6), "hoja", True)]
    z0 = gp + 0.0004
    v, c = G.losa(G.rect_redondeado(car["ancho"], car["alto"], car["radio_esquina"], 5), z0, z0 + cfg["prueba"]["grosor_carta"])
    uv = G.uv_planas(v, c, car["ancho"], car["alto"])
    piezas.append(_p("Carta", (v, c), "carta_holo" if holo else "carta", uv=uv, carta=1 if not holo else 2, padre="Hoja"))
    z_funda = z0 + cfg["prueba"]["grosor_carta"] + car["holgura"]
    if paso >= 2:
        piezas.append(_p("Funda", G.plano(G.rect_redondeado(pw - 0.008, ph - 0.008, 0.008, 5), z_funda), "funda", padre="Hoja"))
    s = cfg["entorno"]["suelo"]
    piezas.append(_p("Suelo", G.losa(G.rect_redondeado(s, s, 0.01, 1, 0, 0.0), -0.05, 0.0), "suelo"))
    return piezas, [{"z_carta0": z0, "z_carta1": z0 + cfg["prueba"]["grosor_carta"], "z_funda": z_funda}]
