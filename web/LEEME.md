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

## Etapa 3.1 — Prototipo del álbum 3D (`album-prototipo.html`)

**Cómo abrirlo (Live Server):** abre VS Code en la carpeta raíz del repositorio (`pokemon-tcg-tracker-x7k2`, no en `web/`), clic derecho en `web/album-prototipo.html` → *Open with Live Server*. Alternativa sin extensiones: `jwebserver -d .` en la raíz y abrir `http://localhost:8000/web/album-prototipo.html`. Hace falta servidor (no doble clic) porque carga el catálogo con `fetch`. Para ver una sección: `?seccion=fn|lw|promo`.

**Probar la animación de inserción:** pulsa un bolsillo pendiente → *Añadir* → la ficha se cierra, la carta vuela, queda suspendida sobre la boca de la funda y se desliza dentro. Con 2.ª copia solo sube el contador (×2). *Retirar* hasta 0 hace el recorrido inverso. Activa «Reducir movimiento» (o el ajuste del sistema) para ver la alternativa sin movimiento.

**Comprobar persistencia:** añade una carta, recarga la página (F5): sigue ahí. DevTools → Application → IndexedDB → `coleccion-teselia` → `copias`: una fila `id → cantidad` por carta con ≥1 copia (a 0 no queda fila).

**Estructura:** `js/album/` — `distribucion.js` (reparto en páginas, puro), `modelo.js` (lee/escribe vía `Almacen`), `escena.js` (cubierta, lomo, anillas, hoja), `bolsillo.js`, `pagina.js`, `ficha.js`, `animaciones.js`, `precarga.js`; estilos en `css/album-*.css`; orquestación en `js/album-prototipo.js`.

**Pruebas:** `node web/pruebas/node-album.mjs` (lógica) y `web/pruebas/index-album.html` (completa, en el navegador). Las de la Fase 2 no se han tocado (`pruebas/index.html`).
