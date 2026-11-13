"""Materiales procedurales, estilizados (suaves, cálidos, 'de juguete'), sin ninguna textura externa."""
import bpy
from . import geometria as G
from .utilidades import nuevo_material, nodo, enlazar, fijar, aviso


def _mix_rgb(nt, tipo, x, y):
    return nodo(nt, "ShaderNodeMixRGB", x, y, blend_type=tipo)


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
    mult = nodo(nt, "ShaderNodeMixRGB", -140, 0, blend_type="MULTIPLY")
    fijar(mult, "Fac", 1.0)
    enlazar(nt, rampa, "Color", mult, "Color1")
    enlazar(nt, tono, "Value", mult, "Color2")
    oscurece = nodo(nt, "ShaderNodeMixRGB", 60, 0, blend_type="MIX")
    fijar(oscurece, "Color2", (0.012, 0.008, 0.006, 1))
    enlazar(nt, junta, "Value", oscurece, "Fac")
    enlazar(nt, mult, "Color", oscurece, "Color1")
    rug = nodo(nt, "ShaderNodeMapRange", -360, -420)
    fijar(rug, "To Min", 0.42); fijar(rug, "To Max", 0.72)
    bump = nodo(nt, "ShaderNodeBump", -140, -300)
    fijar(bump, "Strength", 0.25); fijar(bump, "Distance", 0.0015)
    bsdf = _principled(nt, 300, 0)
    fijar(bsdf, ["Specular IOR Level", "Specular"], 0.3)
    enlazar(nt, mezcla, "Value", rampa, "Fac")
    enlazar(nt, grano, "Fac", rug, "Value")
    enlazar(nt, grano, "Fac", bump, "Height")
    enlazar(nt, oscurece, "Color", bsdf, "Base Color")
    enlazar(nt, rug, "Result", bsdf, "Roughness")
    enlazar(nt, bump, "Normal", bsdf, "Normal")
    _salida(nt, bsdf, 560, 0)
    return mat


def cubierta(color_a, color_b, color_borde=None):
    """Sintético premium azul noche: dos tonos mezclados con ruido grande (variación), grano fino en relieve,
    brillo sedoso en rasante (Sheen) y barniz suave (Coat). Reflejos controlados: rugosidad media."""
    mat, nt = nuevo_material("Cubierta")
    coord = nodo(nt, "ShaderNodeTexCoord", -900, 0)
    var = nodo(nt, "ShaderNodeTexNoise", -650, 200)
    fijar(var, "Scale", 9.0); fijar(var, "Detail", 3.0); fijar(var, "Roughness", 0.55)
    mezcla = nodo(nt, "ShaderNodeMixRGB", -420, 200, blend_type="MIX")
    fijar(mezcla, "Color1", lineal4(color_a)); fijar(mezcla, "Color2", lineal4(color_b))
    grano = nodo(nt, "ShaderNodeTexNoise", -650, -150)
    fijar(grano, "Scale", 700.0); fijar(grano, "Detail", 5.0)
    bump = nodo(nt, "ShaderNodeBump", -400, -150)
    fijar(bump, "Strength", 0.10); fijar(bump, "Distance", 0.0004)
    bsdf = _principled(nt)
    fijar(bsdf, "Roughness", 0.46)
    fijar(bsdf, ["Specular IOR Level", "Specular"], 0.40)
    fijar(bsdf, ["Coat Weight", "Clearcoat"], 0.18)
    fijar(bsdf, ["Coat Roughness", "Clearcoat Roughness"], 0.30)
    fijar(bsdf, ["Sheen Weight", "Sheen"], 0.35)
    enlazar(nt, coord, "Object", var, "Vector"); enlazar(nt, coord, "Object", grano, "Vector")
    enlazar(nt, var, "Fac", mezcla, "Fac")
    final = mezcla
    if color_borde:
        try:   # realce de aristas: Bevel (normal suavizada) vs normal real -> máscara de borde -> color más claro
            bev = nodo(nt, "ShaderNodeBevel", -420, -420); fijar(bev, "Radius", 0.0018); bev.samples = 4
            geo = nodo(nt, "ShaderNodeNewGeometry", -420, -600)
            dot = nodo(nt, "ShaderNodeVectorMath", -200, -450, operation="DOT_PRODUCT")
            enlazar(nt, bev, "Normal", dot, 0); enlazar(nt, geo, "Normal", dot, 1)
            rampa = nodo(nt, "ShaderNodeValToRGB", -20, -450)
            rampa.color_ramp.elements[0].position, rampa.color_ramp.elements[0].color = 0.80, (1, 1, 1, 1)
            rampa.color_ramp.elements[1].position, rampa.color_ramp.elements[1].color = 0.985, (0, 0, 0, 1)
            enlazar(nt, dot, "Value", rampa, "Fac")
            borde = _mix_rgb(nt, "MIX", 120, 150)
            fijar(borde, "Color2", lineal4(color_borde)); fijar(borde, "Fac", 0.0)
            enlazar(nt, rampa, "Color", borde, "Fac")
            enlazar(nt, mezcla, "Color", borde, "Color1")
            final = borde
        except Exception:
            final = mezcla
    enlazar(nt, final, "Color", bsdf, "Base Color")
    enlazar(nt, grano, "Fac", bump, "Height"); enlazar(nt, bump, "Normal", bsdf, "Normal")
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
    """Lámina casi invisible con UN reflejo suave y localizado: Principled (sin Glossy, sin refracción) cuyo alfa sube
    de 0,03 a 0,20 en una banda diagonal (Gradient sobre coordenadas generadas del plano). El plástico acompaña a la carta."""
    mat, nt = nuevo_material("Funda")
    coord = nodo(nt, "ShaderNodeTexCoord", -900, 0)
    sep = nodo(nt, "ShaderNodeSeparateXYZ", -700, 0)
    suma = nodo(nt, "ShaderNodeMath", -520, 0, operation="ADD")          # u + v : banda diagonal
    rampa = nodo(nt, "ShaderNodeValToRGB", -330, 0)
    rampa.color_ramp.interpolation = "B_SPLINE"
    e = rampa.color_ramp.elements
    e[0].position, e[0].color = 0.62, (0.03, 0.03, 0.03, 1)
    e[1].position, e[1].color = 0.95, (0.20, 0.20, 0.20, 1)
    e.new(0.78).color = (0.20, 0.20, 0.20, 1)
    bsdf = _principled(nt)
    fijar(bsdf, "Base Color", (1, 1, 1, 1))
    fijar(bsdf, "Roughness", 0.22)
    fijar(bsdf, ["Specular IOR Level", "Specular"], 0.25)
    sep_a = nodo(nt, "ShaderNodeSeparateColor", -140, -200)
    enlazar(nt, coord, "Generated", sep, "Vector")
    enlazar(nt, sep, "X", suma, 0); enlazar(nt, sep, "Y", suma, 1)
    enlazar(nt, suma, "Value", rampa, "Fac")
    enlazar(nt, rampa, "Color", sep_a, "Color")
    enlazar(nt, sep_a, "Red", bsdf, "Alpha")
    _salida(nt, bsdf)
    return mat


