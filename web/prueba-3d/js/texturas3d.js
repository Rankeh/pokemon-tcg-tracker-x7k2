// Productores de texturas de Three.js para la caché: imagen local optimizada (mini), marcador de «sin imagen» y etiqueta de «pendiente».
// Las imágenes salen de assets/cartas/ (las genera herramientas/texturas/PrepararTexturas.java); nunca se piden a servidores externos.
import * as THREE from 'three';
import { dibujarMarcador, dibujarEtiquetaPendiente } from './marcadores.js';
import { memoriaTexturaBytes } from './logica.js';
import { rutaProxy, rutasArte } from './proxies.js';

export const TAM_MINI = { w: 256, h: 358 };
export const TAM_ETIQUETA = { w: 128, h: 179 };

export function crearProductores({ manifiesto, rutaBase = 'assets/cartas/', anisotropia = 1, crearLienzo = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }) }) {
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
        const candidatas = [...rutasArte(carta.id), rutaProxy(carta.id)].filter(Boolean);
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
