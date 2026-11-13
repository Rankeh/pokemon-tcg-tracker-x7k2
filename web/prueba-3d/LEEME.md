# Fase 3.5 — Prueba de integración del álbum 3D (Blender → GLB → Three.js)

Ruta independiente: **no usa IndexedDB, ni el catálogo, ni la navegación de la app**. No modifica nada existente.

**Abrir:** Live Server en la raíz del repo → `web/prueba-3d/index.html` (también `?modelo=album_blender.glb`, `?pr=1` para limitar el pixel ratio, `?auto=medir`). Necesita internet para bajar Three.js, salvo que copies `web/vendor/three/` (ver `web/vendor/LEEME.md`).

**Flujo:** *Abrir álbum* → *Hoja ›* (giro de página) → tocar una carta (ficha: cambiar imagen, quitar carta, *Volver al álbum*). Arrastrar = giro ligero de cámara (limitado); rueda = zoom. *Rellenar vacíos* añade cartas a los bolsillos vacíos a la vista. *Métricas* muestra el panel; *Medir* recorre el álbum entero y mide FPS; *Copiar informe* copia un JSON con todo.

## Arquitectura
- `blender/teselia/modelo_web.py`: árbol de nodos único (Tapa, Hoja_i pivote → Losa, caras F/D → Soldaduras, Funda, Bolsillo_k → Carta). Dos caminos lo exportan: `blender/exportar_glb.py` (Python puro, genera `modelo/album.glb` y `cartas/*.png`) y `blender/exportar_glb_blender.py` (+ `ejecutar_glb_windows.bat`, genera `album_blender.glb`).
- `js/logica.js` (puro): estado, giro, visibilidad, texturas necesarias, FPS. `js/camara.js` (puro). `js/album3d.js` (Three.js). `js/metricas.js`. `js/main.js`.
- Giro: cada hoja es un pivote en el eje del lomo; `rotation.z` 0→π con easing y elevación. Las cartas son meshes con geometría compartida y **material propio**; cambiar imagen = cambiar `material.map`. Bolsillo vacío = nodo sin hijo.
- Ahorro para iPhone: sin sombras, pixel ratio ≤ 2, solo se dibuja cuando hay movimiento, hojas enterradas ocultas, texturas 256×358 cargadas solo para las caras visibles, aviso si se pierde el contexto WebGL.

## Qué está comprobado y qué no
Comprobado aquí: `python blender/pruebas_glb.py` (26: estructura GLB, devanado/normales, UV, separación de elementos, exportador de Blender con `bpy` simulado), `node --test web/prueba-3d/pruebas/*.test.mjs` (21: lógica, cámara y `album3d.js` contra el GLB real con un **doble** de Three.js), y `python blender/previsualizar_glb.py` (z-buffer propio: pilas, sentido del giro y orientación de las imágenes).
**NO comprobado:** ejecución con Three.js real y WebGL, FPS, memoria GPU y comportamiento en iPhone Safari (no tengo acceso a Three.js ni a un navegador con GPU), ni el script de Blender. Los números reales los da el panel de métricas en tu dispositivo.
Cifras estáticas del modelo (contadas): 233 nodos, 105 con malla, 9 mallas únicas, 2.776 triángulos instanciados, GLB 50 KB, 12 PNG de prueba ≈ 270 KB.