def soldadura():
    """Termosellado discreto: línea fina, apenas más clara que la hoja y casi transparente (nunca un marco blanco)."""
    mat, nt = nuevo_material("Soldadura")
    bsdf = _principled(nt)
    fijar(bsdf, "Base Color", lineal4("#6A6E74"))
    fijar(bsdf, "Roughness", 0.45)
    fijar(bsdf, ["Specular IOR Level", "Specular"], 0.15)
    fijar(bsdf, "Alpha", 0.30)
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


# ================================================================== Fase 3.4.4: conjunto de materiales de carta y funda
def hoja_grafito():
    """Página: negro grafito mate con textura sutil (ruido fino + fibra más grande), sin brillo."""
    mat, nt = nuevo_material("HojaGrafito")
    coord = nodo(nt, "ShaderNodeTexCoord", -900, 0)
    fino = nodo(nt, "ShaderNodeTexNoise", -650, 100); fijar(fino, "Scale", 420.0); fijar(fino, "Detail", 8.0); fijar(fino, "Roughness", 0.6)
    gran = nodo(nt, "ShaderNodeTexNoise", -650, -150); fijar(gran, "Scale", 28.0); fijar(gran, "Detail", 3.0)
    suma = nodo(nt, "ShaderNodeMath", -430, 0, operation="MULTIPLY_ADD"); suma.inputs[1].default_value = 0.35
    enlazar(nt, coord, "Object", fino, "Vector"); enlazar(nt, coord, "Object", gran, "Vector")
    enlazar(nt, fino, "Fac", suma, 0); enlazar(nt, gran, "Fac", suma, 2)
    bump = nodo(nt, "ShaderNodeBump", -220, 0); fijar(bump, "Strength", 0.18); fijar(bump, "Distance", 0.0003)
    tono = _mix_rgb(nt, "MIX", -220, 250)
    fijar(tono, "Color1", lineal4("#17191C")); fijar(tono, "Color2", lineal4("#2A2D31"))
    enlazar(nt, gran, "Fac", tono, "Fac")
    bsdf = _principled(nt)
    fijar(bsdf, "Roughness", 0.78)
    fijar(bsdf, ["Specular IOR Level", "Specular"], 0.18)
    enlazar(nt, suma, "Value", bump, "Height"); enlazar(nt, bump, "Normal", bsdf, "Normal")
    enlazar(nt, tono, "Color", bsdf, "Base Color")
    _salida(nt, bsdf)
    return mat


