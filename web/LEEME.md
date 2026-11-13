# Web de la colección — Fase 2 (almacenamiento)

| Archivo | Para qué sirve |
|---|---|
| `js/coleccion.js` | Reglas: cantidad 0..999, "conseguida" = 1 o más, progreso sobre el catálogo |
| `js/almacen.js` | IndexedDB: guardar/leer cantidades por id TCGdex, importar y deshacer |
| `js/copias.js` | Copia de seguridad JSON: crear, validar y resumir cambios antes de importar |
| `js/imagen.js` + `css/base.css` | Imagen de carta con sustituto visual (sin enlaces rotos) |
| `prueba-almacenamiento.html` | Página de prueba (no es la interfaz final) |
| `pruebas/` | Pruebas automáticas (`node pruebas/node.mjs` o abrir `pruebas/index.html`) |

Probar en local (desde la raíz del repositorio, con el JDK que ya tienes):

    jwebserver -d .

Y abrir http://localhost:8000/web/prueba-almacenamiento.html (con datos inventados: `?catalogo=pruebas`)
y http://localhost:8000/web/pruebas/index.html (pruebas automáticas).

---

## Etapa 3.1 / 3.1.1 / 3.2 — Prototipo del álbum 3D (`album-prototipo.html`)

**Cómo abrirlo (Live Server):** abre VS Code en la carpeta raíz del repositorio (`pokemon-tcg-tracker-x7k2`, no en `web/`), clic derecho en `web/album-prototipo.html` → *Open with Live Server*. Alternativa sin extensiones: `jwebserver -d .` en la raíz y abrir `http://localhost:8000/web/album-prototipo.html`. Hace falta servidor (no doble clic) porque carga el catálogo con `fetch`. Para abrir una página concreta: `?pagina=5`.

**Probar la animación de inserción:** pulsa un bolsillo pendiente → *Añadir* → la ficha se cierra, la carta vuela, queda suspendida sobre la boca de la funda y se desliza dentro. Con 2.ª copia solo sube el contador (×2). *Retirar* hasta 0 hace el recorrido inverso. Activa «Reducir movimiento» (o el ajuste del sistema) para ver la alternativa sin movimiento.

**Comprobar persistencia:** añade una carta, recarga la página (F5): sigue ahí. DevTools → Application → IndexedDB → `coleccion-teselia` → `copias`: una fila `id → cantidad` por carta con ≥1 copia (a 0 no queda fila).

**Estructura:** `js/album/` — `distribucion.js` (reparto en páginas, puro), `modelo.js` (lee/escribe vía `Almacen`), `escena.js` (cubierta, lomo, anillas, hoja), `bolsillo.js`, `pagina.js`, `ficha.js`, `animaciones.js`, `precarga.js`; estilos en `css/album-*.css`; orquestación en `js/album-prototipo.js`.

**Pruebas:** `node web/pruebas/node-album.mjs` (lógica) y `web/pruebas/index-album.html` (completa, en el navegador). Las de la Fase 2 no se han tocado (`pruebas/index.html`).

### Etapa 3.1.1: orden por Pokédex y mejoras visuales
- **Orden físico (fijo):** Pokémon por número de Pokédex Nacional (campo `dexId` del catálogo, nunca deducido del número de carta), empezando por Snivy #495; cada especie junta (dentro: expansión, rareza, nº de carta); **Victini (#494) al final de los Pokémon**; después los Partidarios. 158 cartas = 18 páginas, 4 huecos decorativos al final.
- **Promos:** TCGdex no da `dexId` para las `svp`; se toma de `datos/decisiones/promociones.json` (campo `dexId`, contrastado en WikiDex) y queda anotado en el catálogo (`origenDexId`).
- **Filtros** (Fulgor Negro, Llama Blanca, Promos, Pendientes) solo *resaltan*; no cambian el orden. Paginador ‹ › y flechas del teclado ← →; paso de página sin animación (el giro llega en la 3.2).
- **Pruebas nuevas:** `web/pruebas/pruebas-album.js` (orden Pokédex con el catálogo real, cantidades por id, sin pérdidas ni duplicados).

### Fase 3.2: giro 3D de hojas y navegación circular
- **Giro:** el álbum tiene dos hojas físicas (`.hoja`), cada una con cara frontal (bolsillos) y reverso neutro. Al navegar, la página de destino se monta en la hoja de reposo y la hoja que corresponde gira con `rotateY` alrededor del eje de las anillas (700 ms, WAAPI). Avanzar: la activa gira 0 → -180°. Retroceder: la hoja de la página anterior vuelve de -180° a 0° sobre la actual. Código en `js/album/giro.js`; estructura en `escena.js`; aspecto en `css/album-escena.css`.
- **Navegación circular:** `js/album/navegacion.js` (lógica pura). 18 → 1 es un giro hacia delante y 1 → 18 uno hacia atrás; los botones nunca se desactivan. Botones, teclado (← →) y gestos llaman a la misma función `navegar()`.
- **Gestos (iPhone):** deslizar a la izquierda = avanzar, a la derecha = retroceder (`js/album/gestos.js`); el scroll vertical y los toques sobre cartas no cambian de página.
- **URL:** `?pagina=N` se actualiza con `replaceState` (sin llenar el historial) y conserva otros parámetros.
- **Movimiento reducido** (botón o ajuste del sistema): cambio inmediato, sin giro.
- **Pruebas:** `web/pruebas/index-giro.html` (navegador, necesita Live Server: abre el álbum en un iframe con una base temporal `prueba-…`, no toca tu colección) y las lógicas en `index-album.html` / `node web/pruebas/node-album.mjs`.
- **Dos páginas enfrentadas (futuro):** bastaría que cada hoja guarde dos páginas de datos (2k-1 delante, 2k detrás) y que la cara trasera monte bolsillos en lugar del reverso neutro; el giro, la navegación y la URL no cambian.

## Fase 3.3.1 — Sistema de diseño y escritorio

Solo cambia el aspecto; no se ha tocado la lógica, IndexedDB, los datos ni las posiciones de las cartas.

| Archivo | Qué contiene |
|---|---|
| `css/tokens.css` | Única fuente de paleta, tipografías, radios, sombras, luz y texturas (variables CSS). |
| `css/album-escena.css` | Solo geometría 3D, perspectiva, pose del libro y capas. |
| `css/interfaz.css` | Columna de información tipo videojuego (título, polaroid de progreso, índice de pestañas, barra de teclas), marcadores de página a los lados del libro y versión móvil. |
| `css/entorno.css` | Escenario desenfocado (sala cálida con luces bokeh y escritorio de nogal), degradado lateral para el texto y el lápiz decorativo. |
| `css/archivador.css` | Materiales: cubierta de grafito, lomo, anillas, canto de hojas, vinilo. |
| `css/album-bolsillos.css` | Fundas transparentes y cartas (ya con la paleta nueva). |
| `js/album/escena.js` | Añade solo el contenedor decorativo `.objetos` (aria-hidden). |

**Procedencia de recursos:** todo es propio. Las texturas (cuero, madera, papel) se generan con filtros SVG (`feTurbulence`) incrustados en `tokens.css`; la etiqueta y el lápiz se dibujan con CSS. No hay imágenes ni fuentes descargadas, ni URLs externas. Tipografías: serif editorial del sistema (Iowan Old Style / Palatino / Georgia) para títulos y `system-ui` para el resto.
