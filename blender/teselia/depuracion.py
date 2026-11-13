"""Verificaciones con Blender (bpy) para la depuración de la carta: objeto, visibilidad, material, nodos, UV, normales,
oclusión (ray_cast) y comparación píxel a píxel del render con la textura. Cada comprobación se registra con
[verif] OK/FALLA y NUNCA aborta el render (un error al verificar se registra como ERROR)."""
import json
import bpy
import numpy as np
from . import verificacion as V, geometria as G


class Registro:
    def __init__(self):
        self.lineas, self.resultados = [], {}

    def dato(self, clave, valor):
        print("[verif] %-34s %s" % (clave, valor))
        self.lineas.append((clave, valor))

    def check(self, clave, ok, detalle=""):
        self.resultados[clave] = bool(ok)
        print("[verif] %-34s %s %s" % (clave, "OK   " if ok else "FALLA", detalle))
        self.lineas.append((clave, "OK" if ok else "FALLA", detalle))

    def seguro(self, nombre, fn):
        try:
            return fn()
        except Exception as ex:  # noqa
            print("[verif] %-34s ERROR de verificación: %r" % (nombre, ex))
            self.resultados[nombre] = False
            return None


def _px(img):
    n = len(img.pixels)
    a = np.empty(n, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def objeto_y_visibilidad(R, ob, scn):
    R.check("objeto existe", ob.name in bpy.data.objects and ob.name in scn.objects, ob.name)
    R.dato("tipo / vértices / caras", "%s / %d / %d" % (ob.type, len(ob.data.vertices), len(ob.data.polygons)))
    R.dato("hide_render / hide_viewport", "%s / %s" % (ob.hide_render, ob.hide_viewport))
    R.dato("visible_get (view layer)", ob.visible_get())
    vis = {k: getattr(ob, k, None) for k in ("visible_camera", "visible_diffuse", "visible_glossy", "visible_shadow")}
    R.dato("visibilidad Cycles", vis)
    R.dato("colecciones (hide_render)", [(c.name, c.hide_render) for c in ob.users_collection])
    R.check("visible para cámara y render", (not ob.hide_render) and ob.visible_get() and vis["visible_camera"] is not False and all(not c.hide_render for c in ob.users_collection))
    R.dato("escala / ubicación mundo", "%s / %s" % (tuple(round(x, 4) for x in ob.matrix_world.to_scale()), tuple(round(x, 4) for x in ob.matrix_world.translation)))


def material_y_nodos(R, ob, esperada_holo=False):
    slots = [s.material for s in ob.material_slots]
    R.dato("slots de material", [m.name if m else None for m in slots])
    R.check("material asignado", len(slots) == 1 and slots[0] is not None and slots[0].use_nodes)
    nt = slots[0].node_tree
    R.dato("nodos", [(n.name, n.type) for n in nt.nodes])
    enlaces = [{"de": l.from_node.name, "de_tipo": l.from_node.type, "de_socket": l.from_socket.name,
                "a": l.to_node.name, "a_tipo": l.to_node.type, "a_socket": l.to_socket.name} for l in nt.links]
    for e in enlaces:
        R.dato("enlace", "%(de)s[%(de_tipo)s].%(de_socket)s -> %(a)s.%(a_socket)s" % e)
    tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None)
    R.check("hay nodo Image Texture", tex is not None)
    prin = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    camino = V.traza_imagen(enlaces, prin.name, "Base Color") if prin else None
    R.check("imagen conectada a Base Color", camino is not None, " -> ".join(camino) if camino else "SIN CONEXIÓN")
    salida_ok = any(e["de_tipo"] == "BSDF_PRINCIPLED" and e["a_tipo"] == "OUTPUT_MATERIAL" and e["a_socket"] == "Surface" for e in enlaces)
    R.check("shader conectado a Material Output", salida_ok)
    vec = next((e for e in enlaces if e["a"] == tex.name and e["a_socket"] == "Vector"), None) if tex else None
    R.check("Image Texture usa coordenadas UV", vec is not None and vec["de_socket"] == "UV", str(vec and (vec["de"], vec["de_socket"])))
    if prin:
        R.dato("Principled", {k: (round(prin.inputs[k].default_value, 3) if hasattr(prin.inputs[k].default_value, "__float__") else tuple(round(x, 3) for x in prin.inputs[k].default_value))
                              for k in ("Roughness", "Metallic", "Alpha") if k in prin.inputs})
        R.check("Alpha del shader = 1 (sin transparencia en la carta)", abs(prin.inputs["Alpha"].default_value - 1.0) < 1e-6 and not prin.inputs["Alpha"].is_linked)
    img = tex.image if tex else None
    R.check("textura asignada al nodo", img is not None)
    if img is not None:
        a = _px(img)
        R.dato("imagen", "%s %s fuente=%s has_data=%s empaquetada=%s espacio=%s alfa_modo=%s" % (img.name, tuple(img.size), img.source, img.has_data, img.packed_file is not None, img.colorspace_settings.name, img.alpha_mode))
        R.dato("imagen ruta", img.filepath)
        R.dato("píxeles RGB media/desv", "%s / %s" % (tuple(np.round(a[..., :3].mean((0, 1)), 3)), tuple(np.round(a[..., :3].std((0, 1)), 3))))
        R.dato("píxeles alfa min/media", "%.3f / %.3f" % (a[..., 3].min(), a[..., 3].mean()))
        R.check("la imagen contiene datos con contraste", img.has_data and float(a[..., :3].std()) > 0.15)
    return img