def carta_satinada(nombre, imagen, holo=False):
    """Cartón fino satinado (rugosidad media + barniz muy suave + fibra en relieve). Si 'holo', el alfa de la imagen es la
    máscara de la ilustración: ahí se superpone una banda arcoíris (SOFT_LIGHT, sutil) que depende del ángulo de vista
    y de la posición, y se baja la rugosidad. Sin emisión, sin transmisión, sin refracción."""
    mat, nt = nuevo_material(nombre)
    coord = nodo(nt, "ShaderNodeTexCoord", -1200, 0)
    tex = nodo(nt, "ShaderNodeTexImage", -900, 200)
    tex.image = imagen; tex.interpolation = "Linear"; tex.extension = "EXTEND"
    fibra = nodo(nt, "ShaderNodeTexNoise", -900, -250); fijar(fibra, "Scale", 700.0); fijar(fibra, "Detail", 6.0)
    bump = nodo(nt, "ShaderNodeBump", -650, -250); fijar(bump, "Strength", 0.05); fijar(bump, "Distance", 0.0002)
    bsdf = _principled(nt, 300, 0)
    fijar(bsdf, "Roughness", 0.40)
    fijar(bsdf, ["Specular IOR Level", "Specular"], 0.30)
    fijar(bsdf, ["Coat Weight", "Clearcoat"], 0.10)
    fijar(bsdf, ["Coat Roughness", "Clearcoat Roughness"], 0.30)
    enlazar(nt, coord, "UV", tex, "Vector")
    enlazar(nt, coord, "Object", fibra, "Vector"); enlazar(nt, fibra, "Fac", bump, "Height"); enlazar(nt, bump, "Normal", bsdf, "Normal")
    if not holo:
        enlazar(nt, tex, "Color", bsdf, "Base Color")
    else:
        sep = nodo(nt, "ShaderNodeSeparateXYZ", -1000, 500)
        enlazar(nt, coord, "Generated", sep, "Vector")
        uv = nodo(nt, "ShaderNodeMath", -820, 500, operation="ADD")
        enlazar(nt, sep, "X", uv, 0); enlazar(nt, sep, "Y", uv, 1)
        cara = nodo(nt, "ShaderNodeLayerWeight", -820, 700); fijar(cara, "Blend", 0.5)
        fase = nodo(nt, "ShaderNodeMath", -620, 560, operation="MULTIPLY_ADD"); fase.inputs[1].default_value = 0.9
        enlazar(nt, uv, "Value", fase, 0)
        enlazar(nt, cara, "Facing", fase, 2)
        rep = nodo(nt, "ShaderNodeMath", -440, 560, operation="FRACT")
        enlazar(nt, fase, "Value", rep, 0)
        arco = nodo(nt, "ShaderNodeValToRGB", -260, 560)
        r = arco.color_ramp
        r.elements[0].position, r.elements[0].color = 0.0, (1.0, 0.35, 0.55, 1)
        r.elements[1].position, r.elements[1].color = 1.0, (1.0, 0.35, 0.55, 1)
        for pos, col in ((0.2, (1.0, 0.85, 0.35, 1)), (0.4, (0.4, 1.0, 0.65, 1)), (0.6, (0.35, 0.75, 1.0, 1)), (0.8, (0.8, 0.45, 1.0, 1))):
            r.elements.new(pos).color = col
        mezcla = _mix_rgb(nt, "SOFT_LIGHT", 0, 260)
        mascara = nodo(nt, "ShaderNodeMath", -120, 460, operation="MULTIPLY"); mascara.inputs[1].default_value = 0.55
        enlazar(nt, tex, "Alpha", mascara, 0)
        enlazar(nt, mascara, "Value", mezcla, "Fac")
        enlazar(nt, tex, "Color", mezcla, "Color1")
        enlazar(nt, arco, "Color", mezcla, "Color2")
        enlazar(nt, mezcla, "Color", bsdf, "Base Color")
        rug = nodo(nt, "ShaderNodeMapRange", 0, -80)
        fijar(rug, "To Min", 0.40); fijar(rug, "To Max", 0.20)
        enlazar(nt, tex, "Alpha", rug, "Value"); enlazar(nt, rug, "Result", bsdf, "Roughness")
        met = nodo(nt, "ShaderNodeMath", 0, -280, operation="MULTIPLY"); met.inputs[1].default_value = 0.22
        enlazar(nt, tex, "Alpha", met, 0); enlazar(nt, met, "Value", bsdf, "Metallic")
    _salida(nt, bsdf, 620, 0)
    return mat


