# Álbum Teselia — prueba de concepto en Blender (Fase 3.4.2)

Escena independiente (no toca la app, la base de datos ni el catálogo). **Estos scripts no se han ejecutado en Blender
todavía** (mi entorno no lo tiene): lo que sí está comprobado sin Blender es la geometría, el encuadre y que el flujo de
Python no tiene errores (`python blender/pruebas_sin_blender.py`). El aspecto real del render hay que verlo en tu PC.

## v2 (corrección del primer render)
Causa de los "cristales/metal" en las fundas: las fundas eran losas finas con **sombreado suave sin biselar** (las normales de los
vértices del borde se promediaban a ~45° y se interpolaban por toda la cara plana, torciendo el reflejo) y un material
Glossy blanco + Fresnel que reflejaba la luz clave. Cambios: fundas = **una sola cara plana** con Principled casi transparente
(alfa 0,07, sin Glossy, sin refracción); canto redondeado de cubiertas/lomo construido en la malla (sin modificador Bisel) con
tapas de normal exacta; soldadura = marco plano; luz neutra (clave #FFE3C4, relleno frío, borde blanco), pared gris pizarra,
madera por tablones con veta larga; sin puntos ni taza; cámara 50 mm, f/9 (cartas nítidas).
`python blender/previsualizar_sin_blender.py [escritorio|movil]` genera `salida/previa_geometrica_*.png` (geometría y encuadre,
NO materiales ni luz: eso solo lo muestra Cycles).

## Qué construye
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
