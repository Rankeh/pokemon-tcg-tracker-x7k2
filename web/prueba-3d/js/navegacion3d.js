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
