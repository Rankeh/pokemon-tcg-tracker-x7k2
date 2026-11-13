"""Fase 3.5 — Pruebas del modelo web y del GLB (Python puro) + ensayo en seco del exportador de Blender con bpy simulado.
Uso:  python blender/pruebas_glb.py"""
import json, math, os, struct, sys
from unittest import mock

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from teselia import glb, modelo_web as MW  # noqa: E402

total, fallos = 0, []
def ok(c, msg):
    global total
    total += 1
    print(("  ok  " if c else "  FALLO ") + msg)
    if not c: fallos.append(msg)

cfg = json.load(open(os.path.join(AQUI, "configuracion.json"), encoding="utf-8"))
modelo = MW.construir(cfg)
datos = glb.a_bytes(modelo)
js, bn = glb.leer(datos)
nodos = js["nodes"]
demo = MW.construir(cfg, relleno=0.72)                       # con cartas horneadas: solo para comprobar la forma de una carta dentro de su bolsillo
jsd, _ = glb.leer(glb.a_bytes(demo))
nodos_d = jsd["nodes"]

print("Estructura GLB")
ok(datos == glb.a_bytes(MW.construir(cfg)), "generación determinista (mismos bytes)")
ok(len(datos) % 4 == 0 and js["asset"]["version"] == "2.0", "cabecera y alineación")
ok(js["buffers"][0]["byteLength"] == len(bn), "longitud del buffer coincide")
for a in js["accessors"]:
    v = js["bufferViews"][a["bufferView"]]
    tam = {5126: 4, 5123: 2, 5125: 4}[a["componentType"]] * {"VEC3": 3, "VEC2": 2, "SCALAR": 1}[a["type"]] * a["count"]
    if tam != v["byteLength"] or v["byteOffset"] + v["byteLength"] > len(bn):
        ok(False, "accesor fuera de rango"); break
else:
    ok(True, "todos los accesores caben en su bufferView y en el buffer")
nombres = [n["name"] for n in nodos]
ok(len(set(nombres)) == len(nombres), "nombres de nodo únicos (%d nodos)" % len(nombres))

