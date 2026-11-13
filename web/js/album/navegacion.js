// Navegación circular de páginas: lógica pura (sin DOM) que comparten botones, teclado y gestos.
// 1 → 2 → … → N → 1 …   y   3 → 2 → 1 → N → N-1 …

export const ADELANTE = "adelante";
export const ATRAS = "atras";

/** Página siguiente (circular). Con 18 páginas: 18 → 1. */
export const siguiente = (actual, total) => (actual % total) + 1;
/** Página anterior (circular). Con 18 páginas: 1 → 18. */
export const anterior = (actual, total) => ((actual - 2 + total) % total) + 1;

/** Destino y sentido del giro para una orden "adelante" o "atras". */
export function destino(actual, sentido, total) {
  return sentido === ATRAS ? anterior(actual, total) : siguiente(actual, total);
}

/** Sentido del giro para ir de una página a OTRA vecina; null si no son vecinas. */
export function sentidoEntre(desde, hasta, total) {
  if (siguiente(desde, total) === hasta) return ADELANTE;
  if (anterior(desde, total) === hasta) return ATRAS;
  return null;
}

/** Lee ?pagina=N: entero dentro de 1..total; si es inválida → 1, si se pasa de rango se ajusta al límite más cercano. */
export function leerPagina(search, total) {
  const bruto = new URLSearchParams(search).get("pagina");
  const n = /^-?\d+$/.test(bruto ?? "") ? parseInt(bruto, 10) : NaN;
  if (!Number.isInteger(n)) return 1;
  return Math.min(total, Math.max(1, n));
}

/** Devuelve la URL con ?pagina=N conservando el resto de parámetros y el hash. */
export function urlConPagina(href, pagina) {
  const u = new URL(href);
  u.searchParams.set("pagina", String(pagina));
  return u.toString();
}
