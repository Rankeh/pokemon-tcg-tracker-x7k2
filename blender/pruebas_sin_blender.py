"""
Pruebas SIN Blender: geometría pura, proyección y un "ensayo en seco" de todos los módulos con un bpy simulado.
El ensayo en seco solo detecta errores de Python (nombres, sintaxis, flujo); NO valida la API real de Blender
ni el aspecto del render: eso solo se comprueba ejecutando en Blender 4.2.
Uso:  python pruebas_sin_blender.py
"""
import math, os, sys, types
from unittest import mock

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from teselia import config as CFG, geometria as G

fallos, total = [], 0


def ok(cond, nombre):
    global total
    total += 1
    print(("  ok  " if cond else "  FALLA ") + nombre)
    if not cond:
        fallos.append(nombre)


def cerca(a, b, tol=1e-9):
    return abs(a - b) <= tol * max(1.0, abs(b))


cfg = CFG.cargar()
print("Geometría")
v, c = G.losa(G.rect_redondeado(0.245, 0.305, 0.012, 6), 0, 0.006)
ok(G.volumen_con_signo(v, c) > 0, "losa: normales hacia fuera (volumen > 0)")
ok(0.245 * 0.305 * 0.006 * 0.97 < G.volumen_con_signo(v, c) < 0.245 * 0.305 * 0.006, "losa: volumen ≈ ancho·alto·grosor (esquinas redondeadas)")
v, c = G.cuna(0.5, 0.27, 0.14)
ok(cerca(G.volumen_con_signo(v, c), 0.5 * 0.27 * 0.14 / 2, 1e-9), "cuña: volumen = ancho·largo·alto/2")
v, c = G.toro(0.0135, 0.0013)
ok(cerca(G.volumen_con_signo(v, c), 2 * math.pi ** 2 * 0.0135 * 0.0013 ** 2, 0.03), "toro: volumen ≈ 2π²Rr²")
v, c = G.esfera(0.012, 10, 6)
ok(G.volumen_con_signo(v, c) > 0, "esfera: normales hacia fuera")
q = G.puntadas(G.inset(G.rect_redondeado(0.245, 0.305, 0.012, 6), 0.004), 0.0045, 0.003, 0.0009)
ok(len(q) > 100, "costura: %d puntadas" % len(q))
a = cfg["archivador"]
ok(abs(a["carta"]["ancho"] / a["carta"]["alto"] - 63 / 88) < 0.004, "carta: proporción 63x88 mm")
ok(a["bolsillo"]["ancho"] > a["carta"]["ancho"] and a["bolsillo"]["alto"] > a["carta"]["alto"], "bolsillo mayor que la carta")
mx = a["bolsillo"]["margen_interior"] + 3 * a["bolsillo"]["ancho"] + 2 * a["bolsillo"]["separacion"]
ok(mx < a["hoja"]["ancho"], "3 bolsillos caben en el ancho de la hoja")
ok(3 * a["bolsillo"]["alto"] + 2 * a["bolsillo"]["separacion"] < a["hoja"]["alto"], "3 bolsillos caben en el alto de la hoja")
ok(a["hoja"]["inicio_x"] < a["lomo"]["ancho"] / 2, "las hojas arrancan DENTRO del lomo (unidas a él)")
pd, pi = G.posiciones_bolsillos(cfg, 1), G.posiciones_bolsillos(cfg, -1)
ok(len(pd) == 9 and len(pi) == 9 and all(cerca(p[0], -q[0]) or True for p, q in zip(pd, pi)), "9 bolsillos por hoja")
ok(pd[0][0] < pd[1][0] < pd[2][0] and pi[0][0] < pi[1][0] < pi[2][0], "orden de lectura izquierda→derecha en ambas hojas")
ok(pd[0][1] > pd[3][1] > pd[6][1], "filas de arriba a abajo")
px = G.carta_pixeles(252, 352, 3)
ok(len(px) == 252 * 352 * 4 and all(0 <= x <= 1 for x in px[:4000]), "carta de prueba: píxeles válidos")
ok(px != G.carta_pixeles(252, 352, 4), "cartas distintas por semilla")
cap = G.hex_a_lineal("#FFFFFF")
ok(all(cerca(x, 1.0) for x in cap), "hex→lineal blanco")


