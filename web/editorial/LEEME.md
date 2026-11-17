# Editorial — sistema visual común (biblioteca + álbum)

Dirección de **catálogo de diseño gráfico** (referencias: catálogos editoriales oscuros y la sobriedad de Apple): grafito enmarcado en negro,
titulares ligeros y grandes, etiquetas pequeñas en versalitas espaciadas, **un único acento rojo** (`#e5432f`) y controles finos de 1 px.
La jerarquía la dan tamaño, peso y espacio; el color lo ponen las cartas y las portadas.

`editorial.css`: tokens (`--e-*`), fondo enmarcado (`.e-fondo`), etiquetas (`.e-etiqueta`, `.e-rojo`), controles (`.e-caja`, `.e-llena`,
pestañas `.e-pestanas`, botón de icono `.e-redondo`) y avisos (`.e-aviso`).

- Biblioteca (`index.html`): carrusel de lomos (ver `web/estanteria/LEEME.md`).
- Álbum (`web/prueba-3d/`): tema `editorial`, por defecto desde la 3.10 (estudio oscuro, páginas grafito, aro rojo, «‹ Biblioteca»).
  Los demás temas siguen disponibles: `?tema=diorama`, `?tema=claro`, `?tema=acogedor`, `?tema=noche`.