def funda_pelicula():
    """Lámina de plástico: Transparent + Glossy mezclados por una máscara PEQUEÑA (velo 3 % + dos bandas de reflejo
    diagonales suaves + algo de Fresnel). No hay color difuso (antes la base blanca + exceso de luz = baldosa blanca),
    ni transmisión ni refracción: nada que dependa de la API de transmisión de 4.2."""
    mat, nt = nuevo_material("FundaPelicula")
    coord = nodo(nt, "ShaderNodeTexCoord", -1100, 0)
    sep = nodo(nt, "ShaderNodeSeparateXYZ", -900, 100)
    suma = nodo(nt, "ShaderNodeMath", -720, 100, operation="ADD")
    enlazar(nt, coord, "Generated", sep, "Vector")
    enlazar(nt, sep, "X", suma, 0); enlazar(nt, sep, "Y", suma, 1)
    rampa = nodo(nt, "ShaderNodeValToRGB", -540, 100)
    r = rampa.color_ramp
    r.elements[0].position, r.elements[0].color = 0.30, (0, 0, 0, 1)
    r.elements[1].position, r.elements[1].color = 0.99, (0, 0, 0, 1)
    for pos, v in ((0.42, 0.16), (0.56, 0.0), (0.84, 0.0), (0.90, 0.09)):
        r.elements.new(pos).color = (v, v, v, 1)
    rojo = nodo(nt, "ShaderNodeSeparateColor", -330, 100)
    enlazar(nt, rampa, "Color", rojo, "Color")
    fres = nodo(nt, "ShaderNodeFresnel", -540, -150); fijar(fres, "IOR", 1.45)
    fres2 = nodo(nt, "ShaderNodeMath", -330, -150, operation="MULTIPLY"); fres2.inputs[1].default_value = 0.5
    enlazar(nt, fres, "Fac", fres2, 0)
    s1 = nodo(nt, "ShaderNodeMath", -120, 0, operation="ADD")
    enlazar(nt, rojo, "Red", s1, 0); enlazar(nt, fres2, "Value", s1, 1)
    s2 = nodo(nt, "ShaderNodeMath", 60, 0, operation="ADD", use_clamp=True); s2.inputs[1].default_value = 0.03
    enlazar(nt, s1, "Value", s2, 0)
    transp = nodo(nt, "ShaderNodeBsdfTransparent", 60, 220)
    brillo = nodo(nt, "ShaderNodeBsdfGlossy", 60, -120)
    fijar(brillo, "Roughness", 0.16); fijar(brillo, "Color", (1, 1, 1, 1))
    mezcla = nodo(nt, "ShaderNodeMixShader", 300, 60)
    enlazar(nt, s2, "Value", mezcla, "Fac")
    enlazar(nt, transp, "BSDF", mezcla, 1); enlazar(nt, brillo, "BSDF", mezcla, 2)
    sal = nodo(nt, "ShaderNodeOutputMaterial", 540, 60)
    enlazar(nt, mezcla, "Shader", sal, "Surface")
    return mat


def soldadura_discreta():
    """Termosellado: línea gris translúcida (alfa 0,45), nunca un marco blanco."""
    mat, nt = nuevo_material("SoldaduraDiscreta")
    bsdf = _principled(nt)
    fijar(bsdf, "Base Color", lineal4("#4A4E55"))
    fijar(bsdf, "Roughness", 0.5)
    fijar(bsdf, ["Specular IOR Level", "Specular"], 0.15)
    fijar(bsdf, "Alpha", 0.45)
    _salida(nt, bsdf)
    return mat


def imagen_arte(indice, holo=False, carpeta=None):
    """Imagen de la carta. Con 'carpeta' se guarda un PNG real en disco y se carga como archivo (fuente FILE), lo más
    robusto para Cycles y permite abrir la textura para inspeccionarla."""
    import os
    from . import arte
    a = arte.carta(indice, holo)
    if carpeta:
        os.makedirs(carpeta, exist_ok=True)
        ruta = os.path.join(carpeta, "Arte_%02d%s.png" % (indice, "_holo" if holo else ""))
        tmp = bpy.data.images.new("tmp_" + os.path.basename(ruta), a.shape[1], a.shape[0], alpha=True)
        tmp.pixels.foreach_set(a.ravel())
        tmp.filepath_raw = ruta
        tmp.file_format = "PNG"
        tmp.save()
        bpy.data.images.remove(tmp)
        img = bpy.data.images.load(ruta)
        img.colorspace_settings.name = "sRGB"
        try:
            img.alpha_mode = "CHANNEL_PACKED"
        except (TypeError, AttributeError):
            pass
        return img
    img = bpy.data.images.new("Arte_%02d%s" % (indice, "_holo" if holo else ""), a.shape[1], a.shape[0], alpha=True)
    img.pixels.foreach_set(a.ravel())
    img.colorspace_settings.name = "sRGB"
    try:
        img.alpha_mode = "CHANNEL_PACKED"
    except (TypeError, AttributeError):
        pass
    img.pack()
    return img
