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
