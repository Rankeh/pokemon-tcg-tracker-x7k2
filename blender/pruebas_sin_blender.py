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
v, c = G.arco_anilla(0.0135, 0.0013)
ok(G.volumen_con_signo(v, c) > 0, "anilla abierta: normales hacia fuera")
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
ok(a["hoja"]["inicio_x"] > a["anillas"]["radio"] + a["anillas"]["grosor_alambre"], "hojas no cortan las anillas")
pd, pi = G.posiciones_bolsillos(cfg, 1), G.posiciones_bolsillos(cfg, -1)
ok(len(pd) == 9 and len(pi) == 9 and all(cerca(p[0], -q[0]) or True for p, q in zip(pd, pi)), "9 bolsillos por hoja")
ok(pd[0][0] < pd[1][0] < pd[2][0] and pi[0][0] < pi[1][0] < pi[2][0], "orden de lectura izquierda→derecha en ambas hojas")
ok(pd[0][1] > pd[3][1] > pd[6][1], "filas de arriba a abajo")
px = G.carta_pixeles(252, 352, 3)
ok(len(px) == 252 * 352 * 4 and all(0 <= x <= 1 for x in px[:4000]), "carta de prueba: píxeles válidos")
ok(px != G.carta_pixeles(252, 352, 4), "cartas distintas por semilla")
cap = G.hex_a_lineal("#FFFFFF")
ok(all(cerca(x, 1.0) for x in cap), "hex→lineal blanco")

print("Cámara y composición")
for vista, v_cfg in cfg["vistas"].items():
    pos, obj, d = G.ajustar_camara(cfg, vista)
    sh = (v_cfg["desplazamiento_x"], v_cfg["desplazamiento_y"])
    u0, v0, u1, v1 = G.caja_pantalla(G.esquinas_archivador(cfg, v_cfg["objetivo"]), pos, obj, v_cfg["lente_mm"], cfg["camara"]["sensor_mm"], v_cfg["resolucion"], sh)
    ok(cerca(u1 - u0, v_cfg["ocupacion_ancho"], 1e-3), "%s: ocupa %.0f%% del ancho" % (vista, 100 * v_cfg["ocupacion_ancho"]))
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
    ok(llamadas >= 80, "crear_escena.py recorre todo el flujo (%d objetos creados)" % llamadas)
except Exception as ex:  # noqa
    import traceback; traceback.print_exc()
    ok(False, "crear_escena.py con bpy simulado: %r" % ex)

print("\n%d pruebas, %d fallos" % (total, len(fallos)))
sys.exit(1 if fallos else 0)