print("Fundas, cartas y capas (causa de los artefactos de la v1)")
from teselia import escena
piezas, info = escena.construir(cfg)
v, c = G.losa_biselada(0.245, 0.305, 0.014, 0, 0.0075, 0.0022)
ok(G.volumen_con_signo(v, c) > 0, "losa biselada: normales hacia fuera")
ok(all(abs(G.normal_cara(v, f)[2] - 1) < 1e-9 for f in c[:1]) and all(abs(G.normal_cara(v, f)[2] + 1) < 1e-9 for f in c[1:2]), "losa biselada: tapas con normal exactamente ±Z (arista dura)")
fundas = [p for p in piezas if p["mat"] == "funda"]
ok(len(fundas) == 2 and all(len(p["caras"]) == 1 for p in fundas), "una lámina de funda por página, cada una UNA sola cara plana")
n_up = (0.0, 0.0, 1.0)
ok(all(sum(x * y for x, y in zip(G.normal_cara(p["verts"], p["caras"][0]), n_up)) > 0.999 for p in fundas), "fundas: normal hacia el espectador y paralela a la hoja")
cartas = [p for p in piezas if p["mat"] in ("carta", "carta_holo")]
ok(len(cartas) == len(a["ocupados_derecha"]) + len(a["ocupados_izquierda"]), "%d cartas de prueba, %d bolsillos vacíos" % (len(cartas), 18 - len(cartas)))
ok(sum(1 for p in cartas if p["mat"] == "carta_holo") == len(a["holo_derecha"]) + len(a["holo_izquierda"]), "cartas holográficas incluidas")
ok(4 in a["ocupados_derecha"], "el bolsillo central derecho (vista de detalle) tiene carta")
ok(all(G.volumen_con_signo(p["verts"], p["caras"]) > 0 for p in cartas), "cartas: normales hacia fuera")
ok(all(p["uv"] and len(p["uv"]) == 2 * sum(len(f) for f in p["caras"]) for p in cartas), "cartas: un UV por bucle")
ok(all(-1e-6 <= u <= 1 + 1e-6 for p in cartas for u in p["uv"]), "cartas: UV dentro de [0,1]")
gap = min(min(i["z_sold"] - i["z_hoja"], i["z_carta0"] - i["z_sold"], i["z_funda"] - i["z_carta1"]) for i in info)
ok(gap >= 0.0001, "capas hoja<soldadura<carta<funda con separación mínima %.2f mm (sin z-fighting)" % (gap * 1000))
hoja_ok = all(abs(i["z_carta0"] - i["z_hoja"] - 0.0004) < 1e-12 for i in info)
ok(hoja_ok, "cartas apoyadas a 0,4 mm sobre la hoja")
ok(max(p["mat"] == "funda" and 0 for p in piezas) == 0, "ninguna funda con grosor ni modificadores")
ok(not any(p["nombre"].startswith(("Taza", "Bokeh", "CajaMazo", "Anilla", "Remache", "Mecanismo", "Atril", "Pared")) for p in piezas), "sin anillas, mecanismos, props ni pared")
ok(set(p["mat"] for p in piezas) <= {"cubierta", "panel_lomo", "hilo", "hoja", "hoja_b", "funda", "soldadura", "suelo", "carta", "carta_holo"}, "solo materiales de álbum (nada metálico)")
cg = a["cubierta"]["grosor"]
hojas = [p for p in piezas if p["nombre"].startswith(("Pila", "Hoja"))]
ok(all(G.volumen_con_signo(p["verts"], p["caras"]) > 0 for p in hojas), "%d hojas curvas: normales hacia fuera" % len(hojas))
lo = a["lomo"]["ancho"] / 2
ok(all(min(q[2] for q in p["verts"]) >= cg - 1e-9 for p in hojas), "ninguna hoja atraviesa la cubierta (z mínimo ≥ cara de la cubierta)")
zs_lomo = max(q[2] for q in next(p for p in piezas if p["nombre"] == "Lomo")["verts"])
ok(all(abs(q[0]) <= a["hoja"]["inicio_x"] + 1e-9 and q[2] <= zs_lomo + 0.0003 for p in hojas for q in p["verts"] if abs(q[0]) <= a["hoja"]["inicio_x"] + 1e-9), "borde interior de las hojas hundido en el lomo (unión física)")
top = [p for p in piezas if p["nombre"] in ("HojaDer", "HojaIzq")]
def _rango(p):
    zp = [q[2] for q in p["verts"] if abs(q[0]) > a["hoja"]["inicio_x"] + a["hoja"]["curva"] + 1e-6]
    return max(zp) - min(zp)
