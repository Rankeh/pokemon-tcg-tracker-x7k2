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

## 3.5.1 — Corrección: el álbum no se dibujaba en iPhone vertical
**Causa (deducida de tus datos, comprobada con aritmética y un test de regresión; no verificada aún en el iPhone):** el último fotograma dibujó 1 llamada y 2 triángulos = solo la mesa. `ajustarTamano` calculaba la distancia de cámara como `0,30 / (tan(fov/2)·aspect) / cos(elevación) · 0,95`; con aspect 390/663 da **≈3,6 m**, y la cámara tenía `far = 3` fijo, así que el álbum quedaba más allá del plano lejano y Three.js lo recortaba (la mesa, más extensa, aún asomaba). En PC (16:9) la distancia era 1,2 m, por eso allí sí se veía. No era WebGL ni Safari: era un encuadre mal calculado.
**Arreglo:** `distanciaEncuadre()` (sin la división por cos, ancho y alto) y `planosRecorte()` (near/far derivados de la distancia, far ≥ 3×zoom máximo) en `js/camara.js`. En PC el álbum ahora se ve más grande (0,6 m en vez de 1,2 m).
**Tests:** `pruebas/encuadre.test.mjs` proyecta las 8 esquinas del álbum para iPhone vertical/horizontal, PC y cuadrada: caben en pantalla y entre near/far, también con el zoom máximo; y reproduce que la fórmula antigua daba >3 m.
**Modo diagnóstico:** `index.html?debug=1` muestra en pantalla estado del GLB, errores JS/promesas, errores de shader y de `gl.getError`, cámara (posición, dirección, near/far), canvas, mallas presentes/visibles/dentro del frustum/más allá de far, centro del álbum en NDC, llamadas y triángulos, materiales y texturas, y dos **cubos de prueba** (magenta sin luces y verde con luz) delante del álbum.

## 3.6.1 — Adaptador de datos (sin cambios visibles todavía)
`js/adaptador-coleccion.js` conecta la colección real con el álbum 3D reutilizando `distribuir()`, `ModeloColeccion`, `Almacen` y `coleccion.js` de la app (no hay segunda base de datos ni cambios de esquema). Traduce página/posición del catálogo ⇄ nodo 3D (`Hoja_i_F|D_Bolsillo_k`) y cada cambio de cantidad devuelve una transición (`insertar`, `extraer`, `cantidad`, `nada`) que será la que anime.
Pruebas: `node --test web/prueba-3d/pruebas/*.test.mjs` (Node, almacén en memoria) y `node web/prueba-3d/pruebas/ejecutar-navegador.mjs` (Chromium + IndexedDB real, en un perfil desechable y con bases de datos de prueba). Sonda para comprobar CORS de las imágenes en WebGL: `web/prueba-3d/sonda-cors.html`.
