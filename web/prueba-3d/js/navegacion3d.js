// Navegación por hojas (PURA): traduce entre páginas del catálogo (1..18) y "vueltas" del álbum 3D (0 = cerrado ... 10 = todo girado),
// genera el indicador y decide qué páginas necesitan textura. Reutiliza paginasVisibles() del adaptador.
import { paginasVisibles } from './adaptador-coleccion.js';

/** Vueltas con las que la página p queda a la vista: las impares quedan a la derecha (v = (p+1)/2) y las pares a la izquierda (v = p/2+1). */
export const vueltasParaPagina = (p) => (p % 2 === 1 ? (p + 1) / 2 : p / 2 + 1);

/** «Álbum cerrado», «Páginas 4–5 de 18», «Página 1 de 18», «Página 18 de 18», «Contratapa». */
export function etiquetaPaginas(vueltas, total) {
  const { izquierda: i, derecha: d } = paginasVisibles(vueltas, total);
  if (vueltas <= 0) return 'Álbum cerrado';
  if (i && d) return `Páginas ${i}–${d} de ${total}`;
  if (i || d) return `Página ${i || d} de ${total}`;
  return 'Contratapa';
}

/** Páginas que necesitan imagen: las visibles en los estados `centros` (prioridad 0) y las de estados vecinos a ±radio (prioridad d). */
export function paginasNecesarias(centros, total, radio = 1) {
  const mapa = new Map();       // pagina -> prioridad (menor = antes)
  for (const c of centros) {
    for (let d = 0; d <= radio; d++) {
      for (const v of d === 0 ? [c] : [c - d, c + d]) {
        const { izquierda, derecha } = paginasVisibles(v, total);
        for (const p of [izquierda, derecha]) if (p && (!mapa.has(p) || mapa.get(p) > d)) mapa.set(p, d);
      }
    }
  }
  return mapa;
}

/** Salta a una página: giro animado si está a una hoja de distancia; si está más lejos, salto directo (sin cruzar hojas intermedias). */
export function irAPagina(estado, pagina, total) {
  const p = Math.min(Math.max(1, pagina | 0), total);
  const v = vueltasParaPagina(p);
  const distancia = Math.abs(v - estado.objetivo);
  if (distancia === 0) return { vueltas: v, animado: false };
  if (distancia === 1) { v > estado.objetivo ? estado.avanzar() : estado.retroceder(); return { vueltas: v, animado: true }; }
  estado.irA(v);
  return { vueltas: v, animado: false };
}

/** Páginas visibles (1..total) con `vueltas` hojas giradas: la izquierda es la 2·(v−1) y la derecha la 2·v−1. */
export const paginasDe = (v, total) => ({ izquierda: v >= 2 ? 2 * (v - 1) : null, derecha: v >= 1 && 2 * v - 1 <= total ? 2 * v - 1 : null });

/**
 * Orden de lectura en el modo «una página»: 1 → (giro) 2 → 3 → (giro) 4 → 5 …  Las impares son la derecha de una doble página y las pares la izquierda:
 * de impar a par se gira la hoja; de par a impar solo se mueve la cámara dentro de la misma doble página. En vista doble siempre se gira la hoja.
 * Devuelve { accion: 'lado' | 'girar' | 'ninguna', lado, direccion } con el `lado` protagonista tras el paso.
 */
export function pasoLectura({ vueltas: v, lado, n, total, direccion, modo }) {
  const { izquierda, derecha } = paginasDe(v, total);
  if (direccion > 0) {
    if (modo === 'pagina' && v > 0 && lado === 'izq' && derecha) return { accion: 'lado', lado: 'der', direccion };
    return v <= n ? { accion: 'girar', lado: v === 0 ? 'der' : 'izq', direccion } : { accion: 'ninguna', lado, direccion };
  }
  if (modo === 'pagina' && v > 0 && lado === 'der' && izquierda) return { accion: 'lado', lado: 'izq', direccion };
  return v > 0 ? { accion: 'girar', lado: 'der', direccion } : { accion: 'ninguna', lado, direccion };
}
