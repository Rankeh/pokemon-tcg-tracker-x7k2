# Biblioteca — pantalla principal (dirección editorial)

`index.html` (raíz del repositorio y de GitHub Pages) es la biblioteca: **una fila horizontal de lomos** sobre fondo grafito enmarcado en negro,
como un catálogo de diseño gráfico. El álbum elegido sale de la fila, sube un poco y **gira para enseñar su portada** en el centro; los demás se
apartan mostrando solo el lomo. Debajo, su ficha (título, expansiones en rojo, nº de cartas) y **Abrir álbum**: la cámara se acerca a la portada,
la pantalla funde a negro y se pasa al visor 3D, que sigue en su ruta de siempre (`web/prueba-3d/index.html`).

- **Elegir:** tocar un lomo, deslizar a los lados, flechas ← → (pantalla o teclado), rueda/trackpad. **Abrir:** tocar la portada, el botón o Enter.
- **Filtros por serie** en pestañas finas (hoy: Todos · Escarlata y Púrpura). El último elemento es siempre **Nuevo álbum** (Fase 3).
- Se recuerda el último álbum elegido (localStorage, solo comodidad). Al volver con «atrás» se quita el fundido (Safari guarda la página en caché).
- **Datos:** no abre IndexedDB. Los álbumes vienen de `js/albumes.js` (solo lectura; en la Fase 4 pasarán a IndexedDB sin tocar el carrusel).

| Archivo | Qué hace |
|---|---|
| `js/main.js` | Renderer, luz de estudio, carrusel animado, gestos, ficha, filtros y transición de apertura |
| `js/carrusel.js` | PURO: pose de cada libro según el elegido, elementos, series y encuadre |
| `js/albumes.js` | Registro de álbumes (validación y orden) |
| `js/libros.js` | Libros 3D (una geometría compartida) y «Nuevo álbum» con lomo y portada propios |
| `js/lomo-teselia.js` | Lomo Teselia (color + relieve + metal), tapa con la lámina del álbum, cantos y el lomo/portada de «Nuevo álbum» |
| `js/disposicion.js` | Medidas del libro (las del álbum 3D: 268 × 322 × 46,5 mm) |
| `css/estanteria.css` | Retícula de la página; los componentes vienen de `web/editorial/editorial.css` |

Pruebas: `node --test web/estanteria/pruebas/*.test.mjs`

## Varios álbumes (3.12)
Cada álbum está descrito por completo en `js/albumes.js`: catálogo y precios, ruta, textos de la portada (y sus dos cartas «foto») y datos del
lomo. La biblioteca y el visor 3D leen de ahí; el visor se abre con `web/prueba-3d/index.html?album=<id>` (sin parámetro, Teselia).
El visor elige el modelo por el nº de hojas que pide el catálogo: `album.glb` (9 hojas) o `album-<n>h.glb` (`python blender/exportar_glb.py --hojas n`).
Las copias se guardan por id de carta en la misma base de datos: una carta que está en dos álbumes (Audino de Fulgor Negro) cuenta en los dos.

**Álbum de artista — Asako Ito:** `python herramientas/catalogo-ilustrador/generar.py --ilustrador "Asako Ito" --id asako-ito` y
`python herramientas/texturas/descargar_cartas.py --catalogo datos/catalogo/coleccion-asako-ito.json`. 37 cartas físicas según TCGdex
(coincidencia exacta del nombre); se excluyen 6 de Pokémon TCG Pocket (digital) — `--incluir-pocket` las añadiría. Altaria GG19 no tiene imagen
en TCGdex: se usa la de limitlesstcg.com (ver web/prueba-3d/LEEME.md, 3.15).

## 3.20 — Los álbumes de la biblioteca son el álbum del visor
Cada libro se construye con la anatomía y los materiales del álbum 3D (tema editorial): tapas de tela negra en sarga (acabado `editorial`,
mismos mapas de relieve y rugosidad, brillo de tela en calidad alta y cantos más claros), esquinas de 16 mm por fuera, banda y panel en relieve
con la lámina impresa (mismo dibujo y material que la tapa del visor), bloque de hojas grafito y lomo redondeado con su diseño. El grosor es el
real del modelo de cada álbum (2 tapas + hojas: Teselia 43,5 mm, Asako Ito 22,5 mm, osare 19 mm) y el carrusel separa los lomos según ese grosor.