def uv_y_normales(R, ob, cam, esperada_ancho, esperada_alto):
    me = ob.data
    capa = me.uv_layers.active
    R.check("existe capa UV activa", capa is not None, capa.name if capa else "")
    uv = np.empty(len(me.loops) * 2, np.float32)
    capa.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    R.dato("bucles / UV", "%d / %d" % (len(me.loops), len(uv)))
    R.dato("UV mín/máx", "u[%.3f..%.3f] v[%.3f..%.3f]" % (uv[:, 0].min(), uv[:, 0].max(), uv[:, 1].min(), uv[:, 1].max()))
    R.check("UV finitas y dentro de [0,1]", bool(np.isfinite(uv).all() and uv.min() >= -1e-4 and uv.max() <= 1 + 1e-4))
    mw = ob.matrix_world
    cara = max(me.polygons, key=lambda p: (mw.to_3x3() @ p.normal).z)           # cara más "hacia arriba"
    pts = [tuple(uv[l]) for l in range(cara.loop_start, cara.loop_start + cara.loop_total)]
    area = V.area_poligono(pts)
    R.dato("cara ilustrada", "índice %d, %d vértices, área UV con signo %.3f" % (cara.index, cara.loop_total, area))
    R.check("UV de la cara ilustrada cubren la imagen", area > 0.85, "área %.3f (esperado ≈ 1, positiva = sin espejo)" % area)
    n_mundo = (mw.to_3x3() @ cara.normal).normalized()
    c_mundo = mw @ cara.center
    hacia_cam = (cam.matrix_world.translation - c_mundo).normalized()
    R.dato("normal mundo de la cara", tuple(round(x, 3) for x in n_mundo))
    R.check("cara ilustrada orientada hacia la cámara", n_mundo.dot(hacia_cam) > 0.5, "dot(normal, hacia cámara) = %.3f" % n_mundo.dot(hacia_cam))
    R.dato("caras con normal hacia arriba / abajo", "%d / %d" % (sum(1 for p in me.polygons if (mw.to_3x3() @ p.normal).z > 0.5), sum(1 for p in me.polygons if (mw.to_3x3() @ p.normal).z < -0.5)))
    return cara, c_mundo