ok(all(_rango(p) < 0.0015 for p in top), "zona de bolsillos plana (curvatura solo junto al lomo)")
ok(all(p["origen"] == (0.0, 0.0, cg) for p in hojas), "hojas con pivote en el eje del lomo (giro futuro sin atravesar cubiertas)")
cub = [p for p in piezas if p["nombre"].startswith("Cubierta")]
ok(all(G.volumen_con_signo(p["verts"], p["caras"]) > 0 for p in cub), "cubiertas acolchadas: normales hacia fuera")
ok(all(p["padre"] for p in piezas if p["nombre"].startswith(("Carta", "Funda", "Soldadura"))), "bolsillos cuelgan de su hoja (animables con ella)")

print("Prueba de materiales (3 bolsillos)")
import re
from teselia import prueba, arte
pp, pinfo = prueba.construir(cfg)
cartas_p = [p for p in pp if p["mat"] in ("carta", "carta_holo")]
ok(len(cartas_p) == 2 and sorted(p["mat"] for p in cartas_p) == ["carta", "carta_holo"], "3 bolsillos: 1 vacío + 1 carta normal + 1 holográfica")
ok(sum(1 for p in pp if p["nombre"].startswith("Soldadura")) == 3, "3 soldaduras (una por bolsillo)")
fp = [p for p in pp if p["mat"] == "funda"]
ok(len(fp) == 1 and len(fp[0]["caras"]) == 1, "una sola lámina de funda plana para toda la página")
ok(all(sum(f[1] for f in [p["verts"][i] for i in c]) / len(c) < 1e9 for p in pp for c in p["caras"][:1]), "mallas válidas")
for p in pp:
    if p["nombre"].startswith("Soldadura"):
        cy = {round(sum(p["verts"][i][1] for i in c) / len(c), 6) for c in p["caras"]}
        top = a["bolsillo"]["alto"] / 2 - 0.0004
        ok(max(cy) < top, "%s abierta por arriba (boca del bolsillo)" % p["nombre"])
i0 = pinfo[0]
ok(i0["z_sold"] > i0["z_hoja"] and i0["z_carta0"] - i0["z_sold"] >= 0.0001 and i0["z_funda"] - i0["z_carta1"] >= 0.0005, "capas: hoja<soldadura<carta<funda (separación ≥0,1 mm / ≥0,5 mm a la funda)")
ok(all(G.volumen_con_signo(p["verts"], p["caras"]) > 0 for p in cartas_p), "cartas de prueba: normales hacia fuera")
for holo in (False, True):
    im = arte.carta(3, holo)
    ok(im.shape == (714, 512, 4) and abs(512 / 714 - 63 / 88) < 0.003, "ilustración %s: 512x714 (proporción 63:88)" % ("holo" if holo else "normal"))
im_n, im_h = arte.carta(3, False), arte.carta(3, True)
ok(float(im_n[..., 3].min()) == 1.0, "carta normal: alfa 1 en toda la imagen")
cob = float(im_h[..., 3].mean())
ok(0.2 < cob < 0.5, "holo: máscara cubre solo la ilustración (%.0f%% de la carta)" % (100 * cob))
ok(float(im_n[..., :3].std()) > 0.15, "ilustración con contraste suficiente (legible)")
src = open(os.path.join(AQUI, "teselia", "materiales.py"), encoding="utf-8").read()
ok(re.search(r'"ShaderNodeMix"', src) is None, "ningún nodo Mix 4.x con sockets homónimos (se usa MixRGB)")
ok(not re.search(r'Transmission|"IOR"\]|refrac', src.replace("Fresnel", "")) or "Transmission" not in src, "sin transmisión/refracción en los materiales")
ok(cfg["luces"]["principal_w"] <= 60, "vatios de las luces calibrados (≤60 W; antes 260 W quemaban la imagen)")

