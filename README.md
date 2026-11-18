# Pokémon TCG Tracker

Biblioteca personal de álbumes de cartas del JCC Pokémon: una estantería 3D con tus álbumes y, dentro de cada uno, un álbum 3D que se hojea
y donde marcas las cartas que tienes (con variantes, precios de Cardmarket y copias de seguridad).

**Web:** https://rankeh.github.io/pokemon-tcg-tracker-x7k2/ (GitHub Pages, desde `main`).

## Álbumes
| Álbum | Cartas | Catálogo |
|---|---|---|
| Teselia — Llama Blanca · Fulgor Negro | 158 (IR, SIR y promos) | `datos/catalogo/coleccion-teselia.json` |
| Asako Ito — colección de artista | todas sus cartas físicas | `datos/catalogo/coleccion-asako-ito.json` |
| osare — colección de artista | todas sus cartas físicas | `datos/catalogo/coleccion-osare.json` |

Los álbumes de artista se actualizan solos cada lunes con las cartas nuevas (`.github/workflows/actualizar-artistas.yml`).

## Estructura
| Carpeta | Qué hay |
|---|---|
| `index.html`, `web/estanteria/` | Biblioteca: carrusel 3D de lomos |
| `web/prueba-3d/` | Visor del álbum 3D (`?album=<id>`) |
| `web/editorial/` | Sistema visual común (tokens, modo claro/oscuro, símbolo y favicon) |
| `web/js/` | Colección: IndexedDB (`almacen.js`), reglas, variantes, copias de seguridad, cuenta (Supabase) |
| `web/prueba-almacenamiento.html` | Exportar e importar copias de seguridad de la colección |
| `datos/` | Catálogos y precios (se generan desde TCGdex) |
| `herramientas/` | Generadores: catálogo de Teselia (Java), catálogos de artista, imágenes, precios y cartas proxy (Python) |
| `blender/` | Generador del modelo 3D del álbum (`album.glb`, `album-<n>h.glb`) en Python puro |

## Probar en local
Sirve la carpeta raíz (por ejemplo, Live Server en VS Code o `python -m http.server`) y abre `index.html`.
La web usa Three.js 0.160 desde jsDelivr (o una copia local, ver `web/vendor/LEEME.md`).

## Pruebas
```bash
node --test web/estanteria/pruebas/*.test.mjs web/prueba-3d/pruebas/*.test.mjs
```
```bash
node web/pruebas/node.mjs && node web/pruebas/node-album.mjs
```
```bash
python blender/pruebas_glb.py
```
En navegador (Chromium + Playwright, IndexedDB real en bases de datos desechables):
`node web/prueba-3d/pruebas/ejecutar-pagina.mjs`, `ejecutar-navegador.mjs`, `ejecutar-completar.mjs` y `ejecutar-variantes.mjs`.

Uso personal y sin ánimo de lucro. Datos de cartas: TCGdex. Pokémon y sus ilustraciones © The Pokémon Company, Nintendo, Creatures y GAME FREAK.
