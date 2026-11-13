"""
Depuración de la carta ilustrada (Fase 3.4.5) — se ejecuta DENTRO de Blender 4.2. Tres renders INDEPENDIENTES:
  paso 1: una carta ilustrada SIN funda, vista desde arriba, luz neutra
  paso 2: la misma carta CON funda (misma cámara y luces)
  paso 3: carta holográfica con funda (solo se evalúa si los pasos 1 y 2 pasan)
Cada paso verifica automáticamente objeto, visibilidad, material, nodos, UV, normales y oclusión, y compara los píxeles del
render con la textura. Que Blender termine sin errores NO cuenta: el criterio es la correlación textura↔render.

    blender --background --python crear_depuracion_carta.py -- --paso todos
"""
import argparse
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

import bpy  # noqa: E402
from teselia import config as CFG, materiales as M, prueba, modelos, luces_camara as LC, render, utilidades as U, depuracion as D, arte, verificacion as V  # noqa: E402

SALIDA = os.path.join(AQUI, "salida")
NOMBRES = {1: "depuracion_1_carta_sin_funda", 2: "depuracion_2_carta_con_funda", 3: "depuracion_3_holografica"}


def argumentos():
    resto = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--paso", default="todos", choices=["1", "2", "3", "todos"])
    p.add_argument("--recalibrar", action="store_true")
    p.add_argument("--bisecar", action="store_true", help="renderiza siempre las variantes de funda del paso 2")
    p.add_argument("--config", default=None)
    return p.parse_args(resto)


def material_variante(nombre):
    mat, nt = U.nuevo_material(nombre)
    transp = U.nodo(nt, "ShaderNodeBsdfTransparent", 0, 100)
    sal = U.nodo(nt, "ShaderNodeOutputMaterial", 400, 0)
    if nombre == "FundaTransparentePura":
        U.enlazar(nt, transp, "BSDF", sal, "Surface")
    else:   # velo constante 3 % (sin bandas ni Fresnel)
        brillo = U.nodo(nt, "ShaderNodeBsdfGlossy", 0, -100)
        U.fijar(brillo, "Roughness", 0.16)
        mezcla = U.nodo(nt, "ShaderNodeMixShader", 200, 0)
        mezcla.inputs["Fac"].default_value = 0.03
        U.enlazar(nt, transp, "BSDF", mezcla, 1); U.enlazar(nt, brillo, "BSDF", mezcla, 2)
        U.enlazar(nt, mezcla, "Shader", sal, "Surface")
    return mat


def construir_paso(cfg, paso):
    U.limpiar_escena()
    scn = bpy.context.scene
    col = bpy.data.collections.new("Depuracion")
    scn.collection.children.link(col)
    mats = {"hoja": M.hoja_grafito(), "soldadura": M.soldadura_discreta(), "funda": M.funda_pelicula(), "suelo": M.liso("Suelo", cfg["colores"]["suelo"], 0.8, 0.0, 0.2)}
    piezas, info = prueba.construir_depuracion(cfg, paso)
    objs = modelos.instanciar(piezas, col, mats, os.path.join(SALIDA, "texturas"))
    cam, pos, obj, dist = LC.crear_camara(cfg, col, "depuracion")
    # luz NEUTRA (blanca) fuera del eje para que el reflejo de la funda no caiga sobre la cámara cenital
    LC.luz_area("Neutra", col, (obj[0] - 0.40, obj[1] - 0.10, obj[2] + 0.40), obj, 4.0, "#FFFFFF", 0.35)
    LC.luz_area("RellenoNeutro", col, (obj[0] + 0.35, obj[1] - 0.25, obj[2] + 0.35), obj, 1.2, "#FFFFFF", 0.5)
    mundo = bpy.data.worlds.new("Mundo")
    mundo.use_nodes = True
    fondo = mundo.node_tree.nodes.get("Background")
    fondo.inputs["Color"].default_value = (0.5, 0.5, 0.5, 1)
    fondo.inputs["Strength"].default_value = 0.3
    scn.world = mundo
    vs = scn.view_settings
    for nombre in ("AgX", "Filmic", "Standard"):
        try:
            vs.view_transform = nombre
            break
        except TypeError:
            continue
    render.configurar(cfg, "depuracion", "previa")
    w, h = cfg["vistas"]["depuracion"]["resolucion"]
    scn.render.resolution_x, scn.render.resolution_y = w, h
    scn.cycles.samples = cfg["depuracion"]["muestras"]
    return scn, objs, cam


