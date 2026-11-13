# Álbum Teselia — prueba de concepto en Blender (Fase 3.4.2)

Escena independiente (no toca la app, la base de datos ni el catálogo). **Estos scripts no se han ejecutado en Blender
todavía** (mi entorno no lo tiene): lo que sí está comprobado sin Blender es la geometría, el encuadre y que el flujo de
Python no tiene errores (`python blender/pruebas_sin_blender.py`). El aspecto real del render hay que verlo en tu PC.

## v3 (Fase 3.4.3): álbum encuadernado sin anillas
Modelo nuevo (se ha eliminado todo lo metálico): cubiertas acolchadas azul noche con canto redondeado y costura, **lomo
continuo** redondeado y hojas **unidas al lomo**: cada hoja es una rejilla que desciende hacia el lomo (curvatura de la
encuadernación) y su borde interior queda hundido en él. 8 hojas a la derecha y 6 a la izquierda (cantos visibles), una hoja
visible por lado con 9 bolsillos. Cada bolsillo = hoja → marco de termosellado fino → carta (0,4 mm) → lámina de funda de
una sola cara con alfa bajo y un único reflejo diagonal suave (sin Glossy ni refracción). Escena neutra: solo un suelo.
Piezas independientes y con pivote en el eje del lomo (hojas), padres para bolsillos/costuras: preparado para animar.
Luces: principal cálida grande, secundaria fría tenue, dos luces de borde alargadas (cálida/fría) y fondo neutro.

Vistas: `escritorio` (álbum abierto, 16:9), `movil` (una página) y `detalle` (un bolsillo en primer plano):
`blender\ejecutar_windows.bat previa detalle` · `blender\ejecutar_windows.bat final escritorio`.
`python blender/previsualizar_sin_blender.py [escritorio|movil|detalle]` = vista geométrica (NO materiales ni luz).

## Qué construía la v1/v2 (obsoleto)
Archivador **abierto** sobre un atril de madera (inclinado 28°), en un escritorio de madera con pared al fondo:
cubiertas con grosor y bisel + costura, lomo, 3 anillas metálicas con placa, pilas de hojas, una hoja visible por lado con
9 bolsillos (soldadura + funda transparente), 14 cartas de prueba con diseños propios (9 a la derecha, 5 a la izquierda),
taza y caja de mazo como props mínimos, luces de fondo desenfocadas (bokeh) y 3 luces (principal cálida, relleno, borde).
Vista `escritorio`: dos páginas 16:9. Vista `movil`: una página, 1080×2340.

## Cómo ejecutarlo en Windows (Blender 4.2)
1. Instala Blender 4.2 LTS (gratis, blender.org). Ruta esperada: `C:\Program Files\Blender Foundation\Blender 4.2\blender.exe`.
2. Doble clic en `blender\ejecutar_windows.bat` (render de **previa**, rápido) o desde una consola:
   - `blender\ejecutar_windows.bat previa escritorio`
   - `blender\ejecutar_windows.bat final escritorio`  (1920×1080)
   - `blender\ejecutar_windows.bat final movil`
   - Si Blender está en otra ruta: `set BLENDER_EXE="D:\Ruta\blender.exe"` antes.
3. Resultados en `blender\salida\`: `teselia_<vista>_<modo>.png`, `teselia_poc.blend` (ábrelo para mirar/mover cosas),
   `camara_<vista>.json` y `registro_<vista>_<modo>.txt` (consola completa).
4. Compara con la web: abre `web/comparar-render.html` con Live Server (lado a lado o superpuesto).

Equivalente manual: `blender --background --python blender/crear_escena.py -- --modo previa --vista escritorio --guardar-blend`.
Opciones: `--sin-render`, `--exposicion 0.5` (más claro) / `-0.5` (más oscuro), `--config otro.json`.

## Tiempos orientativos (GTX 1650 4 GB, CUDA) — estimaciones, no medidas
previa 960×540 / 48 muestras: decenas de segundos · final 1920×1080 / 192: unos minutos · alta 3840×2160 / 384: bastante más.
La GTX 1650 no tiene núcleos RT, así que se usa CUDA (no OptiX). Si no detecta GPU, usa la CPU (más lento).

## Qué ajustar sin tocar código
Todo está en `configuracion.json` (medidas en metros, colores, cámara, luces, calidad). Si el render sale oscuro/claro,
usa `--exposicion`. Si algo falla, el `registro_*.txt` lista los avisos `[teselia] AVISO` (por ejemplo un nombre de
socket que cambie en tu versión) — pégamelo y lo corrijo.

## Estructura
`crear_escena.py` (entrada) · `teselia/geometria.py` (pura, probada) · `modelos.py` · `materiales.py` ·
`luces_camara.py` · `render.py` · `verificar_composicion.py` · `pruebas_sin_blender.py`.
