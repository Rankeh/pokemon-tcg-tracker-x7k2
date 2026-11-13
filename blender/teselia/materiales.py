"""Materiales procedurales, estilizados (suaves, cálidos, 'de juguete'), sin ninguna textura externa."""
import bpy
from . import geometria as G
from .utilidades import nuevo_material, nodo, enlazar, fijar, aviso


def _principled(nt, x=300, y=0):
    return nodo(nt, "ShaderNodeBsdfPrincipled", x, y)


def _salida(nt, bsdf, x=600, y=0):
    sal = nodo(nt, "ShaderNodeOutputMaterial", x, y)
    enlazar(nt, bsdf, "BSDF", sal, "Surface")
    return sal


def lineal4(hexcol):
    r, g, b = G.hex_a_lineal(hexcol)
    return (r, g, b, 1.0)


def madera(nombre="Madera", oscuro=(0.10, 0.05, 0.025, 1), claro=(0.38, 0.20, 0.095, 1)):
    mat, nt = nuevo_material(nombre)
    coord = nodo(nt, "ShaderNodeTexCoord", -900, 0)
    mapa = nodo(nt, "ShaderNodeMapping", -700, 0)
    fijar(mapa, "Scale", (0.45, 1.0, 1.0))
    onda = nodo(nt, "ShaderNodeTexWave", -480, 100, wave_type="BANDS", bands_direction="Y", wave_profile="SIN")
    fijar(onda, "Scale", 11.0); fijar(onda, "Distortion", 5.0); fijar(onda, "Detail", 2.0); fijar(onda, "Detail Scale", 1.4)
    ruido = nodo(nt, "ShaderNodeTexNoise", -480, -200)
    fijar(ruido, "Scale", 40.0); fijar(ruido, "Detail", 5.0)
    rampa = nodo(nt, "ShaderNodeValToRGB", -240, 100)
    rampa.color_ramp.elements[0].color = oscuro
    rampa.color_ramp.elements[1].color = claro
    rug = nodo(nt, "ShaderNodeMapRange", -240, -200)
    fijar(rug, "To Min", 0.38); fijar(rug, "To Max", 0.62)
    bump = nodo(nt, "ShaderNodeBump", 0, -200)
    fijar(bump, "Strength", 0.12); fijar(bump, "Distance", 0.002)
    bsdf = _principled(nt)
    fijar(bsdf, ["Specular IOR Level", "Specular"], 0.35)
    enlazar(nt, coord, "Object", mapa, "Vector")
    enlazar(nt, mapa, "Vector", onda, "Vector")
    enlazar(nt, mapa, "Vector", ruido, "Vector")
    enlazar(nt, onda, "Color", rampa, "Fac")
    enlazar(nt, rampa, "Color", bsdf, "Base Color")
    enlazar(nt, ruido, "Fac", rug, "Value")
    enlazar(nt, rug, "Result", bsdf, "Roughness")
    enlazar(nt, ruido, "Fac", bump, "Height")
    enlazar(nt, bump, "Normal", bsdf, "Normal")
    _salida(nt, bsdf)
    return mat


def cubierta(color_hex):
    mat, nt = nuevo_material("Cubierta")
    bsdf = _principled(nt)
    fijar(bsdf, "Base Color", lineal4(color_hex))
    fijar(bsdf, "Roughness", 0.52)
    fijar(bsdf, ["Specular IOR Level", "Specular"], 0.45)
    fijar(bsdf, ["Coat Weight", "Clearcoat"], 0.12)
    fijar(bsdf, ["Coat Roughness", "Clearcoat Roughness"], 0.35)
    ruido = nodo(nt, "ShaderNodeTexNoise", -500, -150)
    fijar(ruido, "Scale", 900.0); fijar(ruido, "Detail", 4.0)
    coord = nodo(nt, "ShaderNodeTexCoord", -700, -150)
    bump = nodo(nt, "ShaderNodeBump", -200, -150)
    fijar(bump, "Strength", 0.06); fijar(bump, "Distance", 0.0004)
    enlazar(nt, coord, "Object", ruido, "Vector")
    enlazar(nt, ruido, "Fac", bump, "Height")
    enlazar(nt, bump, "Normal", bsdf, "Normal")
    _salida(nt, bsdf)
    return mat


