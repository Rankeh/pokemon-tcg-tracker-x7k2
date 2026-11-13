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

## 3.7.1b — Refinamiento de cámara y composición física

Se refina el motor de la 3.7.1 (`encuadre.js`, `main.js`); no se crea otro sistema de cámara. No se toca el GLB ni la geometría del álbum, ni ninguna hoja se mueve u oculta para encuadrar.

### Origen de los problemas
- **A (vecina recortada):** en vertical se encajaba la caja `[lomo, lomo + ancho de tapa]` con el lomo exactamente en el borde de la pantalla; lo que había a su izquierda quedaba cortado por el borde por casualidad (y el lomo, medio fuera).
- **B (horizontal pequeño):** cabecera y barra ocupaban dos bandas completas (≈ 120 px de 390), el factor limitante era la altura, y la caja de dos páginas era conservadora (altura del lomo en las esquinas de las tapas), unos 5 % de más.
- **C (ficha):** se metía la página entera en el hueco sobre la ficha y se centraba su caja matemática, empujando el álbum hacia arriba aunque cupiera más contexto.
- Además: «siguiente» desde la página 1 pasaba a la 3 (se saltaba la 2) y el estado «todo girado» recortaba la contratapa.

### Solución (funciones ajustadas)
- `COMPOSICION` (encuadre.js): **todos** los parámetros artísticos en un sitio, documentados (franja de la vecina = lomo + 12 % del ancho de hoja; margen 3,5 %; sesgo óptico 2 %; tolerancia de contexto 15 %; filas de contexto; paso de fila, que una prueba compara con el GLB).
- `cajasReales()` / `aabbMundo()`: cajas de las mallas **reales** (`Hoja_n_Losa`, `Tapa_Malla`, `Contratapa`, `Lomo`) con su matriz del mundo actual (`album.cajaMalla`); mientras una hoja gira (sin pose final) `cajasDimensiones()`, que una prueba compara con las reales (< 2 mm).
- `puntosPagina()`: página protagonista + lomo + franja contigua **recortada en la caja de cámara** (no se toca la geometría). `puntosConjunto()` para cerrado/dos páginas con las cajas reales.
- `calcularEncuadre(... centroVisual, sesgo)`: además del centrado matemático, centra la **cara** de la página (no el grosor de pilas/cubiertas) con un pequeño sesgo hacia arriba.
- `elegirEncuadreSeleccion()`: con la ficha abierta, cascada de prioridades *página+lomo+vecina → página+lomo → página → solo las filas cercanas a la carta*, aceptando el primer nivel que no aleje la cámara más de un 15 % respecto a la navegación. La carta siempre queda visible fuera de la ficha.
- `reservado()` (main.js): mide los elementos **visibles** (texto de la cabecera, botones), no sus contenedores. En móvil horizontal (`max-height: 520px`) la cabecera pasa a una columna izquierda y los controles a una columna derecha (CSS), liberando toda la altura (844×390: álbum de ≈ 488 px → ≈ 596 px).
- `pasoLectura()` (navegacion3d.js): orden de lectura 1 → 2 → 3 → 4 …; la hoja gira de impar a par al avanzar (y de par a impar al retroceder); dentro de una doble página solo se mueve la cámara.
- Giro de hoja en una página: la cámara acompaña a la página de destino sin alejarse (duración del giro); en dos páginas se abre un poco por el barrido de la hoja. `near` se calcula con el zoom más cercano y `far` con el más lejano.
- Cambios de `visualViewport` pequeños se absorben con una transición de 0,3 s; cambiar de orientación reencuadra de golpe y restablece la vista por defecto (1 página en vertical, 2 en horizontal).
- Estado «todo girado»: ahora se encuadran también la pila izquierda y la contratapa (antes se cortaba).

