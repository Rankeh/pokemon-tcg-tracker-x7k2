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
