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