### Reglas de composición
1. Vertical: una página protagonista de 68–84 % del ancho (diseño ≈ 76 %), lomo en el lado interior, franja de la contigua de ≈ 9–12 % (más lomo), margen exterior ≈ 1,75 % por lado.
2. Horizontal/escritorio: dos páginas con cubiertas y lomo, ≥ 99 % del lado limitante del área libre, 2 % de margen.
3. La página protagonista nunca se recorta; lo único que puede quedar fuera es la página contigua (recortada a propósito).
4. Con la ficha: ficha utilizable > carta visible > contexto de su página > lomo > franja.
5. Parámetros por dispositivo: nada es una constante de píxeles; todo sale del viewport, el fov (32°), la elevación (52° vertical / 58° horizontal) y la interfaz medida.

### Pruebas
`node --test web/prueba-3d/pruebas/*.test.mjs` (102, con `encuadre37b.test.mjs`: límites **proyectados** de la página protagonista en 5 pantallas verticales × 18 páginas, 4 apaisadas, selección primera/última fila, cascada de contexto, viewport cambiante, orientación, vista simple/doble, near/far, raycast, lectura 1→18→1, 17↔18, etc.) y `node web/prueba-3d/pruebas/ejecutar-pagina.mjs` (113 comprobaciones sobre la página real en Chromium con Three.js simulado, IndexedDB real en una BD desechable). Ninguna toca tu base de datos real. **No son WebGL ni Safari.**

### Cómo comprobarlo
`git pull`; abre `web/prueba-3d/index.html` (Live Server) o la URL de GitHub Pages en el iPhone. **Vertical:** página grande, lomo a su lado interior, franja discreta de la contigua; desliza para leer 1, 2, 3, 4, 5, 6… y 17, 18; ▯/▯▯ alterna una/dos páginas; toca una carta de la primera y de la última fila. **Horizontal:** dos páginas, controles en las columnas laterales. Prueba con las barras de Safari visibles/ocultas.

### Requiere validación visual (no comprobable desde aquí)
Aspecto real de la franja y del lomo; cómo se lee la composición con luz y materiales actuales; fluidez de las transiciones; el aro de resalte; el aspecto de las columnas laterales (el selector de página en la columna es estrecho); iPhones con Dynamic Island/`safe-area` en horizontal.

## Fase 3.7.1c — La tapa izquierda ya no desaparece

**Causa (verificada).** No era la cámara ni el GLB. `EstadoAlbum.visibles()` (ahorro de dibujo) ocultaba *elementos enteros* fuera de la ventana `[v−2, v+1]`, y la `Tapa` es el elemento 0: con `v ≥ 3` (páginas 4–5 en adelante) se dejaba de dibujar la tapa izquierda y las hojas enterradas, y las pilas quedaban «huecas». Con `v = 2` (páginas 2–3) la tapa sí se dibuja, pero la pila vecina ya empezaba a vaciarse al pasar de hoja (el siguiente paso la hacía desaparecer de golpe). Normales, culling (FrontSide, tapa girada π) y profundidad se revisaron y son correctos: la tapa se ve bien en v=2 y desaparece solo cuando se oculta el nodo.

**Corrección (estructural, sin tocar el GLB).** `Album3D` separa el *cuerpo* de cada elemento (`Tapa_Malla`, `Hoja_n_Losa`; 10 mallas sencillas) del *detalle* (fundas, soldaduras, 9 bolsillos por cara). El cuerpo y las piezas estáticas (`Contratapa`, `Lomo`) se dibujan SIEMPRE; solo el detalle sigue la ventana de `visibles()`. Coste: ~9 mallas más de geometría trivial. No cambian poses, animaciones, catálogo, IndexedDB, texturas ni el orden de cartas.

**Verificación.** `pruebas/tapa37c.test.mjs` (5 pruebas, Three.js simulado + GLB real): cuerpos y tapas dibujados en los estados 0..10, detalle aún recortado, tapa izquierda en su sitio (girada π, bajo las hojas, pegada al lomo), avance/retroceso paso a paso (1→2, 2–3, 4–5, 8–9, final, vuelta a 1, cerrar y reabrir), y encaje con el lomo. Vista previa numpy antes/después (`blender/previsualizar_glb.py`): en v=3 la tapa y la pila izquierda aparecen tras el arreglo. **Pendiente: comprobación visual real en Chrome/Safari** (aquí no hay WebGL con Three.js real).

