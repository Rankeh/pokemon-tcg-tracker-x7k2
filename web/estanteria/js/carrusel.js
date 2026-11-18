// Carrusel de lomos (PURO, sin Three.js): una sola fila horizontal de álbumes de pie. El seleccionado sale hacia delante y gira para enseñar
// la portada en el centro; los demás se apartan a los lados mostrando solo el lomo. Unidades: metros; y = 0 es la línea de apoyo.
import { LIBRO } from './disposicion.js';

export const CARRUSEL = {
  hueco: 0.016,          // separación entre lomos
  aire: 0.034,           // aire a cada lado de la portada seleccionada
  salida: 0.06,          // cuánto sale hacia la cámara el libro elegido
  levante: 0.006,        // y cuánto sube (como al sacarlo con la mano)
};

/**
 * PURO · pose de cada elemento para la selección `sel` (índice). Devuelve [{ x, y, z, giro }] (giro en radianes alrededor de Y:
 * 0 = lomo a la cámara, −π/2 = portada a la cámara). La selección siempre queda en x = 0: lo que se mueve es la fila.
 */
export function poses(n, sel, gruesos = []) {
  const s = Math.max(0, Math.min(n - 1, sel)), g = (i) => gruesos[i] ?? LIBRO.grueso;   // 3.20: cada álbum con su grosor real
  const x = new Array(n).fill(0);
  for (const lado of [-1, 1]) {
    let cursor = LIBRO.fondo / 2 + CARRUSEL.aire;                // borde exterior de la portada abierta
    for (let i = s + lado; i >= 0 && i < n; i += lado) { x[i] = lado * (cursor + g(i) / 2); cursor += g(i) + CARRUSEL.hueco; }
  }
  return Array.from({ length: n }, (_, i) => (i === s
    ? { x: 0, y: LIBRO.alto / 2 + CARRUSEL.levante, z: CARRUSEL.salida, giro: -Math.PI / 2 }
    : { x: x[i], y: LIBRO.alto / 2, z: 0, giro: 0 }));
}

/** PURO · índice válido tras moverse `delta` posiciones (sin dar la vuelta: al final se queda en el extremo). */
export const mover = (n, sel, delta) => Math.max(0, Math.min(n - 1, sel + delta));

/** PURO · elementos del carrusel: los álbumes (filtrados por serie si se pide) y, al final, el lomo «Nuevo álbum». */
export function elementos(albumes, serie = null) {
  const lista = albumes.filter((a) => !serie || a.serie === serie).map((a) => ({ tipo: 'album', id: a.id, album: a }));
  lista.push({ tipo: 'nuevo', id: 'nuevo' });
  return lista;
}

/** PURO · series presentes (para las pestañas), en orden de aparición. */
export function series(albumes) {
  const vistas = new Map();
  for (const a of albumes) if (a.serie && !vistas.has(a.serie)) vistas.set(a.serie, a.nombreSerie || a.serie);
  return [...vistas].map(([id, nombre]) => ({ id, nombre }));
}

/**
 * PURO · encuadre: alto visible (m) para que el libro abierto de cara ocupe ~la mitad del alto y, en vertical, quepan la portada y un
 * poco de los lomos vecinos. `aspecto` = ancho/alto del lienzo.
 */
export function altoVisible(aspecto) {
  const porAlto = LIBRO.alto / 0.5;
  const porAncho = (LIBRO.fondo + 2 * (CARRUSEL.aire + LIBRO.grueso * 1.2)) / Math.max(0.1, aspecto);
  return Math.max(porAlto, porAncho);
}
