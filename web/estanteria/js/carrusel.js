// Carrusel de lomos (PURO, sin Three.js): una sola fila horizontal de álbumes de pie. El seleccionado sale hacia delante y gira para enseñar
// la portada en el centro; los demás se apartan a los lados mostrando solo el lomo. Unidades: metros; y = 0 es la línea de apoyo.
import { LIBRO } from './disposicion.js';
import { plano } from '../../js/texto.js';

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
export function elementos(albumes, serie = null, coincidencias = null) {
  const lista = albumes.filter((a) => (!serie || a.serie === serie) && (!coincidencias || coincidencias.has(a.id)))
    .map((a) => ({ tipo: 'album', id: a.id, album: a, ...(coincidencias ? { encontradas: coincidencias.get(a.id) } : {}) }));
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

// 3.46 · los nombres de las cartas se normalizan una sola vez (la búsqueda recorre todos los de todos los álbumes en cada tecla)
const planos = new Map();
const planoDe = (n) => { let p = planos.get(n); if (p === undefined) { p = plano(n); planos.set(n, p); } return p; };

/** PURO · 3.46 · buscar una carta en los álbumes: `indice` = Map(id del álbum → nombres de sus cartas). Devuelve Map(id → nº de cartas
 *  que coinciden), solo los álbumes que tienen alguna; null si no se busca nada (menos de 2 letras). «meowth» encuentra Meowth, Meowth V,
 *  Meowth de Galar, Alolan Meowth… (contiene, sin tildes ni mayúsculas). */
export function albumesConCarta(indice, texto) {
  const t = plano(texto);
  if (t.length < 2) return null;
  const res = new Map();
  for (const [id, nombres] of indice) {
    const n = nombres.reduce((k, x) => k + (planoDe(x).includes(t) ? 1 : 0), 0);
    if (n) res.set(id, n);
  }
  return res;
}

/** PURO · 3.47 · texto predictivo de «Buscar carta»: nombres de cartas de tus álbumes que contienen lo escrito. Primero los que empiezan
 *  por ello, y entre ellos los más cortos («Meowth» antes que «Meowth V»: elegirlo ya encuentra todas sus variantes). [{ nombre, albumes }] */
export function sugerencias(indice, texto, max = 8) {
  const t = plano(texto);
  if (!t) return [];
  const nombres = new Map();                                    // nombre plano → { nombre, albumes: Set }
  for (const [id, lista] of indice) for (const n of lista) {
    const k = planoDe(n);
    if (!k.includes(t)) continue;
    if (!nombres.has(k)) nombres.set(k, { nombre: n, albumes: new Set() });
    nombres.get(k).albumes.add(id);
  }
  return [...nombres.entries()]
    .sort(([a], [b]) => Number(b.startsWith(t)) - Number(a.startsWith(t)) || a.length - b.length || a.localeCompare(b, 'es'))
    .slice(0, max).map(([k, v]) => ({ nombre: v.nombre, albumes: v.albumes.size, exacto: k === t }));
}
