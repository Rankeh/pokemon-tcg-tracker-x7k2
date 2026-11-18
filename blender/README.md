# Modelo 3D del álbum

Genera el GLB que usa el visor (`web/prueba-3d/modelo/`) en **Python puro**, sin Blender: tapas, lomo y N hojas con 18 bolsillos vacíos
cada una (las cartas las coloca el visor según la colección).

```bash
python blender/exportar_glb.py
```
```bash
python blender/exportar_glb.py --hojas 3
```
El primero genera `album.glb` (9 hojas, Teselia); con `--hojas n` sale `album-<n>h.glb`, que el visor elige solo según el número de cartas
del álbum. `herramientas/catalogo-ilustrador/actualizar.py` lo ejecuta cuando un álbum de artista crece.

| Archivo | Qué hace |
|---|---|
| `teselia/modelo_web.py` | Árbol de nodos del álbum (tapa, hojas pivote, bolsillos) y sus mallas |
| `teselia/geometria.py` | Utilidades de geometría (rectángulos redondeados, losas biseladas) |
| `teselia/glb.py` | Escritor glTF binario |
| `configuracion.json` | Medidas del álbum |
| `pruebas_glb.py` | Pruebas: estructura del GLB, normales, UV, separación de piezas y nombres |

(La antigua prueba de concepto con escenas renderizadas en Blender se retiró en la 3.23; está en la rama `respaldo-antes-de-limpieza`.)