## Fase 3.7.2a — Iluminación cinematográfica y materiales principales

### Diagnóstico (antes de cambiar nada)
- **Por qué se veía oscuro y sin separación.** Los albedos del GLB son casi negros (Cubierta lineal ≈ 0,011/0,019/0,036; Hoja ≈ 0,02) y la mesa (`#2a2e35`) tenía una luminancia parecida. Con las luces y ACES de 3.7.1c, una estimación analítica (`estimarSalida`, test 10) da: **cubierta ≈ (6,10,21), página ≈ (13,13,15), mesa ≈ (17,18,22)** en sRGB 0‑255; es decir, *la mesa era más clara que la tapa y la página*. Subir todas las luces no lo arregla (también lava la mesa y ACES recorta los azules oscuros): hacía falta **cambiar el reparto de luminancias** y dar volumen con luz direccional + contorno.
- En Three r155+ las luces ya no llevan el factor π: key 2,4 + hemisférica 0,9 dan ≈ 1× el albedo, poco para materiales tan oscuros.
- No había luz de contorno, ni variación de rugosidad/relieve, y la funda tenía rugosidad 0,1 (brillos nítidos sobre el arte). Las cartas eran PBR iluminadas + ACES: su color cambiaba con la luz.
- `tapa`, `lomo` y `losa_hoja` traen **UV = 0** en el GLB: sin UV no hay relieve. Solución sin tocar el archivo: UV planares generadas **en memoria** (`rellenarUV`) solo donde hay relieve.

### Qué se ha implementado (`js/aspecto.js`, único sitio con los números artísticos)
- **Luces** (sin sombras dinámicas, sin postprocesado/bloom, sin animación): hemisférica ambiente (cielo azulado, suelo grafito), **principal** cálida lateral‑izquierda y alta, **relleno** frío tenue del lado contrario, **contorno** azul noche por detrás (discreto). Exposición 1,15.
- **Cubiertas:** grafito azulado `#344052`, rugosidad 0,78, metalness 0, **relieve fino procedural** (grano + trama, mosaico sin costuras, 128 px en media / 256 px en alta, `normalScale` 0,42). **Lomo:** material propio (un solo clon), `#384562`, más liso (0,58) para que la luz de contorno dibuje su redondeo; jerarquía y pivotes intactos. **Páginas:** grafito neutro `#40444d`, satinado (0,62), sin relieve. **Soldaduras/bordes de funda:** algo más claros (costuras discretas). **Funda:** opacidad 0,06, rugosidad 0,5, sin `depthWrite`: no puede tapar ni reflejar sobre la ilustración.
- **Cartas:** material **sin iluminación ni tone mapping** (`MeshBasicMaterial`, `toneMapped:false`): colores exactos de la textura (sRGB, sin cambios en `texturas3d.js`). Las casillas vacías siguen mostrando su etiqueta «pendiente». Es el único cambio en `bolsillos3d.js` (una fábrica de material inyectable, el valor por defecto es el de antes).
- **Sombra de contacto falsa:** un plano con textura procedural 96×96 (rectángulo redondeado difuminado, más oscura junto al borde, transparente en el límite), desplazada ligeramente lejos de la luz principal; se **redimensiona con las cajas reales** de Contratapa/Tapa/Lomo en cada frame, así que sigue al álbum cerrado, abierto y todo girado. Mesa más oscura y neutra (`#22262d`) para que la sombra se lea.
- **Renderer:** se mantiene ACESFilmic y `outputColorSpace` por defecto (sRGB); solo cambia la exposición (afecta al álbum, no a las cartas porque `toneMapped:false`). Sin WebGPU ni extensiones de escritorio. Antialias y límite de pixel ratio como antes.

