"""
Escritor GLB (glTF 2.0 binario) en Python puro, sin dependencias. Recibe el modelo de modelo_web.py.
Cada nodo del árbol pasa a ser un nodo glTF con nombre; las mallas se escriben UNA vez y se reutilizan
(la carta, la funda, etc. son la misma malla referenciada por muchos nodos). Los 'extras' viajan en cada nodo.
"""
import json
import math
import struct

from . import geometria as G


def _alinear(b, relleno=b"\x00"):
    return b + relleno * ((-len(b)) % 4)


def construir_gltf(modelo):
    mats = modelo["materiales"]
    indice_mat = {m["nombre"]: i for i, m in enumerate(mats)}
    gltf = {"asset": {"version": "2.0", "generator": "teselia/glb.py (Fase 3.5)"}, "scene": 0,
            "scenes": [{"nodes": [0]}], "nodes": [], "meshes": [], "materials": [], "accessors": [], "bufferViews": [],
            "buffers": [{"byteLength": 0}]}
    for m in mats:
        r, g, b = (G.srgb_a_lineal(c) for c in G.hex_a_rgb(m["color"]))
        mat = {"name": m["nombre"], "pbrMetallicRoughness": {"baseColorFactor": [r, g, b, m["alfa"]],
                                                              "metallicFactor": m["metal"], "roughnessFactor": m["rug"]}}
        if m["alfa"] < 1.0:
            mat["alphaMode"] = "BLEND"
        gltf["materials"].append(mat)

    binario = bytearray()

    def vista(datos, destino):
        off = len(binario)
        binario.extend(datos)
        binario.extend(b"\x00" * ((-len(binario)) % 4))
        gltf["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": len(datos), "target": destino})
        return len(gltf["bufferViews"]) - 1

    def accesor(vista_i, tipo_comp, cuenta, tipo, minimo=None, maximo=None):
        a = {"bufferView": vista_i, "componentType": tipo_comp, "count": cuenta, "type": tipo}
        if minimo is not None:
            a["min"], a["max"] = minimo, maximo
        gltf["accessors"].append(a)
        return len(gltf["accessors"]) - 1

    indice_malla = {}
    for clave, m in modelo["mallas"].items():
        n = len(m.verts)
        pos = b"".join(struct.pack("<3f", *v) for v in m.verts)
        nor = b"".join(struct.pack("<3f", *v) for v in m.normales)
        uvs = b"".join(struct.pack("<2f", *v) for v in m.uvs)
        grande = n > 65535
        idx = b"".join(struct.pack("<3I" if grande else "<3H", *t) for t in m.tris)
        mn = [min(v[i] for v in m.verts) for i in range(3)]
        mx = [max(v[i] for v in m.verts) for i in range(3)]
        a_pos = accesor(vista(pos, 34962), 5126, n, "VEC3", mn, mx)
        a_nor = accesor(vista(nor, 34962), 5126, n, "VEC3")
        a_uv = accesor(vista(uvs, 34962), 5126, n, "VEC2")
        a_idx = accesor(vista(idx, 34963), 5125 if grande else 5123, len(m.tris) * 3, "SCALAR")
        gltf["meshes"].append({"name": clave, "primitives": [{"attributes": {"POSITION": a_pos, "NORMAL": a_nor, "TEXCOORD_0": a_uv},
                                                              "indices": a_idx, "material": indice_mat[m.material], "mode": 4}]})
        indice_malla[clave] = len(gltf["meshes"]) - 1

    def agrega(n):
        i = len(gltf["nodes"])
        d = {"name": n["nombre"]}
        if any(abs(c) > 1e-12 for c in n["pos"]):
            d["translation"] = [round(c, 7) for c in n["pos"]]
        if abs(n["rotz"]) > 1e-12:
            d["rotation"] = [0.0, 0.0, math.sin(n["rotz"] / 2), math.cos(n["rotz"] / 2)]
        if n["malla"]:
            d["mesh"] = indice_malla[n["malla"]]
        if n["extras"]:
            d["extras"] = n["extras"]
        gltf["nodes"].append(d)
        hijos = [agrega(h) for h in n["hijos"]]
        if hijos:
            d["children"] = hijos
        return i

    agrega(modelo["raiz"])
    gltf["buffers"][0]["byteLength"] = len(binario)
    return gltf, bytes(binario)


def a_bytes(modelo):
    gltf, binario = construir_gltf(modelo)
    js = _alinear(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    bn = _alinear(binario)
    total = 12 + 8 + len(js) + 8 + len(bn)
    return (struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(js), b"JSON") + js
            + struct.pack("<I4s", len(bn), b"BIN\x00") + bn)


def leer(ruta_o_bytes):
    """Lee un GLB y devuelve (json, bin). Sirve para las pruebas de estructura."""
    datos = open(ruta_o_bytes, "rb").read() if isinstance(ruta_o_bytes, str) else ruta_o_bytes
    magia, version, total = struct.unpack_from("<4sII", datos, 0)
    assert magia == b"glTF" and version == 2 and total == len(datos), "cabecera GLB inválida"
    off, js, bn = 12, None, b""
    while off < total:
        ln, tipo = struct.unpack_from("<I4s", datos, off)
        cuerpo = datos[off + 8: off + 8 + ln]
        if tipo == b"JSON":
            js = json.loads(cuerpo.decode("utf-8"))
        elif tipo.startswith(b"BIN"):
            bn = cuerpo
        off += 8 + ln
    return js, bn
