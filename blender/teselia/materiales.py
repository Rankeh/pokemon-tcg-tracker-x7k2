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


def madera(nombre="Madera", oscuro=(0.050, 0.034, 0.024, 1), claro=(0.27, 0.17, 0.105, 1), tablon=0.16):
    """Tablones de nogal: tono distinto por tablón, juntas oscuras, veta larga y fina a lo largo de X (grano
    alargado con coordenadas escaladas), ondulación suave a gran escala y rugosidad variable. Sin repeticiones
    visibles porque todo es procedural en coordenadas de objeto."""
    mat, nt = nuevo_material(nombre)
    coord = nodo(nt, "ShaderNodeTexCoord", -1400, 0)
    sep = nodo(nt, "ShaderNodeSeparateXYZ", -1200, 200)
    enlazar(nt, coord, "Object", sep, "Vector")
    # índice de tablón según Y, tono aleatorio por tablón y junta oscura
    div = nodo(nt, "ShaderNodeMath", -1000, 300, operation="DIVIDE"); div.inputs[1].default_value = tablon
    suelo = nodo(nt, "ShaderNodeMath", -820, 300, operation="FLOOR")
    azar = nodo(nt, "ShaderNodeTexWhiteNoise", -640, 300, noise_dimensions="1D")
    frac = nodo(nt, "ShaderNodeMath", -820, 120, operation="FRACT")
    junta = nodo(nt, "ShaderNodeMath", -640, 120, operation="LESS_THAN"); junta.inputs[1].default_value = 0.012
    enlazar(nt, sep, "Y", div, 0); enlazar(nt, div, "Value", suelo, 0); enlazar(nt, suelo, "Value", azar, "W")
    enlazar(nt, div, "Value", frac, 0); enlazar(nt, frac, "Value", junta, 0)
    # veta: ruido muy alargado en X + bandas anchas distorsionadas
    mapa = nodo(nt, "ShaderNodeMapping", -1000, -150)
    fijar(mapa, "Scale", (1.6, 260.0, 40.0))
    fijar(mapa, "Location", (0.0, 0.0, 0.0))
    grano = nodo(nt, "ShaderNodeTexNoise", -780, -150)
    fijar(grano, "Scale", 1.0); fijar(grano, "Detail", 6.0); fijar(grano, "Roughness", 0.6)
    mapa2 = nodo(nt, "ShaderNodeMapping", -1000, -420)
    fijar(mapa2, "Scale", (0.7, 6.0, 1.0))
    onda = nodo(nt, "ShaderNodeTexWave", -780, -420, wave_type="BANDS", bands_direction="Y", wave_profile="SAW")
    fijar(onda, "Scale", 1.0); fijar(onda, "Distortion", 7.0); fijar(onda, "Detail", 3.0); fijar(onda, "Detail Scale", 1.3)
    enlazar(nt, coord, "Object", mapa, "Vector"); enlazar(nt, mapa, "Vector", grano, "Vector")
    enlazar(nt, coord, "Object", mapa2, "Vector"); enlazar(nt, mapa2, "Vector", onda, "Vector")
    mezcla = nodo(nt, "ShaderNodeMath", -560, -250, operation="MULTIPLY_ADD")
    mezcla.inputs[1].default_value = 0.6
    enlazar(nt, grano, "Fac", mezcla, 0)
    enlazar(nt, onda, "Fac", mezcla, 2)
    rampa = nodo(nt, "ShaderNodeValToRGB", -360, -100)
    rampa.color_ramp.elements[0].color = oscuro
    rampa.color_ramp.elements[1].color = claro
    tono = nodo(nt, "ShaderNodeMath", -360, 300, operation="MULTIPLY_ADD")   # 0.75 + 0.5*azar
    tono.inputs[1].default_value = 0.5; tono.inputs[2].default_value = 0.75
    enlazar(nt, azar, "Value", tono, 0)
    mult = nodo(nt, "ShaderNodeMix", -140, 0, data_type="RGBA", blend_type="MULTIPLY")
    fijar(mult, "Factor", 1.0)
    enlazar(nt, rampa, "Color", mult, "A")
    enlazar(nt, tono, "Value", mult, "B")
    oscurece = nodo(nt, "ShaderNodeMix", 60, 0, data_type="RGBA", blend_type="MIX")
    fijar(oscurece, "B", (0.012, 0.008, 0.006, 1))
    enlazar(nt, junta, "Value", oscurece, "Factor")
    enlazar(nt, mult, "Result", oscurece, "A")
    rug = nodo(nt, "ShaderNodeMapRange", -360, -420)
    fijar(rug, "To Min", 0.42); fijar(rug, "To Max", 0.72)
    bump = nodo(nt, "ShaderNodeBump", -140, -300)
    fijar(bump, "Strength", 0.25); fijar(bump, "Distance", 0.0015)
    bsdf = _principled(nt, 300, 0)
    fijar(bsdf, ["Specular IOR Level", "Specular"], 0.3)
    enlazar(nt, mezcla, "Value", rampa, "Fac")
    enlazar(nt, grano, "Fac", rug, "Value")
    enlazar(nt, grano, "Fac", bump, "Height")
    enlazar(nt, oscurece, "Result", bsdf, "Base Color")
    enlazar(nt, rug, "Result", bsdf, "Roughness")
    enlazar(nt, bump, "Normal", bsdf, "Normal")
    _salida(nt, bsdf, 560, 0)
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
    return liso("MetalAnillas", color_hex, rugosidad=0.28, metal=1.0, especular=0.5)


def funda():
    """Lámina casi invisible: Principled con alfa muy bajo (el alfa atenúa también el reflejo), rugosidad media y
    especular bajo. Sin Glossy puro, sin Fresnel, sin transmisión ni refracción: nada que pueda 'romperse'."""
    mat, nt = nuevo_material("Funda")
    bsdf = _principled(nt)
    fijar(bsdf, "Base Color", (1, 1, 1, 1))
    fijar(bsdf, "Roughness", 0.30)
    fijar(bsdf, ["Specular IOR Level", "Specular"], 0.30)
    fijar(bsdf, "Alpha", 0.07)
    _salida(nt, bsdf)
    return mat


def soldadura():
    """Línea de termosellado: plástico lechoso, algo más claro que la funda."""
    mat, nt = nuevo_material("Soldadura")
    bsdf = _principled(nt)
    fijar(bsdf, "Base Color", (0.62, 0.62, 0.60, 1))
    fijar(bsdf, "Roughness", 0.5)
    fijar(bsdf, ["Specular IOR Level", "Specular"], 0.2)
    fijar(bsdf, "Alpha", 0.55)
    _salida(nt, bsdf)
    return mat


def carta(nombre, imagen):
    mat, nt = nuevo_material(nombre)
    tex = nodo(nt, "ShaderNodeTexImage", -300, 0)
    tex.image = imagen
    tex.interpolation = "Linear"
    tex.extension = "EXTEND"
    bsdf = _principled(nt)
    fijar(bsdf, "Roughness", 0.55)
    fijar(bsdf, ["Specular IOR Level", "Specular"], 0.2)
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