### Niveles de calidad (mismo código, distintos números)
`?calidad=baja|media|alta|legado`
| nivel | luces | relieve | rugosidad variable | sombra de contacto |
|---|---|---|---|---|
| baja | hemisférica + principal | no | no | sí |
| media | + relleno + contorno | 128 px | no | sí |
| alta | + relleno + contorno | 256 px | sí (mapa) | sí |
| legado | **idéntico a 3.7.1c** (línea base para medir) | no | no | no |

Automático: **móvil/táctil** → `media` solo si hay ≥ 6 núcleos y (memoria desconocida o ≥ 4 GB); si no, `baja`. Escritorio → `alta` con ≥ 8 núcleos, si no `media`. Safari no expone `deviceMemory`, por eso se decide por núcleos y no por el nombre del dispositivo. El panel de métricas/informe muestra el nivel aplicado.

### Cómo medir el rendimiento (en tu iPhone y en Chrome)
Mismas 6 escenas (cerrado, página 1, páginas 4–5, página 18, carta seleccionada, giro de hoja), 4 s cada una:
1. Línea base: abre `…/web/prueba-3d/index.html?calidad=legado&auto=escenas` y espera ~45 s. El informe JSON aparece en el cuadro de texto (cópialo).
2. Repite con `?calidad=baja&auto=escenas`, `media` y `alta` (y pasa `&pr=1` si quieres fijar el pixel ratio).
3. Cada escena da FPS medio, mínimo, p95 del tiempo de fotograma, llamadas de dibujo, triángulos, geometrías, texturas y MB estimados; más tiempos de carga. Tras cada medición cierra y vuelve a abrir la página (las pestañas en segundo plano falsean los FPS).
No hay medición de GPU real en este entorno: lo medido con Three.js simulado **no** cuenta como rendimiento. No se promete ningún FPS.

### Límites y propuestas (no aplicadas)
- **No verificado en Safari/WebGL real:** aspecto final, que el relieve no muestre costuras en las esquinas biseladas (UV por eje dominante), el brillo del contorno y la lectura de la sombra sobre la mesa. Es la comprobación visual pendiente; los números de color son una estimación analítica.
- Propuesta de GLB (requiere aprobación): UV reales y un bisel algo mayor en tapas/lomo; costuras como geometría con vértices coloreados. No se ha tocado el GLB.

## Fase 3.7.2b — Refinamiento artístico y acabado premium

### Qué se investigó antes de editar
- **Geometría real del GLB** (leída del archivo): `tapa` 98 vértices (50 en caras planas, 48 en bisel/canto con normales distintas), `lomo` 66 (cilindro redondeado), `losa_hoja` 82, `funda_f/d` 21 (una película por cara de página, no una por bolsillo), `sold_f/d` 108 (los nueve marcos de bolsillo, planos). UV = 0 en tapa, lomo, hoja y funda. Conclusión: los cantos existen como vértices con normal propia → se pueden pintar **por vértice** sin texturas ni mallas nuevas.
- **Materiales/recursos:** un material por grupo (Cubierta, Hoja, Soldadura, Funda) + 1 para el lomo; nunca uno por bolsillo. Las cartas llevan su propio `MeshBasicMaterial` (se libera al desmontar la página; la textura la gestiona la caché por recuento). No hay conflicto con la caché: Aspecto no toca texturas de cartas.

