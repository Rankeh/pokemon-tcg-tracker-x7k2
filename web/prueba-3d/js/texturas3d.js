// Productores de texturas de Three.js para la caché: imagen local optimizada (mini), marcador de «sin imagen» y etiqueta de «pendiente».
// Las imágenes salen de assets/cartas/ (las descarga herramientas/texturas/descargar_cartas.py). Solo los álbumes creados en la app (3.37), que no
// tienen copia local, usan la imagen pequeña de TCGdex (assets.tcgdex.net, con CORS); la app instalada la guarda para usarla sin conexión.
import * as THREE from 'three';
import { dibujarMarcador, dibujarEtiquetaPendiente } from './marcadores.js';
import { memoriaTexturaBytes } from './logica.js';
import { rutaProxy, rutasArte } from './proxies.js';
import { FUNCION_LIMITLESS, conCors, porIntermediario } from '../../js/supabase-url.js';

export const TAM_MINI = { w: 256, h: 358 };
/** 3.37 · imagen de TCGdex de la carta («low» ≈ 245×337 para el bolsillo, «high» para la ficha), o null. Solo de assets.tcgdex.net. */
/** 3.41 · la de urlRemota y, si es de TCGdex y puede fallar por su CORS duplicado, la misma por el intermediario. */
export const urlsRemotas = (carta, calidad = 'low') => {
  const u = urlRemota(carta, calidad);
  if (!u) return [];
  const original = typeof carta?.imagen === 'string' ? carta.imagen.replace(/\/high\.webp$/, '/' + calidad + '.webp') : null;
  return [...new Set([u, porIntermediario(original)].filter(Boolean))];
};
export const urlRemota = (carta, calidad = 'low') => {
  if (typeof carta?.imagen === 'string' && /^https:\/\/assets\.tcgdex\.net\/.+\/high\.webp$/.test(carta.imagen)) return conCors(carta.imagen.replace(/\/high\.webp$/, '/' + calidad + '.webp'));
  // 3.39 · sin imagen en TCGdex: la de limitlesstcg, a través del intermediario de Supabase (con CORS)
  if (typeof carta?.imagenAlternativa === 'string' && carta.imagenAlternativa.startsWith(FUNCION_LIMITLESS + '?ruta=')) return carta.imagenAlternativa;
  // 3.41 · cartas antiguas (pokemontcg.io): la versión normal para el bolsillo (la de alta resolución pesa ~850 KB) y la grande para la ficha
  if (typeof carta?.imagenAlternativa === 'string' && carta.imagenAlternativa.startsWith(FUNCION_LIMITLESS + '?pio=')) {
    return calidad === 'low' ? carta.imagenAlternativa.replace(/_hires\.png$/, '.png') : carta.imagenAlternativa;
  }
  return null;
};
export const TAM_ETIQUETA = { w: 128, h: 179 };

export function crearProductores({ manifiesto, rutaBase = 'assets/cartas/', anisotropia = 1, remotas = false, crearLienzo = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }) }) {
  const preparar = (t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropia; return t; };   // glTF: UV con origen arriba
  const desdeLienzo = (dibujar, tam, carta) => {
    const l = crearLienzo(tam.w, tam.h);
    dibujar(l, tam.w, tam.h, carta);
    return { textura: preparar(new THREE.CanvasTexture(l)), bytes: memoriaTexturaBytes(tam.w, tam.h) };
  };
  return {
    /** Imagen local de la carta. Rechaza si no hay copia local (el llamante cae al marcador). */
    mini: (carta) => async () => {
      const e = manifiesto && manifiesto.cartas && manifiesto.cartas[carta.id];
      if (!e) {                                                  // sin copia oficial: arte real descargado → carta proxy propia → (marcador)
        const candidatas = [...new Set([...rutasArte(carta.id), rutaProxy(carta.id), ...(remotas ? urlsRemotas(carta, 'low') : [])].filter(Boolean))];   // remotas: solo álbumes creados en la app
        for (const r of candidatas) {                            // 3.15: una sola carga por candidata (antes se cargaba dos veces) y vale sin proxy
          try { return { textura: preparar(await new THREE.TextureLoader().loadAsync(r)), bytes: memoriaTexturaBytes(TAM_MINI.w, TAM_MINI.h) }; } catch { /* siguiente */ }
        }
        throw new Error('sin imagen local para ' + carta.id);
      }
      const t = await new THREE.TextureLoader().loadAsync(rutaBase + e.mini);
      return { textura: preparar(t), bytes: memoriaTexturaBytes(e.anchoMini || TAM_MINI.w, e.altoMini || TAM_MINI.h) };
    },
    marcador: (carta) => async () => desdeLienzo(dibujarMarcador, TAM_MINI, carta),
    etiqueta: (carta) => async () => desdeLienzo(dibujarEtiquetaPendiente, TAM_ETIQUETA, carta),
  };
}

/** Carga el manifiesto de texturas locales. null si todavía no se ha ejecutado la herramienta (no es un error: todo usa marcadores). */
export async function cargarManifiesto(url = 'assets/cartas/manifiesto.json') {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) { console.warn('[cartas] no hay ' + url + ' (' + r.status + '): se muestran marcadores. Genera las imágenes con herramientas/texturas/descargar_cartas.py y súbelas al repositorio.'); return null; }
    const m = await r.json();
    return m && m.cartas ? m : null;
  } catch { return null; }
}