def liso(nombre, color_hex, rugosidad=0.5, metal=0.0, especular=0.4):
    mat, nt = nuevo_material(nombre)
    bsdf = _principled(nt)
    fijar(bsdf, "Base Color", lineal4(color_hex))
    fijar(bsdf, "Roughness", rugosidad)
    fijar(bsdf, "Metallic", metal)
    fijar(bsdf, ["Specular IOR Level", "Specular"], especular)
    _salida(nt, bsdf)
    return mat


def metal(color_hex):
    return liso("MetalAnillas", color_hex, rugosidad=0.24, metal=1.0, especular=0.5)


def funda():
    """Plástico transparente: mezcla de 'transparente' y reflejo brillante guiada por Fresnel (barata en Cycles
    y las cartas de debajo reciben luz y sombra normalmente)."""
    mat, nt = nuevo_material("Funda")
    transp = nodo(nt, "ShaderNodeBsdfTransparent", 0, 150)
    brillo = nodo(nt, "ShaderNodeBsdfGlossy", 0, -50)
    fijar(brillo, "Roughness", 0.10)
    fijar(brillo, "Color", (1, 1, 1, 1))
    fres = nodo(nt, "ShaderNodeFresnel", -300, 250)
    fijar(fres, "IOR", 1.45)
    suelo = nodo(nt, "ShaderNodeMath", -120, 250, operation="MAXIMUM")
    suelo.inputs[1].default_value = 0.07   # velo mínimo: la funda se nota incluso de frente
    mezcla = nodo(nt, "ShaderNodeMixShader", 250, 100)
    enlazar(nt, fres, "Fac", suelo, 0)
    enlazar(nt, suelo, "Value", mezcla, "Fac")
    enlazar(nt, transp, "BSDF", mezcla, 1)
    enlazar(nt, brillo, "BSDF", mezcla, 2)
    sal = nodo(nt, "ShaderNodeOutputMaterial", 500, 100)
    enlazar(nt, mezcla, "Shader", sal, "Surface")
    return mat


def soldadura():
    mat, nt = nuevo_material("Soldadura")
    bsdf = _principled(nt)
    fijar(bsdf, "Base Color", (0.9, 0.9, 0.9, 1))
    fijar(bsdf, "Roughness", 0.35)
    fijar(bsdf, "Alpha", 0.28)
    _salida(nt, bsdf)
    return mat


def carta(nombre, imagen):
    mat, nt = nuevo_material(nombre)
    tex = nodo(nt, "ShaderNodeTexImage", -300, 0)
    tex.image = imagen
    tex.interpolation = "Linear"
    tex.extension = "EXTEND"
    bsdf = _principled(nt)
    fijar(bsdf, "Roughness", 0.38)
    fijar(bsdf, ["Specular IOR Level", "Specular"], 0.5)
    enlazar(nt, tex, "Color", bsdf, "Base Color")
    _salida(nt, bsdf)
    return mat


def luz_emisiva(nombre, color, fuerza):
    mat, nt = nuevo_material(nombre)
    em = nodo(nt, "ShaderNodeEmission", 0, 0)
    fijar(em, "Color", color)
    fijar(em, "Strength", fuerza)
    sal = nodo(nt, "ShaderNodeOutputMaterial", 250, 0)
    enlazar(nt, em, "Emission", sal, "Surface")
    return mat


def imagen_carta(indice):
    w, h = 252, 352
    img = bpy.data.images.new("Carta_%02d" % indice, w, h, alpha=False)
    img.pixels.foreach_set(G.carta_pixeles(w, h, indice))
    img.colorspace_settings.name = "sRGB"
    img.pack()
    return img
