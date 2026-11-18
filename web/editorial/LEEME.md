# Editorial — sistema visual común (biblioteca + álbum)

Dirección de **catálogo de diseño gráfico** (referencias: catálogos editoriales oscuros y la sobriedad de Apple): grafito enmarcado en negro,
titulares ligeros y grandes, etiquetas pequeñas en versalitas espaciadas, **un único acento rojo** (`#e5432f`) y controles finos de 1 px.
La jerarquía la dan tamaño, peso y espacio; el color lo ponen las cartas y las portadas.

`editorial.css`: tokens (`--e-*`), fondo enmarcado (`.e-fondo`), etiquetas (`.e-etiqueta`, `.e-rojo`), controles (`.e-caja`, `.e-llena`,
pestañas `.e-pestanas`, botón de icono `.e-redondo`) y avisos (`.e-aviso`).

- Biblioteca (`index.html`): carrusel de lomos (ver `web/estanteria/LEEME.md`).
- Álbum (`web/prueba-3d/`): tema `editorial`, por defecto desde la 3.10 (estudio oscuro, páginas grafito, aro rojo, «‹ Biblioteca»).
  Es el único tema del álbum (los alternativos se retiraron en 3.25; un `?tema=…` antiguo abre el editorial).

## Modo claro y modo oscuro (3.11)
`modo.js` (script clásico en `<head>` de las dos páginas, antes del primer pintado) pone `<html data-modo="claro|oscuro">`. Por defecto sigue al
sistema; el botón ◐ de la cabecera lo cambia y se recuerda (`localStorage`, clave `tcg.modo`, compartida entre biblioteca, álbum y pestañas).
En claro, el mismo catálogo «impreso en papel»: se invierten fondo, texto y líneas (tokens `--e-*` en `:root[data-modo="claro"]`); el rojo y la
retícula no cambian. En el álbum, `Aspecto.aplicarModo()` repinta el suelo para que se funda con el fondo y ajusta la exposición, sin recargar.

## Tapa y lomo editoriales (3.11)
El álbum es una edición de coleccionista: tela negra (acabado `editorial`, el del tema), portada negra con las dos cartas estrella como foto,
título «Teselia» en grotesca fina, expansiones en rojo y sello rojo «TCG»; la banda junto al lomo repite sello y título. En la biblioteca, el lomo
lleva el sello arriba, «TESELIA» en vertical con el subtítulo rojo en paralelo y, abajo, la marca marfil/negro, el código y el nº de cartas.
Dibujo en `web/prueba-3d/js/portada-tapa.js` (portada y banda, compartidas) y `web/estanteria/js/lomo-teselia.js` (lomo).

## Símbolo y favicon (3.21)
`marca.js` define el símbolo de la app —cuadrado rojo con dos cartas en abanico (una en contorno, la de delante blanca con su ventana de
ilustración)—, diseño propio sin marcas registradas. Una sola definición para el SVG (cabecera de la biblioteca, `favicon.svg`) y el Canvas
(sello de lomos, banda y portada). `favicon-32.png` y `apple-touch-icon.png` (180 px, icono de la pantalla de inicio en iPhone) salen del
mismo SVG. Las tres páginas (biblioteca, álbum y cuenta) enlazan los iconos.