### Técnicas aplicadas (por grupos)
1. **Cubiertas y lomo:** relieve procedural re-hecho (ondulación suave «acolchada» + microtextura + trama, mosaico sin costuras), escala 36 mm por repetición, `normalScale` 0,5; **mapa de rugosidad con pequeñas variaciones desde `media`**; en `alta`, `MeshPhysicalMaterial` con *sheen* discreto (brillo de tejido en rasante) solo en tapas y lomo (2 materiales).
2. **Cantos y profundidad (colores de vértice, coste de dibujo ≈ 0):** cantos/biseles de tapa ×1,55 (atrapan la luz), cantos de hoja más claros y cálidos (acento cálido controlado), y el lomo se oscurece en los laterales (curvatura falsa) para separarlo de las tapas. Se aplica en todos los niveles salvo `legado`. *Límite:* el sombreado entre hojas apiladas depende solo de este tinte de canto y de la luz; no hay oclusión ambiental real entre hojas.
3. **Fundas:** la película pasa a tener un **reflejo en el canal alfa** (franja diagonal suave + velo mínimo, alfa total entre 0,02 y 0,065, UV de página completa), mate (rugosidad 0,45), sin `depthWrite`, mismo material en las 18×2 fundas, sin nuevos draw calls. Los **marcos de bolsillo** (soldaduras) pasan a plástico pulido claro (`#7a8296`, rugosidad 0,36): dan el «borde protector» y un destello según el ángulo. No se usan transparencias nuevas ni capas extra. Las fundas no son candidatas de picking: el rayo las atraviesa (test 16 y 21).
4. **Iluminación:** principal más rasante y fuerte (3,3, y=0,62), ambiente más bajo (0,7), contorno 1,9 por detrás, relleno tenue. Objetivo: modelar volumen, no iluminar por igual; el brillo medio (estimación analítica) se mantiene: lo que cambia es la dirección.
5. **Contraste/legibilidad:** hoja `#4a4e58` > cubierta `#384559`; marco protector la pieza más clara; huecos pendientes con placa más hundida (`#18213a`) pero con borde y texto más claros (`#c3cde2`); **aro de selección** dorado sin tone mapping (`toneMapped:false`) por delante de la funda, mismo color `#e8b25a` y opacidad 0,95 (no neón: sin brillo añadido).
6. **Calidad:** `baja` (hemisférica+principal, cantos por vértice, sin relieve ni reflejo), `media` (4 luces, relieve 128 px, rugosidad variable, reflejo de funda), `alta` (relieve 256 px, Physical+sheen). `legado` = 3.7.1c. Cambiar: `?calidad=baja|media|alta|legado`. Alta **no** se fuerza en iPhone: el automático móvil sigue siendo `media` (≥ 6 núcleos) o `baja`.

### Tamaño del álbum en vista de dos páginas (medido, sin tocar la cámara)
Con el mismo cálculo de `encuadre.js` y Three.js simulado (proporciones reales, sin GPU): horizontal 844×390 → el álbum ocupa el **95 % del ancho libre** (80 % del alto); 750×340 → 95 % / 78 %; vertical manual 390×844 y 430×932 → **96 % del ancho libre y solo 27 % del alto**. Es decir, el tamaño lo limita la **proporción del álbum abierto** (≈ 2,2 : 1) y no la cámara: no hay zoom posible sin recortar. El espacio vacío vertical en retrato es físico. Solo podría ganarse reduciendo las columnas/cabecera de la interfaz (decisión de diseño, no de cámara): no se ha hecho.

### Costes de la fase (contados en Node, no medidos en GPU)
- Draw calls: **sin cambios**. Geometrías: sin cambios. Materiales del álbum: sin aumento (alta: tapa y lomo pasan de Standard a Physical; el lomo ya tenía material propio desde 3.7.2a).
- Texturas nuevas (DataTexture compartidas): relieve 128²/256² RGBA (+ mipmaps ≈ 85/340 KB), rugosidad igual (media/alta), reflejo de funda 64² (16 KB), sombra 96² (37 KB). **Total ≈ 0,3 MB en media y ≈ 0,8 MB en alta**: estimación aritmética (w·h·4·1,33), no medida.
- Vértices con atributo `color` (tapa, hoja, lomo): +12 bytes/vértice, despreciable.
- `alta` usa shader Physical con sheen en 2 mallas: es lo único con coste de fragmento mayor; mídelo antes de adoptarlo en iPhone.

