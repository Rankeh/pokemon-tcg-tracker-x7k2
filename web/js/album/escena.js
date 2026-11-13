// Construye la escena 3D del archivador (cubierta, lomo, anillas, grosor de páginas, hoja de bolsillos).
// Solo crea estructura: el aspecto está en css/album-escena.css.

function el(doc, clase, etiqueta = "div") {
  const e = doc.createElement(etiqueta);
  e.className = clase;
  return e;
}

export function crearEscena(contenedor, doc = document) {
  const mesa = el(doc, "mesa");
  const album = el(doc, "album");

  const sombra = el(doc, "album-sombra");
  const cubierta = el(doc, "album-cubierta");
  const lomo = el(doc, "album-lomo");
  for (let i = 0; i < 3; i++) lomo.append(el(doc, "anilla"));

  // Hojas apiladas por detrás: dan grosor visible en el borde inferior y derecho.
  const grosor = el(doc, "album-grosor");
  for (let i = 0; i < 6; i++) grosor.append(el(doc, "hoja-trasera"));

  const hoja = el(doc, "hoja");
  const perforaciones = el(doc, "perforaciones");
  for (let i = 0; i < 3; i++) perforaciones.append(el(doc, "perforacion"));
  const bolsillos = el(doc, "hoja-bolsillos");
  const reflejo = el(doc, "hoja-reflejo");
  hoja.append(perforaciones, bolsillos, reflejo);

  const canto = el(doc, "album-canto");
  album.append(sombra, cubierta, lomo, grosor, canto, hoja);
  mesa.append(album);
  contenedor.replaceChildren(mesa);
  return { mesa, album, hoja, bolsillos };
}
