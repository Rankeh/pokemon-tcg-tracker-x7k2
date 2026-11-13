"""Iluminación (clave cálida, relleno, borde, mundo tenue) y cámara con profundidad de campo."""
import math
import bpy
from . import geometria as G
from .utilidades import fijar


def _apuntar(ob, desde, hacia):
    ob.location = desde
    ob.rotation_euler = G.euler_camara(desde, hacia)   # misma convención: mira a -Z, arriba +Y (vale para luces de área)


def luz_area(nombre, col, pos, objetivo, w, color_hex, tam, forma="RECTANGLE"):
    d = bpy.data.lights.new(nombre, "AREA")
    d.energy = w
    d.color = G.hex_a_lineal(color_hex)
    d.shape = forma
    d.size = tam
    d.size_y = tam
    ob = bpy.data.objects.new(nombre, d)
    col.objects.link(ob)
    _apuntar(ob, pos, objetivo)
    return ob


def crear_luces(cfg, col, objetivo, exposicion):
    L, C = cfg["luces"], cfg["colores"]
    t = objetivo
    luz_area("Principal", col, (t[0] - 0.95, t[1] - 0.55, t[2] + 0.75), t, L["principal_w"], C["luz_principal"], 0.75)
    luz_area("Relleno", col, (t[0] + 1.0, t[1] - 0.85, t[2] + 0.45), t, L["relleno_w"], C["luz_relleno"], 1.2)
    luz_area("Borde", col, (t[0] + 0.55, t[1] + 0.70, t[2] + 0.55), t, L["borde_w"], C["luz_borde"], 0.4)
    # mundo casi negro cálido: da algo de relleno ambiental sin lavar el contraste
    mundo = bpy.data.worlds.new("Mundo")
    mundo.use_nodes = True
    fondo = mundo.node_tree.nodes.get("Background")
    if fondo:
        fondo.inputs["Color"].default_value = (0.06, 0.04, 0.03, 1)
        fondo.inputs["Strength"].default_value = 0.5
    bpy.context.scene.world = mundo
    vs = bpy.context.scene.view_settings
    for nombre in ("AgX", "Filmic", "Standard"):
        try:
            vs.view_transform = nombre
            break
        except TypeError:
            continue
    vs.exposure = exposicion


def crear_camara(cfg, col, vista):
    v = cfg["vistas"][vista]
    pos, obj, dist = G.ajustar_camara(cfg, vista)
    d = bpy.data.cameras.new("Camara")
    d.lens = v["lente_mm"]
    d.sensor_fit = "HORIZONTAL"
    d.sensor_width = cfg["camara"]["sensor_mm"]
    d.shift_x, d.shift_y = v["desplazamiento_x"], v["desplazamiento_y"]
    d.dof.use_dof = True
    d.dof.focus_distance = dist
    d.dof.aperture_fstop = cfg["camara"]["f_stop"]
    ob = bpy.data.objects.new("Camara", d)
    col.objects.link(ob)
    ob.location = pos
    ob.rotation_euler = G.euler_camara(pos, obj)
    bpy.context.scene.camera = ob
    return ob, pos, obj, dist