### Qué es visible y qué es solo teórico
- **Esperable a la vista (pendiente de tus capturas):** más separación hoja/cubierta, lomo con redondeo, cantos claros, marcos de bolsillo con destello, reflejo diagonal en fundas, placa de hueco más legible, aro dorado estable.
- **Solo teórico/estimado:** colores finales (estimación ACES analítica), ausencia de costuras en los biseles (UV por eje dominante), carga de GPU, FPS.

### Probar en Windows e iPhone
1. `git pull` y Live Server en `web/prueba-3d/index.html` (o GitHub Pages tras el push). 2. Compara `?calidad=legado`, `?calidad=baja`, `?calidad=media`, `?calidad=alta`. 3. Rendimiento: `?calidad=XXX&auto=escenas` (informe JSON con FPS medio/mínimo, p95, draw calls, triángulos, geometrías, **materiales**, texturas y MB estimados). 4. Para comparar con 3.7.2a: `git checkout 6f5746c` en otra carpeta, misma medición. En iPhone: abre la URL, espera ~45 s, copia el informe del cuadro de texto.

### Pruebas (no verifican el dibujo real)
`pruebas/aspecto37.test.mjs` (tests 14–21 nuevos: cantos en vértices, Physical solo en alta, fundas y raycast, etiquetas y aro, fugas al cambiar de calidad, materiales compartidos, contraste estimado, selección/ficha/añadir/retirar en las 18 páginas con media y alta) y el runner de página real con 152 comprobaciones. Todas usan Three.js simulado: validan configuración, estructura y cableado, **no** el aspecto ni el rendimiento en GPU.

## Fase 3.7.3 (primera pasada) — Dirección «videojuego»: tema acogedor

Referencia: interfaz de juego «cozy» (paneles crema redondeados, botones gruesos con sombra, acentos naranja/verde/azul, fondo cálido desenfocado, objeto protagonista sobre una alfombra). Se implementa como **tema** sin tocar la lógica: `?tema=claro` (por defecto) o `?tema=noche` (el grafito de 3.7.2, para comparar).
- **Interfaz (solo CSS):** cabecera en píldora crema con contador naranja, botones tipo juego (borde grueso, sombra inferior, se «hunden» al pulsar), «Abrir/Cerrar» verde, flechas azules, ficha como tarjeta crema con imagen enmarcada y «+» verde, tipografía redondeada del sistema (`ui-rounded`, sin descargar fuentes), fondo con bokeh hecho con degradados (sin desenfoque en tiempo real ni `backdrop-filter`).
- **Escena (`aspecto.js`, `TEMAS`):** álbum con cubierta teal, lomo caramelo, hojas crema con canto dorado, marcos de bolsillo tostados; luces cálidas (principal ámbar, relleno melocotón, contorno dorado, exposición 1,08); **suelo de madera que se desvanece** (deja ver el fondo con bokeh) y **alfombra redonda** (2 planos, 2 texturas procedurales 128² y 256², ≈ 0,3 MB estimados; mismas draw calls +2, sin sombras dinámicas). Sombra de contacto más ligera sobre superficie clara.
- **Legibilidad:** huecos pendientes en beis con texto marrón, aro de selección naranja sin tone mapping. Las cartas siguen con material sin iluminación (colores exactos).
- `legado` sigue siendo la línea base de 3.7.1c (ignora el tema en escena). Calidad y tema son independientes: `?calidad=media&tema=noche`.
- **Pruebas:** `tema37.test.mjs` (T1–T7) y 18 comprobaciones nuevas en el runner de página real (estilos calculados por Chromium real: color de cabecera/botones, tipografía, sin desbordamiento a 390 px). El dibujo 3D sigue sin verificarse en WebGL real.
- **Pendiente de tus capturas:** cómo se ve el conjunto (equilibrio teal/crema/caramelo, alfombra y suelo, brillo de las hojas), y si prefieres otra paleta. Siguientes pasos posibles: aro de selección animado con pulso suave, cartas que «saltan» un poco al seleccionarlas, iconos en lugar de texto en la barra.

