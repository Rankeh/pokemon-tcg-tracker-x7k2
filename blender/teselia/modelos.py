"""Instancia en Blender las piezas puras de escena.py (una malla por pieza)."""
from .utilidades import malla, poner_uv, asignar
from . import materiales as M


def instanciar(piezas, col, mats):
    for p in piezas:
        ob = malla(p["nombre"], p["verts"], p["caras"], col, p["suave"])
        if p["uv"]:
            poner_uv(ob, p["uv"])
        if p["mat"] == "carta":
            asignar(ob, M.carta("MatCarta%02d" % p["carta"], M.imagen_carta(p["carta"])))
        else:
            asignar(ob, mats[p["mat"]])
