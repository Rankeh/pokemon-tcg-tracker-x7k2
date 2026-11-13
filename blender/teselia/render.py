"""Configuración de Cycles (GPU CUDA si existe, si no CPU) y render."""
import bpy
from .utilidades import aviso


def configurar_dispositivo(scene):
    prefs = bpy.context.preferences.addons["cycles"].preferences
    usado = "CPU"
    for tipo in ("CUDA", "OPTIX", "HIP", "METAL"):
        try:
            prefs.compute_device_type = tipo
        except (TypeError, ValueError):
            continue
        try:
            prefs.refresh_devices()
        except AttributeError:
            prefs.get_devices()
        activos = 0
        for d in prefs.devices:
            d.use = d.type == tipo
            activos += 1 if d.use else 0
        if activos:
            usado = tipo
            break
    scene.cycles.device = "GPU" if usado != "CPU" else "CPU"
    print("[teselia] dispositivo de render:", usado)
    return usado


def configurar(cfg, vista, modo):
    scene = bpy.context.scene
    q = cfg["calidad"][modo]
    w, h = cfg["vistas"][vista]["resolucion"]
    scene.render.engine = "CYCLES"
    scene.render.resolution_x = int(w * q["escala"])
    scene.render.resolution_y = int(h * q["escala"])
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "16" if modo == "alta" else "8"
    c = scene.cycles
    c.samples = q["muestras"]
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.02
    c.max_bounces = q["rebotes"]
    c.transparent_max_bounces = 12   # las fundas transparentes se cruzan muchas veces
    c.sample_clamp_indirect = 4.0   # solo recorta luciérnagas de rebotes; los reflejos directos no se tocan
    c.use_denoising = True
    try:
        c.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        aviso("OpenImageDenoise no disponible")
    configurar_dispositivo(scene)
    return scene


def renderizar(ruta):
    bpy.context.scene.render.filepath = ruta
    bpy.ops.render.render(write_still=True)


def luminancia_media(ruta):
    """Media de luminancia de pantalla (0-1) de un PNG ya renderizado."""
    img = bpy.data.images.load(ruta)
    try:
        px = img.pixels[:]
    finally:
        bpy.data.images.remove(img)
    n = len(px) // 4
    paso = max(1, n // 20000)
    tot = 0.0
    cnt = 0
    for i in range(0, n, paso):
        r, g, b = px[4 * i], px[4 * i + 1], px[4 * i + 2]
        tot += 0.2126 * r + 0.7152 * g + 0.0722 * b
        cnt += 1
    return tot / max(cnt, 1)


def autoexposicion(cfg, vista, objetivo, ruta_tmp, pasadas=3):
    """Calibra la exposición con renders diminutos (160 px, 12 muestras): ajusta EV hasta que la luminancia media de
    pantalla se acerque a 'objetivo'. Evita depender de mi estimación de vatios (la escala de vatios de Blender es confusa)."""
    import math
    scene = bpy.context.scene
    vs = scene.view_settings
    guardado = (scene.render.resolution_x, scene.render.resolution_y, scene.cycles.samples, scene.cycles.use_denoising)
    w, h = cfg["vistas"][vista]["resolucion"]
    scene.render.resolution_x, scene.render.resolution_y = 160, max(int(160 * h / w), 90)
    scene.cycles.samples, scene.cycles.use_denoising = 12, False
    lin = lambda c: ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92
    ev = vs.exposure
    for i in range(pasadas):
        scene.render.filepath = ruta_tmp
        bpy.ops.render.render(write_still=True)
        m = luminancia_media(ruta_tmp)
        print("[teselia] autoexposición paso %d: luminancia %.3f (objetivo %.2f) EV %.2f" % (i + 1, m, objetivo, ev))
        if m < 1e-4:
            ev += 3.0
        else:
            ev += max(-4.0, min(4.0, math.log2(max(lin(objetivo), 1e-4) / max(lin(m), 1e-4))))
        ev = max(-8.0, min(8.0, ev))
        vs.exposure = ev
        if abs(m - objetivo) < 0.03:
            break
    scene.render.resolution_x, scene.render.resolution_y, scene.cycles.samples, scene.cycles.use_denoising = guardado
    print("[teselia] exposición final: %.2f EV" % vs.exposure)
    return ev
