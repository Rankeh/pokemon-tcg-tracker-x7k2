// Construye la escena 3D del archivador (cubierta, lomo, anillas, grosor de páginas y DOS hojas físicas).
// Cada hoja tiene cara frontal (bolsillos) y cara trasera neutra; solo una está "activa" (visible y pulsable),
// la otra espera debajo para el giro. Solo crea estructura: el aspecto está en css/album-escena.css.

function el(doc, clase) {
  const e = doc.createElement("div");
  e.className = clase;
  return e;
}

function crearHoja(doc) {
  const hoja = el(doc, "hoja");
  const frontal = el(doc, "cara-frontal");
  const perforaciones = el(doc, "perforaciones");
  for (let i = 0; i < 3; i++) perforaciones.append(el(doc, "perforacion"));
  const bolsillos = el(doc, "hoja-bolsillos");
  const reflejo = el(doc, "hoja-reflejo");
  const velo = el(doc, "velo");
  frontal.append(perforaciones, bolsillos, reflejo, velo);

  // Reverso neutro (sin cartas): mismo material, con sus perforaciones, hasta que exista el modelo de hojas de doble cara.
  const trasera = el(doc, "cara-trasera");
  const perforacionesT = el(doc, "perforaciones");
  for (let i = 0; i < 3; i++) perforacionesT.append(el(doc, "perforacion"));
  const veloT = el(doc, "velo");
  trasera.append(perforacionesT, el(doc, "reverso-brillo"), veloT);

  hoja.append(frontal, trasera);
  return { hoja, frontal, trasera, bolsillos, velo, veloTrasero: veloT };
}

/** Objetos decorativos del escritorio (solo adorno: aria-hidden, sin eventos). Aspecto en css/entorno.css. */
function crearObjetos(doc) {
  const objetos = el(doc, "objetos");
  objetos.setAttribute("aria-hidden", "true");
  const etiqueta = el(doc, "etiqueta-coleccion");
  etiqueta.innerHTML = "<small>Colección</small><strong>Teselia</strong><i></i><span>Ilustraciones especiales</span>";
  objetos.append(etiqueta, el(doc, "lapiz"));
  return objetos;
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
  for (let i = 0; i < 8; i++) grosor.append(el(doc, "hoja-trasera"));

  const hojas = [crearHoja(doc), crearHoja(doc)];
  hojas[0].hoja.classList.add("activa");
  hojas[1].hoja.classList.add("reposo");

  album.append(sombra, cubierta, lomo, grosor, hojas[0].hoja, hojas[1].hoja);
  mesa.append(crearObjetos(doc), album);
  contenedor.replaceChildren(mesa);

  const escena = {
    mesa, album, hojas,
    indiceActiva: 0,
    get activa() { return hojas[this.indiceActiva]; },
    get reposo() { return hojas[1 - this.indiceActiva]; },
    /** Contenedor de bolsillos de la hoja ACTIVA (lo que usan fichas e inserción/extracción). */
    get bolsillos() { return this.activa.bolsillos; },
    /** La hoja de reposo pasa a ser la activa. */
    intercambiar() {
      this.activa.hoja.classList.replace("activa", "reposo");
      this.indiceActiva = 1 - this.indiceActiva;
      this.activa.hoja.classList.replace("reposo", "activa");
    },
  };
  return escena;
}