def exposicion(cfg, scn, recalibrar):
    ruta = os.path.join(SALIDA, "ev_depuracion.json")
    if os.path.exists(ruta) and not recalibrar:
        ev = json.load(open(ruta))["ev"]
        scn.view_settings.exposure = ev
        print("[teselia] exposición reutilizada de ev_depuracion.json: %.2f EV (igual en todos los pasos)" % ev)
        return
    ev = render.autoexposicion(cfg, "depuracion", cfg["depuracion"]["exposicion_objetivo"], os.path.join(SALIDA, "_calibracion.png"))
    json.dump({"ev": scn.view_settings.exposure}, open(ruta, "w"))


def ejecutar_paso(cfg, paso, recalibrar, bisecar):
    print("\n[verif] ===================== PASO %d: %s =====================" % (paso, NOMBRES[paso]))
    scn, objs, cam = construir_paso(cfg, paso)
    exposicion(cfg, scn, recalibrar or paso == 1)   # el paso 1 calibra; 2 y 3 reutilizan el MISMO valor
    R = D.Registro()
    ob = objs["Carta"]
    cara = c_mundo = None
    R.seguro("objeto/visibilidad", lambda: D.objeto_y_visibilidad(R, ob, scn))
    holo = paso == 3
    R.seguro("material/nodos", lambda: D.material_y_nodos(R, ob, holo))
    res = R.seguro("uv/normales", lambda: D.uv_y_normales(R, ob, cam, cfg["archivador"]["carta"]["ancho"], cfg["archivador"]["carta"]["alto"]))
    if res:
        cara, c_mundo = res
        R.seguro("oclusión", lambda: D.oclusion(R, scn, cam, ob, c_mundo, paso >= 2))
    ruta = os.path.join(SALIDA, NOMBRES[paso] + ".png")
    render.renderizar(ruta)
    print("[teselia] render guardado en", ruta)
    textura = arte.carta(1 if not holo else 2, holo)
    umbral = V.UMBRALES["corr_holo" if holo else ("corr_con_funda" if paso == 2 else "corr_sin_funda")]
    veredicto = R.seguro("comparación", lambda: D.comparar_render(R, scn, cam, ob, cara, ruta, textura, umbral, "paso %d" % paso)) if cara is not None else None
    if paso == 2 and (bisecar or not (veredicto and veredicto["ok"])):
        print("[verif] --- bisección de la funda (misma cámara y luces) ---")
        f = objs["Funda"]
        orig = f.data.materials[0]
        for nombre in ("FundaTransparentePura", "FundaVeloConstante"):
            f.data.materials[0] = material_variante(nombre)
            rv = os.path.join(SALIDA, "depuracion_2%s_%s.png" % ("b" if "Pura" in nombre else "c", nombre))
            render.renderizar(rv)
            if cara is not None:
                R.seguro("comparación " + nombre, lambda: D.comparar_render(R, scn, cam, ob, cara, rv, textura, umbral, nombre))
        f.data.materials[0] = orig
    D.guardar(R, os.path.join(SALIDA, "depuracion_paso%d.json" % paso))
    return R, veredicto


def main():
    a = argumentos()
    cfg = CFG.cargar(a.config)
    os.makedirs(SALIDA, exist_ok=True)
    pasos = [1, 2, 3] if a.paso == "todos" else [int(a.paso)]
    resumen = {}
    for p in pasos:
        if p == 3 and a.paso == "todos" and not all(resumen.get(k) and resumen[k]["ok"] for k in (1, 2)):
            print("\n[verif] PASO 3 omitido: los pasos 1 y 2 no cumplen el criterio (ilustración visible sin y con funda).")
            break
        R, v = ejecutar_paso(cfg, p, a.recalibrar, a.bisecar)
        resumen[p] = v if v else {"ok": False}
    print("\n[verif] ================= RESUMEN =================")
    for p, v in resumen.items():
        print("[verif] paso %d (%s): %s" % (p, NOMBRES[p], "ILUSTRACIÓN VISIBLE" if v.get("ok") else "ILUSTRACIÓN NO VISIBLE / no verificada"), {k: round(x, 3) for k, x in v.items() if isinstance(x, float)})
    json.dump(resumen, open(os.path.join(SALIDA, "depuracion_resumen.json"), "w"), indent=2)


main()
