"""
Escena v3 como DATOS PUROS (sin Blender): álbum encuadernado SIN anillas, con lomo continuo y hojas unidas a él.
Cada pieza: {nombre, verts (mundo), caras, mat, suave, uv, carta, origen, padre}.
 - 'origen': punto de pivote del objeto en Blender (para animar después; las hojas giran alrededor del eje del lomo).
 - 'padre': nombre de la pieza de la que cuelga (bolsillos → hoja; costuras → cubierta).
Capas de un bolsillo, de abajo a arriba: hoja → marco de soldadura (plano) → carta → lámina de funda (plano).
"""
import math
import random
from . import geometria as G


def _p(nombre, mv, mat, suave=False, uv=None, carta=None, origen=(0.0, 0.0, 0.0), padre=None):
    verts, caras = mv
    return {"nombre": nombre, "verts": verts, "caras": caras, "mat": mat, "suave": suave, "uv": uv, "carta": carta, "origen": origen, "padre": padre}


def construir(cfg):
    a, ent = cfg["archivador"], cfg["entorno"]
    cub, lomo, hoja, bol, car, pila = a["cubierta"], a["lomo"], a["hoja"], a["bolsillo"], a["carta"], a["pila"]
    cw, ch, cg = cub["ancho"], cub["alto"], cub["grosor"]
    sw, hend, xa, lc = lomo["ancho"] / 2, lomo["hendidura"], hoja["inicio_x"], hoja["curva"]
    azar = random.Random(ent["semilla"])
    piezas, info = [], []
    zs = cg + 0.0015                      # cara superior del lomo
    pivote = (0.0, 0.0, cg)               # eje de giro de las hojas: a lo largo de Y, sobre el lomo

    # --- lomo continuo con volumen (redondeado en todo su contorno) y cubiertas acolchadas
    piezas.append(_p("Lomo", G.losa_biselada(lomo["ancho"], ch, 0.008, 0, zs, 0.0042, 6, 6), "cubierta", True, origen=pivote))
    for lado, tag in ((1, "Der"), (-1, "Izq")):
        cx = lado * (sw + hend + cw / 2)
        piezas.append(_p("Cubierta" + tag, G.losa_biselada(cw, ch, cub["radio_esquina"], 0, cg, cub["bisel"], 7, 7, cx=cx), "cubierta", True))
        borde = G.rect_redondeado(cw - 0.017, ch - 0.017, cub["radio_esquina"] - 0.0085, 7, cx, 0)
        verts, caras = [], []
        for q in G.puntadas(borde, 0.0050, 0.0030, 0.0011):
            v, c = G.losa(q, cg, cg + 0.0004)
            off = len(verts)
            verts += v
            caras += [[i + off for i in f] for f in c]
        piezas.append(_p("Costura" + tag, (verts, caras), "hilo", padre="Cubierta" + tag))

    # --- hojas unidas al lomo: cada hoja es una rejilla que baja hacia el lomo (curvatura de la encuadernación)
    n_cartas = {1: a["cartas_derecha"], -1: a["cartas_izquierda"]}
    primera = {1: 0, -1: a["cartas_derecha"]}

    def zfun_k(zk):
        return lambda x: cg + (zk - cg) * (1 - 0.95 * (1 - G.suave_paso((x - xa) / lc)))

    def hoja_obj(nombre, lado, zk, grosor, mat):
        v, c = G.hoja_curva(xa, xa + hoja["ancho"], hoja["alto"], hoja["radio_esquina"], zfun_k(zk), grosor, lc)
        if lado < 0:
            v, c = G.espejo_x(v, c)
        return _p(nombre, (v, c), mat, True, origen=pivote)

    for lado, tag, nh in ((1, "Der", pila["hojas_derecha"]), (-1, "Izq", pila["hojas_izquierda"])):
        for k in range(nh):
            piezas.append(hoja_obj("Pila%s%d" % (tag, k), lado, cg + k * pila["paso"], pila["grosor_hoja"], "hoja" if k % 2 == 0 else "hoja_b"))
        z_base = cg + nh * pila["paso"]
        piezas.append(hoja_obj("Hoja" + tag, lado, z_base, hoja["grosor"], "hoja"))
        z_hoja = z_base + hoja["grosor"]
        for k, (px, py) in enumerate(G.posiciones_bolsillos(cfg, lado)):
            z_sold, z_carta = z_hoja + 0.0002, z_hoja + 0.0004
            z_funda = z_carta + car["grosor"] + car["holgura"]
            padre = "Hoja" + tag
            piezas.append(_p("Soldadura%s%d" % (tag, k), G.marco_plano(bol["ancho"], bol["alto"], bol["radio_esquina"], bol["soldadura"], z_sold, 4, px, py), "soldadura", padre=padre))
            if k < n_cartas[lado]:
                v, c = G.losa(G.rect_redondeado(car["ancho"], car["alto"], car["radio_esquina"], 3, px, py), z_carta, z_carta + car["grosor"])
                uv = G.uv_planas([(x - px, y - py, zz) for x, y, zz in v], c, car["ancho"], car["alto"])
                ang = math.radians(azar.uniform(-0.6, 0.6))
                v = G.rotar_z_alrededor([(x + azar.uniform(-0.0005, 0.0005), y, zz) for x, y, zz in v], ang, px, py)
                piezas.append(_p("Carta%s%d" % (tag, k), (v, c), "carta", uv=uv, carta=primera[lado] + k, padre=padre))
            piezas.append(_p("Funda%s%d" % (tag, k), G.plano(G.rect_redondeado(bol["ancho"], bol["alto"], bol["radio_esquina"], 4, px, py), z_funda), "funda", uv=None, padre=padre))
            info.append({"lado": lado, "k": k, "z_hoja": z_hoja, "z_sold": z_sold, "z_carta0": z_carta, "z_carta1": z_carta + car["grosor"], "z_funda": z_funda, "tiene_carta": k < n_cartas[lado]})

    for p in piezas:   # inclinación opcional del álbum (0 por defecto = identidad)
        p["verts"] = [G.a_mundo(v, cfg) for v in p["verts"]]
        p["origen"] = G.a_mundo(p["origen"], cfg)

    # --- plano de apoyo neutro (sin decoración)
    s = ent["suelo"]
    piezas.append(_p("Suelo", G.losa(G.rect_redondeado(s, s, 0.01, 1, 0, 0.3), -0.05, 0.0), "suelo"))
    return piezas, info
