"""
Escena como DATOS PUROS (sin Blender): lista de piezas {nombre, verts, caras, mat, suave, uv, carta}.
Todo está ya en coordenadas de mundo, así que Blender solo tiene que instanciar y asignar materiales
(modelos.py) y la previsualización geométrica (previsualizar_sin_blender.py) usa exactamente las mismas mallas.
Capas de una bolsillo, de abajo a arriba (distancias mínimas comprobadas en pruebas_sin_blender.py):
  hoja → marco de soldadura (plano) → carta (0,4 mm de grosor) → lámina de funda (plano, sin grosor)
"""
import math
import random
from . import geometria as G


def _pieza(nombre, mv, mat, suave=False, uv=None, carta=None, zloc=None):
    verts, caras = mv
    return {"nombre": nombre, "verts": verts, "caras": caras, "mat": mat, "suave": suave, "uv": uv, "carta": carta, "zloc": zloc}


def _mundo(verts, cfg):
    return [G.a_mundo(v, cfg) for v in verts]


def construir(cfg):
    a, ent = cfg["archivador"], cfg["entorno"]
    cub, lomo, hoja, bol, car, pila = a["cubierta"], a["lomo"], a["hoja"], a["bolsillo"], a["carta"], a["pila"]
    cw, ch, cg = cub["ancho"], cub["alto"], cub["grosor"]
    sw, hend = lomo["ancho"] / 2, lomo["hendidura"]
    azar = random.Random(ent["semilla"])
    piezas = []

    def local(nombre, mv, mat, **kw):
        v, c = mv
        piezas.append(_pieza(nombre, (_mundo(v, cfg), c), mat, **kw))

    # --- cubiertas (grosor + canto redondeado real), costura y lomo con volumen
    for lado, tag in ((1, "Der"), (-1, "Izq")):
        cx = lado * (sw + hend + cw / 2)
        local("Cubierta" + tag, G.losa_biselada(cw, ch, cub["radio_esquina"], 0, cg, cub["bisel"], cx=cx), "cubierta", suave=True)
        borde = G.rect_redondeado(cw - 0.007, ch - 0.007, cub["radio_esquina"] - 0.0035, 6, cx, 0)
        verts, caras = [], []
        for q in G.puntadas(borde, 0.0050, 0.0032, 0.0012):
            v, c = G.losa(q, cg, cg + 0.0005)
            off = len(verts)
            verts += v
            caras += [[i + off for i in f] for f in c]
        local("Costura" + tag, (verts, caras), "hilo")
    zs = cg + 0.0012
    local("Lomo", G.losa_biselada(lomo["ancho"], ch, 0.006, 0, zs, 0.0035), "cubierta", suave=True)
    local("MecanismoAnillas", G.losa_biselada(0.012, ch * 0.86, 0.0055, zs, zs + 0.0016, 0.0006), "metal", suave=True)

    # --- anillas metálicas (alambre redondo, abiertas por abajo) asentadas en el mecanismo
    R, r = a["anillas"]["radio"], a["anillas"]["grosor_alambre"]
    zc = zs + 0.0016 + R * math.cos(math.radians(20)) - 0.0004
    for i, y in enumerate(a["anillas"]["posiciones_y"]):
        v, c = G.arco_anilla(R, r)
        local("Anilla%d" % i, ([(x, yy + y, z + zc) for x, yy, z in v], c), "metal", suave=True)
        # remache en la base de cada anilla
        local("Remache%d" % i, G.losa_biselada(0.016, 0.013, 0.0055, zs + 0.0016, zs + 0.0027, 0.0007, cx=0, cy=y), "metal", suave=True)

    # --- hojas: pila de láminas (se ven los cantos) + hoja visible con 9 bolsillos
    n_cartas = {1: a["cartas_derecha"], -1: a["cartas_izquierda"]}
    primera = {1: 0, -1: a["cartas_derecha"]}
    info = []
    for lado, tag, nh in ((1, "Der", pila["hojas_derecha"]), (-1, "Izq", pila["hojas_izquierda"])):
        cx = lado * (hoja["inicio_x"] + hoja["ancho"] / 2)
        z = cg
        for k in range(nh):
            dx = azar.uniform(-0.0006, 0.0006)
            poli = G.rect_redondeado(hoja["ancho"], hoja["alto"], hoja["radio_esquina"], 5, cx + dx, azar.uniform(-0.0004, 0.0004))
            local("Pila%s%d" % (tag, k), G.losa(poli, z, z + pila["grosor_hoja"]), "hoja")
            z += pila["paso"]
        poli = G.rect_redondeado(hoja["ancho"], hoja["alto"], hoja["radio_esquina"], 5, cx, 0)
        local("Hoja" + tag, G.losa(poli, z, z + hoja["grosor"]), "hoja")
        z_hoja = z + hoja["grosor"]
        for k, (px, py) in enumerate(G.posiciones_bolsillos(cfg, lado)):
            z_sold = z_hoja + 0.0002
            local("Soldadura%s%d" % (tag, k), G.marco_plano(bol["ancho"], bol["alto"], bol["radio_esquina"], bol["soldadura"], z_sold, 4, px, py), "soldadura")
            z_carta = z_hoja + 0.0004
            z_funda = z_carta + car["grosor"] + car["holgura"]
            if k < n_cartas[lado]:
                v, c = G.losa(G.rect_redondeado(car["ancho"], car["alto"], car["radio_esquina"], 3, px, py), z_carta, z_carta + car["grosor"])
                uv = G.uv_planas([(x - px, y - py, zz) for x, y, zz in v], c, car["ancho"], car["alto"])   # la imagen "pega" a la carta
                ang = math.radians(azar.uniform(-0.8, 0.8))
                v = G.rotar_z_alrededor([(x + azar.uniform(-0.0006, 0.0006), y, zz) for x, y, zz in v], ang, px, py)
                local("Carta%s%d" % (tag, k), (v, c), "carta", uv=uv, carta=primera[lado] + k)
            local("Funda%s%d" % (tag, k), G.plano(G.rect_redondeado(bol["ancho"], bol["alto"], bol["radio_esquina"], 4, px, py), z_funda), "funda")
            info.append({"lado": lado, "k": k, "z_hoja": z_hoja, "z_sold": z_sold, "z_carta0": z_carta, "z_carta1": z_carta + car["grosor"], "z_funda": z_funda, "tiene_carta": k < n_cartas[lado]})

    # --- atril de madera (cuña) que apoya el archivador inclinado
    t = math.radians(a["inclinacion_grados"])
    ancho = 2 * (sw + hend + cw) + 0.024
    piezas.append(_pieza("Atril", G.cuna(ancho, ch * math.cos(t), ch * math.sin(t) - 0.0004), "atril"))

    # --- escritorio y pared (sin más objetos: escena sencilla)
    pared, fondo = ent["pared_y"], ent["escritorio_fondo"]
    piezas.append(_pieza("Escritorio", G.losa_biselada(ent["escritorio_ancho"], fondo, 0.02, -0.04, 0.0, 0.006, 3, 4, 0, pared - fondo / 2), "madera", suave=True))
    piezas.append(_pieza("Pared", G.losa(G.rect_redondeado(8, 0.05, 0.002, 1, 0, pared + 0.025), -0.05, 3.0), "pared"))
    return piezas, info
