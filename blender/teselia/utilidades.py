"""Ayudas de Blender (bpy). Pensado para Blender 4.2 LTS; los nombres de sockets que cambian entre versiones
se buscan con varios alias y, si no existen, solo se avisa (la escena sigue construyéndose)."""
import bpy


def aviso(msg):
    print("[teselia] AVISO:", msg)


def limpiar_escena():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def malla(nombre, verts, caras, coleccion=None, suave=True):
    """Crea un objeto desde (verts, caras) y lo enlaza a la colección."""
    me = bpy.data.meshes.new(nombre)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(c) for c in caras])
    me.update()
    if suave:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(nombre, me)
    (coleccion or bpy.context.scene.collection).objects.link(ob)
    return ob


def poner_uv(ob, uv_plano):
    capa = ob.data.uv_layers.new(name="UVMap")
    capa.data.foreach_set("uv", uv_plano)


def bisel(ob, ancho, segmentos=3, angulo_grados=35):
    """Modificador Bisel; 'harden_normals' mantiene planas las caras grandes aunque estén suavizadas."""
    m = ob.modifiers.new("Bisel", "BEVEL")
    m.width = ancho
    m.segments = segmentos
    m.limit_method = "ANGLE"
    m.angle_limit = angulo_grados * 3.14159265 / 180
    try:
        m.harden_normals = True
    except AttributeError:
        aviso("Bisel sin harden_normals en esta versión")
    return m


def fijar(nodo, nombres, valor):
    """Asigna default_value probando varios nombres de socket (cambian entre versiones de Blender)."""
    if isinstance(nombres, str):
        nombres = [nombres]
    for n in nombres:
        if n in nodo.inputs:
            nodo.inputs[n].default_value = valor
            return True
    aviso("socket no encontrado: %s en %s" % (nombres, getattr(nodo, "name", "?")))
    return False


def nuevo_material(nombre):
    mat = bpy.data.materials.new(nombre)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    return mat, nt


def nodo(nt, tipo, x=0, y=0, **props):
    n = nt.nodes.new(tipo)
    n.location = (x, y)
    for k, v in props.items():
        try:
            setattr(n, k, v)
        except (AttributeError, TypeError):
            aviso("propiedad %s no válida en %s" % (k, tipo))
    return n


def enlazar(nt, a, sal, b, ent):
    try:
        nt.links.new(a.outputs[sal], b.inputs[ent])
    except (KeyError, IndexError, TypeError):
        aviso("enlace imposible %s.%s -> %s.%s" % (getattr(a, "name", "?"), sal, getattr(b, "name", "?"), ent))


def asignar(ob, mat):
    ob.data.materials.append(mat)