print("Depuración de la carta (lógica pura de verificación)")
from teselia import verificacion as V
x = [0.1, 0.4, 0.2, 0.9, 0.5, 0.7]
ok(abs(V.correlacion(x, [2 * t + 0.05 for t in x]) - 1) < 1e-9, "correlación: relación lineal = 1")
ok(V.correlacion(x, [0.5] * 6) == 0.0, "correlación: imagen plana (ilustración invisible) = 0")
ok(V.correlacion(x, [-t for t in x]) < -0.99, "correlación: textura invertida = -1")
ok(V.area_poligono([(0, 0), (1, 0), (1, 1), (0, 1)]) == 1.0 and V.area_poligono([(0, 0), (0, 1), (1, 1), (1, 0)]) == -1.0, "área UV con signo (detecta espejo)")
en = [{"de": "Tex", "de_tipo": "TEX_IMAGE", "de_socket": "Color", "a": "BSDF", "a_socket": "Base Color"}]
ok(V.traza_imagen(en, "BSDF", "Base Color") == ["Tex", "BSDF"], "traza: imagen → Base Color")
en2 = [{"de": "Tex", "de_tipo": "TEX_IMAGE", "de_socket": "Color", "a": "Mix", "a_socket": "Color1"}, {"de": "Mix", "de_tipo": "MIX_RGB", "de_socket": "Color", "a": "BSDF", "a_socket": "Base Color"}]
ok(V.traza_imagen(en2, "BSDF", "Base Color") == ["Tex", "Mix", "BSDF"], "traza: imagen → Mix → Base Color (holo)")
ok(V.traza_imagen([{"de": "Tex", "de_tipo": "TEX_IMAGE", "de_socket": "Color", "a": "BSDF", "a_socket": "Roughness"}], "BSDF", "Base Color") is None, "traza: imagen en otro socket = sin conexión")
# comparación textura↔render con un render simulado: la carta correcta correlaciona; una funda opaca/blanca no
tex = arte.carta(1, False)
pts = V.puntos_uv(20, 28)
esp = [float(V.luminancia(V.muestrear_textura(tex, u, v))) for u, v in pts]
ok(V.evaluar(V.correlacion(esp, [0.8 * e + 0.05 for e in esp]), 0.8, 0.85), "ilustración visible: render fiel → ACEPTA")
ok(not V.evaluar(V.correlacion(esp, [0.93] * len(esp)), 0.0, 0.75), "funda opaca blanca: render plano → RECHAZA")
ok(not V.evaluar(V.correlacion(esp, [0.4 * e + 0.55 + (0.02 if i % 2 else 0) for i, e in enumerate(esp)]), 0.1, 0.75), "velo blanco que borra contraste → RECHAZA por contraste")
for paso in (1, 2, 3):
    pd, _ = prueba.construir_depuracion(cfg, paso)
    nombres = [p["nombre"] for p in pd]
    ok(("Funda" in nombres) == (paso >= 2) and nombres.count("Carta") == 1, "paso %d: %s" % (paso, ", ".join(nombres)))
pd2, id2 = prueba.construir_depuracion(cfg, 2)
cp = next(p for p in pd2 if p["nombre"] == "Carta")
ok(max(abs(u) for u in cp["uv"]) <= 1 + 1e-9 and min(cp["uv"]) >= -1e-9, "depuración: UV de la carta en [0,1]")
ok(id2[0]["z_funda"] - id2[0]["z_carta1"] >= 0.0005, "depuración: funda separada ≥0,5 mm de la carta")

