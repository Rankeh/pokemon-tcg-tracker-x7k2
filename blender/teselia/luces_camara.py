"""Iluminación (clave cálida, relleno, borde, mundo tenue) y cámara con profundidad de campo."""
import math
import bpy
from . import geometria as G
from .utilidades import fijar


def _apuntar(ob, desde, hacia):
    ob.location = desde
    ob.rotation_euler = G.euler_camara(desde, hacia)   # misma convención: mira a -Z, arriba +Y (vale para luces de área)


def luz_area(nombre, col, pos, objetivo, w, color_hex, tam, forma="RECTANGLE", tam_y=None):
    d = bpy.data.lights.new(nombre, "AREA")
    d.energy = w
    d.color = G.hex_a_lineal(color_hex)
    d.shape = forma
    d.size = tam
    d.size_y = tam_y or tam
    ob = bpy.data.objects.new(nombre, d)
    col.objects.link(ob)
    _apuntar(ob, pos, objetivo)
    return ob


def crear_luces(cfg, col, objetivo, exposicion):
    """Esquema estilizado: principal cálida grande y suave (sombras suaves pero definidas), secundaria fría y tenue,
    dos luces de borde alargadas (cálida y fría) detrás para marcar los cantos acolchados y separar del fondo."""
    L, C = cfg["luces"], cfg["colores"]
    t = objetivo
    luz_area("Principal", col, (t[0] - 0.70, t[1] - 0.55, t[2] + 0.85), t, L["principal_w"], C["luz_principal"], 0.55)
    luz_area("Secundaria", col, (t[0] + 0.95, t[1] - 0.70, t[2] + 0.45), t, L["relleno_w"], C["luz_relleno"], 0.9)
    luz_area("BordeCalido", col, (t[0] - 0.55, t[1] + 0.65, t[2] + 0.35), t, L["borde_w"], C["luz_borde_a"], 0.18, "RECTANGLE", 0.7)
    luz_area("BordeFrio", col, (t[0] + 0.60, t[1] + 0.60, t[2] + 0.40), t, L["borde_w"], C["luz_borde_b"], 0.18, "RECTANGLE", 0.7)
    # mundo: degradado neutro de estudio (suelo cálido oscuro, cielo gris azulado) para que el metal tenga
    # algo que reflejar y haya relleno ambiental suave sin dominante de color
    mundo = bpy.data.worlds.new("Mundo")
    mundo.use_nodes = True
    nt = mundo.node_tree
    fondo = nt.nodes.get("Background")
    try:
        coord = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = -0.4
        mr.inputs["From Max"].default_value = 0.9
        rampa = nt.nodes.new("ShaderNodeValToRGB")
        rampa.color_ramp.elements[0].color = (0.035, 0.030, 0.027, 1)
        rampa.color_ramp.elements[1].color = (0.20, 0.22, 0.25, 1)
        nt.links.new(coord.outputs["Generated"], sep.inputs["Vector"])
        nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
        nt.links.new(mr.outputs["Result"], rampa.inputs["Fac"])
        nt.links.new(rampa.outputs["Color"], fondo.inputs["Color"])
        fondo.inputs["Strength"].default_value = 1.0
    except (KeyError, AttributeError, TypeError):
        fondo.inputs["Color"].default_value = (0.08, 0.08, 0.09, 1)
        fondo.inputs["Strength"].default_value = 0.6
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
