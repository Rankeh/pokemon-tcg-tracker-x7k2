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

## 3.6.2 — Álbum 3D interactivo con la colección real

Abre `web/prueba-3d/index.html` (Live Server) y verás las 18 páginas reales (158 cartas, 9 hojas físicas × 2 caras). Tocas el bolsillo de un Pokémon, se abre su ficha y con **+ / −** añades o retiras copias; el cambio se ve en el 3D en cuanto IndexedDB confirma el guardado.

### Cómo se conecta Three.js con IndexedDB
`main.js` abre el **mismo** `Almacen` de la app (BD `coleccion-teselia`, almacén `copias`, versión 1, sin migraciones) → `ModeloColeccion` → `AdaptadorColeccion`. El controlador (`controlador.js`) sigue siempre: *validar → guardar → confirmar → actualizar ficha y 3D*. Si el guardado falla, se muestra el error y la cantidad real guardada, nunca una cantidad falsa. Las operaciones se encadenan en una cola (los toques rápidos no se pisan). Al volver a la pestaña se relee IndexedDB, de modo que lo editado en la app original aparece aquí. No hay BD nueva, ni cambios de esquema, ni sincronización entre dispositivos (PC e iPhone no comparten IndexedDB; usa exportar/importar JSON de la app).

### Módulos nuevos
`navegacion3d.js` (página↔hoja, indicador «Páginas 4–5 de 18»), `picking.js` (rayo → bolsillo, zona táctil algo mayor que la carta, solo caras superiores, sin huecos), `texturas.js` (caché LRU con recuento y presupuesto, 32 MB por defecto, `?mem=MB`), `texturas3d.js` + `marcadores.js` (imagen local o marcador «SIN IMAGEN» / placa «pendiente»), `bolsillos3d.js` (mallas por página activa, animaciones de inserción/extracción, `prefers-reduced-motion`), `controlador.js`, `ficha-ui.js`. El GLB ya no lleva cartas: solo estructura, 162 bolsillos y 2 plantillas de geometría compartida.

### Imágenes locales (no se piden a servidores externos durante la navegación)
La prueba CORS de 3.6.1 mostró que solo una imagen remota se podía usar como textura, así que el álbum usa copias locales optimizadas. **Todavía no están generadas** (mi entorno no tiene acceso a TCGdex). Genera tú las copias una vez, desde la raíz del repositorio:

```
java herramientas/texturas/PrepararTexturas.java
```

Crea `web/prueba-3d/assets/cartas/mini/<id>.jpg` (256 px), `grande/<id>.jpg` (480 px, solo para la ficha) y `manifiesto.json`. Es idempotente (`--forzar` para rehacer, `--solo id1,id2`). No toca ningún original. Se esperan **153** imágenes; **5 no tienen imagen en el catálogo** (`svp-208` … `svp-212`) y usan marcador con nombre, expansión, número e id (no se inventa arte). Sin el manifiesto, todo el álbum funciona con marcadores. Procedencia y términos: las imágenes son de TCGdex (arte © The Pokémon Company / sus ilustradores), para **uso personal, no comercial**; el manifiesto lo recuerda y guarda el hash del original.

### Pruebas automáticas
```
node --test web/prueba-3d/pruebas/*.test.mjs      # 48 pruebas (las 24 de la fase + apoyo)
node web/prueba-3d/pruebas/ejecutar-navegador.mjs  # Chromium + IndexedDB real en BD desechable
python3 blender/pruebas_glb.py
```
Las pruebas de Node usan Three.js **simulado** y el GLB real: validan datos, colección, picking, caché, navegación y ausencia de fugas, no el renderizado. Ninguna toca la BD real.

### Qué NO está verificado
Ejecución real de Three.js, rendimiento y Safari en iPhone, la descarga real de imágenes y la exportación real con Blender: no se pueden probar desde mi entorno. Requieren tu comprobación manual.

### Windows (VS Code)
1. `git pull`. 2. (Una vez) `java herramientas/texturas/PrepararTexturas.java` y haz commit de `web/prueba-3d/assets/cartas/` si quieres verlo en GitHub Pages / iPhone. 3. Live Server sobre `web/prueba-3d/index.html`. Opcional: `?debug=1`, `?pagina=7`, `?bd=prueba` (BD alternativa para ensayar).

### iPhone (Safari)
Abre la URL de GitHub Pages (o `http://192.168.1.156:5500/web/prueba-3d/` en la misma wifi). Ten en cuenta que la BD del iPhone es distinta de la del PC.

### Protocolo manual
1. Abre el álbum y pulsa «Abrir álbum». 2. Toca un bolsillo vacío (placa «pendiente»). 3. Pulsa + : la carta entra en la funda. 4. Recarga: sigue ahí. 5. Pulsa − hasta 0: sale y vuelve la placa. 6. Salta a otra página con el selector, vuelve y comprueba el estado. 7. Abre la app original **en el mismo origen** y comprueba que la cantidad coincide (y viceversa). 8. Toca un hueco de la página 18: no debe abrir ficha. 9. En el iPhone, repite y prueba giro con el dedo y zona táctil. 10. Prueba con ajuste «reducir movimiento» activado.

## 3.7.1 — Cámara, encuadre y composición responsive

