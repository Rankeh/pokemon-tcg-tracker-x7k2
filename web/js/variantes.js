// 3.16 · Variantes de una carta (normal, holo, reverse holo…): lógica PURA (sin IndexedDB ni DOM).
// Se guardan DENTRO de la fila de la carta en el almacén «copias», sin cambiar el esquema ni la versión de la base de datos:
//   { id, cantidad, actualizado, variantes?: { normal: 1, reverse: 2 }, mostrar?: 'reverse' }
// `cantidad` sigue siendo el TOTAL de copias (todo lo que ya existía —progreso, copias de seguridad v1, otras páginas— funciona igual).
// Σ variantes ≤ cantidad: la diferencia son copias «sin clasificar» (las que ya tenías antes de las variantes, o las de «añadir todas»).
import { sumarCopias, esCantidadValida } from "./coleccion.js";

/** Orden por defecto para elegir qué variante se ve en el álbum cuando no se ha elegido ninguna: la más vistosa primero. */
export const PRIORIDAD = ["holo", "reverse", "normal"];
export const NOMBRES = { normal: "Normal", holo: "Holo", reverse: "Reverse holo", firstEdition: "1.ª edición", wPromo: "Sello W" };

export const varianteValida = (v) => typeof v === "string" && /^[A-Za-z0-9-]{1,32}$/.test(v);
const suma = (vs) => Object.values(vs).reduce((s, n) => s + n, 0);

/** Zona de la ilustración en una carta normal (fracciones; arriba = 0) y tipo de brillo según la variante visible. «holo» brilla en la
 *  ilustración (o en toda la carta si es de arte completo); «reverse» en todo lo demás. Lo usan el bolsillo 3D y la ficha. */
export const VENTANA_ARTE = { x0: 0.08, x1: 0.92, y0: 0.105, y1: 0.47 };   // 3.30: medida en las imágenes (antes 0,53 tapaba la franja de datos)
/** 3.30 · Intensidad del brillo en el álbum 3D: franjas de arcoíris (alfa alterna) × opacidad del material. El brillo se SUMA a la luz de la
 *  carta, así que se mantiene bajo (alfa efectiva ≤ 0,12; antes 0,30 y aclaraba toda la ilustración). */
export const BRILLO = { franjas: [0.1, 0.28], opacidad: 0.4, destellos: 120, destelloMax: 0.35 };
/** 3.18 · Catálogos SIN variantes (Teselia): las ilustraciones raras (IR/SIR, partidarios SIR) y las promos son holo de por sí. */
export const CATEGORIAS_HOLO = ["ir", "sir", "partidario", "promo"];
export const holoImplicito = (carta) => !(Array.isArray(carta.variantes) && carta.variantes.length) && CATEGORIAS_HOLO.includes(carta.categoriaColeccion);
/** Ilustración a sangre: el brillo holo cubre toda la carta (IR/SIR y partidarios SIR, o lo que marque el catálogo: galerías GG/TG). */
export const esArteCompleto = (carta) => Boolean(carta.arteCompleto) || ["ir", "sir", "partidario"].includes(carta.categoriaColeccion);
export const tipoBrillo = (variante, arteCompleto) => (variante === "holo" ? (arteCompleto ? "holo-completo" : "holo-arte") : variante === "reverse" ? "reverse" : null);

/** PURO · normaliza una fila guardada (o undefined) a { cantidad, variantes, mostrar }. Nunca lanza: lo inválido se descarta. */
export function normalizar(fila) {
  const variantes = {};
  if (fila && fila.variantes && typeof fila.variantes === "object") {
    for (const [v, n] of Object.entries(fila.variantes)) if (varianteValida(v) && esCantidadValida(n) && n > 0) variantes[v] = n;
  }
  const base = fila && esCantidadValida(fila.cantidad) ? fila.cantidad : 0;
  const cantidad = Math.max(base, suma(variantes));                   // por si alguien escribió variantes de más: nunca se pierden copias
  const mostrar = fila && varianteValida(fila.mostrar) ? fila.mostrar : null;
  return { cantidad, variantes, mostrar };
}

/** PURO · copias sin variante asignada. */
export const sinClasificar = (r) => r.cantidad - suma(r.variantes);

