"""Instancia en Blender las piezas puras de escena.py: un objeto por pieza, con su pivote y su padre."""
import bpy
from .utilidades import malla, poner_uv, asignar
from . import materiales as M


def instanciar(piezas, col, mats, carpeta_texturas=None):
    objs = {}
    for p in piezas:
        o = p["origen"]
        verts = [(x - o[0], y - o[1], z - o[2]) for x, y, z in p["verts"]]
        ob = malla(p["nombre"], verts, p["caras"], col, p["suave"])
        ob.location = o
        if p["uv"]:
            poner_uv(ob, p["uv"])
        if p["mat"] in ("carta", "carta_holo"):
            holo = p["mat"] == "carta_holo"
            asignar(ob, M.carta_satinada("MatCarta%02d" % p["carta"], M.imagen_arte(p["carta"], holo, carpeta_texturas), holo))
        else:
            asignar(ob, mats[p["mat"]])
        objs[p["nombre"]] = ob
    bpy.context.view_layer.update()
    for p in piezas:
        if p["padre"]:
            hijo, padre = objs[p["nombre"]], objs[p["padre"]]
            hijo.parent = padre
            hijo.matrix_parent_inverse = padre.matrix_world.inverted()
    return objs
