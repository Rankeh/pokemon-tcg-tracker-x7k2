# Estantería 3D — pantalla principal (Fase 1: estantería visual)

`index.html` (raíz del repositorio y de GitHub Pages) muestra la biblioteca: una estantería de nogal con los álbumes **de pie, enseñando el lomo**.
Toca el lomo de un álbum para abrirlo (de momento, sin animación: la extracción y la transición llegan en la Fase 2). El álbum sigue en su ruta de siempre,
`web/prueba-3d/index.html`, así que ningún enlace se rompe.

- **Álbumes reales, sin relleno.** Hoy solo está Teselia (Llama Blanca · Fulgor Negro). Detrás van el sujetalibros de latón y el lomo «Nuevo álbum»
  (`+`, hueco disponible; crear álbumes es la Fase 3). El resto de huecos queda vacío y siempre hay sitio libre: la estantería añade baldas cuando hace falta.
- **iPhone:** en vertical salen 4 huecos por balda (lomos grandes) y se desliza arriba/abajo para recorrer las baldas. En escritorio, rueda, arrastre o ↑/↓.
- **Calidad:** la misma elección que el álbum (`?calidad=baja|media|alta`). Baja: sin relieve ni reflejos de entorno y menos resolución.
- **Datos:** la Fase 1 **no abre IndexedDB**. La lista de álbumes es fija (`js/albumes.js`) y en la Fase 4 pasará a IndexedDB sin tocar la estantería.

| Archivo | Qué hace |
|---|---|
| `js/main.js` | Renderer, cámara, desplazamiento entre baldas, toque/ratón y dibujo solo cuando algo cambia |
| `js/disposicion.js` | PURO: medidas (las del álbum 3D: 268 × 322 × 46,5 mm), huecos por balda, qué va en cada hueco y dónde |
| `js/albumes.js` | Registro de álbumes (validación y orden) |
| `js/mueble.js` | Mueble: laterales, baldas, fondo con luz cálida horneada, tiras LED, latón y placa |
| `js/libros.js` | Libros de pie (una geometría compartida), «Nuevo álbum» y sujetalibros |
| `js/lomo-teselia.js` | Lomo Teselia (color + relieve + metal/rugosidad), tapa con la lámina del álbum, cantos de hoja |
| `js/texturas.js` | Madera, fondo, sombra de contacto, placa y relieve → normales (todo por código, sin imágenes) |

Pruebas: `node --test web/estanteria/pruebas/*.test.mjs`