/** PURO · ¿qué variante se ve en el álbum? La elegida si sigue teniendo copias; si no, la más vistosa que tengas; null si ninguna. */
export function aMostrar(r, disponibles = PRIORIDAD) {
  if (r.mostrar && r.variantes[r.mostrar] > 0) return r.mostrar;
  const orden = [...PRIORIDAD.filter((v) => disponibles.includes(v)), ...disponibles.filter((v) => !PRIORIDAD.includes(v))];
  return orden.find((v) => r.variantes[v] > 0) || Object.keys(r.variantes).find((v) => r.variantes[v] > 0) || null;
}

/** PURO · suma/resta una copia de una variante. El total cambia en lo mismo; las copias sin clasificar no se tocan. */
export function cambiarVariante(r, variante, delta) {
  if (!varianteValida(variante)) throw new RangeError("Variante no válida: " + variante);
  const variantes = { ...r.variantes }, antes = variantes[variante] || 0;
  const despues = Math.min(sumarCopias(antes, delta), antes + (999 - r.cantidad));   // el total nunca pasa de 999
  if (despues > 0) variantes[variante] = despues; else delete variantes[variante];
  const cantidad = r.cantidad + (despues - antes);
  let mostrar = r.mostrar;
  if (despues > antes && !(mostrar && variantes[mostrar] > 0)) mostrar = variante;    // la primera variante que consigues pasa a verse
  if (mostrar && !(variantes[mostrar] > 0)) mostrar = null;
  return { cantidad, variantes, mostrar };
}

/** PURO · asigna UNA copia sin clasificar a una variante (el total no cambia). Sin copias sin clasificar, no hace nada. */
export function clasificar(r, variante) {
  if (!varianteValida(variante)) throw new RangeError("Variante no válida: " + variante);
  if (sinClasificar(r) <= 0) return r;
  const variantes = { ...r.variantes, [variante]: (r.variantes[variante] || 0) + 1 };
  return { cantidad: r.cantidad, variantes, mostrar: r.mostrar && variantes[r.mostrar] > 0 ? r.mostrar : variante };
}

/** PURO · fija la variante visible (solo si tienes copias de ella; null = automática). */
export function fijarMostrar(r, variante) {
  if (variante === null) return { ...r, mostrar: null };
  if (!varianteValida(variante) || !(r.variantes[variante] > 0)) return r;
  return { ...r, mostrar: variante };
}

/** PURO · cambio del TOTAL sin variante (pantallas antiguas, «añadir todas»): +1 suma una copia sin clasificar; −1 quita primero de las
 *  sin clasificar y, si no hay, de la variante con más copias que no sea la visible (y si no, de la visible). */
export function cambiarTotal(r, delta) {
  if (delta >= 0) return { ...r, cantidad: sumarCopias(r.cantidad, delta) };
  let q = -delta, variantes = { ...r.variantes }, cantidad = r.cantidad;
  const libres = Math.min(q, sinClasificar(r)); cantidad -= libres; q -= libres;
  while (q > 0 && Object.keys(variantes).length) {
    const orden = Object.keys(variantes).sort((a, b) => (a === r.mostrar) - (b === r.mostrar) || variantes[b] - variantes[a]);
    const v = orden[0]; variantes[v]--; cantidad--; q--;
    if (!variantes[v]) delete variantes[v];
  }
  const mostrar = r.mostrar && variantes[r.mostrar] > 0 ? r.mostrar : null;
  return { cantidad: Math.max(0, cantidad), variantes, mostrar };
}

/** PURO · fila lista para guardar (o null si se queda a 0 y hay que borrarla). Solo incluye variantes/mostrar si hay algo que guardar. */
export function aFila(id, r, ahora = new Date().toISOString()) {
  if (!(r.cantidad > 0)) return null;
  const f = { id, cantidad: r.cantidad, actualizado: ahora };
  if (Object.keys(r.variantes).length) f.variantes = { ...r.variantes };
  if (r.mostrar && r.variantes[r.mostrar] > 0) f.mostrar = r.mostrar;
  return f;
}

/** PURO · al fijar un total nuevo (importar/reemplazar) se conserva el desglose si sigue siendo coherente (Σ ≤ total). */
export function conTotal(r, total) {
  if (total === r.cantidad) return r;
  if (suma(r.variantes) <= total) return { ...r, cantidad: total };
  return { cantidad: total, variantes: {}, mostrar: null };
}