## Fase 3.7.4 — Tema «claro» (estilo Apple) y corrección del «clipping»

Tras probar 3.7.3 en iPhone: el álbum «clipea» y la paleta era demasiado colorida.
- **Causa del clipping en el lomo (medida en el GLB, test T8):** con el álbum cerrado, la cara superior del lomo (y = 0,0435) coincide exactamente con la de la tapa (0,0405 + 0,003) en x ∈ [0, 0,01] → *z‑fighting* que los tonos oscuros de 3.7.2 disimulaban y los colores contrastados delataron (dientes naranja/teal). Se corrige sin tocar el GLB: el material del lomo usa `polygonOffset` (factor 1, unidades 4) y la tapa gana.
- **Causa de los marcos negros de los bolsillos (test T9):** puse `vertexColors` en todos los materiales, y las soldaduras no tienen atributo de color → Three las pinta negras. Ahora solo lo activan los materiales cuyas geometrías reciben color de vértice.
- **Alfombra del tema acogedor:** bordes antialias a 512 px (escalones al ampliar).
- **Tema `claro` (por defecto):** grafito + blanco roto, un solo acento azul del sistema, suelo gris perla que se funde con el fondo (sin alfombra), sombra de contacto suave, luces neutras. Interfaz: cabecera y barra en cápsulas de vidrio esmerilado con borde fino (`backdrop-filter` solo en cabecera, barra y ficha de este tema: superficies pequeñas), tipografía SF del sistema, botones circulares/píldora, ficha de vidrio. `?tema=acogedor` y `?tema=noche` siguen disponibles.
- **A vigilar en iPhone:** el vidrio desenfocado se recompone cada frame mientras el 3D se anima; si notas caídas de FPS, avísame y lo cambio por un panel translúcido sin desenfoque (una línea de CSS).

## 3.7.5 · Cristal espacial (estilo visionOS), movimiento tipo muelle y acabados de tapa

Inspirado en las referencias del usuario (interfaz de cristal flotante tipo visionOS y carpetas con materiales táctiles). Solo afecta al tema `claro`.

- **Cristal**: barra, título y ficha llevan un brillo especular en el borde (`--brillo`) y un degradado de luz arriba (`--cristal-grad`) sobre el desenfoque que ya tenían.
- **Movimiento**: curva de muelle `cubic-bezier(0.34, 1.56, 0.64, 1)` (se pasa un poco y se asienta). Botones (hover solo con ratón, para evitar el «hover pegado» del móvil), barra y título aparecen con animación; la **ficha sube con muelle y sale en 220 ms** (`FichaUI.cerrar()` espera `SALIDA_MS` antes de poner `hidden`; si no hay animación —p. ej. «reducir movimiento»— se oculta al instante; reabrir cancela la salida).
- **Aro de selección**: entra con escala 1,22 → 1 (ease-out-back, 0,32 s) y opacidad. No se mueve ninguna carta ni hoja.
- **Acabados de tapa** `?tapa=grafito` (por defecto) `| fieltro | cuero | tejido | acolchado`: cambian color, rugosidad, relieve (mapa de normales procedural distinto para cada uno) y escala de la textura de tapas y lomo. Las hojas, cartas y fundas no se tocan. En calidad `baja` solo cambia el color/rugosidad (no hay mapas).
- Ejemplos: `?tapa=cuero`, `?tapa=acolchado&calidad=alta`.

**Qué está verificado y qué no**: lógica, cableado, CSS (reglas presentes) y temporización con Three.js simulado y Chromium. **No** está verificado cómo se ven los materiales ni la fluidez (FPS con desenfoque + animaciones) en el iPhone: eso requiere tus capturas/pruebas reales. Si el desenfoque penaliza los FPS, basta con quitar `backdrop-filter` del bloque 3.7.5/claro.