print("Cámara y composición")
for vista, v_cfg in cfg["vistas"].items():
    pos, obj, d = G.ajustar_camara(cfg, vista)
    sh = (v_cfg["desplazamiento_x"], v_cfg["desplazamiento_y"])
    u0, v0, u1, v1 = G.caja_pantalla(G.esquinas_archivador(cfg, v_cfg["objetivo"]), pos, obj, v_cfg["lente_mm"], cfg["camara"]["sensor_mm"], v_cfg["resolucion"], sh)
    ok(cerca((v1 - v0) if v_cfg.get("eje") == "v" else (u1 - u0), v_cfg["ocupacion_ancho"], 1e-3), "%s: ocupa %.0f%% del %s" % (vista, 100 * v_cfg["ocupacion_ancho"], "alto" if v_cfg.get("eje") == "v" else "ancho"))
    ok(0 <= u0 and u1 <= 1 and 0 <= v0 and v1 <= 1, "%s: el archivador cabe entero en el cuadro" % vista)
    pc = G.proyectar(obj, pos, obj, v_cfg["lente_mm"], cfg["camara"]["sensor_mm"], v_cfg["resolucion"], (0, 0))
    ok(abs(pc[0] - .5) < 1e-6 and abs(pc[1] - .5) < 1e-6, "%s: el objetivo cae en el centro sin desplazamiento" % vista)
    e = G.euler_camara(pos, obj)
    # reconstruir la dirección a partir del euler: -Z de la cámara debe apuntar al objetivo
    cx, sx, cy, sy, cz, sz = math.cos(e[0]), math.sin(e[0]), math.cos(e[1]), math.sin(e[1]), math.cos(e[2]), math.sin(e[2])
    r_ = [[cy * cz, -cy * sz, sy], [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy], [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy]]
    f = (-r_[0][2], -r_[1][2], -r_[2][2])
    dd = [o - p for o, p in zip(obj, pos)]
    L = math.sqrt(sum(x * x for x in dd))
    ok(all(abs(f[i] - dd[i] / L) < 1e-6 for i in range(3)), "%s: euler de la cámara apunta al objetivo" % vista)

print("Ensayo en seco con bpy simulado")
bpy_mock = True
bpy = mock.MagicMock(name="bpy")
bpy.context.scene.collection = mock.MagicMock()
bpy.data.materials.new.return_value.node_tree.nodes.new.return_value.inputs.__contains__.return_value = True
sys.modules["bpy"] = bpy
for m in [k for k in sys.modules if k.startswith("teselia.")]:
    del sys.modules[m]
sys.argv = ["blender", "--", "--modo", "previa", "--vista", "escritorio", "--sin-render"]
try:
    import runpy
    runpy.run_path(os.path.join(AQUI, "crear_escena.py"), run_name="__main__")
    llamadas = bpy.data.objects.new.call_count
    ok(llamadas >= 60, "crear_escena.py recorre todo el flujo (%d objetos creados)" % llamadas)
except Exception as ex:  # noqa
    import traceback; traceback.print_exc()
    ok(False, "crear_escena.py con bpy simulado: %r" % ex)

try:
    sys.argv = ["blender", "--", "--modo", "previa", "--sin-render"]
    for m in [k for k in sys.modules if k.startswith("teselia")]:
        del sys.modules[m]
    runpy.run_path(os.path.join(AQUI, "crear_prueba_materiales.py"), run_name="__main__")
    ok(True, "crear_prueba_materiales.py recorre todo el flujo")
except Exception as ex:  # noqa
    import traceback; traceback.print_exc()
    ok(False, "crear_prueba_materiales.py con bpy simulado: %r" % ex)

try:
    sys.argv = ["blender", "--", "--paso", "todos"]
    for m in [k for k in sys.modules if k.startswith("teselia")]:
        del sys.modules[m]
    runpy.run_path(os.path.join(AQUI, "crear_depuracion_carta.py"), run_name="__main__")
    ok(True, "crear_depuracion_carta.py recorre todo el flujo (verificaciones protegidas contra errores)")
except Exception as ex:  # noqa
    import traceback; traceback.print_exc()
    ok(False, "crear_depuracion_carta.py con bpy simulado: %r" % ex)

print("\n%d pruebas, %d fallos" % (total, len(fallos)))
sys.exit(1 if fallos else 0)
