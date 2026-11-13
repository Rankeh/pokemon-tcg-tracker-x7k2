"""
Fase 3.5 — Exportación a GLB DESDE BLENDER (camino "oficial" del flujo Blender -> web).
Reconstruye en Blender el MISMO árbol de nodos que escribe exportar_glb.py (misma fuente: teselia/modelo_web.py) y llama al
exportador glTF de Blender. Cada hoja, tapa y bolsillo queda como un objeto aparte (nada fusionado) con su pivote en el eje del lomo.

Uso (Windows, ver ejecutar_glb_windows.bat):
    blender -b -P blender/exportar_glb_blender.py -- --salida web/prueba-3d/modelo/album.glb [--hojas 6]

NOTA HONESTA: este script NO se ha podido ejecutar en el entorno donde se escribió (no hay Blender); se ha probado con un `bpy` simulado
que comprueba qué objetos, jerarquías, pivotes y llamadas de exportación genera. Si el exportador de tu versión de Blender rechaza algún
parámetro, el mensaje de error lo dirá; el GLB que usa la prueba web lo genera exportar_glb.py y ya está comprobado.

Conversión de ejes: el modelo está en coordenadas glTF (Y arriba). En Blender (Z arriba) un punto (x, y, z) pasa a (x, -z, y);
una rotación alrededor del eje Z de glTF es una rotación alrededor de -Y en Blender. El exportador (export_yup=True) deshace la conversión.
"""
import json
import math
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

import bpy  # noqa: E402

from teselia import geometria as G  # noqa: E402
from teselia import modelo_web  # noqa: E402


def a_blender(p):
    return (p[0], -p[2], p[1])


def args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    cfg = {"salida": os.path.join(os.path.dirname(AQUI), "web", "prueba-3d", "modelo", "album.glb"), "hojas": modelo_web.N_HOJAS_DEFECTO}
    i = 0
    while i < len(a):
        if a[i] == "--salida":
            cfg["salida"] = a[i + 1]; i += 2
        elif a[i] == "--hojas":
            cfg["hojas"] = int(a[i + 1]); i += 2
        else:
            i += 1
    return cfg


def limpiar():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)


def crear_materiales(lista):
    res = {}
    for m in lista:
        mat = bpy.data.materials.new(m["nombre"])
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        r, g, b = G.hex_a_lineal(m["color"])
        bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
        bsdf.inputs["Roughness"].default_value = m["rug"]
        bsdf.inputs["Metallic"].default_value = m["metal"]
        if m["alfa"] < 1.0:
            bsdf.inputs["Alpha"].default_value = m["alfa"]
            try:
                mat.blend_method = "BLEND"
            except Exception:
                pass
        res[m["nombre"]] = mat
    return res


def crear_malla(clave, malla, materiales):
    me = bpy.data.meshes.new(clave)
    me.from_pydata([a_blender(v) for v in malla.verts], [], [list(t) for t in malla.tris])
    me.update()
    uv = me.uv_layers.new(name="UVMap")
    for lazo in me.loops:
        uv.data[lazo.index].uv = malla.uvs[lazo.vertex_index]
    try:   # normales propias (las paredes redondeadas se ven suaves y las tapas planas, planas)
        me.normals_split_custom_set_from_vertices([a_blender(n) for n in malla.normales])
    except Exception as e:
        print("Aviso: normales propias no aplicadas (%s); se usarán las de Blender." % e)
    me.materials.append(materiales[malla.material])
    return me


def construir(modelo, mallas_bpy):
    objetos = []

    def crea(n, padre):
        obj = bpy.data.objects.new(n["nombre"], mallas_bpy[n["malla"]] if n["malla"] else None)
        bpy.context.scene.collection.objects.link(obj)
        if padre is not None:
            obj.parent = padre
        obj.location = a_blender(n["pos"])
        obj.rotation_mode = "XYZ"
        obj.rotation_euler = (0.0, -n["rotz"], 0.0)
        for k, v in n["extras"].items():
            obj[k] = v
        objetos.append(obj)
        for h in n["hijos"]:
            crea(h, obj)
        return obj

    return crea(modelo["raiz"], None), objetos


def exportar(ruta):
    os.makedirs(os.path.dirname(os.path.abspath(ruta)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=ruta, export_format="GLB", export_yup=True, export_extras=True, export_apply=False,
                              use_selection=False, export_cameras=False, export_lights=False, export_texcoords=True, export_normals=True)


def main():
    cfg = args()
    config = json.load(open(os.path.join(AQUI, "configuracion.json"), encoding="utf-8"))
    modelo = modelo_web.construir(config, cfg["hojas"])
    limpiar()
    mats = crear_materiales(modelo["materiales"])
    mallas = {k: crear_malla(k, m, mats) for k, m in modelo["mallas"].items()}
    raiz, objetos = construir(modelo, mallas)
    print("Objetos creados:", len(objetos), "· mallas únicas:", len(mallas))
    exportar(cfg["salida"])
    print("GLB exportado desde Blender:", cfg["salida"])


if __name__ == "__main__":
    main()
