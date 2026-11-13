"""Carga de configuracion.json (sin dependencias de Blender)."""
import json
import os

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "configuracion.json")


def cargar(ruta=None):
    with open(ruta or RUTA, encoding="utf-8") as f:
        return json.load(f)