print("Separación de elementos animables")
hojas = [n for n in nodos if n.get("extras", {}).get("tipo") == "hoja"]
ok(len(hojas) == 9 and "Tapa" in nombres and "Lomo" in nombres and "Contratapa" in nombres, "6 hojas + Tapa + Lomo + Contratapa como nodos distintos")
ok(all("mesh" not in n for n in hojas) and "mesh" not in nodos[nombres.index("Tapa")], "los pivotes de hoja/tapa no llevan malla (giran sin deformar nada)")
mallas = js["meshes"]
maxtri = max(js["accessors"][m["primitives"][0]["indices"]]["count"] // 3 for m in mallas)
ok(maxtri < 2500, "ninguna malla fusiona el álbum (máx. %d triángulos por malla; 3.7.6: tapas y lomo biselados ya no son de ~300)" % maxtri)
bols = [n for n in nodos if n.get("extras", {}).get("tipo") == "bolsillo"]
cartas = [n for n in nodos if n.get("extras", {}).get("tipo") == "carta"]
plant = [n for n in nodos if n.get("extras", {}).get("tipo") == "plantilla"]
ok(len(bols) == 162, "162 nodos-bolsillo (9 hojas × 2 caras × 9 = 18 páginas)")
ok(len(cartas) == 0 and len(plant) == 2 and all("mesh" in n for n in plant), "el GLB real no hornea cartas: solo 2 plantillas de geometría (F y D) que el JS reutiliza")
cartas_d = [n for n in nodos_d if n.get("extras", {}).get("tipo") == "carta"]
bols_d = [n for n in nodos_d if n.get("extras", {}).get("tipo") == "bolsillo"]
ok(0 < len(cartas_d) < len(bols_d), "(modelo de vista previa) hay bolsillos ocupados (%d) y vacíos (%d)" % (len(cartas_d), len(bols_d) - len(cartas_d)))
ok(len({c["mesh"] for c in cartas_d if "_F_" in c["name"]}) == 1 and len({c["mesh"] for c in cartas_d if "_D_" in c["name"]}) == 1, "(vista previa) todas las cartas comparten una malla por cara")
hijos_de = {}
for i, n in enumerate(nodos_d):
    for h in n.get("children", []): hijos_de[h] = i
ok(all(nodos_d[hijos_de[nodos_d.index(c)]]["extras"]["tipo"] == "bolsillo" for c in cartas_d), "(vista previa) cada carta es hija de un bolsillo")
ok(sum(1 for m in js["materials"] if m["name"] == "Carta") == 1, "un único material 'Carta' en el GLB (sin imagen: la pone el JS)")

print("Geometría")
def mallas_np():
    import numpy as np
    res = {}
    for m in mallas:
        pr = m["primitives"][0]
        def acc(i):
            a = js["accessors"][i]; v = js["bufferViews"][a["bufferView"]]
            dt = {5126: "<f4", 5123: "<u2", 5125: "<u4"}[a["componentType"]]
            nc = {"VEC3": 3, "VEC2": 2, "SCALAR": 1}[a["type"]]
            return np.frombuffer(bn, dtype=dt, count=a["count"] * nc, offset=v["byteOffset"]).reshape(-1, nc).astype(float)
        res[m["name"]] = (acc(pr["attributes"]["POSITION"]), acc(pr["attributes"]["NORMAL"]), acc(pr["attributes"]["TEXCOORD_0"]), acc(pr["indices"]).astype(int).reshape(-1, 3))
    return res
import numpy as np
M = mallas_np()
bien = tot = 0
for k, (p, n, uv, t) in M.items():
    gn = np.cross(p[t[:, 1]] - p[t[:, 0]], p[t[:, 2]] - p[t[:, 0]])
    vn = n[t].sum(1)
    d = (gn * vn).sum(1)
    bien += int((d > 0).sum()); tot += len(t)
ok(bien == tot, "el devanado de TODOS los triángulos concuerda con sus normales (%d/%d)" % (bien, tot))
ok(all(abs(np.linalg.norm(v[1], axis=1) - 1).max() < 1e-5 for v in M.values()), "normales unitarias")
ok(all(t.max() < len(p) for p, _, _, t in M.values()), "índices dentro de rango")
pf, _, uvf, _ = M["carta_f"]; pd, _, uvd, _ = M["carta_d"]
ok(np.corrcoef(pf[:, 0], uvf[:, 0])[0, 1] > 0.99 and np.corrcoef(pd[:, 0], uvd[:, 0])[0, 1] < -0.99, "UV: u crece con x en el frente y decrece en el dorso (se lee bien tras girar)")
ok(np.corrcoef(pf[:, 2], uvf[:, 1])[0, 1] > 0.99 and np.corrcoef(pd[:, 2], uvd[:, 1])[0, 1] > 0.99, "UV: v crece hacia quien mira (arriba de la carta al fondo) en ambas caras")
ok(uvf.min() >= 0 and uvf.max() <= 1 and uvd.min() >= 0 and uvd.max() <= 1, "UV dentro de [0,1]")
p = modelo["parametros"]; W, H = p["ancho_hoja"], p["alto_hoja"]
dentro = True
for n in bols:
    t = n["translation"]
    dentro &= 0 < t[0] - p["ancho_carta"] / 2 and t[0] + p["ancho_carta"] / 2 < W and abs(t[2]) + p["alto_carta"] / 2 < H / 2
ok(dentro, "todos los bolsillos caben dentro de la hoja")
ok(MW.SEP_FUNDA + p["grosor_hoja"] / 2 < MW.PASO - p["grosor_hoja"] / 2 - 0.0005, "funda y carta no tocan la hoja de encima (separación entre hojas suficiente)")
ok(MW.ALTO_CARTA < MW.SEP_FUNDA, "la funda queda sobre la carta")
est = MW.contar(modelo)
ok(est["triangulos_instanciados"] < 30000, "ligero (3.7.6, presupuesto para iPhone): %d triángulos instanciados, %d únicos" % (est["triangulos_instanciados"], est["triangulos_unicos"]))

print("Exportador de Blender (bpy simulado)")
bpy = mock.MagicMock(name="bpy")
bpy.data.objects.__iter__.return_value = iter([]); bpy.data.meshes.__iter__.return_value = iter([])
sys.modules["bpy"] = bpy
sys.argv = ["blender", "--", "--salida", os.path.join(AQUI, "salida", "_prueba.glb")]
import runpy
try:
    runpy.run_path(os.path.join(AQUI, "exportar_glb_blender.py"), run_name="__main__")
    ok(bpy.data.objects.new.call_count == len(nodos), "crea un objeto de Blender por nodo (%d)" % bpy.data.objects.new.call_count)
    ok(bpy.data.meshes.new.call_count == len(modelo["mallas"]), "una malla de Blender por malla compartida")
    kw = bpy.ops.export_scene.gltf.call_args.kwargs
    ok(kw["export_format"] == "GLB" and kw["export_yup"] and kw["export_extras"], "llama al exportador glTF con GLB, Y arriba y extras")
except Exception as ex:
    import traceback; traceback.print_exc(); ok(False, "exportar_glb_blender.py con bpy simulado: %r" % ex)

print("\n%d pruebas, %d fallos" % (total, len(fallos)))
sys.exit(1 if fallos else 0)
