# Web

| Archivo | Para qué sirve |
|---|---|
| `js/almacen.js` | IndexedDB (`coleccion-teselia`, almacén `copias`): cantidades y variantes por id de carta, importar y deshacer |
| `js/coleccion.js` | Reglas: cantidad 0..999, «conseguida» = 1 o más, progreso sobre el catálogo |
| `js/variantes.js` | Variantes de carta (normal / reverse / holo), variante visible y brillo |
| `js/copias.js` | Copias de seguridad JSON (v2, con variantes; lee las v1) |
| `js/album/distribucion.js`, `js/album/modelo.js` | Orden por Pokédex y reparto en páginas; modelo de la colección sobre el almacén |
| `js/imagen.js`, `css/base.css`, `css/tokens.css` | Página de copias de seguridad y página de cuenta |
| `js/cuenta.js`, `js/supabase-config.js`, `cuenta.html` | Cuenta de usuario (Supabase Auth) |
| `prueba-almacenamiento.html` | Exportar e importar la colección |
| `estanteria/` | Biblioteca (pantalla principal) |
| `prueba-3d/` | Visor del álbum 3D |
| `editorial/` | Sistema visual común, modo claro/oscuro, símbolo y favicon |
| `diorama/` | Tema alternativo del álbum (`?tema=diorama`) |
| `pruebas/` | Pruebas de la colección y de la distribución (`node pruebas/node.mjs`, `node pruebas/node-album.mjs`, o abrir `pruebas/index.html`) |

`package.json` solo marca los `.js` como módulos ES para poder probarlos con Node (no hace falta npm).
