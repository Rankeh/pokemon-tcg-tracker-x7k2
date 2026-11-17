# Diorama — sistema visual común (estantería + álbum)

Una sola ilustración para toda la app, en estilo **diorama pintado a mano**: piezas de juguete sobre una isla recortada que flota sobre papel
crema, con el corte de tierra y agua a la vista, luz de día, colores saturados y texturas de pincelada (gouache). Es una dirección de estilo propia:
no reproduce personajes, lugares ni elementos de ninguna obra concreta.

| Archivo | Qué hace |
|---|---|
| `pintura.js` | Paleta común (`PALETA`) y texturas por código: pinceladas, hierba, corte de tierra, corte y superficie de agua, copas de árbol, madera y cielo en arco |
| `isla.js` | Isla 3D (Three.js): tierra con hierba y corte pintado, franja de agua con nenúfares, árboles, matas y fondo en arco opcional |
| `diorama.css` | Interfaz: fondo de papel (`.d-fondo`), paneles (`.d-panel`), botones de juguete (`.d-boton` + `.d-verde` acción, `.d-azul` navegar, `.d-madera` volver), chapas y avisos |

**Dónde se usa**
- La biblioteca pasó a la dirección editorial (ver `web/editorial/LEEME.md`); este sistema queda para el tema `?tema=diorama` del álbum.
- Álbum (`web/prueba-3d/`): tema `diorama` (`?tema=diorama`; fue el de por defecto en la 3.9). El álbum se apoya en una isla pequeña; la interfaz usa los mismos
  componentes y el botón **‹ Biblioteca** vuelve a la estantería. Los temas anteriores siguen disponibles: `?tema=claro`, `?tema=acogedor`, `?tema=noche`.

**Rendimiento:** todas las texturas se generan una vez por página (resolución según la calidad: baja ½, media ¾, alta completa); geometrías y
materiales compartidos; sin sombras en tiempo real ni desenfoques CSS. En el álbum la isla se carga después del primer dibujo y, si no puede
montarse, el álbum sigue funcionando sin ella.
