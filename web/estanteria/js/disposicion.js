// Disposición de la estantería (PURO, sin Three.js): medidas del mueble, huecos por balda, qué va en cada hueco y dónde está en metros.
// Unidades: metros. Ejes: x a la derecha, y hacia arriba (y = 0 en el suelo), z hacia la cámara (z = 0 en el canto delantero de las baldas).

/** Medidas del álbum 3D existente (modelo/album.glb): 258 mm de tapa + 10 mm de lomo, 322 mm de alto y 46,5 mm de grosor cerrado. */
export const LIBRO = { grueso: 0.0465, alto: 0.322, fondo: 0.268 };

export const MUEBLE = {
  holgura: 0.0115,          // separación entre lomos
  margen: 0.016,            // aire entre el lateral y el primer/último hueco
  aireArriba: 0.058,        // espacio libre sobre los libros en cada balda
  balda: 0.024,             // grosor de las baldas
  lateral: 0.03,            // grosor de los laterales
  fondo: 0.31,              // profundidad interior
  retranqueo: 0.014,        // los lomos quedan algo por detrás del canto de la balda
  zocalo: 0.07,             // pie del mueble
  corona: 0.05,             // remate superior
};
export const PASO = LIBRO.grueso + MUEBLE.holgura;
export const ALTO_HUECO = LIBRO.alto + MUEBLE.aireArriba;

/** PURO · baldas que se ven a la vez: en vertical algo menos de dos, para que los lomos se vean grandes en el iPhone. */
export const altoVisibleEnBaldas = (aspecto) => (aspecto < 0.8 ? 1.75 : 2.05);

/** PURO · huecos por balda según la proporción de la pantalla (ancho/alto). En vertical pocos y grandes; en horizontal más, sin que los lomos se encojan. */
export function huecosPorBalda(aspecto) {
  if (!(aspecto > 0)) return 6;
  const baldasVisibles = altoVisibleEnBaldas(aspecto);                      // cuántas baldas caben en alto
  const altoVisible = baldasVisibles * (ALTO_HUECO + MUEBLE.balda);
  // en horizontal el mueble ocupa ~la mitad del ancho: alrededor se ve la isla, los árboles y el recorte del diorama sobre el papel
  const anchoUtil = altoVisible * aspecto * (aspecto < 0.8 ? 0.94 : 0.5) - 2 * (MUEBLE.lateral + MUEBLE.margen);
  return Math.max(4, Math.min(18, Math.floor(anchoUtil / PASO)));
}

/**
 * PURO · Coloca los álbumes, el lomo «Nuevo álbum» y el sujetalibros. Los huecos que sobran quedan VACÍOS (no se rellenan con libros ficticios).
 * Siempre hay al menos `minBaldas` y una balda con hueco libre detrás del último elemento, para que la biblioteca pueda crecer.
 */
export function disponer({ albumes = [], huecos = 6, minBaldas = 3 } = {}) {
  // orden: álbumes · sujetalibros (cierra la fila de libros; solo si hay álbumes y cabe en su balda) · «Nuevo álbum» · huecos vacíos
  const pos = (i) => ({ balda: Math.floor(i / huecos), hueco: i % huecos });
  const elementos = albumes.map((a, i) => ({ tipo: 'album', id: a.id, ...pos(i) }));
  const n = albumes.length;
  const conSujeta = n > 0 && pos(n).balda === pos(n - 1).balda;
  const sujetalibros = conSujeta ? pos(n) : null;
  const iNuevo = n + (conSujeta ? 1 : 0);
  elementos.push({ tipo: 'nuevo', id: 'nuevo', ...pos(iNuevo) });
  const ocupados = iNuevo + 1;
  const baldas = Math.max(minBaldas, Math.ceil((ocupados + 1) / huecos));    // siempre queda sitio libre para crecer
  return { huecos, baldas, elementos, sujetalibros, vacios: baldas * huecos - ocupados };
}

/** PURO · Medidas totales del mueble para `huecos` × `baldas`. */
export function medidasMueble(huecos, baldas) {
  const interior = huecos * PASO + 2 * MUEBLE.margen;
  const ancho = interior + 2 * MUEBLE.lateral;
  const alto = MUEBLE.zocalo + baldas * (ALTO_HUECO + MUEBLE.balda) + MUEBLE.balda + MUEBLE.corona;
  return { interior, ancho, alto, fondo: MUEBLE.fondo };
}

/** PURO · y de la cara superior de la balda `b` (0 = la de arriba). */
export function ySueloBalda(b, baldas) {
  return MUEBLE.zocalo + MUEBLE.balda + (baldas - 1 - b) * (ALTO_HUECO + MUEBLE.balda);
}

/** PURO · centro (x, y, z) del libro en el hueco indicado. */
export function posicionLibro({ balda, hueco }, huecos, baldas) {
  const { interior } = medidasMueble(huecos, baldas);
  return {
    x: -interior / 2 + MUEBLE.margen + PASO * (hueco + 0.5),
    y: ySueloBalda(balda, baldas) + LIBRO.alto / 2,
    z: -MUEBLE.retranqueo - LIBRO.fondo / 2,
  };
}

/** PURO · y del centro de la balda `b` (para la cámara). */
export const yCentroBalda = (b, baldas) => ySueloBalda(b, baldas) + ALTO_HUECO / 2;