**Qué cambia:** solo la cámara y la composición. No se toca IndexedDB, `ModeloColeccion`, `Almacen`, el adaptador, el catálogo, las texturas/caché, el picking ni el GLB (una prueba comprueba que esos archivos no han cambiado desde `1230f6f`).

**Cómo se calcula el encuadre** (`js/encuadre.js`, puro y probado en Node): se parte de la *caja* del álbum que debe verse (dimensiones reales leídas del GLB: tapa 0,258 × 0,322 m, altura 0,0435 m) según el estado (cerrado, portada, dos páginas, una página, giro, selección). Se proyectan sus esquinas con el fov, la proporción del lienzo y la elevación, y se resuelve el radio mínimo para que quepan en el **rectángulo libre**: pantalla menos cabecera, barra inferior y (si está abierta) ficha, que se **miden en el DOM** en cada momento. Después se desplaza el objetivo para centrarlo en ese rectángulo. Nada usa una distancia fija. Los planos near/far salen de la distancia y del zoom máximo.

**Estados de cámara:** álbum cerrado; abierto (portada); dos páginas; una página (modo por defecto en vertical); giro de hoja (se encuadra también el barrido de la hoja al ponerse vertical, con una ligera apertura que se recupera al acabar); selección (la página entera encuadrada en el espacio que deja la ficha, elevación algo mayor y aro dorado sobre la carta); cierre de ficha (se *recalcula* el encuadre de navegación; no se restaura un valor guardado). Todas las transiciones son suaves (con *reducir movimiento*, instantáneas).

**Vertical vs horizontal:** un álbum abierto es apaisado, así que en un móvil vertical dos páginas dejaban mucho vacío. En vertical se enfoca **una página** a la vez (≈ 2,2× más ancha: de ≈ 170 px a ≈ 378 px en 390 px de pantalla). Se pasa de página deslizando el dedo (izquierda = siguiente, derecha = anterior, como un álbum), con ‹ › o con el selector; el botón ▯/▯▯ alterna entre una y dos páginas. En horizontal y escritorio se muestran dos páginas.

**Safari:** el contenedor usa `100dvh` (con `100%`/`100vh` de reserva) y `env(safe-area-inset-*)`; se recalcula con `ResizeObserver`, `visualViewport.resize` y `orientationchange` (con un pequeño retardo, porque iOS actualiza las medidas tarde) y el encuadre sale de las medidas reales, de modo que seguirá siendo correcto cuando Safari muestre u oculte sus barras.

**Cambios mínimos de interfaz necesarios para liberar espacio** (la interfaz definitiva es 3.7.3): barra inferior en una sola fila; Métricas/Medir/Informe solo visibles con `?debug=1` (siguen existiendo); botón ▯/▯▯ nuevo; ficha con fondo menos oscuro.

**Pruebas:** `node --test web/prueba-3d/pruebas/*.test.mjs` (70, incluye `encuadre37.test.mjs`: 9 viewports × estados sin recortes, near/far, giro, raycast con la cámara nueva, selección, cierre, 18 páginas, reservado DOM, protección de módulos) y `node web/prueba-3d/pruebas/ejecutar-pagina.mjs`: abre la **página real** en Chromium (viewport de iPhone, CSS, DOM, gestos y IndexedDB reales en una BD desechable) con Three.js simulado, 36 comprobaciones. **No es WebGL ni Safari:** lo que se ve de verdad solo se confirma en tu iPhone.

**Para probarlo:** `git pull` y abre `web/prueba-3d/index.html` (Live Server; `?debug=1` muestra diagnóstico). En iPhone, la URL de GitHub Pages. Comprueba: álbum grande al abrir, una página llena la pantalla, deslizar cambia de página, tocar una carta abre la ficha sin tapar la carta ni perder la página, + / − funcionan, cerrar vuelve al encuadre, girar el móvil reencuadra, Safari con/sin barras.

**Limitaciones:** el aro de resalte (`resaltado.js`) y la apertura de cámara durante el giro no se han visto renderizados; el iPhone SE antiguo (320 px) puede partir la barra en dos filas (el encuadre se adapta igualmente); en horizontal el álbum está limitado por la altura.

### Propuesta resumida 3.7.2 (iluminación y materiales) — NO implementada
Luz principal suave + relleno tenue + luz de contorno (rim) para separar el álbum del fondo; hemisférica más baja; exposición medida; cubierta de grafito con rugosidad/relieve (normal map pequeño generado por código o en Blender), lomo más claro, cantos y costuras con color propio, fundas con `MeshPhysicalMaterial` de baja complejidad o `MeshStandardMaterial` translúcido sin reflejos sobre la ilustración; entorno ligero (envMap pequeño) solo si se mide. Sin sombras en tiempo real por defecto; sombra de contacto falsa (textura) bajo el álbum; niveles de calidad (`?calidad=`) y medición de FPS antes y después de cada efecto.

### Propuesta resumida 3.7.3 (interfaz y microinteracciones) — NO implementada
Barra superior fina (nombre, progreso «X/158», página); navegación flotante compacta (‹ › selector, abrir/cerrar) con zonas táctiles de 48 px; panel de diagnóstico oculto tras `?debug=1` o pulsación larga en el título; ficha integrada con el estilo del álbum (cristal oscuro, acento dorado), animación de entrada/salida, contador con transición, háptica/sonido opcionales y desactivables, y respeto de `prefers-reduced-motion`.