def oclusion(R, scn, cam, ob, c_mundo, con_funda):
    dg = bpy.context.evaluated_depsgraph_get()
    o = cam.matrix_world.translation
    d = (c_mundo - o).normalized()
    ok, loc, nor, idx, hit, _m = scn.ray_cast(dg, o, d)
    R.dato("rayo cámara→centro de la carta, 1.er impacto", "%s en %s" % (hit.name if hit else None, tuple(round(x, 4) for x in loc) if ok else None))
    if not con_funda:
        R.check("nada opaco delante de la carta", ok and hit.name == ob.name, "primer impacto: %s" % (hit.name if hit else None))
    else:
        R.check("delante de la carta solo está la funda", ok and hit.name == "Funda", "primer impacto: %s" % (hit.name if hit else None))
        ok2, loc2, _n, _i, hit2, _m2 = scn.ray_cast(dg, loc + d * 1e-5, d)
        R.check("tras la funda el siguiente objeto es la carta", ok2 and hit2.name == ob.name, "segundo impacto: %s" % (hit2.name if hit2 else None))


def comparar_render(R, scn, cam, ob, cara, ruta_png, textura_rgba, umbral, etiqueta):
    """Compara los píxeles renderizados con la textura en una rejilla de puntos de la cara ilustrada."""
    from bpy_extras.object_utils import world_to_camera_view
    img = bpy.data.images.load(ruta_png)
    img.colorspace_settings.name = "Non-Color"        # valores tal cual están en el PNG (sin conversión de espacio de color)
    try:
        r = _px(img)
    finally:
        bpy.data.images.remove(img)
    H, W = r.shape[:2]
    me, mw = ob.data, ob.matrix_world
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    zc = cara.center.z
    esperado, obtenido, tabla = [], [], []
    for (u, v) in V.puntos_uv():
        p = mw @ type(cara.center)((x0 + (x1 - x0) * u, y0 + (y1 - y0) * v, zc))
        c = world_to_camera_view(scn, cam, p)
        px, py = int(c.x * W), int(c.y * H)
        if not (0 <= px < W and 0 <= py < H):
            continue
        rgb = r[py, px, :3]
        exp = V.muestrear_textura(textura_rgba, u, v)
        esperado.append(float(V.luminancia(exp))); obtenido.append(float(V.luminancia(rgb)))
        if len(tabla) < 6 and (len(esperado) % 97 == 0):
            tabla.append((round(u, 2), round(v, 2), tuple(np.round(exp, 2)), tuple(np.round(rgb, 2))))
    corr = V.correlacion(esperado, obtenido)
    contraste = float(np.std(obtenido) / max(np.std(esperado), 1e-9))
    sat = float(np.mean(np.array(obtenido) > 0.98)) if obtenido else 1.0
    R.dato("[%s] muestras comparadas" % etiqueta, len(esperado))
    R.dato("[%s] ejemplos (u,v,esperado RGB,render RGB)" % etiqueta, tabla)
    R.dato("[%s] correlación textura↔render" % etiqueta, "%.3f (umbral %.2f)" % (corr, umbral))
    R.dato("[%s] contraste render/textura" % etiqueta, "%.3f (mín %.2f)" % (contraste, V.UMBRALES["contraste_min"]))
    R.dato("[%s] píxeles saturados" % etiqueta, "%.1f%% (máx %.0f%%)" % (100 * sat, 100 * V.UMBRALES["saturados_max"]))
    R.dato("[%s] luminancia media de la carta" % etiqueta, "%.3f" % (np.mean(obtenido) if obtenido else -1))
    ok = V.evaluar(corr, contraste, umbral) and sat <= V.UMBRALES["saturados_max"]
    R.check("ILUSTRACIÓN VISIBLE (%s)" % etiqueta, ok, "corr=%.3f contraste=%.2f saturados=%.1f%%" % (corr, contraste, 100 * sat))
    return dict(corr=corr, contraste=contraste, saturados=sat, ok=ok)


def guardar(R, ruta):
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump({"resultados": R.resultados, "lineas": [list(map(str, l)) for l in R.lineas]}, f, indent=2, ensure_ascii=False)
